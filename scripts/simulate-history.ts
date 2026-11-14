/**
 * Generate SIMULATED order history for demand-planning demos (BossBuddy).
 *
 *   npm run demo:history                      # every branch of the (first) merchant: fill days in the last 365 without history
 *   npm run demo:history -- --merchant=kopi-co --branch=skudai
 *   npm run demo:history -- --reset           # delete simulated history (of the chosen branches), then regenerate
 *   npm run demo:history -- --days=90         # shorter window (default 365 days)
 *   npm run demo:history -- --scale=0.6       # size of a branch vs. the staff-based shop size (default: HQ 1, demo branches 0.8 / 0.6, others 0.7)
 *   npm run demo:history -- --remove          # delete simulated history AND the merchant's demo running costs
 *   npm run demo:history -- --no-demo-defaults
 *
 * Writes (all flagged is_simulated = true): orders (COMPLETED, PAID) +
 * order_items + order_ingredients, daily_prep for prepared-ahead items, and
 * sold_out_events — per branch. A day is skipped if it already has simulated
 * orders or ≥ 20 real orders at that branch. Never touches stock,
 * inventory_movements, real orders, real daily_prep rows, or today.
 *
 * Demo defaults (on unless --no-demo-defaults) fill EMPTY merchant fields with
 * dummy values — ingredient costs, is_prepared_ahead, aliases, opening hours,
 * and demo running costs for categories with none. See scripts/lib/demo.ts.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { dbSchema } from "../lib/db-schema";
import { fillEmptyFields, historyCoverage, removeSimulated, resolveTarget, simulateDays, storeInfo } from "./lib/demo";
import { requireCurrentClient } from "./lib/client-check";
import { branchScale } from "./lib/demo-tenants";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const DAYS = Math.min(730, Math.max(7, Number(args.get("days") ?? 365)));
const SCALE = args.has("scale") ? Math.min(3, Math.max(0.1, Number(args.get("scale")))) : null;

async function main() {
  requireCurrentClient();
  console.log(`Schema: ${dbSchema()}`);
  const { merchant, branches, multipleMerchants, merchants } = await resolveTarget({ merchant: args.get("merchant"), branch: args.get("branch") });
  console.log(`Merchant: ${merchant.name} (${merchant.slug}) · branches: ${branches.map((b) => b.slug).join(", ")}`);
  if (multipleMerchants) console.log(`  (other merchants: ${merchants.slice(1).map((m) => m.slug).join(", ")} — pick one with --merchant=<slug>)`);
  const onlyBranch = args.has("branch") ? branches[0].id : undefined;

  if (args.has("remove")) {
    const r = await removeSimulated({ merchantId: merchant.id, branchId: onlyBranch, expenses: !onlyBranch });
    console.log(`✓ Removed ${r.orders} simulated orders, ${r.prep} prep rows, ${r.soldOuts} sold-out events, ${r.expenses} demo running costs`);
    return;
  }

  if (!args.has("no-demo-defaults")) {
    const f = await fillEmptyFields({ windowDays: DAYS, merchantId: merchant.id });
    const parts = [
      [f.fields.filter((c) => c.field === "costPerUnit").length, "ingredient costs"],
      [f.fields.filter((c) => c.field === "isPreparedAhead").length, "prepared-ahead flags"],
      [f.fields.filter((c) => c.field === "aliases").length, "alias lists"],
      [f.fields.filter((c) => c.table === "store_settings").length, "store hours"],
      [f.insertedExpenseIds.length, "running costs"],
    ].filter(([n]) => (n as number) > 0);
    console.log(parts.length ? `• Dummy values filled where empty: ${parts.map(([n, l]) => `${n} ${l}`).join(", ")}` : "• Nothing empty to fill");
  }

  if (args.has("reset")) {
    const r = await removeSimulated({ merchantId: merchant.id, branchId: onlyBranch });
    console.log(`• Removed previous simulated history: ${r.orders} orders, ${r.prep} prep rows, ${r.soldOuts} sold-out events`);
  }

  const { tz } = await storeInfo(merchant.id);
  for (const b of branches) {
    const cov = await historyCoverage(DAYS, tz, b.id);
    if (cov.needing.length === 0) {
      console.log(`✓ ${b.name}: all ${DAYS} days (${cov.first} → ${cov.last}) already have history. Use --reset to regenerate.`);
      continue;
    }
    const scale = SCALE ?? branchScale(b);
    console.log(`• ${b.name}: simulating ${cov.needing.length} day(s) between ${cov.first} and ${cov.last} (${tz}, size ×${scale})…`);
    const r = await simulateDays(cov.needing, { branchId: b.id, windowDays: DAYS, scale });
    console.log(
      `  ✓ ${r.orders} orders, ${r.plates} plates sold, ${r.prepRows} prep rows, ${r.soldOuts} sold-out events ` +
        `(${r.missed} plates of unmet demand). Stock was not changed.`,
    );
    console.log(`    Sized for ${r.staff} staff × RM ${p0(r.targetRevenuePerDay / r.staff / scale)}/worker/day (DOSM) × ${scale} = ~RM ${p0(r.targetRevenuePerDay)}/day.`);
  }
}

const p0 = (n: number) => Math.round(n).toString();

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
