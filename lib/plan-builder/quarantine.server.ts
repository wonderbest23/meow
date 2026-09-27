import "server-only";
import { getServerSupabase } from "../persistence";

export function planQuarantineEnabled() { return process.env.PLAN_QUARANTINE_ENABLED === "1"; }
export function planStateReadTable() { return planQuarantineEnabled() ? "plan_states_accessible" : "plan_states"; }

export interface PlanQuarantineStatus {
  revision: string;
  blockedPlanIds: string[];
  profileBlocked: boolean;
  blockedProjectIds: string[];
}

export async function readPlanQuarantine(owner: string, planIds: string[] = [], projectIds: string[] = []): Promise<PlanQuarantineStatus> {
  if (!planQuarantineEnabled()) return { revision: "", blockedPlanIds: [], profileBlocked: false, blockedProjectIds: [] };
  const db = getServerSupabase();
  if (!db) throw new Error("PLAN_QUARANTINE_UNAVAILABLE");
  const { data, error } = await db.rpc("plan_quarantine_status", { p_owner: owner, p_plan_ids: planIds, p_project_ids: projectIds });
  if (error || !data || !Array.isArray(data.blockedPlanIds) || !Array.isArray(data.blockedProjectIds) || typeof data.profileBlocked !== "boolean" || typeof data.revision !== "string") throw new Error("PLAN_QUARANTINE_UNAVAILABLE");
  return data as PlanQuarantineStatus;
}

export async function assertPlanAvailable(owner: string, planIds: string[]) {
  const status = await readPlanQuarantine(owner, planIds);
  if (planIds.some(id => status.blockedPlanIds.includes(id))) throw new Error("PLAN_QUARANTINED");
}
