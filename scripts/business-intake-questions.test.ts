import assert from "node:assert/strict";
import type { IntakeMode, IntakeQuestion } from "../lib/plan-builder/intake-questions";

async function main() {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls++; throw new Error("Business intake must not use the network"); };
  try {
    const { coreQuestions, detailQuestions, getIntakeQuestion, intakeSectorOptions, intakeCandidates } = await import("../lib/plan-builder/intake-questions");
    const { PROPOSAL_SECTORS, SECTOR_PROFILES } = await import("../lib/plan-builder/proposal-blueprint");
    const { coachFieldSchema } = await import("../lib/plan-builder/coach");
    const { coachAmount } = await import("../lib/plan-builder/coach-feasibility");
    const options = await import("../lib/plan-builder/intake-options");
    const { descriptionSector } = await import("../lib/plan-builder/intake-sector");
    const modes: IntakeMode[] = ["exploring", "startup", "operating"];
    const expectedCore = {
      exploring: ["interest", "experience", "hoursPerWeek", "budget", "candidate", "customer", "problem", "offer", "channel", "price", "goal"],
      startup: ["industry", "business", "customer", "problem", "offer", "channel", "price", "budget", "hoursPerWeek", "capacity", "goal"],
      operating: ["industry", "business", "customer", "offer", "problem", "period", "sales", "cost", "capacity", "channel", "goal"],
    };
    const expectedDetails = {
      b2b_service: ["decisionMaker", "deliverables", "deliveryDays", "paymentTerms"],
      software: ["workflow", "releaseStatus", "billingUnit", "supportMinutes"],
      food_beverage: ["signatureMenu", "averageTicket", "peakOrders", "wasteHandling"],
      retail_commerce: ["sourcing", "minimumOrder", "fulfillment", "returns"],
      manufacturing: ["productStage", "minimumBatch", "qualityChecks", "leadDays"],
      education: ["learningOutcome", "classSize", "sessionMinutes", "feedback"],
      local_service: ["serviceArea", "travelMinutes", "responsibility", "cancellation"],
      space_hospitality: ["useConditions", "guestLimit", "turnoverMinutes", "damagePolicy"],
      logistics: ["route", "dailyShipments", "cargoConditions", "exceptions"],
      content_media: ["format", "revisionRounds", "usageRights", "productionDays"],
      general: ["smallestTrial", "resources", "trialDays", "reviewCriteria"],
    };
    const checkQuestion = (question: IntakeQuestion) => {
      assert.ok(question.id && question.label.trim() && question.prompt.trim());
      assert.ok(["text", "number", "single", "multi"].includes(question.kind));
      assert.equal(question.optional, true, "Unknown answers may be skipped by the parent");
      assert.ok(!("value" in question) && !("defaultValue" in question), "The catalogue stores no answers or defaults");
      if (question.kind === "number") assert.ok(question.unit, `${question.id} needs an explicit unit`);
      if (question.fieldKey) {
        assert.equal(question.id, question.fieldKey, "Direct coach mappings use canonical IDs");
        assert.ok(coachFieldSchema.shape.key.options.includes(question.fieldKey));
      }
      if (question.kind === "single" || question.kind === "multi") {
        assert.ok(question.options);
        assert.equal(new Set(question.options.map(option => option.value)).size, question.options.length);
        assert.ok(question.options.every(option => option.value && option.label.trim()));
        assert.ok(question.options.length > 0 || question.id === "candidate");
      }
      if (question.options) {
        assert.equal(new Set(question.options.map(option => option.value)).size, question.options.length, `${question.id}: unique option values`);
        for (const option of question.options) {
          if (question.id === "industry" || question.id === "interest" || question.id === "software.releaseStatus") continue;
          assert.equal(option.value, option.label, `${question.id}: new chips store their label`);
          assert.ok(options.validChipLabel(option.label, 40), `${question.id}: "${option.label}" has no / or , and is short`);
        }
        if (question.kind === "text") assert.ok(question.options.length >= 2 && question.options.length <= 22, `${question.id}: hybrid chip count (averageTicket has 2 basis chips beside its amount ladder)`);
      }
      if (question.hint) assert.ok(question.hint.length <= 80 && !question.prompt.includes(question.hint), `${question.id}: hint is separate helper text`);
    };

    assert.equal(PROPOSAL_SECTORS.length, 11);
    assert.deepEqual(intakeSectorOptions, PROPOSAL_SECTORS.map(value => ({ value, label: SECTOR_PROFILES[value].label })));
    let combinations = 0;
    for (const mode of modes) for (const sector of PROPOSAL_SECTORS) {
      const core = coreQuestions(mode);
      const details = detailQuestions(sector);
      assert.ok(core.length <= 12);
      assert.deepEqual(core.map(question => question.id), expectedCore[mode]);
      assert.equal(details.length, 4);
      assert.deepEqual(details.map(question => question.id), expectedDetails[sector].map(id => `${sector}.${id}`));
      const questions = [...core, ...details];
      assert.equal(new Set(questions.map(question => question.id)).size, questions.length, `${mode}/${sector}: unique IDs`);
      assert.ok(details.every(question => question.id.startsWith(`${sector}.`)));
      assert.ok(details.some(question => question.unit && question.period), `${sector}: domain quantity units`);
      for (const question of questions) {
        checkQuestion(question);
        assert.deepEqual(getIntakeQuestion(mode, sector, question.id), question);
      }
      assert.equal(getIntakeQuestion(mode, sector, "missing"), undefined);
      combinations++;
    }
    assert.equal(combinations, 33);
    const allDetails = PROPOSAL_SECTORS.flatMap(detailQuestions);
    assert.equal(new Set(allDetails.map(question => question.id)).size, 44);
    assert.equal(new Set(allDetails.map(question => question.prompt)).size, 44, "All packs have authored domain-specific wording");
    assert.equal(getIntakeQuestion("startup", "software", "food_beverage.averageTicket"), undefined);

    const candidateQuestion = getIntakeQuestion("exploring", null, "candidate")!;
    assert.equal(candidateQuestion.kind, "single");
    assert.deepEqual(candidateQuestion.options, [], "The parent supplies current candidate options");
    assert.equal(candidateQuestion.fieldKey, undefined, "Selecting a candidate maps to business outside this module");
    const customQuestion = getIntakeQuestion("exploring", undefined, "business")!;
    assert.equal(customQuestion.kind, "text");
    assert.equal(customQuestion.fieldKey, "business");
    assert.ok(!coreQuestions("exploring").some(question => question.id === "business"), "Free text is an alternative, not a forced extra question");
    for (const mode of ["startup", "operating"] as const) {
      assert.equal(getIntakeQuestion(mode, null, "industry")!.fieldKey, undefined, "Industry belongs to coach.business.industry in the parent");
      assert.deepEqual(getIntakeQuestion(mode, null, "industry")!.options, intakeSectorOptions);
    }
    const period = getIntakeQuestion("operating", null, "period")!;
    assert.equal(period.kind, "text");
    assert.match(period.label, /시작일/);
    assert.match(period.label, /종료일/);
    assert.equal(period.fieldKey, undefined);
    assert.equal(getIntakeQuestion("operating", null, "cost")!.period, "월");
    assert.match(getIntakeQuestion("operating", null, "cost")!.prompt, /월 고정비/);
    assert.match(getIntakeQuestion("operating", null, "cost")!.prompt, /건당 변동비.*구분/);
    assert.match(getIntakeQuestion("operating", null, "sales")!.prompt, /실제 매출/);
    assert.equal(getIntakeQuestion("operating", null, "sales")!.period, "입력한 시작일~종료일");
    assert.equal(getIntakeQuestion("startup", null, "price")!.period, "판매 1건");
    assert.equal(getIntakeQuestion("operating", null, "price"), undefined, "operating asks sales and cost, not a unit price");
    for (const mode of ["exploring", "startup"] as const) {
      const priceQuestion = getIntakeQuestion(mode, null, "price")!;
      assert.equal(priceQuestion.kind, "number", `${mode}: price is a coachAmount number`);
      assert.equal(priceQuestion.unit, "원");
      assert.ok(!priceQuestion.prompt.includes("판매 기준"), "The pricing basis comes from question.period, not from the prompt");
    }
    const kinds = Object.fromEntries(PROPOSAL_SECTORS.flatMap(detailQuestions).map(question => [question.id, question.kind]));
    for (const id of ["education.feedback", "food_beverage.wasteHandling", "retail_commerce.sourcing", "retail_commerce.fulfillment", "local_service.responsibility", "local_service.cancellation", "space_hospitality.useConditions", "space_hospitality.damagePolicy", "logistics.cargoConditions", "logistics.exceptions", "general.resources"]) assert.equal(kinds[id], "multi", id);
    assert.equal(kinds["manufacturing.productStage"], "single");
    for (const id of ["content_media.revisionRounds", "education.classSize"]) {
      const question = PROPOSAL_SECTORS.flatMap(detailQuestions).find(item => item.id === id)!;
      assert.equal(question.kind, "text", id); assert.ok(question.options!.length >= 6); assert.ok(question.unit && question.period, `${id} keeps its unit for context`);
    }
    assert.equal(Object.values(kinds).filter(kind => kind === "number").length, 13, "15 detail numbers minus revisionRounds and classSize stay numbers");
    for (const [sector, id] of [["b2b_service", "deliveryDays"], ["software", "supportMinutes"], ["food_beverage", "peakOrders"], ["retail_commerce", "minimumOrder"], ["manufacturing", "leadDays"], ["education", "sessionMinutes"], ["local_service", "travelMinutes"], ["space_hospitality", "guestLimit"], ["logistics", "dailyShipments"], ["content_media", "productionDays"], ["general", "trialDays"]] as const) {
      const question = detailQuestions(sector).find(item => item.id === `${sector}.${id}`)!;
      assert.equal(question.kind, "number"); assert.ok(question.unit && question.period, `${sector}.${id} carries unit and period`);
      assert.ok(options.numberPresets(question).length >= 5, `${sector}.${id} has quick presets`);
      assert.deepEqual([...options.numberPresets(question)], [...options.numberPresets(question)].sort((a, b) => a - b), "presets ascend");
      assert.equal(options.numberAnswer(options.numberPresets(question)[1], question.unit), `${options.numberPresets(question)[1]}${question.unit}`);
    }
    assert.deepEqual(options.numberPresets({ id: "hoursPerWeek", unit: "시간", period: "주" }), [5, 10, 20, 30, 40, 60]);
    assert.equal(options.numberPresetLabel({ id: "logistics.dailyShipments", unit: "건" }, 20), "약 20건");
    assert.equal(options.numberPresetLabel({ id: "local_service.travelMinutes", unit: "분" }, 0), "이동 없음(0분)");
    assert.deepEqual(options.numberPresets({ id: "budget", unit: "원" }), [], "range ladders have no number presets");

    // Shared chip catalogue (intake-options.ts): every sector has every core slot, labels follow the public-copy rules.
    const noSeparators = (label: string) => assert.ok(options.validChipLabel(label), `"${label}" must not contain the / or ", " separators`);
    for (const sector of [...PROPOSAL_SECTORS, null] as const) {
      for (const id of ["customer", "problem", "offer"] as const) {
        const set = options.sectorChipOptions(sector, id, "startup");
        assert.equal(set.length, 6, `${sector}/${id}`);
        assert.equal(new Set(set.map(option => option.value)).size, 6);
        set.forEach(option => { noSeparators(option.label); assert.equal(option.value, option.label); });
      }
      const channel = options.sectorChipOptions(sector, "channel");
      assert.equal(channel.length, 8);
      assert.equal(channel.filter(option => option.group === options.CHIP_GROUPS.channelCommon).length, 6);
      assert.equal(channel.filter(option => option.group === options.CHIP_GROUPS.channelSector).length, 2);
      channel.forEach(option => { noSeparators(option.label); assert.ok(option.label.length <= 20, `channel "${option.label}" ≤ 20 chars`); });
      const capacity = options.sectorChipOptions(sector, "capacity");
      assert.equal(capacity.filter(option => option.group === options.CHIP_GROUPS.people).length, 5);
      assert.ok(capacity.filter(option => option.group === options.CHIP_GROUPS.unit).length >= 5);
      assert.equal(capacity.filter(option => option.group === options.CHIP_GROUPS.period).length, 3);
      for (const mode of modes) {
        const goal = options.sectorChipOptions(sector, "goal", mode);
        assert.equal(goal.filter(option => option.group === options.CHIP_GROUPS.metric).length, 8, `${mode} goal metrics`);
        assert.ok(goal.filter(option => option.group === options.CHIP_GROUPS.period).length >= 3);
        assert.ok(goal.filter(option => option.group === options.CHIP_GROUPS.amount).every(option => option.label.endsWith("원")));
        const problem = options.sectorChipOptions(sector, "problem", mode);
        assert.equal(problem.length, mode === "operating" ? 8 : 6);
        problem.forEach(option => noSeparators(option.label));
        assert.ok(problem.every(option => !option.label.includes("(운영)")));
      }
      const business = options.sectorChipOptions(sector, "business", "startup");
      assert.ok(business.length >= 6 && business.length <= 8, `${sector} business prefill chips`);
      assert.ok(business.every(option => option.group === options.CHIP_GROUPS.prefill && !option.label.includes("○○")));
      assert.equal(options.sectorChipOptions(sector, "business", "operating").length, 8);
      assert.ok(options.sectorChipOptions(sector, "business", "operating").every(option => option.label.includes("○○")));
      assert.deepEqual(options.sectorChipOptions(sector, "period"), []);
      assert.deepEqual(options.sectorChipOptions(sector, "budget"), []);
      const experience = options.sectorChipOptions(sector, "experience");
      assert.equal(experience.length, 12);
      // Amount ladders: ascending, every boundary ends with 원, open ends are explicit.
      for (const id of ["price", "budget", "sales", "cost"] as const) {
        const ranges = options.amountRanges(sector, id, "operating");
        assert.ok(ranges.length >= 4 && ranges.length <= 7, `${sector}/${id} ladder size ${ranges.length}`);
        let previous = -1;
        for (const range of ranges) {
          for (const boundary of range.label.replace(/ (?:미만|이상)$/, "").split("~")) assert.ok(boundary.endsWith("원"), `${sector}/${id} "${range.label}" boundaries end with 원`);
          noSeparators(range.label);
          const low = range.min ?? range.max ?? 0;
          assert.ok(low >= previous, `${sector}/${id} ascending at "${range.label}"`);
          previous = range.max ?? Number.MAX_SAFE_INTEGER;
          if (range.min !== null && range.max !== null) assert.ok(range.min <= range.max);
        }
        assert.equal(ranges.at(-1)!.max, null, `${sector}/${id} ends with an open top`);
        assert.ok(!ranges.some(range => range.label === "0원") || id === "budget", "only budget offers a 0원 chip");
      }
      assert.ok(options.amountRanges(sector, "price").every(range => range.label !== "0원" && range.label !== "무료"), "free is not a price chip");
      assert.ok(options.PRICE_BASIS[sector ?? "general"]);
    }
    assert.deepEqual(options.amountRanges("space_hospitality", "price").map(range => range.label), options.amountRanges("space_hospitality", "price", "startup", "시간당").map(range => range.label));
    assert.equal(options.amountRanges("space_hospitality", "price", "startup", "1박")[0].label, "50,000원 미만");
    assert.equal(options.amountRanges("b2b_service", "price")[0].label, "30만원 미만");
    assert.equal(options.amountRanges("b2b_service", "price").at(-1)!.label, "1,000만원 이상");
    assert.equal(options.amountRanges("retail_commerce", "price")[0].label, "1,000원~5,000원");
    assert.deepEqual(options.amountRanges(null, "budget").map(range => range.label), ["0원", "100만원 미만", "100만원~300만원", "300만원~1,000만원", "1,000만원~3,000만원", "3,000만원~1억원", "1억원 이상"]);
    assert.ok(!options.amountRanges("food_beverage", "budget").some(range => range.label === "100만원 미만"), "high-capex sectors drop the lowest budget range");
    assert.equal(options.amountRanges("software", "sales")[1].label, "100만원~300만원");
    assert.equal(options.scaledAmountRanges(options.amountRanges("software", "sales"), 12)[1].label, "1,200만원~3,600만원");
    assert.equal(options.periodMonths("2025-09-01 / 2026-08-31"), 12);
    assert.equal(options.periodMonths("2026-08-01 / 2026-08-31"), 1);
    assert.equal(options.periodMonths("지난달"), null);
    assert.deepEqual(options.openEndPresets({ label: "1억원 이상", min: 100000000, max: null }), [100000000, 150000000, 200000000, 300000000, 500000000, 1000000000]);
    assert.equal(options.amountRanges("food_beverage", "food_beverage.averageTicket").length, 7);
    assert.deepEqual(options.amountRanges("software", "hoursPerWeek"), []);
    assert.equal(options.wonLabel(120000000), "1억 2,000만원");
    assert.equal(options.wonLabel(15000), "15,000원");
    // Exact amounts round-trip through coachAmount (coach.fields storage) without losing a won.
    for (const value of [0, 500, 7500, 12000, 120000, 1250000, 3250000, 30000000, 100000000, 150000000, 1234567]) {
      const stored = options.wonAnswer(value);
      assert.equal(coachAmount(stored), value, `${value} → ${stored} → coachAmount`);
      assert.ok(!/[/,]/.test(stored) || /^\d{1,3}(?:,\d{3})+만원$/.test(stored), `${stored} stays coachAmount-parsable`);
    }
    assert.equal(options.wonAnswer(120000), "12만원");
    assert.equal(options.wonAnswer(1234567), "1234567원");
    assert.equal(coachAmount(options.numberAnswer(12000, "원")), 12000);
    assert.equal(options.numberAnswer(1000, "개"), "1000개", "non-won units carry no thousands separator");
    for (const range of options.amountRanges("food_beverage", "price")) for (const bound of [range.min, range.max]) if (bound !== null && bound > 0) assert.equal(coachAmount(options.wonAnswer(bound)), bound);
    // Assembly grammar: labels never contain the separators, so assembled strings split back exactly.
    const assembled = options.assembleAnswer([["대표자 혼자"], ["하루", "20건"]]);
    assert.equal(assembled, "대표자 혼자 / 하루, 20건");
    assert.deepEqual(options.splitAssembledAnswer(assembled), [["대표자 혼자"], ["하루", "20건"]]);
    assert.equal(options.assembleAnswer([["", "a"], [], ["b"]]), "a / b");
    assert.equal(options.stepFor(3), 1); assert.equal(options.stepFor(30), 10); assert.equal(options.stepFor(300), 100); assert.equal(options.stepFor(3000), 500); assert.equal(options.stepFor(30, "시간"), 5);
    assert.ok(Object.keys(options.INDUSTRY_HINTS).length === 11 && Object.values(options.INDUSTRY_HINTS).every(hint => hint.length <= 20));
    // Every experience chip ranks its own sector first (spec §3.1); tags must not leak across sectors.
    const experienceSectors = ["b2b_service", "software", "food_beverage", "retail_commerce", "manufacturing", "education", "local_service", "space_hospitality", "logistics", "content_media", "b2b_service", "local_service"];
    options.EXPERIENCE_CHIPS.forEach((label, index) => {
      const first = intakeCandidates({ experience: label })[0];
      assert.equal(first.sector, experienceSectors[index], `experience chip "${label}" → ${experienceSectors[index]} (got ${first.sector})`);
      assert.match(first.reasons[0], /경험 입력과 일치한 태그/);
    });
    assert.equal(intakeCandidates({ experience: "청소·수납·방문 서비스, 요리·카페·베이킹" })[0].sector, "food_beverage", "ties fall back to catalogue order");
    assert.equal(intakeCandidates({ interest: ["local_service"], experience: "청소·수납·방문 서비스, 요리·카페·베이킹" })[0].sector, "local_service", "interest sector is the first sort key");
    // Candidate coverage: two to three authored ideas per sector, interest sector first.
    const ideaSectors = new Map<string, number>();
    for (const sector of PROPOSAL_SECTORS) {
      const ideas = intakeCandidates({ interest: [sector] });
      assert.ok(ideas.filter(idea => idea.sector === sector).length >= 2, `${sector} has at least two candidate ideas`);
      ideaSectors.set(sector, ideas.filter(idea => idea.sector === sector).length);
    }
    for (const [text, sector] of [["네일샵", "local_service"], ["이사 업체", "local_service"], ["동네 반찬가게", "food_beverage"], ["도시락 배달 전문", "food_beverage"], ["공유오피스 운영", "space_hospitality"], ["스튜디오 대관·파티룸", "space_hospitality"], ["퀵 배송", "logistics"], ["용달 운송", "logistics"], ["초등 영어 과외", "education"], ["피아노 레슨", "education"], ["반도체 부품 제조", "manufacturing"], ["헤어샵", "local_service"], ["관리이사 채용 공고", "general"], ["아직 이름 없는 새로운 사업", "general"], ["택배 상자 온라인 판매", "retail_commerce"]] as const) {
      assert.equal(descriptionSector(text), sector, `descriptionSector("${text}")`);
    }
    assert.equal(getIntakeQuestion("startup", null, "hoursPerWeek")!.period, "주");
    assert.equal(getIntakeQuestion("startup", "food_beverage", "food_beverage.averageTicket")!.fieldKey, undefined, "Average ticket is not a representative menu's unit price");
    assert.equal(getIntakeQuestion("startup", "local_service", "local_service.travelMinutes")!.fieldKey, undefined, "Travel time is not total minutesPerSale");

    const baseline = intakeCandidates({});
    assert.equal(baseline.length, 3);
    assert.deepEqual(baseline, intakeCandidates({}));
    assert.deepEqual(baseline, intakeCandidates({ interest: null, experience: null, hoursPerWeek: null, budget: null }));
    assert.deepEqual(baseline, intakeCandidates({ interest: [], experience: "  ", hoursPerWeek: "", budget: [] }));
    assert.ok(baseline.every(candidate => candidate.reasons.some(reason => reason.includes("고정된 목록 순서"))));
    assert.ok(baseline.every(candidate => candidate.cautions.some(caution => caution.includes("0원으로 보지"))));
    assert.ok(baseline.every(candidate => candidate.cautions.some(caution => caution.includes("0시간으로 보지"))));
    const zero = intakeCandidates({ budget: 0, hoursPerWeek: 0 });
    assert.deepEqual(zero.map(candidate => candidate.id), baseline.map(candidate => candidate.id), "Budget/time do not produce fabricated suitability rankings");
    assert.ok(zero.every(candidate => candidate.cautions.some(caution => caution.includes("입력한 예산"))));
    assert.ok(zero.every(candidate => candidate.cautions.some(caution => caution.includes("입력한 주당 시간"))));
    assert.notDeepEqual(zero, baseline, "Explicit zero is not missing");
    assert.deepEqual(baseline, intakeCandidates({ budget: Number.NaN, hoursPerWeek: Number.POSITIVE_INFINITY }));

    for (const sector of PROPOSAL_SECTORS) {
      const byValue = intakeCandidates({ interest: [sector] });
      assert.equal(byValue[0].sector, sector);
      assert.match(byValue[0].reasons[0], /관심 분야 입력과 일치한 태그/);
      assert.ok(byValue[0].reasons[0].includes(SECTOR_PROFILES[sector].label), "사용자에게 보이는 근거는 내부 값이 아닌 업종 라벨");
      assert.ok(!byValue[0].reasons[0].includes(sector) || SECTOR_PROFILES[sector].label.includes(sector), "내부 업종 값은 근거 문구에 노출하지 않음");
      assert.equal(intakeCandidates({ interest: SECTOR_PROFILES[sector].label })[0].sector, sector);
      const byExperience = intakeCandidates({ experience: [sector] });
      assert.equal(byExperience[0].sector, sector);
      assert.match(byExperience[0].reasons[0], /경험 입력과 일치한 태그/);
      for (const candidate of byValue) {
        assert.deepEqual(Object.keys(candidate).sort(), ["id", "title", "description", "sector", "reasons", "cautions"].sort());
        assert.ok(candidate.title && candidate.description && candidate.reasons.length && candidate.cautions.length);
        assert.ok(!/\d+\s*(?:%|점|만원|시간 이상|시간 이하)/.test(JSON.stringify(candidate)), "No invented success scores or financial thresholds");
      }
    }
    assert.equal(intakeCandidates({ interest: "코딩" })[0].sector, "software");
    assert.equal(intakeCandidates({ experience: "베이킹" })[0].sector, "food_beverage");
    assert.deepEqual(intakeCandidates({ interest: "CODING" }), intakeCandidates({ interest: "coding" }));
    assert.deepEqual(intakeCandidates({ interest: "ＣＯＤＩＮＧ" }), intakeCandidates({ interest: "coding" }));
    assert.deepEqual(intakeCandidates({ interest: "decoding" }), baseline, "Latin keywords match whole tokens");
    assert.deepEqual(intakeCandidates({ interest: "일치하지않는관심" }), baseline);
    const answers = Object.freeze({ interest: ["software", "education"], experience: "개발", budget: 150000, hoursPerWeek: 8 });
    Object.freeze(answers.interest);
    const before = JSON.stringify(answers);
    const candidates = intakeCandidates(answers);
    assert.equal(candidates[0].sector, "software", "Interest and experience matches come before a single-source match");
    assert.deepEqual(candidates, intakeCandidates({ hoursPerWeek: 8, budget: 150000, experience: "개발", interest: ["education", "software"] }));
    assert.deepEqual(candidates, intakeCandidates({ ...answers, interest: ["software", "software", "education"], candidate: "not-a-confirmed-business" }));
    assert.equal(JSON.stringify(answers), before, "Answers are never mutated or persisted");

    const originalIdea = "  아직 업종이 없는 새로운 이용 방식\n원래 구상을 유지  ";
    const custom = intakeCandidates({ business: originalIdea, interest: "software" });
    assert.equal(custom.length, 1);
    assert.equal(custom[0].id, "custom-business");
    assert.equal(custom[0].title, originalIdea);
    assert.equal(custom[0].description, originalIdea);
    assert.equal(custom[0].sector, "general", "Do not infer a custom idea's sector from interests");
    assert.equal(intakeCandidates({ business: originalIdea, industry: "software" })[0].sector, "software");
    assert.equal(intakeCandidates({ business: originalIdea, industry: "not-a-sector" })[0].sector, "general");
    assert.deepEqual(intakeCandidates({ business: "   " }), baseline);

    const mutableCore = coreQuestions("startup");
    mutableCore[0].options![0].label = "changed";
    mutableCore[1].prompt = "changed";
    mutableCore.pop();
    assert.deepEqual(coreQuestions("startup").map(question => question.id), expectedCore.startup);
    assert.deepEqual(coreQuestions("startup")[0].options, intakeSectorOptions);
    assert.notEqual(coreQuestions("startup")[1].prompt, "changed");
    const mutableDetail = detailQuestions("software");
    mutableDetail[1].options![0].label = "changed";
    assert.notEqual(detailQuestions("software")[1].options![0].label, "changed");
    customQuestion.prompt = "changed";
    const mutableCandidate = getIntakeQuestion("exploring", null, "candidate")!;
    mutableCandidate.options!.push({ value: "parent-candidate", label: "Parent candidate" });
    assert.notEqual(getIntakeQuestion("exploring", null, "business")!.prompt, "changed");
    assert.deepEqual(getIntakeQuestion("exploring", null, "candidate")!.options, []);
    candidates[0].reasons.push("changed");
    candidates[0].cautions.length = 0;
    assert.ok(!intakeCandidates(answers)[0].reasons.includes("changed"));
    assert.ok(intakeCandidates(answers)[0].cautions.length > 0);
    assert.equal(fetchCalls, 0);
    console.log(`business-intake-questions: 33 mode/sector combinations, 44 detail questions, select-first kinds, chip catalogue for ${PROPOSAL_SECTORS.length} sectors, amount ladders, experience→sector ranking, ${[...ideaSectors.values()].reduce((a, b) => a + b, 0)} candidate ideas, canonical fields, custom ideas, deterministic candidates, unknown/zero separation, mutation isolation and zero network calls passed`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
