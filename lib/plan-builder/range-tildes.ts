/**
 * 예전에 저장된 본문 HTML 고치기 — 취소선을 끄기 전(2026-10-22)에 만든 HTML 에는 '2<del>3곳 … 각 2</del>3곳'처럼
 * 범위 물결 한 쌍이 취소선 태그로 남아 '23곳'으로 읽힌다. marked 가 물결 한 쌍을 태그로 바꾼 것이므로 태그를 물결로 되돌린다.
 * 편집기에서 쓰므로 marked 를 들이지 않는 작은 모듈로 둔다.
 */
export function restoreRangeTildes(html: string): string {
  if (!/<(?:del|s)>/i.test(html)) return html;
  return html.replace(/<(del|s)>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, inner: string) => `~${inner}~`);
}
