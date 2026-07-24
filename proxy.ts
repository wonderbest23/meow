import { NextResponse, type NextRequest } from "next/server";
import { adminCookieName, resolveScope, verifyAdminSessionToken } from "./lib/support-chat/admin-session";

// Admin API endpoints that must stay reachable without an existing admin session:
// the session endpoint is how an operator logs in, checks status, and logs out.
const ADMIN_AUTH_EXEMPT = ["/api/admin/support/session"];

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Default-deny gate for the admin API surface. Even if a new /api/admin/* route
  // forgets its own hasAdminSession() check, unauthenticated access is refused here.
  const isAdminApi = pathname.startsWith("/api/admin/");
  const isExempt = ADMIN_AUTH_EXEMPT.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (isAdminApi && !isExempt) {
    // Payments endpoints require the payments scope (its own credential when configured,
    // otherwise the shared support session); every other admin route uses the support scope.
    const scope = resolveScope(pathname.startsWith("/api/admin/payments/") ? "payments" : "support");
    const token = request.cookies.get(adminCookieName(scope))?.value;
    if (!(await verifyAdminSessionToken(token, scope))) {
      const denied = NextResponse.json(
        { error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } },
        { status: 401 },
      );
      denied.headers.set("Cache-Control", "private, no-store, max-age=0");
      return withSecurityHeaders(denied);
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  // Run on everything except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|icon.svg|robots.txt|sitemap.xml).*)"],
};
