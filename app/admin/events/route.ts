import { getCurrentAdmin } from "@/lib/auth/session";
import { changeHub } from "@/lib/realtime";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
// Streams end after ~50 s on Vercel (see lib/sse.ts); the browser reconnects.
export const maxDuration = 60;

/** Live change stream for the back office (Server-Sent Events): only the signed-in merchant's changes. */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  return sseResponse(request, (send) => {
    send("status", { status: changeHub.status });
    return changeHub.subscribe((m) => {
      if (m.type === "status") send("status", { status: m.status });
      else if (m.event.merchantId === null || m.event.merchantId === admin.merchantId) {
        send("change", { table: m.event.table, op: m.event.op, branch: m.event.branchId });
      }
    });
  });
}
