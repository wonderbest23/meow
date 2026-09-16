export class RequestBodyError extends Error {
  constructor(public readonly code: "body_too_large" | "invalid_body" | "body_unreadable", public readonly status: 400 | 413, message: string) { super(message); }
}

/** Content-Length is only an early rejection hint; the stream's actual byte count is authoritative. */
export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError("invalid_body_limit");
  const tooLarge = () => new RequestBodyError("body_too_large", 413, "수정 내용이 너무 커요. 이미지 크기나 개수를 줄인 뒤 다시 저장해 주세요");
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared.trim()) && Number(declared) > maxBytes) {
    void request.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!request.body) throw new RequestBodyError("invalid_body", 400, "입력 내용을 확인해 주세요");
  const reader = request.body.getReader();
  let bytes = new Uint8Array(Math.min(maxBytes, 16_384)), length = 0, aborted = request.signal.aborted;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const abort = () => { aborted = true; cancel(); };
  request.signal.addEventListener("abort", abort, { once: true });
  try {
    if (aborted) { cancel(); throw new RequestBodyError("body_unreadable", 400, "요청이 중단됐어요. 편집 내용은 그대로 두고 다시 저장해 주세요"); }
    for (;;) {
      const chunk = await reader.read();
      if (aborted) throw new RequestBodyError("body_unreadable", 400, "요청이 중단됐어요. 편집 내용은 그대로 두고 다시 저장해 주세요");
      if (chunk.done) break;
      const nextLength = length + chunk.value.byteLength;
      if (nextLength > maxBytes) { cancel(); throw tooLarge(); }
      if (nextLength > bytes.length) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(bytes.length * 2, nextLength)));
        grown.set(bytes.subarray(0, length)); bytes = grown;
      }
      bytes.set(chunk.value, length); length = nextLength;
    }
  } catch (error) {
    cancel();
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("body_unreadable", 400, "요청 내용을 읽지 못했어요. 편집 내용은 그대로 두고 다시 저장해 주세요");
  } finally { request.signal.removeEventListener("abort", abort); reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))); }
  catch { throw new RequestBodyError("invalid_body", 400, "입력 내용을 확인해 주세요"); }
}
