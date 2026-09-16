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
      assert.ok(byValue[0].reasons[0].includes(sector));
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
    console.log("business-intake-questions: 33 mode/sector combinations, 44 detail questions, canonical fields, custom ideas, deterministic candidates, unknown/zero separation, mutation isolation and zero network calls passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
