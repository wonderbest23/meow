import assert from "node:assert/strict";
import { chatEntryIntent, planningListPlans, businessChatHref, workspaceHref } from "../lib/plan-builder/business-hub";
import { applyCoachReply, COACH_KEY, COACH_TYPES } from "../lib/plan-builder/coach";
import { COACH_JOB_KEY, type CoachJob } from "../lib/plan-builder/coach-job-types";
import type { Plan } from "../lib/plan-builder/plan-store";

for (const [query, expected] of [
  ["", "resume"], ["new=0", "resume"], ["new=1", "new"],
  ["prompt=idea", "new"], ["planId=existing", "resume"],
  ["planId=existing&new=1", "resume"], ["planId=existing&prompt=edit", "resume"],
] as const) assert.equal(chatEntryIntent(new URLSearchParams(query)), expected, query);

const message = { id: "message-1", role: "user" as const, text: "사진 사업을 하고 싶어요", at: "2026-09-11T00:00:00Z" };
const coach = applyCoachReply(null, {
  title: "사진 사업", message: "함께 구체화해 볼게요.", stage: "startup", depth: "quick", ready: false,
  fields: [], suggestions: [],
}, message);
const base: Plan = { id: "legacy", title: "기존 계획서", planType: COACH_TYPES.startup, createdAt: message.at, updatedAt: message.at, answers: {}, sections: {} };
const conversation: Plan = { ...base, id: "conversation", answers: { [COACH_KEY]: { state: coach } } };
const job: CoachJob = { token: "job-token", runId: "run-id", baseRevision: 0, message, status: "queued", phase: "queued", durable: true, attempt: 1, updatedAt: message.at };
const pending: Plan = { ...base, id: "pending", updatedAt: "2026-09-11T01:00:00Z", answers: { [COACH_JOB_KEY]: job } };
const plans = [base, conversation, pending];
assert.deepEqual(planningListPlans(plans).map(plan => plan.id), ["pending", "conversation"]);
assert.deepEqual(plans.map(plan => plan.id), ["legacy", "conversation", "pending"], "Listing must not reorder the stored plans");
assert.deepEqual(planningListPlans([]), []);
assert.deepEqual(planningListPlans([{ ...base, answers: { [COACH_KEY]: {}, [COACH_JOB_KEY]: {} } }]), []);

const id = "business / 1";
const chat = new URL(businessChatHref(id, "상품을 다듬어 주세요"), "http://localhost:8083");
assert.equal(chat.pathname, "/plan/chat");
assert.equal(chat.searchParams.get("planId"), id);
assert.equal(chat.searchParams.has("new"), false);
assert.equal(chatEntryIntent(chat.searchParams), "resume");
assert.equal(new URL(workspaceHref(id), chat.origin).searchParams.get("planId"), id);
console.log("business navigation: passed (new/resume intent, planning list, selected-business links)");
