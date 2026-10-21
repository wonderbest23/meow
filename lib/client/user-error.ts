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
  return koreanText(value, fallback);
}

/*
 * 한국어로 쓴 안내만 통과시킨다 — 서버가 남긴 'internal'·'Bad Request' 같은 개발용 원문은 fallback 으로 바꾼다.
 * 사장님은 영어 원문을 보고 할 일을 알 수 없다.
 */
export function koreanText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text && /[가-힣]/.test(text) && text.length <= 300 ? text : fallback;
}

/** 시간 안에 답이 없으면 끊는 fetch — 서버가 답을 안 주면 '불러오고 있어요'가 끝없이 돌던 것을 막는다 */
export const SLOW_LOAD_MS = 20000;
export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = SLOW_LOAD_MS): Promise<Response> {
  const controller = new AbortController();
  const outer = init.signal;
  const stop = () => controller.abort();
  if (outer) { if (outer.aborted) controller.abort(); else outer.addEventListener("abort", stop, { once: true }); }
  const timer = setTimeout(() => controller.abort(new DOMException("시간 초과", "TimeoutError")), ms);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    /* 본문을 다 받을 때까지도 같은 시간 안에서 — 머리만 오고 본문이 멈추면 json() 에서 또 멈춘다 */
    if (!res.body || [204, 205, 304].includes(res.status)) return res;
    const body = await res.arrayBuffer();
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", stop);
  }
}

/** 시간 초과로 끊긴 요청인지 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** 잡은 오류를 사람용 문구로 — 한국어로 쓴 안내만 통과시키고, 나머지는 fallback */
export function userErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (["TypeError", "SyntaxError", "AbortError", "TimeoutError"].includes(error.name)) return fallback;
  const message = error.message.trim();
  return message && /[가-힣]/.test(message) && message.length <= 300 ? message : fallback;
}
