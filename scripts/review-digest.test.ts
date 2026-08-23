import assert from "node:assert/strict";
import { digestSection, buildReviewerPrompt } from "../lib/plan-builder/review/reviewer";
import { collectDeterministic } from "../lib/plan-builder/review/deterministic";

/*
 * 6만 자를 넘는 문서는 섹션을 줄여서 검토한다(digestSection).
 * 줄이면서 표·숫자·제목·출처가 사라지면 Reviewer 가 없는 사실을 근거로 문제를 만든다.
 * 계정에 6만 자 문서가 없어 fixture 로 확인한다.
 */

const URL_ = "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B040A3";

const section = [
  "## 매출 구조",
  "",
  "판매가 25,000원에 건당 변동비 11,000원을 빼면 공헌이익은 14,000원이다.",
  "이 구조는 개점 초기의 가정이며 실제 매입가에 따라 달라질 수 있다.",
  "아래 표는 시스템이 계산한 12개월 전개다.",
  "",
  "| 월 | 판매량 | 매출 | 영업손익 |",
  "| --- | ---: | ---: | ---: |",
  "| 1월 | 300 | 7,500,000원 | 1,700,000원 |",
  "| 12월 | 496 | 12,400,000원 | 5,144,000원 |",
  "",
  "### 참고 근거",
  `- 행정안전부 주민등록 인구현황 (기준일 확인 필요) — [원문](${URL_})`,
  "",
  "손익분기는 월 179건이며, 이 수치는 고정비 250만원을 전제로 한다.",
  ...Array.from({ length: 60 }, () => `이 문단은 서술 위주의 보조 설명이며 숫자를 담지 않는다 ${"가나다라마".repeat(8)}`),
].join("\n");

function main() {
  assert.ok(section.length > 1_400, "줄이기가 실제로 동작하는 길이여야 한다");
  const short = digestSection(section);
  assert.ok(short.length < section.length, "줄어들어야 한다");

  for (const must of ["## 매출 구조", "### 참고 근거", "| 1월 | 300 | 7,500,000원 | 1,700,000원 |", "| 12월 | 496 | 12,400,000원 | 5,144,000원 |", URL_, "25,000원", "14,000원", "179건"]) {
    assert.ok(short.includes(must), `줄이면서 사라지면 안 되는 것: ${must.slice(0, 40)}`);
  }
  assert.ok(short.split("보조 설명이며").length - 1 < 60, "숫자 없는 보조 서술은 줄어들어야 한다");

  // 6만 자를 넘는 문서에서 실제로 요약 경로를 타는지
  const many = Array.from({ length: 50 }, (_, i) => ({ key: `c${i}/s${i}`, title: `장 ${i} · 절 ${i}`, markdown: section }));
  const total = many.reduce((n, s) => n + s.markdown.length, 0);
  assert.ok(total > 60_000, `요약 임계를 넘겨야 한다 (실제 ${total})`);
  const business = { name: "달빛공방", description: "주문제작 도자기", industry: "제조·생산", region: "서울", stage: "준비 중" };
  const answers = {
    "financials/revenue": { unit_price: "25,000원", monthly_volume: "300" },
    "financials/expenses": { variable_per_unit: "11,000원", fixed_total: "250만원" },
  };
  const prompt = buildReviewerPrompt({
    planTitle: "테스트", planType: "창업 초기 · 사업계획서", business,
    sections: many, answers, evidence: [],
    deterministic: collectDeterministic({ answers, business, evidence: [] }),
  });
  assert.ok(prompt.length < total, "요약 경로에서 프롬프트가 원문 전체보다 짧아야 한다");
  assert.ok(prompt.includes(URL_), "요약해도 출처 주소가 남아야 한다");
  assert.ok(prompt.includes("| 1월 | 300 | 7,500,000원 | 1,700,000원 |"), "요약해도 표가 남아야 한다");

  console.log(`review-digest: 표·숫자·제목·출처 보존 확인 (섹션 ${section.length}자 → ${short.length}자, 문서 ${total}자 → 프롬프트 ${prompt.length}자)`);
}

main();
