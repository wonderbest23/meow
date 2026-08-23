import { NextResponse } from "next/server";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { PLAN_BLUEPRINT } from "../../../../lib/plan-builder/blueprint";
import { loadPlanEvidence } from "../../../../lib/plan-builder/market-research";
import { collectDeterministic } from "../../../../lib/plan-builder/review/deterministic";
import { reviewPlan } from "../../../../lib/plan-builder/review/reviewer";
import { REVIEW_VERSION, contentHash, type ReviewRecord } from "../../../../lib/plan-builder/review/domain";

export const runtime = "nodejs";

/*
 * POST /api/plan/review — 생성된 사업계획서를 사업 컨설턴트 관점에서 검토한다.
 *
 * 화면이 보낸 맥락을 쓰지 않는다. 서버에 저장된 플랜이 유일한 근거다 —
 * 그래야 요청을 손으로 만들어 검토 대상을 바꿔치기할 수 없다.
 * 저장은 화면이 기존 동기화 경로로 한다(생성 API 와 같은 태도).
 */
export async function POST(req: Request) {
  const limited = await enforceRateLimit("plan-review", req, { limit: 10, windowMs: 10 * 60_000, message: "검토 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;

  let identity: { hash: string };
  try {
    identity = await requireAuthenticatedIdentity();
  } catch {
    return NextResponse.json({ ok: false, reason: "login_required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { planId?: string };
  const planId = (body.planId ?? "").slice(0, 60);
  if (!planId) return NextResponse.json({ ok: false, reason: "missing_plan" }, { status: 400 });

  // 소유권 — 내 저장소에 있는 플랜만 검토한다
  const state = await loadPlanState(identity.hash);
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  const sections = PLAN_BLUEPRINT.flatMap((chapter) =>
    chapter.sections.map((section) => {
      const key = `${chapter.id}/${section.id}`;
      const markdown = plan.sections?.[key]?.markdown ?? "";
      return { key, title: `${chapter.title} · ${section.title}`, markdown };
    }),
  ).filter((s) => s.markdown.trim().length > 0);

  if (sections.length === 0) {
    return NextResponse.json({ ok: false, reason: "no_sections", message: "먼저 사업계획서 본문을 만들어 주세요." }, { status: 400 });
  }

  const evidence = await loadPlanEvidence(planId, identity.hash).catch(() => []);
  const deterministic = collectDeterministic({ answers: plan.answers ?? {}, business: state.business, evidence });

  const config = resolveLLMConfig(identity.hash, "anthropic");
  const { review, source } = await reviewPlan(config, {
    planTitle: plan.title,
    planType: plan.planType,
    business: state.business,
    sections,
    evidence,
    deterministic,
  });

  const record: ReviewRecord = {
    version: REVIEW_VERSION,
    reviewedAt: new Date().toISOString(),
    planId,
    contentHash: contentHash(plan.sections ?? {}),
    result: review,
  };
  return NextResponse.json({ ok: true, source, record, sectionCount: sections.length });
}
