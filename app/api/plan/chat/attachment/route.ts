import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { COACH_UPLOAD_LIMIT, extractCoachAttachment } from "../../../../../lib/plan-builder/coach-attachment";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const limited = await enforceRateLimit("coach-attachment", request, { limit: 10, windowMs: 60000 });
  if (limited) return limited;
  try {
    if (Number(request.headers.get("content-length")) > COACH_UPLOAD_LIMIT || !request.body) throw new Error("TOO_LARGE");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > COACH_UPLOAD_LIMIT) { await reader.cancel(); throw new Error("TOO_LARGE"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const text = await extractCoachAttachment(bytes);
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "문서를 읽지 못했습니다. 1MB·18,000자 이내의 워드 문서 또는 텍스트를 사용해주세요." }, { status: 400 }); }
}
