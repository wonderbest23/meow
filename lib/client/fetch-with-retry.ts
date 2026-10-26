/* 잠깐 끊긴 서버(502·503·504·연결 실패)는 두 번 더 묻는다 — 첫 화면(app/home-page.tsx)과 예전 결과물 화면(app/legacy-project-workspace.tsx)이 같이 쓴다 */
export async function fetchWithTransientRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  attempts = 3,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok || ![502, 503, 504].includes(response.status) || attempt === attempts - 1) {
        return response;
      }
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("서버 연결을 다시 확인해주세요.");
}
