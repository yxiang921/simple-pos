/**
 * Generate SIMULATED order history for demand-planning demos (BossBuddy).
 *
 *   npm run demo:history                      # fill days in the last 35 that have no history yet
 *   npm run demo:history -- --reset           # delete all simulated history, then regenerate
 *   npm run demo:history -- --days=56         # 8-week window
 *   npm run demo:history -- --remove          # delete simulated history AND demo running costs
 *   npm run demo:history -- --no-demo-defaults
 *
 * Writes (all flagged is_simulated = true): orders (COMPLETED, PAID) +
 * order_items + order_ingredients, daily_prep for prepared-ahead items, and
 * sold_out_events. A day is skipped if it already has simulated orders or
 * ≥ 20 real orders. Never touches stock, inventory_movements, real orders,
 * real daily_prep rows, or today.
 *
 * Demo defaults (on unless --no-demo-defaults) fill EMPTY fields with dummy
 * values — ingredient costs, is_prepared_ahead, aliases, opening hours, and
 * demo running costs for categories with none. See scripts/lib/demo.ts.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { dbSchema } from "../lib/db-schema";
import { fillEmptyFields, historyCoverage, removeSimulated, simulateDays, storeInfo } from "./lib/demo";
import { requireCurrentClient } from "./lib/client-check";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const DAYS = Math.min(120, Math.max(7, Number(args.get("days") ?? 35)));

async function main() {
  requireCurrentClient();
  console.log(`Schema: ${dbSchema()}`);
  if (args.has("remove")) {
    const r = await removeSimulated({ expenses: true });
    console.log(`✓ Removed ${r.orders} simulated orders, ${r.prep} prep rows, ${r.soldOuts} sold-out events, ${r.expenses} demo running costs`);
    return;
  }

  if (!args.has("no-demo-defaults")) {
    const f = await fillEmptyFields({ windowDays: DAYS });
    const parts = [
      [f.fields.filter((c) => c.field === "costPerUnit").length, "ingredient costs"],
      [f.fields.filter((c) => c.field === "isPreparedAhead").length, "prepared-ahead flags"],
      [f.fields.filter((c) => c.field === "aliases").length, "alias lists"],
      [f.fields.filter((c) => c.table === "store_settings").length, "store hours"],
      [f.insertedExpenseIds.length, "running costs"],
    ].filter(([n]) => (n as number) > 0);
    console.log(
      parts.length
        ? `• Dummy values filled where empty: ${parts.map(([n, l]) => `${n} ${l}`).join(", ")}`
        : "• Nothing empty to fill",
    );
  }

  if (args.has("reset")) {
    const r = await removeSimulated();
    console.log(`• Removed previous simulated history: ${r.orders} orders, ${r.prep} prep rows, ${r.soldOuts} sold-out events`);
  }

  const { tz } = await storeInfo();
  const cov = await historyCoverage(DAYS, tz);
  if (cov.needing.length === 0) {
    console.log(`✓ All ${DAYS} days (${cov.first} → ${cov.last}) already have history. Use --reset to regenerate.`);
    return;
  }
  console.log(`• Simulating ${cov.needing.length} day(s) without history between ${cov.first} and ${cov.last} (${tz})…`);
  const r = await simulateDays(cov.needing, { windowDays: DAYS });
  console.log(
    `✓ ${r.orders} orders, ${r.plates} plates sold, ${r.prepRows} prep rows, ${r.soldOuts} sold-out events ` +
      `(${r.missed} plates of unmet demand). Stock was not changed.`,
  );
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
