import assert from "node:assert/strict";
import { calculateProfile } from "../lib/assessment";
import {
  createDirectOpportunity,
  createFounderProfilePayload,
  createInitialStageInputs,
  isPlanningConstraints,
  mergeStageInputs,
  type PlanningConstraints,
} from "../lib/planning-inputs";
import { stageInputSchemas } from "../lib/service-domain";

const input = {
  idea: "동네 소상공인의 상품 사진과 소개 문구를 만들어주는 월 구독 서비스를 운영하고 싶습니다.",
  budgetWon: 2_500_000,
  availableHoursPerWeek: 15,
};
const opportunity = createDirectOpportunity(input);
assert.equal(opportunity.oneLiner, input.idea);
assert.equal(opportunity.capital, "소액");
assert.equal(opportunity.evidenceStatus, "hypothesis");
assert.equal(opportunity.match, 100);

const constraints: PlanningConstraints = {
  budgetWon: input.budgetWon,
  availableHoursPerWeek: input.availableHoursPerWeek,
  notes: `사용자 직접 입력: ${input.idea}`,
  source: "direct",
  idea: input.idea,
};
assert.equal(isPlanningConstraints(constraints), true);

const stageInputs = stageInputSchemas[0].parse(createInitialStageInputs(opportunity, constraints));
assert.equal(stageInputs.budgetWon, 2_500_000);
assert.equal(stageInputs.availableHoursPerWeek, 15);
assert.match(String(stageInputs.goal), /첫 고객 실행안/);

const founderProfile = createFounderProfilePayload(calculateProfile({}), constraints);
assert.deepEqual(founderProfile.planningConstraints, constraints);

const mergedStageInputs = mergeStageInputs(
  { budgetWon: 1_000_000, availableHoursPerWeek: 10, notes: "" },
  { budgetWon: 2_500_000, availableHoursPerWeek: 15, notes: "직접 입력한 사업 아이디어" },
  "평일 저녁에만 운영",
);
assert.equal(mergedStageInputs.budgetWon, 2_500_000);
assert.equal(mergedStageInputs.availableHoursPerWeek, 15);
assert.equal(mergedStageInputs.notes, "직접 입력한 사업 아이디어\n평일 저녁에만 운영");

console.log("planning-inputs.test.ts passed");
