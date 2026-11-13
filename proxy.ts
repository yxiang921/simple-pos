import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: redirect to login when no session cookie is present.
// Real authorization (DB-validated session) happens in requireAdmin() on every
// admin page and server action.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  if (!request.cookies.has("pos_admin_session")) {
    const url = new URL("/admin/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
