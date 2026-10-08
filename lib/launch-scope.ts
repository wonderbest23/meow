/*
 * 오픈 범위 — 운영에서 손님에게 열지 않는 주소.
 *
 * 오픈 준비(2026-10-08, 소유자: "애매한 건 과감하게 없애고 일단 오픈"): 덜 만들어졌거나 운영 설정이 없어 조용히
 * 동작하지 않는 기능, 화면에서 쓰지 않는 옛 기능, 개발용 시험 화면을 운영에서 닫는다. 코드는 남겨 두어
 * 준비가 되면 이 목록에서 빼는 것으로 다시 연다. 스테이징·프리런치(APP_ENV)와 로컬 개발에서는 열려 있다.
 */
export const CLOSED_PAGE_PREFIXES: readonly string[] = [
  "/dev",
];

export const CLOSED_API_PREFIXES: readonly string[] = [
  "/api/dev",
];

function matches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** 운영 손님에게 닫힌 주소인지 — env 는 시험용으로 넘길 수 있다 */
export function closedForLaunch(pathname: string, env: { NODE_ENV?: string; APP_ENV?: string } = process.env): "page" | "api" | null {
  if (env.NODE_ENV !== "production") return null;
  if (env.APP_ENV === "staging" || env.APP_ENV === "prelaunch") return null;
  if (matches(pathname, CLOSED_API_PREFIXES)) return "api";
  if (matches(pathname, CLOSED_PAGE_PREFIXES)) return "page";
  return null;
}
