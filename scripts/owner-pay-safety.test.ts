import assert from "node:assert/strict";
import { collectFinancialInputs, calculateFinancials } from "../lib/plan-builder/financials";
import { buildPlanBusinessContext } from "../lib/plan-builder/context/build";
import { contextForSection } from "../lib/plan-builder/context/section";
import { resolveAiIssue, followUpQuestions, gatesFor, affectedOf } from "../lib/plan-builder/review/resolution";

/*
 * 대표자 인건비(owner_pay)를 안전하게 다루는가.
 *
 * 감사보고서는 "owner_pay 가 재무 엔진에 없다"를 결함으로 적었지만, 실제 질문은
 *   owner_pay: "대표자 인건비를 계획에 포함하셨나요?"  (예/아니오)
 * 이고 금액은 staff_monthly 한 칸에 모인다 — 그 앞 질문의 도움말이
 *   has_staff_cost: "대표자 급여, 직원, 파트너 지급 포함."
 * 이라고 못박는다. 즉 대표자 급여는 이미 staff_monthly 안에 있다.
 *
 * 그러므로 이 예/아니오를 돈으로 바꿔 재무 엔진에 더하면 같은 인건비를 두 번 센다.
 * 이 테스트는 그런 구현이 다시 들어오지 못하게 막는다.
 */

const base = (): Record<string, Record<string, unknown>> => ({
  "financials/revenue": { unit_price: "45000", monthly_volume: "60" },
  "financials/expenses": { variable_per_unit: "12000", fixed_total: "1800000" },
});

const withStaff = () => ({ ...base(), "financials/staffing": { has_staff_cost: "yes", staff_monthly: "1500000" } });
const calc = (a: Record<string, Record<string, unknown>>) => calculateFinancials(collectFinancialInputs(a).inputs);

function main() {
  // ── A. owner_pay 없음 → 기존 계산과 완전히 같다
  const plain = calc(base());
  assert.equal(JSON.stringify(calc(base())), JSON.stringify(plain), "A: 기준 계산이 안정적이어야 한다");

  // ── B~F. owner_pay 가 어떤 값이든 재무 숫자를 바꾸지 않는다 (이중계상 방지)
  for (const value of ["yes", "no", "예", "아직 모르겠어요", "1500000", "월 150만원", ""]) {
    const a = base();
    a["financials/staffing"] = { owner_pay: value };
    assert.equal(
      JSON.stringify(calc(a)),
      JSON.stringify(plain),
      `owner_pay="${value}" 가 재무 계산을 바꾸면 안 된다 — 금액은 staff_monthly 한 곳에서만 센다`,
    );
    const { inputs } = collectFinancialInputs(a);
    assert.equal(inputs.monthlyFixedCost, collectFinancialInputs(base()).inputs.monthlyFixedCost, `owner_pay="${value}" 가 고정비에 섞이면 안 된다`);
  }

  // ── E. 직원 인건비는 별도로, 정상적으로 반영된다
  const staffed = collectFinancialInputs(withStaff());
  assert.equal(staffed.staffIncluded, true, "E: 인건비 금액이 있으면 반영 표시가 켜져야 한다");
  assert.ok(
    staffed.inputs.monthlyFixedCost! > collectFinancialInputs(base()).inputs.monthlyFixedCost!,
    "E: 직원 인건비는 고정비에 더해져야 한다",
  );
  // 같은 상태에서 owner_pay 를 켜도 금액은 그대로 — 두 번 세지 않는다
  const both = withStaff();
  (both["financials/staffing"] as Record<string, unknown>).owner_pay = "yes";
  assert.equal(
    collectFinancialInputs(both).inputs.monthlyFixedCost,
    staffed.inputs.monthlyFixedCost,
    "F: staff_monthly 와 owner_pay 가 함께 있어도 인건비를 두 번 세면 안 된다",
  );

  // ── owner_pay 답이 문서에는 실제로 반영된다 (답했는데 아무것도 안 바뀌는 상태 제거)
  /* 실행요약은 이 사실을 인용하지 않으므로 대상에서 뺐다 — RESOLUTION_TARGETS.owner_pay 주석 참고 */
  for (const section of ["financials/staffing", "financials/expenses", "financials/financing"]) {
    const yes = base(); yes["financials/staffing"] = { owner_pay: "yes" };
    const no = base(); no["financials/staffing"] = { owner_pay: "no" };
    const render = (a: Record<string, Record<string, unknown>>) =>
      JSON.stringify(contextForSection(section, buildPlanBusinessContext({ business: {}, answers: a })));
    assert.notEqual(render(yes), render(no), `${section}: owner_pay 답이 맥락에 반영돼야 한다`);
  }

  // ── 인건비 지적은 '금액 칸'부터 묻는다
  const issue = resolveAiIssue(
    {
      id: "i1", severity: "warning", category: "finance", sectionKey: "financials/expenses",
      title: "사업주 노동의 기회비용 미반영",
      problem: "손익분기 계산에 대표자 인건비가 빠져 있다",
      evidence: "고정비 180만원에 인건비 항목이 없음",
      recommendation: "대표자 인건비를 반영해 실질 순수익을 재계산하세요",
      requiresUserInput: true, autoFixable: false, origin: "ai",
    } as never,
    new Set<string>(),
  );
  assert.equal(issue.type, "answer", "인건비 지적은 질문으로 이어져야 한다");
  const ids = (issue.slots ?? []).map((s) => s.id);
  assert.ok(ids.includes("staff_monthly"), `금액 칸을 먼저 물어야 한다 — 실제: ${ids.join(",")}`);
  assert.equal(ids[0], "staff_monthly", "금액 칸이 첫 질문이어야 한다");

  // 그 질문에 답하면 고정비가 실제로 움직인다
  const q = followUpQuestions(issue, base());
  assert.ok(q.length > 0, "보완 질문이 나와야 한다");
  const answered = base();
  for (const ref of issue.slots ?? []) {
    for (const g of gatesFor(ref)) answered[g.sectionKey] = { ...(answered[g.sectionKey] ?? {}), [g.qid]: g.value };
  }
  answered["financials/staffing"] = { ...(answered["financials/staffing"] ?? {}), staff_monthly: "1500000" };
  assert.ok(
    collectFinancialInputs(answered).inputs.monthlyFixedCost! > collectFinancialInputs(base()).inputs.monthlyFixedCost!,
    "인건비 보완에 답하면 고정비가 실제로 늘어야 한다",
  );
  assert.ok(affectedOf(issue).length > 0, "다시 쓸 섹션이 지정돼야 한다");
  assert.ok(affectedOf(issue).includes("financials/expenses"), "비용 섹션이 다시 쓸 대상이어야 한다");

  console.log("owner-pay-safety: 이중계상 없음 · 재무 숫자 불변 · 답변은 문서에 반영 · 인건비 지적은 금액 칸부터");
}

main();
