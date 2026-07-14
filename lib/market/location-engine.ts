import type {
  LocationCandidate,
  LocationScore,
  MarketAnalysis,
  MarketWorkspace,
} from "./domain";

function normalize(
  value: number | null,
  values: Array<number | null>,
  inverse = false,
): number | null {
  if (value === null) return null;
  const available = values.filter((item): item is number => item !== null);
  if (available.length < 2) return 50;
  const min = Math.min(...available);
  const max = Math.max(...available);
  if (max === min) return 50;
  const score = ((value - min) / (max - min)) * 100;
  return Math.round(inverse ? 100 - score : score);
}

function average(values: Array<number | null>, weights?: number[]): number | null {
  const present = values
    .map((value, index) => ({ value, weight: weights?.[index] ?? 1 }))
    .filter((item): item is { value: number; weight: number } => item.value !== null);
  if (!present.length) return null;
  const totalWeight = present.reduce((sum, item) => sum + item.weight, 0);
  return Math.round(
    present.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight,
  );
}

function occupancyCost(candidate: LocationCandidate) {
  return candidate.monthlyRent + candidate.monthlyMaintenance;
}

export function analyzeLocations(workspace: MarketWorkspace): MarketAnalysis {
  const candidates = workspace.locations;
  const monthlyCosts = candidates.map(occupancyCost);
  const expectedSales = candidates.map((item) => item.expectedMonthlySales);
  const footTraffic = candidates.map((item) => item.dailyFootTraffic);
  const residents = candidates.map((item) => item.residentPopulation);
  const workers = candidates.map((item) => item.workerPopulation);
  const competitors = candidates.map((item) => item.competitorCount);

  const locations: LocationScore[] = candidates.map((candidate, index) => {
    const monthlyOccupancyCost = monthlyCosts[index];
    const occupancyCostRate =
      candidate.expectedMonthlySales && candidate.expectedMonthlySales > 0
        ? Math.round((monthlyOccupancyCost / candidate.expectedMonthlySales) * 1000) / 10
        : null;
    const demandScore = average(
      [
        normalize(candidate.expectedMonthlySales, expectedSales),
        normalize(candidate.dailyFootTraffic, footTraffic),
        normalize(candidate.residentPopulation, residents),
        normalize(candidate.workerPopulation, workers),
        candidate.targetCustomerFitScore,
      ],
      [3, 2, 1, 1, 3],
    );
    const costScore = average([
      normalize(monthlyOccupancyCost, monthlyCosts, true),
      occupancyCostRate === null ? null : Math.max(0, Math.min(100, 100 - occupancyCostRate * 4)),
    ]);
    const competitionScore = normalize(candidate.competitorCount, competitors, true);
    const operationalScore = average([
      candidate.parkingScore,
      candidate.visibilityScore,
      candidate.buildingUseChecked ? 100 : 0,
      candidate.registryChecked ? 100 : 0,
      candidate.permitChecked ? 100 : 0,
      candidate.fieldVisitCompleted ? 100 : 0,
    ]);

    const missingMetrics: string[] = [];
    if (candidate.expectedMonthlySales === null) missingMetrics.push("추정 월매출");
    if (candidate.dailyFootTraffic === null) missingMetrics.push("유동인구");
    if (candidate.competitorCount === null) missingMetrics.push("경쟁점 수");
    if (candidate.targetCustomerFitScore === null) missingMetrics.push("목표고객 적합도");
    if (!candidate.sourceUrl || !candidate.observedAt) missingMetrics.push("출처·기준일");
    const totalEvidenceFields = 9;
    const presentEvidenceFields =
      Number(candidate.expectedMonthlySales !== null) +
      Number(candidate.dailyFootTraffic !== null) +
      Number(candidate.competitorCount !== null) +
      Number(candidate.targetCustomerFitScore !== null) +
      Number(Boolean(candidate.sourceUrl)) +
      Number(Boolean(candidate.observedAt)) +
      Number(candidate.buildingUseChecked) +
      Number(candidate.registryChecked) +
      Number(candidate.fieldVisitCompleted);
    const evidenceCompleteness = Math.round((presentEvidenceFields / totalEvidenceFields) * 100);

    const componentScores = [demandScore, costScore, competitionScore, operationalScore];
    const totalScore =
      evidenceCompleteness < 45 || componentScores.filter((value) => value !== null).length < 3
        ? null
        : average(componentScores, [4, 3, 1, 2]);
    const warnings: string[] = [];
    if (occupancyCostRate !== null && occupancyCostRate > 15) {
      warnings.push("예상 매출 대비 임차비 비중이 15%를 초과합니다.");
    }
    if (!candidate.buildingUseChecked) warnings.push("건축물 용도를 확인하지 않았습니다.");
    if (!candidate.registryChecked) warnings.push("등기부 권리관계를 확인하지 않았습니다.");
    if (!candidate.permitChecked) warnings.push("해당 장소에서 업종 인허가가 가능한지 확인하지 않았습니다.");
    if (!candidate.fieldVisitCompleted) warnings.push("현장 방문 검증이 필요합니다.");
    if (evidenceCompleteness < 45) warnings.push("근거가 부족해 종합점수를 계산하지 않았습니다.");

    return {
      candidateId: candidate.id,
      totalScore,
      demandScore,
      costScore,
      competitionScore,
      operationalScore,
      evidenceCompleteness,
      monthlyOccupancyCost,
      occupancyCostRate,
      warnings,
      missingMetrics,
    };
  });

  const now = Date.now();
  const staleEvidenceCount = workspace.evidence.filter((item) => {
    const observed = new Date(`${item.observedAt}T00:00:00Z`).getTime();
    return Number.isFinite(observed) && now - observed > 1000 * 60 * 60 * 24 * 180;
  }).length;
  const recommended =
    locations
      .filter((item) => item.totalScore !== null)
      .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))[0]?.candidateId ?? null;

  return {
    locations,
    selectedLocationId: workspace.selectedLocationId ?? recommended,
    verifiedEvidenceCount: workspace.evidence.filter((item) => item.verification === "verified").length,
    staleEvidenceCount,
    generatedAt: new Date().toISOString(),
    scoringVersion: "kr-location-evidence-v1",
    connectorStatus: {
      sbizStoreApi: process.env.DATA_GO_KR_API_KEY ? "configured" : "missing_key",
      kosisApi: process.env.KOSIS_API_KEY ? "configured" : "missing_key",
      seoulOpenData: process.env.SEOUL_OPEN_DATA_API_KEY ? "configured" : "missing_key",
    },
  };
}
