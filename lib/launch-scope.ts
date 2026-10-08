/*
 * 오픈 범위 — 운영에서 손님에게 열지 않는 주소.
 *
 * 오픈 준비(2026-10-08, 소유자: "애매한 건 과감하게 없애고 일단 오픈"): 덜 만들어졌거나 운영 설정이 꺼져 '준비 중'만
 * 보이는 기능, 화면에서 쓰지 않는 옛 기능, 개발용 시험 화면을 운영에서 닫는다. 코드는 남겨 두어 준비가 되면
 * 이 목록에서 빼는 것으로 다시 연다. 스테이징·프리런치(APP_ENV)와 로컬 개발에서는 열려 있다.
 */
export const CLOSED_PAGE_PREFIXES: readonly string[] = [
  "/dev",            // 개발용 시험 화면
  "/plan/proposal",  // PPT 제안서 편집 — PPT 자동 생성이 꺼져 있어 '준비 중'만 보인다
];

export const CLOSED_API_PREFIXES: readonly string[] = [
  "/api/dev",
  // 화면에서 부르지 않는 옛 기능(일부는 로그인 없이 AI를 부른다)
  "/api/opportunities",
  "/api/careers",
  "/api/plan/analyze",
  "/api/plan/questions",
  "/api/plan/review",
  "/api/plan/suggest",
  "/api/plan/render",
  "/api/plan/market-research",
  "/api/plan/chat/attachment", // 옛 대화 화면(파일 첨부) 전용 — 지금 대화 화면은 쓰지 않는다
  "/api/delivery",      // 옛 '프로젝트' 화면의 문서·PPT·재무표 만들기 — 로그인 없이 AI·PPT 를 공짜로 받을 수 있었다
  "/api/presentations", // 옛 '프로젝트' 화면의 발표자료 AI
  "/api/brand",         // 옛 로고 이미지 생성
  "/api/health/domain", // 부르는 곳 없음 — 부를 때마다 Cloudflare API 를 써 한도를 깎을 수 있었다
  // PPT 자동 생성이 꺼져 있어 쓰지 않는 제안서·발표자료(화면에서도 감췄다)
  "/api/plan/proposal",
  "/api/plan/deck",
];

/** 동적 주소(프로젝트 번호가 들어가는 옛 기능) */
export const CLOSED_API_PATTERNS: readonly RegExp[] = [
  /^\/api\/projects\/[^/]+\/landing\/(ai-edit|ai-tokens|rollback)\/?$/, // 홈페이지 AI 수정(단추 없음)·되돌리기(부르는 곳 없음)
];

function matches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** 운영 손님에게 닫힌 주소인지 — env 는 시험용으로 넘길 수 있다 */
export function closedForLaunch(pathname: string, env: { NODE_ENV?: string; APP_ENV?: string } = process.env): "page" | "api" | null {
  if (env.NODE_ENV !== "production") return null;
  if (env.APP_ENV === "staging" || env.APP_ENV === "prelaunch") return null;
  if (matches(pathname, CLOSED_API_PREFIXES) || CLOSED_API_PATTERNS.some(pattern => pattern.test(pathname))) return "api";
  if (matches(pathname, CLOSED_PAGE_PREFIXES)) return "page";
  return null;
}

/*
 * 관리자 화면은 oneulstart.com(Cloudflare Access 로 지킨다)에서만 — 손님 도메인·connect.oneulstart.com·workers.dev
 * 주소로 들어오면 Access 를 거치지 않고 관리자 비밀번호만 남았다. 스테이징·프리런치·개발은 그대로.
 */
const ADMIN_HOSTS = new Set(["oneulstart.com", "www.oneulstart.com"]);

export function adminClosedOnHost(pathname: string, hostname: string, env: { NODE_ENV?: string; APP_ENV?: string } = process.env): "page" | "api" | null {
  if (env.NODE_ENV !== "production" || env.APP_ENV === "staging" || env.APP_ENV === "prelaunch") return null;
  const admin = matches(pathname, ["/api/admin"]) ? "api" : matches(pathname, ["/admin"]) ? "page" : null;
  if (!admin) return null;
  return ADMIN_HOSTS.has(hostname.toLowerCase().replace(/:\d+$/, "")) ? null : admin;
}
