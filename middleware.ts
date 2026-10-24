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

/*
 * 없는 공개 홈페이지(/launch/없는-주소) — 페이지가 notFound() 를 불러도 맨 위 로딩 화면(app/loading.tsx)이 먼저 흘러 나가
 * 응답이 200 으로 굳었다(모바일 점검 r37). 검색·공유 미리보기가 빈 페이지를 살아 있는 주소로 믿는다.
 * 여기서 공개된 주소인지 한 번만 가볍게 묻고, 없으면 같은 화면(launch/[slug]/not-found)을 404 로 돌려준다.
 * DB 를 못 물으면(설정 없음·시간 초과·오류) 막지 않고 그대로 보낸다 — 있는 홈페이지를 404 로 만들지 않는다.
 */
/* app/launch/[slug]/not-found.tsx 와 같은 말·모양 — 손님이 보는 화면이라 오늘창업 로고·'내 사업' 단추는 없다 */
const LAUNCH_MISSING_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>이 홈페이지는 지금 볼 수 없어요</title><style>
body{margin:0;font-family:Pretendard,"Apple SD Gothic Neo",system-ui,sans-serif;background:#f6f8fb;color:#191f28}
main{min-height:100vh;display:grid;place-content:center;padding:24px 16px;box-sizing:border-box}
section{width:min(440px,100%);box-sizing:border-box;padding:40px 28px;border:1px solid #e3e9f1;border-radius:16px;background:#fff;text-align:center}
h1{margin:0 0 8px;font-size:24px;line-height:1.4;word-break:keep-all;text-wrap:balance}
p{margin:0;color:#4e5968;font-size:15px;line-height:1.7;word-break:keep-all;text-wrap:pretty}
@media (max-width:640px){main{min-height:100svh;padding:24px 20px;background:#fff}section{padding:0;border:0}h1{font-size:22px}}
</style></head><body><main><section><h1>이 홈페이지는 지금 볼 수 없어요</h1><p>주소가 바뀌었거나 사장님이 잠시 닫아 두었을 수 있어요. 주소를 다시 확인하거나 가게에 직접 물어봐 주세요.</p></section></main></body></html>`;
const LAUNCH_PATH = /^\/launch\/([^/]+)\/?$/;
async function launchSlugMissing(rawSlug: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || process.env.PERSISTENCE_MODE?.trim() === "demo-memory") return false;
  let slug: string;
  try { slug = decodeURIComponent(rawSlug); } catch { return true; }
  try {
    const query = `${url}/rest/v1/landing_sites?select=id&status=eq.published&published_slug=eq.${encodeURIComponent(slug)}&limit=1`;
    const res = await fetch(query, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!res.ok) return false;
    const rows = await res.json() as unknown;
    return Array.isArray(rows) && rows.length === 0;
  } catch {
    return false;
  }
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

  const launch = LAUNCH_PATH.exec(pathname);
  if (launch && await launchSlugMissing(launch[1])) {
    /* 페이지로 다시 보내면(rewrite) 또 로딩 화면이 먼저 나가 200 이 된다 — 같은 문구의 작은 화면을 여기서 바로 404 로 */
    const missing = new NextResponse(LAUNCH_MISSING_HTML, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    return withSecurityHeaders(missing);
  }

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
