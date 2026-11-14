/**
 * Generate SIMULATED order history for demand-planning demos (BossBuddy).
 *
 *   npm run demo:history                      # 35 days, demo defaults, keeps existing simulated data
 *   npm run demo:history -- --reset           # delete previous simulated data first, then regenerate
 *   npm run demo:history -- --days=56         # 8 weeks
 *   npm run demo:history -- --remove          # only delete simulated data
 *   tsx scripts/simulate-history.ts --no-demo-defaults
 *
 * What it writes (all flagged is_simulated = true):
 *   orders (COMPLETED, PAID) + order_items + order_ingredients for each past day
 *   daily_prep for items marked is_prepared_ahead = true
 *   sold_out_events when simulated demand exceeded the plates prepared
 *
 * What it never touches: current ingredient stock and inventory_movements
 * (history is in the past), real orders, real daily_prep rows, today.
 *
 * --demo-defaults (on by default) fills ILLUSTRATIVE values from
 * scripts/demo-catalog.ts — ingredient costs, is_prepared_ahead, aliases and
 * opening hours — but only where the field is still empty.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Prisma } from "../lib/generated/prisma/client";
import { prisma } from "../lib/db";
import { dbSchema } from "../lib/db-schema";
import { costPerBaseUnit } from "../lib/units";
import { addDays, dateColumn, DEFAULT_TZ, localDate, zonedTimeToUtc } from "../lib/time";
import { DEMO_COSTS, DEMO_EXPENSES, DEMO_HOURS, DEMO_MENU } from "./demo-catalog";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

// ─── args ──────────────────────────────────────────────────────────────
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const DAYS = Math.min(120, Math.max(7, Number(args.get("days") ?? 35)));
const RESET = args.has("reset");
const REMOVE_ONLY = args.has("remove");
const DEMO_DEFAULTS = !args.has("no-demo-defaults");
const SEED = Number(args.get("seed") ?? 20261114);

// ─── deterministic PRNG ────────────────────────────────────────────────
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
/** Approx. normal(0,1) via sum of uniforms. */
const gauss = () => rand() + rand() + rand() + rand() + rand() + rand() - 3;
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

/** Weekday demand multipliers, Sun..Sat (JS getUTCDay order). */
const DOW = [1.3, 0.85, 0.9, 0.95, 1.0, 1.15, 1.4];
const NAMES = [
  "Aisyah", "Ahmad", "Nurul", "Hafiz", "Siti", "Farah", "Amir", "Jason", "Wei Ming", "Mei Ling",
  "Kumar", "Priya", "Arun", "Kavitha", "Daniel", "Sarah", "Lim", "Tan", "Raj", "Zainab", "Irfan", "Hui Min",
];

// ─── helpers ───────────────────────────────────────────────────────────
function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function hhmmOf(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Sample a minute-of-day from a meal-shaped curve inside opening hours. */
function sampleMinute(open: number, close: number, morning: boolean) {
  const peaks = morning
    ? [{ at: 8 * 60 + 30, sd: 50, w: 0.75 }, { at: 12 * 60 + 30, sd: 60, w: 0.25 }]
    : [
        { at: 8 * 60 + 30, sd: 50, w: 0.25 },
        { at: 12 * 60 + 45, sd: 55, w: 0.45 },
        { at: 19 * 60, sd: 60, w: 0.3 },
      ];
  // 15% of customers arrive at any time while open; the rest around meal peaks.
  if (rand() < 0.15) return Math.round(between(open, close - 5));
  for (let tries = 0; tries < 20; tries++) {
    let r = rand();
    let peak = peaks[0];
    for (const p of peaks) {
      if ((r -= p.w) <= 0) {
        peak = p;
        break;
      }
    }
    const m = Math.round(peak.at + gauss() * peak.sd);
    if (m >= open && m < close - 5) return m;
  }
  return Math.round(between(open, close - 5));
}

async function removeSimulated() {
  const orders = await prisma.order.findMany({ where: { isSimulated: true }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    await prisma.orderIngredient.deleteMany({ where: { orderId: { in: chunk } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: chunk } } });
    await prisma.inventoryMovement.deleteMany({ where: { orderId: { in: chunk } } }); // none expected
    await prisma.order.deleteMany({ where: { id: { in: chunk } } });
  }
  const prep = await prisma.dailyPrep.deleteMany({ where: { isSimulated: true } });
  const so = await prisma.soldOutEvent.deleteMany({ where: { isSimulated: true } });
  const ex = REMOVE_ONLY ? await prisma.expense.deleteMany({ where: { isSimulated: true } }) : { count: 0 };
  console.log(
    `• Removed simulated data: ${ids.length} orders, ${prep.count} prep rows, ${so.count} sold-out events` +
      (REMOVE_ONLY ? `, ${ex.count} demo running costs` : ""),
  );
}

async function applyDemoDefaults() {
  const changes: string[] = [];
  const ings = await prisma.ingredient.findMany({ where: { costPerUnit: null, sku: { in: Object.keys(DEMO_COSTS) } } });
  for (const i of ings) {
    const unit = i.unit === "G" ? "kg" : i.unit === "ML" ? "L" : "pcs";
    await prisma.ingredient.update({
      where: { id: i.id },
      data: { costPerUnit: costPerBaseUnit(DEMO_COSTS[i.sku!], unit, i.unit) },
    });
  }
  if (ings.length) changes.push(`${ings.length} ingredient costs`);

  const items = await prisma.menuItem.findMany({ where: { name: { in: Object.keys(DEMO_MENU) }, isArchived: false } });
  let flags = 0;
  let aliases = 0;
  for (const m of items) {
    const demo = DEMO_MENU[m.name];
    const data: Prisma.MenuItemUpdateInput = {};
    if (m.isPreparedAhead === null) {
      data.isPreparedAhead = demo.preparedAhead;
      flags++;
    }
    if (m.aliases.length === 0 && demo.aliases.length) {
      data.aliases = demo.aliases;
      aliases++;
    }
    if (Object.keys(data).length) await prisma.menuItem.update({ where: { id: m.id }, data });
  }
  if (flags) changes.push(`${flags} is_prepared_ahead flags`);
  if (aliases) changes.push(`${aliases} alias lists`);

  if ((await prisma.expense.count()) === 0) {
    const tz = (await prisma.storeSetting.findUnique({ where: { id: 1 } }))?.timezone || DEFAULT_TZ;
    // Start early enough to cover the whole simulated period.
    const start = `${addDays(localDate(new Date(), tz), -DAYS - 31).slice(0, 7)}-01`;
    await prisma.expense.createMany({
      data: DEMO_EXPENSES.map((e) => ({
        ...e,
        startDate: dateColumn(start),
        notes: "Demo value — replace with your real figure",
        isSimulated: true,
      })),
    });
    changes.push(`${DEMO_EXPENSES.length} running costs`);
  }

  const s = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  if (!s) {
    await prisma.storeSetting.create({ data: { id: 1, ...DEMO_HOURS } });
    changes.push("store hours");
  } else if (!s.openTime || !s.closeTime) {
    await prisma.storeSetting.update({
      where: { id: 1 },
      data: { openTime: s.openTime ?? DEMO_HOURS.openTime, closeTime: s.closeTime ?? DEMO_HOURS.closeTime },
    });
    changes.push("store hours");
  }
  console.log(
    changes.length
      ? `• Demo defaults filled (illustrative, only where empty): ${changes.join(", ")}`
      : "• Demo defaults: nothing empty to fill",
  );
}

async function main() {
  console.log(`Schema: ${dbSchema()}`);
  if (REMOVE_ONLY) return removeSimulated();

  // Demo defaults only fill empty fields, so they are safe to apply on every run.
  if (DEMO_DEFAULTS) await applyDemoDefaults();
  const existing = await prisma.order.count({ where: { isSimulated: true } });
  if (existing && !RESET) {
    console.log(`• ${existing} simulated orders already exist. Run with --reset to regenerate, or --remove to delete.`);
    return;
  }
  if (existing) await removeSimulated();

  const settings = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  const tz = settings?.timezone || DEFAULT_TZ;
  const open = minutesOf(settings?.openTime ?? DEMO_HOURS.openTime);
  const close = minutesOf(settings?.closeTime ?? DEMO_HOURS.closeTime);
  if (close - open < 120) throw new Error("Opening hours are shorter than 2 hours; set open/close time in Settings.");

  const items = await prisma.menuItem.findMany({
    where: { isArchived: false },
    include: {
      category: { select: { name: true } },
      recipe: { include: { ingredient: { select: { id: true, name: true, unit: true } } } },
    },
  });
  if (!items.length) throw new Error("No menu items. Run `npm run db:seed` first.");
  const aheadCount = items.filter((i) => i.isPreparedAhead).length;
  if (!aheadCount) console.log("! No items have is_prepared_ahead = true, so no daily_prep rows will be generated.");

  const today = localDate(new Date(), tz);
  const firstDay = addDays(today, -DAYS);
  const realPrep = await prisma.dailyPrep.findMany({
    where: { date: { gte: dateColumn(firstDay), lt: dateColumn(today) }, isSimulated: false },
    select: { date: true, menuItemId: true },
  });
  const realPrepKeys = new Set(realPrep.map((p) => `${p.date.toISOString().slice(0, 10)}|${p.menuItemId}`));

  // Each item's "true" daily demand level, and a staff habit of over/under-prepping.
  const profile = new Map(
    items.map((m) => {
      const demo = DEMO_MENU[m.name];
      const base = demo?.baseDemand ?? (m.isPreparedAhead ? 22 : 12);
      const morning = /breakfast|sarapan/i.test(m.category.name) || /nasi lemak|roti|kopi|teh|telur|egg/i.test(m.name);
      return [m.id, { base, morning, prepBias: between(0.95, 1.12) }];
    }),
  );

  const orders: Prisma.OrderCreateManyInput[] = [];
  const orderItems: Prisma.OrderItemCreateManyInput[] = [];
  const orderIngs: Prisma.OrderIngredientCreateManyInput[] = [];
  const preps: Prisma.DailyPrepCreateManyInput[] = [];
  const soldOuts: Prisma.SoldOutEventCreateManyInput[] = [];
  const byItem = new Map(items.map((m) => [m.id, m]));
  let missed = 0;

  for (let day = firstDay; day < today; day = addDays(day, 1)) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    // Business grows slightly over the period (up to ~8%).
    const daysAgo = Math.round((Date.parse(today) - Date.parse(day)) / 864e5);
    const trend = 1 - 0.08 * (daysAgo / DAYS);
    const units: { itemId: string; minute: number }[] = [];

    for (const m of items) {
      const p = profile.get(m.id)!;
      const expected = p.base * DOW[dow] * trend;
      const demand = Math.max(0, Math.round(expected * (1 + gauss() * 0.15)));
      const times = Array.from({ length: demand }, () => sampleMinute(open, close, p.morning)).sort((a, b) => a - b);

      let sellable = times;
      if (m.isPreparedAhead) {
        // Staff guess from habit: roughly the weekday norm, with their own bias and noise.
        const plates = Math.max(0, Math.round(p.base * DOW[dow] * p.prepBias * (1 + gauss() * 0.1)));
        const key = `${day}|${m.id}`;
        if (!realPrepKeys.has(key)) {
          preps.push({ id: randomUUID(), date: dateColumn(day), menuItemId: m.id, platesPrepared: plates, isSimulated: true });
        }
        // Every plate sold → the item sold out (staff switch it off); extra demand is missed.
        if (times.length >= plates && plates > 0) {
          sellable = times.slice(0, plates);
          missed += times.length - plates;
          const lastMinute = sellable[plates - 1];
          soldOuts.push({
            id: randomUUID(),
            menuItemId: m.id,
            soldOutAt: zonedTimeToUtc(day, hhmmOf(Math.min(close - 1, lastMinute + Math.round(between(2, 12)))), tz),
            isSimulated: true,
          });
        }
      }
      for (const minute of sellable) units.push({ itemId: m.id, minute });
    }

    // Pack sold units into orders of 1–4 units placed close together.
    units.sort((a, b) => a.minute - b.minute);
    for (let i = 0; i < units.length; ) {
      const size = pick([1, 1, 2, 2, 2, 3, 3, 4]);
      const group = units.slice(i, i + size);
      i += size;
      const minute = group[0].minute;
      const second = Math.floor(rand() * 60);
      const createdAt = new Date(zonedTimeToUtc(day, hhmmOf(minute), tz).getTime() + second * 1000);
      const orderId = randomUUID();

      const qty = new Map<string, number>();
      for (const u of group) qty.set(u.itemId, (qty.get(u.itemId) ?? 0) + 1);
      let total: Decimal = new D(0);
      const usage = new Map<string, { qty: Decimal; name: string; unit: "PCS" | "G" | "ML" }>();
      for (const [itemId, q] of qty) {
        const m = byItem.get(itemId)!;
        const subtotal = m.price.mul(q);
        total = total.add(subtotal);
        orderItems.push({
          id: randomUUID(),
          orderId,
          menuItemId: itemId,
          menuItemNameSnapshot: m.name,
          quantity: q,
          unitPriceSnapshot: m.price,
          subtotal,
        });
        for (const r of m.recipe) {
          const u = usage.get(r.ingredientId);
          const need = r.quantityRequired.mul(q);
          if (u) u.qty = u.qty.add(need);
          else usage.set(r.ingredientId, { qty: need, name: r.ingredient.name, unit: r.ingredient.unit });
        }
      }
      for (const [ingredientId, u] of usage) {
        orderIngs.push({
          id: randomUUID(),
          orderId,
          ingredientId,
          ingredientNameSnapshot: u.name,
          unitSnapshot: u.unit,
          quantityDeducted: u.qty,
        });
      }
      orders.push({
        id: orderId,
        customerName: pick(NAMES),
        tableNumber: rand() < 0.7 ? String(1 + Math.floor(rand() * 20)) : null,
        status: "COMPLETED",
        paymentStatus: "PAID",
        totalAmount: total,
        idempotencyKey: `sim-${orderId}`,
        requestHash: "simulated",
        isSimulated: true,
        createdAt,
        updatedAt: new Date(createdAt.getTime() + Math.round(between(8, 25)) * 60_000),
      });
    }
  }

  // Insert in chronological order so order_number follows time within the simulated block.
  orders.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
  const chunk = async <T>(rows: T[], fn: (c: T[]) => Promise<unknown>, size = 1000) => {
    for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
  };
  console.log(`• Writing ${orders.length} orders for ${firstDay} → ${addDays(today, -1)} (${tz})…`);
  await chunk(orders, (c) => prisma.order.createMany({ data: c }));
  await chunk(orderItems, (c) => prisma.orderItem.createMany({ data: c }));
  await chunk(orderIngs, (c) => prisma.orderIngredient.createMany({ data: c }));
  await chunk(preps, (c) => prisma.dailyPrep.createMany({ data: c, skipDuplicates: true }));
  await chunk(soldOuts, (c) => prisma.soldOutEvent.createMany({ data: c }));

  const plates = orderItems.reduce((n, i) => n + (i.quantity as number), 0);
  console.log(
    `✓ Simulated ${DAYS} days: ${orders.length} orders, ${plates} plates sold, ${preps.length} prep rows, ` +
      `${soldOuts.length} sold-out events (${missed} plates of unmet demand). Stock was not changed.`,
  );
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
