import { deriveAutoDraftContext } from "../auto-draft";
import { emptyBusinessSetup } from "../business/domain";
import { assessBusinessSetup } from "../business/korea-rules";
import { inferBusinessArchetype } from "../business/router";
import { generateBusinessPlan } from "../business-plan/generator";
import { analyzeExecutionLoop, createExecutionWorkspace } from "../execution-loop/engine";
import { analyzeGrants, createGrantWorkspace, generateGrantPackage } from "../grants/engine";
import { createLandingDraft, landingDraftSchema } from "../landing/domain";
import { getLandingForProject, publishLanding, saveLandingDraft } from "../landing/repository";
import { emptyMarketWorkspace } from "../market/domain";
import { analyzeLocations } from "../market/location-engine";
import { getOpenAIRuntimeConfig, type OpenAIRuntimeConfig } from "../openai/session-config";
import { assessOperations, createOperationsWorkspace, generateOperationsPackage } from "../operations/engine";
import type { RankedOpportunity } from "../opportunity-engine";
import {
  mergeStageInputs,
  planningConstraintsFromFounderProfile,
  type PlanningConstraints,
} from "../planning-inputs";
import {
  approveArtifact,
  beginGeneration,
  failGeneration,
  finishGeneration,
  getProject,
  saveBusinessPlan,
  saveBusinessSetup,
  saveExecutionLoop,
  saveGrantWorkspace,
  saveOperationsWorkspace,
  saveStageInputs,
  updateDraftPackageRun,
  updateProjectOpportunity,
} from "../project-repository";
import { parseStageInput } from "../service-domain";
import { generateStageArtifact } from "../stage-generator";
import { applyRefinementToBusinessSetup, normalizeRefinementInput } from "../refinement/domain";
import {
  startDraftPackageStep,
  waitForDraftPackageAI,
  type DraftPackageWorkflowParams,
} from "./domain";

export type DraftPackageBuildContext = {
  nextPrice: number;
  nextBrand: string;
  note: string;
  revisionInstruction: string;
  setupChanged: boolean;
};

export type PreparedDraftStage =
  | { status: "skipped"; artifactId: string }
  | { status: "ready"; jobId: string; requestedModel: string };

export type GeneratedDraftStage = Awaited<ReturnType<typeof generateStageArtifact>>;

function capitalBudget(opportunity: RankedOpportunity) {
  return opportunity.capital === "소액" ? 1_000_000 : opportunity.capital === "중간" ? 10_000_000 : 50_000_000;
}

function defaultPrice(opportunity: RankedOpportunity) {
  return opportunity.capital === "소액" ? 290_000 : opportunity.capital === "중간" ? 790_000 : 1_490_000;
}

export function resolveDraftPackagePrice(
  opportunity: RankedOpportunity,
  planningConstraints: PlanningConstraints | null,
  storedPrice: number | null,
  refinementPrice?: number,
) {
  const directPrice = planningConstraints?.source === "direct"
    ? planningConstraints.directDraft?.priceHypothesisWon
    : undefined;
  return refinementPrice ?? storedPrice ?? directPrice ?? defaultPrice(opportunity);
}

export function buildAutomaticStageInput(
  stageIndex: number,
  opportunity: RankedOpportunity,
  price: number,
  brandChoice: string,
  note: string,
  planningConstraints: PlanningConstraints | null = null,
) {
  const autoDraft = deriveAutoDraftContext(opportunity as unknown as Record<string, unknown>);
  const directDraft = planningConstraints?.source === "direct"
    ? planningConstraints.directDraft
    : undefined;
  const budgetWon = planningConstraints?.budgetWon ?? capitalBudget(opportunity);
  const availableHoursPerWeek = planningConstraints?.availableHoursPerWeek ?? 10;
  const preservedNotes = [planningConstraints?.notes, note].filter(Boolean).join("\n");
  const inputs = [
    {
      goal: `${opportunity.title}의 첫 유료 고객을 확보할 수 있는 사업 시작 기반 완성`,
      availableHoursPerWeek,
      budgetWon,
      mustAvoid: [],
      existingAssets: opportunity.skills,
      referenceUrls: [],
      notes: preservedNotes,
    },
    {
      primaryCustomer: autoDraft.customer,
      problemStatement: directDraft?.problem ?? autoDraft.problem,
      interviewNotes: [],
      evidenceUrls: [],
      unknowns: ["실제 지불 의사", "구매 결정자", "구매 빈도"],
    },
    {
      coreOutcome: directDraft?.coreOutcome ?? autoDraft.coreOutcome,
      deliveryMethod: opportunity.model,
      basePriceWon: price,
      variableCostWon: Math.round(price * 0.2),
      monthlyFixedCostWon: budgetWon,
      monthlyRevenueGoalWon: 5_000_000,
      capacityPerMonth: 20,
      assumptions: directDraft?.assumptions ?? [preservedNotes || "실제 원가와 고객 가격 인터뷰 후 갱신"],
    },
    {
      preferredKeywords: ["명확한", "신뢰할 수 있는", "실행 중심"],
      prohibitedKeywords: ["무조건", "완벽 보장"],
      tone: "실용적인",
      preferredNames: brandChoice ? [brandChoice] : autoDraft.nameCandidates,
      selectedName: brandChoice || undefined,
      legalNameCheckRequired: true,
    },
    {
      headline: autoDraft.headline,
      subheadline: autoDraft.subheadline,
      callToAction: autoDraft.callToAction,
      contactMethod: "신청폼",
      contactValue: "판매 페이지 신청폼",
      proofItems: [],
      faq: [],
      legalNotice: "상담과 생성 결과는 사업 성과를 보장하지 않습니다.",
    },
    {
      launchDate: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
      channels: ["지인", "커뮤니티", "제휴"],
      leadNames: [],
      weeklyContactGoal: 10,
      monthlyCustomerGoal: 3,
      supportProgramInterest: true,
      notes: preservedNotes,
    },
  ];
  return inputs[stageIndex] as Record<string, unknown>;
}

export async function prepareDraftPackage(
  params: DraftPackageWorkflowParams,
): Promise<DraftPackageBuildContext> {
  let project = await getProject(params.projectId, params.guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  let opportunity = project.opportunity as unknown as RankedOpportunity;
  const refinement = params.refinement
    ? normalizeRefinementInput(project, params.refinement)
    : undefined;

  if (refinement) {
    project = await updateProjectOpportunity(params.projectId, params.guestTokenHash, {
      customer: refinement.customer,
      oneLiner: refinement.oneLiner,
    });
    opportunity = project.opportunity as unknown as RankedOpportunity;
  }

  const storedPrice = project.businessSetup?.financial.sellingPrice
    ?? (typeof project.stages[2]?.inputs.basePriceWon === "number" ? project.stages[2].inputs.basePriceWon : null);
  const planningConstraints = planningConstraintsFromFounderProfile(project.founderProfile);
  const nextPrice = resolveDraftPackagePrice(
    opportunity,
    planningConstraints,
    storedPrice,
    refinement?.priceWon,
  );
  const selectedName = project.stages[3]?.inputs.selectedName;
  const nextBrand = refinement?.brandName ?? (typeof selectedName === "string" ? selectedName : "");
  const note = refinement?.note ?? "";
  const setupChanged = !project.businessSetup || Boolean(refinement);

  if (setupChanged) {
    const stageBudget = project.stages[0]?.inputs.budgetWon;
    const availableCash = typeof stageBudget === "number" ? stageBudget : capitalBudget(opportunity);
    const setup = project.businessSetup
      ? structuredClone(project.businessSetup)
      : emptyBusinessSetup(inferBusinessArchetype(opportunity));
    setup.financial.sellingPrice = nextPrice;
    setup.financial.availableCash = availableCash;
    setup.sectorKeywords = `${opportunity.title} ${opportunity.oneLiner}`.split(/\s+/).filter(Boolean).slice(0, 6);
    setup.onlineSales = setup.archetype === "ecommerce" || setup.archetype === "digital_service";
    setup.handlesPersonalData = setup.handlesPersonalData || setup.onlineSales;
    const refinedSetup = refinement
      ? applyRefinementToBusinessSetup(setup, refinement)
      : setup;
    await saveBusinessSetup(
      params.projectId,
      params.guestTokenHash,
      refinedSetup,
      assessBusinessSetup(refinedSetup),
    );
  }

  return {
    nextPrice,
    nextBrand,
    note,
    setupChanged,
    revisionInstruction: refinement
      ? [
          `사업 이름은 '${refinement.brandName}', 주요 고객은 '${refinement.customer}', 한 줄 소개는 '${refinement.oneLiner}'로 반영해주세요.`,
          `첫 상품 가격은 ${refinement.priceWon.toLocaleString("ko-KR")}원, 한 건당 변동비는 ${refinement.variableCostPerUnit.toLocaleString("ko-KR")}원, 월 고정비는 ${refinement.monthlyFixedCostWon.toLocaleString("ko-KR")}원, 월 목표 판매량은 ${refinement.targetMonthlyUnits.toLocaleString("ko-KR")}건, 사업 지역은 '${refinement.region}'입니다.`,
          refinement.note,
        ].filter(Boolean).join(" ")
      : "",
  };
}

export async function prepareDraftStageGeneration(
  params: DraftPackageWorkflowParams,
  stageIndex: number,
  context: DraftPackageBuildContext,
  runtimeConfig?: OpenAIRuntimeConfig | null,
): Promise<PreparedDraftStage> {
  let project = await getProject(params.projectId, params.guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const stage = project.stages[stageIndex];
  if (!stage) throw new Error("STAGE_NOT_FOUND");
  if (!params.force && stage.approvedArtifactId) {
    return { status: "skipped", artifactId: stage.approvedArtifactId };
  }

  const opportunity = project.opportunity as unknown as RankedOpportunity;
  const planningConstraints = planningConstraintsFromFounderProfile(project.founderProfile);
  let inputs = mergeStageInputs(
    buildAutomaticStageInput(
      stageIndex,
      opportunity,
      context.nextPrice,
      context.nextBrand,
      context.note,
      planningConstraints,
    ),
    stage.inputs,
    context.note,
  );
  if (params.refinement && stageIndex === 1) inputs = { ...inputs, primaryCustomer: params.refinement.customer };
  if (stageIndex === 2 && project.businessAssessment) {
    const financial = project.businessAssessment.financial;
    inputs = {
      ...inputs,
      basePriceWon: financial.grossPrice,
      variableCostWon: financial.variableCostPerUnit,
      monthlyFixedCostWon: financial.monthlyFixedCost,
      monthlyRevenueGoalWon: financial.grossPrice * (project.businessSetup?.financial.targetMonthlyUnits ?? 10),
    };
  }
  if (params.refinement && stageIndex === 3) {
    inputs = { ...inputs, preferredNames: [params.refinement.brandName], selectedName: params.refinement.brandName };
  }
  if (params.refinement && stageIndex === 4) inputs = { ...inputs, headline: params.refinement.oneLiner };

  const parsedInputs = parseStageInput(stageIndex, inputs) as Record<string, unknown>;
  await saveStageInputs(params.projectId, stageIndex, params.guestTokenHash, parsedInputs);

  const openAIConfig = runtimeConfig === undefined
    ? getOpenAIRuntimeConfig(params.guestTokenHash)
    : runtimeConfig;
  const requestedModel = openAIConfig?.model ?? "deterministic-fallback-v1";
  const job = await beginGeneration(
    params.projectId,
    stageIndex,
    params.guestTokenHash,
    params.force ? { ...parsedInputs, revisionInstruction: context.revisionInstruction } : parsedInputs,
    requestedModel,
  );

  return { status: "ready", jobId: job.id, requestedModel };
}

export async function generatePreparedDraftStage(
  params: DraftPackageWorkflowParams,
  stageIndex: number,
  context: DraftPackageBuildContext,
  jobId: string,
  runtimeConfig?: OpenAIRuntimeConfig | null,
): Promise<GeneratedDraftStage> {
  await updateDraftPackageRun(
    params.projectId,
    params.guestTokenHash,
    params.runId,
    (run) => startDraftPackageStep(run, stageIndex + 1),
  );
  const project = await getProject(params.projectId, params.guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const openAIConfig = runtimeConfig === undefined
    ? getOpenAIRuntimeConfig(params.guestTokenHash)
    : runtimeConfig;

  try {
    return await generateStageArtifact(
      project,
      stageIndex,
      params.force ? context.revisionInstruction : undefined,
      openAIConfig,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "결과물 생성에 실패했습니다.";
    await failGeneration(
      params.projectId,
      stageIndex,
      params.guestTokenHash,
      jobId,
      message.startsWith("OPENAI_") ? message : "GENERATION_FAILED",
      message,
    ).catch(() => undefined);
    const waitable = message.includes("OPENAI_429")
      || message.includes("OPENAI_TIMEOUT")
      || message.includes("OPENAI_UNAVAILABLE")
      || /OPENAI_5\d\d/.test(message);
    if (waitable) {
      await updateDraftPackageRun(
        params.projectId,
        params.guestTokenHash,
        params.runId,
        (run) => waitForDraftPackageAI(run, stageIndex + 1),
      ).catch(() => undefined);
    }
    throw error;
  }
}

export async function finishPreparedDraftStage(
  params: DraftPackageWorkflowParams,
  stageIndex: number,
  generated: GeneratedDraftStage,
  jobId: string,
) {
  try {
    const { model, ...artifactInput } = generated;
    const artifact = await finishGeneration(
      params.projectId,
      stageIndex,
      params.guestTokenHash,
      jobId,
      artifactInput,
      model,
    );
    const approvedProject = await approveArtifact(params.projectId, stageIndex, artifact.id, params.guestTokenHash);
    if (!approvedProject) throw new Error("PROJECT_NOT_FOUND");

    if (!params.force && stageIndex === 1) {
      const approvedStage = approvedProject.stages[1];
      const approved = approvedStage.artifacts.find((item) => item.id === approvedStage.approvedArtifactId);
      const suggestedCustomer = typeof approved?.content.primaryCustomer === "string"
        ? approved.content.primaryCustomer.trim()
        : "";
      const currentCustomer = String(approvedProject.opportunity.customer ?? "");
      if (suggestedCustomer.length >= 2 && suggestedCustomer !== currentCustomer) {
        await updateProjectOpportunity(params.projectId, params.guestTokenHash, { customer: suggestedCustomer });
      }
    }
    return { artifactId: artifact.id, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : "결과물 생성에 실패했습니다.";
    await failGeneration(
      params.projectId,
      stageIndex,
      params.guestTokenHash,
      jobId,
      message.startsWith("OPENAI_") ? message : "GENERATION_FAILED",
      message,
    ).catch(() => undefined);
    throw error;
  }
}

function landingBlock(
  blocks: Array<Record<string, unknown>>,
  type: string,
) {
  return blocks.find((block) => block.type === type);
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function textList(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, limit)
    : [];
}

export async function syncGeneratedLanding(params: DraftPackageWorkflowParams) {
  const project = await getProject(params.projectId, params.guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const landingStage = project.stages[4];
  const landingArtifact = landingStage?.artifacts.find((item) => item.id === landingStage.approvedArtifactId);
  if (!landingArtifact) throw new Error("LANDING_ARTIFACT_NOT_FOUND");

  const content = landingArtifact.content;
  const blocks = Array.isArray(content.blocks)
    ? content.blocks.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
  const hero = landingBlock(blocks, "hero");
  const problem = landingBlock(blocks, "problem");
  const solution = landingBlock(blocks, "solution");
  const offer = landingBlock(blocks, "offer");
  const pricing = landingBlock(blocks, "pricing");
  const proof = landingBlock(blocks, "proof");
  const faqBlock = landingBlock(blocks, "faq");

  const existing = await getLandingForProject(params.projectId, params.guestTokenHash);
  const opportunity = project.opportunity;
  const suggested = createLandingDraft({
    title: String(opportunity.title ?? project.title),
    oneLiner: textValue(hero?.headline, String(opportunity.oneLiner ?? "")),
    customer: String(opportunity.customer ?? "필요한 고객"),
    model: String(opportunity.model ?? "맞춤 방식"),
    sector: String(opportunity.sector ?? "서비스"),
    legalNotice: textValue(content.legalNotice, String(opportunity.caution ?? "")),
  });
  const base = existing?.draft ?? suggested;
  const brandArtifact = project.stages[3]?.artifacts.find(
    (item) => item.id === project.stages[3]?.approvedArtifactId,
  );
  const recommendedBrand = brandArtifact?.content.recommendedDirection;
  const brandRecord = recommendedBrand && typeof recommendedBrand === "object"
    ? recommendedBrand as Record<string, unknown>
    : null;

  const benefits = [problem, solution, offer]
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      title: textValue(item.title).slice(0, 120),
      description: textValue(item.body, textList(item.items, 3).join(" · ")).slice(0, 1000),
    }))
    .filter((item) => item.title && item.description);
  const faq = Array.isArray(faqBlock?.items)
    ? faqBlock.items
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          question: textValue(item.question).slice(0, 120),
          answer: textValue(item.answer).slice(0, 1000),
        }))
        .filter((item) => item.question && item.answer)
        .slice(0, 10)
    : [];

  const draft = landingDraftSchema.parse({
    ...base,
    businessName: params.refinement?.brandName || textValue(brandRecord?.name, base.businessName),
    heroLabel: textValue(brandRecord?.slogan, base.heroLabel).slice(0, 80),
    headline: textValue(hero?.headline, suggested.headline).slice(0, 120),
    subheadline: textValue(hero?.subheadline, suggested.subheadline).slice(0, 300),
    ctaLabel: textValue(hero?.cta, suggested.ctaLabel).slice(0, 40),
    benefits: benefits.length ? benefits : base.benefits,
    offerTitle: textValue(offer?.title, base.offerTitle).slice(0, 120),
    offerDescription: textValue(offer?.body, base.offerDescription).slice(0, 1000),
    priceLabel: textValue(pricing?.title, base.priceLabel).slice(0, 100),
    proofItems: textList(proof?.items, 8).map((item) => item.slice(0, 200)),
    faq: faq.length ? faq : base.faq,
    legalNotice: textValue(content.legalNotice, base.legalNotice).slice(0, 1000),
  });

  const saved = await saveLandingDraft(params.projectId, params.guestTokenHash, draft);
  try {
    const site = await publishLanding(params.projectId, params.guestTokenHash);
    return { siteId: site.id, slug: site.slug, version: site.publishedVersion, status: "published" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.startsWith("LANDING_COMPLIANCE_BLOCKED:")) throw error;
    return { siteId: saved.id, slug: saved.slug, version: saved.publishedVersion, status: "draft" as const };
  }
}

export async function generateDraftBusinessPlan(
  params: DraftPackageWorkflowParams,
  context: DraftPackageBuildContext,
) {
  const project = await getProject(params.projectId, params.guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (!params.force && !context.setupChanged && project.businessPlan) return { skipped: true };
  const workspace = project.marketWorkspace ?? emptyMarketWorkspace();
  const analysis = project.marketAnalysis ?? analyzeLocations(workspace);
  const plan = generateBusinessPlan(project, workspace, analysis);
  await saveBusinessPlan(params.projectId, params.guestTokenHash, plan);
  return { skipped: false };
}

export async function generateDraftOperations(
  params: DraftPackageWorkflowParams,
  context: DraftPackageBuildContext,
) {
  const project = await getProject(params.projectId, params.guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (!params.force && !context.setupChanged && project.operationsPackage) return { skipped: true };
  const workspace = project.operationsWorkspace ?? createOperationsWorkspace(project);
  const assessment = assessOperations(workspace);
  const operationsPackage = generateOperationsPackage(project, workspace, assessment);
  await saveOperationsWorkspace(params.projectId, params.guestTokenHash, workspace, assessment, operationsPackage);
  return { skipped: false };
}

export async function generateDraftExecutionPlan(
  params: DraftPackageWorkflowParams,
  context: DraftPackageBuildContext,
) {
  const project = await getProject(params.projectId, params.guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (!params.force && !context.setupChanged && project.executionAnalysis) return { skipped: true };
  const workspace = project.executionWorkspace ?? createExecutionWorkspace(project);
  const landing = await getLandingForProject(params.projectId, params.guestTokenHash);
  const analysis = analyzeExecutionLoop(workspace, {
    landingMetrics: landing?.metrics ?? null,
    monthlyFixedCost: project.businessAssessment?.financial.monthlyFixedCost ?? 0,
  });
  await saveExecutionLoop(params.projectId, params.guestTokenHash, workspace, analysis);
  return { skipped: false };
}

export async function generateDraftGrantPackage(
  params: DraftPackageWorkflowParams,
  context: DraftPackageBuildContext,
) {
  const project = await getProject(params.projectId, params.guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (!params.force && !context.setupChanged && project.grantPackage) return { skipped: true };
  const workspace = project.grantWorkspace ?? createGrantWorkspace(project);
  const analysis = analyzeGrants(project, workspace);
  const grantPackage = generateGrantPackage(project, workspace, analysis);
  await saveGrantWorkspace(params.projectId, params.guestTokenHash, workspace, analysis, grantPackage);
  return { skipped: false };
}
