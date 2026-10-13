import assert from "node:assert/strict";
import { buildCashflowScenarios, cashflowMarkdown, cashflowReference, isRecurring, parseActiveGoal, parseRevenueGoal, parseVolumeGoal } from "../lib/plan-builder/cashflow-scenarios";

// 돈 장(품질기준 6·7번) — 숫자는 코드가 계산하고 AI는 해석만 한다. 빵집 시험(2026-10-10) 숫자로 고정한다.
const bakery = { unitPrice: 4500, unitVariableCost: 1600, monthlyFixedCost: 3_800_000, capacity: "대표자 혼자 / 하루 120개", goal: "6개월 안에 월 매출 1,200만원", budget: "60000000원", premises: true };

// 생활비를 모르면: 본전 월 1,311개, 조심스러운 경우(본전의 절반) 매달 -1,897,600원
// 초기 지출 한도 = 6,000만 − 12개월 부족 22,771,200 − 개업 전 한 달 고정비 3,800,000 = 33,428,800원(2026-10-12: 매장은 문 열기 한 달 전부터 월세가 나간다)
const plain = buildCashflowScenarios(bakery)!;
assert.equal(plain.breakEven, 1311);
assert.deepEqual(plain.scenarios.map(s => s.key), ["careful", "breakeven", "goal"]);
assert.equal(plain.scenarios[0].volumes[0], 656);
assert.equal(plain.scenarios[0].net[0], -1_897_600);
assert.equal(plain.setupLimit, 33_428_800);
assert.equal(plain.prepFixed, 3_800_000);
assert.equal(plain.scenarios[2].volumes.at(-1), 2667, "goal: 12,000,000 ÷ 4,500, reached in month 6");
assert.ok(plain.scenarios.every(s => s.volumes.every(v => v <= 3120)), "no case sells above the stated capacity");

// 생활비 월 200만 원: 생활비까지 버는 판매량 월 2,000개, 매달 -3,897,600원, 5개월차부터 생활비.
// 초기 지출 한도 = 6,000만 − 12개월 부족 46,771,200 − 준비 기간(3개월) 생활비 6,000,000 − 개업 전 한 달 고정비 3,800,000 = 3,428,800원(2026-10-10 진단: 준비 기간 생활비가 빠져 있었다)
const living = buildCashflowScenarios({ ...bakery, livingCost: "2000000원", offer: "식빵·소금빵 아침 세트" })!;
assert.equal(living.livingBreakEven, 2000);
assert.equal(living.scenarios[1].label, "생활비까지 버는 경우");
assert.equal(living.scenarios[0].net[0], -3_897_600);
assert.equal(living.payFromMonth, 5);
assert.equal(living.prepLiving, 6_000_000);
assert.equal(living.setupLimit, 3_428_800);
assert.deepEqual(living.survival.map(row => [row.spend, row.months]), [[12_000_000, 9], [24_000_000, 6], [36_000_000, 3], [48_000_000, 0]]);
assert.equal(living.stopReserve, 11_692_800, "3 months of the careful-case shortfall");
assert.deepEqual(living.priceAlternatives.map(alt => [alt.price, alt.breakEven, alt.livingLine]), [[4000, 1584, 2417], [5000, 1118, 1706], [5500, 975, 1488]]);
assert.match(living.unitNote ?? "", /판매 단위\(세트\)를 같다고 보고/, "capacity in 개 vs a set offer is flagged");
assert.equal(plain.unitNote, null, "no offer → no unit note");
assert.deepEqual([living.decision.go, living.decision.floor], [2000, 656], "go line = living break-even, not half of break-even");

const md = cashflowMarkdown(living);
assert.match(md, /### 세 가지 경우로 본 한 달/);
assert.match(md, /하루 약 50개\(월 26일 영업 기준\)/, "daily businesses get the per-day line");
assert.equal((md.match(/^\| \d+개월차 \|/gm) ?? []).length, 12, "12 monthly rows");
// 남는 준비 예산 = 6,000만 − 초기 지출 3,600만 − 준비 기간에 나가는 돈 980만(생활비 600만 + 개업 전 고정비 380만)
assert.match(md, /\| 초기 지출 \| 남는 준비 예산\(준비 기간에 나가는 돈 뺀 뒤\) \| 버티는 기간 \|/);
assert.match(md, /\| 36,000,000원 \| 14,200,000원 \| 약 3개월 \|/);
assert.match(md, /준비 기간에 나가는 돈 9,800,000원을 먼저 뺌/);
assert.match(md, /생활비 6,000,000원과 고정비 3,800,000원\(문 열기 한 달 전부터\)/);
assert.doesNotMatch(md, /12개월 손익 추정|흑자 전환/, "the old max-capacity profit table is gone");
assert.equal((md.match(/```plan-chart/g) ?? []).length, 1, "one chart");

const ref = cashflowReference(living, { basis: "건당 결제 기준" });
assert.match(ref, /건당 결제 기준으로 판매량을 하나로 정하지 않고/);
assert.match(ref, /판단 기준\(실행 장에서 씀\): 생활비까지 버는 판매량\(하루 약 77개 \/ 일주일 약 465개 \/ 한 달 2,000개\) 이상이면 계획대로/);
assert.match(ref, /규모\(쓰는 돈·시간·상품 수\)를 줄여서, 본전의 절반 이하면 시작안을 바꿉니다. 판단은 계약처럼 큰돈을 쓰기 전\(출시 전\)에 한 번, 문을 연 뒤에 다시 합니다/);
// 출시 전: 팔 수 있으면 실제 판매 수, 못 팔면 판매량 기준 대신 잰 비율·경쟁 자료(2026-10-11 유형 시뮬레이션: 의사 수로는 닿을 수 없는 기준이 됐다)
assert.match(ref, /출시 전 판단: 돈을 받고 실제로 팔아 볼 수 있으면.*아직 팔 수 없으면 판매량 기준을 그대로 쓰지 않습니다/);
// 비율별로 이야기를 나눠야 하는 사람 수는 코드가 계산한다: 2,000 ÷ 10% = 20,000명/월 → 하루 약 770명(26일)
assert.match(ref, /직접 이야기를 나눠야 하는 사람 수.*비율 10%면 하루 약 770명, 20%면 하루 약 385명, 30%면 하루 약 257명/);
assert.match(ref, /문을 연 뒤: 실제 판매 수를 위 기준과 매달 비교/);
assert.match(ref, /5개월차부터 한 달 매출로 고정비와 생활비를 모두 메워/);
assert.match(ref, /목표 경우 월별 판매선.*1개월차 656개, 2개월차 1,058개.*6개월차 2,667개/);
assert.match(ref, /가격을 바꾸면\(500원씩,.*4,000원 → 본전 하루 약 61개/, "the price step is a sourced number too");
assert.match(ref, /관심 글의 댓글·공감 수는 판매 수가 아니므로/);
assert.match(ref, /남은 준비 예산이 11,692,800원\(조심스러운 경우 석 달 적자분\) 아래로/);
// 중단선 위에서 시작하려면: 6,000만 − 980만 − 11,692,800 = 38,507,200원
assert.match(ref, /초기 지출을 38,507,200원 이하로 씁니다/);
assert.equal(living.stopBroken, false);
// 부가세: 4,500 ÷ 1.1 − 1,600 = 약 2,491원 → 생활비선 (380만 + 200만) ÷ 2,490.9 = 2,329개
assert.match(ref, /부가세가 들어 있다면\(일반과세자\) 한 건에 남는 돈은 약 2,491원으로 줄고, 생활비선은 월 2,329개/);
// 시범 판매가 일부 자리만 쓰면 판매 수 대신 채운 비율(2026-10-12 네일 시뮬레이션: 저녁 한 자리 2주에 주 22건 기준을 댔다)
assert.match(ref, /일부 시간·자리만 쓰면.*연 시간 중 채운 비율/);

// 0원은 '고정비에 넣음'이라는 답 — 없음과 다르다
assert.match(cashflowMarkdown(buildCashflowScenarios({ ...bakery, livingCost: "0원" })!), /대표 생활비는 고정비에 들어 있다고 답했고/);
assert.match(cashflowMarkdown(plain), /대표 생활비\(고정비 3,800,000원에 들어 있지 않다면\)/);

// 주·월 단위로 일하는 사업에는 하루 기준을 붙이지 않는다(출장 촬영 '일주일 8건')
const photo = buildCashflowScenarios({ unitPrice: 150_000, unitVariableCost: 20_000, monthlyFixedCost: 600_000, capacity: "대표자 혼자 / 일주일 8건", budget: "5000000원", livingCost: "1500000원" })!;
assert.equal(photo.daily, false);
assert.doesNotMatch(cashflowMarkdown(photo) + cashflowReference(photo), /하루 약/);
assert.match(cashflowMarkdown(photo), /### 두 가지 경우로 본 한 달/, "no revenue/volume goal → two cases");
assert.match(cashflowMarkdown(buildCashflowScenarios({ ...bakery, budget: "5000000원", livingCost: "1500000원" })!), /1개월도 (못 버팀|버티지 못합니다)/);

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

// ── 2026-10-12 다섯 사업 시뮬레이션에서 나온 문제 ──
// 매달 돈을 내는 사업(SNS 대행: 월 300,000원, 가게 1곳 비용 30,000원, 고정비 50만, 생활비 150만, 예산 300만, 월 12곳, 6개월 안에 10곳)
assert.equal(isRecurring(undefined, "월 12회 게시물 제작·업로드"), true);
assert.equal(isRecurring(undefined, "기본 추천 무료, 월 4,900원 프리미엄 식단"), true);
assert.equal(isRecurring("subscription", ""), true);
assert.equal(isRecurring(undefined, "젤네일 원컬러·아트 1회 시술"), false);
assert.equal(isRecurring(undefined, "펫시터 방문 돌봄 1회 예약 연결"), false);
assert.deepEqual(parseActiveGoal("6개월 안에 고객 가게 10곳"), { volume: 10, months: 6 });
assert.deepEqual(parseActiveGoal("1년 안에 유료 구독 500명"), { volume: 500, months: 12 });
const sns = buildCashflowScenarios({ unitPrice: 300_000, unitVariableCost: 30_000, monthlyFixedCost: 500_000, capacity: "대표자 혼자 / 월 12곳", goal: "6개월 안에 고객 가게 10곳", budget: "3000000원", livingCost: "1500000원", recurring: true })!;
assert.deepEqual([sns.breakEven, sns.livingBreakEven], [2, 8]);
// 손님은 0에서 쌓인다: 조심스러운 경우 1곳까지 6개월, 목표 10곳까지 6개월
assert.deepEqual(sns.scenarios[0].volumes.slice(0, 7), [0, 0, 1, 1, 1, 1, 1]);
assert.deepEqual(sns.scenarios[2].volumes.slice(0, 6), [2, 3, 5, 7, 8, 10]);
assert.deepEqual(sns.recurringPace, { months: 6, perMonth: 2 });
// 표의 둘째 줄은 판단선 그대로(첫 달부터 8곳이 아니다 — 4차: 메울 금액의 근거 줄이 표에 없었다)
assert.equal(sns.scenarios[1].label, "판단선대로 느는 경우");
assert.deepEqual(sns.scenarios[1].volumes.slice(0, 7), [2, 3, 4, 6, 7, 8, 8]);
// 준비 기간 3개월: 생활비 450만 + 고정비 150만(공간 없는 사업은 준비 기간 내내) = 600만 > 예산 300만 → 중단선이 처음부터 깨짐
assert.equal(sns.prepFixed, 1_500_000);
assert.equal(sns.stopBroken, true);
const snsRef = cashflowReference(sns);
assert.match(snsRef, /문 연 뒤에 볼 중단선을 둘 수 없습니다.*1개월도 버티지 못합니다.*하나를 정합니다/);
assert.doesNotMatch(snsRef, /아래로 내려가면 계속할지 다시 정합니다/);
assert.match(snsRef, /그달 돈을 내는 손님 수.*생활비선 8곳을 6개월 안에 채우려면 해지가 없을 때 매달 새로 약 2곳씩/);
// 판단선과 매달 목표는 한 줄: 생활비선 8곳을 6개월에 → 2·3·4·6·7·8곳(2026-10-13 2차: 두 줄이 같은 달 결론을 갈랐다)
assert.match(snsRef, /1개월차 2곳, 2개월차 3곳, 3개월차 4곳, 4개월차 6곳, 5개월차 7곳, 6개월차 8곳 이상이면 계획대로/);
assert.doesNotMatch(snsRef, /목표 경우 월별 판매선/, "recurring: no second monthly line");
// 표는 준비 예산에서 준비 기간에 나간 돈을 뺀 잔고에서 시작한다(300만 − 600만 = −300만)
assert.match(cashflowMarkdown(sns), /### 12개월 통장 잔고\(초기 지출 전\)/);
assert.match(cashflowMarkdown(sns), /\| 1개월차 \| -5,000,000원 \|/);
// 닿아야 하는 사람 수는 매달 새로 늘 손님(2곳) 기준: 2 ÷ 20% = 10곳/월 → 일주일 약 3명
assert.match(snsRef, /매달 새로 늘어야 하는 손님\(약 2곳\)을 채우려면.*20%면 일주일 약 3명/);
assert.match(snsRef, /중단선 대신 시작 전에 정한 결정/);
// 시작 전 결정이 메울 금액은 판단선(2·3·4·6·7·8곳)대로 갈 때로 센다(3차: 접어야 할 조심스러운 경우로 세면 따를 수 없는 숫자였다)
// 문 여는 날 −300만 + 6개월 중 가장 낮은 누적 −406만 → 약 706만 원
assert.equal(sns.coverNeeded, 7_060_000);
assert.match(snsRef, /판단선대로 가도 문 연 뒤 6개월 동안 통장이 0원 아래로 내려가지 않으려면 준비 예산 밖에서 약 7,060,000원/);
// 분모는 이야기를 나눈 사람 — 노출 수가 아니다(2차: '본 사람의 20%'는 늘 못 미쳤다)
assert.match(snsRef, /글을 본 사람 수\(노출\)는 분모로 쓰지 않고/);

// 처리 한도를 다 채워도 생활비까지 못 버는 사업(펫시터 연결: 5,000원, 비용 500원, 고정비 150만, 생활비 200만, 하루 20건)
const pet = buildCashflowScenarios({ unitPrice: 5000, unitVariableCost: 500, monthlyFixedCost: 1_500_000, capacity: "대표자 혼자 / 하루 매칭 20건", budget: "10000000원", livingCost: "2000000원" })!;
// 하루 20건 × 26일 = 520건 × 4,500 = 2,340,000 − 3,500,000 = −1,160,000
assert.equal(pet.capacityNet, -1_160_000);
assert.match(cashflowReference(pet), /다 판 달에도 생활비를 넣으면 1,160,000원이 모자랍니다/);
assert.match(cashflowReference(pet), /생활비까지 버는 판매량\(월 778건\)이 처리 한도\(월 520건\)보다 많아 판매량만으로는 닿을 수 없습니다/);
assert.match(cashflowReference(pet), /이야기를 나눈 수가 10보다 적으면 비율로 판단하지 않고/);

// 앱(구독, 생활비 0 = 고정비에 들어 있음): 도구·서버비가 준비 기간 내내 나가고, 구독자는 0명에서 쌓인다
const app = buildCashflowScenarios({ unitPrice: 4900, unitVariableCost: 500, monthlyFixedCost: 800_000, budget: "5000000원", livingCost: "0원", goal: "1년 안에 유료 구독 500명", recurring: true })!;
assert.equal(app.unit, "명");
assert.equal(app.prepFixed, 2_400_000);
assert.equal(app.scenarios[0].volumes[0], 15, "91 ÷ 6 in month 1, not 91");
assert.ok(app.survival.every(row => row.months < 12) || app.survival.length === 0);
assert.doesNotMatch(cashflowMarkdown(app), /12개월 이상/);
// 판단선(본전 182명을 12개월에)대로 늘어도 260만 원은 5개월차에 바닥난다
assert.equal(app.paceRunOut, 5);
assert.match(cashflowReference(app), /판단선대로 손님이 늘어도\(계획대로인 경우\) 통장은 문 연 뒤 5개월차에 바닥납니다/);

// ── 2026-10-13 3차: 준비 기간은 사업 유형마다(B2B 6주, 앱 8주, 매장 12주) — 12주 장의 첫 판매 주차와 맞춘다
const snsB2b = buildCashflowScenarios({ unitPrice: 300_000, unitVariableCost: 30_000, monthlyFixedCost: 500_000, capacity: "대표자 혼자 / 월 12곳", goal: "6개월 안에 고객 가게 10곳", budget: "3000000원", livingCost: "1500000원", recurring: true, businessTypeId: "b2b" })!;
assert.equal(snsB2b.prepWeeks, 6);
assert.deepEqual([snsB2b.prepLiving, snsB2b.prepFixed], [2_250_000, 750_000], "6 weeks = 1.5 months of living and fixed cost");
assert.match(cashflowReference(snsB2b), /준비 기간을 6주로 잡으면\(실행 장의 첫 유료 판매 주차와 같음\).*한 주에 약 500,000원씩 더 나갑니다/);
// 앱: 판단선대로 가도 석 달 안에 중단선 아래 → 중단선 대신 시작 전 결정과 메울 금액, 바닥나는 달에도 금액
const appTyped = buildCashflowScenarios({ unitPrice: 4900, unitVariableCost: 500, monthlyFixedCost: 800_000, budget: "5000000원", livingCost: "0원", goal: "1년 안에 유료 구독 500명", recurring: true, businessTypeId: "app" })!;
assert.equal(appTyped.prepFixed, 1_600_000);
assert.equal(appTyped.stopBrokenOnPlan, true);
const appRef = cashflowReference(appTyped);
assert.match(appRef, /판단선대로 손님이 늘어도\(계획대로인 경우\) 석 달 안에 남은 준비 예산이 중단선/);
if (appTyped.paceRunOut) assert.match(appRef, new RegExp(`${appTyped.paceRunOut}개월차에 바닥납니다. 그 전에 약 [\\d,]+원을 메울 길`));
// 하루 10건이 안 되면 소수 한 자리(반올림이 차이를 부풀리지 않게)
assert.match(cashflowReference(pet), /하루 약 6.4건/);

console.log("cashflow-scenarios: bakery numbers, living cost, survival table, per-day only for daily businesses, goal parsing passed");
