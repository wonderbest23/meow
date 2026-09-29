import assert from "node:assert/strict";
import { normalizeGeneratedDesign } from "../lib/plan-builder/coach-design";
import { designFixture } from "./fixtures/coach-design";

const base = designFixture();
// 정상 설계는 그대로 통과한다
assert.deepEqual(normalizeGeneratedDesign(base), base);

// 목표 길이를 조금 넘긴 첫 화면 문구는 받아 주고, 너무 긴 이름 후보만 뺀다
const long = normalizeGeneratedDesign({
  ...base,
  identity: {
    headline: "가".repeat(55),
    pitch: "나".repeat(150),
    names: [{ name: "메뉴한컷", why: "짧다" }, { name: "이름이스물다섯글자를넘어가는아주긴사업이름후보입니다", why: "길다" }, { name: "가게사진관", why: "다".repeat(200) }, { name: "넷째", why: "셋까지 남긴다" }, { name: "다섯째", why: "넘친다" }],
  },
});
assert.ok(long?.identity);
assert.equal(long.identity.headline.length, 55);
assert.equal(long.identity.pitch.length, 150);
assert.deepEqual(long.identity.names.map(item => item.name), ["메뉴한컷", "가게사진관", "넷째"]);
assert.equal(long.identity.names[1].why.length, 120);
assert.ok(long.identity.names[1].why.endsWith("…"));

// 한도를 크게 넘긴 헤드라인은 잘라서 저장한다
assert.equal(normalizeGeneratedDesign({ ...base, identity: { ...base.identity!, headline: "라".repeat(90) } })?.identity?.headline.length, 60);

// 첫 화면 문구를 쓸 수 없으면 그 부분만 빼고 사업안은 살린다
for (const identity of [undefined, null, "문자열", { headline: "", pitch: "소개", names: [{ name: "이름", why: "이유" }] }, { headline: "한 줄", pitch: "소개", names: [] }]) {
  const saved = normalizeGeneratedDesign({ ...base, identity });
  assert.ok(saved, `design survives identity ${JSON.stringify(identity)}`);
  assert.equal(saved.identity, undefined);
  assert.equal(saved.startingPlan.scope, base.startingPlan.scope);
}

// 긴 본문·많은 항목은 한도에서 자른다
const overflow = normalizeGeneratedDesign({ ...base, startingPlan: { ...base.startingPlan, scope: "마".repeat(700), notIncluded: Array(8).fill("제외") }, alternatives: Array(4).fill(base.alternatives[0]), nextAction: { ...base.nextAction, usableText: "바".repeat(1500) } });
assert.equal(overflow?.startingPlan.scope.length, 600);
assert.equal(overflow?.startingPlan.notIncluded.length, 5);
assert.equal(overflow?.alternatives.length, 2);
assert.equal(overflow?.nextAction.usableText.length, 1200);

// 핵심 칸이 비었거나 형식이 틀리면 여전히 실패로 본다
assert.equal(normalizeGeneratedDesign({ ...base, approach: "unknown" }), null);
assert.equal(normalizeGeneratedDesign({ ...base, startingPlan: { ...base.startingPlan, scope: "" } }), null);
assert.equal(normalizeGeneratedDesign(null), null);

console.log(JSON.stringify({ passed: 20 }));
