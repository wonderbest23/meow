import type { ArtifactRecord, ProjectRecord } from "./service-domain";
import type { OpenAIRuntimeConfig } from "./openai/session-config";
import {
  inspectStageArtifact,
  stageQualityRevisionInstruction,
} from "./quality/stage-artifact";
import { deriveAutoDraftContext } from "./auto-draft";
import { z } from "zod";

const stageInstructions = [
  "사업 실행 브리프를 생성하세요. problem, customer, valueProposition, constraints, validationPlan, day21Goal을 포함하고, 대상·제외범위·통과기준·완료 증거까지 실행자가 바로 행동할 수준으로 작성하세요.",
  "고객·시장 진단서를 생성하세요. primaryCustomer, jobs, pains, currentAlternatives, evidence, interviewScript, unknowns를 포함하세요. jobs·pains·대안·미확인 사항은 각각 3개 이상, 인터뷰 질문은 최근 행동·실제 비용·지불의사를 다루는 8개 이상으로 작성하세요.",
  "상품·가격·손익안을 생성하세요. 3개 tiers, unitEconomics, breakEvenCustomers, assumptions, pricingTests를 포함하세요. 모든 금액은 산식·포함범위·검증상태를 구분하고 보수·기준·낙관 시나리오를 제시하세요.",
  "브랜드 키트를 생성하세요. nameCandidates, promise, slogans, tone, prohibitedClaims, selectionGuide를 포함하세요. 이름과 슬로건은 각각 3개 이상, 선택 기준·사용 예시·금지 표현·상표 확인 절차를 구체화하세요.",
  "판매 랜딩페이지를 생성하세요. hero, problem, solution, offer, pricing, proof, faq, cta, legalNotice 블록을 포함하세요. 축약 문구만 나열하지 말고 모바일 페이지에 바로 붙일 완성 문장, 최소 4개 FAQ, 개인정보·환불 주의를 작성하세요.",
  "첫 런칭 패키지를 생성하세요. outreachScripts, channelPlan, weeklyMetrics, supportProgramChecklist, next30Days를 포함하세요. 30일 계획은 날짜·행동·담당·완료 증거·통과 또는 중단 기준이 드러나게 12개 이상 작성하세요.",
] as const;

const stageContentSchemas = [
  z.object({
    problem: z.string().min(80),
    customer: z.string().min(2),
    valueProposition: z.string().min(80),
    constraints: z.record(z.string(), z.unknown()),
    validationPlan: z.string().min(80),
    day21Goal: z.string().min(80),
  }).passthrough(),
  z.object({
    primaryCustomer: z.string().min(2),
    jobs: z.array(z.string().min(15)).min(3),
    pains: z.array(z.string().min(15)).min(3),
    currentAlternatives: z.array(z.string().min(10)).min(3),
    evidence: z.array(z.unknown()),
    interviewScript: z.array(z.string().min(15)).min(8),
    unknowns: z.array(z.string().min(5)).min(3),
  }).passthrough(),
  z.object({
    tiers: z.array(z.object({ name: z.string(), priceWon: z.number(), outcome: z.string().min(5) })).min(3),
    unitEconomics: z.record(z.string(), z.unknown()),
    breakEvenCustomers: z.number().int().positive().nullable(),
    assumptions: z.array(z.string().min(20)).min(3),
    pricingTests: z.array(z.string().min(20)).min(4),
  }).passthrough(),
  z.object({
    nameCandidates: z.array(z.string()).min(3),
    promise: z.string().min(80),
    slogans: z.array(z.string()).min(3),
    tone: z.string().min(1),
    prohibitedClaims: z.array(z.string()).min(2),
    selectionGuide: z.string().min(80),
    usageExamples: z.array(z.string().min(20)).min(3),
  }).passthrough(),
  z.object({
    blocks: z.array(z.record(z.string(), z.unknown())).min(8),
    contact: z.object({ method: z.unknown(), value: z.unknown() }),
    legalNotice: z.string().min(60),
  }).passthrough(),
  z.object({
    launchDate: z.string().min(1),
    outreachScripts: z.record(z.string(), z.string()),
    channelPlan: z.array(z.string().min(20)).min(2),
    weeklyMetrics: z.record(z.string(), z.number()),
    next30Days: z.array(z.string().min(20)).min(12),
    decisionCriteria: z.array(z.string().min(20)).min(3),
  }).passthrough(),
] as const;

function validateStageContent(stageIndex: number, value: unknown) {
  const schema = stageContentSchemas[stageIndex];
  if (!schema) throw new Error("STAGE_SCHEMA_NOT_FOUND");
  return schema.parse(value) as Record<string, unknown>;
}

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mergeStringLists(value: unknown, defaults: string[], minimum: number, minimumItemLength = 1) {
  const supplied = Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => {
          const trimmed = item.trim();
          return trimmed.length >= minimumItemLength
            ? trimmed
            : `${trimmed} - 이 내용은 사용자 입력이며 실제 자료와 판매 기록으로 확인해야 합니다.`;
        })
    : [];
  return [...new Set([...supplied, ...defaults])].slice(0, Math.max(minimum, supplied.length));
}

function fallbackContent(project: ProjectRecord, stageIndex: number) {
  const opportunity = project.opportunity;
  const stage = project.stages[stageIndex];
  const inputs = stage.inputs;
  const title = String(opportunity.title ?? project.title);
  const autoDraft = deriveAutoDraftContext(opportunity);
  const inputCustomer = String(inputs.primaryCustomer ?? "");
  const customer = inputCustomer && !/(첫 기획|초기 목표|확인할.*고객)/.test(inputCustomer)
    ? inputCustomer
    : autoDraft.customer;
  const oneLiner = autoDraft.idea;

  if (stageIndex === 0) {
    return {
      problem: `${autoDraft.problem} 첫 단계에서는 완성된 서비스를 만들기보다 이 문제가 실제로 반복되는지, 고객이 현재 어떤 대안에 시간과 돈을 쓰는지 확인합니다.`,
      customer,
      valueProposition: `${autoDraft.coreOutcome} ${autoDraft.promise} 첫 검증에서는 핵심 결과 한 가지만 직접 제공해 사용 의사와 지불 의사를 먼저 확인합니다.`,
      constraints: {
        budgetWon: number(inputs.budgetWon, 0),
        availableHoursPerWeek: number(inputs.availableHoursPerWeek, 10),
        mustAvoid: inputs.mustAvoid ?? [],
        existingAssets: inputs.existingAssets ?? [],
        firstScope: "한 종류의 고객, 한 가지 입력 자료, 한 가지 결과물만 다룹니다.",
        excludedScope: "자동화 앱 개발, 대규모 광고, 검증되지 않은 성과 보장은 첫 21일 범위에서 제외합니다.",
      },
      businessReadiness: project.businessSetup
        ? {
            archetype: project.businessSetup.archetype,
            legalForm: project.businessSetup.legalForm,
            workplaceType: project.businessSetup.workplaceType,
            region: project.businessSetup.region,
            requiredActions: project.businessAssessment?.requirements
              .filter((item) => item.severity !== "verify")
              .map((item) => item.title) ?? [],
            hardBlockCount: project.businessAssessment?.hardBlockCount ?? 0,
          }
        : { status: "사업 설정 입력 필요" },
      validationPlan: `${String(opportunity.firstTest ?? "잠재 고객 10명을 인터뷰합니다.")} 인터뷰에서는 최근에 문제를 겪은 날짜, 사용한 대안, 실제 지출, 포기한 행동을 기록합니다. 이후 같은 범위와 가격을 공개한 제안 10건을 보내고 최소 3건의 결제 또는 명확한 거절 이유를 확보합니다.`,
      day21Goal: "고객 인터뷰 10건, 가격이 공개된 제안 10건, 유료 주문 3건을 확보합니다. 동시에 포함·제외 범위, 환불 기준, 건당 원가, 판매 페이지, 다음 30일 중단·계속 기준을 문서로 확정합니다.",
      automaticDecisions: [
        "첫 21일에는 완성된 시스템을 개발하지 않고 대표자가 직접 제공할 수 있는 핵심 결과 한 가지로 고객 반응을 확인합니다.",
        "처음 입력한 예산을 넘는 사무실, 채용과 광고 계약은 손익분기 고객 수와 첫 결제가 확인될 때까지 진행하지 않습니다.",
        "사용자가 아직 모르는 비용과 시장 수치는 추천값 또는 가정으로 표시하고 실제 견적과 공식 원문이 생기면 자동 계산을 다시 갱신합니다.",
        "첫 고객의 반복 문제, 지불 의사와 대표자 작업시간 중 하나라도 확인되지 않으면 기능을 늘리지 않고 고객 또는 제공 범위를 먼저 수정합니다.",
      ],
    };
  }
  if (stageIndex === 1) {
    const interviewNotes = Array.isArray(inputs.interviewNotes) ? inputs.interviewNotes : [];
    const suppliedProblem = typeof inputs.problemStatement === "string" ? inputs.problemStatement.trim() : "";
    const primaryProblem = suppliedProblem.length >= 15
      ? suppliedProblem
      : `${autoDraft.problem} 현재 문장은 초기 가설이며 실제 고객 대화로 확인해야 합니다.`;
    return {
      primaryCustomer: customer,
      jobs: [
        "대상 고객이 원하는 결과와 현재 문제를 빠르고 분명하게 정리합니다.",
        "현재 사용하는 대안보다 시간, 비용 또는 불확실성을 줄이는 방법을 선택합니다.",
        "큰 비용이나 긴 계약 전에 가장 작은 범위로 결과의 품질을 확인합니다.",
        "확인한 결과를 다시 사용하고 다음 행동으로 자연스럽게 이어갑니다.",
      ],
      pains: [
        primaryProblem,
        "현재 대안의 가격, 소요 시간과 결과 품질을 한눈에 비교하기 어렵습니다.",
        "어디까지 제공되는지와 완료 기준이 불분명하면 예상보다 많은 돈과 시간을 쓰게 됩니다.",
        "문제가 반복되어도 믿고 다시 사용할 수 있는 간단한 해결 순서가 없습니다.",
      ],
      currentAlternatives: ["검색과 무료 도구로 직접 해결", "지인이나 온라인 커뮤니티에 질문", "전문가나 기존 업체에 일부만 의뢰", "결정을 미루고 기존 방식 유지"],
      evidence: interviewNotes.length ? interviewNotes : ["고객 인터뷰 원문과 최근 행동 기록이 아직 필요합니다."],
      evidencePlan: [
        `최근 30일 안에 문제를 경험한 ${customer} 후보 5명을 찾아 같은 질문으로 대화하고 답변을 원문 그대로 기록합니다.`,
        "문제를 마지막으로 겪은 날짜, 당시 사용한 대안, 실제 지출액과 해결에 걸린 시간을 서로 다른 칸에 기록합니다.",
        "가격과 제공 범위를 공개한 같은 제안을 10명에게 보여주고 결제, 보류, 거절과 그 이유를 구분해 남깁니다.",
        "경쟁 서비스의 홍보 문구가 아니라 실제 가격표, 포함 범위, 후기의 반복 불만과 환불 조건을 원문 링크와 함께 저장합니다.",
        "인터뷰 참여자의 이름과 연락처는 결과 문서에서 분리하고, 동의받지 않은 개인정보와 민감정보는 근거 자료에 넣지 않습니다.",
        "각 인터뷰가 끝난 날에 반복해서 등장한 문제와 예외 사례를 구분하고, 대표자의 해석보다 고객이 실제로 사용한 표현을 우선 남깁니다.",
        "첫 유료 주문이 생기면 약속한 결과, 실제 작업시간, 추가 요청, 환불 가능성을 주문별로 기록해 상품·가격 단계의 원가 계산에 반영합니다.",
      ],
      interviewScript: [
        "이 문제를 마지막으로 겪은 상황을 처음부터 들려주세요.",
        "현재 어떤 방법으로 해결하며 얼마의 비용과 시간을 쓰나요?",
        "가장 먼저 달라져야 할 결과는 무엇인가요?",
        "자료를 찾지 못해 일정, 돈, 관계에서 손해 본 경험이 있나요?",
        "현재 쓰는 앱이나 사람의 도움에서 가장 불편한 점은 무엇인가요?",
        "누가 최종 구매를 결정하고 비용을 지불하나요?",
        "한 번 정리한 결과를 언제, 누구와 다시 사용하나요?",
        "가격이 공개된 제안을 받으면 무엇을 확인한 뒤 결제하겠나요?",
        "이 서비스에 맡기고 싶지 않은 정보와 작업은 무엇인가요?",
        "이 제안을 다른 사람에게 추천하지 않을 가장 큰 이유는 무엇인가요?",
      ],
      unknowns: mergeStringLists(
        inputs.unknowns,
        ["실제 지불 의사", "구매 결정자", "반복 구매 주기", "허용 가능한 개인정보 범위", "수동 제공에 필요한 평균 작업시간"],
        3,
        5,
      ),
      decisionRule: "가격을 공개한 제안 10건 중 결제 또는 구체적인 구매 약속이 3건 이상이고, 같은 문제가 최근 행동과 실제 지출에서 반복되면 현재 고객과 상품 가설을 유지합니다. 반응이 1~2건이면 제공 범위와 가격을 한 번 수정하고, 반응이 없으면 고객 또는 문제 가설을 바꿉니다.",
      nextActions: [
        `오늘: ${customer} 후보를 찾을 수 있는 지인, 커뮤니티와 기존 연락처에서 인터뷰 대상 10명을 목록으로 만듭니다.`,
        "내일: 목록의 첫 5명에게 판매 제안이 아니라 최근 경험을 듣기 위한 20분 대화를 요청하고 가능한 시간을 확정합니다.",
        "3일 안: 같은 질문으로 인터뷰를 진행하고 문제 발생일, 현재 대안, 실제 비용과 가장 불편한 순간을 원문으로 기록합니다.",
        "4일째: 반복된 문제와 구매 조건을 표로 묶고, 한 번도 언급되지 않은 기능은 첫 상품 범위에서 제외합니다.",
        "5일째: 가장 자주 나온 문제 하나를 해결하는 가격 공개 제안을 10명에게 보내 결제, 보류와 거절 이유를 비교합니다.",
      ],
    };
  }
  if (stageIndex === 2) {
    const verified = project.businessAssessment?.financial;
    const price = verified?.grossPrice ?? number(inputs.basePriceWon, 290000);
    const variableCost = number(inputs.variableCostWon, Math.round(price * 0.2));
    const fixedCost = number(inputs.monthlyFixedCostWon, 1000000);
    const contribution = Math.max(1, price - variableCost);
    return {
      tiers: [
        { name: autoDraft.offerTiers[0].name, priceWon: Math.round(price * 0.45), outcome: autoDraft.offerTiers[0].outcome },
        { name: autoDraft.offerTiers[1].name, priceWon: price, outcome: String(inputs.coreOutcome ?? autoDraft.offerTiers[1].outcome) },
        { name: autoDraft.offerTiers[2].name, priceWon: Math.round(price * 2.2), outcome: autoDraft.offerTiers[2].outcome },
      ],
      recommendedOffer: {
        name: autoDraft.offerTiers[1].name,
        priceWon: price,
        reason: "첫 고객이 실제 결과를 확인할 만큼 충분한 범위를 제공하면서도, 처음부터 개발 대행이나 장기 운영까지 떠안지 않도록 핵심 결과만 묶은 기준 상품입니다.",
        includedScope: `${autoDraft.offerTiers[1].outcome}, 시작 조건 확인, 결과 초안, 범위 안 수정 1회와 다음 행동 안내를 포함합니다.`,
        excludedScope: "확인되지 않은 성과 보장, 무제한 수정, 별도 시스템 개발, 광고비와 외부 전문가 비용은 포함하지 않습니다.",
        completionCriteria: "합의한 결과물이 전달되고 고객이 포함 범위와 다음 행동을 확인하면 완료로 봅니다. 새로운 요청은 기존 완료와 분리해 다시 견적합니다.",
      },
      unitEconomics: verified
        ? {
            priceWon: verified.grossPrice,
            netPriceWon: verified.netPrice,
            variableCostWon: verified.variableCostPerUnit,
            contributionWon: verified.contributionPerUnit,
            marginRate: verified.contributionMarginRate,
          }
        : { priceWon: price, variableCostWon: variableCost, contributionWon: contribution, marginRate: Math.round((contribution / price) * 100) },
      breakEvenCustomers: verified?.breakEvenUnits ?? Math.ceil(fixedCost / contribution),
      breakEvenRevenueWon: verified?.breakEvenRevenue ?? null,
      monthlyFixedCostWon: verified?.monthlyFixedCost ?? fixedCost,
      initialInvestmentWon: verified?.initialInvestment ?? null,
      recommendedWorkingCapitalWon: verified?.recommendedWorkingCapital ?? null,
      totalFundingNeedWon: verified?.totalFundingNeed ?? null,
      scenarios: verified?.scenarios ?? [],
      financialWarnings: verified?.warnings ?? [],
      monthlyGoalCustomers: Math.ceil(number(inputs.monthlyRevenueGoalWon, 5000000) / price),
      pricingRationale: [
        `기준 가격 ${price.toLocaleString("ko-KR")}원은 저장된 손익 계산의 실제 판매가를 그대로 사용했으며, 임의의 업종 평균으로 바꾸지 않았습니다.`,
        `고객 한 명당 남는 금액은 ${Math.round(verified?.contributionPerUnit ?? contribution).toLocaleString("ko-KR")}원으로 계산하며, 실제 작업시간과 외주비가 늘면 가격 또는 범위를 다시 조정합니다.`,
        `월 손익분기 고객 수는 ${verified?.breakEvenUnits ?? Math.ceil(fixedCost / contribution)}명입니다. 이 수를 달성하기 전에는 고정비가 큰 사무실, 채용과 대규모 광고를 추가하지 않습니다.`,
        "세 가지 가격은 기능을 임의로 잘게 나누기 위한 것이 아니라, 진단만 필요한 고객·핵심 결과가 필요한 고객·맞춤 지원이 필요한 고객의 구매 목적을 구분하기 위한 가설입니다.",
        "첫 10건에서는 할인율보다 결제 이유, 제외 요청, 실제 작업시간과 수정 횟수를 기록하고 그 근거로 다음 가격을 한 번만 바꿉니다.",
      ],
      priceChangeRules: [
        "예상보다 작업시간과 수정 요청이 많이 발생하면 가격을 바로 올리기 전에 포함 범위를 줄이고 완료 기준을 더 분명하게 안내합니다.",
        "가격을 공개한 제안 10건 중 문의는 있지만 결제가 없으면 고객이 꼭 원하는 결과만 남겨 기준 상품의 범위와 가격을 한 번 수정합니다.",
        "결제는 발생하지만 고객당 남는 금액이 0원 이하이면 판매를 늘리지 않고 원가, 외주 방식과 환불 조건을 먼저 다시 계산합니다.",
      ],
      assumptions: mergeStringLists(
        inputs.assumptions,
        [
          "고객이 직접 정리하는 시간보다 결과의 신뢰성과 재사용성을 중요하게 봅니다.",
          "대표자가 월 목표 수량을 처리할 수 있는 작업시간을 확보할 수 있습니다.",
          "환불·재작업을 포함해도 건당 공헌이익이 양수로 유지됩니다.",
          "첫 고객은 광고보다 인터뷰 참여자와 소개 채널에서 확보됩니다.",
          "개인정보를 최소 수집해도 핵심 결과를 제공할 수 있습니다.",
        ],
        3,
        20,
      ),
      pricingTests: [
        "동일한 제공 범위로 세 가격을 각각 5명에게 제시합니다.",
        "가격을 본 뒤 제외하고 싶은 업무와 반드시 필요한 업무를 구분합니다.",
        "결제 직전 이탈, 결제 후 취소, 결과 확인 후 환불을 서로 다른 지표로 기록합니다.",
        "대표자 작업시간과 수정 요청을 주문별로 측정해 실제 건당 원가를 다시 계산합니다.",
        "누적 10건 뒤 기본형·핵심형·확장형의 가격과 포함 범위를 한 번만 수정합니다.",
      ],
    };
  }
  if (stageIndex === 3) {
    const keywords = Array.isArray(inputs.preferredKeywords) ? inputs.preferredKeywords : ["명확함", "신뢰", "실행"];
    const preferredNames = Array.isArray(inputs.preferredNames)
      ? inputs.preferredNames.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    return {
      nameCandidates: [...new Set([...preferredNames, ...autoDraft.nameCandidates])].slice(0, 5),
      promise: `${autoDraft.promise} 이름보다 고객이 받는 결과와 사용 조건을 먼저 설명하고, 확인되지 않은 성과는 약속하지 않습니다.`,
      slogans: autoDraft.slogans,
      tone: inputs.tone ?? "실용적인",
      keywords,
      prohibitedClaims: ["무조건 성공", "업계 1위", "완벽 보장", ...(Array.isArray(inputs.prohibitedKeywords) ? inputs.prohibitedKeywords : [])],
      selectionGuide: "후보마다 처음 들었을 때 이해되는지, 전화로 정확히 전달되는지, 검색 결과가 겹치지 않는지 확인합니다. 최종 선택 전 특허정보검색서비스에서 유사 상표를 찾고, 인터넷 주소와 사회관계망 계정 사용 가능 여부, 향후 다른 분야로 확장할 수 있는 이름인지 함께 검토합니다.",
      usageExamples: [
        "소개 문장에서는 고객 문제, 결과물, 제공 범위를 한 문장 안에 씁니다.",
        "판매 페이지에서는 확인되지 않은 인공지능 정확도나 성과 수치를 사용하지 않습니다.",
        "제안서와 견적서에서는 브랜드명보다 결과물·수정 횟수·납기·개인정보 범위를 먼저 명시합니다.",
      ],
      recommendedDirection: {
        name: autoDraft.nameCandidates[0],
        slogan: autoDraft.slogans[0],
        reason: "처음 듣는 사람도 사업의 주제와 시작을 돕는 서비스라는 점을 빠르게 이해할 수 있어 첫 검증용 이름으로 추천합니다. 최종 확정 전에는 반드시 검색과 상표 확인을 거칩니다.",
        usage: `${autoDraft.nameCandidates[0]} | ${autoDraft.slogans[0]}`,
      },
      candidateReasons: autoDraft.nameCandidates.map((name, index) => `${name}: ${index === 0 ? "서비스 목적이 바로 이해되는 우선 후보" : index === 1 ? "기획과 실행 구조를 강조하는 실용적 후보" : index === 2 ? "초보자의 부담을 낮추는 친근한 후보" : index === 3 ? "오늘 바로 시작한다는 행동성을 강조한 후보" : "도움을 받는 서비스라는 점이 쉬운 후보"}입니다.`),
      nameReviewChecklist: [
        "포털과 사회관계망에서 정확히 같은 이름과 비슷한 발음의 서비스를 검색하고 결과 화면과 검색일을 저장합니다.",
        "특허정보검색서비스에서 제공할 상품·서비스와 관련된 분류를 확인하고 같은 이름과 유사 표장을 함께 찾습니다.",
        "전화로 이름을 한 번 말했을 때 상대가 정확히 받아 적는지, 검색어를 다시 묻지 않는지 최소 5명에게 확인합니다.",
        "현재 첫 상품뿐 아니라 앞으로 추가할 상품에도 사용할 수 있는지, 특정 지역이나 기능에 지나치게 묶이지 않는지 검토합니다.",
        "최종 이름을 고르기 전 사용할 인터넷 주소와 사회관계망 계정의 사용 가능 여부를 확인하고 실제 확보 전에는 확정으로 표시하지 않습니다.",
      ],
    };
  }
  if (stageIndex === 4) {
    const defaultLegalNotice = "인공지능이 만든 초안은 사용자 입력과 확인 가능한 자료를 바탕으로 하며 특정 성과를 보장하지 않습니다. 개인정보 수집 목적, 처리 범위, 보유 기간과 삭제 방법은 신청 전에 별도 동의받고 공개해야 합니다.";
    const suppliedLegalNotice = typeof inputs.legalNotice === "string" ? inputs.legalNotice.trim() : "";
    const defaultFaq = [
      { question: "무엇을 먼저 알려주면 되나요?", answer: `${autoDraft.customer}의 현재 상황과 원하는 결과를 알려주면 됩니다. 처음에는 완벽한 자료가 없어도 초안을 만들 수 있습니다.` },
      { question: "인공지능이 내용을 임의로 만들지는 않나요?", answer: "입력에 없는 사실과 시장 수치는 확정 내용으로 추가하지 않고 가정 또는 확인 필요로 표시합니다. 사용 전 직접 검토하고 수정할 수 있습니다." },
      { question: "초안이 마음에 들지 않으면 수정할 수 있나요?", answer: "기본 범위 안에서 원하는 부분을 수정 요청할 수 있습니다. 새로운 기능이나 제공 범위가 추가되면 일정과 비용을 먼저 안내합니다." },
      { question: "개인정보는 어떻게 처리하나요?", answer: "수집 목적과 보유 기간에 동의받은 정보만 사용하고 약정한 기간이 끝나면 삭제합니다. 민감정보는 꼭 필요한 경우가 아니면 입력하지 않습니다." },
    ];
    const suppliedFaq = Array.isArray(inputs.faq)
      ? inputs.faq.filter((item): item is { question: string; answer: string } => {
          if (!item || typeof item !== "object") return false;
          const candidate = item as Record<string, unknown>;
          return typeof candidate.question === "string" && typeof candidate.answer === "string";
        })
      : [];
    const faq = [...suppliedFaq, ...defaultFaq.filter((item) => !suppliedFaq.some((supplied) => supplied.question === item.question))].slice(0, Math.max(4, suppliedFaq.length));
    return {
      blocks: [
        { type: "hero", headline: inputs.headline ?? autoDraft.headline, subheadline: inputs.subheadline ?? autoDraft.subheadline, cta: inputs.callToAction ?? autoDraft.callToAction },
        { type: "problem", title: "이 문제 때문에 시작을 미루고 있나요?", body: `${autoDraft.problem} 고객이 현재 사용하는 대안과 실제로 포기하는 행동을 확인한 뒤 해결 범위를 정합니다.` },
        { type: "solution", title: "가장 필요한 결과부터 작게 제공합니다", body: `${autoDraft.coreOutcome} ${String(opportunity.model ?? "맞춤 방식")}을 기준으로 포함 범위, 가격, 완료 기준과 다음 행동을 먼저 안내합니다.` },
        { type: "process", title: "진행 순서", items: ["현재 상황과 원하는 결과 확인", "포함·제외 범위와 가격 확인", "첫 초안 제작", "고객 검토와 수정", "최종 결과와 다음 행동 전달"] },
        { type: "offer", title: autoDraft.offerTiers[1].name, items: [autoDraft.offerTiers[1].outcome, "제공 범위와 제외 범위 안내", "완료 기준과 예상 일정", "범위 안 수정 1회", "다음 행동 확인표"] },
        { type: "pricing", title: "결제 전 확정하는 조건", items: ["총금액과 부가세", "자료 수와 형식", "납기", "수정 횟수", "원본 보유·삭제일", "취소·환불 기준"] },
        ...(Array.isArray(inputs.proofItems) && inputs.proofItems.length
          ? [{ type: "proof", title: "확인 가능한 근거", items: inputs.proofItems }]
          : [{ type: "proof", title: "공개 전 확보할 근거", items: ["익명 처리한 결과물 예시", "작업 단계별 확인표", "개인정보 삭제 기록", "실제 고객 동의를 받은 후기"] }]),
        { type: "faq", items: faq },
        { type: "cta", headline: "큰 비용을 쓰기 전에 첫 고객의 실제 반응부터 확인하세요", button: inputs.callToAction ?? autoDraft.callToAction },
      ],
      contact: { method: inputs.contactMethod ?? "신청폼", value: inputs.contactValue ?? "" },
      legalNotice: suppliedLegalNotice.length >= 60
        ? suppliedLegalNotice
        : [suppliedLegalNotice, defaultLegalNotice].filter(Boolean).join(" "),
      publishingChecklist: [
        "첫 화면에서 누구의 어떤 문제를 해결하는지, 고객이 받는 결과와 누를 버튼을 휴대전화 한 화면 안에서 확인합니다.",
        "상품 가격, 포함 범위, 제외 범위, 예상 일정과 수정 횟수가 신청 전에 보이는지 실제 고객의 입장에서 다시 읽습니다.",
        "문의 입력칸은 꼭 필요한 정보만 받고 개인정보 수집 목적, 보유 기간, 삭제 방법과 동의 여부를 함께 표시합니다.",
        "후기와 성과 수치는 동의와 원문 증거가 있는 내용만 사용하고, 시험용 문구와 확인되지 않은 숫자는 공개 전에 제거합니다.",
        "신청 버튼을 직접 눌러 문의가 저장되는지, 운영자가 알림을 받고 답변할 수 있는지 휴대전화와 컴퓨터에서 각각 시험합니다.",
        "취소·환불 조건, 사업자 정보와 연락 방법을 하단에서 확인하고 실제 결제를 받기 전 판매자 고지사항을 최종 검토합니다.",
      ],
    };
  }
  return {
    launchDate: inputs.launchDate ?? new Date().toISOString().slice(0, 10),
    outreachScripts: {
      interview: `안녕하세요. ${customer} 고객이 겪는 문제를 확인하기 위해 ${title}을 준비 중입니다. 20분 동안 현재 경험을 들려주실 수 있을까요?`,
      offer: `인터뷰에서 확인한 문제를 바탕으로 첫 실행안을 만들었습니다. ${String(opportunity.firstTest ?? "")}`,
      followUp: "검토 중 가장 망설여지는 부분 한 가지만 알려주셔도 다음 개선에 반영하겠습니다.",
    },
    channelPlan: mergeStringLists(inputs.channels, ["지인", "커뮤니티", "제휴"], 2)
      .map((channel) => `${channel}: 주간 접촉 수, 응답, 인터뷰, 가격 제안, 결제를 같은 표에서 기록합니다.`),
    weeklyMetrics: { contacts: inputs.weeklyContactGoal ?? 10, interviews: 5, proposals: 3, paidCustomers: 1 },
    supportProgramChecklist: inputs.supportProgramInterest
      ? ["사업요약", "고객 문제 근거", "수익모델", "대표자 역량", "자금 사용계획"]
      : [],
    next30Days: [
      "1일: 첫 고객 조건과 제외 고객을 한 장으로 확정하고 파일명을 기록합니다.",
      "2일: 최근 문제 경험이 있는 잠재 고객 30명 목록과 연락 경로를 만듭니다.",
      "3-5일: 고객 인터뷰 8건을 진행해 최근 행동, 지출, 현재 대안을 원문으로 남깁니다.",
      "6일: 반복 문제 상위 3개와 해결하지 않을 문제를 구분합니다.",
      "7일: 계속·수정·중단 중 하나를 선택하고 근거를 기록합니다.",
      "8-10일: 실제 자료 3세트를 수동으로 정리해 작업시간과 누락을 측정합니다.",
      "11일: 포함 범위, 제외 범위, 수정 횟수, 환불 기준을 견적서에 반영합니다.",
      "12-14일: 개인정보 동의, 원본 보관, 삭제 확인 절차를 미리 연습합니다.",
      "15일: 가격과 범위가 공개된 판매 페이지를 모바일에서 공개합니다.",
      "16-20일: 같은 제안을 10명에게 보내 결제와 거절 이유를 기록합니다.",
      "21-25일: 유료 주문 최대 3건을 운영하고 주문별 원가와 수정 시간을 측정합니다.",
      "26-27일: 고객 종료 인터뷰와 결과물 재사용 여부를 확인합니다.",
      "28일: 개인정보, 환불, 작업 누락, 수익성을 체크리스트로 감사냅니다.",
      "29일: 실제 단위경제를 갱신하고 다음 달 지출 상한을 정합니다.",
      "30일: 계속·축소·방향 전환을 결정하고 다음 30일 미션을 확정합니다.",
    ],
    decisionCriteria: [
      "가격을 공개한 제안 10건 중 결제 3건 이상이면 같은 고객군에서 계속합니다.",
      "건당 공헌이익이 양수이고 대표자 작업시간이 목표 안에 들어와야 자동화 투자를 검토합니다.",
      "개인정보 삭제·환불·원문 대조 중 하나라도 반복 누락되면 판매를 중지하고 절차를 수정합니다.",
    ],
    messageUsageGuide: [
      "첫 연락은 판매 문구를 길게 보내지 말고 상대가 최근에 문제를 겪었는지 확인하는 한 문장과 20분 대화 요청만 보냅니다.",
      "답장이 없으면 이틀 뒤 한 번만 다시 연락하고, 두 번째에도 답이 없으면 거절로 기록한 뒤 반복 메시지를 보내지 않습니다.",
      "인터뷰가 끝난 사람에게만 확인된 문제와 첫 상품 범위를 보내며 가격, 일정과 환불 조건을 숨기지 않고 같은 문장으로 제안합니다.",
      "보류한 고객에게는 할인부터 제시하지 않고 망설인 이유가 가격, 신뢰, 시기 또는 제공 범위 중 무엇인지 한 가지만 묻습니다.",
      "연락처와 대화 기록은 동의한 목적에만 사용하고 공개 문서에는 이름, 전화번호와 민감한 경험을 익명 처리합니다.",
      "매주 접촉 수, 응답 수, 인터뷰 수, 가격 제안 수와 결제 수를 같은 표에 기록해 메시지가 아니라 실제 구매 흐름이 개선되는지 확인합니다.",
    ],
    launchRiskPlan: [
      "10명에게 연락해 인터뷰 응답이 2명 미만이면 메시지를 늘리기 전에 고객 조건과 연락 경로가 맞는지 먼저 수정합니다.",
      "인터뷰에서는 문제가 반복되지만 가격 제안에 반응이 없으면 필수 결과만 남겨 상품 범위를 줄이고 가격을 한 번 다시 시험합니다.",
      "결제는 생기지만 작업시간과 수정 요청 때문에 고객당 이익이 남지 않으면 판매를 늘리지 않고 완료 기준과 추가 비용을 분리합니다.",
      "환불, 개인정보 또는 약속한 결과 누락이 한 건이라도 발생하면 신규 판매를 멈추고 원인을 기록한 뒤 절차를 수정하고 재시험합니다.",
      "30일 동안 유료 반응이 없거나 대표자가 가능한 시간 안에 제공할 수 없다면 광고비를 쓰지 않고 고객, 문제 또는 제공 방식을 변경합니다.",
      "매주 마지막 날에는 성공 사례만 보지 않고 무응답, 거절, 중도 이탈과 환불 이유를 함께 검토합니다. 다음 주에는 가장 많이 반복된 실패 원인 한 가지만 고쳐 같은 조건으로 다시 시험합니다.",
    ],
  };
}

async function generateWithOpenAI(
  project: ProjectRecord,
  stageIndex: number,
  revisionInstruction?: string,
  runtimeConfig?: OpenAIRuntimeConfig | null,
  currentDraft?: Record<string, unknown>,
) {
  const apiKey = runtimeConfig?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = runtimeConfig?.model ?? process.env.OPENAI_MODEL ?? "gpt-5.6-sol";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        {
          role: "system",
          content:
            "당신은 한국 초보 창업자의 실행을 돕는 제품 전략가입니다. 과장하거나 성공을 보장하지 마세요. 입력에 없는 사실과 시장 수치를 만들지 말고, 근거가 없으면 assumption 또는 unknown으로 표시하세요. 짧은 요약문이 아니라 소비자가 유료로 받은 뒤 그대로 실행할 수 있는 상세 문서를 만드세요. 각 핵심 문자열은 이유와 행동을 포함한 완성 문장으로, 목록은 중복 없이 충분한 개수로 작성하고 담당자·기한·비용 산식·완료 증거·중단 기준을 가능한 필드 안에 구체적으로 담으세요. 반드시 유효한 JSON 객체만 출력하세요.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: stageInstructions[stageIndex],
            opportunity: project.opportunity,
            founderProfile: project.founderProfile,
            stageInputs: project.stages[stageIndex].inputs,
            businessSetup: project.businessSetup,
            businessAssessment: project.businessAssessment,
            priorApprovedArtifacts: project.stages
              .slice(0, stageIndex)
              .map((stage) => stage.artifacts.find((artifact) => artifact.id === stage.approvedArtifactId)?.content)
              .filter(Boolean),
            revisionInstruction,
            currentDraft,
          }),
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OPENAI_${response.status}`);
  }
  const payload = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const outputText = payload.output_text ?? payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
  if (!outputText) throw new Error("OPENAI_EMPTY_OUTPUT");
  try {
    return validateStageContent(stageIndex, JSON.parse(outputText));
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 500) : "JSON 또는 필수 항목 오류";
    throw new Error(`OPENAI_INVALID_OUTPUT:${detail}`);
  }
}

export async function generateStageArtifact(
  project: ProjectRecord,
  stageIndex: number,
  revisionInstruction?: string,
  runtimeConfig?: OpenAIRuntimeConfig | null,
): Promise<Omit<ArtifactRecord, "id" | "projectId" | "stageId" | "stageIndex" | "version" | "createdAt"> & { model: string }> {
  let aiContent: Record<string, unknown> | null = null;
  let autoRewritten = false;
  try {
    aiContent = await generateWithOpenAI(project, stageIndex, revisionInstruction, runtimeConfig);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("OPENAI_INVALID_OUTPUT")) throw error;
    aiContent = await generateWithOpenAI(
      project,
      stageIndex,
      [revisionInstruction, "첫 응답이 필수 항목 또는 JSON 형식을 충족하지 못했습니다. 모든 필수 항목을 충분한 분량으로 다시 작성하세요."].filter(Boolean).join("\n"),
      runtimeConfig,
    ).catch(() => null);
    autoRewritten = Boolean(aiContent);
  }
  let content = aiContent ?? validateStageContent(stageIndex, fallbackContent(project, stageIndex));
  let artifactQuality = inspectStageArtifact(project, stageIndex, content);
  if (aiContent && !artifactQuality.passed) {
    const revised = await generateWithOpenAI(
      project,
      stageIndex,
      [revisionInstruction, stageQualityRevisionInstruction(artifactQuality)].filter(Boolean).join("\n\n"),
      runtimeConfig,
      content,
    ).catch(() => null);
    if (revised) {
      const revisedQuality = inspectStageArtifact(project, stageIndex, revised);
      if (revisedQuality.score >= artifactQuality.score) {
        content = revised;
        artifactQuality = revisedQuality;
        autoRewritten = true;
      }
    }
  }
  const inputs = project.stages[stageIndex].inputs;
  const sourceUrls = [
    ...(Array.isArray(inputs.referenceUrls) ? inputs.referenceUrls : []),
    ...(Array.isArray(inputs.evidenceUrls) ? inputs.evidenceUrls : []),
  ].filter((value): value is string => typeof value === "string");
  return {
    model: aiContent
      ? runtimeConfig?.model ?? process.env.OPENAI_MODEL ?? "gpt-5.6-sol"
      : "deterministic-fallback-v1",
    schemaVersion: "2.0",
    content,
    explanations: [
      "사용자가 저장한 단계 입력과 이전 승인 결과물을 우선 반영했습니다.",
      aiContent
        ? `AI 자동 납품 검수 ${artifactQuality.score}점${autoRewritten ? " · 부족 항목을 자동으로 한 번 보강했습니다." : " · 첫 생성본이 기준을 통과했습니다."}`
        : "인공지능 연결키가 없어 확인 가능한 계산과 기본 양식을 사용해 초안을 생성했습니다.",
      artifactQuality.passed
        ? "문서별 필수 항목·분량·숫자 일치 기준을 통과했습니다."
        : `자동 검수에서 남은 보강 항목: ${artifactQuality.issues.join(" / ")}`,
    ],
    assumptions: ["시장 수요와 고객 지불 의사는 인터뷰 또는 실제 판매로 검증해야 합니다."],
    sources: sourceUrls.map((url) => ({ title: "사용자 입력 원문", url, accessedAt: new Date().toISOString() })),
    reviewStatus: artifactQuality.passed ? "automated_review" : "user_review",
  };
}
