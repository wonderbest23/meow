import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanGuess, cleanUnderstood, guessedAnswers, understandIdea, understoodAnswers } from "../lib/plan-builder/idea-understanding";
import { UNDERSTAND_AI_MIN_MS, UNDERSTAND_SAVE_BY_MS, UNDERSTAND_WAIT_MS, understandAiBudget, understandSaveOnTime } from "../lib/plan-builder/intake-timing";
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
assert.deepEqual(understoodAnswers({ offer: "네일샵" }, [...questions, q("offer", "offer")]), [], "가게 이름은 상품으로 옮기지 않는다");
assert.deepEqual(understoodAnswers({ offer: "작은 카페" }, [...questions, q("offer", "offer")]), []);
// 상품 · 서비스 구절과 손님의 문제는 적은 말 그대로 옮긴다(2026-11-14 — 첨부를 빼면서 붙여 넣은 글이 같은 일을 하게)
assert.deepEqual(understoodAnswers({ offer: "국 하나를 포함한 반찬 4가지 한 묶음", problem: "반찬을 만들 시간이 없다" }, [...questions, q("offer", "offer"), q("problem", "problem", "multi")]),
  [{ questionId: "offer", value: "국 하나를 포함한 반찬 4가지 한 묶음" }, { questionId: "problem", value: ["반찬을 만들 시간이 없다"] }]);
assert.equal(cleanUnderstood({ problem: "원문에 없는 문제" }, "반찬을 만들 시간이 없다").problem, undefined);
// 값이 둘 이상이면 그 구절을 파는 것에 덧붙인다(2026-11-14). 값이 하나뿐인 구절 · 원문에 없는 구절은 붙이지 않는다
const offerQ = [...questions, q("offer", "offer")], twoPrices = "쿠키는 한 봉지 6천원, 구움과자 세트는 2만원";
assert.deepEqual(understoodAnswers({ offer: "수제 쿠키와 구움과자 세트", prices: twoPrices }, offerQ), [{ questionId: "offer", value: `수제 쿠키와 구움과자 세트 (${twoPrices})` }]);
assert.deepEqual(understoodAnswers({ offer: "네일샵", prices: twoPrices }, offerQ), [{ questionId: "offer", value: twoPrices }], "파는 것이 없으면 값 구절이 파는 것이 된다");
assert.deepEqual(understoodAnswers({ offer: "쿠키", prices: twoPrices }, offerQ), [{ questionId: "offer", value: twoPrices }], "겹치면 한 번만");
assert.deepEqual(understoodAnswers({ offer: "수제 쿠키", prices: "한 봉지 6천원" }, offerQ), [{ questionId: "offer", value: "수제 쿠키" }]);
assert.equal(cleanUnderstood({ prices: "쿠키 6천원, 케이크 3만원" }, "쿠키는 6천원에 팔아요").prices, undefined);
assert.deepEqual(understoodAnswers({}, questions, "대표자 혼자 / 하루 50건"), []);
// 짐작(guess, 2026-11-17): 적히지 않은 칸을 이 사업에 맞게 — 코드는 형식 · 범위 · '한 번 비용 < 값'만 본다
assert.deepEqual(cleanGuess({ guessCustomer: "고양이를 좋아하는 20~30대", guessProblem: "", guessOffer: "길고양이 사진 엽서 1장", guessChannel: "인스타그램", guessPrice: 2500, guessUnitCost: 400, guessMonthlyCost: 50000 }),
  { customer: "고양이를 좋아하는 20~30대", offer: "길고양이 사진 엽서 1장", channel: "인스타그램", price: 2500, unitCost: 400, monthlyCost: 50000 });
assert.equal(cleanGuess({ guessPrice: 3000, guessUnitCost: 10000 }).unitCost, undefined, "값보다 큰 한 번 비용은 버린다(팔수록 손해인 초안)");
assert.deepEqual(cleanGuess({ guessPrice: 50, guessCustomer: "고양이\n좋아하는 사람", guessOffer: "가".repeat(61) }), {}, "100원 미만 값 · 여러 줄 · 너무 긴 글은 버린다");
assert.deepEqual(cleanGuess({ guessPrice: 0, guessCustomer: "" }), {}, "빈 짐작은 넣지 않는다");
assert.equal(cleanUnderstood({ guessPrice: 2500 } as never, "엽서").guess, undefined, "'말한 것' 읽기는 짐작을 받지 않는다(따로 부른다)");
const guessQ = [q("customer", "customer", "multi"), q("offer", "offer"), q("price", "price", "number"), q("structure.unitCost", "unitCost", "number"), q("structure.cost", "cost", "number"), q("channel", "channel", "multi")];
assert.deepEqual(guessedAnswers({ customer: "고양이를 좋아하는 20~30대", offer: "엽서 1장", price: 2500, unitCost: 400, monthlyCost: 50000, channel: "인스타그램" }, guessQ, new Set(["price"])), [
  { questionId: "customer", value: ["고양이를 좋아하는 20~30대"] }, { questionId: "offer", value: "엽서 1장" }, { questionId: "channel", value: ["인스타그램"] },
  { questionId: "structure.unitCost", value: 400 }, { questionId: "structure.cost", value: 50000 },
], "말한 칸(가격)은 빼고, 여러 개 고르는 질문은 목록으로");
assert.deepEqual(guessedAnswers(undefined, guessQ), []);
const source = readFileSync(new URL("../lib/plan-builder/idea-understanding.ts", import.meta.url), "utf8");
assert.ok(source.includes("guessPrice") && source.includes("이 글에 적힌 바로 그 사업에 맞추세요"), "짐작 칸과 '업종 고정값이 아니라 이 사업' 규칙이 프롬프트에 있다");

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
// ux-firstmsg(2026-11-16): AI가 읽은 예산이 단위 없는 작은 수('300')면 300원이 아니라 300만원
assert.deepEqual(understoodAnswers({ budget: "300" }, questions), [{ questionId: "budget", value: 3_000_000 }]);
assert.deepEqual(understoodAnswers({ budget: "3천만원" }, questions), [{ questionId: "budget", value: 30_000_000 }]);

// 읽기 시간은 요청을 받은 때부터 잰다(2026-11-17 운영, 로그인 안 한 손님) — 화면은 8초에 요청을 끊고 질문을 보이지만 서버는 멈추지 않는다.
// 예전엔 AI 시간(7초)만 재서, AI 앞의 일(손님 AI 한도 세기 등)이 1초 넘게 걸리면 화면이 끊은 뒤에 저장해 판(revision)이 화면 몰래 올랐다.
{
  assert.ok(UNDERSTAND_SAVE_BY_MS + 1_000 <= UNDERSTAND_WAIT_MS, "저장 시한은 화면이 기다리는 시간보다 넉넉히(저장 · 응답 몫) 앞선다");
  assert.equal(understandAiBudget(0, 0), UNDERSTAND_SAVE_BY_MS);
  // 운영 그대로: AI 앞의 일 1.2초 + 예전 AI 시간 7초 = 8.2초 > 화면 8초 → 늦은 저장. 이제는 AI 시간이 남은 시간으로 줄어 시한 안에 끝난다
  const beforeAi = 1_200;
  assert.ok(beforeAi + 7_000 > UNDERSTAND_WAIT_MS, "예전 계산은 화면이 끊은 뒤에 끝날 수 있었다");
  const budget = understandAiBudget(0, beforeAi);
  assert.equal(budget, UNDERSTAND_SAVE_BY_MS - beforeAi, "AI 앞에 쓴 시간만큼 AI 시간이 준다");
  assert.ok(beforeAi + budget <= UNDERSTAND_SAVE_BY_MS);
  assert.equal(understandAiBudget(0, UNDERSTAND_SAVE_BY_MS - UNDERSTAND_AI_MIN_MS), UNDERSTAND_AI_MIN_MS);
  assert.equal(understandAiBudget(0, UNDERSTAND_SAVE_BY_MS - UNDERSTAND_AI_MIN_MS + 1), 0, "남은 시간이 모자라면 AI를 부르지 않는다(손님 한도도 쓰지 않는다)");
  // 늦게 도착한 읽기(가짜 AI 지연)는 저장하지 않는다 — 시한 안이면 저장
  assert.equal(understandSaveOnTime(0, beforeAi + 4_000), true);
  assert.equal(understandSaveOnTime(0, UNDERSTAND_SAVE_BY_MS), true);
  assert.equal(understandSaveOnTime(0, beforeAi + 6_900), false, "화면이 끊었을 시각의 결과는 버린다");
  assert.equal(understandSaveOnTime(0, UNDERSTAND_WAIT_MS + 17_000), false);

  // 경로 배선 — 받은 때부터 재고, 한도 세기 전에 남은 시간을 보고, 다시 읽은 상태가 이미 읽었으면 · 늦었으면 저장하지 않는다
  const route = readFileSync(new URL("../app/api/plan/chat/understand/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function POST\(request: Request\) \{\n  const startedAt = Date\.now\(\);\n/, "요청을 받자마자 시각을 잰다");
  assert.match(route, /if \(!understandAiBudget\(startedAt, Date\.now\(\)\)\) return nothing\(\);\n.*\n  if \(!\(await chargeGuestAi\(identity, GUEST_AI_UNITS\.assist, "understand"\)\)\) return nothing\(\);\n  const result = await understandIdea\(config, business, request\.signal, understandAiBudget\(startedAt, Date\.now\(\)\)\);/);
  assert.match(route, /if \(!now \|\| now\.intake\.understood\) return nothing\(\);/, "다른 요청이 먼저 저장했으면 판을 또 올리지 않는다");
  assert.match(route, /const late = !understandSaveOnTime\(startedAt, Date\.now\(\)\);[\s\S]*if \(result\.failure \|\| late\) return nothing\(\);\n  try \{\n    await saveIntakeCommand\(/, "늦은 읽기는 저장 앞에서 버린다");
}

void (async () => {
  // 남은 시간이 모자라면 AI(네트워크)를 아예 부르지 않고 시간 초과로 끝난다
  const original = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (async () => { called++; throw new Error("AI must not be called"); }) as typeof fetch;
  try {
    const short = await understandIdea({ provider: "anthropic", apiKey: "fixture-not-a-key", model: "fixture" }, text, undefined, UNDERSTAND_AI_MIN_MS - 1);
    assert.deepEqual(short, { understood: {}, model: "fixture", totalMs: 0, failure: "timeout" });
    const none = await understandIdea({ provider: "anthropic", apiKey: "fixture-not-a-key", model: "fixture" }, text, undefined, 0);
    assert.equal(none.failure, "timeout");
    assert.equal(called, 0, "AI를 부르지 않는다");
  } finally { globalThis.fetch = original; }
  console.log("idea understanding timing: passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
