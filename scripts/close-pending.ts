/**
 * Close every order that is still PENDING.
 *
 *   npm run orders:close-pending -- --dry-run     # list them, change nothing
 *   npm run orders:close-pending                  # mark them COMPLETED (stock stays deducted)
 *   npm run orders:close-pending -- --cancel      # CANCEL them instead (ingredients go back to stock)
 *   npm run orders:close-pending -- --merchant=kopi-co   # only one merchant (default: all merchants)
 *
 * Uses the same order services as the app, so stock and inventory movements stay
 * consistent and open pages update live.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { dbSchema } from "../lib/db-schema";
import { cancelOrder, updateOrderStatus } from "../lib/services/orders";
import { requireCurrentClient } from "./lib/client-check";

const argv = process.argv.slice(2).map((a) => a.replace(/^--/, ""));
const args = new Set(argv);
const DRY = args.has("dry-run");
const CANCEL = args.has("cancel");
const MERCHANT = argv.find((a) => a.startsWith("merchant="))?.slice(9);

async function main() {
  requireCurrentClient();
  const pending = await prisma.order.findMany({
    where: { status: "PENDING", ...(MERCHANT ? { branch: { merchant: { slug: MERCHANT } } } : {}) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      tableNumber: true,
      createdAt: true,
      isSimulated: true,
      branch: { select: { name: true, merchant: { select: { slug: true } } } },
    },
  });
  console.log(`Schema: ${dbSchema()} · ${pending.length} pending order(s)`);
  for (const o of pending) {
    console.log(
      `  #${String(o.orderNumber).padStart(4, "0")}  ${o.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC  ${o.branch.merchant.slug}/${o.branch.name}  ${o.customerName}` +
        `${o.tableNumber ? ` · table ${o.tableNumber}` : ""}${o.isSimulated ? " · simulated" : ""}`,
    );
  }
  if (!pending.length || DRY) {
    if (DRY && pending.length) console.log(`Dry run — nothing changed. Run without --dry-run to mark them ${CANCEL ? "CANCELLED" : "COMPLETED"}.`);
    return;
  }

  let done = 0;
  const failed: string[] = [];
  for (const o of pending) {
    try {
      if (CANCEL) await cancelOrder(o.id, "Closed by admin (bulk)", "close-pending script");
      else await updateOrderStatus(o.id, "COMPLETED");
      done++;
    } catch (e) {
      failed.push(`#${o.orderNumber}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`✓ ${done} order(s) marked ${CANCEL ? "CANCELLED (ingredients returned to stock)" : "COMPLETED"}.`);
  if (failed.length) console.log(`! ${failed.length} skipped (changed meanwhile):\n  ${failed.join("\n  ")}`);
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
