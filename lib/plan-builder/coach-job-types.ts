import type { CoachMessage } from "./coach";

export const COACH_JOB_KEY = "__coach_job";
export type CoachJob = {
  token: string; runId: string; baseRevision: number; message: CoachMessage;
  status: "queued" | "running" | "complete" | "failed";
  phase: "queued" | "understanding" | "designing" | "saving";
  durable: boolean; dispatched?: boolean; attempt: number; updatedAt: string;
};
export type CoachJobRequest = { ownerHash: string; planId: string; token: string };
export function readCoachJob(answers: Record<string, Record<string, unknown>>): CoachJob | null {
  const job = answers[COACH_JOB_KEY] as CoachJob | undefined;
  return job?.token && job.message?.id ? job : null;
}
export function isCoachJobActive(job: CoachJob | null): boolean {
  return !!job && (job.status === "queued" || job.status === "running");
}
export function isCoachJobStale(job: CoachJob): boolean {
  return isCoachJobActive(job) && Date.now() - Date.parse(job.updatedAt) > 10 * 60_000;
}
