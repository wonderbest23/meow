import type { ProjectRecord } from "../service-domain";
import { deliveryDocumentMetrics } from "./metrics";

export type DeliveryVerificationStatus = "verified" | "input_based" | "assumption_based";

export type DeliveryDocumentQuality = {
  score: number;
  status: "ready" | "needs_work" | "missing";
  label: string;
  metrics: ReturnType<typeof deliveryDocumentMetrics>;
  checks: Array<{ id: string; label: string; passed: boolean; blocking: boolean }>;
  issues: string[];
  sourceCount: number;
  verifiedSourceCount: number;
  verificationStatus: DeliveryVerificationStatus;
  verificationLabel: string;
};

export type DeliveryPackageQuality = {
  score: number;
  status: "ready" | "conditional" | "blocked";
  label: string;
  readyCount: number;
  totalCount: number;
  blockerCount: number;
  warningCount: number;
  verifiedSourceCount: number;
  checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  actions: string[];
  generatedAt: string;
  engineVersion: string;
};

type QualityDocument = {
  id: string;
  title: string;
  markdown: string;
  source: "approved_artifact" | "server_package" | "missing";
};

type EvidenceRow = {
  key: string;
  title: string;
  sourceName: string;
  url: string;
  observedAt: string;
  status: "verified" | "input" | "reference" | "needs_review";
  note: string;
};

const standards: Record<string, {
  minCharacters: number;
  minSections: number;
  minTables: number;
  requiredTerms: string[];
}> = {
  brief: { minCharacters: 900, minSections: 6, minTables: 0, requiredTerms: ["고객", "검증", "완료"] },
  market: { minCharacters: 1_050, minSections: 7, minTables: 1, requiredTerms: ["고객", "대안", "근거", "확인"] },
  pricing: { minCharacters: 1_100, minSections: 7, minTables: 1, requiredTerms: ["가격", "손익", "가정", "원"] },
  brand: { minCharacters: 850, minSections: 6, minTables: 0, requiredTerms: ["이름", "소개", "금지"] },
  landing: { minCharacters: 1_450, minSections: 8, minTables: 0, requiredTerms: ["고객", "가격", "신청", "개인정보"] },
  launch: { minCharacters: 1_400, minSections: 7, minTables: 1, requiredTerms: ["30일", "완료", "중단", "결제"] },
  plan: { minCharacters: 2_300, minSections: 8, minTables: 2, requiredTerms: ["시장", "사업비", "팀", "출처"] },
  operations: { minCharacters: 1_900, minSections: 6, minTables: 2, requiredTerms: ["환불", "개인정보", "증빙", "영업"] },
  execution: { minCharacters: 1_300, minSections: 6, minTables: 1, requiredTerms: ["전환", "실제", "다음", "신뢰"] },
  grants: { minCharacters: 1_500, minSections: 5, minTables: 1, requiredTerms: ["공고", "자격", "증빙", "제출"] },
};

const dataCriticalDocuments = new Set(["market", "pricing", "plan", "operations", "execution", "grants"]);

function escapeTable(value: unknown) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function formatWon(value: number | null | undefined) {
  return value === null || value === undefined ? "추가 입력 필요" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function approvedArtifact(project: ProjectRecord, stageIndex: number) {
  const stage = project.stages[stageIndex];
  return stage?.artifacts.find((artifact) => artifact.id === stage.approvedArtifactId) ?? null;
}

function collectEvidence(project: ProjectRecord): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  for (const evidence of project.marketWorkspace?.evidence ?? []) {
    rows.push({
      key: `${evidence.sourceUrl}|${evidence.title}`,
      title: evidence.title,
      sourceName: evidence.sourceName,
      url: evidence.sourceUrl,
      observedAt: evidence.observedAt,
      status: evidence.verification === "verified"
        ? "verified"
        : evidence.verification === "user_supplied" ? "input" : "needs_review",
      note: evidence.note || `${evidence.metric}: ${evidence.value}${evidence.unit ? ` ${evidence.unit}` : ""}`,
    });
  }
  const opportunitySources = Array.isArray(project.opportunity.evidenceSources)
    ? project.opportunity.evidenceSources
    : [];
  for (const source of opportunitySources) {
    if (!source || typeof source !== "object") continue;
    const item = source as Record<string, unknown>;
    rows.push({
      key: `${item.url}|${item.title}`,
      title: String(item.title ?? "추천 단계 참고자료"),
      sourceName: "추천 단계 참고자료",
      url: String(item.url ?? ""),
      observedAt: String(item.observedAt ?? ""),
      status: "reference",
      note: "사업 조건을 확정한 뒤 최신 원문을 다시 확인해야 합니다.",
    });
  }
  for (const stage of project.stages) {
    const artifact = stage.artifacts.find((item) => item.id === stage.approvedArtifactId);
    for (const source of artifact?.sources ?? []) {
      rows.push({
        key: `${source.url}|${source.title}`,
        title: source.title,
        sourceName: "사용자가 제공한 자료",
        url: source.url ?? "",
        observedAt: source.accessedAt ?? "",
        status: "input",
        note: "입력 원문은 자동으로 사실 확정하지 않고 작성 근거로만 사용합니다.",
      });
    }
  }
  for (const requirement of project.businessAssessment?.requirements ?? []) {
    rows.push({
      key: `${requirement.sourceUrl}|${requirement.title}`,
      title: requirement.title,
      sourceName: requirement.authority,
      url: requirement.sourceUrl,
      observedAt: project.businessAssessment?.generatedAt ?? "",
      status: "reference",
      note: requirement.reason,
    });
  }
  return [...new Map(rows.filter((row) => row.title || row.url).map((row) => [row.key, row])).values()];
}

function evidenceForDocument(documentId: string, rows: EvidenceRow[]) {
  if (["market", "plan", "grants"].includes(documentId)) return rows;
  if (["brief", "operations", "landing", "launch"].includes(documentId)) {
    return rows.filter((row) => row.status === "reference" || row.status === "input").slice(0, 10);
  }
  return rows.filter((row) => row.status === "verified" || row.status === "input").slice(0, 8);
}

function factLedger(project: ProjectRecord) {
  const setup = project.businessSetup;
  const financial = project.businessAssessment?.financial;
  const rows: Array<[string, string, string, string]> = [
    ["사업명", String(project.opportunity.title ?? project.title), "사용자 입력", "프로젝트에서 입력한 사업명"],
    ["목표 고객", String(project.opportunity.customer ?? "추가 입력 필요"), "사용자 입력", "추천 후 사용자가 선택한 고객"],
    ["사업 지역", setup?.region ?? "추가 입력 필요", setup ? "사용자 입력" : "추가 확인", "사업 조건 입력"],
    ["사업자 형태", setup?.legalForm ?? "추가 입력 필요", setup?.legalForm && setup.legalForm !== "undecided" ? "사용자 입력" : "추가 확인", "사업 조건 입력"],
    ["첫 상품 판매가", formatWon(financial?.grossPrice), financial ? "자동 계산" : "추가 확인", "저장된 가격과 세금 조건"],
    ["건당 변동비", formatWon(financial?.variableCostPerUnit), financial ? "자동 계산" : "추가 확인", "재료·수수료·작업비 입력"],
    ["건당 남는 금액", formatWon(financial?.contributionPerUnit), financial ? "자동 계산" : "추가 확인", "판매가 - 세금 - 건당 변동비"],
    ["월 손익분기점", financial?.breakEvenUnits === null || financial?.breakEvenUnits === undefined ? "추가 입력 필요" : `${financial.breakEvenUnits}건`, financial ? "자동 계산" : "추가 확인", "월 고정비 ÷ 건당 남는 금액"],
    ["총 필요자금", formatWon(financial?.totalFundingNeed), financial ? "자동 계산" : "추가 확인", "초기 준비비 + 운전자금"],
  ];
  return [
    "## 공통 숫자와 작성 기준",
    "",
    "> 아래 표의 자동 계산 값은 모든 결과물에서 같은 값을 사용합니다. 입력을 바꾸면 관련 문서를 다시 생성해야 합니다.",
    "",
    "| 항목 | 현재 값 | 상태 | 산출·입력 근거 |",
    "| --- | ---: | --- | --- |",
    ...rows.map((row) => `| ${row.map(escapeTable).join(" | ")} |`),
  ].join("\n");
}

function evidenceLedger(rows: EvidenceRow[]) {
  const statusLabel = {
    verified: "공식 원문 확인",
    input: "사용자 입력",
    reference: "공식 확인 경로",
    needs_review: "추가 확인 필요",
  } as const;
  if (rows.length === 0) {
    return [
      "## 출처와 확인 상태",
      "",
      "> 이 문서에는 아직 연결된 외부 자료가 없습니다. 시장 수치와 고객 반응은 확정 사실이 아니라 검증할 가정으로 사용합니다.",
      "",
      "| 근거 | 상태 | 자료·기관 | 기준일 | 적용 내용 | 원문 |",
      "| --- | --- | --- | --- | --- | --- |",
      "| E00 | 추가 확인 필요 | 연결된 자료 없음 | 확인 전 | 외부 사실과 시장 수치를 확정하지 않음 | 없음 |",
    ].join("\n");
  }
  return [
    "## 출처와 확인 상태",
    "",
    "> 문장에 외부 사실이나 시장 수치를 사용할 때는 아래 근거 번호를 함께 확인합니다. 공식 원문 확인 표시가 없는 항목은 확정 사실이 아닙니다.",
    "",
    "| 근거 | 상태 | 자료·기관 | 기준일 | 적용 내용 | 원문 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row, index) => `| E${String(index + 1).padStart(2, "0")} | ${statusLabel[row.status]} | ${escapeTable(`${row.title} · ${row.sourceName}`)} | ${escapeTable(row.observedAt || "확인 전")} | ${escapeTable(row.note)} | ${row.url ? `[열기](${row.url})` : "내부 기록"} |`),
  ].join("\n");
}

export function enhanceDeliveryBody(
  project: ProjectRecord,
  documentId: string,
  markdown: string,
) {
  const support: string[] = [];
  if (documentId === "market") {
    support.push([
      "## 시장 판단을 사실로 바꾸는 순서",
      "",
      "| 순서 | 확인할 내용 | 가장 쉬운 방법 | 완료 기준 |",
      "| --- | --- | --- | --- |",
      "| 1 | 고객이 실제로 겪은 문제 | 아는 사람이 없으면 공개 후기·질문 게시판에서 반복 표현을 먼저 모음 | 서로 다른 사람의 최근 사례 5건 이상 |",
      "| 2 | 현재 쓰는 대안 | 직접 해결, 경쟁 서비스, 지인 부탁, 포기 행동을 함께 기록 | 대안별 시간·가격·불편을 비교할 수 있음 |",
      "| 3 | 지불 의사 | 같은 범위와 가격을 공개한 제안을 전달 | 결제·거절·보류 이유를 구분해 기록 |",
      "| 4 | 시장 배경 | 국가통계포털·공공데이터·소상공인 상권정보에서 업종과 지역을 조회 | 원문 주소·발표일·적용 문장을 저장 |",
      "| 5 | 경쟁 강도 | 실제 경쟁사의 가격·후기·포함 범위를 확인 | 최소 3개 대안을 같은 항목으로 비교 |",
      "",
      "> 오늘 전부 하지 않아도 결과물은 유지됩니다. 새 근거가 들어오면 시장 판단과 사업계획서가 다음 생성본에서 함께 바뀝니다.",
    ].join("\n"));
  }
  if (["pricing", "plan", "operations", "execution", "grants"].includes(documentId)) {
    support.push(factLedger(project));
  }
  if (documentId === "pricing") {
    support.push([
      "## 가격을 확정하는 시험표",
      "",
      "| 시험 | 바꾸지 않을 것 | 관찰할 것 | 판단 기준 |",
      "| --- | --- | --- | --- |",
      "| 가격 3안 제시 | 고객과 제공 범위 | 선택 가격·거절 이유 | 싼 가격만 선택되면 범위와 신뢰 근거를 다시 설명 |",
      "| 유료 주문 운영 | 판매가 | 실제 작업시간·재료·수수료·수정·환불 | 건당 남는 금액이 0 이하이면 판매량 확대 중단 |",
      "| 포함 범위 비교 | 판매가 | 꼭 필요한 결과와 빼도 되는 업무 | 반복 요청만 기본 상품에 남김 |",
      "| 10건 후 재계산 | 계산식 | 실제 평균 원가와 처리 가능 수량 | 입력값을 실제값으로 바꾸고 모든 문서를 다시 생성 |",
    ].join("\n"));
  }
  if (documentId === "brand") {
    support.push([
      "## 이름·한 줄 소개 선택표",
      "",
      "| 확인 항목 | 고객에게 물을 질문 | 통과 기준 |",
      "| --- | --- | --- |",
      "| 처음 듣고 이해되는가 | 무엇을 해주는 곳으로 들리나요? | 목표 고객과 결과를 비슷하게 설명함 |",
      "| 말하고 기억하기 쉬운가 | 한 번 들은 이름을 다시 말해 주세요. | 발음과 철자를 크게 틀리지 않음 |",
      "| 다른 곳과 겹치지 않는가 | 검색·지도·사회관계망에서 같은 이름 확인 | 같은 업종의 강한 중복이 없음 |",
      "| 상표 위험을 확인했는가 | 특허정보검색서비스에서 유사 표장·지정상품 확인 | 최종 선택 전 검색 결과를 저장함 |",
      "| 여러 화면에서 같은가 | 홈페이지·견적서·소개서 이름 대조 | 브랜드명과 한 줄 소개가 모두 일치함 |",
      "",
      "선택 점수가 낮으면 새 이름을 많이 만들기보다 고객이 이해하지 못한 단어 한두 개를 먼저 바꿉니다.",
    ].join("\n"));
  }
  if (documentId === "landing") {
    support.push([
      "## 홈페이지 공개 전 확인표",
      "",
      "| 영역 | 확인할 내용 | 완료 증거 |",
      "| --- | --- | --- |",
      "| 첫 화면 | 누구를 위한 어떤 결과인지 한 번에 이해되는가 | 휴대전화 화면 캡처 |",
      "| 상품 | 포함·제외 범위, 가격, 납기, 수정 횟수가 있는가 | 최종 상품표 |",
      "| 신뢰 | 실제 근거만 사용하고 가상 후기·과장 수치를 뺐는가 | 근거 원문 연결 |",
      "| 신청 | 버튼을 누르면 실제 신청 방법으로 이어지는가 | 시험 신청 1건 |",
      "| 개인정보 | 수집 목적·항목·보유기간·문의처를 안내하는가 | 동의 문구와 처리 기록 |",
      "| 거래 조건 | 취소·환불·사업자 정보를 공개했는가 | 공개 페이지 하단 확인 |",
      "| 화면 | PC와 휴대전화에서 글자·표·버튼이 잘리지 않는가 | 두 화면 캡처 |",
      "| 수정 | 저장한 사업명·가격·연락처가 공개본에도 같은가 | 편집본과 공개본 대조 |",
    ].join("\n"));
  }
  if (documentId === "launch") {
    support.push([
      "## 30일을 네 번의 주간 결과로 나누기",
      "",
      "| 기간 | 한 가지 결과 | 완료 증거 | 다음 단계 기준 |",
      "| --- | --- | --- | --- |",
      "| 1주차 | 고객 문제와 현재 대안 확인 | 최근 사례·비용·거절 이유 기록 | 반복 문제가 없으면 고객 범위를 수정 |",
      "| 2주차 | 같은 범위의 수동 결과물 완성 | 작업시간·누락·수정 횟수 | 혼자 제공할 수 없으면 범위를 축소 |",
      "| 3주차 | 가격을 공개한 실제 제안 | 전달 수·응답·문의·결제 | 결제가 없으면 가격과 제안을 분리 시험 |",
      "| 4주차 | 실제 손익과 운영 위험 재계산 | 주문별 매출·원가·환불·증빙 | 손실·사고 위험이 크면 판매 확대 중단 |",
      "",
      "할 일을 모두 체크하는 것이 목표가 아닙니다. 매주 가장 중요한 결과 하나만 남기고, 못 한 항목은 다음 판단의 미확인 정보로 표시합니다.",
    ].join("\n"));
  }
  if (documentId === "execution") {
    support.push([
      "## 실행 숫자를 해석하는 규칙",
      "",
      "| 관찰 결과 | 의미 | 다음 행동 |",
      "| --- | --- | --- |",
      "| 접촉은 많고 응답이 없음 | 고객 대상 또는 첫 문장이 맞지 않을 가능성 | 고객군과 문제 문장을 각각 한 번씩 바꿔 비교 |",
      "| 문의는 있으나 제안으로 안 감 | 가격 전에 신뢰·범위·절차가 부족할 가능성 | 결과물 예시와 포함·제외 범위를 먼저 제시 |",
      "| 제안은 있으나 결제가 없음 | 가격, 시급성, 구매 결정자의 문제를 분리해야 함 | 같은 범위에서 가격만 달리하거나 결정자에게 다시 제안 |",
      "| 결제는 있으나 남는 돈이 없음 | 원가 또는 수정 범위를 잘못 계산함 | 판매 확대를 멈추고 실제 작업시간과 환불을 원가에 반영 |",
      "| 결제와 추천이 반복됨 | 같은 고객·경로에서 재현 가능성을 시험할 단계 | 예산을 소폭 늘리고 고객 1명 확보비용이 유지되는지 확인 |",
      "",
      "표본이 작으면 성공·실패로 단정하지 않습니다. 실제 결제와 원본 증빙이 늘어날수록 신뢰도와 다음 행동이 자동으로 바뀝니다.",
    ].join("\n"));
  }
  return [markdown.trim(), ...support].join("\n\n---\n\n");
}

export function appendDeliveryAssurance(
  project: ProjectRecord,
  documentId: string,
  markdown: string,
) {
  const evidence = evidenceForDocument(documentId, collectEvidence(project));
  const parts = [markdown.trim()];
  parts.push(evidenceLedger(evidence));
  parts.push([
    "## 이 문서를 안전하게 사용하는 법",
    "",
    "- **확인된 사실:** 공식 원문 확인 또는 사용자가 직접 입력한 내용입니다.",
    "- **자동 계산:** 저장된 가격·비용을 같은 계산식으로 처리한 값입니다.",
    "- **검증할 가정:** 아직 고객 행동이나 현장 자료로 확인되지 않은 제안입니다.",
    "- **추가 확인 필요:** 계약·신고·제출 전에 최신 공식 원문을 확인해야 합니다.",
    "- 실행 도우미를 완료하지 않아도 이 결과물은 사라지지 않습니다. 새 증빙을 추가하면 다음 생성본에 반영됩니다.",
  ].join("\n"));
  return parts.join("\n\n---\n\n");
}

export function evaluateDeliveryDocument(
  project: ProjectRecord,
  document: QualityDocument,
  bodyMarkdown: string,
): DeliveryDocumentQuality {
  if (document.source === "missing") {
    return {
      score: 0,
      status: "missing",
      label: "생성 필요",
      metrics: deliveryDocumentMetrics(document),
      checks: [],
      issues: ["승인되거나 생성된 원본이 없습니다."],
      sourceCount: 0,
      verifiedSourceCount: 0,
      verificationStatus: "assumption_based",
      verificationLabel: "근거 없음",
    };
  }
  const standard = standards[document.id] ?? standards.brief;
  const bodyMetrics = deliveryDocumentMetrics({ markdown: bodyMarkdown });
  const metrics = deliveryDocumentMetrics(document);
  const evidence = evidenceForDocument(document.id, collectEvidence(project));
  const verifiedSourceCount = evidence.filter((row) => row.status === "verified").length;
  const checks = [
    { id: "characters", label: `실행 설명 ${standard.minCharacters.toLocaleString("ko-KR")}자 이상`, passed: bodyMetrics.characters >= standard.minCharacters, blocking: true },
    { id: "sections", label: `핵심 항목 ${standard.minSections}개 이상`, passed: bodyMetrics.sections >= standard.minSections, blocking: true },
    { id: "tables", label: `계산·근거 표 ${standard.minTables}개 이상`, passed: metrics.tables >= standard.minTables, blocking: true },
    ...standard.requiredTerms.map((term) => ({ id: `term-${term}`, label: `${term} 내용 포함`, passed: document.markdown.includes(term), blocking: true })),
    { id: "demo", label: "시험용 자료 없음", passed: !/(?:example\.com|화면\s*예시|가상\s*사례|테스트\s*후보)/i.test(document.markdown), blocking: true },
    { id: "sources", label: "출처·확인 상태 표시", passed: document.markdown.includes("## 출처와 확인 상태"), blocking: true },
    { id: "facts", label: "사실·계산·가정 구분", passed: document.markdown.includes("검증할 가정") && document.markdown.includes("추가 확인 필요"), blocking: true },
  ];
  const failed = checks.filter((check) => !check.passed);
  const score = Math.max(0, Math.round(100 - failed.filter((check) => check.blocking).length * 13 - failed.filter((check) => !check.blocking).length * 4));
  const verificationStatus: DeliveryVerificationStatus = verifiedSourceCount > 0
    ? "verified"
    : evidence.length > 0 ? "input_based" : "assumption_based";
  const verificationLabel = verificationStatus === "verified"
    ? `공식 근거 ${verifiedSourceCount}건 확인`
    : verificationStatus === "input_based" ? "입력 자료 기반" : "가정 중심 초안";
  return {
    score,
    status: failed.some((check) => check.blocking) ? "needs_work" : "ready",
    label: failed.some((check) => check.blocking) ? "내용 보강 필요" : "납품 기준 통과",
    metrics,
    checks,
    issues: failed.map((check) => check.label),
    sourceCount: evidence.length,
    verifiedSourceCount,
    verificationStatus,
    verificationLabel,
  };
}

function financialConsistency(project: ProjectRecord) {
  const financial = project.businessAssessment?.financial;
  const pricing = approvedArtifact(project, 2)?.content;
  if (!financial || !pricing) return { passed: false, detail: "재무 계산 또는 승인된 상품 문서가 없습니다." };
  const mismatches = [
    pricing.breakEvenCustomers !== financial.breakEvenUnits ? "손익분기 고객 수" : "",
    pricing.totalFundingNeedWon !== financial.totalFundingNeed ? "총 필요자금" : "",
    pricing.monthlyFixedCostWon !== financial.monthlyFixedCost ? "월 고정비" : "",
  ].filter(Boolean);
  const documents = [
    project.businessPlan?.markdown ?? "",
    project.grantPackage?.markdown ?? "",
  ].filter(Boolean);
  const amountChecks: Array<[string, number]> = [
    ["총 필요자금", financial.totalFundingNeed],
    ["월 고정비", financial.monthlyFixedCost],
    ["고객 판매가", financial.grossPrice],
  ];
  for (const [label, expected] of amountChecks) {
    const pattern = new RegExp(`${label}\\s*(?:[:：]|\\||은|는)?\\s*([\\d,]+)원`, "g");
    for (const markdown of documents) {
      const observed = [...markdown.matchAll(pattern)]
        .map((match) => Number(match[1].replaceAll(",", "")))
        .filter(Number.isFinite);
      const different = [...new Set(observed.filter((value) => Math.abs(value - expected) > 1))];
      if (different.length) {
        mismatches.push(`${label} 문서 표기(${different.map((value) => formatWon(value)).join(", ")} ≠ ${formatWon(expected)})`);
      }
    }
  }
  return {
    passed: mismatches.length === 0,
    detail: mismatches.length ? `${mismatches.join(", ")} 값이 서로 다릅니다.` : "가격·비용·손익분기점이 같은 계산 결과를 사용합니다.",
  };
}

export function evaluateDeliveryPackage(
  project: ProjectRecord,
  documents: Array<QualityDocument & { quality: DeliveryDocumentQuality }>,
): DeliveryPackageQuality {
  const financial = financialConsistency(project);
  const allPresent = documents.every((document) => document.source !== "missing");
  const allReady = documents.every((document) => document.quality.status === "ready");
  const noDemo = documents.every((document) => !/(?:example\.com|화면\s*예시|가상\s*사례|테스트\s*후보)/i.test(document.markdown));
  const uniqueIds = new Set(documents.map((document) => document.id)).size === documents.length;
  const verifiedSourceCount = Math.max(0, ...documents.map((document) => document.quality.verifiedSourceCount));
  const checks = [
    { id: "documents", label: "10종 결과물 존재", passed: allPresent && documents.length === 10, detail: `${documents.filter((document) => document.source !== "missing").length}/10개 생성` },
    { id: "depth", label: "문서별 내용 기준", passed: allReady, detail: allReady ? "모든 문서가 각기 다른 납품 기준을 통과했습니다." : `${documents.filter((document) => document.quality.status !== "ready").length}개 문서 보강 필요` },
    { id: "financial", label: "숫자 일치", passed: financial.passed, detail: financial.detail },
    { id: "identity", label: "문서 식별자 일치", passed: uniqueIds, detail: uniqueIds ? "중복되거나 빠진 문서 번호가 없습니다." : "중복 문서 번호가 있습니다." },
    { id: "demo", label: "시험용 자료 제거", passed: noDemo, detail: noDemo ? "실제 결과물에 시험용 문구가 없습니다." : "시험용 자료가 실제 결과물에 포함되어 있습니다." },
  ];
  const blockerCount = checks.filter((check) => !check.passed).length;
  const warningCount = documents.filter((document) => dataCriticalDocuments.has(document.id) && document.quality.verificationStatus !== "verified").length;
  const average = documents.length
    ? documents.reduce((sum, document) => sum + document.quality.score, 0) / documents.length
    : 0;
  const score = Math.max(0, Math.round(average - blockerCount * 8 - Math.min(10, warningCount * 2)));
  const status: DeliveryPackageQuality["status"] = blockerCount > 0 ? "blocked" : warningCount > 0 ? "conditional" : "ready";
  const actions = [
    ...documents.filter((document) => document.quality.status !== "ready").map((document) => `${document.title}: ${document.quality.issues.slice(0, 2).join(", ")}`),
    ...(financial.passed ? [] : [financial.detail]),
    ...(verifiedSourceCount > 0 ? [] : ["공식 원문 확인 자료가 아직 없어 시장·지원사업 판단은 가정으로 표시됩니다."]),
  ];
  return {
    score,
    status,
    label: status === "ready" ? "AI 납품 검수 통과" : status === "conditional" ? "문서 완성 · 근거 추가 권장" : "자동 보강 필요",
    readyCount: documents.filter((document) => document.quality.status === "ready").length,
    totalCount: documents.length,
    blockerCount,
    warningCount,
    verifiedSourceCount,
    checks,
    actions: [...new Set(actions)].slice(0, 12),
    generatedAt: new Date().toISOString(),
    engineVersion: "paid-delivery-quality-v2",
  };
}

export function packageQualityMarkdown(quality: DeliveryPackageQuality) {
  return [
    "# AI 자동 품질 확인서",
    "",
    `> ${quality.label} · ${quality.score}점 · 결과물 ${quality.readyCount}/${quality.totalCount}개 기준 통과`,
    "",
    "## 확인 결과",
    "",
    "| 확인 항목 | 결과 | 설명 |",
    "| --- | --- | --- |",
    ...quality.checks.map((check) => `| ${escapeTable(check.label)} | ${check.passed ? "통과" : "보강 필요"} | ${escapeTable(check.detail)} |`),
    "",
    "## 읽을 때 기억할 점",
    "",
    "- 자동 품질 검수는 문서 분량, 필수 내용, 계산 일치, 출처 상태와 시험용 데이터 포함 여부를 확인합니다.",
    "- 공식 원문 확인이 없는 시장 수치·고객 반응은 문서 안에서 검증할 가정으로 표시됩니다.",
    "- 세무·법률·인허가의 최종 판단을 대신하지 않으며, 해당 문서에는 공식 확인 경로와 확인할 항목을 제공합니다.",
    ...(quality.actions.length ? ["", "## 자동 검수가 찾은 보강 항목", "", ...quality.actions.map((action) => `- ${action}`)] : []),
  ].join("\n");
}
