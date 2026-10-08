import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { intakeLoginRequired } from "../../../../../lib/plan-builder/intake-http";
import { resolveTextLLMConfig } from "../../../../../lib/llm/config";
import { SUGGESTION_MAX_INPUT, suggestAnswers, suggestionConfig } from "../../../../../lib/plan-builder/answer-suggestions";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  text: z.string().trim().min(2).max(SUGGESTION_MAX_INPUT),
  stage: z.enum(["startup", "operating"]),
});
const noStore = { "Cache-Control": "private, no-store" };

/*
 * 첫 사업 설명에 맞춘 답변 추천(시험 기능, INTAKE_ANSWER_SUGGESTIONS=1일 때만).
 * 꺼져 있거나 AI 연결이 없으면 204로 조용히 끝나고, 화면은 기존 업종 칩만 보여 준다.
 */
export async function POST(request: Request) {
  if (process.env.INTAKE_ANSWER_SUGGESTIONS !== "1" || process.env.INTAKE_BETA_SAFETY === "1") return new Response(null, { status: 204, headers: noStore });
  // 대화 화면과 같은 로그인 규칙 — 예전엔 주소를 직접 부르면 로그인 없이도 AI 가 돌았다
  if (intakeLoginRequired((await requireGuestIdentity()).userId)) return new Response(null, { status: 204, headers: noStore });
  const limited = await enforceRateLimit("intake-answer-suggestions", request, { limit: 12, windowMs: 10 * 60_000, message: "잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400, headers: noStore });
  const identity = await requireGuestIdentity();
  const config = suggestionConfig(resolveTextLLMConfig(identity.hash));
  if (!config) return new Response(null, { status: 204, headers: noStore });
  const result = await suggestAnswers(config, parsed.data.text, parsed.data.stage, request.signal);
  console.log(`[intake-suggestions] ${JSON.stringify({ model: result.model, totalMs: result.totalMs, fields: Object.keys(result.suggestions).length, failure: result.failure })}`);
  if (!Object.keys(result.suggestions).length) return new Response(null, { status: 204, headers: noStore });
  return NextResponse.json({ suggestions: result.suggestions, model: result.model, totalMs: result.totalMs }, { headers: noStore });
}
