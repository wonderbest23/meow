/** Chat writes may commit before a proxy returns an empty or non-JSON response. Callers must keep their request ID on failure. */
export async function readChatResponse<T = unknown>(response: Response): Promise<T> {
  let text: string;
  try { text = await response.text(); }
  catch { throw new Error("응답을 끝까지 받지 못했어요. 입력은 그대로 두고 같은 요청으로 다시 확인해 주세요."); }
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_payload");
    return value as T;
  } catch {
    throw new Error(response.ok
      ? "저장 응답을 확인하지 못했어요. 입력은 그대로 두고 같은 요청으로 다시 확인해 주세요."
      : "서버가 응답을 완료하지 못했어요. 입력은 그대로 두고 잠시 후 다시 확인해 주세요.");
  }
}
