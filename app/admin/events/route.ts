import { getCurrentAdmin } from "@/lib/auth/session";
import { changeHub } from "@/lib/realtime";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";

/** Live change stream for the back office (Server-Sent Events). */
export async function GET(request: Request) {
  if (!(await getCurrentAdmin())) return new Response("Unauthorized", { status: 401 });
  return sseResponse(request, (send) => {
    send("status", { status: changeHub.status });
    return changeHub.subscribe((m) => {
      if (m.type === "status") send("status", { status: m.status });
      else send("change", { table: m.event.table, op: m.event.op });
    });
  });
}
