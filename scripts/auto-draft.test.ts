import assert from "node:assert/strict";
import { deriveAutoDraftContext } from "../lib/auto-draft";

const startup = deriveAutoDraftContext({
  title: "창업해주는플랫폼",
  oneLiner: "창업해주는플랫폼",
  customer: "첫 기획 단계에서 확인할 초기 고객",
});

assert.equal(startup.customer.includes("예비 창업자"), true);
assert.equal(startup.coreOutcome.includes("사업 실행안"), true);
assert.equal(startup.offerTiers.length, 3);
assert.equal(startup.offerTiers[1].name, "맞춤 사업 실행 설계");
assert.equal(startup.nameCandidates.includes("오늘창업"), true);
assert.equal(startup.slogans.length >= 3, true);

const general = deriveAutoDraftContext({
  title: "반려동물 산책 연결",
  oneLiner: "바쁜 보호자와 검증된 산책 도우미를 연결합니다.",
  customer: "서울의 1인 반려가구",
});

assert.equal(general.customer, "서울의 1인 반려가구");
assert.equal(general.offerTiers.length, 3);
assert.equal(general.headline.includes("산책 도우미"), true);

const inferredCustomer = deriveAutoDraftContext({
  title: "예약 문의 자동 정리",
  oneLiner: "동네 소상공인의 예약 문의를 자동으로 정리해주는 온라인 서비스",
  customer: "첫 기획 단계에서 확인할 초기 고객",
});

assert.equal(inferredCustomer.customer, "동네 소상공인");
assert.equal(inferredCustomer.problem.includes("동네 소상공인"), true);

const sentenceIdea = deriveAutoDraftContext({
  title: "오래된 공동주택의 에너지 문제 해결 연결소",
  oneLiner: "세대별로 보이지 않는 에너지 낭비를 전문가와 연결해 작은 개선 행동으로 전환합니다.",
  customer: "개인·공공·지역",
});

assert.equal(sentenceIdea.customer.includes("개인·공공"), false);
assert.equal(sentenceIdea.problem.includes("습니다.와"), false);
assert.equal(sentenceIdea.coreOutcome.includes("습니다.를"), false);
assert.equal(sentenceIdea.problem.includes("오래된 공동주택의 에너지"), true);

console.log("auto-draft.test.ts passed");
