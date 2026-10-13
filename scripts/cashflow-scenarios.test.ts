import assert from "node:assert/strict";
import { buildCashflowScenarios, cashflowMarkdown, cashflowReference, isRecurring, operatingFlowMarkdown, parseActiveGoal, parseRepeatGoal, parseRevenueGoal, parseVolumeGoal } from "../lib/plan-builder/cashflow-scenarios";
import { monthlyVolumeFromCapacity } from "../lib/plan-builder/coach-feasibility";

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
// 중단선 위에서 시작: 6,000만 − 980만 − 11,692,800 = 38,507,200원. 16차: 목표 경우의 가장 낮은 누적(4개월차 −8,592,700원)에도 선 위에 남도록 → 29,914,500원
assert.match(ref, /'목표 경우'대로 갈 때도 이 선 아래로 내려가지 않으려면 초기 지출을 29,914,500원 이하로 씁니다/);
assert.equal(living.stopBroken, false);
// 부가세: 4,500 ÷ 1.1 − 1,600 = 약 2,491원 → 생활비선 (380만 + 200만) ÷ 2,490.9 = 2,329개
assert.match(ref, /부가세가 들어 있다면\(일반과세자\) 한 건에 남는 돈은 약 2,491원으로 줄고, 생활비선은 월 2,329개/);
// 시범 판매가 일부 자리만 쓰면 판매 수 대신 채운 비율(2026-10-12 네일 시뮬레이션: 저녁 한 자리 2주에 주 22건 기준을 댔다)
assert.match(ref, /일부 시간·자리만 쓰면.*연 시간 중 채운 비율/);

// 0원은 '고정비에 넣음'이라는 답 — 없음과 다르다
assert.match(cashflowMarkdown(buildCashflowScenarios({ ...bakery, livingCost: "0원" })!), /대표 생활비는 0원으로 넣으셨고\(고정비에 이미 넣었거나 다른 수입으로 메우는 경우\)/);
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
// 8차: 재방문·단골 목표는 매달 진도와 필요한 첫 방문 수로 나눈다(판매량 목표로 바꾸지는 않는다)
assert.deepEqual(parseRepeatGoal("6개월 안에 재방문 고객 100명"), { count: 100, months: 6, unit: "명", label: "재방문 고객 100명" });
assert.equal(parseRepeatGoal("6개월 안에 월 40건"), null);
{
  const nailRepeat = buildCashflowScenarios({ unitPrice: 45000, unitVariableCost: 6000, monthlyFixedCost: 1_800_000, livingCost: "1800000원", capacity: "대표자 혼자 / 하루 6건", goal: "6개월 안에 재방문 고객 100명", budget: "15000000원", premises: true, businessTypeId: "store" })!;
  const ref = cashflowReference(nailRepeat);
  assert.match(ref, /대표 목표 '재방문 고객 100명'\(6개월\)는 한 달 판매량이 아니라 다시 온 손님 수입니다. 매달 약 17명씩 늘어야 합니다/);
  assert.match(ref, /20%·30%·50%면 6개월 동안 첫 방문 손님이 각각 약 500·334·200명\(한 달 약 84·56·34명\)/);
  // 생활비선 93건 × 39,000 − 360만 = 27,000원 → 부가세를 넣으면 적자
  assert.match(ref, /'생활비까지 버는 경우'도 한 달에 27,000원만 남습니다\(세금 전\). 판매가에 부가세가 들어 있으면\(일반과세자\) 이 경우도 매달 약 [\d,]+원씩 모자라고/);
}
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
assert.doesNotMatch(snsRef, /석 달 적자분\) 아래로 내려가면/, "no broken stop line");
// 대신 멈출 기준: 메운 돈을 더한 잔고가 한 달 지출(50만 + 150만) 아래로(맞대결: 멈출 기준이 아예 없었다)
// 17차: 메울 돈에 한 달 지출(200만)을 더해 세므로 계획대로 가면 잔고가 200만 위에 남는다 → 절대 금액 선을 쓴다(9차의 '표의 같은 줄' 대체는 메울 돈이 모자랄 때만)
assert.match(snsRef, /대신 문 연 뒤에는 메운 돈을 더한 통장 잔고가 한 달에 나가는 돈\(2,000,000원\) 아래로 내려가면 계속할지 다시 정합니다/);
assert.match(snsRef, /이 금액은 최소치입니다\(초기 지출 0원, 세금·해지 빼고/);
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
// 문 여는 날 −300만 + 6개월 중 가장 낮은 누적 −406만 → 바닥 −706만, 17차: 한 달 지출 200만이 남게 → 약 906만 원
assert.equal(sns.coverNeeded, 9_060_000);
assert.match(snsRef, /판단선대로 가도 문 연 뒤 6개월 동안 통장에 한 달 나가는 돈\(2,000,000원\)이 남아 있으려면 준비 예산 밖에서 약 9,060,000원/);
// 분모는 이야기를 나눈 사람 — 노출 수가 아니다(2차: '본 사람의 20%'는 늘 못 미쳤다)
assert.match(snsRef, /글을 본 사람 수\(노출\)는 분모로 쓰지 않고/);

// 처리 한도를 다 채워도 생활비까지 못 버는 사업(펫시터 연결: 5,000원, 비용 500원, 고정비 150만, 생활비 200만, 하루 20건)
const pet = buildCashflowScenarios({ unitPrice: 5000, unitVariableCost: 500, monthlyFixedCost: 1_500_000, capacity: "대표자 혼자 / 하루 매칭 20건", budget: "10000000원", livingCost: "2000000원" })!;
// 하루 20건 × 26일 = 520건 × 4,500 = 2,340,000 − 3,500,000 = −1,160,000
assert.equal(pet.capacityNet, -1_160_000);
assert.match(cashflowReference(pet), /다 판 달에도 생활비를 넣으면 1,160,000원이 모자랍니다/);
// 처리 한도에 막힌 줄은 이름도 근거대로, 판단표 맨 윗줄에 닿을 수 없는 숫자를 쓰지 않는다
assert.equal(pet.scenarios[1].label, "처리 한도를 다 채운 경우");
assert.match(cashflowReference(pet), /판단표 맨 윗줄에 닿을 수 없는 월 778건을 쓰지 않습니다/);
// 공간 없는 사업: 고정비가 절반이면(75만) 본전 167건, 생활비선 612건
assert.match(cashflowReference(pet), /고정비가 절반\(750,000원\)이면 본전은 월 167건, 생활비선은 월 612건/);
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
assert.match(cashflowReference(snsB2b), /준비 기간을 가장 길게 6주로 잡았습니다.*한 주 약 500,000원\)은 문 연 뒤에도 그대로 나가므로, 같은 날짜로 견주면 나아지는 돈은 그 기간에 판 돈뿐입니다.*문 여는 날 잔고는 한 주에 약 500,000원씩 줄어듭니다/);
// 8차: '앞당기면 지출이 줄어든다'고 쓰지 않는다
assert.doesNotMatch(cashflowReference(snsB2b), /준비 기간 지출이 .*줄어듭니다/);
// 앱: 판단선대로 가도 석 달 안에 중단선 아래 → 중단선 대신 시작 전 결정과 메울 금액, 바닥나는 달에도 금액
const appTyped = buildCashflowScenarios({ unitPrice: 4900, unitVariableCost: 500, monthlyFixedCost: 800_000, budget: "5000000원", livingCost: "0원", goal: "1년 안에 유료 구독 500명", recurring: true, businessTypeId: "app" })!;
assert.equal(appTyped.prepFixed, 1_600_000);
assert.equal(appTyped.stopBrokenOnPlan, true);
const appRef = cashflowReference(appTyped);
assert.match(appRef, /판단선대로 손님이 늘어도\(계획대로인 경우\) 석 달 안에 남은 준비 예산이 석 달 버틸 돈보다 적어져, 남은 준비 예산으로 정하는 중단선은 둘 수 없습니다/);
// 10차: 중단선을 둘 수 없을 때 내부 계산값(석 달 적자분)을 보이지 않는다
assert.doesNotMatch(appRef, /중단선\(문 연 뒤 이 아래로/);
if (appTyped.paceRunOut) assert.match(appRef, new RegExp(`${appTyped.paceRunOut}개월차에 바닥납니다. 그 전에 약 [\\d,]+원\\(가장 낮은 달에도 한 달 나가는 돈이 남는 금액\\)을 메울 길`));
// 7차: 메울 금액을 판단선 최소치만이 아니라 '느리면'까지 범위로
if (appTyped.slowShortfall) assert.match(appRef, new RegExp(`느리면 약 ${appTyped.slowShortfall.toLocaleString("ko-KR")}원`));
// 하루 10건이 안 되면 소수 한 자리(반올림이 차이를 부풀리지 않게)
assert.match(cashflowReference(pet), /하루 약 6.4건/);
// 7차: 앞당긴 주수별 절약액을 계산 자료에 미리 준다(실행 장이 곱셈한 숫자가 근거 없는 숫자로 잡혔다)
assert.match(cashflowReference(pet), /그 기간에 판 돈뿐입니다\(조심스러운 경우 1주 약 [\d,]+원 · 2주 약 [\d,]+원/);
assert.doesNotMatch(cashflowReference(pet), /실행 장의 첫 유료 판매 주차와 같음/);

// ── 2026-10-13 5차: 운영 중 사업은 같은 판매량을 12달 복사한 손익표 대신 '지금 그대로'와 '목표까지 가는 길'
const gimbap = operatingFlowMarkdown({ unitPrice: 4500, unitVariableCost: 2000, monthlyFixedCost: 6_000_000, volume: 4000, livingCost: "4000000원", goal: "6개월 안에 월 매출 2,200만원 회복" });
assert.doesNotMatch(gimbap, /1월|흑자 전환/, "no calendar months, no startup wording");
assert.match(gimbap, /한 달에 4,000,000원이 남습니다\(세금 전\)/);
assert.match(gimbap, /대표 생활비 월 4,000,000원까지 버는 선은 월 4,000건/);
assert.match(gimbap, /\| 6개월차 \| 4,000,000원 \| 4,889 \| 6,222,500원 \| 2,222,500원 \|/);
assert.match(gimbap, /'건'은 판매 가격 4,500원짜리 1개 기준/);
// 7차: 12개월을 보이고, 1개월차는 고치는 중이라 지금 그대로 / 생활비선에 걸린 가게는 비상금으로 버티는 달 수를 센다
assert.match(gimbap, /\| 1개월차 \| 4,000,000원 \| 4,000 \| 4,000,000원 \| 0원 \|/);
assert.match(gimbap, /\| 12개월차 \| 4,000,000원 \| 4,889 \|/);
assert.match(gimbap, /판매가 10%\(월 약 400건\) 줄면 한 달에 약 1,000,000원이 더 모자랍니다/);

// 9차: 생활비선이 처리 한도를 넘으면 가격별로 한도 안에 드는 고정비 상한 / 목표가 한도를 넘으면 임시 목표
{
  const petGoal = buildCashflowScenarios({ unitPrice: 5000, unitVariableCost: 500, monthlyFixedCost: 1_500_000, capacity: "대표자 혼자 / 하루 매칭 20건", budget: "10000000원", livingCost: "2000000원", goal: "6개월 안에 월 거래 600건" })!;
  const ref = cashflowReference(petGoal);
  assert.match(ref, /가격 5,000원이면 월 고정비 340,000원 이하, 가격 5,500원이면 월 고정비 600,000원 이하, 가격 6,000원이면 월 고정비 860,000원 이하/);
  assert.match(ref, /대표 목표\(월 600건\)가 처리 한도\(월 520건\)보다 많아.*한도의 80%인 월 416건/);
  assert.deepEqual(parseVolumeGoal("6개월 안에 월 거래 600건"), { volume: 600, months: 6 });
  // 조심스러운 경우로 재방문 목표에 닿을 수 없으면 밝힌다
  const nailRepeat = buildCashflowScenarios({ unitPrice: 45000, unitVariableCost: 6000, monthlyFixedCost: 1_800_000, livingCost: "1800000원", capacity: "대표자 혼자 / 하루 6건", goal: "6개월 안에 재방문 고객 100명", budget: "15000000원", premises: true, businessTypeId: "store" })!;
  assert.match(cashflowReference(nailRepeat), /조심스러운 경우\(월 24건\)로는 6개월 판매가 144건이라.*최소 200건\)에 닿지 않습니다/);
}
// 9차: 운영 중 가게는 부가세가 들어 있을 때의 생활비선과 지금 실적의 부족분
assert.match(operatingFlowMarkdown({ unitPrice: 4500, unitVariableCost: 2000, monthlyFixedCost: 6_000_000, volume: 4000, livingCost: "4000000원", goal: "6개월 안에 월 매출 2,200만원 회복" }), /생활비까지 버는 선은 월 4,783건입니다. 지금 실적\(월 4,000건\)으로는 생활비를 가져간 뒤 한 달에 약 1,636,364원 모자랍니다/);

// 10차: 상대 기준은 매달 돈 내는 사업만 — 네일(매장)은 다시 잔고 금액 하나로
{
  const nailStop = buildCashflowScenarios({ unitPrice: 45000, unitVariableCost: 6000, monthlyFixedCost: 1_800_000, livingCost: "1800000원", capacity: "대표자 혼자 / 하루 6건", goal: "6개월 안에 재방문 고객 100명", budget: "15000000원", premises: true, businessTypeId: "store" })!;
  const ref = cashflowReference(nailStop);
  assert.match(ref, /메운 돈을 더한 통장 잔고가 한 달에 나가는 돈\(3,600,000원\) 아래로 내려가면 계속할지 다시 정합니다/);
  assert.doesNotMatch(ref, /표의 '조심스러운 경우' 줄/);
  // 부가세가 들어 있으면 바뀌는 생활비선을 판단 기준에 함께
  assert.match(ref, /판매가에 부가세가 들어 있으면\(일반과세자\) 이 선은 월 104건으로 바뀝니다/);
  // 이야기할 사람 수는 계약 기준이 아니다
  assert.match(ref, /계약할지 가르는 기준이 아닙니다/);
  assert.match(cashflowMarkdown(nailStop), /개월차는 첫 유료 판매를 시작한 주부터 셉니다/);
}
// 10차: 임시 목표에 닿아도 생활비선이 한도 밖이면 '계획대로'가 아니다
assert.match(cashflowReference(buildCashflowScenarios({ unitPrice: 5000, unitVariableCost: 500, monthlyFixedCost: 1_500_000, capacity: "대표자 혼자 / 하루 매칭 20건", budget: "10000000원", livingCost: "2000000원", goal: "6개월 안에 월 거래 600건" })!), /이 목표에 닿아도 생활비선이 한도 안에 들어오기 전까지는 매달 모자라므로 '계획대로'로 보지 않습니다/);
// 10차: 운영 중 목표 길은 가정이고 3개월차에 점검, 감소가 이어질 때를 함께
{
  const op = operatingFlowMarkdown({ unitPrice: 4500, unitVariableCost: 2000, monthlyFixedCost: 6_000_000, volume: 4000, livingCost: "4000000원", goal: "6개월 안에 월 매출 2,200만원 회복" });
  assert.match(op, /목표에서 거꾸로 잡은 값\(가정\).*3개월차 실적이 목표 길\(월 4,356건\)보다 20% 넘게 밑이면/);
  assert.match(op, /판매가 지금부터 매달 2%씩 줄면\(가정\) 6개월차에 월 약 3,543건/);
}

// 업종 점검: 유형마다 맞는 판단 단위(앱은 활성 이용자, 공간은 예약 달력)
assert.match(cashflowReference(buildCashflowScenarios({ unitPrice: 4900, unitVariableCost: 500, monthlyFixedCost: 800_000, livingCost: "0원", budget: "5000000원", recurring: true, businessTypeId: "app", goal: "1년 안에 유료 구독 500명" })!), /활성 이용자\)과 2주 안 재방문 비율/);
assert.doesNotMatch(cashflowReference(buildCashflowScenarios({ unitPrice: 45000, unitVariableCost: 6000, monthlyFixedCost: 1_800_000, livingCost: "1800000원", budget: "15000000원", premises: true, businessTypeId: "store" })!), /활성 이용자|예약 달력\(가동률\)과 문의 수로/);

// 15차 업종 점검: '주 40개'처럼 '주' 한 글자 일주일도 처리 한도로 읽고, '누가 / 얼마나'에서 앞쪽 '주 2회'는 읽지 않는다
assert.equal(monthlyVolumeFromCapacity("대표자 혼자 / 주 40개")?.volume, 172);
assert.match(monthlyVolumeFromCapacity("대표자 혼자 / 주 8건")?.note ?? "", /^일주일 8건 × 월 4.3주 = 월 34건$/);
assert.deepEqual([monthlyVolumeFromCapacity("주 2회 수업 / 월 40명")?.volume, monthlyVolumeFromCapacity("주 2회 수업 / 월 40명")?.unit], [40, "명"]);
assert.equal(monthlyVolumeFromCapacity("대표자 혼자 / 하루 매칭 20건")?.volume, 520);
// 16차 업종 점검(이사): 목표대로 가도 12개월 내내 잔고가 중단선(9,300,000원) 아래다 — 15차의 '4개월차부터 이 선'은 틀렸다. 표의 같은 줄 − 실제 초기 지출 − 한 달 적자분(3,100,000원)과 견준다
const moving = buildCashflowScenarios({ unitPrice: 150_000, unitVariableCost: 40_000, monthlyFixedCost: 2_200_000, capacity: "대표자 혼자 / 하루 2건", goal: "6개월 안에 월 40건", budget: "18000000원", livingCost: "2000000원", businessTypeId: "visit" })!;
const movingRef = cashflowReference(moving);
assert.match(movingRef, /다만 '목표 경우'대로 가도 잔고가 이 선보다 낮아지는 달이 있어.*12개월 동안 잔고를 표의 '목표 경우' 줄과 견주어, 그 줄에서 실제로 쓴 초기 지출과 한 달 적자분\(3,100,000원\)을 뺀 값보다 낮으면 다시 정합니다\(초기 지출 0원이면 1개월차 5,500,000원 · 2개월차 3,060,000원 · 3개월차 1,280,000원\)/);
// 시작 잔고 11,700,000원 + 목표 경우의 가장 낮은 누적(5개월차 −8,900,000원) = 2,800,000원
assert.match(movingRef, /초기 지출을 2,800,000원 이하로 써야 '목표 경우'대로 갈 때 가장 낮은 달에도 통장이 0원 아래로 내려가지 않습니다/);
assert.doesNotMatch(movingRef, /4개월차부터 이 선을 씁니다|문 여는 날 이 선 위에서 시작하려면/);
assert.match(movingRef, /문을 연 뒤: 실제 판매 수를 위 기준과 매달 비교하고, 잔고가 표의 '목표 경우' 줄에서/);
assert.equal(moving.setupBeforeStop, 2_800_000);
// 16차 업종 점검(한국어 과외): 1회 값을 파는데 목표가 '정기 학생 10명' → 판매량은 '번', 학생 1명 = 주 1회(월 4번) 가정
const tutor = buildCashflowScenarios({ unitPrice: 40_000, unitVariableCost: 0, monthlyFixedCost: 200_000, budget: "1000000원", goal: "3개월 안에 정기 학생 10명", offer: "1:1 회화 60분", recurring: true, businessTypeId: "lesson" })!;
const tutorRef = cashflowReference(tutor);
assert.equal(tutor.unit, "번");
assert.equal(tutor.scenarios[2].volumes.at(-1), 40, "goal: 10 students × 4 lessons");
assert.match(tutorRef, /가격 40,000원은 1회 값이라 판매량은 '번\(수업 횟수\)'으로 셉니다. 학생 1명이 주 1회\(한 달 4번, 가정\)라면 목표 학생 10명은 월 40번, 본전 월 5번은 학생 약 2명입니다/);
assert.match(tutorRef, /판매량은 '그달 결제된 수업 횟수'입니다/);
assert.doesNotMatch(tutorRef, /돈 내는 손님 40번/);
// 판단선대로 가도 2개월차에 누적 −160,000원 → 한도(160,000원)까지 쓰면 바로 선 아래 → 표의 줄과 견주고, 통장이 바닥나지 않는 한도는 440,000원
assert.match(tutorRef, /다만 '판단선대로 느는 경우'대로 가도.*초기 지출을 440,000원 이하로 써야/);
assert.equal(buildCashflowScenarios({ unitPrice: 300_000, unitVariableCost: 30_000, monthlyFixedCost: 500_000, capacity: "대표자 혼자 / 월 12곳", goal: "6개월 안에 고객 가게 10곳", budget: "3000000원", livingCost: "1500000원", recurring: true })!.sessionNote, null, "monthly packages are not per-session");
// 16차 맞대결(펫시터): 목표(월 600건)가 한도(월 520건)를 넘으면 '목표 경우'라고 부르지 않는다
const petRef = cashflowReference(buildCashflowScenarios({ unitPrice: 5000, unitVariableCost: 500, monthlyFixedCost: 1_500_000, capacity: "대표자 혼자 / 하루 매칭 20건", goal: "6개월 안에 월 거래 600건", budget: "10000000원", livingCost: "2000000원" })!);
assert.match(petRef, /- 한도까지 느는 경우\(대표 목표\(월 600건\)는 처리 한도\(월 520건\)를 넘어 닿을 수 없으므로/);
assert.doesNotMatch(petRef, /목표 경우/);

// 17차 맞대결(연습실): '가동률 50%' 목표 → 처리 한도(하루 30시간 × 26일 = 월 780시간)의 50% = 월 390시간
const room = buildCashflowScenarios({ unitPrice: 15_000, unitVariableCost: 500, monthlyFixedCost: 2_800_000, capacity: "방 3개 / 하루 30시간", goal: "6개월 안에 가동률 50%", budget: "25000000원", premises: true, businessTypeId: "space" })!;
assert.equal(room.scenarios[2]?.volumes.at(-1), 390);
const roomRef = cashflowReference(room);
assert.match(roomRef, /목표 경우\(대표 목표\(가동률 50% = 처리 한도 월 780시간의 50%, 월 390시간\)까지 6개월/);
// 17차: 목표 경우가 본전(194시간)에 닿기 전 두 달은 그 달 판매선이 '계획대로' 선(목표대로 가도 '바꿈'이 되던 문제)
assert.match(roomRef, /다만 손님이 늘어나는 처음 2개월은 '목표 경우' 판매선\(1개월차 97시간, 2개월차 156시간\)을 그 달의 '계획대로' 선으로 씁니다.*3개월차부터 위 선을 씁니다/);
assert.match(roomRef, /판매선은 목표입니다. 판매선에 못 미쳐도 판단 기준의 '계획대로' 선 이상이면 계획대로/);
// 펫시터: 한도(520건)에 막혀 '계획대로'는 한도의 80%(416건) — 판매선이 그 아래인 처음 4개월은 판매선으로 판정
assert.match(petRef, /다만 손님이 늘어나는 처음 4개월은 '한도까지 느는 경우' 판매선\(1개월차 167건, 2개월차 238건, 3개월차 308건, 4개월차 379건\)/);
assert.doesNotMatch(cashflowReference(buildCashflowScenarios({ ...bakery, goal: undefined })!), /다만 손님이 늘어나는/, "no goal path → no ramp line");

// 실제 API 8건(2026-10-13): 생활비를 안 적은 사업도 생활비를 가져갈 선을 예시 두 금액으로 보인다 — (20만 + 100만) ÷ 40,000 = 30번
assert.match(tutorRef, /대표 생활비가 계산에 빠져 있습니다. 나중에 사업에서 생활비를 가져가려면 월 1,000,000원이면 생활비까지 버는 판매량 월 30번, 월 1,500,000원이면 생활비까지 버는 판매량 월 43번입니다\(예시 금액\)/);
assert.doesNotMatch(ref, /대표 생활비가 계산에/, "living cost given → no example line");

console.log("cashflow-scenarios: bakery numbers, living cost, survival table, per-day only for daily businesses, goal parsing passed");
