import type { ProjectRecord } from "../service-domain";
import type { MarketAnalysis, MarketWorkspace } from "../market/domain";
import { archetypeLabels, legalFormLabels, needsPhysicalLocationAnalysis, workplaceLabels } from "../business/domain";

export type PlanFactStatus = "confirmed" | "calculated" | "assumption" | "unknown";

export type BusinessPlanSection = {
  id: string;
  title: string;
  status: PlanFactStatus;
  content: string[];
  sources: Array<{ name: string; url: string; observedAt?: string }>;
};

export type BusinessPlanDocument = {
  title: string;
  version: number;
  templateId: "k-startup-2026-draft-v1";
  generatedAt: string;
  readinessScore: number;
  submissionReady: boolean;
  blockingItems: string[];
  confirmedFactCount: number;
  unknownCount: number;
  sections: BusinessPlanSection[];
  markdown: string;
};

function text(value: unknown, fallback = "미확인") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function formatWon(value: number | null | undefined) {
  return value === null || value === undefined
    ? "미확인"
    : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function sectionMarkdown(section: BusinessPlanSection) {
  const statusLabel: Record<PlanFactStatus, string> = {
    confirmed: "확인된 사실",
    calculated: "입력값 기반 계산",
    assumption: "검증할 가정",
    unknown: "추가 확인 필요",
  };
  const citation = section.sources.length
    ? ` [근거 ${section.sources.map((_, index) => `S${index + 1}`).join(", ")}]`
    : "";
  const sources = section.sources.length
    ? `\n\n### 출처\n${section.sources.map((source, index) => `- **S${index + 1}** [${source.name}](${source.url})${source.observedAt ? ` · 기준일 ${source.observedAt}` : ""}`).join("\n")}`
    : "";
  return `## ${section.title}\n\n> 상태: ${statusLabel[section.status]}\n\n${section.content.map((item) => `- ${item}${citation && /(근거|시장|경쟁|입지|자료|요건)/.test(item) ? citation : ""}`).join("\n")}${sources}`;
}

export function generateBusinessPlan(
  project: ProjectRecord,
  workspace: MarketWorkspace,
  marketAnalysis: MarketAnalysis,
): BusinessPlanDocument {
  const opportunity = project.opportunity;
  const setup = project.businessSetup;
  const assessment = project.businessAssessment;
  const financial = assessment?.financial;
  const locationRelevant = setup ? needsPhysicalLocationAnalysis(setup.archetype) : true;
  const unknownFinancialLabels = (setup?.unknownFields ?? []).map((id) => id);
  const selectedLocation = workspace.locations.find(
    (candidate) => candidate.id === marketAnalysis.selectedLocationId,
  );
  const selectedLocationScore = marketAnalysis.locations.find(
    (score) => score.candidateId === marketAnalysis.selectedLocationId,
  );
  const evidenceSources = workspace.evidence
    .filter((item) => Boolean(item.sourceUrl))
    .map((item) => ({
      name: item.sourceName,
      url: item.sourceUrl,
      observedAt: item.observedAt,
    }));
  const verifiedEvidence = workspace.evidence.filter(
    (item) => item.verification === "verified",
  );
  const customerEvidence = workspace.evidence.filter(
    (item) => item.sourceType === "customer_interview",
  );
  const competitorEvidence = workspace.evidence.filter(
    (item) => item.sourceType === "competitor_check",
  );
  const approvedContent = (stageIndex: number) => {
    const stage = project.stages[stageIndex];
    return stage?.artifacts.find((item) => item.id === stage.approvedArtifactId)?.content ?? null;
  };
  const founderCapability = ["careerSummary", "experience", "teamCapabilities", "founderCapability"]
    .map((key) => project.founderProfile[key])
    .find((value) => typeof value === "string" && value.trim().length >= 10) as string | undefined;
  const containsDemoData = /(?:테스트|example\.com|테스트로\s*\d+)/i.test(
    JSON.stringify({ workspace, opportunity }),
  );
  const blockingItems = [
    ...(!setup || setup.legalForm === "undecided" ? ["사업자 형태와 사업장 조건 확정"] : []),
    ...(customerEvidence.length === 0 ? ["실제 고객 인터뷰 근거 1건 이상"] : []),
    ...(verifiedEvidence.length === 0 ? ["공식 자료 원문으로 확인된 시장 근거 1건 이상"] : []),
    ...(competitorEvidence.length === 0 ? ["실제 경쟁 대안·경쟁사 비교 근거"] : []),
    ...(!approvedContent(0) || !approvedContent(1) || !approvedContent(2)
      ? ["문제·고객·상품 단계 승인 결과"]
      : []),
    ...(!financial ? ["입력 근거가 있는 손익·사업비 계산"] : []),
    ...(unknownFinancialLabels.length ? [`추천값으로 임시 계산한 비용 ${unknownFinancialLabels.length}개 실제 확인`] : []),
    ...(!founderCapability ? ["대표자와 팀의 관련 경험·역량 증빙"] : []),
    ...(assessment?.hardBlockCount ? ["인허가 고위험 확인 완료"] : []),
    ...(containsDemoData ? ["화면 시험용·예시 자료 제거"] : []),
  ];

  const sections: BusinessPlanSection[] = [
    {
      id: "summary",
      title: "1. 일반현황",
      status: setup && setup.legalForm !== "undecided" ? "confirmed" : "unknown",
      content: [
        `사업명: ${text(opportunity.title)}`,
        `신청자 구분: ${setup?.legalForm === "undecided" || !setup ? "미확인" : legalFormLabels[setup.legalForm]}`,
        `사업 유형: ${setup ? archetypeLabels[setup.archetype] : "미확인"}`,
        `예정 지역·사업장: ${setup ? `${setup.region} · ${workplaceLabels[setup.workplaceType]}` : "미확인"}`,
      ],
      sources: [],
    },
    {
      id: "item-overview",
      title: "2. 창업아이템 개요",
      status: approvedContent(0) ? "assumption" : "unknown",
      content: [
        `창업아이템: ${text(opportunity.title)}`,
        `목표 고객: ${text(opportunity.customer)}`,
        `고객 문제·제안 가치: ${text(opportunity.oneLiner)}`,
        `제공 방식: ${text(opportunity.model)}`,
        `첫 검증: ${text(opportunity.firstTest, "실제 고객 인터뷰와 수동 제공 실험 필요")}`,
      ],
      sources: [],
    },
    {
      id: "problem",
      title: "3. 고객 문제와 필요성",
      status: customerEvidence.length && verifiedEvidence.length ? "confirmed" : "assumption",
      content: [
        customerEvidence.length
          ? `고객 인터뷰·현장 근거 ${customerEvidence.length}건이 기록되었습니다.`
          : "고객의 최근 행동·현재 대안·지출을 확인한 인터뷰 근거가 없습니다.",
        verifiedEvidence.length
          ? `공식 자료 원문으로 확인한 시장 근거: ${verifiedEvidence.map((item) => `${item.metric} ${item.value}${item.unit ? ` ${item.unit}` : ""}`).join(" / ")}`
          : "공식 자료 원문으로 확인된 시장규모·수요 근거가 없습니다.",
        competitorEvidence.length
          ? `경쟁 대안 비교 근거 ${competitorEvidence.length}건이 기록되었습니다.`
          : "경쟁사·대체 행동의 가격, 강점, 한계 비교가 필요합니다.",
        `개발 필요성 가설: ${text(opportunity.oneLiner)}`,
      ],
      sources: evidenceSources,
    },
    {
      id: "solution",
      title: "4. 해결 방법과 실행 가능성",
      status: approvedContent(0) && approvedContent(1) && approvedContent(2) ? "assumption" : "unknown",
      content: [
        `제품·서비스 구현 방식: ${text(opportunity.model)}`,
        `핵심 제공 결과: ${text(approvedContent(2)?.coreOutcome ?? opportunity.oneLiner)}`,
        `현재 단계: ${text(opportunity.stage)}`,
        `개발·구체화 검증: ${text(opportunity.firstTest)}`,
        competitorEvidence.length
          ? "경쟁 대안과 비교한 차별성 근거를 본문 표로 전환해야 합니다."
          : "차별성·경쟁력은 아직 가정이며 경쟁 대안 비교 후 작성해야 합니다.",
      ],
      sources: competitorEvidence
        .filter((item) => item.sourceUrl)
        .map((item) => ({ name: item.sourceName, url: item.sourceUrl, observedAt: item.observedAt })),
    },
    {
      id: "scale-up",
      title: "5. 성장 전략",
      status: financial ? "assumption" : "unknown",
      content: financial
        ? [
            `수익 방식: ${text(opportunity.revenue)} · 고객 판매가 ${formatWon(financial.grossPrice)}`,
            `고객 판매가: ${formatWon(financial.grossPrice)}, 건당 공헌이익: ${formatWon(financial.contributionPerUnit)} (${financial.contributionMarginRate}%)`,
            `월 손익분기점: ${financial.breakEvenUnits ?? "계산 불가"}건 · ${formatWon(financial.breakEvenRevenue)}`,
            "시장 진입전략: 첫 고객 실험 → 유료 사례 확보 → 반복 고객 경로 검증 순으로 구체화해야 합니다.",
            "전체 사업 일정과 투자유치·후속자금 계획은 별도 입력이 필요합니다.",
            ...financial.warnings.map((warning) => `재무 위험: ${warning}`),
          ]
        : ["수익 방식과 손익 계산이 없습니다.", "시장 진입·판매 경로·전체 실행 일정을 작성해야 합니다."],
      sources: [],
    },
    {
      id: "funding",
      title: "6. 사업비 집행계획",
      status: financial && unknownFinancialLabels.length === 0 ? "calculated" : financial ? "assumption" : "unknown",
      content: financial ? [
        `초기 투자비: ${formatWon(financial.initialInvestment)}`,
        `권장 운전자금: ${formatWon(financial.recommendedWorkingCapital)}`,
        `총 필요자금: ${formatWon(financial.totalFundingNeed)}`,
        `월 고정비: ${formatWon(financial.monthlyFixedCost)}`,
        ...(unknownFinancialLabels.length ? [`추천값으로 임시 계산한 항목 ${unknownFinancialLabels.length}개는 실제 견적 확인이 필요합니다.`] : []),
        "정부지원금과 자기부담금은 비목·산출근거·집행시기로 나누어 공식 양식에 옮겨야 합니다.",
      ] : ["비목별 사업비, 산출근거, 정부지원금·자기부담금 구분이 필요합니다."],
      sources: [],
    },
    {
      id: "team",
      title: "7. 대표자와 팀 구성",
      status: founderCapability ? "confirmed" : "unknown",
      content: founderCapability ? [
        `대표자 관련 역량: ${founderCapability}`,
        "역할별 보유역량과 부족역량, 채용·외부 협력 계획을 증빙과 함께 보완해야 합니다.",
      ] : [
        "대표자의 관련 경력·기술·성과가 입력되지 않았습니다.",
        "팀원별 담당 업무와 역량, 협력기관·파트너 현황이 필요합니다.",
      ],
      sources: [],
    },
    {
      id: "submission-check",
      title: "8. 제출 전 확인",
      status: blockingItems.length ? "unknown" : "calculated",
      content: [
        `현재 제출 차단 항목: ${blockingItems.length ? blockingItems.join(" / ") : "없음"}`,
        selectedLocation
          ? `입지 참고값: ${selectedLocation.name} · 월 점유비 ${formatWon(selectedLocationScore?.monthlyOccupancyCost)} · 입력 기반 점수 ${selectedLocationScore?.totalScore ?? "미산정"}`
          : locationRelevant ? "오프라인 사업이므로 입지·임대차·건축물 용도 확인이 필요합니다." : "온라인 중심 사업이므로 상권·입지 비교는 적용하지 않습니다. 사업자등록 주소의 사용 가능 여부만 별도로 확인합니다.",
        `핵심 위험: ${text(opportunity.risk)}`,
        ...(assessment?.requirements.map((item) => `[${item.severity === "required" ? "필수" : item.severity === "verify" ? "확인 필요" : "진행 차단"}] ${item.title}`) ?? []),
      ],
      sources: assessment
        ? [...new Map(assessment.requirements.map((item) => [item.sourceUrl, {
            name: `${item.authority} 공식 안내`,
            url: item.sourceUrl,
          }])).values()]
        : [],
    },
  ];

  const confirmedFactCount = sections.filter((section) =>
    ["confirmed", "calculated"].includes(section.status),
  ).length;
  const unknownCount = sections.filter((section) => section.status === "unknown").length;
  const readinessScore = Math.round(((8 - Math.min(8, blockingItems.length)) / 8) * 100);
  const submissionReady = blockingItems.length === 0;
  const title = `${text(opportunity.title)} 창업지원포털 사업계획서 작성 초안`;
  const financialTable = financial ? [
    "| 항목 | 현재 값 | 계산 기준 |",
    "| --- | ---: | --- |",
    `| 고객 판매가 | ${formatWon(financial.grossPrice)} | 사용자가 입력한 판매가와 부가세 조건 |`,
    `| 건당 변동비 | ${formatWon(financial.variableCostPerUnit)} | 재료·포장·배송·작업·결제수수료 |`,
    `| 건당 공헌이익 | ${formatWon(financial.contributionPerUnit)} | 부가세 제외 매출 - 건당 변동비 |`,
    `| 월 고정비 | ${formatWon(financial.monthlyFixedCost)} | 임차·인건비·도구·보험·홍보 등 월 비용 |`,
    `| 월 손익분기점 | ${financial.breakEvenUnits ?? "계산 불가"}건 · ${formatWon(financial.breakEvenRevenue)} | 월 고정비 ÷ 건당 공헌이익 |`,
    `| 초기 투자비 | ${formatWon(financial.initialInvestment)} | 계약·장비·재고·등록·첫 홍보비 |`,
    `| 권장 운전자금 | ${formatWon(financial.recommendedWorkingCapital)} | 월 고정비 × 입력한 준비 개월 |`,
    `| 총 필요자금 | ${formatWon(financial.totalFundingNeed)} | 초기 투자비 + 권장 운전자금 |`,
  ] : [
    "| 항목 | 현재 값 | 계산 기준 |",
    "| --- | ---: | --- |",
    "| 가격·비용·필요자금 | 추가 입력 필요 | 사업 조건 화면에 실제 가격과 비용을 입력해야 계산됩니다. |",
  ];
  const evidenceChecklist = [
    ["고객 문제", customerEvidence.length ? `${customerEvidence.length}건 저장` : "추가 확인", "익명 인터뷰 기록·동의 범위·최근 행동"],
    ["시장 자료", verifiedEvidence.length ? `${verifiedEvidence.length}건 공식 확인` : "추가 확인", "공식 원문·확인일·적용 문장"],
    ["경쟁 대안", competitorEvidence.length ? `${competitorEvidence.length}건 저장` : "추가 확인", "가격·포함 범위·고객이 선택하는 이유"],
    ["재무", financial ? "자동 계산 완료" : "추가 입력", "견적서·수수료표·임대 조건·원가표"],
    ["대표자 역량", founderCapability ? "입력 완료" : "추가 입력", "경력증명·포트폴리오·교육·성과 자료"],
    ["인허가", assessment?.hardBlockCount ? `${assessment.hardBlockCount}건 확인 필요` : assessment ? "고위험 항목 없음" : "추가 입력", "관할기관 답변·등록증·신고 확인"],
  ];
  const markdown = [
    `# ${title}`,
    "",
    `생성일: ${new Date().toLocaleDateString("ko-KR")}`,
    `작성 구조: 2026 창업지원포털(K-Startup)의 고객 문제 · 해결 방법 · 성장 전략 · 팀 구성 순서`,
    `제출 준비도: ${readinessScore}% · ${submissionReady ? "제출 전 최종 원문 대조 필요" : "제출 불가"}`,
    "",
    "> 이 문서는 공식 한글 문서 양식(HWPX)에 옮기기 전 작성 초안입니다. 공고별 원본 서식과 증빙목록을 대체하지 않습니다.",
    "",
    "## 문서 안의 표시",
    "",
    "| 표시 | 뜻 | 사용 방법 |",
    "| --- | --- | --- |",
    "| 확인된 사실 | 사용자 입력 또는 원문이 연결된 내용 | 제출 전 증빙 파일명과 일치 확인 |",
    "| 입력값 기반 계산 | 가격·비용을 같은 계산식으로 처리한 값 | 입력 수정 시 문서 다시 생성 |",
    "| 검증할 가정 | 고객 행동이나 실제 판매로 아직 확인하지 않은 판단 | 확정 표현으로 제출하지 않음 |",
    "| 추가 확인 필요 | 원문·증빙·담당기관 확인이 비어 있는 내용 | 제출 전에 반드시 보완 |",
    "",
    ...sections.map(sectionMarkdown),
    "## 9. 12개월 실행 일정",
    "",
    "| 기간 | 핵심 목표 | 완료 증거 | 계속·수정 기준 |",
    "| --- | --- | --- | --- |",
    `| 1개월 | ${text(opportunity.firstTest, "고객 문제와 첫 상품 검증")} | 인터뷰·제안·거절 이유 기록 | 문제 경험과 지불 의사가 없으면 고객 또는 범위 수정 |`,
    "| 2~3개월 | 유료 고객에게 같은 범위로 반복 제공 | 주문별 작업시간·원가·수정·환불 기록 | 건당 남는 금액이 0 이하이면 가격 또는 제공 범위 수정 |",
    "| 4~6개월 | 가장 효과적인 고객 경로 한 가지 집중 | 경로별 문의·제안·결제·고객획득비용 | 반복 결제 경로가 없으면 광고비 확대 중단 |",
    "| 7~9개월 | 운영 절차와 품질 기준 고정 | 접수·제공·검수·환불·개인정보 처리 기록 | 사고·누락이 반복되면 판매량 확대 중단 |",
    "| 10~12개월 | 지원사업·대출·제휴용 실적 정리 | 매출·원가·고객·협약·납품 증빙 묶음 | 실제 자료가 없는 성장 수치는 제출하지 않음 |",
    "",
    "## 10. 목적별 제출본으로 옮기는 방법",
    "",
    "| 제출 목적 | 이 문서에서 가져갈 부분 | 반드시 별도로 확인할 것 |",
    "| --- | --- | --- |",
    "| K-Startup 창업사업화 | 고객 문제, 해결 방법, 성장 전략, 팀 구성, 사업비 | 해당 연도 공고 원문·분량·지정 HWPX 서식 |",
    "| 정책자금·보증 상담 | 사업 개요, 대표자 역량, 매출 구조, 손익분기점, 필요자금 | 상환 계획·신용·담보·세금 체납·보증 제한 |",
    "| 제휴·입점 제안 | 목표 고객, 제안 가치, 제공 절차, 가격, 책임 범위 | 상대 기관의 계약·개인정보·정산 조건 |",
    "| 사업소개서·발표자료 | 한 줄 소개, 고객 문제, 해결 방법, 시장 근거, 수익모델, 12개월 일정 | 발표 시간에 맞춘 문장 축약과 증빙 화면 |",
    "",
    "## 11. 사업비와 손익 검산표",
    "",
    ...financialTable,
    "",
    "> 지원금 사용계획에는 위 총액을 그대로 복사하지 않습니다. 공고에서 인정하는 비목만 골라 수량 × 단가 × 개월의 산출근거로 다시 나눕니다.",
    "",
    "## 12. 제출 증빙 준비표",
    "",
    "| 주장 영역 | 현재 상태 | 제출 전 준비할 자료 |",
    "| --- | --- | --- |",
    ...evidenceChecklist.map((row) => `| ${row.join(" | ")} |`),
    "",
    "## 최종 제출 전 자동 확인",
    "",
    ...blockingItems.map((item) => `- [ ] ${item}`),
    ...(blockingItems.length ? [] : ["- [x] 현재 입력 기준의 필수 작성 항목이 채워졌습니다."]),
    "- [ ] 공고명·사업명·대표자명·금액 단위가 모든 파일에서 같은지 확인",
    "- [ ] 인용한 원문을 다시 열어 발표일과 최신 버전을 확인",
    "- [ ] 인터뷰·사진·계약서의 개인정보와 사용 동의를 확인",
    "- [ ] 공식 서식에 옮긴 뒤 표 잘림, 글자 수, 파일명, 제출 마감 시각을 확인",
  ].join("\n\n");

  return {
    title,
    version: 1,
    templateId: "k-startup-2026-draft-v1",
    generatedAt: new Date().toISOString(),
    readinessScore,
    submissionReady,
    blockingItems,
    confirmedFactCount,
    unknownCount,
    sections,
    markdown,
  };
}
