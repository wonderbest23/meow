import { calculateFinancialAnalysis } from "../business/financial-engine";
import {
  landingPublicationIssues,
  type LandingSiteRecord,
} from "../landing/domain";
import { marketEvidenceSchema } from "../market/domain";
import type { ProjectRecord } from "../service-domain";
import type {
  LegalSourceSnapshot,
  QualityAudit,
  QualityFinding,
} from "./domain";
import { legalSourceRegistry } from "./legal-monitor";

function finding(
  input: Omit<QualityFinding, "id">,
): QualityFinding {
  return { id: crypto.randomUUID(), ...input };
}

function difference(left: number | null, right: number | null) {
  if (left === null || right === null) return left === right ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(left - right);
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(strings);
  }
  return [];
}

export function runQualityAudit(
  project: ProjectRecord,
  legalSnapshots: LegalSourceSnapshot[],
  landing: LandingSiteRecord | null,
): QualityAudit {
  const findings: QualityFinding[] = [];
  const regressions: QualityAudit["regressionScenarios"] = [];
  const trustedMarketEvidence = (project.marketWorkspace?.evidence ?? []).filter((item) => {
    const parsed = marketEvidenceSchema.safeParse(item);
    return parsed.success && parsed.data.verification === "verified";
  });

  if (
    project.opportunity.evidenceStatus !== "verified" &&
    ((Number(project.opportunity.market) || 0) > 0 || (Number(project.opportunity.novelty) || 0) > 0)
  ) {
    findings.push(finding({
      category: "evidence",
      severity: "blocker",
      title: "검증되지 않은 시장·새로움 점수가 남아 있습니다",
      detail: "공식 근거가 없는 생성 점수를 실제 시장 판단처럼 사용할 수 없습니다.",
      action: "기회를 다시 생성해 시장·새로움은 미검증 상태로 저장하세요.",
      blocksApproval: true,
      relatedStage: 0,
    }));
  }

  if (!project.businessSetup || !project.businessAssessment) {
    findings.push(finding({
      category: "calculation",
      severity: "blocker",
      title: "사업 조건·재무 분석 누락",
      detail: "사업 유형과 재무 입력이 없어 이후 문서의 계산 근거를 검증할 수 없습니다.",
      action: "1단계에서 사업 조건과 손익분기점을 저장하세요.",
      blocksApproval: true,
      relatedStage: 0,
    }));
    regressions.push({ id: "financial-recalculation", name: "재무 엔진 재계산 일치", status: "failed", detail: "재무 입력이 없습니다." });
  } else {
    const recalculated = calculateFinancialAnalysis(project.businessSetup.financial);
    const stored = project.businessAssessment.financial;
    const checks: Array<[string, number | null, number | null]> = [
      ["판매가", recalculated.grossPrice, stored.grossPrice],
      ["변동비", recalculated.variableCostPerUnit, stored.variableCostPerUnit],
      ["공헌이익", recalculated.contributionPerUnit, stored.contributionPerUnit],
      ["월 고정비", recalculated.monthlyFixedCost, stored.monthlyFixedCost],
      ["손익분기 판매 수량", recalculated.breakEvenUnits, stored.breakEvenUnits],
      ["총 필요자금", recalculated.totalFundingNeed, stored.totalFundingNeed],
    ];
    const mismatches = checks.filter(([, expected, actual]) => difference(expected, actual) > 1);
    if (mismatches.length) {
      findings.push(finding({
        category: "calculation",
        severity: "blocker",
        title: "저장된 재무 결과가 현재 입력과 다릅니다",
        detail: mismatches.map(([name]) => name).join(", "),
        action: "사업 조건을 다시 저장해 모든 재무 결과를 재계산하세요.",
        blocksApproval: true,
        relatedStage: 2,
      }));
    }
    if (stored.contributionPerUnit <= 0) {
      findings.push(finding({
        category: "calculation",
        severity: "blocker",
        title: "판매할수록 손실이 발생합니다",
        detail: `고객당 공헌이익이 ${stored.contributionPerUnit.toLocaleString("ko-KR")}원입니다.`,
        action: "판매가·원가·수수료를 수정해 공헌이익을 양수로 바꾸세요.",
        blocksApproval: true,
        relatedStage: 2,
      }));
    }
    regressions.push({
      id: "financial-recalculation",
      name: "재무 엔진 재계산 일치",
      status: mismatches.length ? "failed" : "passed",
      detail: mismatches.length ? `${mismatches.length}개 계산값 불일치` : "핵심 재무 6개 값이 재계산 결과와 일치합니다.",
    });

    const pricingStage = project.stages[2];
    const stageTwo = pricingStage?.artifacts.find(
      (artifact) => artifact.id === pricingStage.approvedArtifactId,
    )?.content;
    const artifactBep = typeof stageTwo?.breakEvenCustomers === "number" ? stageTwo.breakEvenCustomers : null;
    const artifactFunding = typeof stageTwo?.totalFundingNeedWon === "number" ? stageTwo.totalFundingNeedWon : null;
    const artifactMismatch =
      stageTwo && (
        difference(artifactBep, stored.breakEvenUnits) > 0 ||
        difference(artifactFunding, stored.totalFundingNeed) > 1
      );
    if (artifactMismatch) {
      findings.push(finding({
        category: "consistency",
        severity: "blocker",
        title: "상품 문서와 재무 엔진 값이 다릅니다",
        detail: "상품·가격 문서의 손익분기점 또는 필요자금이 최신 사업 조건과 일치하지 않습니다.",
        action: "3단계 결과물을 최신 재무 입력으로 다시 생성하세요.",
        blocksApproval: true,
        relatedStage: 2,
      }));
    }
    regressions.push({
      id: "artifact-financial-consistency",
      name: "상품 문서·재무 단일 소스",
      status: !stageTwo ? "not_applicable" : artifactMismatch ? "failed" : "passed",
      detail: !stageTwo ? "상품 문서가 아직 없습니다." : artifactMismatch ? "손익분기점 또는 필요자금 불일치" : "최신 재무 결과와 일치합니다.",
    });
  }

  const unsafePatterns = [
    /무조건\s*성공/i,
    /수익\s*(을\s*)?보장/i,
    /완벽\s*보장/i,
    /업계\s*1위/i,
    /100%\s*(성공|수익|보장)/i,
  ];
  const brandArtifact = project.stages[3]?.artifacts[0]?.content;
  const landingArtifact = project.stages[4]?.artifacts[0]?.content;
  const publicClaims = [
    ...(brandArtifact ? strings({
      promise: brandArtifact.promise,
      slogans: brandArtifact.slogans,
    }) : []),
    ...(landingArtifact ? strings({
      blocks: landingArtifact.blocks,
      legalNotice: landingArtifact.legalNotice,
    }) : []),
    ...(landing ? [
      landing.draft.headline,
      landing.draft.subheadline,
      ...landing.draft.benefits.flatMap((item) => [item.title, item.description]),
    ] : []),
  ];
  const unsafeClaims = publicClaims.filter((claim) => unsafePatterns.some((pattern) => pattern.test(claim)));
  if (unsafeClaims.length) {
    findings.push(finding({
      category: "legal",
      severity: "blocker",
      title: "근거 없는 성과 보장 표현",
      detail: unsafeClaims.slice(0, 3).join(" / "),
      action: "검증되지 않은 보장·1위·100% 표현을 제거하세요.",
      blocksApproval: true,
      relatedStage: 4,
    }));
  }
  regressions.push({
    id: "prohibited-public-claims",
    name: "공개 문구 금지표현 검사",
    status: unsafeClaims.length ? "failed" : "passed",
    detail: unsafeClaims.length ? `${unsafeClaims.length}개 고위험 표현 발견` : "고위험 보장 표현이 없습니다.",
  });

  const brokenApprovals = project.stages.filter((stage) =>
    stage.approvedArtifactId &&
    !stage.artifacts.some((artifact) => artifact.id === stage.approvedArtifactId),
  );
  if (brokenApprovals.length) {
    findings.push(finding({
      category: "consistency",
      severity: "blocker",
      title: "승인 결과물 참조가 손상되었습니다",
      detail: `${brokenApprovals.length}개 단계의 승인 ID가 실제 결과물에 존재하지 않습니다.`,
      action: "손상된 단계 결과물을 다시 생성하고 승인하세요.",
      blocksApproval: true,
      relatedStage: null,
    }));
  }
  regressions.push({
    id: "approved-artifact-references",
    name: "승인 결과물 참조 무결성",
    status: brokenApprovals.length ? "failed" : "passed",
    detail: brokenApprovals.length ? "승인 참조 손상" : "모든 승인 참조가 유효합니다.",
  });

  if (project.businessAssessment?.hardBlockCount) {
    findings.push(finding({
      category: "legal",
      severity: "blocker",
      title: "인허가 선행 확인이 남아 있습니다",
      detail: `${project.businessAssessment.hardBlockCount}개 고위험 인허가 항목이 있습니다.`,
      action: "관할기관 확인과 증빙을 운영 체크리스트에 저장하세요.",
      blocksApproval: true,
      relatedStage: 5,
    }));
  }
  if (!project.operationsAssessment) {
    findings.push(finding({
      category: "operations",
      severity: "blocker",
      title: "운영 준비 판정이 없습니다",
      detail: "인허가·환불·개인정보·실주문 리허설의 완료 여부를 검증할 수 없습니다.",
      action: "6단계 영업 운영 준비서를 저장하세요.",
      blocksApproval: true,
      relatedStage: 5,
    }));
  } else if (project.operationsAssessment.hardBlockers.length) {
    findings.push(finding({
      category: "operations",
      severity: "blocker",
      title: "오픈 준비 필수 증빙이 부족합니다",
      detail: `${project.operationsAssessment.hardBlockers.length}개 운영 차단 항목이 남아 있습니다.`,
      action: "영업 운영 준비서에서 필수 항목의 증빙을 완료하세요.",
      blocksApproval: true,
      relatedStage: 5,
    }));
  }
  if (trustedMarketEvidence.length === 0) {
    findings.push(finding({
      category: "evidence",
      severity: "blocker",
      title: "검증된 시장 근거가 없습니다",
      detail: "공식 자동 조회 원문, 수집 시각, 위변조 확인값이 있는 시장 자료가 없습니다.",
      action: "공식 데이터 연동으로 시장 근거를 수집하세요.",
      blocksApproval: true,
      relatedStage: 5,
    }));
  }
  const customerEvidenceCount = (project.marketWorkspace?.evidence ?? []).filter(
    (item) => item.sourceType === "customer_interview" && item.verification !== "needs_review",
  ).length;
  if (customerEvidenceCount === 0) {
    findings.push(finding({
      category: "evidence",
      severity: "blocker",
      title: "실제 고객 인터뷰 근거가 없습니다",
      detail: "고객 문제·현재 대안·지불 행동을 확인한 기록이 없습니다.",
      action: "실제 인터뷰 또는 유료 제안 결과를 근거로 저장하세요.",
      blocksApproval: true,
      relatedStage: 5,
    }));
  }
  if (!project.businessPlan?.submissionReady) {
    findings.push(finding({
      category: "evidence",
      severity: "blocker",
      title: "K-Startup 제출 필수항목이 남아 있습니다",
      detail: project.businessPlan?.blockingItems.join(" / ") || "K-Startup 작성 초안이 없거나 최신 상태가 아닙니다.",
      action: "고객 문제·해결 방법·성장 전략·팀 구성과 증빙을 모두 채우세요.",
      blocksApproval: true,
      relatedStage: 5,
    }));
  }
  const demoPayload = JSON.stringify({
    opportunity: project.opportunity,
    marketWorkspace: project.marketWorkspace,
    operationsWorkspace: project.operationsWorkspace,
  });
  if (/(?:example\.com|테스트\s*후보|테스트로\s*\d+)/i.test(demoPayload)) {
    findings.push(finding({
      category: "consistency",
      severity: "blocker",
      title: "테스트·예시 데이터가 결과물에 포함되어 있습니다",
      detail: "예시 인터넷 주소 또는 시험용 주소는 실제 증빙으로 사용할 수 없습니다.",
      action: "테스트 값을 삭제하고 실제 원문과 현장 정보로 교체하세요.",
      blocksApproval: true,
      relatedStage: 5,
    }));
  }
  if (landing) {
    const landingIssues = landingPublicationIssues(landing.draft);
    if (landingIssues.length) {
      findings.push(finding({
        category: "legal",
        severity: "blocker",
        title: "판매 페이지의 필수 안내가 부족합니다",
        detail: landingIssues.join(" / "),
        action: "판매 페이지 편집 화면에서 개인정보·사업자·거래조건을 보완하세요.",
        blocksApproval: true,
        relatedStage: 4,
      }));
    }
  }
  if (project.executionAnalysis && project.executionAnalysis.confidenceScore < 50) {
    findings.push(finding({
      category: "evidence",
      severity: "warning",
      title: "실행 데이터 표본이 부족합니다",
      detail: `실행 데이터 신뢰도가 ${project.executionAnalysis.confidenceScore}%입니다.`,
      action: "실제 인터뷰·제안·구매 표본과 원본 근거를 추가하세요.",
      blocksApproval: false,
      relatedStage: 5,
    }));
  }

  const snapshotMap = new Map(legalSnapshots.map((snapshot) => [snapshot.sourceId, snapshot]));
  const legalSources = legalSourceRegistry.map((definition) => {
    const snapshot = snapshotMap.get(definition.id) ?? null;
    const ageDays = snapshot
      ? Math.floor((Date.now() - new Date(snapshot.checkedAt).getTime()) / 86_400_000)
      : Number.POSITIVE_INFINITY;
    const stale = ageDays > definition.reviewIntervalDays;
    if (snapshot?.status === "changed") {
      findings.push(finding({
        category: "legal",
        severity: "blocker",
        title: `${definition.name} 원문 변경 감지`,
        detail: `${definition.authority} 원문의 ETag·수정일·크기 지문이 이전 확인과 달라졌습니다.`,
        action: "변경 내용을 검토해 규칙을 갱신한 뒤 변경 확인 처리를 하세요.",
        blocksApproval: true,
        relatedStage: null,
      }));
    } else if (!snapshot || stale || snapshot.status === "unavailable") {
      findings.push(finding({
        category: "legal",
        severity: "warning",
        title: `${definition.name} 최신성 확인 필요`,
        detail: !snapshot ? "아직 원문 기준선을 저장하지 않았습니다." : snapshot.status === "unavailable" ? "최근 원문 상태 확인에 실패했습니다." : `마지막 확인이 ${ageDays}일 전입니다.`,
        action: "법령 원문 상태 새로고침을 실행하세요.",
        blocksApproval: false,
        relatedStage: null,
      }));
    }
    return { definition, snapshot, stale };
  });

  const blockerCount = findings.filter((item) => item.severity === "blocker").length;
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  const infoCount = findings.filter((item) => item.severity === "info").length;
  const status: QualityAudit["status"] =
    blockerCount > 0 ? "blocked" : warningCount > 0 ? "conditional" : "passed";
  const score = Math.max(0, 100 - blockerCount * 25 - warningCount * 7);
  return {
    status,
    score,
    blockerCount,
    warningCount,
    infoCount,
    regressionScenarios: regressions,
    findings,
    legalSources,
    generatedAt: new Date().toISOString(),
    engineVersion: "quality-gate-v1",
  };
}

export function assertStageApprovalQuality(audit: QualityAudit, stageIndex: number) {
  const blockers = audit.findings.filter(
    (item) =>
      item.blocksApproval &&
      (item.relatedStage === null || item.relatedStage === stageIndex),
  );
  if (blockers.length) {
    throw new Error(`QUALITY_GATE_BLOCKED:${blockers.map((item) => item.title).join(" / ")}`);
  }
}
