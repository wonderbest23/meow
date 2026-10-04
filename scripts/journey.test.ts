import assert from "node:assert/strict";
import { journeyNext, journeySteps } from "../lib/plan-builder/journey";
import { businessHubState } from "../lib/plan-builder/business-hub";
import { applyCoachReply, COACH_KEY, COACH_TYPES } from "../lib/plan-builder/coach";
import type { Plan } from "../lib/plan-builder/plan-store";

const at = "2026-10-03T00:00:00Z";
const message = { id: "m1", role: "user" as const, text: "사진 사업", at };
const coach = applyCoachReply(null, { title: "사진 사업", message: "좋아요.", stage: "startup", depth: "quick", ready: false, fields: [], suggestions: [] }, message);
const talking: Plan = { id: "p", title: "사진 사업", planType: COACH_TYPES.startup, createdAt: at, updatedAt: at, answers: { [COACH_KEY]: { state: coach } }, sections: {} };
const keys = businessHubState(talking).keys;
const complete: Plan = { ...talking, sections: Object.fromEntries(keys.map(key => [key, { markdown: "본문" } as Plan["sections"][string]])) };
const states = (plan: Plan, homepage: Parameters<typeof journeySteps>[1]) => journeySteps(plan, homepage).map(step => `${step.id}:${step.state}`);

assert.deepEqual(states(talking, "none"), ["chat:active", "document:todo", "homepage:todo", "care:todo"], "대화 중에는 1단계만 진행 중");
assert.deepEqual(states(complete, "none"), ["chat:done", "document:done", "homepage:todo", "care:todo"], "계획서가 끝나면 다음은 홈페이지");
assert.deepEqual(states(complete, "draft"), ["chat:done", "document:done", "homepage:active", "care:todo"]);
assert.deepEqual(states(complete, "published"), ["chat:done", "document:done", "homepage:done", "care:active"], "공개하면 유지보수가 이어진다");
assert.deepEqual(states(complete, null), ["chat:done", "document:done", "homepage:todo", "care:todo"], "홈페이지 확인 전에는 '아직'");

assert.equal(journeyNext(complete, "none").href, "/plan/homepage?planId=p");
assert.equal(journeyNext(complete, "draft").title, "홈페이지 다듬고 공개하기");
assert.equal(journeyNext(complete, "published").href, "/plan/workspace?planId=p&tab=operations");
assert.equal(journeySteps(complete, "none")[1].href, "/plan/document?planId=p");
console.log("journey: passed (chat → document → homepage → care states and next step)");
