import assert from "node:assert/strict";
import { formatPriceText, landingDraftFromPlan, planLandingReadiness, resolvePlanLandingContent } from "../lib/landing/from-plan";
import { coachDocumentRevision } from "../lib/plan-builder/coach";
import { COACH_KEY, COACH_VERSION, type CoachState } from "../lib/plan-builder/coach";
import { landingDraftSchema } from "../lib/landing/domain";

// 사업계획서 답변이 홈페이지 초안으로 그대로 옮겨지는지 검증한다.
const source = {
  planTitle: "새벽커피",
  business: { name: "새벽커피", industry: "식음료", region: "서울 마포구" },
  answers: {
    "overview/summary": { city: "서울 마포구", buyer_type: ["개인 소비자 (B2C)"] },
    "overview/problem": {
      problems: ["출근길에 마실 커피를 살 곳이 마땅치 않다"],
      solutions: ["역 앞에서 6시부터 여는 테이크아웃 전용 매장"],
      why_better: "출근 동선에서 3분 안에 받을 수 있다",
    },
    "overview/achievements": {
      has_traction: "yes",
      traction_detail: "시범 운영 2주간 유료 고객 140명",
      traction_types: ["실제 판매·매출 발생"],
    },
    "market/products": {
      offer_type: ["상품(물건)"],
      main_offer: "테이크아웃 드립커피",
      offer_detail: "원두 2종 중 선택, 텀블러 할인 500원 포함",
      price_value: "4,000원",
    },
    "market/segments": {
      first_target: "마포 직장인",
      why_first: "역 이용객이 많고 출근 시간대가 몰려 있다",
    },
  },
};

const readiness = planLandingReadiness(source);
assert.equal(readiness.ready, true, "대표 상품과 첫 고객이 있으면 준비 완료여야 한다");

const draft = landingDraftFromPlan(source);
landingDraftSchema.parse(draft); // 스키마를 통과해야 저장·공개까지 갈 수 있다

assert.equal(draft.businessName, "새벽커피");
assert.equal(draft.headline, "새벽커피");
// Customer segmentation belongs in the plan, not the public business name.
assert.equal(
  landingDraftFromPlan({ ...source, answers: { ...source.answers, "market/segments": { first_target: "1인 가구" } } }).headline,
  "새벽커피",
);
// 영문 고객명은 조사를 붙일 수 없으므로 상품명만 쓴다
assert.equal(
  landingDraftFromPlan({ ...source, answers: { ...source.answers, "market/segments": { first_target: "MZ" } } }).headline,
  "새벽커피",
);
assert.match(draft.subheadline, /출근길에 마실 커피/, "문제와 해결이 소제목에 들어가야 한다");
assert.equal(draft.offerTitle, "테이크아웃 드립커피");
assert.match(draft.offerDescription, /텀블러 할인/);
assert.equal(draft.priceLabel, "4,000원");
assert.deepEqual(draft.proofItems, [], "Internal traction must not become public claims");
assert.equal(draft.benefits[0].description, "출근 동선에서 3분 안에 받을 수 있다.");
assert.equal(draft.businessAddress, "서울 마포구");
assert.ok(draft.pageData, "블록 데이터까지 만들어져야 편집 화면이 바로 뜬다");

// 아직 성과가 없으면 준비 중인 내용을 실적처럼 싣지 않는다
const noTraction = landingDraftFromPlan({
  ...source,
  answers: {
    ...source.answers,
    "overview/achievements": { has_traction: "no", prep_progress: "고객 인터뷰 12건 완료" },
  },
});
assert.deepEqual(noTraction.proofItems, [], "성과가 없으면 비어 있어야 한다");

// 계획서를 덜 썼으면 무엇이 빠졌는지 알려준다
const bare = planLandingReadiness({ planTitle: "무제", business: {}, answers: {} });
assert.equal(bare.ready, false);
assert.equal(bare.missing.length, 2);

// 최소 입력만으로도 공개 가능한 초안이 나와야 한다(빈 칸은 템플릿 기본값)
const minimal = landingDraftFromPlan({
  planTitle: "무제",
  business: {},
  answers: { "market/products": { main_offer: "출장 세차" }, "market/segments": { first_target: "아파트 입주민" } },
});
landingDraftSchema.parse(minimal);

const coach: CoachState = {
  version: COACH_VERSION, revision: 3, stage: "startup", depth: "quick", ready: true, messages: [], suggestions: [],
  business: { name: "동네사진", description: "", role: "", industry: "", region: "", stage: "사업 기획" },
  fields: [
    { key: "offer", value: "메뉴 사진 5장", basis: "user", quote: "메뉴 사진 5장", messageId: "a" },
    { key: "customer", value: "동네 음식점", basis: "user", quote: "동네 음식점", messageId: "a" },
    { key: "price", value: "5만원", basis: "proposal", quote: "", messageId: "" },
    { key: "sales", value: "지난달 매출 80만원", basis: "user", quote: "지난달 매출 80만원", messageId: "a" },
  ],
};
for (const stage of ["startup", "operating"] as const) {
  const current = {
    planTitle: "동네사진", business: { name: "다른 사업", industry: "꽃집", region: "제주" },
    answers: { [COACH_KEY]: { state: { ...coach, stage } }, "market/products": { planning_source: "사업 기획 대화의 공통 정보" } },
  };
  assert.equal(planLandingReadiness(current).ready, true, `${stage}: coach fields unlock generation`);
  const mapped = landingDraftFromPlan(current);
  landingDraftSchema.parse(mapped);
  assert.equal(mapped.businessName, "동네사진");
  assert.equal(mapped.offerTitle, "메뉴 사진 5장");
  assert.equal(mapped.priceLabel, "제안 가격 · 5만원");
  assert.equal(mapped.businessAddress, "");
  assert.equal(resolvePlanLandingContent(current).firstTarget, "동네 음식점");
  assert.ok(!JSON.stringify(mapped).includes("지난달 매출"));
  assert.ok(!JSON.stringify(mapped).includes("다른 사업"));
  const mixed = { ...current, answers: { ...source.answers, ...current.answers } };
  assert.equal(landingDraftFromPlan(mixed).offerTitle, "메뉴 사진 5장", "Latest coach field takes precedence");
  assert.equal(planLandingReadiness({ ...current, answers: { [COACH_KEY]: { state: { ...coach, fields: [] } } } }).ready, false);
}
const userPrice = structuredClone(coach);
userPrice.fields.find(item => item.key === "price")!.basis = "user";
assert.equal(landingDraftFromPlan({ ...source, answers: { [COACH_KEY]: { state: userPrice } } }).priceLabel, "5만원");

// 쉼표 없는 금액은 자릿수를 읽기 쉽게 — 연도·수량·이미 쉼표가 있는 금액은 그대로
assert.equal(formatPriceText("390000원"), "390,000원");
assert.equal(formatPriceText("월 390000 원"), "월 390,000 원");
assert.equal(formatPriceText("제안 가격 · 1200만원"), "제안 가격 · 1,200만원");
assert.equal(formatPriceText("4,000원"), "4,000원");
assert.equal(formatPriceText("2026년부터 5000원"), "2026년부터 5,000원");
assert.equal(formatPriceText("990원"), "990원");
assert.equal(formatPriceText("가격 상담"), "가격 상담");
const rawPrice = structuredClone(userPrice);
rawPrice.fields.find(item => item.key === "price")!.value = "390000원";
assert.equal(landingDraftFromPlan({ ...source, answers: { [COACH_KEY]: { state: rawPrice } } }).priceLabel, "390,000원");

// 사업 설계의 한 줄 소개가 첫 화면 큰 제목과 설명이 된다(상호는 그 위 작은 글씨로 남는다)
const designed = structuredClone(userPrice);
designed.business.name = "카페피드";
const identity = {
  headline: "동네 카페 인스타, 매달 대신 채워 드려요",
  pitch: "사진 촬영부터 업로드와 월간 리포트까지 한 번에 맡기는 카페 전용 SNS 관리",
  names: [{ name: "카페피드", why: "짧다" }, { name: "라떼로그", why: "기록" }],
};
designed.design = {
  identity, approach: "known-business", status: "proposal", sourceRevision: coachDocumentRevision(designed),
  startingPlan: { scope: "월 12회 게시", connectionToVision: "연결", whyThis: "이유", notIncluded: [] },
  alternatives: [{ name: "대안", scope: "범위", tradeoff: "장단점" }],
  assumptions: [{ statement: "가정", howToCheck: "확인" }],
  nextAction: { action: "행동", doneWhen: "완료", usableText: "문구" },
};
const withIdentity = landingDraftFromPlan({ ...source, answers: { [COACH_KEY]: { state: designed } } });
landingDraftSchema.parse(withIdentity);
assert.equal(withIdentity.businessName, "카페피드");
assert.equal(withIdentity.headline, identity.headline);
assert.equal(withIdentity.offerDescription, `${identity.pitch}.`, "상품 설명이 없으면 상품 이름을 되풀이하지 않고 사업 소개를 쓴다");
assert.equal(withIdentity.pageData?.businessContent?.headline, identity.headline);
assert.equal(withIdentity.pageData?.businessContent?.businessName, "카페피드");
// 다른 이름 후보가 든 문장은 쓰지 않는다
const otherName = structuredClone(designed);
otherName.design!.identity = { ...identity, headline: "라떼로그가 카페 인스타를 채워 드려요" };
const guarded = landingDraftFromPlan({ ...source, answers: { [COACH_KEY]: { state: otherName } } });
assert.equal(guarded.headline, "카페피드");
assert.equal(guarded.pageData?.businessContent?.headline, undefined);
// 설계 뒤에 사업 내용이 바뀌어 지난 설계가 되면 쓰지 않는다
const stale = structuredClone(designed);
stale.design!.sourceRevision -= 1;
assert.equal(landingDraftFromPlan({ ...source, answers: { [COACH_KEY]: { state: stale } } }).headline, "카페피드");

// 업종에 맞는 사진이 없으면 사진을 깔지 않는다(템플릿 기본 사진 금지)
// 업종 사진 한 벌 — 업종 이름·상호·대표 상품을 함께 보고 고른다(카페피드 → 카페 사진)
assert.match(withIdentity.heroImageUrl, /1648462908676/, "cafe name picks the cafe set");
const cafeImages = Object.values(withIdentity.pageData?.brainwave?.images ?? {});
assert.ok(new Set(cafeImages.filter(Boolean)).size >= 3, "cards, band and closing get their own photos, not the hero copied everywhere");
// 알아볼 수 없는 사업은 사진을 깔지 않는다(템플릿 기본 사진 금지)
const unknownBusiness = { planTitle: "온결", business: { name: "온결", industry: "무역업" }, answers: { "market/products": { main_offer: "원자재 수입" }, "market/segments": { first_target: "중소 제조사" } } };
// 광고 대행처럼 사무실에서 하는 일은 사무·전문직 사진
assert.match(landingDraftFromPlan({ ...unknownBusiness, business: { ...unknownBusiness.business, industry: "광고 대행업" } }).heroImageUrl, /1600880292203/);
assert.equal(landingDraftFromPlan(unknownBusiness).heroImageUrl, "");
assert.equal(landingDraftFromPlan(unknownBusiness).pageData?.businessContent?.image, "");
assert.match(landingDraftFromPlan({ ...unknownBusiness, business: { ...unknownBusiness.business, industry: "커피 전문점" } }).heroImageUrl, /unsplash/);
assert.match(landingDraftFromPlan({ ...unknownBusiness, answers: { ...unknownBusiness.answers, "market/products": { main_offer: "주 2회 국·반찬 4종 정기배송" } } }).heroImageUrl, /1498654896293/, "offer text picks the food set");
assert.match(withIdentity.slug, /^kapepideu-[0-9a-f]{4}$/);

console.log("landing-from-plan: all assertions passed");
