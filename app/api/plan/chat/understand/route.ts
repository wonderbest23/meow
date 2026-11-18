import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { chargeGuestAi, intakeLoginRequired } from "../../../../../lib/plan-builder/intake-http";
import { GUEST_AI_UNITS } from "../../../../../lib/plan-builder/guest-ai-budget";
import { resolveTextLLMConfig } from "../../../../../lib/llm/config";
import { suggestionConfig } from "../../../../../lib/plan-builder/answer-suggestions";
import { guessedAnswers, understandIdea, understoodAnswers } from "../../../../../lib/plan-builder/idea-understanding";
import { loadPlanState } from "../../../../../lib/plan-builder/plan-server-store";
import { readCoach } from "../../../../../lib/plan-builder/coach";
import { intakeQuestions, readIntake } from "../../../../../lib/plan-builder/intake-core";
import { saveIntakeCommand } from "../../../../../lib/plan-builder/intake-service";
import { understandAiBudget, understandSaveOnTime } from "../../../../../lib/plan-builder/intake-timing";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({ planId: z.string().trim().min(1).max(120) });
const noStore = { "Cache-Control": "private, no-store" };
const nothing = () => new Response(null, { status: 204, headers: noStore });

/*
 * 일반 모드: 사용자가 적은 사업 문장을 AI로 읽어 말한 값(가격 · 판매 경로 · 준비금 · 처리량 · 혼자인지 · 평일만인지 …)을 기준값 대신 넣는다.
 * 적히지 않은 칸(고객 · 문제 · 대표 상품 · 가격 · 한 번 비용 · 월 고정비 · 경로)도 같은 호출에서 이 사업에 맞게 짐작해 기준표 값 대신 넣는다(2026-11-17).
 * 저장된 내 사업의 문장만 읽고(화면이 보낸 글은 쓰지 않는다), 사업마다 한 번만 한다(intake.understood).
 * AI 연결이 없거나 실패하거나 늦으면 204로 조용히 끝난다 — 대화는 기준값으로 그대로 진행된다. INTAKE_UNDERSTAND=0 또는 INTAKE_BETA_SAFETY=1 로 끈다.
 * 시간은 요청을 받은 때부터 잰다(intake-timing UNDERSTAND_SAVE_BY_MS) — 화면이 기다림(8초)을 끝낸 뒤에는 저장하지 않는다.
 * 화면이 끊어도 서버는 끝까지 돌아서, 예전엔 늦은 저장이 화면 몰래 판(revision)을 올려 손님의 두 번째 답이 409로 막혔다(2026-11-17 운영).
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
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
  // 여기까지 오래 걸려 저장 시한 안에 AI를 마칠 수 없으면 부르지 않는다(손님 AI 한도도 쓰지 않는다)
  if (!understandAiBudget(startedAt, Date.now())) return nothing();
  // 손님 AI 하루 한도(guest-ai-budget.ts) — AI를 부르기 바로 앞에서 센다. 한도에 닿으면 로그인 필요일 때처럼 조용히 끝난다
  if (!(await chargeGuestAi(identity, GUEST_AI_UNITS.assist, "understand"))) return nothing();
  const result = await understandIdea(config, business, request.signal, understandAiBudget(startedAt, Date.now()));
  // 읽는 동안 사용자가 답을 더 했을 수 있다 — 저장 직전 상태로 다시 읽어 그 번호로 저장한다(직접 답한 것은 저장 쪽에서 건드리지 않는다)
  const now = await read();
  // 다른 요청(같은 사업을 다시 연 화면 등)이 먼저 읽어 저장했으면 한 번 더 넣지 않는다 — 판만 또 오른다
  if (!now || now.intake.understood) return nothing();
  const questions = intakeQuestions(now.intake, now.coach);
  const items = understoodAnswers(result.understood, questions, now.coach.fields.find(field => field.key === "capacity")?.value);
  // 적히지 않은 칸 — 이 사업에 맞춘 짐작(말한 칸은 빼고). 저장 쪽에서 기준표로 채운 칸만 바꾼다
  const guessed = guessedAnswers(result.understood.guess, questions, new Set(items.map(item => item.questionId)), now.coach.fields.find(field => field.key === "capacity")?.value);
  // 화면은 이미 기다림을 끝내고 질문을 보였을 수 있다 — 늦은 읽기는 버린다(저장하면 화면이 모르는 새 판이 생겨 다음 답이 막힌다)
  const late = !understandSaveOnTime(startedAt, Date.now());
  console.log(`[intake-understand] ${JSON.stringify({ model: result.model, totalMs: result.totalMs, items: items.length, guessed: guessed.length, failure: result.failure, ...(late ? { late: Date.now() - startedAt } : {}) })}`);
  if (result.failure || late) return nothing();
  try {
    await saveIntakeCommand(identity.hash, { action: "understand", planId: now.plan.id, revision: now.coach.revision, requestId: randomUUID(), understood: items, guessed });
  } catch { return nothing(); }
  return NextResponse.json({ applied: items.length, guessed: guessed.length }, { headers: noStore });
}
