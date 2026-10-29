import assert from "node:assert/strict";
import type { CoachState } from "../lib/plan-builder/coach";
import type { IntakeCommand, IntakeState, IntakeValue } from "../lib/plan-builder/intake-types";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

/*
 * 계획서 품질 Q3(2026-10-28) — 실제 AI 재측정(3.6/5) 검토자의 돈 지적을 고정한다. AI·네트워크 호출 없음(가짜 AI도 안 부른다).
 * (가) '한 개에 5,500원이 남는다'(9,000원 − 재료비 3,500원)가 부가세·포장·폐기·카드 수수료를 빼지 않아 낙관적 → 법정 부가세만 계산, 나머지는 '확인 필요' 칸
 * (나) 본전에 생활비가 들어간 건지 헷갈림 → 대표 결정: 생활비 질문·계산을 모두 빼고 본전은 '사업 비용만 메우는 판매량' 하나, 대신 '1개 더 팔 때 대표 몫' 한 줄
 * (다) 계약 판단 칸이 비고 관심 조사를 처리량과 비교 → 본전 판매량과 비교, 할인 원칙·통과 기준(제안)
 */
const AT = "2026-10-28T00:00:00.000Z";

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("plan quality q3 tests must not fetch"); };
  try {
    const { emptyCoach } = await import("../lib/plan-builder/coach-job");
    const { COACH_KEY, COACH_TYPES, coachContext } = await import("../lib/plan-builder/coach");
    const { INTAKE_KEY } = await import("../lib/plan-builder/intake-types");
    const { coreQuestions } = await import("../lib/plan-builder/intake-questions");
    const { createIntake, applyIntakeAnswer, planFinancialReference } = await import("../lib/plan-builder/intake-core");
    const { buildExecutiveSummary } = await import("../lib/plan-builder/executive-summary");
    const { intakeFinancialTable } = await import("../lib/plan-builder/section-service");
    const { chaptersForType, financialTableOwner } = await import("../lib/plan-builder/blueprint");
    const { buildUserPrompt, sectionSystemPrompt } = await import("../lib/plan-builder/section-generator");
    const { BUSINESS_DESIGN_RULES } = await import("../lib/plan-builder/coach-design");

    // (나) 생활비 질문은 어느 흐름에도 없다
    for (const mode of ["exploring", "startup", "operating"] as const) assert.ok(!coreQuestions(mode).some(question => question.id === "livingCost"), `${mode}: no living-cost question`);

    let serial = 0;
    function startupPlan(values: Array<[string, IntakeValue]>, fields: Array<[CoachState["fields"][number]["key"], string]> = []) {
      const coach: CoachState = emptyCoach();
      coach.stage = "startup"; coach.business.stage = "사업 기획";
      const intake: IntakeState = createIntake(coach, "startup", AT);
      const plan: ServerPlan = { id: "plan-quality-q3", title: "망원동 1인 수제 도시락", planType: COACH_TYPES.startup, createdAt: AT, updatedAt: AT, sections: {},
        answers: { [COACH_KEY]: { state: coach }, [INTAKE_KEY]: { state: intake } } };
      for (const [questionId, value] of values) {
        const command: IntakeCommand = { action: "answer", revision: coach.revision, requestId: `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`, questionId, value };
        applyIntakeAnswer(plan, coach, intake, command, AT);
      }
      for (const [key, value] of fields) {
        coach.fields = coach.fields.filter(field => field.key !== key);
        coach.fields.push({ key, value, basis: "user", quote: value, messageId: "m-test" } as CoachState["fields"][number]);
      }
      return { plan, coach, intake };
    }

    // 예전에 생활비를 답해 둔 계획: 답은 지우지 않고 계산·AI 자료에서만 뺀다
    const lunch = startupPlan([["business", "망원동 1인 수제 도시락"], ["industry", "food_beverage"]],
      [["price", "9,000원"], ["unitCost", "3,500원"], ["cost", "1,500,000원"], ["capacity", "대표자 혼자 / 하루 40개"], ["budget", "20,000,000원"], ["livingCost", "1,800,000원"]]);
    assert.ok(lunch.coach.fields.some(field => field.key === "livingCost"), "the stored answer is kept");
    const owner = financialTableOwner(lunch.plan.planType)!;
    const table = intakeFinancialTable(lunch.plan, lunch.coach, owner)!;
    const reference = planFinancialReference(lunch.coach, lunch.plan.answers);
    // (가) 한 개에 실제 남는 돈 = 9,000 − 부가세 818 − 3,500 = 4,682원, 본전 = 1,500,000 ÷ 4,682 → 월 321개(하루 약 12개)
    assert.match(table, /### 한 개에 실제 남는 돈/);
    assert.match(table, /\| 부가세 \| -818원 \|/);
    assert.match(table, /\| 포장·용기 \| 확인 필요 \|/);
    assert.match(table, /\| 팔지 못해 버리는 몫\(폐기\) \| 확인 필요 \|/);
    assert.match(table, /\| 카드·결제 수수료 \| 확인 필요 \|/);
    assert.match(table, /\*\*4,682원\*\*/);
    assert.match(table, /본전 판매량은 월 321개, 하루 약 12개/);
    assert.match(table, /낙관적인 쪽입니다/);
    assert.doesNotMatch(table, /5,500원/, "the pre-VAT margin is not shown as what is left");
    // (나) 본전 하나, 대표 몫 한 줄, 생활비 계산 없음
    assert.match(table, /본전에서 대표님이 가져가는 돈은 0원입니다\. 본전을 넘겨 1개 더 팔 때마다 약 4,682원이 대표님 몫으로 남습니다/);
    for (const text of [table, reference]) assert.doesNotMatch(text, /생활비까지|생활비선|준비 기간 생활비|1,800,000/);
    assert.match(reference, /- 손익분기: 월 321개/);
    assert.match(reference, /본전은 사업 비용\(월 고정비\)만 메우는 판매량 하나로 씁니다/);
    // 버티는 기간 = (준비 예산 − 초기 지출 − 문 열기 전 고정비 1개월분(가정, Q7)) ÷ 월 고정비
    assert.match(table, /\| 4,000,000원 \| 14,500,000원 \| 약 6개월 \| 약 9개월 \|/);
    assert.match(table, /\| 16,000,000원 \| 2,500,000원 \| 1개월도 못 버팀 \| 약 1개월 \|/);
    // 장을 쓰는 AI는 저장된 생활비를 받지 않는다
    const context = JSON.parse(coachContext(lunch.coach, reference)) as { fields: Array<{ key: string }> };
    assert.ok(!context.fields.some(field => field.key === "livingCost"));
    assert.ok(context.fields.some(field => field.key === "price"));
    // 한 장 요약도 같은 본전
    const finance = buildExecutiveSummary(lunch.plan, lunch.coach.business).blocks.find(block => block.id === "finance")!;
    assert.ok(finance.lines.some(line => line.label === "손익분기" && line.value.startsWith("월 321개")), finance.lines.map(line => `${line.label}: ${line.value}`).join("\n"));
    assert.ok(finance.lines.some(line => line.label === "산출 조건" && line.value.includes("부가세 818원")));
    assert.ok(!JSON.stringify(finance.lines).includes("생활비"));

    // (다) 계약·개업 판단: 관심 조사 결과를 본전과 같은 기간끼리, 할인 원칙·통과 기준(제안) — 321개/월 ÷ 4.3 → 일주일 약 75개
    assert.match(reference, /계약·개업 전 판단\(관심 조사 결과를 볼 때\): 적은 수량에 할인 원칙을 곱한 '예상 구매'를 처리량\(하루에 만들 수 있는 양\)이 아니라 본전 판매량과 같은 기간끼리 비교합니다/);
    assert.match(reference, /할인 원칙\(제안\): 예상 구매 = 응답마다 적은 수량 × 배수의 합 — 날짜·수량을 남긴 모르는 사람 응답 × 0\.5\(실제 구매로 이어지는 비율, 가정\), 지인·가족 응답 × 0\.25\(그 절반, 가정\), 날짜·수량 없는 응답 × 0/);
    assert.match(reference, /통과 기준\(제안\): 예상 구매가 본전\(일주일 약 75개\) 이상이고 날짜·수량을 남긴 응답 수가 위 단골 수\(쓴 횟수 가정을 함께 밝힘\) 이상이면 계약을 검토하고/);
    const chapters = chaptersForType(lunch.plan.planType);
    const find = (key: string) => {
      const [chapterId, sectionId] = key.split("/");
      const chapter = chapters.find(item => item.id === chapterId)!;
      return { chapter, section: chapter.sections.find(item => item.id === sectionId)! };
    };
    const input = (key: string) => ({ ...find(key), answers: {}, planType: lunch.plan.planType, business: lunch.coach.business, coachContext: coachContext(lunch.coach, reference), intakeContext: "" });
    assert.match(buildUserPrompt(input("summary/roadmap")), /'이 결과면 바꾼다' 칸은 비워 두지 않고, 예상 구매\(응답자가 적은 수량에 그 줄의 할인 원칙 배수를 곱해 더한 값\)를 처리량\(하루에 만들 수 있는 양\)이 아니라 본전 판매량과 같은 기간끼리 비교한/);
    const system = sectionSystemPrompt(input("financials/expenses"));
    assert.match(system, /할인 원칙을 곱한 예상 구매를 처리량\(하루에 만들 수 있는 양\)이 아니라 본전 판매량과 같은 기간끼리 비교하고/);
    assert.match(system, /본전은 사업 비용\(월 고정비\)만 메우는 판매량 하나의 뜻으로 쓰고/);
    assert.match(system, /대표 개인 생활비를 더한 판매량이나 생활비로 줄어드는 버티는 기간은 만들지 않습니다/);
    assert.match(system, /'확인 필요'로 남은 칸에 금액을 지어 넣지 않고/);
    assert.match(system, /돈 숫자\(한 건에 실제 남는 돈, 본전, 통장 흐름, 초기 지출 한도, 버티는 기간\)/);
    assert.doesNotMatch(system, /생활비까지 버는 판매량/);
    assert.match(BUSINESS_DESIGN_RULES, /처리량\(하루에 만들 수 있는 양\)을 채우는 것을 완료 기준이나 계약 판단 기준으로 쓰지 않습니다/);

    // 월 고정비를 모르면 세 가지 고정비 가정(가정 표시)으로 본전 판매량
    const noCost = startupPlan([["business", "망원동 1인 수제 도시락"], ["industry", "food_beverage"]],
      [["price", "9,000원"], ["unitCost", "3,500원"], ["capacity", "대표자 혼자 / 하루 40개"], ["budget", "20,000,000원"]]);
    const assumedTable = intakeFinancialTable(noCost.plan, noCost.coach, owner)!;
    assert.match(assumedTable, /### 월 고정비를 모를 때 본전 판매량\(가정\)/);
    assert.match(assumedTable, /\| 1,500,000원 \| 하루 약 12개 \/ 일주일 약 75개 \/ 한 달 321개 \|/);
    assert.match(planFinancialReference(noCost.coach, noCost.plan.answers), /세 가지 고정비 가정으로 계산했습니다\(가정/);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("plan-quality-q3: real unit margin with VAT and '확인 필요' rows, single break-even without living cost (stored answer ignored), owner share line, contract criteria vs break-even, fixed-cost assumptions passed");
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
