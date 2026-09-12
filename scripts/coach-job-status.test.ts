import assert from "node:assert/strict";
import { reconcileCoachJob } from "../lib/plan-builder/coach-job-status";
import { applyCoachReply, COACH_KEY, COACH_TYPES } from "../lib/plan-builder/coach";
import { COACH_JOB_KEY, type CoachJob } from "../lib/plan-builder/coach-job-types";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

const message = { id: "message-1", role: "user" as const, text: "아이디어가 없어요", at: "2026-09-11T03:00:00Z" };
const coach = applyCoachReply(null, { message: "어떤 일을 좋아하세요?", title: "사업 탐색", stage: "exploring", depth: "quick", ready: false, fields: [], suggestions: [] }, message);
const job: CoachJob = { token: "old-token", runId: "run-1", baseRevision: 0, message, status: "running", phase: "understanding", durable: true, attempt: 1, updatedAt: message.at };
const plan: ServerPlan = { id: "qa", title: "사업 탐색", planType: COACH_TYPES.startup, createdAt: message.at, updatedAt: message.at, answers: { [COACH_KEY]: { state: coach }, [COACH_JOB_KEY]: job }, sections: {} };

const saved = { ...plan, answers: { ...plan.answers, [COACH_JOB_KEY]: { ...job, status: "complete" } } };
const result = reconcileCoachJob(saved, job.token, "complete");
assert.equal(result.plan, saved, "Return the refreshed business snapshot, not the pre-completion snapshot");
assert.equal(result.job?.status, "complete");
assert.equal(reconcileCoachJob(plan, job.token, "complete").job?.status, "complete", "A saved reply is not a failure even if its job flag is stale");
assert.equal(reconcileCoachJob(plan, job.token, "errored").job?.status, "complete", "A saved reply wins over a late workflow error");
const unsaved = { ...plan, answers: { ...plan.answers, [COACH_KEY]: { state: { ...coach, messages: [] } } } };
for (const status of ["complete", "errored", "terminated"]) assert.equal(reconcileCoachJob(unsaved, job.token, status).job?.status, "failed", "An actual missing result still exposes retry");
const newJob = { ...unsaved, answers: { ...unsaved.answers, [COACH_JOB_KEY]: { ...job, token: "new-token", status: "queued" } } };
assert.equal(reconcileCoachJob(newJob, job.token, "complete").job?.status, "queued", "An old workflow must not fail or complete a replacement job");
assert.equal(reconcileCoachJob(unsaved, job.token, "running").job?.dispatched, true);
assert.equal(reconcileCoachJob({ ...plan, answers: {} }, job.token, "complete").job, null);
assert.equal(job.status, "running", "Status reconciliation must not mutate stored input");
console.log("coach job reconciliation: passed (completion race, saved response, actual failure, replacement job)");
