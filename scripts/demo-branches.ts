/**
 * Demo headquarters + branches with order data, for showing the multi-branch
 * (SaaS) features. Idempotent — run it again any time; nothing real is changed.
 *
 *   npm run demo:branches                          # first merchant
 *   npm run demo:branches -- --merchant=kopi-co
 *   npm run demo:branches -- --days=60             # history window for branches without history (default 90)
 *   npm run demo:branches -- --no-second-merchant  # skip the separate single-outlet demo merchant
 *
 * For the chosen merchant:
 *   1. fills empty catalog fields / running costs with demo values (as demo:history does)
 *   2. adds the demo branches "Mount Austin" and "Skudai" if missing — shared menu,
 *      their own opening stock
 *   3. simulated order history (is_simulated) for every branch on days without history
 *   4. today so far (simulated) when a branch has no generated orders today and few real ones
 *   5. a few live open orders per branch through the real order service, so the
 *      orders board and floor view have something to show (stock is deducted)
 * Plus a second merchant "Teh Tarik Place" (single outlet, owner
 * owner@teh-tarik-place.demo with the SEED_ADMIN_PASSWORD from .env).
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { dbSchema } from "../lib/db-schema";
import { dayRangeUtc, localDate } from "../lib/time";
import { fillEmptyFields, historyCoverage, resolveTarget, simulateDays, storeInfo } from "./lib/demo";
import { branchScale, DEMO_SECOND_MERCHANT, ensureDemoBranches, ensureSecondMerchant, placeOpenOrders } from "./lib/demo-tenants";
import { requireCurrentClient } from "./lib/client-check";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const DAYS = Math.min(730, Math.max(7, Number(args.get("days") ?? 90)));

async function fillBranches(merchantId: string, label: string) {
  const { tz } = await storeInfo(merchantId);
  const branches = await prisma.branch.findMany({
    where: { merchantId, isActive: true },
    orderBy: [{ isHeadquarters: "desc" }, { sortOrder: "asc" }],
    select: { id: true, slug: true, name: true, isHeadquarters: true },
  });
  const today = localDate(new Date(), tz);
  for (const [i, b] of branches.entries()) {
    const scale = label === DEMO_SECOND_MERCHANT.slug ? 1 : branchScale(b);
    const cov = await historyCoverage(DAYS, tz, b.id);
    if (cov.needing.length) {
      const r = await simulateDays(cov.needing, { branchId: b.id, windowDays: DAYS, scale });
      console.log(`  • ${b.name}: ${r.orders.toLocaleString()} history orders over ${cov.needing.length} day(s) (size ×${scale})`);
    } else {
      console.log(`  • ${b.name}: history already present (${cov.withData}/${DAYS} days)`);
    }
    const { start } = dayRangeUtc(today, tz);
    const [simToday, realToday] = await Promise.all([
      prisma.order.count({ where: { branchId: b.id, createdAt: { gte: start }, isSimulated: true } }),
      prisma.order.count({ where: { branchId: b.id, createdAt: { gte: start }, isSimulated: false, status: { not: "CANCELLED" } } }),
    ]);
    if (simToday === 0 && realToday < 20) {
      const r = await simulateDays([today], { branchId: b.id, windowDays: DAYS, scale, until: new Date(Date.now() - 40 * 60_000) });
      console.log(`    today so far: ${r.orders} orders`);
    }
    const open = await placeOpenOrders(b.id, 5, i + 1);
    if (open) console.log(`    live open orders: ${open}`);
  }
}

async function main() {
  requireCurrentClient();
  console.log(`Schema: ${dbSchema()}`);
  const { merchant } = await resolveTarget({ merchant: args.get("merchant") });
  console.log(`Merchant: ${merchant.name} (${merchant.slug})`);
  if (!(await prisma.menuItem.count({ where: { merchantId: merchant.id } }))) {
    throw new Error("This merchant has no menu yet. Run `npm run db:seed` (or add a menu) first.");
  }

  await fillEmptyFields({ windowDays: Math.max(DAYS, 365), merchantId: merchant.id });
  const created = await ensureDemoBranches(merchant.id);
  console.log(created.length ? `✓ Branches added: ${created.join(", ")}` : "• Demo branches already exist");
  await fillBranches(merchant.id, merchant.slug);

  if (!args.has("no-second-merchant") && merchant.slug !== DEMO_SECOND_MERCHANT.slug) {
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password || password.length < 10) {
      console.log("• Skipped the second demo merchant: set SEED_ADMIN_PASSWORD (10+ characters) in .env for its owner account.");
    } else {
      const m = await ensureSecondMerchant(password);
      console.log(
        m.created
          ? `✓ Second merchant: ${DEMO_SECOND_MERCHANT.name} (/s/${DEMO_SECOND_MERCHANT.slug}/hq) · owner ${DEMO_SECOND_MERCHANT.ownerEmail} (password = SEED_ADMIN_PASSWORD)`
          : `• Second merchant ${DEMO_SECOND_MERCHANT.name} already exists`,
      );
      await fillBranches(m.merchantId, DEMO_SECOND_MERCHANT.slug);
    }
  }
  console.log("✓ Done. Sign in and use the branch selector at the top — All branches is the headquarters overview.");
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
