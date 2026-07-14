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

console.log("auto-draft.test.ts passed");
