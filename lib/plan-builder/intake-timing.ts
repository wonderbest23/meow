import type { IntakeJob } from "./intake-types";

export const IDEA_CALL_TIMEOUT_MS = 60_000;
export const IDEA_RESULT_DEADLINE_MS = 120_000;

export const INTAKE_JOB_TIMING: Record<IntakeJob["kind"], { expectedMs: number; limitMs: number }> = {
  ideas: { expectedMs: 60_000, limitMs: IDEA_RESULT_DEADLINE_MS },
  design: { expectedMs: 35_000, limitMs: 60_000 },
  help: { expectedMs: 8_000, limitMs: 20_000 },
  extract: { expectedMs: 8_000, limitMs: 20_000 },
};

export function intakeJobExpired(job: IntakeJob | null | undefined, nowMs: number): boolean {
  if (!job || !["queued", "running"].includes(job.status)) return false;
  const start = Date.parse(job.kind === "ideas" ? job.createdAt ?? job.updatedAt : job.updatedAt);
  return Number.isFinite(start) && nowMs - start >= (job.kind === "ideas" ? IDEA_RESULT_DEADLINE_MS : 120_000);
}
