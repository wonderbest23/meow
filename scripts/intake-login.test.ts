import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guestIntakeOpen, intakeLoginGate } from "../lib/plan-builder/intake-login";

// 손님 대화가 닫혀 있을 때(guestAllowed=false): 비로그인 방문자는 막고 로그인한 사람은 통과
assert.equal(intakeLoginGate({ authConfigured: true, guestAllowed: false, userId: null }), true);
assert.equal(intakeLoginGate({ authConfigured: true, guestAllowed: false, userId: "user-1" }), false);
// 손님 대화가 열려 있으면 비로그인 방문자도 통과(AI 비용은 손님 하루 한도 guest-ai-budget 가 묶는다)
assert.equal(intakeLoginGate({ authConfigured: true, guestAllowed: true, userId: null }), false);
// 로그인 서버가 없는 로컬·테스트 환경은 막지 않는다
assert.equal(intakeLoginGate({ authConfigured: false, guestAllowed: false, userId: null }), false);

/*
 * 예전 이 시험은 '운영은 손님을 막는다'(INTAKE_GUEST_ALLOWED 없음)를 전제로 했다.
 * 사장님 결정(2026-11-17 "한도 걸고 열어줘")으로 운영 vars 에 INTAKE_GUEST_ALLOWED=1 을 넣었다.
 * 다만 로그인 때 손님 사업을 계정으로 옮기는 스위치(PLAN_ACCOUNT_LINKING_ENABLED=true)가 꺼져 있으면 열지 않는다 —
 * 꺼진 채 열면 손님이 대화하다 로그인했을 때 사업이 계정에 보이지 않는다(2026-09 에 손님을 막은 이유).
 */
assert.equal(guestIntakeOpen({ INTAKE_GUEST_ALLOWED: "1", PLAN_ACCOUNT_LINKING_ENABLED: "true" }), true);
assert.equal(guestIntakeOpen({ INTAKE_GUEST_ALLOWED: "1" }), false, "계정 옮기기 스위치가 꺼져 있으면 열지 않는다");
assert.equal(guestIntakeOpen({ INTAKE_GUEST_ALLOWED: "1", PLAN_ACCOUNT_LINKING_ENABLED: "false" }), false);
assert.equal(guestIntakeOpen({ PLAN_ACCOUNT_LINKING_ENABLED: "true" }), false, "손님 열기 스위치가 없으면 닫힘");
assert.equal(guestIntakeOpen({ INTAKE_GUEST_ALLOWED: "true", PLAN_ACCOUNT_LINKING_ENABLED: "true" }), false, "값은 정확히 1");

// 첫 화면도 서버의 손님 대화 여부를 따른다 — 서버만 열고 첫 화면이 로그인 창을 띄우면 손님은 여전히 막힌다(로컬 시험 2026-11-17)
const session = readFileSync(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
assert.match(session, /authenticated: false, email: null, projects: \[\], guestIntake: guestIntakeOpen\(\)/, "로그인 안 한 세션 응답이 손님 대화 여부를 알려 준다");
const planList = readFileSync(new URL("../app/plan/PlanList.tsx", import.meta.url), "utf8");
assert.match(planList, /const loginToStart = guest && !guestIntake;/);
assert.match(planList, /<Composer guest=\{loginToStart\} \/>/, "첫 화면 입력칸은 손님 대화가 열려 있으면 로그인 창을 띄우지 않는다");
// 입력칸 아래 '다른 시작' 링크 줄과 '완성 예시' 줄은 뺐다(2026-11-17 사장님) — 첫 화면에서 대화를 여는 길은 입력칸 하나
assert.doesNotMatch(planList, /aria-label="다른 시작"|aria-label="완성 예시"/, "첫 화면에 다른 시작 · 완성 예시 줄이 다시 생겼다");

console.log(JSON.stringify({ passed: 13 }));
