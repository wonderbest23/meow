import assert from "node:assert/strict";
import type { CoachState } from "../lib/plan-builder/coach";
import type { IntakeCommand, IntakeState, IntakeValue } from "../lib/plan-builder/intake-types";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

/*
 * AI 작업 중 '지금 하는 일' 문구(대표 결정 2026-11-17: 실제 신호만 · 쌓이는 목록).
 * 문구는 규칙이 만들고(AI 0회), 숫자는 계획서 돈 장과 같은 계산이며, 직접 답한 값만 쓰고, 결과를 약속하지 않는다.
 */
const AT = "2026-11-17T00:00:00.000Z";

async function main() {
  globalThis.fetch = () => { throw new Error("work narration tests must not fetch"); };
  const { designNarration, planNarration, nextFinishedOrder, breakEvenLine, marginLine, DESIGN_HOPES, PLAN_HOPES, NARRATION_BANNED, DESIGN_REVEAL_MS } = await import("../lib/plan-builder/work-narration");
  const { narrationFacts, narrationMoney } = await import("../lib/plan-builder/work-narration-facts");
  const { emptyCoach } = await import("../lib/plan-builder/coach-job");
  const { COACH_KEY, COACH_TYPES } = await import("../lib/plan-builder/coach");
  const { INTAKE_KEY } = await import("../lib/plan-builder/intake-types");
  const { createIntake, applyIntakeAnswer } = await import("../lib/plan-builder/intake-core");
  const { intakeFinancialTable } = await import("../lib/plan-builder/section-service");
  const { financialTableOwner } = await import("../lib/plan-builder/blueprint");

  // 1) 희망 한마디: 숫자 없이, 약속하는 말 없이
  for (const hope of [...DESIGN_HOPES, ...Object.values(PLAN_HOPES)]) {
    assert.ok(!NARRATION_BANNED.test(hope), `no guarantee words: ${hope}`);
    assert.ok(!/\d/.test(hope), `no numbers in a hope line: ${hope}`);
  }

  // 2) 사업 방향 정리: 접수 전에는 첫 줄 + '요청을 받았어요', 실행 중에는 사실이 3초마다 하나씩 쌓이고 맨 아래는 AI가 하는 일
  const facts = { guide: "반찬·도시락 가게", money: { unit: "가구", perUnit: 18_000, vat: false, breakEven: 46, reach: 60, reachWord: "생각한 판매량" } };
  const queued = designNarration({ status: null, elapsedMs: 0, answered: 11, facts });
  assert.deepEqual(queued.lines.map(line => [line.text, line.state]), [["답변 11개를 모았어요", "done"], ["요청을 받았어요. 곧 정리를 시작해요", "active"]]);
  const early = designNarration({ status: "running", elapsedMs: DESIGN_REVEAL_MS + 10, answered: 11, facts });
  assert.deepEqual(early.lines.map(line => line.id), ["answers", "guide", "writing"]);
  const all = designNarration({ status: "running", elapsedMs: 60_000, answered: 11, facts });
  assert.deepEqual(all.lines.map(line => line.text), ["답변 11개를 모았어요", "‘반찬·도시락 가게’ 업종 기준을 찾았어요", "한 가구에 18,000원 남아요", "본전은 한 달 46가구", "고객·문제·돈 버는 구조를 한 장으로 묶고 있어요"]);
  assert.equal(all.lines[3].note, "생각한 판매량(60가구) 안에 들어오는 숫자예요");
  assert.equal(all.lines.filter(line => line.state === "active").length, 1, "only the AI step spins");
  assert.equal(all.lines.at(-1)!.state, "active");
  assert.ok(DESIGN_HOPES.includes(all.hope!));
  // 신호가 없으면 줄을 지어내지 않는다
  const bare = designNarration({ status: "running", elapsedMs: 60_000, answered: 0, facts: null });
  assert.deepEqual(bare.lines.map(line => line.id), ["writing"]);
  // 오래 걸리면 그렇다고 말한다
  assert.equal(designNarration({ status: "running", elapsedMs: 50_000, answered: 3, facts: null, slow: { seconds: 50 } }).hope, "평소보다 오래 걸리고 있어요 · 50초. 답변은 저장돼 있어요.");

  // 3) 숫자의 한마디: 닿으면 '들어오는 숫자', 넘으면 그대로 말하고 바꿀 자리, 견줄 양이 없으면 '첫 목표', 손해면 손해
  assert.equal(breakEvenLine({ ...facts.money, reach: 30 })!.note, "생각한 판매량(30가구)보다 많아요. 가격과 비용을 함께 다시 볼 자리예요");
  assert.equal(breakEvenLine({ ...facts.money, reach: null, reachWord: null })!.note, "이 숫자가 첫 목표가 돼요");
  assert.equal(breakEvenLine({ ...facts.money, breakEven: null }), null);
  assert.equal(marginLine({ ...facts.money, perUnit: -2_000 }), "지금 값으로는 한 가구마다 2,000원 손해예요");
  assert.equal(breakEvenLine({ ...facts.money, perUnit: -2_000 }), null, "no break-even line when every sale loses money");
  assert.equal(marginLine({ ...facts.money, vat: true }), "부가세까지 빼면 한 가구에 18,000원 남아요");

  // 4) 계획서 작성: 0장 → 뼈대, 쓰는 중 → 다 쓴 장(✓, 본 순서) + 남은 장, 돈 장은 계산값, 멈추면 지금 줄과 한마디 없음
  const sections = [
    { key: "company/overview", title: "회사 소개", done: false },
    { key: "market/analysis", title: "시장 분석", done: false },
    { key: "financials/revenue", title: "매출 계획", done: false },
    { key: "marketing/plan", title: "마케팅 계획", done: false },
    { key: "summary/executive", title: "요약", done: false },
  ];
  const start = planNarration({ total: 5, sections, finishedOrder: [], stalled: false, facts, moneyKey: "financials/revenue", reviewed: true });
  assert.deepEqual(start.lines.map(line => line.text), ["5개 항목의 뼈대를 세우고 첫 항목을 쓰고 있어요"]);
  assert.equal(start.lines[0].note, "항목마다 답과 맞는지 검토한 뒤 저장해요");
  assert.equal(start.hope, PLAN_HOPES.start);
  const half = sections.map(section => ({ ...section, done: ["market/analysis", "financials/revenue", "company/overview"].includes(section.key) }));
  const order = nextFinishedOrder(nextFinishedOrder([], sections.map(section => ({ ...section, done: section.key === "market/analysis" }))), half);
  assert.deepEqual(order, ["market/analysis", "company/overview", "financials/revenue"], "already-seen sections keep their place, new ones follow in document order");
  const mid = planNarration({ total: 5, sections: half, finishedOrder: order, stalled: false, facts, moneyKey: "financials/revenue", reviewed: true });
  assert.deepEqual(mid.lines.map(line => [line.text, line.state]), [
    ["‘시장 분석’을 다 썼어요", "done"], ["‘회사 소개’를 다 썼어요", "done"], ["돈 계획을 썼어요 — 본전은 한 달 46가구", "done"],
    ["지금 ‘마케팅 계획’을 쓰고 있어요", "active"],
  ]);
  assert.equal(mid.lines.at(-1)!.note, "남은 1개 항목도 이어서 써요 · 항목마다 답과 맞는지 검토한 뒤 저장해요");
  assert.equal(mid.hope, PLAN_HOPES.half);
  const compact = planNarration({ total: 5, sections: half, finishedOrder: order, stalled: false, facts, moneyKey: "financials/revenue", maxDone: 2 });
  assert.equal(compact.lines[0].text, "앞서 1개 항목을 썼어요");
  assert.equal(compact.lines.at(-1)!.note, "남은 1개 항목도 이어서 써요", "no review claim for plans that do not go through the section review");
  const last = planNarration({ total: 5, sections: sections.map(section => ({ ...section, done: section.key !== "summary/executive" })), finishedOrder: [], stalled: false });
  assert.equal(last.lines.at(-1)!.text, "마지막으로 ‘요약’을 쓰고 있어요");
  assert.equal(last.lines.at(-1)!.note, undefined);
  assert.equal(last.hope, PLAN_HOPES.late);
  const noMoney = planNarration({ total: 5, sections: half, finishedOrder: order, stalled: false, facts: { guide: null, money: null }, moneyKey: "financials/revenue" });
  assert.ok(noMoney.lines.some(line => line.text === "‘매출 계획’을 다 썼어요"), "without a computed number the money chapter is named like any other");
  const stalled = planNarration({ total: 5, sections: half, finishedOrder: order, stalled: true, facts, moneyKey: "financials/revenue" });
  assert.ok(stalled.lines.every(line => line.state === "done") && stalled.hope === null);
  for (const narration of [queued, early, all, start, mid, last]) for (const line of narration.lines) assert.ok(!NARRATION_BANNED.test(line.text + (line.note ?? "")), line.text);

  // 5) 사실은 계획서 돈 장과 같은 숫자, 직접 답한 값만
  let serial = 0;
  function startupPlan(values: Array<[string, IntakeValue]>) {
    const coach: CoachState = emptyCoach();
    coach.stage = "startup"; coach.business.stage = "사업 기획";
    const intake: IntakeState = createIntake(coach, "startup", AT);
    intake.detailsRequested = true;
    const plan: ServerPlan = { id: "plan-narration", title: "반찬 정기배송", planType: COACH_TYPES.startup, createdAt: AT, updatedAt: AT, sections: {}, answers: { [COACH_KEY]: { state: coach }, [INTAKE_KEY]: { state: intake } } };
    for (const [questionId, value] of values) {
      const command: IntakeCommand = { action: "answer", revision: coach.revision, requestId: `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`, questionId, value };
      applyIntakeAnswer(plan, coach, intake, command, AT);
    }
    return { plan, coach, intake };
  }
  const full = startupPlan([["business", "맞벌이 가정 반찬 정기배송"], ["industry", "food_beverage"], ["price", 30000], ["structure.unitCost", 12000], ["structure.cost", 800000], ["capacity", "대표자 혼자 / 일주일 30건"]]);
  const money = narrationMoney(full.coach, full.intake);
  assert.ok(money && money.breakEven && money.perUnit > 0, JSON.stringify(money));
  assert.equal(money!.vat, true, "the per-unit margin is after VAT, like the money chapter");
  const owner = financialTableOwner(full.plan.planType)!;
  const table = intakeFinancialTable(full.plan, full.coach, owner) ?? "";
  assert.ok(table.includes(`${money!.breakEven!.toLocaleString("ko-KR")}${money!.unit}`), `the money chapter shows the same break-even (${money!.breakEven}${money!.unit}):\n${table.slice(0, 1200)}`);
  assert.ok(table.includes(money!.perUnit.toLocaleString("ko-KR")), "the money chapter shows the same per-unit margin");
  assert.ok(money!.reach && money!.reachWord?.startsWith("감당할 수 있는"), "a directly answered capacity is the comparison");
  // 업종 가이드는 사업 방향 정리 지시문과 같은 것
  const { businessProfile } = await import("../lib/plan-builder/business-launch");
  assert.equal(narrationFacts(full.coach, full.intake).guide, businessProfile(full.plan).playbook?.name ?? null);
  // 업종 기준값으로 먼저 채운 초안 숫자(basis proposal)는 쓰지 않는다
  const drafted = startupPlan([["business", "맞벌이 가정 반찬 정기배송"], ["industry", "food_beverage"], ["price", 30000], ["structure.unitCost", 12000], ["structure.cost", 800000]]);
  for (const field of drafted.coach.fields) if (field.key === "price") field.basis = "proposal";
  assert.equal(narrationMoney(drafted.coach, drafted.intake), null, "drafted numbers are not narrated");
  const fixedDrafted = startupPlan([["business", "맞벌이 가정 반찬 정기배송"], ["industry", "food_beverage"], ["price", 30000], ["structure.unitCost", 12000], ["structure.cost", 800000]]);
  for (const field of fixedDrafted.coach.fields) if (field.key === "cost") field.basis = "proposal";
  const marginOnly = narrationMoney(fixedDrafted.coach, fixedDrafted.intake);
  assert.ok(marginOnly && marginOnly.breakEven === null, "a drafted monthly cost keeps the margin line but no break-even");
  // 값이 빠지면 지어내지 않는다
  assert.equal(narrationMoney(startupPlan([["business", "반찬 정기배송"], ["price", 30000]]).coach, startupPlan([["business", "반찬 정기배송"], ["price", 30000]]).intake), null);

  console.log("work narration: ok");
}

main().catch(error => { console.error(error); process.exit(1); });
