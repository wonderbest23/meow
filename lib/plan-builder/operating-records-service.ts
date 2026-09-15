import { readCoach } from "./coach";
import { loadPlanState, savePlanState, type ServerPlan } from "./plan-server-store";
import { OPERATING_KEY, OperatingError, applyOperatingCommand, readOperatingState, type OperatingCommand, type OperatingState } from "./operating-records";

export async function loadOperatingRecords(ownerHash: string, planId: string) {
  const state = await loadPlanState(ownerHash);
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) throw new OperatingError("PLAN_NOT_FOUND", "이 사업을 찾을 수 없어요.", 404);
  return { title: plan.title, records: readOperatingState(plan.answers) };
}

export async function saveOperatingRecords(ownerHash: string, planId: string, command: OperatingCommand) {
  return updateOperatingRecords(ownerHash, planId, (records, plan, at) => applyOperatingCommand(records, command, plan.title, at));
}

/** All operating-history mutations share the same compare-and-swap boundary. */
export async function updateOperatingRecords(ownerHash: string, planId: string, update: (records: OperatingState, plan: ServerPlan, at: string) => OperatingState) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await loadPlanState(ownerHash);
    const index = state.plans.findIndex(p => p.id === planId);
    if (index < 0) throw new OperatingError("PLAN_NOT_FOUND", "이 사업을 찾을 수 없어요.", 404);
    const plan = state.plans[index];
    const current = readOperatingState(plan.answers);
    const at = new Date(Math.max(Date.now(), Date.parse(plan.updatedAt) + 1 || 0)).toISOString();
    const records = update(current, plan, at);
    if (records === current) return { title: plan.title, records };
    state.plans[index] = { ...plan, updatedAt: at, answers: { ...plan.answers, [OPERATING_KEY]: records } };
    try {
      await savePlanState(ownerHash, state, { planId, coachRevision: readCoach(plan.answers)?.revision ?? 0, planUpdatedAt: plan.updatedAt });
      return { title: plan.title, records };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "PLAN_VERSION_CONFLICT") throw error;
    }
  }
  throw new OperatingError("SAVE_CONFLICT", "동시에 저장 중인 내용이 있어요. 입력 내용은 유지했어요. 잠시 후 다시 저장해 주세요.");
}
