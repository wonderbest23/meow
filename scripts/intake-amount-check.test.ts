import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { IntakeCommand } from "../lib/plan-builder/intake-types";

/*
 * 상담 금액 확인 — 실제 AI 점검(2026-10-27)에서 준비 예산·월 비용·한 달 생활비를 각 3,000원으로 넣어도 아무 확인 없이 계획서까지 갔다.
 * 현실 범위 밖 금액은 같은 질문을 한 번 더 묻고(화면), 확인 없이 온 답은 서버가 멈춰 세운다. [맞아요](confirmed)면 그대로 저장한다.
 */
type Command = Omit<IntakeCommand, "planId" | "revision" | "requestId">;

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", RATE_LIMIT_BACKEND: "memory",
    PLAN_ACCOUNT_LINKING_ENABLED: "false", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "1", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
  });
  const { amountCheckPrompt, coreQuestions } = await import("../lib/plan-builder/intake-questions");
  const { answerCheckPrompt, ZERO_PRICE_PROMPT } = await import("../app/plan/chat/intake-ui/model");
  const { saveIntakeCommand } = await import("../lib/plan-builder/intake-service");
  const { readIntake, IntakeError } = await import("../lib/plan-builder/intake-core");
  const { loadPlanState } = await import("../lib/plan-builder/plan-server-store");
  const { readCoach } = await import("../lib/plan-builder/coach");

  const questions = coreQuestions("startup");
  const q = (id: string) => questions.find(item => item.id === id)!;

  // 1) 규칙: 예산·생활비·월 비용 10만 원 미만, 가격·건당 비용 100원 미만이면 묻는다. 0원·미정·범위 안은 묻지 않는다
  assert.equal(amountCheckPrompt(q("livingCost"), "3000"), "한 달 생활비 3,000원이 맞나요? 만 원 단위를 빠뜨리셨으면 다시 넣어 주세요.");
  assert.equal(amountCheckPrompt(q("budget"), "3,000원"), "준비 예산 3,000원이 맞나요? 만 원 단위를 빠뜨리셨으면 다시 넣어 주세요.");
  assert.equal(amountCheckPrompt(q("structure.cost"), "월 3천원"), "매달 나가는 돈 3,000원이 맞나요? 만 원 단위를 빠뜨리셨으면 다시 넣어 주세요.");
  assert.match(amountCheckPrompt(q("price"), 50) ?? "", /^판매 가격 50원이 맞나요\? 천 원·만 원 단위/);
  assert.match(amountCheckPrompt(q("structure.unitCost"), "80원") ?? "", /^한 건당 비용 80원이 맞나요\?/);
  assert.match(amountCheckPrompt(q("budget"), "1~3만원") ?? "", /^준비 예산 1~3만원이 맞나요\?/, "범위는 적은 쪽으로 본다");
  for (const [id, value] of [["budget", "300만원"], ["budget", "0"], ["livingCost", 0], ["livingCost", "150만원"], ["structure.cost", "100000"], ["price", "3000"], ["price", "0"], ["structure.unitCost", 0], ["structure.unitCost", "500"], ["hoursPerWeek", "3"], ["customer", "3000"], ["budget", null]] as const) {
    assert.equal(amountCheckPrompt(q(id), value), null, `${id}=${String(value)} 은 묻지 않는다`);
  }
  // 화면은 판매 가격 0원 확인과 같은 자리에서 묻는다
  assert.equal(answerCheckPrompt(q("price"), "0"), ZERO_PRICE_PROMPT);
  assert.equal(answerCheckPrompt(q("livingCost"), "3000"), amountCheckPrompt(q("livingCost"), "3000"));

  // 2) 서버: 확인 없는 답은 저장하지 않고 같은 문장으로 멈춘다. confirmed면 그대로 저장한다
  const ownerHash = `amount-check-${randomUUID()}`;
  const started = await saveIntakeCommand(ownerHash, { action: "start", mode: "startup", revision: 0, requestId: randomUUID() });
  const planId = started.plan.id;
  const load = async () => {
    const plan = (await loadPlanState(ownerHash)).plans.find(item => item.id === planId)!;
    return { coach: readCoach(plan.answers)!, intake: readIntake(plan.answers)! };
  };
  const send = async (command: Command) => saveIntakeCommand(ownerHash, { ...command, planId, revision: (await load()).coach.revision, requestId: randomUUID() }, { aiAvailable: false, aiAllowed: false });
  await send({ action: "answer", questionId: "business", value: "동네 반찬 가게" });

  await assert.rejects(send({ action: "answer", questionId: "livingCost", value: "3000" }), (error: unknown) => {
    assert.ok(error instanceof IntakeError);
    assert.equal(error.code, "amount_check");
    assert.equal(error.status, 422);
    assert.equal(error.message, "한 달 생활비 3,000원이 맞나요? 만 원 단위를 빠뜨리셨으면 다시 넣어 주세요.");
    return true;
  });
  assert.equal((await load()).intake.answers.livingCost, undefined, "확인 전에는 저장하지 않는다");
  await assert.rejects(send({ action: "answer", questionId: "budget", value: 3000 }), /준비 예산 3,000원이 맞나요/);
  await assert.rejects(send({ action: "answer", questionId: "structure.cost", value: "3,000원" }), /매달 나가는 돈 3,000원이 맞나요/);

  await send({ action: "answer", questionId: "livingCost", value: "3000", confirmed: true });
  assert.equal((await load()).intake.answers.livingCost?.value, 3000, "[맞아요]면 그대로 저장한다");
  // 다시 적은 현실 범위 금액·0원·미정은 묻지 않고 저장한다
  await send({ action: "answer", questionId: "budget", value: "300만원" });
  assert.equal((await load()).intake.answers.budget?.value, 3_000_000);
  await send({ action: "answer", questionId: "structure.cost", value: "0" });
  await send({ action: "answer", questionId: "livingCost", value: null, unknown: true });
  assert.equal((await load()).intake.answers.livingCost?.status, "unknown");
  console.log(JSON.stringify({ passed: 22 }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
