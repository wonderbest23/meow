import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { intakeLoginRequired } from "../../../../../lib/plan-builder/intake-http";
import { resolveTextLLMConfig } from "../../../../../lib/llm/config";
import { loadPlanState } from "../../../../../lib/plan-builder/plan-server-store";
import { readCoach } from "../../../../../lib/plan-builder/coach";
import { intakeQuestions, readIntake } from "../../../../../lib/plan-builder/intake-core";
import { saveIntakeCommand } from "../../../../../lib/plan-builder/intake-service";
import { intakeReaderEnabled, readIntakeMessage, readerItems, READER_MAX_INPUT } from "../../../../../lib/plan-builder/intake-reader";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({ planId: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(READER_MAX_INPUT), asking: z.string().trim().max(100).nullable().optional() });
const noStore = { "Cache-Control": "private, no-store" };
const nothing = () => new Response(null, { status: 204, headers: noStore });
/* 읽기는 작은 모델로 — 시험(60문제 중 59, 한 번 0.6원)을 이 모델로 했다. INTAKE_READER_MODEL 로 바꾼다 */
const READER_MODEL = "claude-haiku-5-5";

/*
 * 일반 모드: 대화 중 사용자가 적은 말 하나를 AI로 읽어 사업 정보 표를 고친다("AI가 읽고, 코드가 계산한다" — docs/일반모드-AI읽기-설계-2026-11-16.md).
 * 스위치(INTAKE_AI_READER=1)가 꺼져 있으면 아무것도 하지 않고 204 — 지금은 꺼 둔다. 화면도 아직 이 길을 부르지 않는다.
 * AI 연결이 없거나 실패하거나 늦으면 204 로 조용히 끝난다 — 화면은 지금의 규칙으로 처리한다.
 * 전문가 모드와 계획서를 만든 뒤에는 읽지 않는다.
 */
export async function POST(request: Request) {
  if (!intakeReaderEnabled()) return nothing();
  const identity = await requireGuestIdentity();
  if (intakeLoginRequired(identity.userId)) return nothing();
  // 손님 AI 하루 한도(guest-ai-budget.ts)는 세지 않는다(Haiku 한 번 0.6원 — 0단위). 이 IP별 10분 제한만 둔다
  const limited = await enforceRateLimit("intake-read", request, { limit: 40, windowMs: 10 * 60_000, message: "잠시 후 다시 시도해 주세요." });
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400, headers: noStore });
  const read = async () => {
    const plan = (await loadPlanState(identity.hash)).plans.find(item => item.id === parsed.data.planId);
    const coach = plan ? readCoach(plan.answers) : null, intake = plan ? readIntake(plan.answers) : null;
    return plan && coach && intake ? { plan, coach, intake } : null;
  };
  const first = await read();
  const base = resolveTextLLMConfig(identity.hash);
  const config = base && base.provider === "anthropic" ? { ...base, model: process.env.INTAKE_READER_MODEL?.trim() || READER_MODEL } : null;
  if (!first || !config || first.intake.depth === "expert" || Object.keys(first.plan.sections).length) return nothing();
  const table = Object.fromEntries(first.coach.fields.map(field => [field.key, field.value.slice(0, 200)]));
  const outcome = await readIntakeMessage(config, { asking: parsed.data.asking ?? null, table, message: parsed.data.message }, request.signal);
  // 읽는 동안 사용자가 답을 더 했을 수 있다 — 저장 직전 상태로 다시 읽어 그 번호로 저장한다
  const now = await read();
  if (!now) return nothing();
  const items = readerItems(outcome.result, intakeQuestions(now.intake, now.coach), now.coach.fields.find(field => field.key === "capacity")?.value);
  const count = items.answers.length + (items.operatingDays ? 1 : 0) + items.unknown.length;
  console.log(`[intake-read] ${JSON.stringify({ model: outcome.model, totalMs: outcome.totalMs, intent: outcome.result.intent, items: count, ask: outcome.result.ask.length, failure: outcome.failure })}`);
  if (outcome.failure) return nothing();
  if (count) {
    try { await saveIntakeCommand(identity.hash, { action: "read", planId: now.plan.id, revision: now.coach.revision, requestId: randomUUID(), read: items }); }
    catch { return nothing(); }
  }
  return NextResponse.json({ intent: outcome.result.intent, applied: count, ask: outcome.result.ask }, { headers: noStore });
}
