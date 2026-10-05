/*
 * 화면에 보여 줄 오류 문구 — 브라우저·서버가 만든 원문을 그대로 보이지 않는다.
 *
 * 예전엔 각 화면이 `throw new Error(data.message)` 와 `error.message` 를 그대로 보여서
 * - 연결이 끊기면 "Failed to fetch" / "Load failed",
 * - HTML 오류 페이지(502 등)면 "Unexpected token '<'…",
 * - 시간 초과면 "signal is aborted without reason",
 * - 요청이 잦아 막힌 응답({ error: { message } })이면 빈 문자열(아무것도 안 보임)
 * 이 그대로 나왔다.
 */

/** 서버 응답 본문에서 사람용 안내를 꺼낸다 — { error: { message } } 와 { message } 둘 다 */
export function apiMessage(data: unknown, fallback: string): string {
  const body = data as { message?: unknown; error?: { message?: unknown } | string } | null | undefined;
  const nested = body && typeof body.error === "object" ? body.error?.message : undefined;
  const value = typeof nested === "string" && nested.trim() ? nested : typeof body?.message === "string" && body.message.trim() ? body.message : "";
  return value || fallback;
}

/** 잡은 오류를 사람용 문구로 — 한국어로 쓴 안내만 통과시키고, 나머지는 fallback */
export function userErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (["TypeError", "SyntaxError", "AbortError", "TimeoutError"].includes(error.name)) return fallback;
  const message = error.message.trim();
  return message && /[가-힣]/.test(message) && message.length <= 300 ? message : fallback;
}
