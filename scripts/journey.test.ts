import assert from "node:assert/strict";
import { journeyNext, journeySteps, journeyStepsText, payBackHref, payResultBackHref } from "../lib/plan-builder/journey";
import { LAUNCH_KEY, launchSchema, launchSteps } from "../lib/plan-builder/business-launch";
import { consultChatHref } from "../lib/consult/domain";
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

assert.deepEqual(states(talking, "none"), ["chat:active", "document:todo", "homepage:todo", "launch:todo", "care:todo"], "대화 중에는 1단계만 진행 중");
assert.deepEqual(states(complete, "none"), ["chat:done", "document:done", "homepage:todo", "launch:todo", "care:todo"], "계획서가 끝나면 다음은 홈페이지");
assert.deepEqual(states(complete, "draft"), ["chat:done", "document:done", "homepage:active", "launch:todo", "care:todo"]);
assert.deepEqual(states(complete, "published"), ["chat:done", "document:done", "homepage:done", "launch:todo", "care:active"], "공개하면 유지보수가 이어진다");
assert.deepEqual(states(complete, null), ["chat:done", "document:done", "homepage:todo", "launch:todo", "care:todo"], "홈페이지 확인 전에는 '아직'");

assert.equal(journeyNext(complete, "none").href, "/plan/homepage?planId=p");
assert.equal(journeyNext(complete, "draft").title, "홈페이지 다듬고 공개하기");
// 공개한 뒤에는 순서대로 4단계(사업 시작하기)부터 — 예전엔 4단계를 건너뛰고 유지보수로 갔다(여정 점검 2026-10-22)
assert.equal(journeyNext(complete, "published").href, "/plan/workspace?planId=p&tab=launch");
assert.equal(journeyNext(complete, "published").secondary?.href, "/plan/workspace?planId=p&tab=operations");
// 홈페이지 결제 없이도 사업 시작 준비로 넘어갈 수 있다
assert.equal(journeyNext(complete, "none").secondary?.href, "/plan/workspace?planId=p&tab=launch");
assert.equal(journeyNext(complete, "none").secondary?.title, "사업 시작 준비 먼저 하기");
{
  const configured = launchSchema.parse({ configured: true });
  const records = Object.fromEntries(launchSteps(complete, configured).map(step => [step.id, { status: "done", signature: step.signature, note: "", material: "", at }]));
  const launched: Plan = { ...complete, answers: { ...complete.answers, [LAUNCH_KEY]: { ...configured, records } } };
  assert.deepEqual(states(launched, "published"), ["chat:done", "document:done", "homepage:done", "launch:done", "care:active"]);
  assert.equal(journeyNext(launched, "published").href, "/plan/workspace?planId=p&tab=operations", "사업 시작 준비까지 마치면 유지보수");
  assert.equal(journeyNext(launched, "none").secondary, undefined);
}
assert.equal(journeyStepsText(), "① 대화로 사업안 정리 → ② 사업계획서 작성 → ③ 홈페이지 만들기 → ④ 사업 시작하기(운영 중이면 운영 개선하기) → ⑤ 유지보수");
assert.equal(journeySteps(complete, "none")[1].href, "/plan/document?planId=p");
assert.equal(payBackHref(null, "p"), "/plan/document?planId=p", "결제 '나중에 하기'·← 는 그 사업의 계획서로");
assert.equal(payBackHref("domain", "p"), "/plan/homepage?planId=p", "홈페이지 쪽 상품은 그 사업의 홈페이지로");
assert.equal(payBackHref("plan", null), "/plan");
assert.equal(payResultBackHref("bundle", "p"), "/plan/document?planId=p", "묶음 결제가 끝나면 계획서부터");
assert.equal(payResultBackHref("tokens", null), "/plan/homepage");
assert.equal(consultChatHref({}), "/plan/chat?new=1", "상담 내용이 없으면 빈 새 대화");
const handoff = new URL(consultChatHref({ region: "마포구", interest: "카페" }, "무인 카페"), "https://x");
assert.equal(handoff.searchParams.get("new"), "1");
assert.match(handoff.searchParams.get("prompt") ?? "", /무인 카페/, "추천 카드에서 고른 아이템이 넘어간다");
assert.match(handoff.searchParams.get("prompt") ?? "", /마포구/, "상담에서 들은 조건이 넘어간다");
console.log("journey: passed (chat → document → homepage → care states and next step)");
