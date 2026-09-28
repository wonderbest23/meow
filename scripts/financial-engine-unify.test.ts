import assert from "node:assert/strict";
import type { CoachState } from "../lib/plan-builder/coach";
import type { IntakeCommand, IntakeState, IntakeValue } from "../lib/plan-builder/intake-types";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

/*
 * 손익 계산 단일화(2026-09-28): 진단 계획 하나에서 질문 화면 요약·AI 사업안 맥락·문서 요약·12개월 손익표가
 * 같은 판매량(운영 중: 실적 매출 ÷ 기간 ÷ 가격)을 쓰는지 확인한다. AI·네트워크 호출 없음.
 */
const AT = "2026-09-28T00:00:00.000Z";

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("financial engine tests must not fetch"); };
  try {
    const { emptyCoach } = await import("../lib/plan-builder/coach-job");
    const { COACH_KEY, COACH_TYPES, coachContext, coachFinancialReference } = await import("../lib/plan-builder/coach");
    const { INTAKE_KEY } = await import("../lib/plan-builder/intake-types");
    const { createIntake, applyIntakeAnswer, intakeFinancialReference, planFinancialReference, intakeScenarioInputs } = await import("../lib/plan-builder/intake-core");
    const { buildExecutiveSummary } = await import("../lib/plan-builder/executive-summary");
    const { intakeFinancialTable } = await import("../lib/plan-builder/section-service");
    const { financialTableOwner } = await import("../lib/plan-builder/blueprint");

    let serial = 0;
    function operatingPlan(values: Array<[string, IntakeValue]>) {
      const coach: CoachState = emptyCoach();
      coach.stage = "operating"; coach.business.stage = "운영 중";
      const intake: IntakeState = createIntake(coach, "operating", AT);
      const plan: ServerPlan = { id: "plan-finance-unify", title: "동네 반찬 가게", planType: COACH_TYPES.operating, createdAt: AT, updatedAt: AT, sections: {},
        answers: { [COACH_KEY]: { state: coach }, [INTAKE_KEY]: { state: intake } } };
      for (const [questionId, value] of values) {
        const command: IntakeCommand = { action: "answer", revision: coach.revision, requestId: `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`, questionId, value };
        applyIntakeAnswer(plan, coach, intake, command, AT);
      }
      return { plan, coach, intake };
    }

    const full = operatingPlan([["business", "동네 반찬 가게"], ["industry", "food_beverage"], ["price", 10000], ["structure.unitCost", 4000],
      ["period", "2026-06-01 / 2026-08-31"], ["sales", 9000000], ["cost", 1000000], ["capacity", "대표자 혼자 / 하루 20건"]]);

    // 1) 단일 입력: 실적 기준 월 300건
    const inputs = intakeScenarioInputs(full.coach, full.intake);
    assert.ok(!("missing" in inputs)); assert.equal(inputs.volume, 300);

    // 2) AI 맥락(사업안·문서 생성)이 질문 화면과 같은 계산을 쓴다. 예전 대화 필드 계산은 판매량이 없었다.
    const reference = planFinancialReference(full.coach, full.plan.answers);
    assert.equal(reference, intakeFinancialReference(full.coach, full.intake));
    assert.ok(reference.includes("월 약 300건"), reference);
    assert.ok(!coachFinancialReference(full.coach).includes("300건"), "the legacy field-only engine had no volume");
    assert.equal(JSON.parse(coachContext(full.coach, reference)).financialScenario, reference);
    assert.equal(JSON.parse(coachContext(full.coach)).financialScenario, coachFinancialReference(full.coach), "legacy callers keep the old behaviour");

    // 3) 문서 요약: 월 운영 가정 300건, 손익분기 167건
    const summary = buildExecutiveSummary(full.plan);
    const lines = summary.blocks.flatMap(block => block.lines);
    assert.ok(lines.some(line => line.value.startsWith("300건 판매 / 매출 3,000,000원")), lines.map(line => `${line.label}: ${line.value}`).join("\n"));
    assert.ok(lines.some(line => line.label === "손익분기" && line.value.startsWith("월 167건")));

    // 4) 12개월 손익표: 손익표를 두는 섹션에만, 같은 판매량으로
    const owner = financialTableOwner(full.plan.planType)!;
    const table = intakeFinancialTable(full.plan, full.coach, owner);
    assert.ok(table && table.includes("300"), table ?? "no table");
    assert.ok(table!.includes("판매량 기준: 실적 기준 판매량"), "the table states where the volume comes from");
    assert.equal(intakeFinancialTable(full.plan, full.coach, "summary/executive"), undefined, "only the table-owner section gets the table");

    // 5) 값이 빠지면 표·판매량을 지어내지 않는다
    const partial = operatingPlan([["business", "동네 반찬 가게"], ["price", 10000], ["cost", 1000000]]);
    assert.ok("missing" in intakeScenarioInputs(partial.coach, partial.intake));
    assert.equal(intakeFinancialTable(partial.plan, partial.coach, owner), undefined);
    assert.ok(planFinancialReference(partial.coach, partial.plan.answers).includes("아직 없는 값"));

    // 6) 진단이 아닌(대화형) 계획은 기존 대화 필드 계산 그대로
    const legacy = emptyCoach();
    assert.equal(planFinancialReference(legacy, {}), coachFinancialReference(legacy));

    console.log("financial-engine-unify: shared inputs (300/month from actuals), AI context, executive summary, 12-month table owner, no invented numbers, legacy fallback passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
