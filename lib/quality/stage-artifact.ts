import type { ProjectRecord } from "../service-domain";

export type StageArtifactQuality = {
  score: number;
  passed: boolean;
  issues: string[];
  checkedAt: string;
};

const minimumTextLength = [780, 1_150, 950, 780, 1_250, 1_450] as const;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(strings);
  }
  return [];
}

function arrayLength(content: Record<string, unknown>, key: string) {
  return Array.isArray(content[key]) ? content[key].length : 0;
}

function recordSize(content: Record<string, unknown>, key: string) {
  const value = content[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>).length
    : 0;
}

export function inspectStageArtifact(
  project: ProjectRecord,
  stageIndex: number,
  content: Record<string, unknown>,
): StageArtifactQuality {
  const issues: string[] = [];
  const textLength = strings(content).join(" ").replace(/\s/g, "").length;
  const minimum = minimumTextLength[stageIndex] ?? 800;
  if (textLength < minimum) {
    issues.push(`실행 설명이 ${textLength.toLocaleString("ko-KR")}자로, 최소 ${minimum.toLocaleString("ko-KR")}자보다 짧습니다.`);
  }

  if (stageIndex === 0) {
    if (recordSize(content, "constraints") < 4) issues.push("예산·시간·제외 범위·보유 자산을 포함한 실행 조건이 부족합니다.");
    for (const key of ["problem", "valueProposition", "validationPlan", "day21Goal"]) {
      if (String(content[key] ?? "").trim().length < 80) issues.push(`${key} 설명에 이유·행동·완료 기준이 충분하지 않습니다.`);
    }
  }
  if (stageIndex === 1) {
    for (const [key, count] of [["jobs", 3], ["pains", 3], ["currentAlternatives", 3], ["interviewScript", 8], ["unknowns", 3]] as const) {
      if (arrayLength(content, key) < count) issues.push(`${key} 항목이 최소 ${count}개 필요합니다.`);
    }
  }
  if (stageIndex === 2) {
    if (arrayLength(content, "tiers") < 3) issues.push("서로 다른 가격의 상품 구성이 3개 필요합니다.");
    if (arrayLength(content, "assumptions") < 3) issues.push("가격과 원가에서 검증할 가정이 3개 이상 필요합니다.");
    if (arrayLength(content, "pricingTests") < 4) issues.push("실제 지불 의사를 확인할 가격 시험이 4개 이상 필요합니다.");
    const financial = project.businessAssessment?.financial;
    if (financial) {
      const breakEven = content.breakEvenCustomers;
      const funding = content.totalFundingNeedWon;
      if (breakEven !== financial.breakEvenUnits) issues.push("손익분기 고객 수가 저장된 재무 계산과 다릅니다.");
      if (funding !== financial.totalFundingNeed) issues.push("총 필요자금이 저장된 재무 계산과 다릅니다.");
    }
  }
  if (stageIndex === 3) {
    if (arrayLength(content, "nameCandidates") < 3) issues.push("비교 가능한 이름 후보가 3개 이상 필요합니다.");
    if (arrayLength(content, "slogans") < 3) issues.push("비교 가능한 한 줄 소개 문구가 3개 이상 필요합니다.");
    if (arrayLength(content, "usageExamples") < 3) issues.push("홈페이지·제안서·상담에서 쓸 문구 예시가 필요합니다.");
    if (String(content.selectionGuide ?? "").length < 80) issues.push("상표·인터넷 주소·검색 중복을 확인하는 이름 선택 절차가 부족합니다.");
  }
  if (stageIndex === 4) {
    if (arrayLength(content, "blocks") < 8) issues.push("첫 화면부터 신청 안내까지 판매 페이지 블록이 8개 이상 필요합니다.");
    if (String(content.legalNotice ?? "").length < 60) issues.push("개인정보·환불·성과 비보장 안내가 충분하지 않습니다.");
  }
  if (stageIndex === 5) {
    if (arrayLength(content, "channelPlan") < 2) issues.push("고객을 만날 경로별 실행안이 2개 이상 필요합니다.");
    if (arrayLength(content, "next30Days") < 12) issues.push("날짜별 30일 실행 항목이 12개 이상 필요합니다.");
    if (arrayLength(content, "decisionCriteria") < 3) issues.push("계속·수정·중단을 판단할 숫자 기준이 3개 이상 필요합니다.");
    if (recordSize(content, "weeklyMetrics") < 4) issues.push("접촉·대화·제안·결제를 함께 보는 주간 지표가 필요합니다.");
  }

  const score = Math.max(0, 100 - issues.length * 14);
  return {
    score,
    passed: issues.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export function stageQualityRevisionInstruction(quality: StageArtifactQuality) {
  return [
    "자동 납품 검수에서 아래 항목이 부족했습니다. 기존 입력값과 계산값을 바꾸지 말고, 부족한 설명과 항목만 구체화해 전체 JSON을 다시 작성하세요.",
    ...quality.issues.map((issue, index) => `${index + 1}. ${issue}`),
    "확인되지 않은 시장 수치나 고객 반응은 만들지 말고 반드시 검증할 가정 또는 추가 확인 필요로 표현하세요.",
  ].join("\n");
}
