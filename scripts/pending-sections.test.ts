import assert from "node:assert/strict";
import { pendingSectionKeys } from "../lib/plan-builder/pending-sections";

// 운영 테스트 계획서와 같은 모양: 섹션 9개 중 7개 완료 + 내부 저장 칸들
const answers = Object.fromEntries([
  "overview/summary", "overview/problem", "market/products", "market/personas", "strategy/distribution", "strategy/price", "strategy/promotion",
  "financials/expenses", "summary/executive", "__business_coach", "__business_intake", "__coach_generation", "intake/details",
].map(key => [key, { value: "x" }]));
const done = ["overview/summary", "overview/problem", "market/products", "market/personas", "strategy/distribution", "strategy/price", "strategy/promotion"];
const plan = { planType: "일반 사업계획서", answers, sections: Object.fromEntries(done.map(key => [key, { markdown: "본문" }])) };

// 내부 칸은 빼고, 아직 본문이 없는 문서 섹션만 센다
assert.deepEqual(pendingSectionKeys(plan).sort(), ["financials/expenses", "summary/executive"]);
// 다 만들어지면 0 — 예전엔 내부 칸 4개가 남아 "생성 중"이 사라지지 않았다
assert.deepEqual(pendingSectionKeys({ ...plan, sections: { ...plan.sections, "financials/expenses": {}, "summary/executive": {} } }), []);
// 답이 비어 있는 섹션은 만들 것이 아니다
assert.deepEqual(pendingSectionKeys({ ...plan, answers: { ...answers, "financials/expenses": {} } }), ["summary/executive"]);

console.log(JSON.stringify({ passed: 3 }));
