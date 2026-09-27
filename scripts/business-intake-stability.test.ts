import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { typedEntryCommand, needsEntryConfirmation, emptyDraft, parseDraft } from "../app/plan/chat/intake-ui/model";
import { saveIntakeCommand } from "../lib/plan-builder/intake-service";
import { loadPlanState } from "../lib/plan-builder/plan-server-store";
import { confirmedIntakeContext } from "../lib/plan-builder/intake-context";
import { intakeStructureBrief } from "../lib/plan-builder/intake-structure-brief";
import { allCandidateIdeas, createIntake, intakeQuestions } from "../lib/plan-builder/intake-core";
import { emptyCoach } from "../lib/plan-builder/coach-job";
import { intakeFeatureEnabled, type IntakeCommand, type IntakeValue } from "../lib/plan-builder/intake-types";
import { calculateFinancials, projectYears } from "../lib/plan-builder/financials";
import { candidateConditionFit, candidateTemplateFacts, selectedStartConditions } from "../lib/plan-builder/intake-candidate-constraints";
import { ksicStructure } from "../lib/plan-builder/ksic";

Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", RATE_LIMIT_BACKEND: "memory", PLAN_ACCOUNT_LINKING_ENABLED: "false", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN"); };
let failures = 0;
async function check(name: string, run: () => unknown) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`); }
}

async function financial(occupancy: number | null | undefined, revenue: "rental" | "per_hour" | "subscription" | "commission" | "project" = "rental", volume?: number) {
  const owner = `stability-${randomUUID()}`;
  let result = await saveIntakeCommand(owner, { action: "start", mode: "startup", requestId: randomUUID(), revision: 0, questionId: "business", value: "합성 공간 대여 사업" });
  const send = async (command: Partial<IntakeCommand> & Pick<IntakeCommand, "action">) => {
    result = await saveIntakeCommand(owner, { ...command, requestId: randomUUID(), revision: result.snapshot.coach.revision, planId: result.plan.id });
  };
  const answer = (questionId: string, value: IntakeValue, unknown = false) => send({ action: "answer", questionId, value, unknown });
  await answer("industry", "space_hospitality");
  await send({ action: "structure", structure: { revenue } });
  await answer("price", 10000);
  await answer("capacity", "한 달 100건");
  await send({ action: "details" });
  await answer("structure.unitCost", 1000);
  await answer("structure.cost", 500000);
  if (volume !== undefined) {
    await send({ action: "message", message: `월 예상 판매량: ${volume}` });
    await send({ action: "confirm-extraction", candidateIds: result.snapshot.intake.candidates.filter(c => c.fieldKey === "volume").map(c => c.id) });
  }
  const id = { rental: "structure.occupancy", per_hour: "structure.billableHours", subscription: "structure.retentionMonths", commission: "structure.takeRate", project: "structure.salesCycleDays" }[revenue];
  if (occupancy !== undefined) await answer(id, occupancy, occupancy === null);
  const stored = (await loadPlanState(owner)).plans.find(p => p.id === result.plan.id)!;
  return { result, stored, context: confirmedIntakeContext(stored.answers), brief: intakeStructureBrief(result.snapshot.coach, result.snapshot.intake as Parameters<typeof intakeStructureBrief>[1]) };
}

async function main() {
  await check("feature flag is explicit on/off without changing configuration", () => {
    const previous = process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2;
    try {
      for (const [value, expected] of [["1", true], ["0", false], ["true", false], ["", false]] as const) {
        process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 = value;
        assert.equal(intakeFeatureEnabled(), expected);
      }
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2;
      else process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 = previous;
    }
  });
  await check("A entry intent scopes negation to operation", () => {
    for (const text of ["카페를 운영 중이에요", "카페를 운영 중인데 아직 적자예요", "카페를 운영 중이며 2호점도 계획하고 있어요", "공방을 운영하고 있지만 아직 홍보 계획은 없어요"]) {
      assert.equal(needsEntryConfirmation(text), false, text);
      assert.equal(typedEntryCommand(text).mode, "operating", text);
      assert.equal(typedEntryCommand(text).value, text);
    }
    for (const text of ["아직 운영하고 있지 않아요. 창업을 준비 중이에요", "카페를 운영 중이 아니고 준비하고 있어요", "매장은 아직 운영하지 않고 있어요", "카페를 운영하고 있는 건 아니에요"]) assert.notEqual(typedEntryCommand(text).mode, "operating", text);
    for (const text of ["아이디어가 없어서 추천받고 싶어요", "아직 사업 아이디어를 못 정해서 찾고 있어요", "사업 아이디어를 추천해 주세요"]) {
      assert.equal(needsEntryConfirmation(text), false, text);
      const command = typedEntryCommand(text);
      assert.equal(command.mode, "exploring", text);
      assert.equal(command.questionId, undefined);
      assert.equal(command.value, undefined);
    }
    for (const text of ["친구가 카페를 운영 중인데 저는 뭘 할까요", "카페를 운영 중이고 다른 사업 아이디어를 찾고 있어요", "카페를 운영 중이고 별도로 새로운 사업을 준비해요", "예전에 가게를 운영했어요", "아이디어가 없는 건 아니에요"]) assert.equal(needsEntryConfirmation(text), true, text);
    for (const [text, mode] of [["아이디어가 없어요", "exploring"], ["생각한 사업이 있어요", "startup"], ["사업을 운영 중이에요", "operating"]]) assert.equal(typedEntryCommand(text).mode, mode);
  });
  await check("A exploration text is a saved note, not a confirmed business", async () => {
    const text = "아이디어가 없어서 추천받고 싶어요";
    const command = typedEntryCommand(text);
    const saved = await saveIntakeCommand(`entry-${randomUUID()}`, { ...command, requestId: randomUUID(), revision: 0 });
    assert.equal(saved.snapshot.coach.stage, "exploring");
    assert.equal(saved.snapshot.coach.fields.some(f => f.key === "business"), false);
    assert(saved.snapshot.intake.notes.some(n => n.text === text));
  });
  for (const [rate, revenue, profit] of [[0, "0", "-6,000,000"], [50, "6,000,000", "-600,000"], [100, "12,000,000", "4,800,000"]] as const) {
    await check(`B rental ${rate}% through save/snapshot/brief/context`, async () => {
      const { result, context, brief } = await financial(rate);
      const summary = result.snapshot.financialSummary;
      assert.match(summary, new RegExp(`12개월 합계: 매출 ${revenue}원`));
      assert.match(summary, new RegExp(`영업손익 ${profit}원`));
      assert(summary.includes(`이용률 ${rate}%`));
      assert.equal(brief.financialScenario, summary);
      assert(context.includes(JSON.stringify(summary).slice(1, -1)), "final context includes the exact scenario");
      if (rate === 0) assert(!summary.includes("12,000,000원"));
    });
  }
  await check("B unknown occupancy is not 100%", async () => {
    for (const occupancy of [undefined, null]) {
      const { result } = await financial(occupancy);
      assert(!result.snapshot.financialSummary.includes("12,000,000원"));
      assert.match(result.snapshot.financialSummary, /이용률.*미정|이용률.*확인|이용률.*미입력/);
    }
  });
  await check("B explicit expected sales are not multiplied twice", async () => {
    const { result } = await financial(50, "rental", 30);
    assert.match(result.snapshot.financialSummary, /12개월 합계: 매출 3,600,000원/);
  });
  await check("B zero billable hours do not fall back to maximum capacity", async () => {
    const { result } = await financial(0, "per_hour");
    assert.match(result.snapshot.financialSummary, /12개월 합계: 매출 0원/);
  });
  await check("B field-specific numeric bounds and finite calculations", async () => {
    for (const invalid of [-1, 101, Infinity]) await assert.rejects(() => financial(invalid));
    await assert.rejects(() => financial(169, "per_hour"));
    await assert.rejects(() => financial(0, "subscription"));
    const commission = await financial(0, "commission");
    assert.match(commission.result.snapshot.financialSummary, /수수료율 0%.*역산하지/);
    assert(!/Infinity|NaN/.test(commission.context));
    const cycle = await financial(0, "project");
    assert.match(cycle.result.snapshot.financialSummary, /문의→계약 0일/);
    const base = { unitPrice: 10000, unitVariableCost: 1000, monthlyFixedCost: 500000, startingVolume: 0 };
    assert.equal(calculateFinancials(base).yearTotal?.operatingProfit, -6000000);
    assert.equal(projectYears(base)[0].operatingProfit, -6000000);
    assert.equal(calculateFinancials({ ...base, startingVolume: undefined }).yearTotal, null);
    assert.equal(calculateFinancials({ ...base, startingVolume: 10, monthlyCapacity: 0 }).yearTotal?.revenue, 0);
    assert.equal(projectYears({ ...base, startingVolume: 10, monthlyCapacity: 0 })[0].revenue, 0);
  });
  await check("C pending structure restore and strict boundaries", async () => {
    const owner = `draft-${randomUUID()}`;
    const saved = await saveIntakeCommand(owner, { action: "start", mode: "startup", requestId: randomUUID(), revision: 0 });
    const command: IntakeCommand = { action: "structure", structure: { revenue: "rental" }, planId: saved.plan.id, revision: saved.snapshot.coach.revision, requestId: randomUUID() };
    const draft = { ...emptyDraft(), ownerScope: owner, pending: { command } };
    const restored = parseDraft(JSON.stringify(draft), saved.plan.id, owner);
    assert.deepEqual(restored.pending?.command, command);
    const first = await saveIntakeCommand(owner, restored.pending!.command);
    const repeated = await saveIntakeCommand(owner, restored.pending!.command);
    assert.equal(repeated.duplicate, true);
    assert.equal(repeated.snapshot.coach.revision, first.snapshot.coach.revision);
    assert.equal(parseDraft(JSON.stringify(draft), saved.plan.id, "other-owner").pending, null);
    assert.equal(parseDraft(JSON.stringify(draft), "other-plan", owner).pending, null);
    for (const structure of [{ revenue: "invalid" }, {}, { admin: true }, null]) assert.equal(parseDraft(JSON.stringify({ ...draft, pending: { command: { ...command, structure } } }), saved.plan.id, owner).pending, null);
    await assert.rejects(() => saveIntakeCommand("other-owner", command));
    await assert.rejects(() => saveIntakeCommand(owner, { ...command, requestId: randomUUID() }));
    await assert.rejects(() => saveIntakeCommand(owner, { ...command, structure: { revenue: "subscription" } }));
  });
  await check("D combined candidates reject known conflicts", () => {
    const coach = emptyCoach(), intake = createIntake(coach, "exploring", new Date().toISOString());
    const set = (id: string, value: IntakeValue) => { intake.answers[id] = { status: "answered", value, at: new Date().toISOString(), messageId: randomUUID() }; };
    set("interest", ["food_beverage"]); set("experience", "바리스타 디저트 매장 운영"); set("conditions", ["무점포로 시작"]);
    const ideas = allCandidateIdeas(intake, coach);
    assert(!ideas.some(i => i.id === "small-cafe-dessert"));
    assert(ideas.filter(i => !i.id.startsWith("ksic:")).every(i => i.cautions.some(c => c.includes("확인 필요"))));
    set("conditions", ["무점포로 시작", "인허가 없이 시작"]);
    for (const idea of allCandidateIdeas(intake, coach)) {
      const facts = idea.id.startsWith("ksic:") ? ksicStructure(idea.id.slice(5)) ?? {} : candidateTemplateFacts(idea.id);
      assert.equal(candidateConditionFit(facts, selectedStartConditions(intake.answers.conditions.value)).conflict, false);
    }
    set("conditions", ["무점포로 시작", "매장·공간에서 제공"]);
    assert.equal(allCandidateIdeas(intake, coach).length, 0);
    assert.match(intakeQuestions(intake, coach).find(q => q.id === "candidate")?.hint ?? "", /맞는 후보.*없|조건.*확인/);
  });
  console.log(`stability results: ${failures} failed`);
  process.exitCode = failures ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
