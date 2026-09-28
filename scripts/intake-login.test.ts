import assert from "node:assert/strict";
import { intakeLoginGate } from "../lib/plan-builder/intake-login";

// 운영(로그인 서버 있음): 비로그인 방문자는 막고 로그인한 사람은 통과
assert.equal(intakeLoginGate({ authConfigured: true, guestAllowed: false, userId: null }), true);
assert.equal(intakeLoginGate({ authConfigured: true, guestAllowed: false, userId: "user-1" }), false);
// 비상 스위치로 비로그인 체험을 다시 열 수 있다
assert.equal(intakeLoginGate({ authConfigured: true, guestAllowed: true, userId: null }), false);
// 로그인 서버가 없는 로컬·테스트 환경은 막지 않는다
assert.equal(intakeLoginGate({ authConfigured: false, guestAllowed: false, userId: null }), false);

console.log(JSON.stringify({ passed: 4 }));
