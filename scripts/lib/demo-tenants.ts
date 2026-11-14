/**
 * Demo merchants and branches: a headquarters with two branches (shared menu,
 * separate stock and orders) and a second, single-outlet merchant, each with
 * order data. Used by prisma/seed.ts and scripts/demo-branches.ts. Idempotent:
 * existing branches, stock and orders are never changed.
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "../../lib/generated/prisma/client";
import { prisma } from "../../lib/db";
import { hashPassword } from "../../lib/auth/password";
import { cancelOrder, createOrder, setPaymentStatus, updateOrderStatus } from "../../lib/services/orders";
import { installSampleCatalog, SAMPLE_INGREDIENTS } from "../../lib/sample-catalog";
import { localDate } from "../../lib/time";
import { DEMO_EXPENSES, DEMO_HOURS } from "../demo-catalog";
import { DUMMY_NOTE } from "./demo";

const D = (v: string | number) => new Prisma.Decimal(v);

/** Branches added to the demo merchant. `scale` = size vs. headquarters (orders, opening stock). */
export const DEMO_BRANCHES = [
  { slug: "mount-austin", name: "Mount Austin", address: "Jalan Mutiara Emas 10, Taman Mount Austin, 81100 Johor Bahru", scale: 0.8 },
  { slug: "skudai", name: "Skudai", address: "Jalan Kebudayaan 3, Taman Universiti, 81300 Skudai", scale: 0.6 },
];

/** A second, independent merchant with a single outlet (shows tenant separation). */
export const DEMO_SECOND_MERCHANT = {
  slug: "teh-tarik-place",
  name: "Teh Tarik Place",
  branchName: "Main outlet",
  address: "Jalan Wong Ah Fook 22, 80000 Johor Bahru",
  ownerEmail: "owner@teh-tarik-place.demo",
  scale: 0.45,
};

export function branchScale(b: { slug: string; isHeadquarters: boolean }) {
  if (b.isHeadquarters) return 1;
  return DEMO_BRANCHES.find((x) => x.slug === b.slug)?.scale ?? 0.7;
}

/**
 * Create the demo branches that are missing. Each new branch gets a stock row for
 * every ingredient: the sample opening stock (or headquarters' current stock)
 * × the branch scale, with an INITIAL movement; thresholds copied from HQ.
 */
export async function ensureDemoBranches(merchantId: string) {
  const created: string[] = [];
  const hq = await prisma.branch.findFirst({ where: { merchantId, isHeadquarters: true }, select: { id: true } });
  const ingredients = await prisma.ingredient.findMany({
    where: { merchantId },
    select: { id: true, sku: true, stocks: { where: { branchId: hq?.id ?? "-" }, select: { currentStock: true, lowStockThreshold: true } } },
  });
  const count = await prisma.branch.count({ where: { merchantId } });
  for (const [i, def] of DEMO_BRANCHES.entries()) {
    if (await prisma.branch.findUnique({ where: { merchantId_slug: { merchantId, slug: def.slug } }, select: { id: true } })) continue;
    await prisma.$transaction(async (tx) => {
      const b = await tx.branch.create({
        data: { merchantId, slug: def.slug, name: def.name, address: def.address, sortOrder: count + i },
      });
      for (const ing of ingredients) {
        const sample = SAMPLE_INGREDIENTS.find((s) => s.sku === ing.sku);
        const base = sample ? D(sample.stock) : (ing.stocks[0]?.currentStock ?? D(0));
        const stock = base.mul(def.scale).toDecimalPlaces(0);
        const low = sample ? D(sample.low) : (ing.stocks[0]?.lowStockThreshold ?? D(0));
        await tx.ingredientStock.create({ data: { branchId: b.id, ingredientId: ing.id, currentStock: stock, lowStockThreshold: low } });
        if (stock.gt(0)) {
          await tx.inventoryMovement.create({
            data: { branchId: b.id, ingredientId: ing.id, movementType: "INITIAL", quantityChange: stock, balanceAfter: stock, reason: "Opening stock (demo branch)", createdBy: "demo" },
          });
        }
      }
    });
    created.push(def.name);
  }
  return created;
}

const GUESTS = ["Aisyah", "Jason", "Priya", "Mei Ling", "Hafiz", "Nurul", "Kumar", "Daniel", "Siti", "Wei Ming", "Farah", "Arun"];

/**
 * Place a few live orders at a branch through the real order service (stock is
 * deducted, movements written), then age them so the floor view shows a mix of
 * fresh (yellow) and waiting (red) tables. Skipped if the branch already has ≥ 3
 * open real orders.
 */
export async function placeOpenOrders(branchId: string, n = 5, seed = 1) {
  const open = await prisma.order.count({ where: { branchId, isSimulated: false, status: { in: ["PENDING", "PREPARING", "READY"] } } });
  if (open >= 3) return 0;
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId }, select: { merchantId: true } });
  const items = await prisma.menuItem.findMany({
    where: { merchantId: branch.merchantId, isArchived: false, isAvailable: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (!items.length) return 0;
  const tables = (await prisma.floorObject.findMany({ where: { merchantId: branch.merchantId, kind: "TABLE" }, select: { tableNumber: true } }))
    .map((t) => t.tableNumber!)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const statuses = ["PENDING", "PREPARING", "READY", "PENDING", "PREPARING", "PENDING"] as const;
  const ages = [2, 6, 11, 17, 26, 34]; // minutes ago
  let placed = 0;
  for (let k = 0; k < n; k++) {
    const pick = (j: number) => items[(seed * 7 + k * 5 + j * 3) % items.length];
    const lines = [pick(0), pick(1), ...(k % 2 ? [pick(2)] : [])];
    const qty = new Map<string, number>();
    for (const l of lines) qty.set(l.id, (qty.get(l.id) ?? 0) + 1);
    try {
      const o = await createOrder(branchId, {
        customerName: GUESTS[(seed * 3 + k) % GUESTS.length],
        tableNumber: tables.length && k % 4 !== 3 ? tables[(seed * 5 + k * 3) % tables.length] : null,
        idempotencyKey: randomUUID(),
        items: [...qty].map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
      });
      const status = statuses[k % statuses.length];
      if (status !== "PENDING") await updateOrderStatus(o.id, status);
      const at = new Date(Date.now() - ages[k % ages.length] * 60_000);
      await prisma.order.update({ where: { id: o.id }, data: { createdAt: at } });
      await prisma.inventoryMovement.updateMany({ where: { orderId: o.id }, data: { createdAt: at } });
      placed++;
    } catch {
      /* out of stock for this combination — skip */
    }
  }
  return placed;
}

/** The classic seed orders (one of each status) at a branch, through the real service. */
export async function placeSampleOrders(branchId: string) {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId }, select: { merchantId: true } });
  const items = new Map(
    (await prisma.menuItem.findMany({ where: { merchantId: branch.merchantId }, select: { id: true, name: true } })).map((m) => [m.name, m.id]),
  );
  const place = (customerName: string, tableNumber: string | undefined, lines: [string, number][]) =>
    createOrder(branchId, {
      customerName,
      tableNumber,
      idempotencyKey: randomUUID(),
      items: lines.filter(([n]) => items.has(n)).map(([n, q]) => ({ menuItemId: items.get(n)!, quantity: q })),
    });
  const o1 = await place("Aisyah", "4", [["Nasi Lemak Ayam Goreng", 2], ["Teh Tarik", 2]]);
  const o2 = await place("Jason", "7", [["Chicken Burger", 2], ["Limau Ais", 1]]);
  const o3 = await place("Priya", undefined, [["Roti Canai with Dhal", 3], ["Kopi O", 1]]);
  const o4 = await place("Mei Ling", "2", [["Char Kway Teow", 1], ["Cendol", 1]]);
  await place("Hafiz", "9", [["Mee Goreng Mamak", 1], ["Milo Ais", 1]]);
  await updateOrderStatus(o1.id, "COMPLETED");
  await setPaymentStatus(o1.id, true);
  await updateOrderStatus(o2.id, "PREPARING");
  await updateOrderStatus(o3.id, "READY");
  await cancelOrder(o4.id, "Customer changed mind", "seed");
}

/** Second merchant (single outlet) with the sample catalog, demo running costs and an owner account. */
export async function ensureSecondMerchant(ownerPassword: string) {
  const def = DEMO_SECOND_MERCHANT;
  const existing = await prisma.merchant.findUnique({ where: { slug: def.slug }, select: { id: true } });
  if (existing) return { merchantId: existing.id, created: false };
  const merchant = await prisma.merchant.create({ data: { slug: def.slug, name: def.name } });
  await prisma.storeSetting.create({
    data: { merchantId: merchant.id, storeName: def.name, openTime: "08:00", closeTime: "22:00", timezone: "Asia/Kuala_Lumpur" },
  });
  const branch = await prisma.branch.create({
    data: { merchantId: merchant.id, slug: "hq", name: def.branchName, address: def.address, isHeadquarters: true },
  });
  if (!(await prisma.adminUser.findUnique({ where: { email: def.ownerEmail } }))) {
    await prisma.adminUser.create({
      data: { merchantId: merchant.id, email: def.ownerEmail, name: "Demo owner", passwordHash: await hashPassword(ownerPassword) },
    });
  }
  await installSampleCatalog(merchant.id, { stockScale: { [branch.id]: def.scale + 0.25 }, actor: "demo" });
  // A smaller shop: half the staff lines.
  const tz = "Asia/Kuala_Lumpur";
  const start = `${localDate(new Date(), tz).slice(0, 7)}-01`;
  const small = DEMO_EXPENSES.filter((e) => !/Kitchen helper|Cashier/.test(e.name)).map((e) =>
    e.category === "RENT" ? { ...e, amount: "2800.00" } : e,
  );
  const startDate = new Date(`${Number(start.slice(0, 4)) - 1}${start.slice(4)}T00:00:00Z`);
  await prisma.expense.createMany({
    data: small.map((e) => ({ ...e, merchantId: merchant.id, startDate, notes: DUMMY_NOTE, isSimulated: true })),
  });
  return { merchantId: merchant.id, created: true };
}

export { DEMO_HOURS };
