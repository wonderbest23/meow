import assert from "node:assert/strict";
import { localSuggestions, rankedSectors } from "../lib/plan-builder/local-suggestions";
import { SUGGESTION_FIELDS } from "../lib/plan-builder/answer-suggestion-fields";
import type { ProposalSector } from "../lib/plan-builder/proposal-blueprint";

/*
 * 자체 추천(AI 없음)이 AI 추천과 같은 모양으로, 업종이 섞인 설명에서도 '범용' 표로 떨어지지 않는지 본다.
 * 실제 사용자 설명을 흉내 낸 10가지 — 업종 하나가 분명한 것, 둘이 섞인 것, 아주 짧은 것.
 */
const cases: Array<[string, ProposalSector[]]> = [
  ["동네에서 작은 카페를 열고 싶어요", ["food_beverage"]],
  ["배달 전문 반찬 가게", ["food_beverage"]],
  ["직장인 대상 영어 과외와 온라인 강의", ["education"]],
  ["소상공인 SNS 운영 대행과 사진 촬영", ["content_media", "b2b_service"]],
  ["스마트스토어에서 반려동물 간식을 팔고 싶어요", ["retail_commerce"]],
  ["카페 사장님용 예약 관리 앱 개발", ["software"]],
  ["원룸 청소와 이사 짐 정리 방문 서비스", ["local_service"]],
  ["촬영 스튜디오 겸 파티룸 대관", ["content_media", "space_hospitality"]], // 1순위는 기존 규칙(촬영) 그대로, 공간 표가 2순위로 섞인다
  ["음식점에 식자재를 정기 납품하는 배송 대행", ["logistics", "food_beverage"]],
  ["카페", ["food_beverage"]],
];

for (const [text, expected] of cases) {
  const sectors = rankedSectors(text);
  assert.equal(sectors[0], expected[0], `${text}: 1순위 업종`);
  for (const sector of expected) assert.ok(sectors.includes(sector), `${text}: ${sector} 가 순위에 있어야 함(${sectors.join(",")})`);
  assert.ok(!sectors.includes("general"), `${text}: 범용 표로 떨어지지 않음`);
  const picks = localSuggestions(text, "startup");
  for (const field of SUGGESTION_FIELDS) {
    assert.equal(picks[field]?.length, 3, `${text}: ${field} 추천 3개`);
    assert.equal(new Set(picks[field]).size, 3, `${text}: ${field} 중복 없음`);
  }
}

// 설명 단어와 겹치는 문구가 앞으로 — "배달"이 있으면 배달 고객·배달앱이 위로
const delivery = localSuggestions("배달 전문 반찬 가게", "startup");
assert.equal(delivery.customer?.[0], "배달로 식사하는 1인 가구");
assert.ok(delivery.channel?.includes("배달앱(배민·쿠팡이츠)"), "판매 경로는 업종 칩(배달앱)이 공통 칩보다 먼저");
// 두 업종이 섞이면 2순위 표도 섞여 들어온다
const mixed = localSuggestions("소상공인 SNS 운영 대행과 사진 촬영", "startup");
assert.ok(mixed.offer?.some(item => /SNS 운영|사진/.test(item)), "콘텐츠 업종 상품");
// 아무 규칙도 안 맞으면 범용 표라도 3개는 채운다(빈자리 금지)
assert.deepEqual(rankedSectors("사람들이 돈을 모아 건물을 사는 사이트"), ["general"]);
assert.equal(localSuggestions("사람들이 돈을 모아 건물을 사는 사이트", "startup").customer?.length, 3);
// 운영 중 사업은 운영 문제 칩을 쓴다
assert.ok(localSuggestions("동네 카페를 운영합니다", "operating").problem?.some(item => /피크 시간|폐기/.test(item)));

console.log("local-suggestions: ranked sectors(10 cases, no general), 3 chips per field, keyword boost, mixed sectors, operating problems passed");
