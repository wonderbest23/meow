import { readCoach } from "./coach";
import { isCoachJobActive, readCoachJob } from "./coach-job-types";
import type { ServerPlan } from "./plan-server-store";

export function reconcileCoachJob(plan: ServerPlan, checkedToken: string, workflowStatus: string) {
  const job = readCoachJob(plan.answers);
  if (!job || job.token !== checkedToken || !isCoachJobActive(job)) return { plan, job };
  if (["complete", "errored", "terminated"].includes(workflowStatus)) {
    const saved = readCoach(plan.answers)?.messages.some(message => message.id === job.message.id);
    return { plan, job: { ...job, status: saved ? "complete" as const : "failed" as const } };
  }
  return { plan, job: { ...job, dispatched: true } };
}
