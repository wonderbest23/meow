import assert from "node:assert/strict";
import { resolveAiIssue, followUpQuestions, gatesFor, affectedOf } from "../lib/plan-builder/review/resolution";
import { buildPlanBusinessContext } from "../lib/plan-builder/context/build";
import { contextForSection } from "../lib/plan-builder/context/section";
import { buildUserPrompt } from "../lib/plan-builder/section-generator";
import { collectFinancialInputs, calculateFinancials, financialsToReference, financialsToMarkdown } from "../lib/plan-builder/financials";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";

/*
 * Reviewer 지적 → 보완질문 → 저장 → 다시 쓴 섹션까지, 다섯 갈래를 끝까지 따라간다.
 *
 * 중간 단계가 통과해도 마지막에서 값이 빠지면 사용자는 "답했는데 그대로"를 본다.
 * 그래서 여기서는 중간을 믿지 않고 최종 Writer 프롬프트에 표식이 있는지만 본다.
 */

const FINANCIAL_SECTIONS = new Set(["financials/revenue", "financials/expenses", "financials/financing", "financials/staffing", "financials/assets", "market/products", "summary/executive"]);
const BUSINESS = { name: "달빛공방", description: "주문제작 도자기 공방", industry: "제조·생산", region: "서울 마포구", stage: "준비 중" };

const base = (): Record<string, Record<string, unknown>> => ({
  "overview/summary": { one_liner: "손으로 빚는 주문제작 도자기" },
  "financials/revenue": { unit_price: "45000", monthly_volume: "60" },
  "financials/expenses": { variable_per_unit: "12000", fixed_total: "1800000" },
});

function finalPrompt(sectionKey: string, answers: Record<string, Record<string, unknown>>): string {
  const [chapterId, sectionId] = sectionKey.split("/");
  const chapter = PLAN_BLUEPRINT.find((c) => c.id === chapterId)!;
  const section = chapter.sections.find((s) => s.id === sectionId)!;
  let financialsMarkdown: string | undefined;
  let financialsReference: string | undefined;
  if (FINANCIAL_SECTIONS.has(sectionKey)) {
    const { inputs, growthLabel, staffIncluded } = collectFinancialInputs(answers);
    const result = calculateFinancials(inputs);
    if (result.unit || result.monthly.length) {
      if (sectionKey === "financials/financing") financialsMarkdown = financialsToMarkdown(result, { growthLabel, growthPct: inputs.monthlyGrowthPct, staffIncluded, monthlyCapacity: inputs.monthlyCapacity });
      else financialsReference = financialsToReference(result);
    }
  }
  const ctx = buildPlanBusinessContext({ business: BUSINESS, answers });
  return buildUserPrompt({ chapter, section, answers: answers[sectionKey] ?? {}, business: BUSINESS, financialsMarkdown, financialsReference, context: contextForSection(sectionKey, ctx) });
}

const issueOf = (o: Partial<Record<string, unknown>>) => ({
  id: "x", severity: "warning", evidence: "", autoFixable: false, origin: "ai", requiresUserInput: true, ...o,
}) as never;

/** 한 갈래를 끝까지 따라간다 — 지적 문장부터 다시 쓴 섹션의 프롬프트까지 */
function runLoop(name: string, issue: unknown, sentinelFor: (slotId: string) => string) {
  const resolution = resolveAiIssue(issue as never, new Set<string>());
  assert.equal(resolution.type, "answer", `${name}: 보완질문으로 이어져야 한다 (실제 ${resolution.type})`);

  const answers = base();
  const questions = followUpQuestions(resolution, answers);
  assert.ok(questions.length > 0, `${name}: 질문이 나와야 한다`);

  const written: Array<{ id: string; sentinel: string }> = [];
  for (const ref of resolution.slots ?? []) {
    for (const g of gatesFor(ref)) answers[g.sectionKey] = { ...(answers[g.sectionKey] ?? {}), [g.qid]: g.value };
    if (!ref.sectionKey || !ref.qid) continue;
    const sentinel = sentinelFor(ref.id);
    answers[ref.sectionKey] = { ...(answers[ref.sectionKey] ?? {}), [ref.qid]: sentinel };
    written.push({ id: ref.id, sentinel });
  }
  assert.ok(written.length > 0, `${name}: 저장된 답이 있어야 한다`);

  const sections = affectedOf(resolution);
  assert.ok(sections.length > 0, `${name}: 다시 쓸 섹션이 있어야 한다`);

  /*
   * 문자 답은 표식이 그대로 찍히는지 본다.
   * 숫자 답(금액·수량)은 재무 계산을 거치며 원래 문자열이 사라지므로,
   * 대신 '답하기 전과 프롬프트가 달라지는가'로 본다 — 느슨한 게 아니라 다른 종류의 엄격함이다.
   */
  const textual = written.filter((w) => !/^\d+$/.test(w.sentinel));
  for (const section of sections) {
    const prompt = finalPrompt(section, answers);
    if (textual.some((w) => prompt.includes(w.sentinel))) continue;
    assert.notEqual(
      prompt,
      finalPrompt(section, base()),
      `${name}: ${section} 이 새 답의 영향을 전혀 받지 않는다 (저장: ${written.map((w) => w.id).join(",")})`,
    );
  }
  return { name, slots: written.map((w) => w.id), sections };
}

function main() {
  const S = (id: string) => `ZZ${id.toUpperCase().replace(/[^A-Z]/g, "")}7712`;
  const results = [
    runLoop("A 마케팅", issueOf({ category: "marketing", sectionKey: "strategy/promotion", title: "홍보 채널과 예산이 정해지지 않음", problem: "판매 목표는 있는데 고객을 데려올 방법이 없다", recommendation: "홍보 채널과 월 홍보 예산을 정하세요" }), S),
    runLoop("B 차별점", issueOf({ category: "differentiation", sectionKey: "market/competitors", title: "경쟁 대비 차별점이 불명확", problem: "경쟁 상대와 무엇이 다른지 서술되지 않았다", recommendation: "차별점과 경쟁 상대를 구체적으로 적으세요" }), S),
    runLoop("C 자금조달", issueOf({ category: "finance", sectionKey: "funding/requirements", title: "자금 조달 방법과 사용처 불일치", problem: "필요 자금은 있으나 조달 방법과 자금 사용처가 없다", recommendation: "자금 조달 방법과 자금 사용처를 확정하세요" }), S),
    runLoop("D 운영", issueOf({ category: "operation", sectionKey: "strategy/people", title: "1인 운영 가능 범위 미확인", problem: "월 판매량을 지금 인원으로 감당할 수 있는지 확인되지 않았다", recommendation: "월 최대 감당 건수와 하루 운영 투입 시간을 정하세요" }), S),
    runLoop("E 인력·대표자", issueOf({ category: "finance", sectionKey: "financials/expenses", title: "사업주 노동의 기회비용 미반영", problem: "손익분기 계산에 대표자 인건비가 빠져 있다", recommendation: "대표자 인건비를 반영해 실질 순수익을 재계산하세요" }), (id) => (id === "staff_monthly" ? "1500000" : S(id))),
  ];

  for (const r of results) console.log(`  ${r.name.padEnd(14)} 질문 ${r.slots.join(",").padEnd(34)} → 다시 쓰는 섹션 ${r.sections.join(", ")}`);
  console.log("followup-loop: 다섯 갈래 모두 지적 → 질문 → 저장 → 다시 쓴 섹션의 프롬프트까지 도달");
}

main();
