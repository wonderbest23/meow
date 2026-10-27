import assert from "node:assert/strict";
import type { CoachState } from "../lib/plan-builder/coach";
import type { IntakeCommand, IntakeState, IntakeValue } from "../lib/plan-builder/intake-types";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

/*
 * 계획서 품질 Q2(2026-10-27) — 망원동 1인 도시락 실제 AI 계획서 검토(3.4/5)의 지적을 고정한다. AI·네트워크 호출 없음(가짜 AI도 안 부른다).
 * (가) 준비 예산·월 비용·생활비가 3,000원처럼 실제 금액으로 보기 어려우면 손익표·12개월 표·가격 비교표·그래프 대신 빈 틀 한 블록
 * (나) 업종별 필수 항목(음식: 보증금·권리금·간판·인테리어·카드 단말기, 폐기율, 보관 온도·시간·판매 마감, 노쇼, 업종 후보, 원산지)이 맡은 장의 작성 자료에
 * (다)(라)(마) 반복은 장 이름 한 줄로, 장 이름은 정해진 이름만, 관심 조사 기준은 설계의 한 가지
 */
const AT = "2026-10-27T00:00:00.000Z";

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("plan quality q2 tests must not fetch"); };
  try {
    const { implausibleMoneyInputs, implausibleMoneyMarkdown } = await import("../lib/plan-builder/cashflow-scenarios");
    const { emptyCoach } = await import("../lib/plan-builder/coach-job");
    const { COACH_KEY, COACH_TYPES, coachContext } = await import("../lib/plan-builder/coach");
    const { INTAKE_KEY } = await import("../lib/plan-builder/intake-types");
    const { createIntake, applyIntakeAnswer, planFinancialReference } = await import("../lib/plan-builder/intake-core");
    const { buildExecutiveSummary } = await import("../lib/plan-builder/executive-summary");
    const { intakeFinancialTable } = await import("../lib/plan-builder/section-service");
    const { chapterRef, chaptersForType, financialTableOwner } = await import("../lib/plan-builder/blueprint");
    const { confirmedIntakeContext } = await import("../lib/plan-builder/intake-context");
    const { buildUserPrompt, sectionSystemPrompt, appendFinancials } = await import("../lib/plan-builder/section-generator");
    const { essentialGroup, essentialsForChapter } = await import("../lib/plan-builder/industry-essentials");

    // (가) 판정: 예산·생활비 10만 원 미만, 월 고정비는 1만 원 미만이면 혼자서, 1만~10만 원은 다른 돈 입력도 의심일 때만
    assert.deepEqual(implausibleMoneyInputs({ budget: "3,000원", cost: "3,000원", livingCost: "3,000원" }).map(item => item.key), ["budget", "cost", "livingCost"]);
    assert.deepEqual(implausibleMoneyInputs({ budget: "5,000,000원", cost: "30,000원", livingCost: "1,500,000원" }), [], "a tiny online fixed cost alone is plausible");
    assert.deepEqual(implausibleMoneyInputs({ budget: "5,000,000원", cost: "3,000원" }).map(item => item.key), ["cost"]);
    assert.deepEqual(implausibleMoneyInputs({ budget: "50,000원", cost: "30,000원" }).map(item => item.key), ["budget", "cost"]);
    assert.deepEqual(implausibleMoneyInputs({ livingCost: "0원", budget: "0원" }), [], "0원 means none / already in fixed cost, not a unit slip");
    assert.deepEqual(implausibleMoneyInputs({ budget: "1천만~2천만 원", livingCost: "200만 원" }), []);

    let serial = 0;
    function startupPlan(values: Array<[string, IntakeValue]>, fields: Array<[CoachState["fields"][number]["key"], string]> = []) {
      const coach: CoachState = emptyCoach();
      coach.stage = "startup"; coach.business.stage = "사업 기획";
      const intake: IntakeState = createIntake(coach, "startup", AT);
      intake.detailsRequested = true;
      const plan: ServerPlan = { id: "plan-quality-q2", title: "망원동 1인 수제 도시락", planType: COACH_TYPES.startup, createdAt: AT, updatedAt: AT, sections: {},
        answers: { [COACH_KEY]: { state: coach }, [INTAKE_KEY]: { state: intake } } };
      for (const [questionId, value] of values) {
        const command: IntakeCommand = { action: "answer", revision: coach.revision, requestId: `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`, questionId, value };
        applyIntakeAnswer(plan, coach, intake, command, AT);
      }
      for (const [key, value] of fields) {
        coach.fields = coach.fields.filter(field => field.key !== key);
        coach.fields.push({ key, value, basis: "user", quote: value, messageId: "m-test" } as CoachState["fields"][number]);
      }
      return { plan, coach, intake };
    }

    // 2026-10-27 실제 상황: 망원동 1인 수제 도시락, 준비 예산·월 비용·생활비가 각 3,000원
    const lunch = startupPlan([["business", "망원동 1인 수제 도시락"], ["industry", "food_beverage"]],
      [["price", "9,000원"], ["unitCost", "3,500원"], ["cost", "3,000원"], ["capacity", "대표자 혼자 / 하루 40개"], ["budget", "3,000원"], ["livingCost", "3,000원"]]);
    const owner = financialTableOwner(lunch.plan.planType)!;
    const table = intakeFinancialTable(lunch.plan, lunch.coach, owner)!;
    assert.ok(table.includes("준비 예산·월 비용·생활비를 실제 금액으로 다시 입력하면 여기에 본전·버티는 달수가 채워집니다."), table);
    assert.match(table, /준비 예산 3,000원 · 월 고정비 3,000원 · 대표 생활비 3,000원/);
    assert.doesNotMatch(table, /^\|/m, "no tables in the placeholder");
    assert.doesNotMatch(table, /plan-chart/, "no charts");
    assert.doesNotMatch(table, /1개월차|한 달 1개|손익분기점/, "no 12-month rows or break-even built from 3,000원");
    // 시스템이 붙이는 자리(appendFinancials)에도 빈 틀 하나만
    const appended = appendFinancials("## 본문\n\n해석", { financialsMarkdown: table });
    assert.equal(appended.split("본전·버티는 달수가 채워집니다").length - 1, 1);
    // 다른 장이 받는 돈 숫자 원천도 계산 보류 — 3,000원으로 만든 본전·통장 흐름이 없다
    const reference = planFinancialReference(lunch.coach, lunch.plan.answers);
    assert.match(reference, /^계산 보류\(입력 확인 필요\)/);
    assert.match(reference, /금액을 다시 확인해 달라는 안내는 '비용' 장 한 곳에서 한 번만/);
    assert.match(reference, /한 건에 남는 돈 5,500원/, "unit margin does not depend on the suspicious amounts");
    assert.doesNotMatch(reference, /손익분기|조심스러운 경우|버티는 기간\(/);
    const summary = buildExecutiveSummary(lunch.plan, lunch.coach.business);
    const finance = summary.blocks.find(block => block.id === "finance")!;
    assert.equal(finance.lines[0].label, "계산 상태");
    assert.match(finance.lines[0].value, /10만 원보다 적어/);
    assert.ok(!finance.lines.some(line => line.label === "손익분기"), "no break-even from 3,000원");

    // 실제 금액이면 예전과 같이 표·그래프가 붙는다
    const real = startupPlan([["business", "망원동 1인 수제 도시락"], ["industry", "food_beverage"]],
      [["price", "9,000원"], ["unitCost", "3,500원"], ["cost", "1,500,000원"], ["capacity", "대표자 혼자 / 하루 40개"], ["budget", "20,000,000원"], ["livingCost", "1,800,000원"]]);
    const realTable = intakeFinancialTable(real.plan, real.coach, owner)!;
    assert.match(realTable, /^\| /m);
    assert.match(realTable, /plan-chart/);
    assert.doesNotMatch(realTable, /금액을 다시 넣은 뒤 채워집니다/);
    assert.doesNotMatch(implausibleMoneyMarkdown([{ key: "cost", label: "월 고정비", value: 3000 }]), /\|/);

    // (나) 업종별 필수 항목 — 맡은 장의 작성 자료에만, 업종 정보(sector·ksic·업종 가이드)로 묶음을 고른다
    const chapters = chaptersForType(lunch.plan.planType);
    const find = (key: string) => {
      const [chapterId, sectionId] = key.split("/");
      const chapter = chapters.find(item => item.id === chapterId)!;
      return { chapter, section: chapter.sections.find(item => item.id === sectionId)! };
    };
    const intakeContext = confirmedIntakeContext(lunch.plan.answers);
    const prompt = (key: string) => buildUserPrompt({ ...find(key), answers: {}, planType: lunch.plan.planType, business: lunch.coach.business, coachContext: coachContext(lunch.coach, reference), intakeContext });
    const essentialsOf = (text: string) => text.match(/<industry_essentials[^>]*>\n([\s\S]*?)\n<\/industry_essentials>/)?.[1] ?? "";
    const expenses = essentialsOf(prompt("financials/expenses"));
    for (const word of ["보증금", "권리금", "간판", "인테리어", "카드 단말기"]) assert.ok(expenses.includes(word), `setup costs list ${word}`);
    assert.match(prompt("financials/expenses"), /<industry_essentials group="음식·식품">/);
    assert.match(essentialsOf(prompt("strategy/price")), /폐기율/);
    const distribution = essentialsOf(prompt("strategy/distribution"));
    assert.match(distribution, /보관 온도와 보관 시간, 그날 판매를 마감하는 시각/);
    assert.match(distribution, /노쇼/);
    const roadmap = essentialsOf(prompt("summary/roadmap"));
    assert.match(roadmap, /즉석판매제조·가공업.*휴게음식점.*일반음식점/);
    assert.match(roadmap, /원산지 표시 의무/);
    assert.equal(essentialsOf(prompt("market/personas")), "", "chapters that own nothing get no essentials block");
    // 같은 항목은 한 장에만(반복 방지)
    const allKeys = chapters.flatMap(chapter => chapter.sections.map(section => `${chapter.id}/${section.id}`));
    const owners = allKeys.filter(key => /원산지 표시 의무/.test(essentialsOf(prompt(key))));
    assert.deepEqual(owners, ["summary/roadmap"]);
    // 다른 업종도 각자 필수 항목(일반화) — 업종 정보로 묶음을 고르고, 음식 항목은 들어가지 않는다
    assert.equal(essentialGroup({ intakeContext: JSON.stringify({ sector: "retail_commerce" }), documentSector: "general" }), "retail");
    assert.equal(essentialGroup({ intakeContext: JSON.stringify({ sector: "general", ksic: { code: "56112" } }), documentSector: "general" }), "food", "KSIC 56 is a restaurant");
    assert.equal(essentialGroup({ intakeContext: JSON.stringify({ industryGuide: { name: "반찬·도시락 가게" } }), documentSector: "general" }), "food");
    assert.equal(essentialGroup({ documentSector: "education" }), "education");
    // 2026-10-27 실제 계획서: 업종 질문에 첫 보기('기업 서비스')가 골라졌고 '수제 도시락'은 업종 가이드 낱말에도 안 걸렸다 — 사업 설명으로 음식 묶음
    assert.equal(essentialGroup({ intakeContext: JSON.stringify({ industry: "기업 서비스", sector: "b2b_service", ksic: null }), documentSector: "b2b_service", description: "망원동 1인 수제 도시락" }), "food");
    assert.equal(essentialGroup({ intakeContext: JSON.stringify({ sector: "b2b_service" }), documentSector: "b2b_service", description: "동네 식당 마케팅 대행" }), "project", "businesses that serve restaurants keep their own group");
    assert.equal(essentialGroup({ intakeContext: JSON.stringify({ sector: "manufacturing", ksic: { code: "25112" } }), documentSector: "manufacturing", description: "카페 의자 제작" }), "manufacturing", "a KSIC code outranks description words");
    const present = new Set(allKeys);
    for (const group of ["retail", "manufacturing", "education", "local", "space", "project", "logistics", "general"] as const) {
      const items = allKeys.flatMap(key => essentialsForChapter(key, group, present));
      assert.ok(items.length >= 4, `${group}: setup, unit cost, operation and filing items`);
      assert.ok(!items.some(item => /원산지|즉석판매/.test(item)), `${group} gets no food items`);
    }
    assert.ok(allKeys.flatMap(key => essentialsForChapter(key, "retail", present)).some(item => /통신판매업 신고/.test(item)));
    // 실행 장이 없는 예전 종류는 신고 항목을 실행 요약이 맡는다
    const legacyKeys = new Set(chaptersForType(undefined).flatMap(chapter => chapter.sections.map(section => `${chapter.id}/${section.id}`)));
    assert.ok(essentialsForChapter("summary/executive", "food", legacyKeys).some(item => /원산지/.test(item)));

    // 시스템 지시문: 필수 항목·비현실 입력·반복·장 이름·관심 조사 기준 — 장마다 같은 글(캐시)
    const systems = ["market/personas", "financials/expenses", "summary/roadmap"].map(key => sectionSystemPrompt({ ...find(key), answers: {}, planType: lunch.plan.planType, business: lunch.coach.business, coachContext: "{}", intakeContext }));
    assert.ok(systems.every(system => system === systems[0]));
    const system = systems[0];
    assert.match(system, /- industry_essentials: 이 업종에서 지금 쓰는 장이 꼭 다룰 항목입니다/);
    assert.match(system, /'계산 보류\(입력 확인 필요\)'로 시작하거나 financials에 표 대신 '금액을 다시 넣은 뒤 채워집니다' 틀이면/);
    assert.match(system, /표·그래프로 만들지 않고/);
    assert.match(system, /'자세한 내용은 ○○ 장에 있습니다'처럼 장 이름과 함께 한 줄로 가리킵니다/);
    assert.match(system, /같은 문장이나 같은 뜻의 문장은 문서 전체에서 한 번만 씁니다/);
    assert.match(system, /coach\.design\.nextAction\.doneWhen에 적힌 기준을 모든 장이 그대로 씁니다/);
    assert.match(system, /- '비용' 장\(재무 계획 > 비용\): /);
    assert.match(prompt("summary/roadmap"), /관심 조사의 성공 기준은 coach\.design\.nextAction\.doneWhen/);
    // 계산 자료가 부르는 장 이름도 문서 제목 그대로
    assert.equal(chapterRef("summary/roadmap"), "'12주 할 일과 매달 볼 숫자' 장");
    assert.equal(chapterRef("strategy/price"), "'가격 전략' 장");
    const realReference = planFinancialReference(real.coach, real.plan.answers);
    assert.match(realReference, /판단 기준\('12주 할 일과 매달 볼 숫자' 장에서 씀\)/);
    assert.match(realReference, /'가격 전략' 장에서 씀/);
    assert.doesNotMatch(realReference, /실행 장|가격 장/);

    console.log("plan-quality-q2: implausible money → one placeholder block (no tables/charts/references), industry essentials per owning chapter (food + 8 other groups), canonical chapter names, one interest-survey metric, no-repeat rule passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
