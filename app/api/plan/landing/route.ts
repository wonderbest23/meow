import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { createProject, findProjectIdByPlan } from "../../../../lib/project-repository";
import { getLandingForProject, saveLandingDraft } from "../../../../lib/landing/repository";
import { landingDraftFromPlan, planLandingReadiness } from "../../../../lib/landing/from-plan";
import { paidHomepagePlanIds, HOMEPAGE_PRODUCT_AMOUNT } from "../../../../lib/payments/plan-orders";

export const runtime = "nodejs";

/*
 * 사업계획서로 만드는 홈페이지.
 *
 * GET  — 이 플랜에 이미 만든 홈페이지가 있는지 확인한다.
 * POST — 계획서 답변으로 초안을 만든다(이미 있으면 그대로 돌려준다 — 편집한 내용을 덮지 않는다).
 *
 * 홈페이지는 계획서와 별개로 파는 상품이다.
 * 만들어 보여주는 것(미리보기)까지는 무료 — 자기 계획서가 홈페이지로 어떻게
 * 보이는지 확인하고 살지 정한다. 고치고 공개하는 것부터가 결제 대상이다.
 * 실제 차단은 이 라우트와 저장·공개 라우트가 하고, 화면은 이유만 알린다.
 */

async function planFor(planId: string) {
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const plan = state.plans.find((item) => item.id === planId) ?? null;
  return { identity, state, plan };
}

export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

  const { identity, plan } = await planFor(planId);
  if (!plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });

  const projectId = await findProjectIdByPlan(planId, identity.hash);
  if (!projectId) return NextResponse.json({ site: null, projectId: null });

  const site = await getLandingForProject(projectId, identity.hash);
  const purchased = identity.userId ? await paidHomepagePlanIds(identity.userId) : new Set<string>();
  return NextResponse.json(
    { site, projectId, editable: purchased.has(planId), price: HOMEPAGE_PRODUCT_AMOUNT },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("plan-landing-create", request, {
    limit: 20,
    windowMs: 10 * 60_000,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as { planId?: string };
  if (!body.planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

  const { identity, state, plan } = await planFor(body.planId);
  if (!plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });

  // 화면만 가려서는 우회할 수 있으므로 서버에서 막는다 — PDF·PPT와 같은 기준
  const access = await resolvePlanAccess(plan.planType, plan.id);
  if (!access.authenticated) {
    return NextResponse.json({ error: "login_required", message: "로그인 후 이용할 수 있습니다." }, { status: 401 });
  }

  /*
   * 수정·공개 권한은 홈페이지 결제 여부로 갈린다.
   * 미리보기만 하는 사람에게도 초안은 만들어 준다 — 사기 전에 봐야 살지 정한다.
   */
  const purchased = identity.userId ? await paidHomepagePlanIds(identity.userId) : new Set<string>();
  const entitlement = { editable: purchased.has(plan.id), price: HOMEPAGE_PRODUCT_AMOUNT };

  const source = { planTitle: plan.title, business: state.business, answers: plan.answers, contactEmail: access.email ?? "" };
  const readiness = planLandingReadiness(source);
  if (!readiness.ready) {
    return NextResponse.json(
      {
        error: "plan_incomplete",
        message: "홈페이지에 실을 내용이 아직 부족합니다.",
        missing: readiness.missing,
      },
      { status: 400 },
    );
  }

  /*
   * 홈페이지 저장소는 프로젝트 단위다. 플랜당 하나의 그릇을 만들어 두고 재사용한다.
   * 결제는 위에서 이미 확인했으므로 그릇 자체는 결제 완료 상태로 만든다.
   */
  let projectId = await findProjectIdByPlan(plan.id, identity.hash);
  if (!projectId) {
    const project = await createProject(
      {
        opportunity: { title: plan.title, planId: plan.id, source: "plan-builder" },
        founderProfile: {},
        paymentStatus: "paid",
        packagePrice: 0,
      },
      identity.hash,
      identity.userId,
    );
    projectId = project.id;
  }

  // 이미 만들어 둔 홈페이지가 있으면 손대지 않는다 — 편집한 내용을 계획서로 덮으면 안 된다
  const existing = await getLandingForProject(projectId, identity.hash);
  if (existing) return NextResponse.json({ site: existing, projectId, ...entitlement, created: false });

  const draft = landingDraftFromPlan(source);
  try {
    const site = await saveLandingDraft(projectId, identity.hash, draft);
    return NextResponse.json({ site, projectId, ...entitlement, created: true }, { status: 201 });
  } catch (error) {
    // 주소가 겹치면 사업체 이름 뒤에 짧은 꼬리를 붙여 한 번 더 시도한다
    if (error instanceof Error && error.message === "SLUG_TAKEN") {
      const suffix = Math.random().toString(36).slice(2, 6);
      const site = await saveLandingDraft(projectId, identity.hash, {
        ...draft,
        slug: `${draft.slug}-${suffix}`.slice(0, 60),
      });
      return NextResponse.json({ site, projectId, ...entitlement, created: true }, { status: 201 });
    }
    throw error;
  }
}
