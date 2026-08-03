import { NextResponse, type NextRequest } from "next/server";
import { adminCookieName, resolveScope, verifyAdminSessionToken } from "./lib/support-chat/admin-session";

// Admin API endpoints that must stay reachable without an existing admin session:
// the session endpoint is how an operator logs in, checks status, and logs out.
const ADMIN_AUTH_EXEMPT = ["/api/admin/support/session"];

/*
 * 플랜 빌더는 가입해야 쓸 수 있다.
 * 화면 안의 관문(PlanShell)만으로는 HTML이 그대로 내려가므로, 세션 쿠키가
 * 아예 없는 요청은 여기서 로그인 화면으로 돌려보낸다. 쿠키가 있는지만 보고
 * 토큰의 유효성은 검사하지 않는다 — Edge에서 매 요청 검증하는 값이 아니고,
 * 실제 판정은 API(resolvePlanAccess)가 이미 하고 있다.
 */
const PLAN_PUBLIC = ["/plan/info", "/plan/pay"];
const AUTH_COOKIES = ["venture_access", "venture_refresh"];

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

// Edge middleware. Cloudflare(OpenNext)는 Edge 미들웨어만 지원하므로 Next 16의
// Node 전용 proxy.ts 대신 이 파일을 사용한다. 세션 검증은 Web Crypto 기반이라 Edge에서 동작한다.
export async function middleware(request: NextRequest) {
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

  if (pathname === "/plan" || pathname.startsWith("/plan/")) {
    const isPublic = PLAN_PUBLIC.some((path) => pathname === path || pathname.startsWith(`${path}/`));
    const hasSession = AUTH_COOKIES.some((name) => request.cookies.get(name)?.value);
    if (!isPublic && !hasSession) {
      const login = request.nextUrl.clone();
      login.pathname = "/account";
      login.search = "";
      login.searchParams.set("next", pathname + request.nextUrl.search);
      const redirected = NextResponse.redirect(login);
      redirected.headers.set("Cache-Control", "private, no-store, max-age=0");
      return withSecurityHeaders(redirected);
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  // Run on everything except Next.js internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|icon.svg|robots.txt|sitemap.xml).*)"],
};
