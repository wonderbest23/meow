import assert from "node:assert/strict";
import { roadmapOpening } from "../lib/plan-builder/cashflow-scenarios";
import { buildCashflowScenarios, cashflowShapeFor, cashflowFromFields, cashflowMarkdown, cashflowReference, fixedCostAssumptionMarkdown, fixedCostAssumptionReference, fixedCostAssumptionsFromFields, parseRevenueGoal, parseVolumeGoal, realUnitMargin, vatInPrice } from "../lib/plan-builder/cashflow-scenarios";

// 돈 장(품질기준 6·7번) — 숫자는 코드가 계산하고 AI는 해석만 한다. 빵집 시험(2026-10-10) 숫자로 고정한다.
const bakery = { unitPrice: 4500, unitVariableCost: 1600, monthlyFixedCost: 3_800_000, capacity: "대표자 혼자 / 하루 120개", goal: "6개월 안에 월 매출 1,200만원", budget: "60000000원" };

// 계획서 품질 Q3(2026-10-28): 한 개에 실제 남는 돈 = 판매가 − 부가세(일반과세자, 판매가의 1/11) − 한 개당 비용
assert.equal(vatInPrice(4500), 409);
assert.equal(vatInPrice(9000), 818);
assert.equal(realUnitMargin(9000, 3500), 4682, "검토자 사례: 9,000원 − 재료비 3,500원은 5,500원이 아니라 부가세를 빼고 4,682원");

// 본전 = 사업 비용(월 고정비)만 메우는 판매량: 3,800,000 ÷ 2,491 → 월 1,526개, 조심스러운 경우(절반) 763개, 매달 -1,899,367원
const plain = buildCashflowScenarios(bakery)!;
assert.equal(plain.vat, 409);
assert.equal(plain.contribution, 2491);
assert.equal(plain.breakEven, 1526);
assert.deepEqual(plain.scenarios.map(s => s.key), ["careful", "breakeven", "goal"]);
assert.equal(plain.scenarios[1].label, "본전", "본전의 뜻은 하나 — '생활비까지 버는 경우'는 없다");
assert.equal(plain.scenarios[0].volumes[0], 763);
assert.equal(plain.scenarios[0].net[0], -1_899_367);
// 초기 지출 한도는 중단선에서 거꾸로(계획서 품질 Q6): 준비 예산 − 중단선(3개월분 11,400,000) − 문 열기 전 고정비(1개월, 가정, Q7) − 조심스러운 경우 6개월 부족분(1,899,367 × 6)
assert.equal(plain.prepCost, 3_800_000);
assert.equal(plain.setupLimit, 60_000_000 - 11_400_000 - 3_800_000 - 11_396_202);
assert.equal(plain.stopMonth, 6, "spending the limit reaches the stop line in the careful case's month 6");
assert.equal(plain.scenarios[2].volumes.at(-1), 2667, "goal: 12,000,000 ÷ 4,500, reached in month 6");
assert.ok(plain.scenarios.every(s => s.volumes.every(v => v <= 3120)), "no case sells above the stated capacity");
// 버티는 기간 = (준비 예산 − 초기 지출 − 문 열기 전 고정비) ÷ 월 고정비(매출이 없다고 볼 때), 중단선 = 월 고정비 3개월분
assert.deepEqual(plain.survival.map(row => [row.spend, row.months]), [[12_000_000, 11], [24_000_000, 8], [36_000_000, 5], [48_000_000, 2]]);
assert.equal(plain.stopReserve, 11_400_000);
// 대안 가격도 가격마다 부가세를 다시 뺀다: 4,000원 → 2,036원 → 1,867개
assert.deepEqual(plain.priceAlternatives.map(alt => [alt.price, alt.breakEven]), [[4000, 1867], [5000, 1291], [5500, 1118]]);
assert.deepEqual([plain.decision.go, plain.decision.floor, plain.decision.goLabel], [1526, 763, "본전 판매량"], "go line = break-even, not half of break-even");
assert.equal(plain.unitNote, null, "no offer → no unit note");
const set = buildCashflowScenarios({ ...bakery, offer: "식빵·소금빵 아침 세트" })!;
assert.match(set.unitNote ?? "", /판매 단위\(세트\)를 같다고 보고/, "capacity in 개 vs a set offer is flagged");

// 저장된 생활비 답은 지우지 않지만 계산에는 쓰지 않는다(대표 결정 2026-10-28)
const fields = (extra: Array<{ key: string; value: string }>) => [{ key: "capacity", value: bakery.capacity }, { key: "goal", value: bakery.goal }, { key: "budget", value: bakery.budget }, ...extra];
const withLiving = cashflowFromFields(fields([{ key: "livingCost", value: "2,000,000원" }]), bakery)!;
assert.deepEqual([withLiving.breakEven, withLiving.scenarios[0].net[0], withLiving.setupLimit], [plain.breakEven, plain.scenarios[0].net[0], plain.setupLimit]);

const md = cashflowMarkdown(plain);
// 한 개에 실제 남는 돈 표: 법정 부가세만 계산, 포장·폐기·카드 수수료는 '확인 필요' 칸(금액을 지어내지 않는다)
assert.match(md, /### 한 개에 실제 남는 돈/);
assert.match(md, /\| 부가세 \| -409원 \| 판매가에 부가세가 들어 있고 일반과세자일 때 판매가의 1\/11, 법정 세율 10%\. 과세 유형은 세무서 확인 \|/);
for (const row of ["포장·용기", "팔지 못해 버리는 몫\\(폐기\\)", "카드·결제 수수료"]) assert.match(md, new RegExp(`\\| ${row} \\| 알아본 뒤 채움 \\|`));
assert.match(md, /\| \*\*한 개에 실제 남는 돈\*\* \| \*\*2,491원\*\* \|/);
assert.match(md, /아래 숫자는 낙관적인 쪽입니다/);
// 2026-11-17 점검: '확인 필요'가 계획서마다 9~23번, 이 표에서만 5~6번 — 표는 '알아본 뒤 채움'으로 부르고 '확인 필요'를 쓰지 않는다(금액은 여전히 넣지 않음)
assert.doesNotMatch(md, /확인 필요/);
assert.match(md, /'알아본 뒤 채움' 칸이 채워지면 남는 돈이 줄고/);
assert.match(md, /간이과세자는 업종에 따라 매출의 약 1\.5~4%/);
assert.match(md, /본전에서 대표님이 가져가는 돈은 0원입니다\. 본전을 넘겨 1개 더 팔 때마다 약 2,491원이 대표님 몫으로 남습니다/);
assert.match(md, /### 세 가지 경우로 본 한 달/);
assert.match(md, /하루 약 59개\(월 26일 영업 기준\)/, "daily businesses get the per-day line");
assert.equal((md.match(/^\| \d+개월차 \|/gm) ?? []).length, 12, "12 monthly rows");
assert.match(md, /### 매출이 없어도 버티는 기간/);
assert.match(md, /\| 36,000,000원 \| 20,200,000원 \| 약 2개월 \| 약 5개월 \|/);
assert.doesNotMatch(md, /생활비까지|생활비선|준비 기간 생활비|예산 밖에서 낼 때/, "대표 생활비로 만든 판매량·버티는 기간은 없다");
assert.match(md, /대표님 개인 생활비와 소득세는 이 계산에 넣지 않았습니다/);
assert.doesNotMatch(md, /12개월 손익 추정|흑자 전환/, "the old max-capacity profit table is gone");
assert.equal((md.match(/```plan-chart/g) ?? []).length, 1, "one chart");
// 서비스(단위 '건')는 포장·폐기 대신 그 밖의 건당 비용, 온라인은 포장·택배와 스토어 수수료
const service = cashflowMarkdown(buildCashflowScenarios({ unitPrice: 150_000, unitVariableCost: 20_000, monthlyFixedCost: 600_000, capacity: "대표자 혼자 / 일주일 8건", shape: { premises: false, cycle: "visits", vat: "general" } })!);
assert.match(service, /\| 그 밖에 한 건마다 드는 돈\(이동비·소모품 등\) \| 알아본 뒤 채움 \|/);
assert.doesNotMatch(service, /폐기|포장/);
assert.match(cashflowMarkdown(buildCashflowScenarios({ ...bakery, online: true })!), /\| 포장·택배 \| 알아본 뒤 채움 \|[\s\S]*\| 스토어 판매·결제 수수료 \| 알아본 뒤 채움 \|/);

const ref = cashflowReference(plain, { basis: "건당 결제 기준" });
assert.match(ref, /건당 결제 기준으로 판매량을 하나로 정하지 않고/);
assert.match(ref, /- 판매가 4,500원 \/ 변동비\(한 개당 비용\) 1,600원 \/ 부가세 409원\(.*과세 유형은 세무서 확인\) \/ 한 개에 실제 남는 돈 2,491원/);
assert.match(ref, /- 손익분기: 월 1,526개 \(매출 6,867,000원\) — 본전은 사업 비용\(월 고정비\)만 메우는 판매량 하나로 씁니다/);
assert.match(ref, /포장·용기·팔지 못해 버리는 몫\(폐기\)·카드·결제 수수료는 아직 빼지 않았습니다\(알아본 뒤 채움\)\. 그래서 본전 판매량은 낙관적인 쪽/);
assert.match(ref, /대표님 몫으로 남습니다/);
assert.match(ref, /판단 기준\('12주 할 일과 매달 볼 숫자' 장에서 씀\): 본전 판매량\(하루 약 59개 \/ 일주일 약 355개 \/ 한 달 1,526개\) 이상이면 계획대로/);
assert.match(ref, /규모\(공간·장비·상품 수\)를 줄여서, 본전의 절반 이하면 시작안을 바꿉니다. 판단은 계약처럼 큰돈을 쓰기 전\(출시 전\)에 한 번, 문을 연 뒤에 다시 합니다/);
// 계약·개업 전 판단: 관심 조사 결과는 처리량이 아니라 본전과 같은 기간끼리, 할인 원칙과 통과 기준은 '(제안)'(2026-10-28 검토: 기준 칸이 비어 있었다)
assert.match(ref, /계약·개업 전 판단\(관심 조사 결과를 볼 때\): 적은 수량에 할인 원칙을 곱한 '예상 구매'를 처리량\(하루에 만들 수 있는 양\)이 아니라 본전 판매량과 같은 기간끼리 비교합니다/);
assert.match(ref, /할인 원칙\(제안\): 예상 구매 = 응답마다 적은 수량 × 배수의 합 — 날짜·수량을 남긴 모르는 사람 응답 × 0\.5\(실제 구매로 이어지는 비율, 가정\), 지인·가족 응답 × 0\.25\(그 절반, 가정\), 날짜·수량 없는 응답 × 0/);
assert.match(ref, /통과 기준\(제안\): 예상 구매가 본전\(일주일 약 355개\) 이상이고 날짜·수량을 남긴 응답 수가 위 단골 수\(쓴 횟수 가정을 함께 밝힘\) 이상이면 계약을 검토하고, 예상 구매가 본전의 절반\(일주일 약 177개\) 이하이면 계약하지 않고/);
// 출시 전: 팔 수 있으면 실제 판매 수, 못 팔면 주문 의사만으로 판매량 기준을 채웠다고 보지 않는다(2026-10-11 유형 시뮬레이션)
assert.match(ref, /출시 전 판단: 돈을 받고 해 볼 수 있으면.*아직 돈을 받을 수 없으면 주문 의사만으로 기준을 채웠다고 보지 않고/);
// 비율별로 닿아야 하는 사람 수는 코드가 계산한다: 1,526 ÷ 10% = 15,260명/월 → 하루 약 587명(26일)
assert.match(ref, /닿아야 하는 사람 수.*비율 10%면 하루 약 587명, 20%면 하루 약 294명, 30%면 하루 약 196명/);
assert.match(ref, /문을 연 뒤: 실제 판매 수를 위 기준과 매달 비교/);
assert.match(ref, /목표 경우 월별 판매선.*1개월차 763개, 2개월차 1,144개.*6개월차 2,667개/);
assert.match(ref, /가격을 바꾸면\(500원씩,.*4,000원 → 본전 하루 약 72개/, "the price step is a sourced number too");
assert.match(ref, /관심 글의 댓글·공감 수는 실제 판매 수가 아니므로/);
assert.match(ref, /중단선: 문을 연 뒤 남은 준비 예산이 11,400,000원\(월 고정비 3개월분\)에 닿으면 계속할지 다시 정합니다/);
assert.match(ref, /초기 지출 한도: 준비 예산 60,000,000원 − 중단선 11,400,000원 − 문 열기 전 고정비 3,800,000원 − 조심스러운 경우 6개월 부족분 11,396,202원 = 33,403,798원\. 한도까지 쓰면 조심스러운 경우 문 연 뒤 6개월째에 중단선에 닿습니다/);
assert.match(ref, /매출이 없어도 중단선까지 버티는 기간\(\(준비 예산 − 초기 지출 − 문 열기 전 고정비 − 중단선\) ÷ 월 고정비, 잔액 0원까지는 최대 3개월 더\): 초기 지출 12,000,000원이면 약 8개월/);
assert.match(ref, /문 열기 전 고정비: 계약부터 문 열 때까지 1개월\(가정, 12주 표에서 더 길면 한 달마다 3,800,000원 더\)에도 고정비 3,800,000원이 나가 준비 예산에서 먼저 뺍니다/);
assert.doesNotMatch(ref, /생활비까지|생활비선|준비 기간 생활비/);

// 초기 지출을 알면 그 한 줄로 버티는 기간을 센다
const known = buildCashflowScenarios({ ...bakery, setupCost: "30000000원" })!;
assert.deepEqual(known.survival, [{ spend: 30_000_000, months: 6, toStop: 3 }]);
// 30,000,000원 − 문 열기 전 고정비 3,800,000원 − 1,899,367원 × 8 ≤ 11,400,000원 → 8개월째에 중단선
assert.equal(known.stopMonth, 8);
assert.match(cashflowReference(known), /초기 지출 30,000,000원을 쓰면 조심스러운 경우 문 연 뒤 8개월째에 남은 준비 예산이 중단선에 닿습니다/);

// 주·월 단위로 일하는 사업에는 하루 기준을 붙이지 않는다(출장 촬영 '일주일 8건')
const photo = buildCashflowScenarios({ unitPrice: 150_000, unitVariableCost: 20_000, monthlyFixedCost: 600_000, capacity: "대표자 혼자 / 일주일 8건", budget: "5000000원" })!;
assert.equal(photo.daily, false);
assert.doesNotMatch(cashflowMarkdown(photo) + cashflowReference(photo), /하루 약/);
assert.match(cashflowMarkdown(photo), /### 두 가지 경우로 본 한 달/, "no revenue/volume goal → two cases");
assert.match(cashflowMarkdown(buildCashflowScenarios({ ...bakery, budget: "5000000원" })!), /1개월도 못 버팀/);

// 월 고정비를 모르면 세 가지 고정비 가정으로 본전 판매량(가정 표시)
const assumed = fixedCostAssumptionsFromFields([{ key: "price", value: "9,000원" }, { key: "unitCost", value: "3,500원" }, { key: "capacity", value: "대표자 혼자 / 하루 40개" }])!;
assert.deepEqual(assumed.rows.map(row => [row.fixed, row.breakEven]), [[500_000, 107], [1_500_000, 321], [3_000_000, 641]]);
assert.match(fixedCostAssumptionReference(assumed), /세 가지 고정비 가정으로 계산했습니다\(가정/);
assert.match(fixedCostAssumptionReference(assumed), /월 고정비 1,500,000원\(가정\)이면 본전 하루 약 12개/);
assert.match(fixedCostAssumptionMarkdown(assumed), /\| 월 고정비\(가정\) \| 본전 판매량 \|/);
assert.equal(fixedCostAssumptionsFromFields([{ key: "price", value: "9,000원" }, { key: "unitCost", value: "3,500원" }, { key: "cost", value: "1,500,000원" }]), null, "고정비를 알면 가정 표를 만들지 않는다");
assert.equal(fixedCostAssumptionsFromFields([{ key: "price", value: "9,000원" }]), null, "한 개당 비용을 모르면 계산하지 않는다");

// 목표 읽기: 매출·판매량 목표만 숫자로 바꾸고, 판매량이 아닌 목표는 바꾸지 않는다
assert.deepEqual(parseRevenueGoal("6개월 안에 월 매출 1,200만원"), { revenue: 12_000_000, months: 6 });
assert.deepEqual(parseVolumeGoal("3개월 안에 하루 150잔"), { volume: 3900, months: 3, label: "하루 150잔" }, "대표가 적은 목표 말을 그대로 보인다(매출로 바꾸지 않음)");
assert.deepEqual(parseVolumeGoal("1년 안에 월 40건"), { volume: 40, months: 12, label: "월 40건" });
assert.equal(parseVolumeGoal("6개월 안에 재방문 고객 100명"), null);
assert.equal(parseRevenueGoal("3개월 안에 흑자"), null);

// 팔수록 손해면 계산하지 않는다(질문 화면 경고가 맡는다) — 부가세를 빼고 남는 돈이 없을 때도 같다
assert.equal(buildCashflowScenarios({ ...bakery, unitVariableCost: 5000 }), null);
assert.equal(buildCashflowScenarios({ ...bakery, unitVariableCost: 4200 }), null, "4,500 − 409 − 4,200 < 0");
// 처리량을 다 팔아도 본전이 안 되면 그렇게 말한다(세탁 픽업 극단값)
assert.match(cashflowReference(buildCashflowScenarios({ unitPrice: 3000, unitVariableCost: 1500, monthlyFixedCost: 8_000_000, capacity: "대표자와 기사 2명 / 하루 100벌" })!), /처리량 최대치.*다 팔아도 본전에 못 미칩니다/);

// 두 쪽을 잇는 사업 · 앱은 온라인이어도 스토어가 아니다(2026-11-14 과외 매칭 계획서 검토) — 스토어 · 포장 · 택배 · 판매량 대신 그 사업의 말
{
  const money = { unitPrice: 40_000, unitVariableCost: 7_500, monthlyFixedCost: 1_000_000, capacity: "대표자 혼자 / 한 달 60건", goal: "6개월 안에 손익분기 도달", budget: "5000000원", online: true };
  const connect = buildCashflowScenarios({ ...money, shape: cashflowShapeFor({ typeId: "platform", online: true, description: "과외 선생님 연결" }) })!;
  const text = cashflowMarkdown(connect) + cashflowReference(connect);
  assert.doesNotMatch(text, /스토어|포장|택배|본전 판매량|더 팔 때/);
  assert.match(text, /서비스를 연 뒤/); assert.match(text, /본전 성사 건수/); assert.match(text, /한 건 수수료/);
  assert.equal(connect.breakEven, 35);
  // 목표 기간은 세는 법을 한 줄로 넘긴다 — 장마다 '오늘부터'와 '개업 뒤'로 다르게 세지 않게
  assert.match(cashflowReference(connect), /목표 기간 세는 법\(모든 장에서 같게 씁니다\): '6개월 안에'는 서비스를 열 때\(\d+주차\)부터 6개월로 셉니다/);
  assert.doesNotMatch(cashflowReference(buildCashflowScenarios({ ...money, goal: "3개월 안에 개업", shape: cashflowShapeFor({ typeId: "platform", online: true, description: "과외 선생님 연결" }) })!), /목표 기간 세는 법/);
  // 물건을 파는 온라인 가게는 그대로 스토어 말을 쓴다
  const shop = buildCashflowScenarios({ ...money, shape: cashflowShapeFor({ typeId: "ship", online: true, description: "수제 캔들 스마트스토어" }) })!;
  assert.match(cashflowMarkdown(shop), /스토어를 공개한 뒤/); assert.match(cashflowMarkdown(shop), /포장·택배/);
}

// ── 2026-11-16 실제 AI 계획서 9개 점검(돈 계산 엔진) ──────────────────────────────────────────────
{
  // (1) 목표 경우: 인원·가구 목표도 읽는다 — 예전엔 '원생 40명'·'유료 구독 500명'·'정기 구독 80가구'에 목표 경우가 없어 그래프가 손해 선 하나뿐이었다
  assert.deepEqual(parseVolumeGoal("1년 안에 원생 40명", 26, { cycle: "enroll" }), { volume: 40, months: 12, label: "원생 40명" });
  assert.deepEqual(parseVolumeGoal("1년 안에 유료 구독 500명", 26, { cycle: "enroll" }), { volume: 500, months: 12, label: "유료 구독 500명" });
  assert.deepEqual(parseVolumeGoal("1년 안에 정기 구독 80가구", 26, { cycle: "enroll" }), { volume: 80, months: 12, label: "정기 구독 80가구" });
  assert.equal(parseVolumeGoal("6개월 안에 재방문 고객 100명", 26, { cycle: "visits" })?.volume, 109, "100명 × 4.33 ÷ 4주(가정) → 월 109건");
  assert.equal(parseVolumeGoal("6개월 안에 월 거래 600건")?.volume, 600, "'월'과 숫자 사이의 말도 읽는다");
  assert.equal(parseVolumeGoal("3개월 안에 단골 20명"), null, "'6개월'의 '월'을 월 판매량으로 읽지 않는다");
  assert.equal(parseVolumeGoal("3개월 안에 단골 30명", 26, { cycle: "weekly" }), null, "자주 사는 상품의 단골 수는 한 달 판매량을 알 수 없다");
  assert.equal(parseVolumeGoal("1년 안에 누적 회원 500명", 26, { cycle: "enroll" }), null, "쌓인 숫자는 한 달 건수가 아니다");
  const coding = buildCashflowScenarios({ unitPrice: 220_000, unitVariableCost: 15_000, monthlyFixedCost: 3_500_000, capacity: "대표자 혼자 / 한 달 40명", goal: "1년 안에 원생 40명", budget: "30000000원", shape: { premises: true, cycle: "enroll", vat: "exempt", trade: "lesson" } })!;
  assert.deepEqual(coding.scenarios.map(s => [s.key, s.volumes[0], s.volumes.at(-1)]), [["careful", 9, 9], ["breakeven", 18, 18], ["goal", 9, 40]]);
  assert.equal(coding.scenarios[2].net.at(-1), 40 * 205_000 - 3_500_000);
  const codingMd = cashflowMarkdown(coding);
  assert.match(codingMd, /\| 목표 경우 \| 9명 → 40명 \| .* \| 대표 목표\(원생 40명\)까지 12개월 동안 같은 폭으로 는다고 가정 \|/);
  assert.match(codingMd, /"title":"목표 경우 통장 누적"/, "목표 경우가 있으면 그래프는 목표 경우를 먼저 보인다");

  // (2) 운영 중인 사업: 새 돈 흐름 표(부가세 포함), 지금 실적에서 시작, 준비 기간·중단선·초기 지출 한도 없음
  //     김밥집(4,500원·2,000원·월 600만 원, 실적 월 4,000줄, 개선 예산 500만 원): 예전 '1개월차 흑자 전환'·부가세 없는 본전 2,400줄·12개월 합계 4,800만 원
  const gimbap = buildCashflowScenarios({ unitPrice: 4500, unitVariableCost: 2000, monthlyFixedCost: 6_000_000, capacity: "대표자 부부와 아르바이트 1명 / 하루 250줄", goal: "6개월 안에 월 매출 2,200만원 회복", budget: "5000000원",
    shape: { premises: true, cycle: "weekly", vat: "general", trade: "food", open: { week: 11, startWeek: 7 } }, operating: { actualVolume: 4000 } })!;
  assert.equal(gimbap.contribution, 2091); assert.equal(gimbap.breakEven, 2870);
  assert.deepEqual(gimbap.scenarios.map(s => [s.key, s.volumes[0], s.volumes.at(-1)]), [["careful", 4000, 4000], ["breakeven", 2870, 2870], ["goal", 4000, 4889]]);
  assert.equal(gimbap.scenarios[0].net[0], 2_364_000, "4,000줄 × 2,091원 − 6,000,000원");
  assert.equal(gimbap.scenarios[0].cumulative[11], 28_368_000, "12개월 누적은 부가세를 뺀 값(예전 48,000,000원)");
  assert.deepEqual([gimbap.prep.months, gimbap.prepCost, gimbap.stopReserve, gimbap.setupLimit, gimbap.survival.length], [0, 0, null, null, 0]);
  const gimbapMd = cashflowMarkdown(gimbap), gimbapRef = cashflowReference(gimbap);
  assert.doesNotMatch(gimbapMd + gimbapRef, /흑자 전환|중단선|문 열기 전|초기 지출 한도|버티는 기간|관심 조사/);
  assert.match(gimbapMd, /나가는 돈\(부가세 포함\)/);
  assert.match(gimbapMd, /가정: 지금 실적\(월 4,000줄\)이 그대로, 개선 효과 없음/);
  assert.match(gimbapMd, /지금 실적\(월 4,000줄\)은 본전\(월 2,870줄\)보다 1,130줄 많아, 한 달 약 2,364,000원이 남습니다/);
  assert.match(gimbapMd, /목표 경우는 지금 그대로보다 12개월 동안 16,730,091원 더 남깁니다/);
  assert.match(gimbapMd, /이번 개선에 쓸 수 있는 돈 5,000,000원을 다 써도, 목표 경우에는 6개월차에 더 남긴 돈으로 되찾습니다/);
  assert.match(gimbapMd, /"breakEvenMonth":null/, "운영 중 사업 그래프에 '1개월차 본전' 표시를 두지 않는다");
  assert.match(gimbapRef, /^운영 중인 사업의 계획 시나리오 계산/);
  assert.match(gimbapRef, /'6개월 안에'는 계획 1주차부터 6개월로 셉니다/);
  assert.match(gimbapRef, /판단 기준\('12주 할 일과 매달 볼 숫자' 장에서 씀\): 매달 실제 판매 수를 목표 경우 월별 판매선, 지금 실적\(월 4,000줄\), 본전\(월 2,870줄\)과 비교합니다/);
  //     옷가게(39,000원·17,000원·월 400만 원, 실적 월 769건, 목표 '재구매율 30%', 개선 예산 1,000만 원): 예전 12개월 합계 155,016,000원
  const fashion = buildCashflowScenarios({ unitPrice: 39_000, unitVariableCost: 17_000, monthlyFixedCost: 4_000_000, goal: "6개월 안에 재구매율 30%", budget: "10000000원", online: true,
    shape: cashflowShapeFor({ typeId: "ship", online: true, description: "20대 여성 의류를 파는 온라인 쇼핑몰" }), operating: { actualVolume: 769 } })!;
  assert.equal(fashion.scenarios.length, 2, "매출·건수가 아닌 목표(재구매율)는 목표 경우를 지어내지 않는다");
  assert.equal(fashion.scenarios[0].net[0], 769 * 18_455 - 4_000_000);
  const fashionMd = cashflowMarkdown(fashion);
  assert.doesNotMatch(fashionMd, /155,016,000/);
  assert.match(fashionMd, /\| 광고비\(주문 1건당\) \| 알아본 뒤 채움 \|/);
  assert.match(fashionMd, /지금보다 한 달 약 46건 더 늘려야 합니다\(10,000,000원 ÷ 12개월 ÷ 한 건에 실제 남는 돈 18,455원\)/);
  // 실적이 본전보다 적은 운영 중 사업은 모자라는 돈을 숨기지 않는다
  const thin = buildCashflowScenarios({ unitPrice: 10_000, unitVariableCost: 4000, monthlyFixedCost: 1_000_000, operating: { actualVolume: 150 } })!;
  assert.match(cashflowMarkdown(thin), /지금 실적\(월 150건\)은 본전\(월 197건\)보다 47건 적어, 한 달 약 236,350원이 모자랍니다/);

  // (3) 정기배송·구독: 판매가를 한 가구의 한 달 금액으로 — '주 2회 59,000원'을 한 달 2건으로 세지 않는다
  const sidedishShape = cashflowShapeFor({ typeId: "ship", online: true, structure: { sector: "food_beverage", offering: "goods", revenue: "per_unit", delivery: "ship", capital: "small" } as never, description: "맞벌이 가정에 주 2회 반찬을 정기배송하는 반찬 가게 반찬 4종 주 2회 정기배송" });
  assert.equal(sidedishShape.cycle, "enroll"); assert.equal(sidedishShape.subscription, "가구");
  const sidedish = buildCashflowScenarios({ unitPrice: 59_000, unitVariableCost: 26_000, monthlyFixedCost: 2_500_000, goal: "1년 안에 정기 구독 80가구", budget: "20000000원", online: true, shape: sidedishShape })!;
  assert.equal(sidedish.unit, "가구"); assert.equal(sidedish.breakEven, 91);
  assert.deepEqual(sidedish.scenarios.map(s => s.volumes.at(-1)), [46, 91, 80]);
  const sidedishMd = cashflowMarkdown(sidedish), sidedishRef = cashflowReference(sidedish);
  assert.match(sidedishMd, /\| 판매가 \| 59,000원 \| 대표님이 정한 값 — 한 가구가 한 달에 내는 돈으로 봄\(한 주 금액이면 × 4\.33으로 다시 계산\) \|/);
  assert.match(sidedishMd, /대표 목표\(월 80가구\)는 본전\(월 91가구\)보다 적어, 목표에 닿아도 한 달 289,120원이 모자랍니다/);
  assert.match(sidedishRef, /본전은 한 달 구독 91가구입니다/);
  assert.doesNotMatch(sidedishRef, /한 사람이 한 번에 사는 개수|한 달에 2건/);

  // (4) 매장 없는 사업의 고정비 시작 주: 차량으로 일하는 이사·용달은 차량을 계약하는 개업 주(8주차)부터 — 예전엔 1주차부터 2개월 4,400,000원
  assert.deepEqual(roadmapOpening("visit", false), { week: 8, startWeek: 1 }, "차량이 없는 방문 서비스는 그대로");
  assert.deepEqual(roadmapOpening("visit", false, true), { week: 8, startWeek: 8 });
  const movingShape = cashflowShapeFor({ typeId: "visit", description: "원룸 1인 소형 이사 전문 용달" });
  assert.equal(movingShape.vehicle, true); assert.deepEqual(movingShape.open, { week: 8, startWeek: 8 });
  const moving = buildCashflowScenarios({ unitPrice: 150_000, unitVariableCost: 40_000, monthlyFixedCost: 2_200_000, capacity: "대표자 혼자 / 하루 2건", goal: "6개월 안에 월 40건", budget: "18000000원", shape: movingShape })!;
  assert.deepEqual(moving.prep, { months: 0, openWeek: 8, startWeek: 8, source: "roadmap" });
  assert.equal(moving.prepCost, 0);
  assert.equal(moving.setupLimit, 18_000_000 - 6_600_000 - 6_261_792, "준비 기간 고정비를 빼지 않은 한도 5,138,208원(예전 738,208원)");
  assert.match(cashflowMarkdown(moving), /고정비 시작: 매장 없이 차량으로 일하는 사업이라 월 고정비\(차량 할부·리스·보험 등\)는 차량을 계약하는 8주차\(개업 주\)부터 나간다고 봤습니다\(가정\)\. 차량을 더 일찍 계약하면 그 주부터 한 달마다 2,200,000원을 준비 예산에서 더 뺍니다/);
  assert.match(cashflowReference(moving), /12주 표·실행 요약도 8주차로 씁니다\. 차량 계약도 그 주에 둡니다/);
  assert.equal(cashflowShapeFor({ typeId: "visit", description: "동네 음식점 메뉴 사진을 찍어 주는 출장 사진" }).vehicle, undefined);

  // (5) 관심 조사 목표 응답 수: 필요한 사람 수 ÷ 0.5 — 다 모으면 모르는 사람 응답 × 0.5로도 본전에 닿는다(예전: 네일 49명을 다 모아도 예상 예약이 본전 52건에 못 미침)
  const nail = buildCashflowScenarios({ unitPrice: 45_000, unitVariableCost: 6_000, monthlyFixedCost: 1_800_000, capacity: "대표자 혼자 / 하루 6건", budget: "15000000원", shape: { premises: true, cycle: "visits", vat: "general", trade: "beauty" } })!;
  assert.equal(nail.breakEven, 52);
  const nailRef = cashflowReference(nail);
  assert.match(nailRef, /4주에 1번\(한 달 약 1\.08번\)이면 약 49명/);
  assert.match(nailRef, /목표 응답 수\(제안\)는 위 단골 수의 2배\(3주에 1번이면 약 74명, 4주에 1번이면 약 98명, 6주에 1번이면 약 146명\)로 잡습니다/);
  assert.ok(98 * 0.5 * (4.33 / 4) >= nail.breakEven, "98명이 4주에 1번씩, 모르는 사람 응답 × 0.5 → 한 달 약 53건 ≥ 본전 52건");
  assert.ok(49 * 0.5 * (4.33 / 4) < nail.breakEven, "예전 목표 49명은 다 모아도 본전에 못 미쳤다");
  assert.match(nailRef, /통과하면 수요가 본전만큼 있다는 첫 신호이니 다음 단계\(첫 유료 예약\)로 넘어갑니다/);
  assert.match(cashflowReference(buildCashflowScenarios(bakery)!), /목표 응답 수\(제안\)는 위 단골 수의 2배\(일주일에 1번이면 약 710명, 일주일에 2번이면 약 356명, 일주일에 3번이면 약 238명\)/);
}

console.log("cashflow-scenarios: real unit margin (VAT), single break-even without living cost, owner share line, survival = budget ÷ fixed cost, contract criteria, fixed-cost assumptions, people goals, operating cashflow, subscriptions, vehicle prep, survey targets passed");
