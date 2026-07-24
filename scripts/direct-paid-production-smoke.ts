import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { buildAutomaticStageInput } from "../lib/draft-package/runner";
import { GUEST_COOKIE, hashIdentityToken } from "../lib/identity-tokens";
import type { RankedOpportunity } from "../lib/opportunity-engine";
import {
  createInitialStageInputs,
  type DirectIdeaDraft,
  type PlanningConstraints,
} from "../lib/planning-inputs";
import {
  createProject,
  deleteProject,
  saveStageInputs,
} from "../lib/project-repository";
import { inspectBusinessReality } from "../lib/quality/business-reality";
import { parseStageInput } from "../lib/service-domain";

const baseUrl = (process.env.SMOKE_BASE_URL?.trim() || "https://oneulstart.com").replace(/\/$/, "");
const guestToken = randomBytes(32).toString("base64url");
const guestTokenHash = hashIdentityToken(guestToken);
const cookie = `${GUEST_COOKIE}=${guestToken}`;
const input = {
  idea: "메이플스토리 같은 게임을 만드는 플랫폼",
  budgetWon: 3_000_000,
  availableHoursPerWeek: 15,
};

type DirectPlanResponse = {
  opportunity?: RankedOpportunity;
  draft?: DirectIdeaDraft;
  generation?: { source: "openai"; model: string };
  result?: {
    opportunity: RankedOpportunity;
    draft: DirectIdeaDraft;
    generation: { source: "openai"; model: string };
  };
  job?: {
    id: string;
    proof?: string;
    status: string;
    createdAt?: string;
  };
  error?: { message?: string };
};

type StageResponse = {
  status?: string;
  generation?: { model?: string };
  artifact?: {
    reviewStatus?: string;
    content?: Record<string, unknown>;
  };
  error?: { message?: string };
};

function directResult(payload: DirectPlanResponse) {
  if (payload.result) return payload.result;
  if (!payload.opportunity || !payload.draft || !payload.generation) return null;
  return {
    opportunity: payload.opportunity,
    draft: payload.draft,
    generation: payload.generation,
  };
}

async function generateDirectPlan() {
  const response = await fetch(`${baseUrl}/api/opportunities/direct-plan`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as DirectPlanResponse;
  assert.equal(response.ok, true, `운영 직접 기획 실패 (${response.status}): ${JSON.stringify(payload)}`);
  const immediate = directResult(payload);
  if (immediate) return immediate;
  assert(payload.job?.id && payload.job.proof, "운영 직접 기획 작업 번호가 비어 있습니다.");

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const statusResponse: Response = await fetch(
      `${baseUrl}/api/opportunities/direct-plan?jobId=${encodeURIComponent(payload.job.id)}&proof=${encodeURIComponent(payload.job.proof)}`,
      { headers: { Cookie: cookie }, cache: "no-store" },
    );
    const statusPayload = await statusResponse.json() as DirectPlanResponse;
    assert.equal(statusResponse.ok, true, `운영 직접 기획 상태 확인 실패 (${statusResponse.status}): ${JSON.stringify(statusPayload)}`);
    const completed = directResult(statusPayload);
    if (completed) return completed;
    assert.notEqual(statusPayload.job?.status, "error", statusPayload.error?.message ?? "운영 직접 기획 작업 실패");
  }
  throw new Error("운영 직접 기획 작업이 50초 안에 끝나지 않았습니다.");
}

async function generateStage(projectId: string, stageIndex: number) {
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/stages/${stageIndex}/generate`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
  });
  const payload = await response.json() as StageResponse;
  assert.equal(response.ok, true, `${stageIndex + 1}단계 운영 AI 생성 실패 (${response.status}): ${JSON.stringify(payload)}`);
  assert.equal(payload.status, "succeeded");
  assert.equal(payload.generation?.model, "gpt-5.6-sol");
  assert.equal(payload.artifact?.reviewStatus, "automated_review");
  return payload.artifact?.content ?? {};
}

async function main() {
  let projectId: string | null = null;
  try {
    const direct = await generateDirectPlan();
    assert.equal(direct.generation.model, "gpt-5.6-sol");
    assert(direct.draft.priceHypothesisWon, "첫 가격 가정이 누락됐습니다.");

    const constraints: PlanningConstraints = {
      ...input,
      source: "direct",
      notes: [
        `사용자 아이디어: ${input.idea}`,
        `첫 고객: ${direct.opportunity.customer}`,
        `첫 상품: ${direct.draft.offerName}`,
        `첫 범위: ${direct.draft.firstScope}`,
      ].join("\n"),
      directDraft: direct.draft,
      draftGeneration: direct.generation,
    };
    const project = await createProject({
      opportunity: direct.opportunity,
      founderProfile: { planningConstraints: constraints, source: "direct-paid-production-smoke" },
      paymentStatus: "test_paid",
      packagePrice: 0,
      initialStageInputs: createInitialStageInputs(direct.opportunity, constraints),
    }, guestTokenHash);
    projectId = project.id;

    const stage2Inputs = parseStageInput(2, buildAutomaticStageInput(
      2,
      direct.opportunity,
      direct.draft.priceHypothesisWon,
      "",
      "",
      constraints,
    )) as Record<string, unknown>;
    await saveStageInputs(project.id, 2, guestTokenHash, stage2Inputs);

    const brief = await generateStage(project.id, 0);
    const briefConstraints = brief.constraints as Record<string, unknown>;
    assert.equal(brief.customer, direct.opportunity.customer);
    assert.equal(briefConstraints.firstScope, direct.draft.firstScope);
    assert.match(String(brief.problem), new RegExp(direct.draft.problem.slice(0, 20)));
    assert.equal(inspectBusinessReality(project, brief).passed, true);

    const pricing = await generateStage(project.id, 2);
    const recommendedOffer = pricing.recommendedOffer as Record<string, unknown>;
    const coreTier = (pricing.tiers as Array<Record<string, unknown>>)[1];
    assert.equal(recommendedOffer.name, direct.draft.offerName);
    assert.equal(recommendedOffer.includedScope, direct.draft.offerDescription);
    assert.equal(recommendedOffer.priceWon, direct.draft.priceHypothesisWon);
    assert.equal(coreTier.name, direct.draft.offerName);
    assert.equal(coreTier.priceWon, direct.draft.priceHypothesisWon);
    assert.equal(inspectBusinessReality(project, pricing).passed, true);

    console.log(JSON.stringify({
      passed: true,
      baseUrl,
      model: direct.generation.model,
      directTitle: direct.opportunity.title,
      customerPreserved: true,
      firstScopePreserved: true,
      offerPreserved: true,
      pricePreserved: true,
      projectDeleted: true,
    }, null, 2));
  } finally {
    if (projectId) {
      const deleted = await deleteProject(projectId, guestTokenHash);
      assert.equal(deleted, true, `시험 프로젝트 자동 삭제 실패: ${projectId}`);
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
