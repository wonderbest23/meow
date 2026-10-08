import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { intakeLoginRequired } from "../../../../../lib/plan-builder/intake-http";
import { resolveTextLLMConfig } from "../../../../../lib/llm/config";
import { LIVE_COMMENT_MAX_INPUT, liveCommentConfig, streamLiveComment } from "../../../../../lib/plan-builder/live-comment";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({ text: z.string().trim().min(2).max(LIVE_COMMENT_MAX_INPUT) });
const noStore = { "Cache-Control": "private, no-store" };

/*
 * 첫 사업 설명에 대한 AI 참고 의견을 NDJSON으로 흘려보낸다(시험 기능, INTAKE_LIVE_COMMENT=1일 때만).
 * 줄마다 {"type":"delta","text"} 이고, 마지막 줄 {"type":"done",...}에 첫 글자·전체 시간이 담긴다.
 * 꺼져 있거나 AI 연결이 없으면 204로 조용히 끝나고, 화면은 규격 질문만으로 그대로 진행된다.
 */
export async function POST(request: Request) {
  if (process.env.INTAKE_LIVE_COMMENT !== "1" || process.env.INTAKE_BETA_SAFETY === "1") return new Response(null, { status: 204, headers: noStore });
  // 대화 화면과 같은 로그인 규칙 — 예전엔 주소를 직접 부르면 로그인 없이도 AI 가 돌았다
  if (intakeLoginRequired((await requireGuestIdentity()).userId)) return new Response(null, { status: 204, headers: noStore });
  const limited = await enforceRateLimit("intake-live-comment", request, { limit: 12, windowMs: 10 * 60_000, message: "잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400, headers: noStore });
  const identity = await requireGuestIdentity();
  const config = liveCommentConfig(resolveTextLLMConfig(identity.hash));
  if (!config) return new Response(null, { status: 204, headers: noStore });

  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { closed = true; }
      };
      const timing = await streamLiveComment(config, parsed.data.text, text => send({ type: "delta", text }), abort.signal);
      console.log(`[intake-comment] ${JSON.stringify(timing)}`);
      send({ type: "done", ...timing });
      closed = true;
      try { controller.close(); } catch { /* 이미 닫힘 */ }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", ...noStore, "X-Accel-Buffering": "no" },
  });
}
