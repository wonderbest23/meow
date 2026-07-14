import assert from "node:assert/strict";
import { emptyBusinessSetup } from "../lib/business/domain";
import type { MarketEvidence } from "../lib/market/domain";
import {
  analyzeRegionalCoverage,
  detectProvince,
} from "../lib/regional-data/engine";

const routeCases = [
  ["서울 강남구", "seoul"],
  ["부산광역시 해운대구", "busan"],
  ["대구 중구", "daegu"],
  ["인천 연수구", "incheon"],
  ["광주 북구", "gwangju"],
  ["대전 유성구", "daejeon"],
  ["울산 남구", "ulsan"],
  ["세종특별자치시", "sejong"],
  ["경기도 수원시", "gyeonggi"],
  ["강원특별자치도 춘천시", "gangwon"],
  ["충북 청주시", "chungbuk"],
  ["충남 천안시", "chungnam"],
  ["전북특별자치도 전주시", "jeonbuk"],
  ["전남 순천시", "jeonnam"],
  ["경북 포항시", "gyeongbuk"],
  ["경남 창원시", "gyeongnam"],
  ["제주특별자치도 제주시", "jeju"],
] as const;

for (const [region, expected] of routeCases) {
  assert.equal(detectProvince(region), expected);
}
assert.equal(detectProvince("지역 미정"), "unknown");

const setup = emptyBusinessSetup("local_retail");
setup.region = "부산광역시";
setup.workplaceType = "commercial_lease";
const today = new Date().toISOString().slice(0, 10);
const evidenceMetrics = [
  "경쟁 점포 수",
  "유동 인구",
  "사업체 수",
  "추정 매출",
  "월세 임대료",
  "건축물 용도",
  "영업 인허가",
];
const evidence: MarketEvidence[] = evidenceMetrics.map((metric) => ({
  id: crypto.randomUUID(),
  sourceType: "official_report",
  title: `부산 ${metric}`,
  metric,
  value: "100",
  numericValue: 100,
  unit: "건",
  region: "부산광역시",
  sourceName: "공식 테스트 자료",
  sourceUrl: "https://www.data.go.kr/",
  observedAt: today,
  note: "",
  verification: "verified",
  verificationMethod: "official_api",
  sourceExcerpt: "공식 API 응답에서 지역 통계를 확인",
  retrievedAt: new Date().toISOString(),
  contentHash: "b".repeat(64),
  attestation: "d".repeat(64),
  isDemo: false,
}));

const complete = analyzeRegionalCoverage({ region: setup.region, setup, evidence });
assert.equal(complete.province, "busan");
assert.equal(complete.coverageScore, 100);
assert.equal(complete.freshRequiredCount, complete.requiredCount);
assert.ok(complete.warnings.some((warning) => warning.includes("서울 상권")));

const staleEvidence = structuredClone(evidence);
staleEvidence.find((item) => item.metric.includes("매출"))!.observedAt = "2024-01-01";
const stale = analyzeRegionalCoverage({ region: setup.region, setup, evidence: staleEvidence });
assert.ok(stale.coverageScore < 100);
assert.equal(stale.items.find((item) => item.kind === "sales")?.status, "verified_stale");

const digital = emptyBusinessSetup("digital_service");
digital.region = "경기도 성남시";
const digitalReport = analyzeRegionalCoverage({ region: digital.region, setup: digital, evidence: [] });
assert.ok(digitalReport.requiredCount < complete.requiredCount);
assert.equal(digitalReport.province, "gyeonggi");
assert.equal(digitalReport.localPortal.directRegionalPortal, true);

console.log(JSON.stringify({
  passed: 26,
  sample: {
    routedRegions: routeCases.length,
    busanCoverage: complete.coverageScore,
    staleCoverage: stale.coverageScore,
    digitalRequiredDatasets: digitalReport.requiredCount,
  },
}, null, 2));
