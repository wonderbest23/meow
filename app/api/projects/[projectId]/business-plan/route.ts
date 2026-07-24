import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { generateBusinessPlan } from "../../../../../lib/business-plan/generator";
import { analyzeLocations } from "../../../../../lib/market/location-engine";
import { emptyMarketWorkspace } from "../../../../../lib/market/domain";
import { enrichDocumentNarrative } from "../../../../../lib/delivery/ai-narrative";
import { getOpenAIRuntimeConfig } from "../../../../../lib/openai/session-config";
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
    const enrichedMarkdown = await enrichDocumentNarrative(
      project,
      "plan",
      plan.markdown,
      getOpenAIRuntimeConfig(identity.hash),
    );
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
