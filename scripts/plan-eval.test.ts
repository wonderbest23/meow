import assert from "node:assert/strict";
import { gradeCashflow, gradeCustomer, gradeMonthlyMetrics, gradePersonalLiving, gradeReadability, gradeStartFunds, gradeUnitEconomics, gradeWeeklyPlan, markdownTables, THRESHOLDS } from "./plan-eval/grade-code";
import { graderPrompt, parseScores } from "./plan-eval/grade-ai";
import { EVAL_CASES } from "./plan-eval/cases";

// 사업계획서 품질 채점(docs/사업계획서-품질기준-최종본-2026-10-09.md) — 채점 코드가 맞게 재는지 고정 예시로 확인한다

// 시험 사업 20개: id가 겹치지 않고, 미분류·운영 중·값 빠짐이 섞여 있다
assert.equal(EVAL_CASES.length, 20);
assert.equal(new Set(EVAL_CASES.map(item => item.id)).size, 20);
assert.ok(EVAL_CASES.some(item => item.sector === "general") && EVAL_CASES.some(item => item.mode === "operating") && EVAL_CASES.some(item => item.answers["structure.cost"] === undefined));

// 1. 막연한 고객 표현이 남으면 실패, 나이·지역이 구체적이면 통과
assert.equal(gradeCustomer("주요 고객은 특정 연령대의 혼자인 시니어입니다").pass, false);
assert.equal(gradeCustomer("서울 마포구에 사는 60~70대 혼자 지내는 어르신").pass, true);

// 4. 코드로 계산한 손익분기 수량이 본문에 있어야 통과(고정비 3,800,000 ÷ (4,500 − 1,600) → 월 1,311개)
const facts = { price: 4500, unitCost: 1600, fixedCost: 3800000 };
assert.equal(gradeUnitEconomics("건당 공헌이익 2,900원, 손익분기점은 월 1,311개입니다", facts).pass, true);
assert.equal(gradeUnitEconomics("건당 공헌이익 2,900원, 손익분기점은 월 1,200개입니다", facts).pass, false, "a wrong break-even fails");
assert.equal(gradeUnitEconomics("손익분기", { price: 4500 }).pass, null, "missing inputs are not graded");

// 5. 시작 자금 항목 3개 이상
assert.equal(gradeStartFunds("보증금 1,000만원, 인테리어 1,500만원, 운영 예비비 1,140만원").pass, true);
assert.equal(gradeStartFunds("준비 자금 6,000만원").pass, false);

// 6. 12개월 잔고 표
const cash = ["| 월 | 들어오는 돈 | 나가는 돈 | 통장 잔고 |", "| --- | --- | --- | --- |", ...Array.from({ length: 12 }, (_, i) => `| ${i + 1}월 | 100 | 90 | ${10 * (i + 1)} |`)].join("\n");
assert.equal(gradeCashflow(cash).pass, true);
assert.equal(gradeCashflow("12개월 손익 추정").pass, false);
assert.equal(markdownTables(cash)[0].length, 13, "header + 12 rows; the separator row is skipped");

// 7. 생활비와 대표 월급
assert.equal(gradePersonalLiving("사장님 생활비 월 200만원, 내 월급은 6개월 차부터").pass, true);

// 9. 주차별 표: 8주 이상, 매주 시간 합이 주당 가능 시간 안
const weekly = (hours: number) => ["| 주차 | 할 일 | 걸리는 시간 | 완료 기준 |", "| --- | --- | --- | --- |", ...Array.from({ length: 12 }, (_, i) => `| ${i + 1}주 | 할 일 | ${hours}시간 | 기준 |`)].join("\n");
assert.equal(gradeWeeklyPlan(weekly(10), 20).pass, true);
assert.equal(gradeWeeklyPlan(weekly(30), 20).pass, false, "weeks over the founder's hours fail");
assert.equal(gradeWeeklyPlan("1주 차에 사업자등록", 20).pass, false, "no table, no pass");

// 10. 매달 볼 숫자와 다시 보기
assert.equal(gradeMonthlyMetrics("매달 볼 숫자 3개: 방문 수, 재구매율, 객단가. 매월 마지막 주에 다시 보기").pass, true);
assert.equal(gradeMonthlyMetrics("## 매달 볼 숫자\n매달 숫자 세 개만 봅니다. 계획서는 매달 마지막 주에 이 표를 채우며 다시 봅니다.").pass, true, "'다시 봅니다' counts as a review date");

// 12. 같은 숫자 반복은 표 바깥 글에서만 센다
const repeatedProse = Array.from({ length: THRESHOLDS.repeatedNumberMax + 1 }, () => "손익분기는 22명입니다.").join("\n");
assert.equal(gradeReadability({ a: repeatedProse }).pass, false);
assert.equal(gradeReadability({ a: cash }).pass, true, "numbers repeated inside a table are not repetition");

// AI 채점표: 자료가 위, 지시가 아래(공식 문서), 점수는 1~5 정수만 받는다
const prompt = graderPrompt({ caseLabel: "빵집", facts: "price: 4500", sections: { "market/personas": "본문" } });
assert.ok(prompt.user.indexOf("<plan>") < prompt.user.indexOf("<instructions>"), "long data first, instructions last");
assert.ok(prompt.system.includes("정부 지원사업 제출용이 아니라"));
assert.deepEqual(parseScores({ scores: { 1: 4, 2: 3, 3: 5, 5: 1, 7: 2, 8: 3, 10: 4, 12: 5 } }), { 1: 4, 2: 3, 3: 5, 5: 1, 7: 2, 8: 3, 10: 4, 12: 5 });
assert.equal(parseScores({ scores: { 1: 6, 2: 3, 3: 5, 5: 1, 7: 2, 8: 3, 10: 4, 12: 5 } }), null, "out-of-range scores are rejected");
assert.equal(parseScores(null), null);

console.log("plan-eval grader tests passed");
