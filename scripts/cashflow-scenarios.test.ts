import assert from "node:assert/strict";
import { buildCashflowScenarios, cashflowMarkdown, cashflowReference, parseRevenueGoal, parseVolumeGoal } from "../lib/plan-builder/cashflow-scenarios";

// 돈 장(품질기준 6·7번) — 숫자는 코드가 계산하고 AI는 해석만 한다. 빵집 시험(2026-10-10) 숫자로 고정한다.
const bakery = { unitPrice: 4500, unitVariableCost: 1600, monthlyFixedCost: 3_800_000, capacity: "대표자 혼자 / 하루 120개", goal: "6개월 안에 월 매출 1,200만원", budget: "60000000원" };

// 생활비를 모르면: 본전 월 1,311개, 조심스러운 경우(본전의 절반) 매달 -1,897,600원, 초기 지출 한도 37,228,800원
const plain = buildCashflowScenarios(bakery)!;
assert.equal(plain.breakEven, 1311);
assert.deepEqual(plain.scenarios.map(s => s.key), ["careful", "breakeven", "goal"]);
assert.equal(plain.scenarios[0].volumes[0], 656);
assert.equal(plain.scenarios[0].net[0], -1_897_600);
assert.equal(plain.setupLimit, 37_228_800);
assert.equal(plain.scenarios[2].volumes.at(-1), 2667, "goal: 12,000,000 ÷ 4,500, reached in month 6");
assert.ok(plain.scenarios.every(s => s.volumes.every(v => v <= 3120)), "no case sells above the stated capacity");

// 생활비 월 200만 원: 생활비까지 버는 판매량 월 2,000개, 매달 -3,897,600원, 5개월차부터 생활비.
// 초기 지출 한도 = 6,000만 − 12개월 부족 46,771,200 − 준비 기간(3개월) 생활비 6,000,000 = 7,228,800원(2026-10-10 진단: 준비 기간 생활비가 빠져 있었다)
const living = buildCashflowScenarios({ ...bakery, livingCost: "2000000원", offer: "식빵·소금빵 아침 세트" })!;
assert.equal(living.livingBreakEven, 2000);
assert.equal(living.scenarios[1].label, "생활비까지 버는 경우");
assert.equal(living.scenarios[0].net[0], -3_897_600);
assert.equal(living.payFromMonth, 5);
assert.equal(living.prepLiving, 6_000_000);
assert.equal(living.setupLimit, 7_228_800);
assert.deepEqual(living.survival.map(row => [row.spend, row.months]), [[12_000_000, 10], [24_000_000, 7], [36_000_000, 4], [48_000_000, 1]]);
assert.equal(living.stopReserve, 11_692_800, "3 months of the careful-case shortfall");
assert.deepEqual(living.priceAlternatives.map(alt => [alt.price, alt.breakEven, alt.livingLine]), [[4000, 1584, 2417], [5000, 1118, 1706], [5500, 975, 1488]]);
assert.match(living.unitNote ?? "", /판매 단위\(세트\)를 같다고 보고/, "capacity in 개 vs a set offer is flagged");
assert.equal(plain.unitNote, null, "no offer → no unit note");
assert.deepEqual([living.decision.go, living.decision.floor], [2000, 656], "go line = living break-even, not half of break-even");

const md = cashflowMarkdown(living);
assert.match(md, /### 세 가지 경우로 본 한 달/);
assert.match(md, /하루 약 50개\(월 26일 영업 기준\)/, "daily businesses get the per-day line");
assert.equal((md.match(/^\| \d+개월차 \|/gm) ?? []).length, 12, "12 monthly rows");
// 남는 준비 예산 = 6,000만 − 초기 지출 3,600만 − 준비 기간 생활비 600만(2026-10-11 블라인드 검토: 이 칸만 생활비를 빼지 않았다)
assert.match(md, /\| 초기 지출 \| 남는 준비 예산\(준비 기간 생활비 뺀 뒤\) \| 버티는 기간 \|/);
assert.match(md, /\| 36,000,000원 \| 18,000,000원 \| 약 4개월 \|/);
assert.match(md, /준비 기간 생활비 6,000,000원을 먼저 뺌/);
assert.doesNotMatch(md, /12개월 손익 추정|흑자 전환/, "the old max-capacity profit table is gone");
assert.equal((md.match(/```plan-chart/g) ?? []).length, 1, "one chart");

const ref = cashflowReference(living, { basis: "건당 결제 기준" });
assert.match(ref, /건당 결제 기준으로 판매량을 하나로 정하지 않고/);
assert.match(ref, /판단 기준\('12주 할 일과 매달 볼 숫자' 장에서 씀\): 생활비까지 버는 판매량\(하루 약 77개 \/ 일주일 약 465개 \/ 한 달 2,000개\) 이상이면 계획대로/);
assert.match(ref, /규모\(공간·장비·상품 수\)를 줄여서, 본전의 절반 이하면 시작안을 바꿉니다. 판단은 계약처럼 큰돈을 쓰기 전\(출시 전\)에 한 번, 문을 연 뒤에 다시 합니다/);
// 출시 전: 팔 수 있으면 실제 판매 수, 못 팔면 판매량 기준 대신 잰 비율·경쟁 자료(2026-10-11 유형 시뮬레이션: 의사 수로는 닿을 수 없는 기준이 됐다)
assert.match(ref, /출시 전 판단: 돈을 받고 실제로 팔아 볼 수 있으면.*아직 팔 수 없으면 판매량 기준을 그대로 쓰지 않습니다/);
// 비율별로 닿아야 하는 사람 수는 코드가 계산한다: 2,000 ÷ 10% = 20,000명/월 → 하루 약 770명(26일)
assert.match(ref, /닿아야 하는 사람 수.*비율 10%면 하루 약 770명, 20%면 하루 약 385명, 30%면 하루 약 257명/);
assert.match(ref, /문을 연 뒤: 실제 판매 수를 위 기준과 매달 비교/);
assert.match(ref, /5개월차부터 한 달 매출로 고정비와 생활비를 모두 메워/);
assert.match(ref, /목표 경우 월별 판매선.*1개월차 656개, 2개월차 1,058개.*6개월차 2,667개/);
assert.match(ref, /가격을 바꾸면\(500원씩,.*4,000원 → 본전 하루 약 61개/, "the price step is a sourced number too");
assert.match(ref, /관심 글의 댓글·공감 수는 판매 수가 아니므로/);
assert.match(ref, /남은 준비 예산이 11,692,800원\(조심스러운 경우 3개월 적자분\) 아래로/);

// 0원은 '고정비에 넣음'이라는 답 — 없음과 다르다
assert.match(cashflowMarkdown(buildCashflowScenarios({ ...bakery, livingCost: "0원" })!), /대표 생활비는 고정비에 들어 있다고 답했고/);
assert.match(cashflowMarkdown(plain), /대표 생활비\(고정비 3,800,000원에 들어 있지 않다면\)/);

// 주·월 단위로 일하는 사업에는 하루 기준을 붙이지 않는다(출장 촬영 '일주일 8건')
const photo = buildCashflowScenarios({ unitPrice: 150_000, unitVariableCost: 20_000, monthlyFixedCost: 600_000, capacity: "대표자 혼자 / 일주일 8건", budget: "5000000원", livingCost: "1500000원" })!;
assert.equal(photo.daily, false);
assert.doesNotMatch(cashflowMarkdown(photo) + cashflowReference(photo), /하루 약/);
assert.match(cashflowMarkdown(photo), /### 두 가지 경우로 본 한 달/, "no revenue/volume goal → two cases");
assert.match(cashflowMarkdown(buildCashflowScenarios({ ...bakery, budget: "5000000원", livingCost: "1500000원" })!), /1개월도 못 버팀/);

// 목표 읽기: 매출·판매량 목표만 숫자로 바꾸고, 판매량이 아닌 목표는 바꾸지 않는다
assert.deepEqual(parseRevenueGoal("6개월 안에 월 매출 1,200만원"), { revenue: 12_000_000, months: 6 });
assert.deepEqual(parseVolumeGoal("3개월 안에 하루 150잔"), { volume: 3900, months: 3 });
assert.deepEqual(parseVolumeGoal("1년 안에 월 40건"), { volume: 40, months: 12 });
assert.equal(parseVolumeGoal("6개월 안에 재방문 고객 100명"), null);
assert.equal(parseRevenueGoal("3개월 안에 흑자"), null);

// 팔수록 손해면 계산하지 않는다(질문 화면 경고가 맡는다)
assert.equal(buildCashflowScenarios({ ...bakery, unitVariableCost: 5000 }), null);
// 처리량을 다 팔아도 본전이 안 되면 그렇게 말한다(세탁 픽업 극단값)
assert.match(cashflowReference(buildCashflowScenarios({ unitPrice: 3000, unitVariableCost: 1500, monthlyFixedCost: 8_000_000, capacity: "대표자와 기사 2명 / 하루 100벌" })!), /처리량 최대치.*다 팔아도 본전에 못 미칩니다/);

console.log("cashflow-scenarios: bakery numbers, living cost, survival table, per-day only for daily businesses, goal parsing passed");
