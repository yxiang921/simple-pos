import { prisma } from "@/lib/db";
import { changeHub } from "@/lib/realtime";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";

/** Tables whose changes affect what guests see on the menu (availability, prices, ordering paused). */
const MENU_TABLES = new Set(["menu_items", "categories", "ingredients", "menu_item_ingredients", "store_settings"]);

/**
 * Public live stream for guest pages. Sends only "something on the menu
 * changed" and, with ?order=<id>, status changes of that one order — never
 * other orders or any order data.
 */
export async function GET(request: Request) {
  const ip = await clientIp();
  if (!rateLimit(`sse:${ip}`, 30, 60_000).ok) return new Response("Too many requests", { status: 429 });

  const orderId = new URL(request.url).searchParams.get("order");
  if (orderId && (orderId.length > 64 || !(await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } })))) {
    return new Response("Not found", { status: 404 });
  }

  return sseResponse(request, (send) => {
    send("status", { status: changeHub.status });
    return changeHub.subscribe((m) => {
      if (m.type === "status") send("status", { status: m.status });
      else if (MENU_TABLES.has(m.event.table)) send("change", { scope: "menu" });
      else if (orderId && m.event.table === "orders" && m.event.id === orderId) send("change", { scope: "order" });
    });
  });
}
