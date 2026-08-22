import assert from "node:assert/strict";
import { planResearchContext, researchReadiness, evidenceForSection, toPromptEvidence, sectionUsesEvidence, archetypeForIndustry } from "../lib/plan-builder/market-research";
import { buildUserPrompt, formatEvidence, sectionSystemPrompt, fallbackSection } from "../lib/plan-builder/section-generator";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";
import type { MarketEvidence } from "../lib/market/domain";

/* A. 플랜 → 조사 맥락 매핑 */
const plan = {
  title: "멍케이크 클래스",
  answers: {
    "market/segments": { first_target: "반려견을 키우는 20~40대 보호자" },
    "overview/problem": { problems: ["특별한 기념일을 직접 준비하고 싶지만 만드는 법을 모름"] },
    "market/products": { main_offer: "반려견 케이크 원데이클래스" },
    "financials/revenue": { revenue_streams: ["시간·건당 요금"] },
  },
};
const business = { name: "", description: "반려견 케이크 원데이클래스", industry: "교육·강의", region: "서울특별시" };
const ctx = planResearchContext(plan, business);
assert.equal(ctx.title, "멍케이크 클래스");
assert.equal(ctx.sector, "교육·강의");
assert.equal(ctx.region, "서울특별시");
assert.equal(ctx.archetype, "professional_service");
assert.equal(ctx.customer, "반려견을 키우는 20~40대 보호자");
assert.equal(ctx.problem, "특별한 기념일을 직접 준비하고 싶지만 만드는 법을 모름");
assert.equal(ctx.model, "반려견 케이크 원데이클래스");
assert.equal(ctx.revenue, "시간·건당 요금");
assert.equal(archetypeForIndustry("카페·음식점"), "local_retail");
assert.equal(archetypeForIndustry("IT·앱·웹"), "digital_service");
assert.equal(archetypeForIndustry(undefined), "undecided");
assert.equal(planResearchContext({ title: "t", answers: {} }, { industry: "" }).region, "대한민국");

/* 입력 충분 여부 */
assert.equal(researchReadiness(ctx).ok, true);
const thin = researchReadiness(planResearchContext({ title: "t", answers: {} }, { description: "", industry: "" }));
assert.equal(thin.ok, false);
assert.ok(thin.missing.includes("업종"));
assert.match(thin.message, /입력해주세요/);

/* B. 섹션별 근거 배분 */
const ev = (o: Partial<MarketEvidence>): MarketEvidence => ({
  id: "00000000-0000-4000-8000-000000000001", sourceType: "official_report", title: "", metric: "", value: "", numericValue: null, unit: "",
  region: "서울", sourceName: "통계청", sourceUrl: "https://kosis.kr/x", observedAt: "2025-12-31", note: "", verification: "needs_review",
  verificationMethod: "none", sourceExcerpt: "", retrievedAt: "", contentHash: "", attestation: "", isDemo: false, ...o,
});
const list = [
  ev({ id: "a".repeat(8) + "-0000-4000-8000-000000000001", metric: "반려동물 양육 가구 수", value: "552만 가구", numericValue: 5520000 }),
  ev({ id: "b".repeat(8) + "-0000-4000-8000-000000000001", metric: "서울 반려동물 관련 사업체 수", value: "3,210개", numericValue: 3210 }),
  ev({ id: "c".repeat(8) + "-0000-4000-8000-000000000001", metric: "반려동물 관련 소비지출 증가율", value: "12%", numericValue: null }),
];
assert.deepEqual(evidenceForSection("market/segments", list).map((e) => e.metric), ["반려동물 양육 가구 수"]);
assert.deepEqual(evidenceForSection("market/competitors", list).map((e) => e.metric), ["서울 반려동물 관련 사업체 수"]);
assert.ok(evidenceForSection("overview/problem", list).some((e) => e.metric.includes("소비지출")));
assert.equal(evidenceForSection("financials/staffing", list).length, 0);
assert.equal(evidenceForSection("strategy/price", list).length, 0);
assert.equal(evidenceForSection("summary/executive", list).length, 3);
assert.equal(sectionUsesEvidence("financials/staffing"), false);
assert.equal(sectionUsesEvidence("market/segments"), true);

/* C. URL 안전성 — 프롬프트에는 저장된 sourceUrl 만 들어간다 */
const chapter = PLAN_BLUEPRINT[1];
const section = chapter.sections.find((s) => s.id === "segments")!;
const prompt = buildUserPrompt({ chapter, section, answers: { segments: "보호자" }, evidence: toPromptEvidence(list.slice(0, 1)) });
assert.match(prompt, /\[공식 원문 검색을 통해 확보한 시장 근거\]/);
assert.match(prompt, /https:\/\/kosis\.kr\/x/);
assert.match(prompt, /URL 을 새로 만들거나 수정하지 마세요/);
assert.match(prompt, /정부에서 검증 완료된 수치/);
assert.match(prompt, /충돌/);
const urls = prompt.match(/https?:\/\/\S+/g) ?? [];
assert.ok(urls.every((u) => u.startsWith("https://kosis.kr/x")), "프롬프트의 URL 은 저장된 것뿐이어야 한다");

/* D. 근거 없는 플랜은 예전과 동일 */
const bare = buildUserPrompt({ chapter, section, answers: { segments: "보호자" } });
assert.doesNotMatch(bare, /시장 근거/);
assert.match(bare, /위 사업 정보와 답변만 근거로/);
assert.equal(formatEvidence(undefined), "");
assert.equal(formatEvidence([]), "");
const fb = fallbackSection({ chapter, section, answers: { segments: "보호자" } });
assert.doesNotMatch(fb, /참고 근거/);
const fbEv = fallbackSection({ chapter, section, answers: { segments: "보호자" }, evidence: toPromptEvidence(list.slice(0, 1)) });
assert.match(fbEv, /### 참고 근거/);

/* 시스템 프롬프트 — 금지 원칙은 유지하되 근거 블록 예외가 있다 */
const sys = sectionSystemPrompt({ chapter, section, answers: {} });
assert.match(sys, /스스로 만들어내지 마세요/);
assert.match(sys, /시장 근거\] 블록이 제공되면/);
assert.match(sys, /sourceUrl 은 실제 검색 인용에서 확인된 주소/);

console.log(JSON.stringify({ passed: true, mapping: ctx, segments: 1, competitors: 1, staffing: 0 }, null, 2));
