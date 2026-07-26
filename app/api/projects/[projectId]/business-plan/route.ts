import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { generateBusinessPlan } from "../../../../../lib/business-plan/generator";
import { analyzeLocations } from "../../../../../lib/market/location-engine";
import { emptyMarketWorkspace } from "../../../../../lib/market/domain";
import { enrichDocumentNarrative } from "../../../../../lib/delivery/ai-narrative";
import { resolveLLMConfig, resolveAlternateLLMConfig } from "../../../../../lib/llm/config";
import {
  getProject,
  saveBusinessPlan,
} from "../../../../../lib/project-repository";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const workspace = project.marketWorkspace ?? emptyMarketWorkspace();
    const analysis = project.marketAnalysis ?? analyzeLocations(workspace);
    const plan = generateBusinessPlan(project, workspace, analysis);
    // 사업계획서(유료 핵심 문서)는 두 모델이 상호보완한다:
    // 1) 서술에 강한 Claude 우선으로 문장을 다듬고,
    // 2) 다른 모델(있으면)이 한 번 더 교차로 다듬어 품질을 끌어올린다.
    const primaryConfig = resolveLLMConfig(identity.hash, "anthropic");
    let enrichedMarkdown = await enrichDocumentNarrative(project, "plan", plan.markdown, primaryConfig);
    const secondaryConfig = primaryConfig
      ? resolveAlternateLLMConfig(identity.hash, primaryConfig.provider)
      : null;
    if (secondaryConfig) {
      enrichedMarkdown = await enrichDocumentNarrative(project, "plan", enrichedMarkdown, secondaryConfig);
    }
    const enrichedPlan = { ...plan, markdown: enrichedMarkdown };
    const updatedProject = await saveBusinessPlan(projectId, identity.hash, enrichedPlan);
    return NextResponse.json({ project: updatedProject, plan: enrichedPlan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "사업계획서를 생성하지 못했습니다.";
    return NextResponse.json(
      { error: { code: message === "PROJECT_NOT_FOUND" ? message : "BUSINESS_PLAN_FAILED", message } },
      { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 },
    );
  }
}
