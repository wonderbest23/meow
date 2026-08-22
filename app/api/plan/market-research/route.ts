import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { ensureProjectForPlan, projectForPlan } from "../../../../lib/plan-builder/project-bridge";
import { planResearchContext, researchReadiness } from "../../../../lib/plan-builder/market-research";
import { researchOfficialMarketEvidence } from "../../../../lib/market/openai-research";
import { emptyMarketWorkspace, type MarketEvidence } from "../../../../lib/market/domain";
import { analyzeLocations } from "../../../../lib/market/location-engine";
import { getOpenAIRuntimeConfig } from "../../../../lib/openai/session-config";
import { getProject, saveMarketWorkspace } from "../../../../lib/project-repository";
import { isSampleId } from "../../../../lib/plan-builder/samples";

export const runtime = "nodejs";
export const maxDuration = 180;

/*
 * 사업계획서의 공식 시장 근거 조사.
 *
 * GET  ?planId= — 저장된 근거와 '지금 조사해도 되는지'(입력 충분 여부)를 돌려준다.
 * POST {planId} — 기존 조사 엔진(lib/market/openai-research)을 그대로 불러
 *                 결과를 플랜의 프로젝트 그릇(projects.market_workspace)에 합친다.
 *
 * 조사는 사용자가 단추를 눌렀을 때만 돈다. 생성·재생성·화면 진입에서는 부르지
 * 않는다 — 한 번에 최대 150초, 호출마다 검색 비용이 든다.
 * 조사 맥락은 서버에 저장된 플랜에서만 만든다. 화면이 보낸 값은 믿지 않는다.
 */

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

/** 화면에 보여줄 만큼만 — 프롬프트와 같은 필드에 id·제목을 더한다 */
function publicEvidence(list: MarketEvidence[]) {
  return list.map((e) => ({
    id: e.id,
    title: e.title,
    metric: e.metric,
    value: e.value,
    unit: e.unit,
    sourceName: e.sourceName,
    sourceUrl: e.sourceUrl,
    observedAt: e.observedAt,
    retrievedAt: e.retrievedAt,
    verification: e.verification,
    note: e.note,
  }));
}

async function ownedPlan(planId: string, hash: string) {
  const state = await loadPlanState(hash);
  const plan = state.plans.find((p) => p.id === planId);
  return plan ? { state, plan } : null;
}

export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId") ?? "";
  if (!planId) return privateJson({ error: { code: "PLAN_REQUIRED", message: "플랜 정보가 없습니다." } }, { status: 400 });
  const identity = await requireGuestIdentity();
  const owned = await ownedPlan(planId, identity.hash);
  if (!owned) return privateJson({ error: { code: "PLAN_NOT_FOUND", message: "플랜을 찾을 수 없습니다." } }, { status: 404 });
  const context = planResearchContext(owned.plan, owned.state.business);
  const readiness = researchReadiness(context);
  const project = isSampleId(planId) ? null : await projectForPlan(planId, identity.hash).catch(() => null);
  const evidence = project?.marketWorkspace?.evidence ?? [];
  return privateJson({
    evidence: publicEvidence(evidence),
    readiness,
    context,
    configured: Boolean(getOpenAIRuntimeConfig(identity.hash)),
  });
}

export async function POST(request: Request) {
  /* 검색 비용이 드는 호출 — 화면 제어와 별개로 서버가 빈도를 제한한다 */
  const limited = await enforceRateLimit("plan-market-research", request, { limit: 12, windowMs: 10 * 60_000, message: "시장조사 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as { planId?: string };
  const planId = typeof body.planId === "string" ? body.planId.slice(0, 60) : "";
  if (!planId) return privateJson({ error: { code: "PLAN_REQUIRED", message: "플랜 정보가 없습니다." } }, { status: 400 });
  if (isSampleId(planId)) return privateJson({ error: { code: "SAMPLE_PLAN", message: "예시 문서에는 시장조사를 실행하지 않습니다." } }, { status: 400 });

  const identity = await requireGuestIdentity();
  const owned = await ownedPlan(planId, identity.hash);
  if (!owned) return privateJson({ error: { code: "PLAN_NOT_FOUND", message: "플랜을 찾을 수 없습니다." } }, { status: 404 });

  const context = planResearchContext(owned.plan, owned.state.business);
  const readiness = researchReadiness(context);
  if (!readiness.ok) {
    return privateJson({ error: { code: "RESEARCH_INPUT_REQUIRED", message: readiness.message }, readiness }, { status: 422 });
  }

  const config = getOpenAIRuntimeConfig(identity.hash);
  if (!config) {
    return privateJson({
      error: { code: "OPENAI_NOT_CONNECTED", message: "공식 시장 근거 자동 탐색을 사용하려면 운영용 OpenAI 연결이 필요합니다." },
    }, { status: 409 });
  }

  try {
    const projectId = await ensureProjectForPlan(owned.plan, identity);
    const project = await getProject(projectId, identity.hash);
    if (!project) throw new Error("PROJECT_NOT_FOUND");

    const research = await researchOfficialMarketEvidence(context, config);

    /* 기존 근거와 병합 — 같은 원문·같은 지표면 새 것으로 갈아끼우고, 최대 100개 */
    const current = project.marketWorkspace ?? emptyMarketWorkspace();
    const unique = new Map(current.evidence.map((item) => [`${item.sourceUrl}|${item.metric}`, item]));
    const beforeKeys = new Set(unique.keys());
    for (const item of research.evidence) unique.set(`${item.sourceUrl}|${item.metric}`, item);
    const workspace = { ...current, evidence: Array.from(unique.values()).slice(0, 100) };
    const analysis = analyzeLocations(workspace);
    await saveMarketWorkspace(projectId, identity.hash, workspace, analysis);

    const added = research.evidence.filter((item) => !beforeKeys.has(`${item.sourceUrl}|${item.metric}`));
    return privateJson({
      added: publicEvidence(added),
      evidence: publicEvidence(workspace.evidence),
      addedCount: added.length,
      citedSourceCount: research.citedSourceCount,
      model: research.model,
      notice: "공식 원문 링크가 검색 응답에 실제 인용된 항목만 저장했습니다. 수치와 기준일은 외부 제출 전에 원문을 한 번 더 확인하세요.",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const map: Record<string, { status: number; message: string }> = {
      OPENAI_429: { status: 429, message: "OpenAI 사용 한도 또는 검색 요청 제한을 확인해주세요. 잠시 후 다시 시도해주세요." },
      MARKET_RESEARCH_TIMEOUT: { status: 504, message: "시장 근거 탐색 시간이 초과되었습니다. 이미 저장된 근거는 그대로 있습니다. 잠시 뒤 다시 시도해주세요." },
      MARKET_RESEARCH_NO_CITED_EVIDENCE: { status: 404, message: "공식 근거를 찾지 못했습니다. 사업 지역이나 고객 범위를 조금 더 구체적으로 입력한 뒤 다시 시도해주세요." },
      MARKET_RESEARCH_EMPTY: { status: 502, message: "검색 응답이 비어 있었습니다. 잠시 뒤 다시 시도해주세요." },
      MARKET_RESEARCH_UNAVAILABLE: { status: 502, message: "검색 서비스에 연결하지 못했습니다. 잠시 뒤 다시 시도해주세요." },
    };
    const hit = map[detail.split(":")[0]];
    console.error("[plan-market-research]", detail);
    return privateJson(
      { error: { code: hit ? detail.split(":")[0] : "MARKET_RESEARCH_FAILED", message: hit?.message ?? "공식 시장 근거를 자동 탐색하지 못했습니다. 잠시 뒤 다시 시도해주세요." } },
      { status: hit?.status ?? 400 },
    );
  }
}
