import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth/session";
import { ALL_BRANCHES, BRANCH_COOKIE } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * GET /admin/switch?to=<branchId|all>&next=/admin/… — switch branch with a plain
 * link (e.g. from the HQ overview or an order in "All branches") and open `next`.
 */
export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.redirect(new URL("/admin/login", request.url));
  const sp = request.nextUrl.searchParams;
  const to = sp.get("to") ?? "";
  const nextParam = sp.get("next") ?? "/admin/dashboard";
  const next = nextParam.startsWith("/admin/") && !nextParam.startsWith("//") ? nextParam : "/admin/dashboard";

  let value: string | null = null;
  if (to === ALL_BRANCHES) value = ALL_BRANCHES;
  else if (to.length <= 64) {
    const b = await prisma.branch.findFirst({ where: { id: to, merchantId: admin.merchantId }, select: { id: true } });
    value = b?.id ?? null;
  }
  const res = NextResponse.redirect(new URL(next, request.url));
  if (value) {
    res.cookies.set(BRANCH_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

