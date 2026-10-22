import assert from "node:assert/strict";
import { parseWonAmount, rangeLowerText, stripAnswerPeriod } from "../lib/plan-builder/answer-number";
import { checkCoachFeasibility, coachAmount, coachAmountLower } from "../lib/plan-builder/coach-feasibility";
import { parseWon } from "../lib/plan-builder/fact-highlight";
import { parseAmount } from "../lib/plan-builder/financials";
import { parseResourceLimit } from "../lib/plan-builder/intake-candidate-fit";
import { autoBusinessName } from "../lib/plan-builder/intake-core";
import { quoteAmount, quoteTotals } from "../lib/plan-builder/business-launch";
import { landingEmailIssue } from "../lib/landing/domain";
import { composerLimitNote, visibleComposerText } from "../app/plan/chat/intake-ui/guidance";
import { numberInputHint } from "../app/plan/chat/intake-ui/model";
import type { CoachField } from "../lib/plan-builder/coach";

// 2026-10-22 입력 감사: 대화 답·문서 고치기·손익 계산이 같은 금액을 같은 값으로 읽는다
const amounts = [
  ["25000", 25000], ["25,000원", 25000], ["2만5천원", 25000], ["2만 5천원", 25000], ["3만5천", 35000], ["1억5천만원", 150_000_000],
  ["1억 2000만", 120_000_000], ["3천만원", 30_000_000], ["5백만원", 5_000_000], ["1,500만원", 15_000_000], ["2.5만", 25000], ["1.5만원", 15000],
  ["4.500", 4500], ["4.500원", 4500], ["1.234.567", 1_234_567], ["0원", 0], ["0만원", 0],
] as const;
for (const [text, value] of amounts) {
  assert.equal(parseWonAmount(text), value, `parseWonAmount ${text}`);
  assert.equal(coachAmount(text), value, `coachAmount ${text}`);
  assert.equal(parseWon(text), value || null, `parseWon ${text}`);
  if (value) assert.equal(parseAmount(text), value, `parseAmount ${text}`);
}
for (const text of ["", "만", "4.5", "-5000", "20~30만원", "1..2만원", "1,00원", "abc", "3만원쯤 아마"]) assert.equal(parseWonAmount(text), undefined, `not an amount: ${text}`);
assert.equal(coachAmount("10~20만원"), undefined, "coachAmount stays exact — ranges go through coachAmountLower");

// 범위는 적은 쪽(보수적)
assert.equal(rangeLowerText("20~30만원"), "20만원");
assert.equal(rangeLowerText("1만5천~2만원"), "1만5천");
assert.equal(rangeLowerText("10~20시간"), "10시간");
assert.equal(rangeLowerText("30만원"), null);
assert.equal(coachAmountLower("20~30만원"), 200_000);
assert.equal(coachAmountLower("100~300만원"), 1_000_000);
assert.equal(coachAmountLower("300만원"), 3_000_000);
assert.equal(parseAmount("20~30만원"), 200_000, "예전엔 숫자를 이어 붙여 20,300,000원으로 읽었다");
const field = (key: CoachField["key"], value: string): CoachField => ({ key, value, basis: "user", messageId: key, quote: value });
const budgetCheck = checkCoachFeasibility([field("budget", "200~500만원"), field("cost", "100만원")])[0];
assert.equal(budgetCheck.status, "attention", `범위 예산도 적은 쪽(200만원)으로 비교: ${budgetCheck.detail}`);

// 질문 기간과 같은 말은 뗀다
assert.equal(stripAnswerPeriod("월 30만", "월"), "30만");
assert.equal(stripAnswerPeriod("30만원/월", "월"), "30만원");
assert.equal(stripAnswerPeriod("매달 30만원씩", "월"), "30만원");
assert.equal(stripAnswerPeriod("월세 50만", "월"), "월세 50만", "'월세'의 '월'은 기간이 아니다");
assert.equal(stripAnswerPeriod("주 20시간", "주"), "20시간");
assert.equal(stripAnswerPeriod("주20", "주"), "20");
assert.equal(stripAnswerPeriod("월 30만", "주"), "월 30만", "다른 기간은 그대로");
for (const text of ["주 20시간", "주20", "20시간/주", "일주일에 20시간", "주당 20시간"]) assert.deepEqual(parseResourceLimit(text, "weeklyOperatingHours"), { status: "known", raw: text, lower: 20, upper: 20 }, text);
assert.equal(parseResourceLimit("월 30만원", "initialCost").status, "invalid", "초기 예산에 '월'이 붙으면 기간 확인");
assert.deepEqual(parseResourceLimit("2만5천원", "initialCost"), { status: "known", raw: "2만5천원", lower: 25000, upper: 25000 });

// 숫자 질문의 다시 적기 안내
const price = { kind: "number" as const, unit: "원", period: "1잔" };
assert.equal(numberInputHint(price, "20~30만원"), "범위 대신 숫자 하나만 적어 주세요 (예: 25000, 2만5천원)");
assert.equal(numberInputHint(price, "-5000"), "0 이상의 숫자만 적어 주세요 (예: 25000, 2만5천원)");
assert.equal(numberInputHint(price, "1..2만"), "숫자만 적어 주세요 (예: 25000, 2만5천원)");
assert.equal(numberInputHint(price, "2만5천원"), "");
assert.equal(numberInputHint(price, "아직 고민 중이에요"), "", "글은 기존 흐름");
assert.equal(numberInputHint({ kind: "number", unit: "원", period: "월" }, "월 30만"), "");
assert.equal(numberInputHint({ kind: "number", unit: "시간", period: "주" }, "-3"), "0 이상의 숫자만 적어 주세요 (예: 20시간)");

// 견적 비교: '300만'이 300원이 되지 않는다
assert.equal(quoteAmount("300만"), 3_000_000);
assert.equal(quoteAmount("3,000,000"), 3_000_000);
assert.equal(quoteAmount("0"), 0);
assert.equal(quoteAmount("1,,2"), null);
assert.equal(quoteTotals({ name: "견적", monthly: "50만", deposit: "1000만", initial: "0" })?.outflow, 16_000_000);

// 자동 사업 이름: 낱말 경계·글자 단위로 자른다
const long = "동네 주민을 위한 반려동물 산책과 돌봄을 함께 해 주는 방문형 생활 서비스로 시작해서 나중에는 용품 판매까지 넓히고 싶어요";
const cut = autoBusinessName(long);
assert.ok(Array.from(cut).length <= 60 && cut.endsWith("…"), cut);
assert.ok(long.startsWith(cut.slice(0, -1)) && !/\s…$/.test(cut), `낱말 가운데에서 끊기지 않는다: ${cut}`);
assert.equal(autoBusinessName("짧은 사업 설명"), "짧은 사업 설명");
const emoji = "🍞".repeat(70);
assert.ok(!autoBusinessName(emoji).includes("�") && Array.from(autoBusinessName(emoji)).every(ch => ch === "🍞" || ch === "…"), "이모지 반쪽으로 자르지 않는다");

// 입력창 공용 도우미
assert.equal(visibleComposerText("​‌‍﻿  "), "", "폭 없는 공백만 있으면 빈 입력");
assert.equal(visibleComposerText(" 안녕​ "), "안녕");
assert.equal(composerLimitNote(1000, 1200), "");
assert.equal(composerLimitNote(1100, 1200), "100자 더 쓸 수 있어요 (1,100 / 1,200자)");
assert.equal(composerLimitNote(2000, 2000), "2,000자를 다 채웠어요. 나머지는 나눠서 보내 주세요.");

// 홈페이지 사업자 이메일 칸 안내
assert.equal(landingEmailIssue(""), "");
assert.equal(landingEmailIssue("hello@mybusiness.kr"), "");
assert.equal(landingEmailIssue("hello@"), "사업자 이메일 형식을 확인해 주세요 (예: hello@mybusiness.kr)");

console.log("answer-number: 금액·기간·범위·견적·이름·입력창 도우미 규칙 통과");
