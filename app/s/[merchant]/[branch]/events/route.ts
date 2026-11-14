import { prisma } from "@/lib/db";
import { changeHub } from "@/lib/realtime";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sseResponse } from "@/lib/sse";
import { getGuestShop } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Merchant-wide tables whose changes affect what guests see (prices, recipes, ordering paused). */
const MENU_TABLES = new Set(["menu_items", "categories", "ingredients", "menu_item_ingredients", "store_settings"]);
/** Branch tables that change availability (stock, item on/off at this branch). */
const BRANCH_TABLES = new Set(["ingredient_stocks", "branch_menu_items"]);

/**
 * Public live stream for one branch's guest pages. Sends only "something on the
 * menu changed" and, with ?order=<id>, status changes of that one order — never
 * other orders or any order data.
 */
export async function GET(request: Request, { params }: RouteContext<"/s/[merchant]/[branch]/events">) {
  const ip = await clientIp();
  if (!rateLimit(`sse:${ip}`, 30, 60_000).ok) return new Response("Too many requests", { status: 429 });

  const { merchant, branch } = await params;
  const shop = await getGuestShop(merchant, branch);
  if (!shop) return new Response("Not found", { status: 404 });
  const merchantId = shop.merchant.id;
  const branchId = shop.branch.id;

  const orderId = new URL(request.url).searchParams.get("order");
  if (orderId && (orderId.length > 64 || !(await prisma.order.findFirst({ where: { id: orderId, branchId }, select: { id: true } })))) {
    return new Response("Not found", { status: 404 });
  }

  return sseResponse(request, (send) => {
    send("status", { status: changeHub.status });
    return changeHub.subscribe((m) => {
      if (m.type === "status") return send("status", { status: m.status });
      const e = m.event;
      if (e.merchantId !== null && e.merchantId !== merchantId) return;
      if (MENU_TABLES.has(e.table)) send("change", { scope: "menu" });
      else if (BRANCH_TABLES.has(e.table) && e.branchId === branchId) send("change", { scope: "menu" });
      else if (orderId && e.table === "orders" && e.id === orderId) send("change", { scope: "order" });
    });
  });
}
