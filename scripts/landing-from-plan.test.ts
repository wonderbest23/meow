import assert from "node:assert/strict";
import { landingDraftFromPlan, planLandingReadiness } from "../lib/landing/from-plan";
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
assert.equal(draft.headline, "마포 직장인을 위한 테이크아웃 드립커피"); // 받침 있음 → '을'
// 받침 없는 고객명은 '를'
assert.equal(
  landingDraftFromPlan({ ...source, answers: { ...source.answers, "market/segments": { first_target: "1인 가구" } } }).headline,
  "1인 가구를 위한 테이크아웃 드립커피",
);
// 영문 고객명은 조사를 붙일 수 없으므로 상품명만 쓴다
assert.equal(
  landingDraftFromPlan({ ...source, answers: { ...source.answers, "market/segments": { first_target: "MZ" } } }).headline,
  "테이크아웃 드립커피",
);
assert.match(draft.subheadline, /출근길에 마실 커피/, "문제와 해결이 소제목에 들어가야 한다");
assert.equal(draft.offerTitle, "테이크아웃 드립커피");
assert.match(draft.offerDescription, /텀블러 할인/);
assert.equal(draft.priceLabel, "4,000원");
assert.deepEqual(draft.proofItems, ["시범 운영 2주간 유료 고객 140명", "실제 판매·매출 발생"]);
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

console.log("landing-from-plan: all assertions passed");
