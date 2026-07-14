import assert from "node:assert/strict";
import { inspectBusinessReality } from "../lib/quality/business-reality";
import type { ProjectRecord } from "../lib/service-domain";

const project = {
  opportunity: { title: "예약 문의 정리", oneLiner: "미용실 예약 문의를 정리합니다.", evidenceSources: [] },
  founderProfile: {},
  marketWorkspace: null,
  stages: Array.from({ length: 6 }, (_, stageIndex) => ({ stageIndex, inputs: {} })),
} as unknown as ProjectRecord;

const safe = inspectBusinessReality(project, {
  plan: "첫 30일의 목표는 잠재 고객 10명에게 제안하고 실제 결제 여부를 기록하는 것입니다.",
  assumption: "시장 수요는 아직 확인되지 않았으며 실제 고객 반응으로 검증해야 합니다.",
  prohibitedClaims: ["업계 1위", "100% 성공"],
});
assert.equal(safe.passed, true);

const fabricatedResult = inspectBusinessReality(project, {
  result: "고객 인터뷰 결과 12명 중 8명이 결제 의사를 확인했습니다.",
});
assert.equal(fabricatedResult.passed, false);
assert.equal(fabricatedResult.issues.some((issue) => issue.code === "UNVERIFIED_RESULT"), true);

const fabricatedMarket = inspectBusinessReality(project, {
  market: "국내 예약관리 시장 규모는 3조 원입니다.",
});
assert.equal(fabricatedMarket.issues.some((issue) => issue.code === "UNSOURCED_MARKET_METRIC"), true);

const unrelatedUrlProject = {
  ...project,
  stages: project.stages.map((stage, index) => ({
    ...stage,
    inputs: index === 0 ? { referenceUrls: ["https://kosis.kr/"] } : {},
  })),
} as ProjectRecord;
const unrelatedSourceMarket = inspectBusinessReality(unrelatedUrlProject, {
  market: "국내 예약관리 시장 규모는 3조 원입니다.",
});
assert.equal(unrelatedSourceMarket.issues.some((issue) => issue.code === "UNSOURCED_MARKET_METRIC"), true);

const inventedUrl = inspectBusinessReality(project, {
  source: "근거는 https://invented-market-report.kr/ 에서 확인했습니다.",
});
assert.equal(inventedUrl.issues.some((issue) => issue.code === "FAKE_SOURCE"), true);

const allowedUrl = inspectBusinessReality(unrelatedUrlProject, {
  source: "사용자가 제공한 원문은 https://kosis.kr/ 입니다.",
});
assert.equal(allowedUrl.issues.some((issue) => issue.code === "FAKE_SOURCE"), false);

const guarantee = inspectBusinessReality(project, { headline: "도입하면 100% 성공을 보장합니다." });
assert.equal(guarantee.issues.some((issue) => issue.code === "PROHIBITED_CLAIM"), true);

console.log("business-reality.test.ts passed");
