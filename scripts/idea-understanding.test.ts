import assert from "node:assert/strict";
import { cleanUnderstood, understoodAnswers } from "../lib/plan-builder/idea-understanding";
import type { IntakeQuestion } from "../lib/plan-builder/intake-questions";
import { capacityDaysDisplay, coachFieldDisplay } from "../lib/plan-builder/coach-presentation";

const text = "출장 세차 해보려고요. 혼자 하고 차 한 대에 4만원, 하루에 다섯 대, 평일만 할 거예요. 모아둔 돈은 3천만원";
// 원문에 없는 값 · 근거 없는 사람 수는 버린다
const cleaned = cleanUnderstood({ price: "4만원", budget: "3천만원", channel: "인스타그램", offer: null, staff: "solo", staffQuote: "혼자 하고", days: "weekdays", daysQuote: "평일만", countPeriod: "하루", countNumber: 5, countUnit: "대", countQuote: "하루에 다섯 대" }, text);
assert.deepEqual(cleaned, { price: "4만원", budget: "3천만원", staff: "solo", days: "weekdays", count: { period: "하루", number: 5, unit: "대" } });
assert.deepEqual(cleanUnderstood({ staff: "team", staffQuote: "직원 두 명" }, text), {}, "근거 구절이 원문에 없으면 버린다");
assert.deepEqual(cleanUnderstood(null, text), {});

const q = (id: string, fieldKey: string | undefined, kind: IntakeQuestion["kind"] = "text") => ({ id, label: id, prompt: id, kind, fieldKey } as IntakeQuestion);
const questions = [q("price", "price", "number"), q("structure.cost", "cost", "number"), q("budget", undefined, "number"), q("channel", "channel", "multi"), q("capacity", "capacity", "single")];
assert.deepEqual(understoodAnswers(cleaned, questions, "직원·아르바이트 1~2명 / 하루 7대"), [
  { questionId: "price", value: 40_000 }, { questionId: "budget", value: 30_000_000 },
  // 평일만: 하루 5대 → 일주일 25대(월 26일로 곱해지지 않게), 혼자라고 했으니 기준값의 '직원'을 바꾼다
  { questionId: "capacity", value: "대표자 혼자 · 평일만 / 일주일 25대" },
]);
assert.deepEqual(understoodAnswers({ staff: "solo" }, questions, "직원·아르바이트 1~2명 / 하루 50건"), [{ questionId: "capacity", value: "대표자 혼자 / 하루 50건" }], "사람만 말했으면 양은 지금 값을 둔다");
assert.deepEqual(understoodAnswers({ days: "weekends" }, questions, "대표자 혼자 / 하루 80건"), [{ questionId: "capacity", value: "대표자 혼자 · 주말만 / 일주일 160건" }]);
assert.deepEqual(understoodAnswers({ channel: "스마트스토어", monthlyCost: "150만원" }, questions), [{ questionId: "structure.cost", value: 1_500_000 }, { questionId: "channel", value: ["스마트스토어"] }]);
assert.deepEqual(understoodAnswers({ offer: "네일샵" }, [...questions, q("offer", "offer")]), [], "상품은 옮기지 않는다(가게 이름이 들어온다)");
assert.deepEqual(understoodAnswers({}, questions, "대표자 혼자 / 하루 50건"), []);
// 보일 때는 사용자가 적은 말에 가깝게 — 저장값(일주일 N)은 계산용
assert.equal(capacityDaysDisplay("대표자 혼자 · 평일만 / 일주일 400건"), "대표자 혼자 / 하루 80건 · 평일만");
assert.equal(capacityDaysDisplay("대표자 혼자 · 주말만 / 일주일 160건"), "대표자 혼자 / 하루 80건 · 주말만");
assert.equal(capacityDaysDisplay("대표자 혼자 · 평일만 / 일주일 7건"), "대표자 혼자 · 평일만 / 일주일 7건", "나누어떨어지지 않으면 그대로");
assert.equal(capacityDaysDisplay("대표자 혼자 / 하루 50건"), "대표자 혼자 / 하루 50건");
assert.equal(coachFieldDisplay("2800000원"), "2,800,000원");
console.log("idea understanding: passed");
// 판매 경로를 두 개 말하면 둘 다 담는다(같은 것을 두 번 읽으면 한 번만)
assert.deepEqual(understoodAnswers({ channel: "스마트스토어", channel2: "인스타" }, questions), [{ questionId: "channel", value: ["스마트스토어", "인스타"] }]);
assert.deepEqual(understoodAnswers({ channel: "인스타", channel2: "인스타" }, questions), [{ questionId: "channel", value: ["인스타"] }]);
assert.equal(cleanUnderstood({ channel: "스마트스토어", channel2: "당근" }, "스마트스토어랑 인스타에서 팔아요").channel2, undefined, "원문에 없는 두 번째 경로는 버린다");
assert.deepEqual(understoodAnswers({ channel: "인스타", channel2: "플리마켓", channel3: "아이디어스" }, questions), [{ questionId: "channel", value: ["인스타", "플리마켓", "아이디어스"] }]);
