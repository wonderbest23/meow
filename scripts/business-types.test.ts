import assert from "node:assert/strict";
import { BUSINESS_TYPES, businessTypeContext, businessTypeFocus, businessTypeFor, type BusinessTypeId } from "../lib/plan-builder/business-types";
import { SECTOR_DEFAULT_STRUCTURE } from "../lib/plan-builder/business-structure";
import { EVAL_CASES } from "./plan-eval/cases";
import { sectionPromptV3Rules } from "../lib/plan-builder/section-prompt-v3";

/*
 * 사업 유형(docs/사업-유형-지도-2026-10-11.md) — 같은 사업이면 언제나 같은 유형이 나와야 한다(규칙으로만 정한다).
 * 시험 사업 20개는 지도에 적은 유형 그대로, 플랫폼·앱 사업도 맞는 유형으로.
 */
const expected: Record<string, BusinessTypeId | null> = {
  bakery: "store", cafe: "store", nail: "store", pt: "store", "gimbap-op": "store",
  laundry: "visit", moving: "visit", "plant-care": "visit",
  candle: "ship", "dog-treat": "ship", sidedish: "ship", "fashion-op": "ship",
  coding: "lesson", "korean-tutor": "lesson",
  pension: "space", "practice-room": "space",
  photo: "b2b", booking: "b2b", "sns-agency": "b2b",
  "senior-match": "platform", "petsitter-match": "platform", "recipe-app": "app",
};
const text = (answers: Record<string, string | number>, key: string) => typeof answers[key] === "string" ? answers[key] as string : "";
for (const item of EVAL_CASES) {
  const got = businessTypeFor({ description: `${text(item.answers, "business")} ${text(item.answers, "offer")}`, customer: text(item.answers, "customer"), structure: SECTOR_DEFAULT_STRUCTURE[(item.sector ?? "general") as keyof typeof SECTOR_DEFAULT_STRUCTURE] });
  assert.ok(item.id in expected, `type map covers ${item.id}`);
  assert.equal(got?.type.id ?? null, expected[item.id], `${item.id} (${item.label}) → ${expected[item.id]}`);
}

// 플랫폼·앱 — 업종 말보다 사업의 모양(연결·앱)이 먼저
assert.equal(businessTypeFor({ description: "반려동물 주인과 동네 펫시터를 연결해 주는 앱" })?.type.id, "platform");
assert.equal(businessTypeFor({ description: "초등 학부모가 학원 후기를 나누는 앱" })?.type.id, "app");
assert.equal(businessTypeFor({ description: "1인 가구 요리 유튜브 채널" })?.type.id, "app");
// 사용자가 직접 고른 구조가 설명보다 먼저
assert.equal(businessTypeFor({ chosen: { sides: "two" }, description: "동네 빵집" })?.type.id, "platform");
assert.equal(businessTypeFor({ chosen: { revenue: "rental" }, description: "공방" })?.basis, "structure");
// 설명이 없으면 업종 가이드, 그것도 없으면 업종 기본 구조. 알 수 없으면 유형 없음(기존 규칙대로 쓴다)
assert.equal(businessTypeFor({ playbookId: "academy" })?.type.id, "lesson");
assert.equal(businessTypeFor({ structure: SECTOR_DEFAULT_STRUCTURE.food_beverage })?.basis, "sector");
assert.equal(businessTypeFor({ structure: SECTOR_DEFAULT_STRUCTURE.general }), null);
assert.equal(businessTypeFor({ description: "  " }), null);

// 유형마다: 답할 질문, 처리량, 가정 3개, 12주 뼈대, 장별 초점이 있고, 뼈대 끝은 판단
for (const type of Object.values(BUSINESS_TYPES)) {
  assert.ok(type.question && type.capacity, type.id);
  assert.equal(type.assumptions.length, 3, `${type.id}: three assumptions`);
  assert.ok(type.roadmap.length >= 8 && type.roadmap.length <= 11, `${type.id}: roadmap fits 12 weeks`);
  assert.match(type.roadmap.at(-1)!, /판단|시범 판매/, `${type.id}: ends with a decision`);
  assert.ok(Object.keys(type.focus).length >= 3, `${type.id}: chapter focus`);
}
// 플랫폼·앱은 앱 개발을 판단 기준을 넘은 뒤로 미룬다
assert.match(BUSINESS_TYPES.platform.roadmap.join(" "), /앱 개발은 판단 기준을 넘은 뒤/);
assert.match(BUSINESS_TYPES.app.roadmap.join(" "), /앱 개발·외주는 판단 기준을 넘은 뒤/);
// 가장 정확한 수요 신호를 순서에 고정(2026-10-11 유형 시뮬레이션: 본문 '검토'로만 두면 두 번 쓸 때 위치가 흔들렸다)
const order = (id: BusinessTypeId, step: RegExp, before: RegExp) => {
  const steps = BUSINESS_TYPES[id].roadmap, a = steps.findIndex(item => step.test(item)), b = steps.findIndex(item => before.test(item));
  assert.ok(a >= 0 && b >= 0 && a < b, `${id}: ${step} before ${before}`);
};
order("store", /이미 신고된 공간을 빌려 실제로 팔아 보기/, /^계약\(/);
order("lesson", /계약 전 체험 수업/, /^계약\(/);
order("b2b", /무료로 맡은 곳이 돈을 내고 이어 가는지/, /판단/);
order("platform", /손 매칭으로 실제 거래와 연결비/, /판단/);
order("platform", /중개 인허가 확인/, /손 매칭으로 실제 거래와 연결비/);
order("app", /개인정보·약관/, /첫 이용자 모집/);
order("app", /재방문 비율 확인/, /유료 기능/);
// 인허가가 없을 수 있는 유형은 사업자등록을 앞에 둔다
for (const id of ["visit", "b2b"] as BusinessTypeId[]) assert.ok(BUSINESS_TYPES[id].roadmap.findIndex(item => /사업자등록/.test(item)) <= 1, `${id}: register early`);

// 자료: 설명으로 정했으면 그렇다고 밝힌다
const described = businessTypeContext(businessTypeFor({ description: "아파트 상가 빵집" })!);
assert.match(described.basis ?? "", /사업 설명으로 정한 유형/);
assert.equal(businessTypeContext(businessTypeFor({ chosen: { sides: "two" } })!).basis, undefined);

// 지시문: 장 역할 뒤에 이 유형의 초점이 붙는다(없는 유형이면 붙지 않음)
assert.equal(businessTypeFocus("platform", "strategy/promotion"), "공급자 모집을 먼저");
assert.equal(businessTypeFocus("unknown", "strategy/promotion"), "");
const chapters = [{ key: "strategy/promotion", title: "사업 전략 > 홍보 전략", summary: "" }];
assert.match(sectionPromptV3Rules({ operating: false, sectorFocus: "x", chapters, businessTypeId: "platform" }), /홍보 전략\): .*이 사업 유형에서는 공급자 모집을 먼저도 이 장이 다룬다/);
assert.doesNotMatch(sectionPromptV3Rules({ operating: false, sectorFocus: "x", chapters }), /이 사업 유형에서는/);

console.log(`business-types: ${Object.keys(BUSINESS_TYPES).length} types, ${EVAL_CASES.length} eval cases mapped, platform/app shapes, structure precedence passed`);
