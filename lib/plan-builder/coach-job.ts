import { resolvePlanningLLMConfig } from "../llm/config";
import { COACH_KEY, COACH_TYPES, COACH_VERSION, readCoach, type CoachState } from "./coach";
import { completeCoachReply } from "./coach-reply";
import { COACH_JOB_KEY, readCoachJob, type CoachJob, type CoachJobRequest } from "./coach-job-types";
import { loadPlanState, savePlanState } from "./plan-server-store";

export function emptyCoach(): CoachState {
  return { version: COACH_VERSION, revision: 0, documentRevision: 0, stage: "exploring", depth: "quick", ready: false, fields: [], messages: [], suggestions: [], business: { name: "새 사업 구상", description: "", role: "", industry: "", region: "", stage: "사업 기획" } };
}

export async function updateCoachJob(request: CoachJobRequest, patch: Partial<Pick<CoachJob, "phase" | "status">>) {
  const state = await loadPlanState(request.ownerHash);
  const plan = state.plans.find(p => p.id === request.planId);
  const job = plan && readCoachJob(plan.answers);
  if (!plan || !job || job.token !== request.token || job.status === "complete") throw new Error("COACH_JOB_SUPERSEDED");
  plan.answers[COACH_JOB_KEY] = { ...job, ...patch, updatedAt: new Date().toISOString() };
  plan.updatedAt = new Date().toISOString();
  await savePlanState(request.ownerHash, state, { planId: plan.id, coachRevision: job.baseRevision, jobToken: request.token });
}

export async function generateAndSaveCoach(request: CoachJobRequest): Promise<{ ok: boolean }> {
  const state = await loadPlanState(request.ownerHash);
  const plan = state.plans.find(p => p.id === request.planId);
  const job = plan && readCoachJob(plan.answers);
  const previous = plan && readCoach(plan.answers);
  if (!plan || !job || !previous || job.token !== request.token) throw new Error("COACH_JOB_NOT_FOUND");
  if (job.status === "complete" || previous.messages.some(message => message.id === job.message.id)) return { ok: true };
  // Claim once. Concurrent deliveries cannot start another paid model request.
  if (job.status !== "queued" || previous.revision !== job.baseRevision) throw new Error("COACH_JOB_NOT_QUEUED");
  const updatedAt = plan.updatedAt;
  plan.answers[COACH_JOB_KEY] = { ...job, status: "running", phase: "understanding", updatedAt: new Date().toISOString() };
  plan.updatedAt = new Date().toISOString();
  await savePlanState(request.ownerHash, state, { planId: plan.id, coachRevision: job.baseRevision, jobToken: request.token, jobStatus: "queued", planUpdatedAt: updatedAt });
  try {
    const config = resolvePlanningLLMConfig(request.ownerHash);
    if (!config) throw new Error("COACH_AI_UNAVAILABLE");
    const coach = await completeCoachReply(config, previous.revision ? previous : null, job.message, async phase => updateCoachJob(request, { phase }));
    if (!coach) throw new Error("COACH_GENERATION_FAILED");
    await updateCoachJob(request, { phase: "saving" });
    const fresh = await loadPlanState(request.ownerHash);
    const target = fresh.plans.find(p => p.id === request.planId);
    const current = target && readCoachJob(target.answers);
    if (!target || current?.token !== request.token) throw new Error("COACH_JOB_SUPERSEDED");
    target.answers[COACH_KEY] = { state: coach };
    target.answers[COACH_JOB_KEY] = { ...current, status: "complete", updatedAt: new Date().toISOString() };
    target.title = coach.business.name;
    if (!Object.keys(target.sections).length) target.planType = COACH_TYPES[coach.stage === "operating" ? "operating" : "startup"];
    target.updatedAt = new Date().toISOString();
    await savePlanState(request.ownerHash, fresh, { planId: target.id, coachRevision: job.baseRevision, jobToken: request.token });
    return { ok: true };
  } catch (error) {
    await updateCoachJob(request, { status: "failed" }).catch(() => undefined);
    throw error;
  }
}
