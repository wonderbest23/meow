import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { generateBusinessPlan } from "../../../../../../lib/business-plan/generator";
import { emptyMarketWorkspace } from "../../../../../../lib/market/domain";
import { analyzeLocations } from "../../../../../../lib/market/location-engine";
import { researchOfficialMarketEvidence } from "../../../../../../lib/market/openai-research";
import { getOpenAIRuntimeConfig } from "../../../../../../lib/openai/session-config";
import {
  getProject,
  saveBusinessPlan,
  saveMarketWorkspace,
} from "../../../../../../lib/project-repository";

export const runtime = "nodejs";
export const maxDuration = 180;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const sessionConfig = getOpenAIRuntimeConfig(identity.hash);
    const apiKey = sessionConfig?.apiKey ?? process.env.OPENAI_API_KEY?.trim();
    const model = sessionConfig?.model ?? process.env.OPENAI_MODEL?.trim() ?? "gpt-5.6-sol";
    if (!apiKey) {
      return privateJson({
        error: { code: "OPENAI_NOT_CONNECTED", message: "공식 시장 근거 자동 탐색을 사용하려면 운영용 OpenAI 연결이 필요합니다." },
      }, { status: 409 });
    }
    const research = await researchOfficialMarketEvidence(project, { apiKey, model, source: sessionConfig?.source ?? "environment" });
    const current = project.marketWorkspace ?? emptyMarketWorkspace();
    const unique = new Map(current.evidence.map((item) => [`${item.sourceUrl}|${item.metric}`, item]));
    for (const item of research.evidence) unique.set(`${item.sourceUrl}|${item.metric}`, item);
    const workspace = { ...current, evidence: Array.from(unique.values()).slice(0, 100) };
    const analysis = analyzeLocations(workspace);
    let updated = await saveMarketWorkspace(projectId, identity.hash, workspace, analysis);
    const plan = generateBusinessPlan(updated, workspace, analysis);
    updated = await saveBusinessPlan(projectId, identity.hash, plan);
    return privateJson({
      project: updated,
      evidence: research.evidence,
      addedCount: research.evidence.length,
      citedSourceCount: research.citedSourceCount,
      model: research.model,
      notice: "공식 원문 링크가 검색 응답에 실제 인용된 항목만 저장했습니다. 수치와 기준일은 외부 제출 전에 원문을 한 번 더 확인하세요.",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "시장 근거를 자동 탐색하지 못했습니다.";
    const notFound = detail === "PROJECT_NOT_FOUND";
    const rateLimited = detail === "OPENAI_429";
    const timeout = detail === "MARKET_RESEARCH_TIMEOUT";
    const message = rateLimited
      ? "OpenAI 사용 한도 또는 검색 요청 제한을 확인해주세요."
      : timeout
        ? "시장 근거 탐색 시간이 초과되었습니다. 잠시 뒤 다시 시도해주세요."
        : detail === "MARKET_RESEARCH_NO_CITED_EVIDENCE"
          ? "공식 원문과 함께 확인된 시장 수치를 찾지 못했습니다. 사업 지역이나 고객 범위를 더 구체적으로 정한 뒤 다시 시도해주세요."
          : notFound ? "프로젝트를 찾지 못했습니다." : "공식 시장 근거를 자동 탐색하지 못했습니다.";
    return privateJson(
      { error: { code: notFound ? "PROJECT_NOT_FOUND" : "MARKET_RESEARCH_FAILED", message, detail } },
      { status: notFound ? 404 : rateLimited ? 429 : 400 },
    );
  }
}
