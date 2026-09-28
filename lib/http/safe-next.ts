/**
 * 로그인 뒤 돌아갈 내부 경로만 통과시킨다(열린 리다이렉트 방지).
 * "/\evil.com"은 브라우저가 "//evil.com"으로 바꿔 외부로 나가므로, 같은 출처로 해석되는 경로만 받는다.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  try {
    const base = "https://oneulstart.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
