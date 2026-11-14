import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { intakeLoginRequired } from "../../../../../lib/plan-builder/intake-http";
import { resolveTextLLMConfig } from "../../../../../lib/llm/config";
import { suggestionConfig } from "../../../../../lib/plan-builder/answer-suggestions";
import { understandIdea, understoodAnswers } from "../../../../../lib/plan-builder/idea-understanding";
import { loadPlanState } from "../../../../../lib/plan-builder/plan-server-store";
import { readCoach } from "../../../../../lib/plan-builder/coach";
import { intakeQuestions, readIntake } from "../../../../../lib/plan-builder/intake-core";
import { saveIntakeCommand } from "../../../../../lib/plan-builder/intake-service";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({ planId: z.string().trim().min(1).max(120) });
const noStore = { "Cache-Control": "private, no-store" };
const nothing = () => new Response(null, { status: 204, headers: noStore });

/*
 * 일반 모드: 사용자가 적은 사업 문장을 AI로 읽어 말한 값(가격 · 판매 경로 · 준비금 · 처리량 · 혼자인지 · 평일만인지 …)을 기준값 대신 넣는다.
 * 저장된 내 사업의 문장만 읽고(화면이 보낸 글은 쓰지 않는다), 사업마다 한 번만 한다(intake.understood).
 * AI 연결이 없거나 실패하거나 늦으면 204로 조용히 끝난다 — 대화는 기준값으로 그대로 진행된다. INTAKE_UNDERSTAND=0 또는 INTAKE_BETA_SAFETY=1 로 끈다.
 */
export async function POST(request: Request) {
  if (process.env.INTAKE_UNDERSTAND === "0" || process.env.INTAKE_BETA_SAFETY === "1") return nothing();
  const identity = await requireGuestIdentity();
  if (intakeLoginRequired(identity.userId)) return nothing();
  const limited = await enforceRateLimit("intake-understand", request, { limit: 12, windowMs: 10 * 60_000, message: "잠시 후 다시 시도해 주세요." });
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400, headers: noStore });
  const read = async () => {
    const plan = (await loadPlanState(identity.hash)).plans.find(item => item.id === parsed.data.planId);
    const coach = plan ? readCoach(plan.answers) : null, intake = plan ? readIntake(plan.answers) : null;
    return plan && coach && intake ? { plan, coach, intake } : null;
  };
  const first = await read();
  const business = first?.coach.fields.find(field => field.key === "business" && field.basis === "user")?.value.trim();
  const config = suggestionConfig(resolveTextLLMConfig(identity.hash));
  if (!first || !business || !config || first.intake.understood || first.intake.mode !== "startup" || first.intake.depth === "expert" || Object.keys(first.plan.sections).length) return nothing();
  const result = await understandIdea(config, business, request.signal);
  // 읽는 동안 사용자가 답을 더 했을 수 있다 — 저장 직전 상태로 다시 읽어 그 번호로 저장한다(직접 답한 것은 저장 쪽에서 건드리지 않는다)
  const now = await read();
  if (!now) return nothing();
  const items = understoodAnswers(result.understood, intakeQuestions(now.intake, now.coach), now.coach.fields.find(field => field.key === "capacity")?.value);
  console.log(`[intake-understand] ${JSON.stringify({ model: result.model, totalMs: result.totalMs, items: items.length, failure: result.failure })}`);
  if (result.failure) return nothing();
  try {
    await saveIntakeCommand(identity.hash, { action: "understand", planId: now.plan.id, revision: now.coach.revision, requestId: randomUUID(), understood: items });
  } catch { return nothing(); }
  return NextResponse.json({ applied: items.length }, { headers: noStore });
}
