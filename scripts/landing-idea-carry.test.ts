import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANDING_IDEA_KEY, LANDING_IDEA_MAX, LANDING_IDEA_TTL_MS, clearLandingIdea, normalizeLandingIdea, readLandingIdea, stashLandingIdea, withoutLandingIdea } from "../lib/plan-builder/landing-idea";

/*
 * 랜딩 → 새 대화 아이디어 넘겨받기.
 * 랜딩은 /plan/chat?new=1&idea=<글> 로 보내고 sessionStorage 'oneul-landing-idea' = {text, at} 도 남긴다(5분).
 * 주소의 idea가 우선, 없으면 5분 안의 보관본. 글은 다듬어 1,200자까지만, HTML로 그리지 않는다.
 */
function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
const NOW = 1_800_000_000_000;
const stash = (text: unknown, at: unknown) => storage({ [LANDING_IDEA_KEY]: JSON.stringify({ text, at }) });
let passed = 0;
const check = (name: string, run: () => void) => { run(); passed++; void name; };

check("주소의 idea를 읽는다(인코딩 풀림·앞뒤 공백 정리)", () => {
  const search = `?new=1&idea=${encodeURIComponent("  맞벌이 가정에 반찬 정기배송  ")}`;
  assert.deepEqual(readLandingIdea(search, null, NOW), { text: "맞벌이 가정에 반찬 정기배송", source: "query" });
  assert.deepEqual(readLandingIdea(new URLSearchParams(search), null, NOW), { text: "맞벌이 가정에 반찬 정기배송", source: "query" });
});

check("주소가 보관본보다 우선한다", () => {
  const store = stash("보관본 아이디어", NOW - 1000);
  assert.equal(readLandingIdea("?new=1&idea=%EC%A3%BC%EC%86%8C", store, NOW)?.text, "주소");
  assert.equal(readLandingIdea("?new=1&idea=%EC%A3%BC%EC%86%8C", store, NOW)?.source, "query");
});

check("주소에 idea가 없거나 비어 있으면 5분 안의 보관본", () => {
  assert.deepEqual(readLandingIdea("?new=1", stash("무인 김밥 가게", NOW - 60_000), NOW), { text: "무인 김밥 가게", source: "storage" });
  assert.deepEqual(readLandingIdea("?new=1&idea=%20%20", stash("무인 김밥 가게", NOW - 60_000), NOW), { text: "무인 김밥 가게", source: "storage" });
  assert.equal(readLandingIdea("", stash("딱 5분", NOW - LANDING_IDEA_TTL_MS), NOW)?.text, "딱 5분");
});

check("5분이 지났거나 시각이 이상하면 보관본을 쓰지 않는다", () => {
  assert.equal(readLandingIdea("?new=1", stash("오래된 글", NOW - LANDING_IDEA_TTL_MS - 1), NOW), null);
  assert.equal(readLandingIdea("?new=1", stash("미래 글", NOW + 5 * 60_000), NOW), null);
  assert.equal(readLandingIdea("?new=1", stash("시각 없음", undefined), NOW), null);
  assert.equal(readLandingIdea("?new=1", stash("문자 시각", String(NOW)), NOW), null);
  assert.equal(readLandingIdea("?new=1", stash(42, NOW), NOW), null);
  assert.equal(readLandingIdea("?new=1", storage({ [LANDING_IDEA_KEY]: "{깨진 JSON" }), NOW), null);
  assert.equal(readLandingIdea("?new=1", storage(), NOW), null);
  assert.equal(readLandingIdea("?new=1", null, NOW), null);
  // 저장소 접근 자체가 막혀도 오류 없이 넘어간다
  assert.equal(readLandingIdea("?new=1", { getItem: () => { throw new Error("SecurityError"); } }, NOW), null);
});

check("1,200자로 자르고, 두 칸 글자(이모지)를 반으로 자르지 않는다", () => {
  const long = "가".repeat(LANDING_IDEA_MAX + 300);
  assert.equal(readLandingIdea(`?idea=${encodeURIComponent(long)}`, null, NOW)?.text.length, LANDING_IDEA_MAX);
  const emoji = `${"가".repeat(LANDING_IDEA_MAX - 1)}😀끝`;
  const cut = normalizeLandingIdea(emoji);
  assert.equal(cut, "가".repeat(LANDING_IDEA_MAX - 1));
  assert.ok(!/[\uD800-\uDBFF]$/.test(cut));
});

check("제어 문자·폭 없는 공백은 지우고 줄바꿈은 남긴다. HTML은 글자 그대로", () => {
  assert.equal(normalizeLandingIdea("반찬\u0000가게​\r\n정기배송\u0007"), "반찬가게\n정기배송");
  assert.equal(normalizeLandingIdea("​﻿  "), "");
  assert.equal(normalizeLandingIdea(null), "");
  assert.equal(normalizeLandingIdea({ text: "x" }), "");
  // 입력창(textarea value)에 평범한 글로만 넣는다 — 꺾쇠를 바꾸거나 실행하지 않는다
  const html = `<img src=x onerror="alert(1)">카페`;
  assert.equal(readLandingIdea(`?idea=${encodeURIComponent(html)}`, null, NOW)?.text, html);
});

check("주소에서 idea만 빼고 나머지는 그대로", () => {
  assert.equal(withoutLandingIdea("new=1&idea=%EB%B0%98%EC%B0%AC&utm=a"), "new=1&utm=a");
  assert.equal(withoutLandingIdea("?idea=x"), "");
  assert.equal(withoutLandingIdea("new=1"), "new=1");
  assert.equal(withoutLandingIdea(new URLSearchParams("planId=p1&idea=x")), "planId=p1");
});

check("보관본 지우기·다시 맡기기", () => {
  const store = stash("무인 김밥", NOW);
  clearLandingIdea(store);
  assert.equal(store.values.has(LANDING_IDEA_KEY), false);
  assert.doesNotThrow(() => clearLandingIdea({ setItem() {}, removeItem() { throw new Error("blocked"); } }));
  assert.doesNotThrow(() => clearLandingIdea(null));
  stashLandingIdea(store, "  로그인 기다리는 아이디어 ", NOW + 1000);
  assert.deepEqual(JSON.parse(store.values.get(LANDING_IDEA_KEY)!), { text: "로그인 기다리는 아이디어", at: NOW + 1000 });
  assert.equal(readLandingIdea("", store, NOW + 1000 + LANDING_IDEA_TTL_MS)?.text, "로그인 기다리는 아이디어");
  stashLandingIdea(store, "​", NOW);
  assert.equal(JSON.parse(store.values.get(LANDING_IDEA_KEY)!).text, "로그인 기다리는 아이디어");
});

check("대화 화면은 같은 보내기 길로 한 번만 보내고, 넘겨받으면 주소·보관본을 지운다", () => {
  const ui = readFileSync(new URL("../app/plan/chat/BusinessIntake.tsx", import.meta.url), "utf8");
  const block = ui.slice(ui.indexOf("const state = landingIdea.current;"), ui.indexOf("const settleUntil = useRef(0);"));
  assert.ok(block.length > 0);
  // 보내기는 입력창 보내기와 같은 함수 — 따로 서버에 보내지 않는다
  assert.match(block, /submitComposer\(\)/);
  assert.doesNotMatch(block, /\bsend\(|fetch\(/);
  // 로그인 안내 중에는 보내지 않고 보관본을 남긴다
  assert.match(block, /if \(loginGate\) \{[\s\S]*stashLandingIdea[\s\S]*return;\n    \}/);
  // 막혀 있으면 기다린다
  assert.match(block, /if \(answerBlocked\) return;/);
  // 넘겨받는 순간 보관본·주소의 idea를 지우고, 같은 화면에서 두 번 보내지 않는다
  assert.match(block, /clearLandingIdea\(storage\)/);
  assert.match(block, /searchParams\.delete\(LANDING_IDEA_PARAM\)[\s\S]*replaceState/);
  assert.match(block, /state\.phase = "done";\n      if \(entryMessage\(draftRef\.current\) === state\.text\) submitComposer\(\);/);
  // 주소에서 idea를 지워도 대화를 다시 불러오지 않는다
  assert.match(ui, /const queryString = withoutLandingIdea\(searchParams\);/);
  // HTML로 그리지 않는다
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML/);
});

console.log(JSON.stringify({ passed }));
