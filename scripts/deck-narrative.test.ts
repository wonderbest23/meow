import assert from "node:assert/strict";
import { enrichDeckNarrative } from "../lib/delivery/deck-narrative";
import { buildPresentationSlides, type PresentationDeckInput } from "../lib/delivery/presentation-deck";
import type { LLMConfig } from "../lib/llm/complete";

const input: PresentationDeckInput = {
  deckType: "intro",
  brandName: "단골노트",
  slogan: "동네 카페의 단골을 기억하는 노트",
  title: "동네 카페 단골 관리",
  oneLiner: "태블릿으로 주문을 기록해 단골과 인기 메뉴를 자동 정리합니다.",
  customer: "전화·방문 주문을 함께 받는 동네 카페 사장",
  model: "월 구독 SaaS",
  revenue: "월 구독료",
  priceWon: 29000,
  risk: "초기 사용 습관 형성이 관건입니다.",
  accentColor: "#08775A",
  sector: "F&B/소상공인 SaaS",
  stage: "아이디어 검증",
  launchTime: "3개월 내",
  firstTest: "단골 카페 다섯 곳에 수동 정리 서비스를 제안합니다.",
  matchScore: null, marketScore: null, feasibilityScore: null,
  monthlyFixedCostWon: null, breakEvenUnits: null, totalFundingNeedWon: null,
  targetMonthlyUnits: null, variableCostPerUnit: null, contributionPerUnit: null,
  contributionMarginRate: null, breakEvenRevenueWon: null, initialInvestmentWon: null,
  runwayMonths: null, investmentAskWon: null,
  financialScenarios: [], monthlyForecast: [], fundingUses: [], marketEvidence: [],
  teamSize: null, founderStrengths: [], founderExperience: "",
  evidenceSources: [],
  traction: { interviews: 0, proposals: 0, purchases: 0, revenueWon: 0, confidenceScore: 0 },
};

const CONFIG: LLMConfig = { provider: "openai", apiKey: "sk-test", model: "gpt-x" };
const realFetch = globalThis.fetch;

// LLM을 흉내내어 요청받은 문장 개수만큼 "더 길고 안전한" 문장을 돌려준다.
// mutate 콜백으로 특정 문장에 규칙 위반(숫자 등)을 주입해 폴백을 검증한다.
function mockFetch(mutate: (line: string, index: number) => string = (l) => l) {
  let count = 0;
  globalThis.fetch = (async (_url: any, init?: any) => {
    count += 1;
    const body = JSON.parse(init.body);
    const user = body.input?.find((m: any) => m.role === "user")?.content ?? "{}";
    const lines: string[] = JSON.parse(user).lines ?? [];
    const out = lines.map((line, i) => mutate(`${line} 이 문장은 사업 맥락을 살려 다시 서술한 발표용 표현입니다.`, i));
    return new Response(JSON.stringify({ output_text: JSON.stringify({ lines: out }) }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return () => count;
}

function flattenProse(slides: ReturnType<typeof buildPresentationSlides>): string[] {
  const out: string[] = [];
  for (const s of slides) {
    for (const v of [s.lead, s.statement, s.supporting]) if (v) out.push(v);
    s.points?.forEach((p) => out.push(p.detail));
    s.steps?.forEach((st) => out.push(st.detail));
  }
  return out;
}

async function main() {
  const base = buildPresentationSlides(input);

  // 1) 정상 경로: 서술 문장은 강화되고, 제목·eyebrow·수치/출처 필드는 보존.
  const getCount = mockFetch();
  const enriched = await enrichDeckNarrative(input, base, CONFIG);
  assert.ok(getCount() >= 1, "LLM을 최소 한 번 호출해야 합니다.");
  const enrichedProse = flattenProse(enriched).join("\n");
  assert.ok(/다시 서술한 발표용 표현/.test(enrichedProse), "서술 문장이 강화 내용으로 바뀌어야 합니다.");
  // 제목/eyebrow는 원본 그대로여야 한다.
  base.forEach((slide, i) => {
    assert.equal(enriched[i].title, slide.title, `슬라이드 ${i} 제목 보존`);
    assert.equal(enriched[i].eyebrow, slide.eyebrow, `슬라이드 ${i} eyebrow 보존`);
    // metrics/sources/chart 등 수치·출처 구조는 참조가 그대로여야 한다(미변경).
    assert.deepEqual(enriched[i].metrics, slide.metrics, `슬라이드 ${i} metrics 보존`);
    assert.deepEqual(enriched[i].sources, slide.sources, `슬라이드 ${i} sources 보존`);
  });
  // 원본 slides는 변형되지 않아야 한다(불변).
  assert.notEqual(enriched, base, "새 배열을 반환해야 합니다(원본 불변).");

  // 2) 응답에 숫자가 섞이면 전체 폐기 → 원본 유지.
  mockFetch((line, i) => (i === 0 ? `${line} 매출 500만원 달성` : line));
  const withDigit = await enrichDeckNarrative(input, base, CONFIG);
  assert.deepEqual(flattenProse(withDigit), flattenProse(base), "숫자가 유입되면 원본을 유지해야 합니다.");

  // 3) 과장·단정 표현이 생기면 전체 폐기 → 원본 유지.
  mockFetch((line, i) => (i === 0 ? `${line} 업계 1위를 보장합니다` : line));
  const unsafe = await enrichDeckNarrative(input, base, CONFIG);
  assert.deepEqual(flattenProse(unsafe), flattenProse(base), "과장·허위 표현이 생기면 원본을 유지해야 합니다.");

  // 4) 키가 없으면 호출조차 하지 않고 원본을 그대로 반환.
  const getCountNoKey = mockFetch();
  const noKey = await enrichDeckNarrative(input, base, null);
  assert.equal(noKey, base, "키가 없으면 원본 배열을 그대로 반환해야 합니다.");
  assert.equal(getCountNoKey(), 0, "키가 없으면 LLM을 호출하지 않아야 합니다.");

  globalThis.fetch = realFetch;
  console.log(`deck-narrative.test.ts passed · 슬라이드 ${base.length}개 · 서술 ${flattenProse(base).length}문장 강화/보존/폴백 검증`);
}

void main();
