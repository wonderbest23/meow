import { NextResponse, type NextRequest } from "next/server";
import { adminClosedOnHost, closedForLaunch } from "./lib/launch-scope";
import { adminCookieName, resolveScope, verifyAdminSessionToken } from "./lib/support-chat/admin-session";

// Admin API endpoints that must stay reachable without an existing admin session:
// the session endpoint is how an operator logs in, checks status, and logs out.
const ADMIN_AUTH_EXEMPT = ["/api/admin/support/session"];

/** 앱이 User-Agent 끝에 붙이는 표시 — mobile/capacitor.config.json 의 appendUserAgent 와 같아야 한다 */
const APP_USER_AGENT_MARK = "OneulstartApp";


function withSecurityHeaders(response: NextResponse) {
  /*
   * 프레임 차단 — 남의 사이트가 우리 화면을 덮어씌우는 클릭재킹은 계속 막는다.
   * 다만 우리 화면끼리는 허용해야 한다: 어드민 홈 편집기(/admin/homepage)가
   * 진짜 홈을 iframe 으로 띄워 그 위에서 섹션을 고르기 때문이다(DENY 면 빈 칸).
   * frame-ancestors 'self' 가 현행 표준이고, X-Frame-Options 는 옛 브라우저용이다.
   */
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
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

  // 오픈 범위 밖(개발용 화면·덜 만든 기능·옛 기능)은 운영에서 없는 주소로 답한다(lib/launch-scope.ts)
  const closed = closedForLaunch(pathname) ?? adminClosedOnHost(pathname, request.headers.get("host") ?? request.nextUrl.hostname);
  if (closed === "api") {
    const gone = NextResponse.json({ error: { code: "NOT_FOUND", message: "없는 주소입니다." } }, { status: 404 });
    gone.headers.set("Cache-Control", "no-store");
    return withSecurityHeaders(gone);
  }
  if (closed === "page") return withSecurityHeaders(NextResponse.rewrite(new URL("/__closed", request.url), { status: 404 }));

  /*
   * 아이폰·안드로이드 앱(mobile/)에서 로그인한 사람이 앱을 열면 홍보용 첫 화면 대신 '내 사업'으로 바로 보낸다
   * (대표 요청 2026-10-14: 로그인했는데 홈 화면이 떠서 버그처럼 보였다). 화면에서 확인하면 첫 화면이 잠깐 보였다 바뀌므로 여기서 보낸다.
   * 앱은 요청 머리말(User-Agent)에 APP_USER_AGENT_MARK 를 붙인다(mobile/capacitor.config.json appendUserAgent).
   * 로그인 여부는 갱신 쿠키(lib/identity-tokens.ts AUTH_REFRESH_COOKIE — 그 파일은 node:crypto 를 써서 여기서 못 불러온다)가 있는지로만 본다.
   * 쿠키가 낡았으면 내 사업 화면이 로그인 안내를 보여 준다.
   */
  if (pathname === "/" && request.headers.get("user-agent")?.includes(APP_USER_AGENT_MARK) && request.cookies.has("venture_refresh")) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/plan", request.url)));
  }

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
