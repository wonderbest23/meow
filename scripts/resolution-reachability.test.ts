import assert from "node:assert/strict";
import { RESOLUTION_TARGETS } from "../lib/plan-builder/review/resolution";
import { buildPlanBusinessContext } from "../lib/plan-builder/context/build";
import { contextForSection } from "../lib/plan-builder/context/section";
import { buildUserPrompt } from "../lib/plan-builder/section-generator";
import { collectFinancialInputs, calculateFinancials, financialsToReference, financialsToMarkdown } from "../lib/plan-builder/financials";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";

/*
 * 보완질문 답이 '다시 쓴다'고 선언한 섹션에 실제로 닿는가.
 *
 * 4차 테스트는 "같은 그룹의 값이 하나라도 있으면 통과"였다. 그래서 marketing.channels 만
 * 받아도 marketing.budget 이 빠진 것을 못 잡았고, 실제로는 답해도 문서가 안 바뀌는
 * 섹션이 여럿 남아 있었다.
 *
 * 그래서 여기서는 target 마다 고유한 표식 값을 넣고, 운영과 같은 조립 경로를 통과시킨 뒤
 * 최종 Writer 프롬프트 문자열 안에 '정확히 그 표식'이 있는지만 본다.
 * 같은 그룹의 다른 값이 있는 것은 통과로 치지 않는다.
 */

const FINANCIAL_SECTIONS = new Set([
  "financials/revenue", "financials/expenses", "financials/financing",
  "financials/staffing", "financials/assets", "market/products", "summary/executive",
]);

const BUSINESS = { name: "달빛공방", description: "주문제작 도자기 공방", role: "예비창업자", industry: "제조·생산", region: "서울 마포구", stage: "준비 중" };

/** 최소한의 사업 기반 — 표식이 없어도 프롬프트가 만들어지도록 */
function baseAnswers(): Record<string, Record<string, unknown>> {
  return {
    "overview/summary": { one_liner: "손으로 빚는 주문제작 도자기" },
    "financials/revenue": { unit_price: "45000", monthly_volume: "60" },
    "financials/expenses": { variable_per_unit: "12000", fixed_total: "1800000" },
  };
}

const sectionDef = (key: string) => {
  const [chapterId, sectionId] = key.split("/");
  const chapter = PLAN_BLUEPRINT.find((c) => c.id === chapterId);
  const section = chapter?.sections.find((s) => s.id === sectionId);
  return chapter && section ? { chapter, section } : null;
};

/** 운영(/api/plan/generate)과 같은 순서로 최종 프롬프트를 만든다 */
function finalPrompt(sectionKey: string, answers: Record<string, Record<string, unknown>>): string {
  const def = sectionDef(sectionKey);
  if (!def) throw new Error(`청사진에 없는 섹션: ${sectionKey}`);

  let financialsMarkdown: string | undefined;
  let financialsReference: string | undefined;
  if (FINANCIAL_SECTIONS.has(sectionKey)) {
    const { inputs, growthLabel, staffIncluded } = collectFinancialInputs(answers);
    const result = calculateFinancials(inputs);
    if (result.unit || result.monthly.length) {
      if (sectionKey === "financials/financing") {
        financialsMarkdown = financialsToMarkdown(result, { growthLabel, growthPct: inputs.monthlyGrowthPct, staffIncluded, monthlyCapacity: inputs.monthlyCapacity });
      } else {
        financialsReference = financialsToReference(result);
      }
    }
  }

  const ctx = buildPlanBusinessContext({ business: BUSINESS, answers });
  return buildUserPrompt({
    chapter: def.chapter,
    section: def.section,
    answers: answers[sectionKey] ?? {},
    business: BUSINESS,
    financialsMarkdown,
    financialsReference,
    context: contextForSection(sectionKey, ctx),
  });
}

/*
 * 재무 엔진이 읽는 칸 — collectFinancialInputs 기준.
 * 여기 값은 문자 표식으로 검사할 수 없다(parseAmount 가 숫자만 읽으므로 표식은 통째로 무시된다).
 * 대신 '값을 바꾸면 그 섹션의 최종 프롬프트가 달라지는가'로 도달을 판정한다 — 더 엄격하다.
 */
const FINANCE_QIDS = new Set(["unit_price", "monthly_volume", "variable_per_unit", "fixed_total", "staff_monthly", "growth_ceiling", "asset_cost", "owner_pay"]);

type Row = { target: string; section: string; ok: boolean; how: "표식" | "수치영향" };

function withAnswer(target: (typeof RESOLUTION_TARGETS)[string], value: string) {
  const answers = baseAnswers();
  const key = target.sectionKey ?? "";
  const qid = target.qid ?? "";
  answers[key] = { ...(answers[key] ?? {}), [qid]: value };
  for (const gate of target.gates ?? []) {
    answers[gate.sectionKey] = { ...(answers[gate.sectionKey] ?? {}), [gate.qid]: gate.value };
  }
  return answers;
}

function main() {
  const rows: Row[] = [];
  const missing: Row[] = [];

  for (const target of Object.values(RESOLUTION_TARGETS)) {
    const finance = FINANCE_QIDS.has(target.qid ?? "");
    for (const section of target.affected) {
      let ok: boolean;
      if (finance) {
        /* 두 값이 서로 다른 프롬프트를 만들어야 이 섹션이 그 값의 영향을 받는 것이다 */
        const a = finalPrompt(section, withAnswer(target, "1700000"));
        const b = finalPrompt(section, withAnswer(target, "9300000"));
        ok = a !== b;
      } else {
        const sentinel = `ZZTEST${target.id.toUpperCase().replace(/[^A-Z]/g, "")}9137`;
        ok = finalPrompt(section, withAnswer(target, sentinel)).includes(sentinel);
      }
      const row: Row = { target: target.id, section, ok, how: finance ? "수치영향" : "표식" };
      rows.push(row);
      if (!ok) missing.push(row);
    }
  }

  const byTarget = new Map<string, Row[]>();
  for (const m of missing) byTarget.set(m.target, [...(byTarget.get(m.target) ?? []), m]);

  console.log(`대상 ${Object.keys(RESOLUTION_TARGETS).length}개 · (target, 섹션) 쌍 ${rows.length}개`);
  console.log(`도달 ${rows.length - missing.length} / 미도달 ${missing.length}`);
  if (missing.length) {
    console.log("\n[미도달 — '다시 쓴다'고 선언했는데 값이 프롬프트에 닿지 않는 곳]");
    for (const [t, list] of byTarget) console.log(`  ${t.padEnd(18)} (${list[0].how}) → ${list.map((x) => x.section).join(", ")}`);
  }

  assert.equal(missing.length, 0, `보완 답변이 닿지 않는 (target, 섹션) 쌍이 ${missing.length}개 남아 있다`);
  console.log("\nresolution-reachability: 모든 보완 답변이 선언된 모든 섹션에 도달");
}

main();
