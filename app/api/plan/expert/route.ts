import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState, savePlanState } from "../../../../lib/plan-builder/plan-server-store";
import { readCoach } from "../../../../lib/plan-builder/coach";
import { isCoachJobActive, readCoachJob } from "../../../../lib/plan-builder/coach-job-types";
import { applyExpertPatch, expertPatchSchema } from "../../../../lib/plan-builder/coach-expert";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function PATCH(request: Request) {
  const limited = await enforceRateLimit("business-expert", request, { limit: 30, windowMs: 600000 });
  if (limited) return limited;
  const parsed = expertPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "수정할 항목을 다시 확인해주세요." }, 400);
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const plan = state.plans.find(p => p.id === parsed.data.planId);
  const coach = plan && readCoach(plan.answers);
  if (!plan || !coach) return json({ message: "수정할 사업을 찾을 수 없어요." }, 404);
  if (coach.messages.some(m => m.id === parsed.data.requestId)) return json({ plan, duplicate: true });
  if (coach.revision !== parsed.data.revision) return json({ message: "다른 화면에서 사업 정보가 바뀌었어요. 최신 정보를 확인한 뒤 다시 수정해주세요." }, 409);
  const job = readCoachJob(plan.answers);
  if (isCoachJobActive(job)) return json({ message: "AI가 답변을 정리 중이에요. 완료 후 수정해주세요." }, 409);
  const result = applyExpertPatch(plan.answers, parsed.data, new Date().toISOString());
  if (!result.changes.length) return json({ plan });
  const updatedAt = plan.updatedAt;
  plan.answers = result.answers;
  plan.title = result.coach.business.name;
  plan.updatedAt = new Date().toISOString();
  try {
    await savePlanState(identity.hash, state, { planId: plan.id, coachRevision: coach.revision, planUpdatedAt: updatedAt, jobToken: job?.token ?? null });
  } catch { return json({ message: "저장 중 다른 변경이 있었어요. 최신 정보를 불러온 뒤 다시 시도해주세요." }, 409); }
  return json({ plan });
}
