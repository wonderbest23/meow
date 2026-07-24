import assert from "node:assert/strict";
import { assessBusinessSetup } from "../lib/business/korea-rules";
import { emptyBusinessSetup } from "../lib/business/domain";
import { generateBusinessPlan } from "../lib/business-plan/generator";
import { assembleDeliveryPackage } from "../lib/delivery/package-assembler";
import { buildDirectIdeaFallbackPlan } from "../lib/direct-idea-planner";
import {
  buildAutomaticStageInput,
  resolveDraftPackagePrice,
} from "../lib/draft-package/runner";
import { analyzeExecutionLoop, createExecutionWorkspace } from "../lib/execution-loop/engine";
import { analyzeGrants, createGrantWorkspace, generateGrantPackage } from "../lib/grants/engine";
import { analyzeLocations } from "../lib/market/location-engine";
import type { MarketWorkspace } from "../lib/market/domain";
import { assessOperations, createOperationsWorkspace, generateOperationsPackage } from "../lib/operations/engine";
import type { RankedOpportunity } from "../lib/opportunity-engine";
import {
  createInitialStageInputs,
  type PlanningConstraints,
} from "../lib/planning-inputs";
import type { ArtifactRecord, ProjectRecord } from "../lib/service-domain";
import { generateStageArtifact } from "../lib/stage-generator";

const input = {
  idea: "메이플스토리 같은 게임을 만드는 플랫폼",
  budgetWon: 3_000_000,
  availableHoursPerWeek: 15,
};
const plan = buildDirectIdeaFallbackPlan(input);
const opportunity = plan.opportunity as RankedOpportunity;
const constraints: PlanningConstraints = {
  budgetWon: input.budgetWon,
  availableHoursPerWeek: input.availableHoursPerWeek,
  notes: "직접 기획 초안과 결제 후 결과물의 일치성을 확인합니다.",
  source: "direct",
  idea: input.idea,
  directDraft: plan.draft,
  draftGeneration: plan.generation,
};
const price = resolveDraftPackagePrice(opportunity, constraints, null);
assert.equal(price, 49_000, "직접 초안의 첫 가격 가정이 결제 후 손익 입력에도 유지되어야 합니다.");

const automaticInputs = Array.from({ length: 6 }, (_, stageIndex) => (
  buildAutomaticStageInput(stageIndex, opportunity, price, "", "", constraints)
));
assert.equal(automaticInputs[0].budgetWon, 3_000_000);
assert.equal(automaticInputs[0].availableHoursPerWeek, 15);
assert.equal(automaticInputs[1].primaryCustomer, opportunity.customer);
assert.equal(automaticInputs[1].problemStatement, plan.draft.problem);
assert.equal(automaticInputs[2].coreOutcome, plan.draft.coreOutcome);
assert.deepEqual(automaticInputs[2].assumptions, plan.draft.assumptions);
assert.equal(automaticInputs[2].basePriceWon, 49_000);

const stages = automaticInputs.map((stageInput, stageIndex) => ({
  id: crypto.randomUUID(),
  projectId: "direct-paid-consistency",
  stageIndex,
  status: "collecting_input" as const,
  inputs: stageIndex === 0
    ? { ...stageInput, ...createInitialStageInputs(opportunity, constraints) }
    : stageInput,
  inputVersion: 1,
  approvedArtifactId: null,
  approvedAt: null,
  artifacts: [],
}));

const setup = emptyBusinessSetup("digital_service");
setup.legalForm = "sole_proprietor";
setup.workplaceType = "home";
setup.region = "서울특별시";
setup.onlineSales = true;
setup.handlesPersonalData = true;
setup.sectorKeywords = ["게임", "제작도구", "온라인 서비스"];
setup.financial.sellingPrice = price;
setup.financial.targetMonthlyUnits = 20;
setup.financial.availableCash = input.budgetWon;
setup.financial.unitVariable.materialsOrPurchase = 5_000;
const setupAssessment = assessBusinessSetup(setup);

const project = {
  id: "direct-paid-consistency",
  title: opportunity.title,
  status: "active",
  paymentStatus: "test_paid",
  packagePrice: 149_000,
  activeStage: 0,
  opportunity,
  founderProfile: { planningConstraints: constraints },
  businessSetup: setup,
  businessAssessment: setupAssessment,
  marketWorkspace: null,
  marketAnalysis: null,
  businessPlan: null,
  operationsWorkspace: null,
  operationsAssessment: null,
  operationsPackage: null,
  executionWorkspace: null,
  executionAnalysis: null,
  grantWorkspace: null,
  grantAnalysis: null,
  grantPackage: null,
  qualityAudit: null,
  stages,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as ProjectRecord;

async function main() {
  for (let stageIndex = 0; stageIndex < 6; stageIndex += 1) {
    const generated = await generateStageArtifact(project, stageIndex, undefined, false);
    const artifact: ArtifactRecord = {
      id: crypto.randomUUID(),
      projectId: project.id,
      stageId: project.stages[stageIndex].id,
      stageIndex,
      version: 1,
      schemaVersion: generated.schemaVersion,
      content: generated.content,
      explanations: generated.explanations,
      assumptions: generated.assumptions,
      sources: generated.sources,
      reviewStatus: "approved",
      createdAt: new Date().toISOString(),
    };
    project.stages[stageIndex].artifacts.push(artifact);
    project.stages[stageIndex].approvedArtifactId = artifact.id;
    project.stages[stageIndex].status = "approved";
  }

  const brief = project.stages[0].artifacts[0].content;
  assert.equal(brief.customer, opportunity.customer);
  assert.equal((brief.constraints as Record<string, unknown>).firstScope, plan.draft.firstScope);
  assert.match(String(brief.problem), new RegExp(plan.draft.problem.slice(0, 24)));

  const market = project.stages[1].artifacts[0].content;
  assert.equal(market.primaryCustomer, opportunity.customer);
  assert.equal((market.pains as string[])[0], plan.draft.problem);

  const pricing = project.stages[2].artifacts[0].content;
  const recommendedOffer = pricing.recommendedOffer as Record<string, unknown>;
  const coreTier = (pricing.tiers as Array<Record<string, unknown>>)[1];
  assert.equal(recommendedOffer.name, plan.draft.offerName);
  assert.equal(recommendedOffer.includedScope, plan.draft.offerDescription);
  assert.equal(recommendedOffer.priceWon, 49_000);
  assert.equal(coreTier.name, plan.draft.offerName);
  assert.equal(coreTier.outcome, plan.draft.coreOutcome);
  assert.equal(coreTier.priceWon, 49_000);

  const marketWorkspace: MarketWorkspace = {
    evidence: [],
    locations: [],
    selectedLocationId: null,
  };
  project.marketWorkspace = marketWorkspace;
  project.marketAnalysis = analyzeLocations(marketWorkspace);
  project.businessPlan = generateBusinessPlan(project, marketWorkspace, project.marketAnalysis);
  project.operationsWorkspace = createOperationsWorkspace(project);
  project.operationsAssessment = assessOperations(project.operationsWorkspace);
  project.operationsPackage = generateOperationsPackage(
    project,
    project.operationsWorkspace,
    project.operationsAssessment,
  );
  project.executionWorkspace = createExecutionWorkspace(project);
  project.executionAnalysis = analyzeExecutionLoop(project.executionWorkspace, {
    monthlyFixedCost: project.businessAssessment?.financial.monthlyFixedCost,
  });
  project.grantWorkspace = createGrantWorkspace(project);
  project.grantAnalysis = analyzeGrants(project, project.grantWorkspace);
  project.grantPackage = generateGrantPackage(project, project.grantWorkspace, project.grantAnalysis);

  const delivery = assembleDeliveryPackage(project);
  assert.equal(delivery.items.length, 10);
  assert.equal(delivery.completeCount, 10, delivery.missingTitles.join(" / "));
  assert.equal(delivery.deliveryQuality.blockerCount, 0, delivery.deliveryQuality.actions.join(" / "));
  assert.ok(delivery.deliveryQuality.score >= 80);
  assert.ok(delivery.items.find((item) => item.id === "brief")?.markdown.includes(plan.draft.firstScope));
  assert.ok(delivery.items.find((item) => item.id === "pricing")?.markdown.includes(plan.draft.offerName));
  assert.ok(delivery.items.find((item) => item.id === "plan")?.markdown.includes(plan.draft.offerName));

  console.log("direct-paid-consistency.test.ts passed");
}

void main();
