import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { BRANCH_COOKIE, merchantTimezone } from "@/lib/tenant";
import { dailyRows, resolvePeriod } from "@/lib/services/sales";
import { localDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/** GET /admin/sales-export?from=YYYY-MM-DD&to=YYYY-MM-DD — daily sales CSV of the selected branch (or all branches). */
export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.redirect(new URL("/admin/login", request.url));
  const tz = await merchantTimezone(admin.merchantId);
  const sp = request.nextUrl.searchParams;
  const period = resolvePeriod("custom", localDate(new Date(), tz), { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const wanted = (await cookies()).get(BRANCH_COOKIE)?.value;
  const branch = wanted
    ? await prisma.branch.findFirst({ where: { id: wanted, merchantId: admin.merchantId }, select: { id: true, slug: true } })
    : null;
  const rows = await dailyRows({ merchantId: admin.merchantId, branchId: branch?.id ?? null }, period.current, tz);
  const csv = ["date,orders,sales_rm,average_order_rm,cancelled"]
    .concat(rows.map((r) => [r.date, r.orders, r.revenue.toFixed(2), (r.orders ? r.revenue / r.orders : 0).toFixed(2), r.cancelled].join(",")))
    .join("\n");
  const name = `sales-${branch?.slug ?? "all-branches"}-${period.current.from}-to-${period.current.to}.csv`;
  return new Response(csv + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
