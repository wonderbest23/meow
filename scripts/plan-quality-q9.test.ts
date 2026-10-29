import assert from "node:assert/strict";
import type { CoachState } from "../lib/plan-builder/coach";
import type { IntakeState, IntakeValue } from "../lib/plan-builder/intake-types";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

/*
 * 계획서 품질 Q9(2026-10-29) — 돈 계산과 서비스 업종 말. 유료 AI 호출 없음(계산과 작성 지시문만 만들어 본다).
 * main(#275) 실제 AI 재측정: 네일 3.8, 캔들 3.5, 과외 3.3, 도시락 3.5.
 * (1) 준비 기간: 돈 계산은 1개월(가정), 12주 표는 보통 8주차 개업 → 사업 유형 12주 순서의 개업 주차(또는 대표가 답한 개업 목표 기간)에서 센다.
 *     버티는 기간은 중단선까지와 잔액 0원까지를 나눠 보인다
 * (2) 보증금: 한도 하나에 보증금까지 넣어 매장 판단이 늘 '계약하지 않음' → 보증금 상한 + 써서 없어지는 돈 상한, 대안 자리(시세는 주변 매물 확인)
 * (3) 서비스 말: 네일·과외에 처리량·판매량·수량·팔 때마다 → 예약·시술 건수, 등록 학생 수. 면세 안내는 면세일 수 있는 업종에만.
 *     한 달 횟수 = 4.33 ÷ 주기(주). 모르는 사람 응답도 실제 구매로 이어지는 비율(가정)을 곱한다
 * (4) 세금: 간이과세자는 매입액의 0.5%만 공제(부가가치세법 제63조제3항), 제조업 등 간이과세 배제 가능성은 관할 세무서 확인
 */
const AT = "2026-10-29T00:00:00.000Z";

type Case = { name: string; industry: string; business: string; fields: Array<[string, string]> };
// Q8과 같은 네 사업(과외 가격만 숫자로 읽히게 '600,000원'). 대표 생활비 답이 저장돼 있어도 계산에 쓰지 않는지 함께 본다
const CASES: Case[] = [
  { name: "nail", industry: "local_service", business: "연남동 1인 네일숍 매장", fields: [["offer", "젤 네일 기본·아트"], ["customer", "근처 직장인 20~30대 여성"], ["price", "50,000원"], ["unitCost", "8,000원"], ["cost", "1,800,000원"], ["budget", "20,000,000원"], ["hoursPerWeek", "48시간"], ["capacity", "대표 혼자 / 하루 6건"], ["livingCost", "2,000,000원"]] },
  { name: "candle", industry: "retail_commerce", business: "집에서 만드는 수제 소이 캔들 스마트스토어", fields: [["offer", "수제 소이 캔들"], ["customer", "선물을 찾는 20~30대"], ["price", "25,000원"], ["unitCost", "8,000원"], ["cost", "300,000원"], ["budget", "5,000,000원"], ["hoursPerWeek", "20시간"], ["capacity", "대표 혼자 / 하루 20개 제작"]] },
  { name: "tutor", industry: "education", business: "대치동 중학생 1:1 수학 방문·화상 과외", fields: [["offer", "중학 수학 1:1 주 2회"], ["customer", "대치동 중학생 학부모"], ["price", "600,000원"], ["unitCost", "20,000원"], ["cost", "200,000원"], ["budget", "2,000,000원"], ["hoursPerWeek", "25시간"], ["capacity", "대표 혼자 / 학생 8명"]] },
  { name: "lunchbox", industry: "food_beverage", business: "망원동 1인 수제 도시락", fields: [["price", "9,000원"], ["unitCost", "3,500원"], ["cost", "2,000,000원"], ["budget", "15,000,000원"], ["hoursPerWeek", "45시간"], ["capacity", "대표자 혼자 / 하루 40개"], ["goal", "3개월 안에"]] },
];

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("plan quality q9 tests must not fetch"); };
  try {
    const { emptyCoach } = await import("../lib/plan-builder/coach-job");
    const { COACH_KEY, COACH_TYPES, coachContext } = await import("../lib/plan-builder/coach");
    const { INTAKE_KEY } = await import("../lib/plan-builder/intake-types");
    const { createIntake, applyIntakeAnswer, planFinancialReference, intakeScenarioInputs } = await import("../lib/plan-builder/intake-core");
    const { intakeFinancialTable } = await import("../lib/plan-builder/section-service");
    const { chaptersForType, financialTableOwner } = await import("../lib/plan-builder/blueprint");
    const { confirmedIntakeContext, INTAKE_CONTEXT_MAX_LENGTH } = await import("../lib/plan-builder/intake-context");
    const { buildUserPrompt, sectionSystemPrompt } = await import("../lib/plan-builder/section-generator");
    const { buildExecutiveSummary } = await import("../lib/plan-builder/executive-summary");
    const { buildCashflowScenarios, cashflowMarkdown, cashflowFromFields, goalOpeningWeeks, roadmapOpening, SURVEY_DISCOUNT, surveyDiscount, WEEKS_PER_MONTH } = await import("../lib/plan-builder/cashflow-scenarios");

    let serial = 0;
    const build = (item: Case) => {
      const coach: CoachState = emptyCoach();
      coach.stage = "startup"; coach.business.stage = "사업 기획";
      const intake: IntakeState = createIntake(coach, "startup", AT);
      const plan: ServerPlan = { id: `plan-quality-q9-${item.name}`, title: item.business, planType: COACH_TYPES.startup, createdAt: AT, updatedAt: AT, sections: {},
        answers: { [COACH_KEY]: { state: coach }, [INTAKE_KEY]: { state: intake } } };
      for (const [questionId, value] of [["industry", item.industry], ["business", item.business]] as Array<[string, IntakeValue]>) {
        applyIntakeAnswer(plan, coach, intake, { action: "answer", revision: coach.revision, requestId: `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`, questionId, value }, AT);
      }
      for (const [key, value] of item.fields) coach.fields.push({ key, value, basis: "user", quote: value, messageId: "m-test" } as CoachState["fields"][number]);
      const scenario = intakeScenarioInputs(coach, intake);
      assert.ok(!("missing" in scenario), `${item.name}: money inputs are complete`);
      const flow = cashflowFromFields(coach.fields, scenario)!;
      assert.ok(flow, `${item.name}: cashflow is built`);
      const chapters = chaptersForType(plan.planType);
      const allKeys = chapters.flatMap(chapter => chapter.sections.map(section => `${chapter.id}/${section.id}`));
      const find = (key: string) => {
        const [chapterId, sectionId] = key.split("/");
        const chapter = chapters.find(entry => entry.id === chapterId)!;
        return { chapter, section: chapter.sections.find(entry => entry.id === sectionId)! };
      };
      const owner = financialTableOwner(plan.planType)!;
      const table = intakeFinancialTable(plan, coach, owner)!;
      const reference = planFinancialReference(coach, plan.answers);
      const intakeContext = confirmedIntakeContext(plan.answers);
      const input = (key: string) => ({ ...find(key), answers: {}, planType: plan.planType, business: coach.business, coachContext: coachContext(coach, reference), intakeContext, financialsMarkdown: key === owner ? table : undefined, financialsReference: key === owner ? undefined : reference });
      const systems = allKeys.map(key => sectionSystemPrompt(input(key)));
      assert.ok(systems.every(system => system === systems[0]), `${item.name}: system prompt stays identical across chapters (cache)`);
      const summary = buildExecutiveSummary(plan, coach.business).blocks.find(block => block.id === "finance")!.lines.map(line => line.value).join("\n");
      return { flow, table, reference, intakeContext, roadmap: buildUserPrompt(input("summary/roadmap")), summary };
    };
    const [nail, candle, tutor, lunchbox] = CASES.map(build);
    const all = { nail, candle, tutor, lunchbox };

    // ── 지킬 것: 작성 자료 8,000자 상한 — 잘려 나간 부분 없이, 대표 생활비는 다시 넣지 않는다 ──
    for (const [name, result] of Object.entries(all)) {
      assert.ok(result.intakeContext.length <= INTAKE_CONTEXT_MAX_LENGTH, `${name}: ${result.intakeContext.length} chars`);
      assert.equal((JSON.parse(result.intakeContext) as { omitted?: boolean }).omitted, false, `${name}: nothing was cut for length`);
      assert.doesNotMatch(result.table + result.reference, /생활비까지|생활비선|2,000,000원 생활비/, `${name}: no living cost in the money`);
    }

    // ── (1) 준비 기간: 사업 유형 12주 순서의 개업 주차에서 센다(한 단계 1주, 가정) ──
    assert.deepEqual(roadmapOpening("store", true), { week: 11, startWeek: 7 }, "store: contract step 7, opening step 11 ('계약 전 판단' is not the contract)");
    assert.deepEqual(roadmapOpening("lesson", false), { week: 8, startWeek: 1 }, "tutoring without premises skips the '공간을 빌릴 때만' steps");
    assert.deepEqual(roadmapOpening("ship", false), { week: 5, startWeek: 1 });
    assert.equal(WEEKS_PER_MONTH, 4.33);
    assert.deepEqual([nail.flow.prep, candle.flow.prep, tutor.flow.prep, lunchbox.flow.prep].map(prep => [prep.openWeek, prep.startWeek, prep.months, prep.source]),
      [[11, 7, 1, "roadmap"], [5, 1, 1, "roadmap"], [8, 1, 2, "roadmap"], [11, 7, 1, "roadmap"]], "(open − start) weeks ÷ 4.33, rounded up");
    assert.equal(tutor.flow.prepCost, 400_000, "tutoring: 7 weeks before the first lesson → 2 months × 200,000원");
    assert.match(tutor.reference, /영업 시작 전 고정비: 준비 기간 2개월\(가정 — 1주차~8주차 개업, 7주 ÷ 4\.33 올림\)에도 고정비 400,000원이 나가 준비 예산에서 먼저 뺍니다\. 개업\(첫 판매\) 주차: 12주 표·실행 요약도 8주차로 씁니다/);
    assert.match(nail.reference, /계약부터 문 열 때까지 1개월\(가정 — 계약 7주차~11주차 개업, 4주 ÷ 4\.33 올림\).*12주 표·실행 요약도 11주차\(계약 7주차\)로 씁니다/);
    assert.match(tutor.reference, /영업 시작 전 고정비\(400,000원\)/, "the limit sentence uses the same prep cost");
    // 12주 장과 실행 요약은 같은 주차를 쓰라는 지시를 받는다(사용자 프롬프트 — 시스템 지시문은 그대로)
    assert.match(nail.roadmap, /계산 자료에 '개업\(첫 판매\) 주차' 줄이 있으면 12주 표의 개업\(첫 판매\)과 계약은 그 주차에 두고, 실행 요약도 같은 주차를 씁니다/);
    assert.match(nail.summary, /준비 기간: 11주차 개업 가정, 문 열기 전 고정비 1개월분 1,800,000원\(가정\)|11주차 개업 가정, 문 열기 전 고정비 1개월분 1,800,000원\(가정\)/);
    // 대표가 답한 개업 목표 기간: 순서보다 이르면 그 주, '3개월 안에'처럼 순서가 그 안에 들면 순서대로, 매출 목표는 개업 시점이 아님
    assert.equal(goalOpeningWeeks("3개월 안에"), 13);
    assert.equal(goalOpeningWeeks("2개월 안에 개업"), 9);
    assert.equal(goalOpeningWeeks("6주 안에 오픈"), 6);
    assert.equal(goalOpeningWeeks("6개월 안에 월 매출 1,200만원"), null);
    assert.equal(goalOpeningWeeks("3개월 안에 단골 30명"), null);
    const early = buildCashflowScenarios({ unitPrice: 50_000, unitVariableCost: 8_000, monthlyFixedCost: 1_800_000, budget: "20,000,000원", goal: "6주 안에 오픈", shape: { ...nail.flow.shape } })!;
    assert.deepEqual(early.prep, { months: 1, openWeek: 6, startWeek: 5, source: "goal" });
    assert.match(cashflowMarkdown(early) + "\n", /문 열기 전 고정비/);
    // 버티는 기간: 중단선까지와 잔액 0원까지를 나눈다(중단선 = 월 고정비 3개월분)
    for (const { flow } of Object.values(all)) for (const row of flow.survival) assert.equal(row.toStop, Math.max(0, row.months - 3));
    for (const { table } of Object.values(all)) {
      assert.match(table, /\| 초기 지출 \| 남는 준비 예산 \| 중단선까지 \| 잔액 0원까지 \|/);
      assert.match(table, /계속할지 다시 정하는 때는 '중단선까지' 칸입니다/);
    }
    assert.match(nail.table, /\| 4,000,000원 \| 14,200,000원 \| 약 4개월 \| 약 7개월 \|/, "(20,000,000 − 4,000,000 − 1,800,000 − 5,400,000) ÷ 1,800,000 = 4");
    assert.match(nail.reference, /매출이 없어도 중단선까지 버티는 기간\(\(준비 예산 − 초기 지출 − 문 열기 전 고정비 − 중단선\) ÷ 월 고정비, 잔액 0원까지는 최대 3개월 더\): 초기 지출 4,000,000원이면 약 4개월/);

    // ── (2) 보증금: 매장을 빌리는 사업만 한도를 보증금 상한 + 써서 없어지는 돈 상한으로, 대안 자리를 나란히 ──
    for (const { flow } of [nail, lunchbox]) {
      assert.ok(flow.setupLimit! > 0 && flow.depositSplit.length === 3);
      for (const row of flow.depositSplit) assert.equal(row.deposit + row.spend, flow.setupLimit, "the two caps add up to the limit");
    }
    assert.match(nail.table, /한도 나누기\(제안, 보증금 상한 \+ 써서 없어지는 돈 상한 = 한도 7,618,250원\): 2,200,000원 \+ 5,418,250원 \/ 3,800,000원 \+ 3,818,250원 \/ 5,300,000원 \+ 2,318,250원\. 보증금 시세는 주변 매물 확인/);
    assert.match(nail.table, /대안 자리\(숍인숍\(영업 중인 미용실·네일숍 안 자리를 빌림 — 그 자리에서 미용업 신고가 되는지 관할 구청 확인\)/);
    assert.match(nail.reference, /대안 자리\(숍인숍, 공유 미용실·1인 미용 공간, 기존 미용 시설 양수\)/, "names only in the shared reference (8,000자 상한)");
    assert.doesNotMatch(nail.table, /감당하기 어려울 수 있어/, "a 5.3M deposit cap is above one month of fixed costs");
    // 도시락: 보증금 상한이 가장 커도 월 고정비보다 적다 → 그 사실과 대안 자리(공유주방 등)를 함께
    assert.match(lunchbox.table, /보증금 상한이 가장 커도 700,000원으로 월 고정비 2,000,000원보다 적습니다\. 매장 보증금은 대개 한 달 월세보다 크므로 이 한도로는 매장 보증금을 감당하기 어려울 수 있어, 매장을 빌리는 안과 대안 자리로 시작하는 안을 나란히 둡니다/);
    assert.match(lunchbox.table, /공유주방\(이미 영업 신고된 주방을 시간·월 단위로 빌림\)/);
    // 한도가 없으면 그 사실과 대안 자리
    const noLimit = buildCashflowScenarios({ unitPrice: 9000, unitVariableCost: 3500, monthlyFixedCost: 2_000_000, budget: "10,000,000원", shape: { ...lunchbox.flow.shape } })!;
    assert.match(cashflowMarkdown(noLimit), /자리 판단\(제안\): 초기 지출 한도가 없어 매장 보증금을 감당하기 어렵습니다\. 매장을 빌리는 안과 대안 자리\(공유주방/);
    for (const { table, reference } of [candle, tutor]) assert.doesNotMatch(table + reference, /한도 나누기|자리 판단|보증금 상한/, "no deposit split without premises");
    // 시세 숫자는 만들지 않는다
    for (const { table } of [nail, lunchbox]) assert.doesNotMatch(table, /보증금 시세는 약|평당|시세 [\d,]+원/);

    // ── (3) 서비스 말: 물건 판매 말 대신 예약·시술 건수, 등록 학생 수 ──
    const goodsWords = /처리량|판매량|적은 수량|팔 때마다|실제 판매 수|예상 구매|주문 의사|본전 횟수|등록 인원/;
    for (const [name, text] of [["nail", nail.reference], ["tutor", tutor.reference]] as const) {
      // 하루 처리량 환산 줄('하루 6건 × 월 26일 영업')은 계산 근거라 남는다 — 그 밖의 문장에서 본다
      assert.doesNotMatch(text, goodsWords, `${name}: no goods words in the money reference`);
    }
    assert.match(nail.reference, /본전 예약·시술 건수\(하루 약 2건 \/ 일주일 약 11건 \/ 한 달 49건\) 이상이면 계획대로/);
    assert.match(nail.reference, /1건 더 받을 때마다/);
    assert.match(nail.reference, /규모\(영업 시간·메뉴 수\)/);
    assert.match(nail.table, /\| 경우 \| 한 달 예약·시술 \|/);
    assert.match(nail.table, /받을 수 있는 예약 건수 최대치: 하루 6건 × 월 26일 영업 = 월 156건\. 어느 경우도 이보다 많이 받지 않는다고/);
    assert.match(nail.summary, /조심스러운 경우 25건 예약·시술/);
    assert.match(tutor.reference, /본전 등록 학생 수\(한 달 1명\) 이상이면 계획대로/);
    assert.match(tutor.reference, /1명 더 등록받을 때마다/);
    assert.match(tutor.table, /\| 경우 \| 한 달 등록 \|/);
    // 할인 원칙: 모르는 사람 응답도 실제 구매로 이어지는 비율(가정)을 곱하고, 서비스는 예약·등록으로
    assert.equal(SURVEY_DISCOUNT, "할인 원칙(제안): 예상 구매 = 응답마다 적은 수량 × 배수의 합 — 날짜·수량을 남긴 모르는 사람 응답 × 0.5(실제 구매로 이어지는 비율, 가정), 지인·가족 응답 × 0.25(그 절반, 가정), 날짜·수량 없는 응답 × 0.");
    assert.doesNotMatch(SURVEY_DISCOUNT, /그 밖의 응답 × 1/);
    assert.ok(lunchbox.reference.includes(SURVEY_DISCOUNT) && candle.reference.includes(SURVEY_DISCOUNT), "goods keep the single discount sentence word for word");
    assert.equal(surveyDiscount("visits"), "할인 원칙(제안): 예상 예약 = 응답마다 적은 예약 횟수 × 배수의 합 — 날짜·횟수를 남긴 모르는 사람 응답 × 0.5(실제 예약으로 이어지는 비율, 가정), 지인·가족 응답 × 0.25(그 절반, 가정), 날짜·횟수 없는 응답 × 0.");
    assert.ok(nail.reference.includes(surveyDiscount("visits")));
    assert.ok(tutor.reference.includes(surveyDiscount("enroll", "lesson")) && /예상 등록 = 응답마다 적은 등록 학생 수/.test(surveyDiscount("enroll", "lesson")));
    // 구매 횟수 단위: 한 달 횟수 = 4.33 ÷ 주기(주)
    assert.match(nail.reference, /본전\(한 달 49건\) ÷ 한 사람의 한 달 횟수\(= 4\.33 ÷ 주기\(주\), 가정\) — 3주에 1번\(한 달 약 1\.44번\)이면 약 34명, 4주에 1번\(한 달 약 1\.08번\)이면 약 46명, 6주에 1번\(한 달 약 0\.72번\)이면 약 68명\(가정\)/);
    // 도시락(물건)은 예전 말 그대로
    assert.match(lunchbox.reference, /본전 판매량\(하루 약 16개 \/ 일주일 약 100개 \/ 한 달 428개\) 이상이면 계획대로/);
    assert.match(lunchbox.reference, /'예상 구매'를 처리량\(하루에 만들 수 있는 양\)이 아니라 본전 판매량과/);
    for (const { reference } of Object.values(all)) assert.match(reference, /\(가정[),]|, 가정\)/, "assumptions are marked");

    // ── (3)·(4) 부가세 안내: 면세 문장은 면세일 수 있는 업종에만, 간이과세 매입 공제 0.5%, 제조업은 관할 세무서 확인 ──
    for (const { table } of [nail, candle, lunchbox]) {
      assert.doesNotMatch(table, /부가세가 면제되는 사업이면 빼지 않습니다|면제되는 상품·용역/, "taxable businesses get no exemption sentence");
      assert.match(table, /간이과세자는 산 금액의 0\.5%만 공제되고 내야 할 세금보다 많아도 돌려받지 않습니다\(제63조제3항\)/);
      assert.match(table, /한 해 매출이 4,800만 원 미만이면 내지 않습니다\(부가가치세법 제63조·제69조\)/);
    }
    assert.match(candle.table, /직접 만들어 파는 사업은 제조업으로 보면 간이과세를 적용받지 못할 수 있으므로\(제61조, 대통령령으로 정한 업종\) 관할 세무서에서 확인합니다/);
    for (const { table } of [nail, lunchbox]) assert.doesNotMatch(table, /제조업으로 보면/);
    assert.match(tutor.table, /부가세: 면세로 보고 판매가에서 빼지 않았습니다/, "education keeps the Q7 exemption line");
    const rice = buildCashflowScenarios({ unitPrice: 30_000, unitVariableCost: 15_000, monthlyFixedCost: 500_000, shape: { premises: false, cycle: "once", vat: "general", exemptPossible: true } })!;
    assert.match(cashflowMarkdown(rice), /미가공 식료품·도서·의료처럼 부가세가 면제되는 상품·용역이 섞이면 그만큼은 빼지 않습니다/);
    // 12주 장의 등록 전 세금계산서 안내에 간이과세 0.5%와 배제 업종 확인
    assert.match(nail.roadmap, /간이과세자로 등록하면 산 금액의 0\.5%만 공제되며 내야 할 세금보다 많아도 돌려받지 않는다는 점\(부가가치세법 제63조\)도 함께 적습니다\. 직접 만들어 파는 사업\(제조업\)처럼 간이과세를 적용받지 못할 수 있는 업종이면 '관할 세무서 확인'을 붙입니다/);
    assert.match(nail.roadmap, /예약·수업 사업은 그 줄이 쓴 말\('예상 예약'·'예상 등록', 예약·시술 건수, 등록 학생 수\)을 그대로 쓰고 판매량·수량으로 바꾸지 않습니다/);

    console.log("plan-quality-q9: prep period from the 12-week opening week, stop-line vs zero survival, deposit/spend caps with alternative sites, service words, stranger conversion (assumed), VAT notes (exempt only where possible, simplified 0.5%, maker check) passed; no paid calls");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exit(1); });
