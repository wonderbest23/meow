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
  const { amountCheckPrompt, coreQuestions, BUSINESS_PROMPT } = await import("../lib/plan-builder/intake-questions");
  const { answerCheckPrompt, ZERO_PRICE_PROMPT } = await import("../app/plan/chat/intake-ui/model");
  const { saveIntakeCommand } = await import("../lib/plan-builder/intake-service");
  const { readIntake, IntakeError } = await import("../lib/plan-builder/intake-core");
  const { loadPlanState } = await import("../lib/plan-builder/plan-server-store");
  const { readCoach } = await import("../lib/plan-builder/coach");

  const questions = coreQuestions("startup");
  const q = (id: string) => questions.find(item => item.id === id)!;

  // 1) 규칙: 예산·월 비용 10만 원 미만, 가격·건당 비용 100원 미만이면 묻는다. 0원·미정·범위 안은 묻지 않는다
  // 대표 생활비는 더 묻지 않으므로(계획서 품질 Q3, 2026-10-28) 확인 대상도 아니다
  assert.equal(q("livingCost"), undefined, "생활비 질문은 창업 흐름에 없다");
  assert.equal(amountCheckPrompt({ fieldKey: "livingCost", kind: "number", unit: "원", period: "월" }, "3000"), null);
  assert.equal(amountCheckPrompt(q("budget"), "3,000원"), "준비 예산 3,000원이 맞나요? 만 원 단위를 빠뜨리셨으면 다시 넣어 주세요.");
  assert.equal(amountCheckPrompt(q("structure.cost"), "월 3천원"), "매달 나가는 돈 3,000원이 맞나요? 만 원 단위를 빠뜨리셨으면 다시 넣어 주세요.");
  assert.match(amountCheckPrompt(q("price"), 50) ?? "", /^판매 가격 50원이 맞나요\? 천 원·만 원 단위/);
  assert.match(amountCheckPrompt(q("structure.unitCost"), "80원") ?? "", /^한 건당 비용 80원이 맞나요\?/);
  assert.match(amountCheckPrompt(q("budget"), "1~3만원") ?? "", /^준비 예산 1~3만원이 맞나요\?/, "범위는 적은 쪽으로 본다");
  for (const [id, value] of [["budget", "300만원"], ["budget", "0"], ["structure.cost", "100000"], ["price", "3000"], ["price", "0"], ["structure.unitCost", 0], ["structure.unitCost", "500"], ["hoursPerWeek", "3"], ["customer", "3000"], ["budget", null]] as const) {
    assert.equal(amountCheckPrompt(q(id), value), null, `${id}=${String(value)} 은 묻지 않는다`);
  }
  // ux-amount(2026-11-16): 너무 큰 금액도 한 번 묻는다 — 약 1조 원이 확인 없이 저장됐다(고치기 칸에 이어 적어 0이 붙는 실수)
  assert.equal(amountCheckPrompt(q("budget"), 1_000_000_000_000), "준비 예산이 1조 원으로 읽혔어요. 맞나요? 0을 더 넣었거나 금액을 이어 적으셨으면 다시 넣어 주세요.");
  assert.match(amountCheckPrompt(q("budget"), "200억") ?? "", /^준비 예산이 200억 원으로 읽혔어요/);
  assert.match(amountCheckPrompt(q("structure.cost"), "월 15억원") ?? "", /^매달 나가는 돈이 15억 원으로 읽혔어요/);
  assert.match(amountCheckPrompt(q("price"), 1_500_000_000) ?? "", /^판매 가격이 15억 원으로 읽혔어요/);
  assert.match(amountCheckPrompt(coreQuestions("operating").find(item => item.id === "sales")!, 12_000_000_000) ?? "", /^실제 매출이 120억 원으로 읽혔어요/);
  for (const [id, value] of [["budget", "50억"], ["budget", 3_000_000_000], ["structure.cost", "5억원"], ["price", "3억원"]] as const) assert.equal(amountCheckPrompt(q(id), value), null, `${id}=${String(value)} 은 큰 가게에서도 있을 수 있어 묻지 않는다`);
  assert.equal(amountCheckPrompt(coreQuestions("operating").find(item => item.id === "sales")!, "500만원"), null, "실적 매출은 아래 한도가 없다");
  // 첫 질문 안내는 실제 한도(1,200자)와 맞는다 — 예전 '한 문장(60자 안)'인데 훨씬 긴 글도 받았다
  assert.ok(!BUSINESS_PROMPT.includes("60자") && q("business").prompt === BUSINESS_PROMPT && q("business").hint?.includes("1,200자"), BUSINESS_PROMPT);
  // 화면은 판매 가격 0원 확인과 같은 자리에서 묻는다
  assert.equal(answerCheckPrompt(q("price"), "0"), ZERO_PRICE_PROMPT);
  assert.equal(answerCheckPrompt(q("budget"), "3000"), amountCheckPrompt(q("budget"), "3000"));

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

  await assert.rejects(send({ action: "answer", questionId: "budget", value: 3000 }), (error: unknown) => {
    assert.ok(error instanceof IntakeError);
    assert.equal(error.code, "amount_check");
    assert.equal(error.status, 422);
    assert.equal(error.message, "준비 예산 3,000원이 맞나요? 만 원 단위를 빠뜨리셨으면 다시 넣어 주세요.");
    return true;
  });
  assert.equal((await load()).intake.answers.budget, undefined, "확인 전에는 저장하지 않는다");
  await assert.rejects(send({ action: "answer", questionId: "structure.cost", value: "3,000원" }), /매달 나가는 돈 3,000원이 맞나요/);

  await send({ action: "answer", questionId: "budget", value: 3000, confirmed: true });
  assert.equal((await load()).intake.answers.budget?.value, 3000, "[맞아요]면 그대로 저장한다");
  // 다시 적은 현실 범위 금액·0원·미정은 묻지 않고 저장한다
  await send({ action: "answer", questionId: "budget", value: "300만원" });
  assert.equal((await load()).intake.answers.budget?.value, 3_000_000);
  await send({ action: "answer", questionId: "structure.cost", value: "0" });
  await send({ action: "answer", questionId: "budget", value: null, unknown: true });
  assert.equal((await load()).intake.answers.budget?.status, "unknown");
  // 너무 큰 금액: 확인 없이 오면 멈추고, [맞아요]면 저장한다
  await assert.rejects(send({ action: "answer", questionId: "budget", value: "1000000000000" }), (error: unknown) => error instanceof IntakeError && error.code === "amount_check" && /1조 원으로 읽혔어요/.test(error.message));
  assert.equal((await load()).intake.answers.budget?.status, "unknown", "확인 전에는 저장하지 않는다");
  await send({ action: "answer", questionId: "budget", value: "1000000000000", confirmed: true });
  assert.equal((await load()).intake.answers.budget?.value, 1_000_000_000_000);
  // 읽을 수 없는 예산·시간은 무엇을 고치면 되는지 예시로 알린다(ux-editnum)
  await assert.rejects(send({ action: "answer", questionId: "budget", value: "650만원5000만원" }), /준비 예산은 '300만원'이나 '100만원~300만원'처럼/);
  await assert.rejects(send({ action: "answer", questionId: "hoursPerWeek", value: "200시간" }), /일주일에 쓸 시간은 '20시간'처럼 168시간 안에서/);
  // 사업 소개는 글자가 있어야 한다 — 이모지·기호만으로는 받지 않는다(첫 메시지도 같은 규칙)
  await assert.rejects(send({ action: "answer", questionId: "business", value: "🍪🍪🍪" }), (error: unknown) => error instanceof IntakeError && error.code === "answer_letters");
  await assert.rejects(saveIntakeCommand(`amount-check-${randomUUID()}`, { action: "start", mode: "startup", questionId: "business", value: "✨✨", revision: 0, requestId: randomUUID() }), (error: unknown) => error instanceof IntakeError && error.code === "answer_letters");
  await send({ action: "answer", questionId: "business", value: "쿠키 🍪 가게" });
  assert.equal((await load()).coach.fields.find(field => field.key === "business")?.value, "쿠키 🍪 가게", "글자가 있으면 이모지가 섞여도 받는다");
  console.log(JSON.stringify({ passed: 39 }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
