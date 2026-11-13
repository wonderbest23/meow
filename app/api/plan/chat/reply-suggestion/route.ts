import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { intakeLoginRequired } from "../../../../../lib/plan-builder/intake-http";
import { resolveTextLLMConfig } from "../../../../../lib/llm/config";
import { suggestionConfig } from "../../../../../lib/plan-builder/answer-suggestions";
import { suggestReply } from "../../../../../lib/plan-builder/reply-suggestion";
import { loadPlanState } from "../../../../../lib/plan-builder/plan-server-store";
import { readCoach } from "../../../../../lib/plan-builder/coach";
import { coachFieldDisplay } from "../../../../../lib/plan-builder/coach-presentation";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({ planId: z.string().trim().min(1).max(120) });
const noStore = { "Cache-Control": "private, no-store" };

/*
 * 대화 입력창의 회색 추천 문구 — 내 사업의 저장된 대화와 사업 정보만 읽어 만든다(화면이 보낸 글은 쓰지 않는다).
 * AI 연결이 없거나 실패하거나 거름망에 걸리면 204로 조용히 끝나고 화면은 기본 안내 글자를 둔다. INTAKE_REPLY_SUGGESTION=0 또는 INTAKE_BETA_SAFETY=1 로 끈다.
 */
export async function POST(request: Request) {
  if (process.env.INTAKE_REPLY_SUGGESTION === "0" || process.env.INTAKE_BETA_SAFETY === "1") return new Response(null, { status: 204, headers: noStore });
  const identity = await requireGuestIdentity();
  if (intakeLoginRequired(identity.userId)) return new Response(null, { status: 204, headers: noStore });
  const limited = await enforceRateLimit("intake-reply-suggestion", request, { limit: 20, windowMs: 10 * 60_000, message: "잠시 후 다시 시도해 주세요." });
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400, headers: noStore });
  const plan = (await loadPlanState(identity.hash)).plans.find(item => item.id === parsed.data.planId);
  const coach = plan ? readCoach(plan.answers) : null;
  const config = suggestionConfig(resolveTextLLMConfig(identity.hash));
  if (!plan || !coach || !config) return new Response(null, { status: 204, headers: noStore });
  const result = await suggestReply(config, {
    business: [coach.business.name, coach.business.description].filter(Boolean).join(" — "),
    facts: coach.fields.map(field => ({ label: field.key, value: coachFieldDisplay(field.value) })),
    messages: coach.messages.map(message => ({ role: message.role, text: message.text })),
  }, request.signal);
  console.log(`[reply-suggestion] ${JSON.stringify({ model: result.model, totalMs: result.totalMs, ok: !!result.reply, failure: result.failure })}`);
  if (!result.reply) return new Response(null, { status: 204, headers: noStore });
  return NextResponse.json({ reply: result.reply }, { headers: noStore });
}
