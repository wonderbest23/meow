import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPLY_SUGGESTION_FRESH_MS, replySuggestionAllowed } from "../lib/plan-builder/reply-suggestion";

/*
 * 대화 입력창 '답 추천'(reply-suggestion) — 2026-11-28 운영: 계획서 단계 사업을 다시 열기만 해도 열 때마다 오퍼스를 불렀다(한 번 약 10원, 3번).
 * 서버: 마지막 말이 코치 답이고 10분 안일 때만 AI. 화면: 연 뒤 대화가 새로 오갔을 때만, 받은 추천은 탭에 두고 다시 묻지 않는다.
 */
const now = Date.parse("2026-11-28T13:30:00.000Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const msg = (role: "user" | "assistant", at?: string) => ({ role, text: "…", ...(at ? { at } : {}) });

// 1) 서버가 AI 를 불러도 되는지
assert.equal(replySuggestionAllowed([], now), false, "대화가 없으면 X");
assert.equal(replySuggestionAllowed([msg("assistant", ago(60_000)), msg("user", ago(30_000))], now), false, "마지막이 손님 말이면(답을 기다리는 중) X");
assert.equal(replySuggestionAllowed([msg("user", ago(70_000)), msg("assistant", ago(60_000))], now), true, "방금 코치가 답했으면 O");
assert.equal(replySuggestionAllowed([msg("assistant", ago(REPLY_SUGGESTION_FRESH_MS - 1000))], now), true, "10분 안 O");
assert.equal(replySuggestionAllowed([msg("assistant", ago(REPLY_SUGGESTION_FRESH_MS + 1000))], now), false, "10분 넘게 지난(끝난 · 다시 연) 대화 X");
assert.equal(replySuggestionAllowed([msg("assistant", ago(3 * 24 * 3_600_000))], now), false, "이틀 전 대화 X — 운영에서 다시 열 때마다 부르던 경우");
assert.equal(replySuggestionAllowed([msg("assistant")], now), false, "시각이 없으면 X");
assert.equal(replySuggestionAllowed([msg("assistant", "언젠가")], now), false, "시각을 못 읽으면 X");
assert.equal(replySuggestionAllowed([msg("assistant", new Date(now + 30_000).toISOString())], now), true, "시계가 조금 어긋난 정도는 O");
assert.equal(replySuggestionAllowed([msg("assistant", new Date(now + 10 * 60_000).toISOString())], now), false, "미래 시각 X");

// 2) 서버 연결 — 조건은 손님 AI 한도를 세기 전, AI 를 부르기 전
const route = readFileSync(new URL("../app/api/plan/chat/reply-suggestion/route.ts", import.meta.url), "utf8");
const gate = route.indexOf("!replySuggestionAllowed(coach.messages)");
assert.ok(gate > 0, "서버가 대화가 방금 움직였는지 본다");
assert.ok(gate < route.indexOf("chargeGuestAi(") && gate < route.indexOf("await suggestReply("), "한도를 세거나 AI 를 부르기 전에 막는다");

// 3) 화면 — 연 뒤 대화가 새로 오갔을 때만, 받은 추천은 탭에 두고 다시 묻지 않는다
const ui = readFileSync(new URL("../app/plan/chat/BusinessIntake.tsx", import.meta.url), "utf8");
assert.match(ui, /if \(plan\?\.planId && !replyHintBase\.current\.has\(plan\.planId\)\) replyHintBase\.current\.set\(plan\.planId, plan\.coach\.messages\.length\);/, "처음 연 때의 대화 수를 적어 둔다");
assert.match(ui, /const replyHintMoved = !!plan\?\.planId && plan\.coach\.messages\.length > \(replyHintBase\.current\.get\(plan\.planId\) \?\? Infinity\);/, "그보다 늘었을 때만 '움직임'");
const effect = ui.slice(ui.indexOf("const storageKey = `oneul-reply-hint:"), ui.indexOf("}, [replyHintKey, replyHintMoved]);"));
assert.ok(effect.indexOf("sessionStorage.getItem") >= 0 && effect.indexOf("sessionStorage.getItem") < effect.indexOf("fetch(\"/api/plan/chat/reply-suggestion\""), "받은 추천이 있으면 묻기 전에 그걸 쓴다");
assert.ok(effect.indexOf("if (!replyHintMoved) return;") >= 0 && effect.indexOf("if (!replyHintMoved) return;") < effect.indexOf("fetch("), "다시 열기만 했으면 부르지 않는다");
assert.match(effect, /sessionStorage\.setItem\(storageKey, data\.reply\)/, "받은 추천을 탭에 둔다");
assert.equal((ui.match(/\/api\/plan\/chat\/reply-suggestion/g) ?? []).length, 1, "답 추천을 부르는 곳은 한 군데");

console.log("reply suggestion: server calls AI only right after a coach reply (10 min), reopened screens never call, cached per tab");
