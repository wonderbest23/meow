import { requireGuestIdentity } from "../../../../lib/api-auth";
import { COACH_KEY, COACH_TYPES, type CoachState } from "../../../../lib/plan-builder/coach";
import { emptyCoach } from "../../../../lib/plan-builder/coach-job";
import { LAUNCH_KEY, launchSchema, launchSteps } from "../../../../lib/plan-builder/business-launch";
import { loadPlanState, savePlanState, type ServerPlan } from "../../../../lib/plan-builder/plan-server-store";

export async function POST() {
  if (process.env.NODE_ENV !== "development" || process.env.PERSISTENCE_MODE !== "demo-memory" || process.env.BUSINESS_JOURNEY_LAB !== "true" || process.env.SUPABASE_URL) return new Response(null, { status: 404 });
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const id = "operating-journey-local";
  if (!state.plans.some(plan => plan.id === id)) {
    const at = new Date().toISOString();
    const coach: CoachState = { ...emptyCoach(), revision: 3, documentRevision: 2, stage: "operating", ready: true, business: { ...emptyCoach().business, name: "검증용 메뉴 사진 사업", description: "동네 가게의 메뉴 사진을 제작해요", stage: "운영 중" }, fields: [
      { key: "business", value: "동네 가게 메뉴 사진 제작", basis: "user", quote: "동네 가게 메뉴 사진 제작", messageId: "fixture" },
      { key: "sales", value: "이번 달 실제 매출 30만원", basis: "user", quote: "이번 달 실제 매출 30만원", messageId: "fixture" },
    ] };
    const plan: ServerPlan = { id, title: coach.business.name, planType: COACH_TYPES.startup, createdAt: at, updatedAt: at, answers: { [COACH_KEY]: { state: coach } }, sections: { "overview/summary": { markdown: "창업할 때 직접 작성한 계획서", html: "<p>창업할 때 직접 작성한 계획서</p>", edited: true, generatedAt: at, coachRevision: 1 } } };
    const launch = launchSchema.parse({ configured: true, workplace: "remote", registered: "yes" });
    const operations = launchSteps(plan, launch).find(step => step.id === "operations")!;
    launch.records.operations = { status: "done", signature: operations.signature, note: "첫 고객과 약속한 촬영 범위", material: "직접 정한 운영 범위: 주 2회 촬영", at };
    plan.answers[LAUNCH_KEY] = launch;
    state.plans.push(plan);
    await savePlanState(identity.hash, state);
  }
  return Response.json({ href: `/plan/workspace?planId=${id}&tab=launch` }, { headers: { "Cache-Control": "no-store" } });
}
