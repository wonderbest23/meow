/**
 * 브라우저가 보낸 Origin(없으면 Referer)이 이 사이트와 같은지 본다. 다른 사이트의 폼·스크립트가 로그인 API를 부르지 못하게 한다.
 * 두 헤더가 모두 없으면(서버 간 호출·오래된 브라우저) 통과시킨다. 브라우저는 교차 출처 POST에 Origin을 항상 붙인다.
 */
export function isSameOriginRequest(request: Request): boolean {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === expected;
  const referer = request.headers.get("referer");
  if (!referer) return true;
  try { return new URL(referer).origin === expected; } catch { return false; }
}
