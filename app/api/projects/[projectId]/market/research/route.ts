import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { generateBusinessPlan } from "../../../../../../lib/business-plan/generator";
import { emptyMarketWorkspace } from "../../../../../../lib/market/domain";
import { analyzeLocations } from "../../../../../../lib/market/location-engine";
import { researchOfficialMarketEvidence } from "../../../../../../lib/market/openai-research";
import { resolveTextLLMConfig } from "../../../../../../lib/llm/config";
import {
  getProject,
  saveBusinessPlan,
  saveMarketWorkspace,
} from "../../../../../../lib/project-repository";
import { requireProjectAiAccess } from "../../../../../../lib/project-ai-access";

export const runtime = "nodejs";
export const maxDuration = 180;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    // 웹검색 + 모델 호출이라 한 번에 비용이 크다 — 결제한 사업만, 사람 단위 호출 한도 안에서
    const denied = await requireProjectAiAccess(request, project, identity);
    if (denied) return denied;
    const config = resolveTextLLMConfig(identity.hash);
    if (!config) {
      return privateJson({
        error: { code: "OPENAI_NOT_CONNECTED", message: "공식 시장 근거 자동 탐색에 필요한 인공지능 연결이 준비되지 않았습니다." },
      }, { status: 409 });
    }
    const research = await researchOfficialMarketEvidence(project, config);
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
      ? "AI 사용 한도 또는 검색 요청 제한에 걸렸습니다. 잠시 후 다시 시도해주세요."
      : timeout
        ? "시장 근거 탐색 시간이 초과되었습니다. 잠시 뒤 다시 시도해주세요."
        : detail === "MARKET_RESEARCH_NO_CITED_EVIDENCE"
          ? "공식 원문과 함께 확인된 시장 수치를 찾지 못했습니다. 사업 지역이나 고객 범위를 더 구체적으로 정한 뒤 다시 시도해주세요."
          : notFound ? "프로젝트를 찾지 못했습니다." : "공식 시장 근거를 자동 탐색하지 못했습니다.";
    // 내부 오류 원문(detail)은 고객 응답에 싣지 않고 서버 로그에만 남긴다
    if (!notFound) console.error("[market-research]", error);
    return privateJson(
      { error: { code: notFound ? "PROJECT_NOT_FOUND" : "MARKET_RESEARCH_FAILED", message } },
      { status: notFound ? 404 : rateLimited ? 429 : 400 },
    );
  }
}
