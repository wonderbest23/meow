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
assert.equal(opportunity.title, "상품 사진과 소개 문구를 만들어주는 월 구독");
assert.equal(opportunity.customer, "동네 소상공인");
assert.equal(opportunity.model, "월 구독 제작");
assert.equal(opportunity.revenue, "월 구독료 + 추가 제작비");
assert.equal(opportunity.capital, "소액");
assert.equal(opportunity.evidenceStatus, "hypothesis");
assert.equal(opportunity.match, 100);

const videoSubscription = createDirectOpportunity({
  idea: "마포구 1인 자영업자를 위한 숏폼 홍보 영상 월 구독 제작 서비스",
  budgetWon: 3_000_000,
  availableHoursPerWeek: 20,
});
assert.equal(videoSubscription.title, "숏폼 홍보 영상 구독 제작");
assert.equal(videoSubscription.customer, "마포구 1인 자영업자");
assert.equal(videoSubscription.model, "월 구독 제작");
assert.match(videoSubscription.firstTest, /샘플 영상 1편/);

const constraints: PlanningConstraints = {
  budgetWon: input.budgetWon,
  availableHoursPerWeek: input.availableHoursPerWeek,
  notes: `사용자 직접 입력: ${input.idea}`,
  source: "direct",
  idea: input.idea,
};
assert.equal(isPlanningConstraints(constraints), true);

const questionnaireConstraints: PlanningConstraints = {
  budgetWon: 1_800_000,
  availableHoursPerWeek: 9,
  notes: "8개 질문 완료 후 직접 입력",
  source: "questionnaire",
};
assert.equal(isPlanningConstraints(questionnaireConstraints), true);

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

const replacedPlaceholderInputs = mergeStageInputs(
  {
    primaryCustomer: "사업 준비가 막막한 예비 창업자",
    problemStatement: "사업 아이디어 이후의 실행 순서를 혼자 정하기 어렵습니다.",
    preferredNames: ["오늘창업", "시작설계"],
  },
  {
    primaryCustomer: "첫 기획 단계에서 확인할 초기 고객",
    problemStatement: "창업플랫폼",
    preferredNames: [],
  },
  "",
);
assert.equal(replacedPlaceholderInputs.primaryCustomer, "사업 준비가 막막한 예비 창업자");
assert.equal(replacedPlaceholderInputs.problemStatement, "사업 아이디어 이후의 실행 순서를 혼자 정하기 어렵습니다.");
assert.deepEqual(replacedPlaceholderInputs.preferredNames, ["오늘창업", "시작설계"]);

console.log("planning-inputs.test.ts passed");
