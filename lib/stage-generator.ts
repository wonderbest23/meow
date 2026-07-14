import type { ArtifactRecord, ProjectRecord } from "./service-domain";
import type { OpenAIRuntimeConfig } from "./openai/session-config";
import {
  inspectStageArtifact,
  stageQualityRevisionInstruction,
} from "./quality/stage-artifact";
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
  const customer = String(inputs.primaryCustomer ?? opportunity.customer ?? "초기 목표 고객");
  const oneLiner = String(opportunity.oneLiner ?? "");

  if (stageIndex === 0) {
    return {
      problem: `${oneLiner} 현재 고객은 관련 자료를 메신저, 사진첩, 수첩처럼 서로 다른 곳에 보관해 다시 찾고 활용하기 어렵습니다. 첫 단계에서는 기술 개발보다 실제로 반복되는 기록 손실과 현재 해결 비용을 확인합니다.`,
      customer,
      valueProposition: `${customer} 고객이 가진 흩어진 자료를 한 번에 정리하고, 다음에 해야 할 행동까지 확인 가능한 형태로 돌려줍니다. ${String(opportunity.model ?? "맞춤 서비스")} 방식의 핵심 결과 한 가지를 대표자가 수동으로 제공해 사용 의사와 지불 의사를 먼저 검증합니다.`,
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
    };
  }
  if (stageIndex === 1) {
    const interviewNotes = Array.isArray(inputs.interviewNotes) ? inputs.interviewNotes : [];
    return {
      primaryCustomer: customer,
      jobs: [
        `${customer} 고객이 흩어진 자료를 잃어버리기 전에 한곳에 모읍니다.`,
        "필요한 순간에 검색해 다시 사용할 수 있는 형태로 정리합니다.",
        "가족이나 동료에게 맥락과 사용법을 빠르게 전달합니다.",
        "중요한 기록에서 다음 행동과 확인할 사항을 놓치지 않습니다.",
      ],
      pains: [
        String(inputs.problemStatement ?? oneLiner),
        "사진·메모·대화가 서로 다른 앱에 있어 필요한 자료를 찾는 데 시간이 듭니다.",
        "정리 기준이 사람마다 달라 다른 가족이나 동료가 기록을 이어받기 어렵습니다.",
        "기록을 모으는 데서 끝나고 실제 행동이나 반복 사용으로 연결되지 않습니다.",
      ],
      currentAlternatives: ["사진첩과 메신저 검색", "노션·클라우드 폴더 직접 정리", "가족에게 구두로 전달", "정리를 미루거나 필요한 순간 다시 질문"],
      evidence: interviewNotes.length ? interviewNotes : ["고객 인터뷰 원문과 최근 행동 기록이 아직 필요합니다."],
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
    };
  }
  if (stageIndex === 2) {
    const verified = project.businessAssessment?.financial;
    const price = number(inputs.basePriceWon, 290000);
    const variableCost = number(inputs.variableCostWon, Math.round(price * 0.2));
    const fixedCost = number(inputs.monthlyFixedCostWon, 1000000);
    const contribution = Math.max(1, price - variableCost);
    return {
      tiers: [
        { name: "입문형", priceWon: Math.round(price * 0.45), outcome: "문제 진단과 실행 방향" },
        { name: "핵심형", priceWon: price, outcome: inputs.coreOutcome ?? "핵심 결과 완성" },
        { name: "맞춤형", priceWon: Math.round(price * 2.2), outcome: "맞춤 실행과 후속 관리" },
      ],
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
    return {
      nameCandidates: [
        `${title.split(" ").slice(0, 2).join(" ")} 랩`,
        `${title.split(" ").slice(0, 2).join(" ")} 프로젝트`,
        `모두의 ${title.split(" ")[0]}`,
        `이어봄 ${title.split(" ")[0]}`,
        `${title.split(" ")[0]} 아카이브`,
      ],
      promise: `${customer} 고객이 흩어진 기록을 다시 찾고 다른 사람과 이어 쓸 수 있는 실행 자료로 바꾸도록 돕습니다. 저장 자체보다 실제 재사용과 다음 행동이 확인되는 결과를 약속합니다.`,
      slogans: [`${title}의 새로운 기준`, "복잡한 기록을 이어 쓰는 지식으로", "오늘의 경험이 내일의 방법이 되도록", "사라지기 전에 기록하고, 필요할 때 꺼내 쓰세요", "모으는 기록에서 움직이는 기록으로"],
      tone: inputs.tone ?? "실용적인",
      keywords,
      prohibitedClaims: ["무조건 성공", "업계 1위", "완벽 보장", ...(Array.isArray(inputs.prohibitedKeywords) ? inputs.prohibitedKeywords : [])],
      selectionGuide: "후보마다 처음 들었을 때 이해되는지, 전화로 정확히 전달되는지, 검색 결과가 겹치지 않는지 확인합니다. 최종 선택 전 특허정보검색서비스에서 유사 상표를 찾고, 인터넷 주소와 사회관계망 계정 사용 가능 여부, 향후 다른 분야로 확장할 수 있는 이름인지 함께 검토합니다.",
      usageExamples: [
        "소개 문장에서는 고객 문제, 결과물, 제공 범위를 한 문장 안에 씁니다.",
        "판매 페이지에서는 확인되지 않은 인공지능 정확도나 성과 수치를 사용하지 않습니다.",
        "제안서와 견적서에서는 브랜드명보다 결과물·수정 횟수·납기·개인정보 범위를 먼저 명시합니다.",
      ],
    };
  }
  if (stageIndex === 4) {
    const defaultLegalNotice = "자동 정리 결과는 원문과 고객 검수를 거친 뒤 사용해야 하며 특정 성과를 보장하지 않습니다. 개인정보 수집 목적, 처리 범위, 보유 기간과 삭제 방법은 신청 전에 별도 동의받고 공개해야 합니다.";
    const suppliedLegalNotice = typeof inputs.legalNotice === "string" ? inputs.legalNotice.trim() : "";
    const defaultFaq = [
      { question: "어떤 자료부터 맡길 수 있나요?", answer: "첫 상품에서는 사진, 메모, 음성 전사처럼 합의한 한 종류의 자료만 받습니다. 민감정보와 원본 보관 기간은 접수 전에 별도 안내합니다." },
      { question: "인공지능이 내용을 임의로 만들지는 않나요?", answer: "원문에 없는 사실은 확정 내용으로 추가하지 않고 확인이 필요한 항목으로 표시합니다. 납품 전에 고객이 원문과 결과를 대조합니다." },
      { question: "수정은 몇 번 가능한가요?", answer: "기본 상품은 범위 안에서 1회 수정을 포함합니다. 새로운 자료 추가나 구조 변경은 별도 범위와 금액을 먼저 안내합니다." },
      { question: "개인정보와 원본은 언제 삭제하나요?", answer: "수집 목적과 보유 기간에 동의받고 납품·검수 종료 후 약정한 날짜에 삭제합니다. 삭제 완료 기록을 고객에게 전달합니다." },
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
        { type: "hero", headline: inputs.headline ?? oneLiner, subheadline: inputs.subheadline ?? "흩어진 기록을 다시 찾고 이어 쓸 수 있는 실행 자료로 정리합니다. 먼저 한 종류의 자료와 한 가지 결과만 작게 맡겨보세요.", cta: inputs.callToAction ?? "첫 기록 진단 신청" },
        { type: "problem", title: "기록은 많은데 필요할 때 찾기 어렵나요?", body: `${oneLiner} 사진, 대화, 수첩에 흩어진 경험은 정리 기준이 없으면 다른 사람이 이어받기 어렵고 실제 행동으로 연결되지 않습니다.` },
        { type: "solution", title: "원문을 확인하고 재사용 구조로 정리합니다", body: `${String(opportunity.model ?? "맞춤 방식")}으로 자료 수집, 사실 확인, 분류, 다음 행동 제안, 고객 검수 순서로 진행합니다. 원문에 없는 내용은 확인 필요로 표시합니다.` },
        { type: "process", title: "진행 순서", items: ["자료 종류와 제외정보 확인", "견적·보유기간·수정범위 확정", "초안 제작과 원문 대조", "고객 검수와 최종 납품", "원본 삭제 또는 반환 기록"] },
        { type: "offer", title: "첫 상품에 포함되는 것", items: ["자료 최대 30건 정리", "핵심 내용 분류", "다음 행동 확인표", "인쇄용 PDF와 수정 가능한 워드 문서", "범위 내 수정 1회"] },
        { type: "pricing", title: "결제 전 확정하는 조건", items: ["총금액과 부가세", "자료 수와 형식", "납기", "수정 횟수", "원본 보유·삭제일", "취소·환불 기준"] },
        ...(Array.isArray(inputs.proofItems) && inputs.proofItems.length
          ? [{ type: "proof", title: "확인 가능한 근거", items: inputs.proofItems }]
          : [{ type: "proof", title: "공개 전 확보할 근거", items: ["익명 처리한 결과물 예시", "작업 단계별 확인표", "개인정보 삭제 기록", "실제 고객 동의를 받은 후기"] }]),
        { type: "faq", items: faq },
        { type: "cta", headline: "전체 시스템을 만들기 전에 한 번의 실제 주문부터 검증하세요", button: inputs.callToAction ?? "첫 기록 진단 신청" },
      ],
      contact: { method: inputs.contactMethod ?? "신청폼", value: inputs.contactValue ?? "" },
      legalNotice: suppliedLegalNotice.length >= 60
        ? suppliedLegalNotice
        : [suppliedLegalNotice, defaultLegalNotice].filter(Boolean).join(" "),
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
