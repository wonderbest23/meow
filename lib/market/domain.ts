import { z } from "zod";

const nonNegative = z.number().finite().min(0).max(1_000_000_000_000);
const optionalMetric = z.number().finite().min(0).max(1_000_000_000_000).nullable();

const officialEvidenceHosts = [
  "data.go.kr",
  "kosis.kr",
  "sgis.kostat.go.kr",
  "golmok.seoul.go.kr",
  "work24.go.kr",
  "www.work24.go.kr",
  "k-startup.go.kr",
  "www.k-startup.go.kr",
  "bizinfo.go.kr",
  "www.bizinfo.go.kr",
  "sbiz.or.kr",
  "www.sbiz.or.kr",
  "semas.or.kr",
  "www.semas.or.kr",
] as const;

export function isOfficialEvidenceUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith(".go.kr") || officialEvidenceHosts.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

export const evidenceSourceTypes = [
  "official_api",
  "official_report",
  "field_research",
  "customer_interview",
  "competitor_check",
  "supplier_quote",
  "lease_quote",
  "permit_answer",
] as const;

export const marketEvidenceSchema = z.object({
  id: z.string().uuid(),
  sourceType: z.enum(evidenceSourceTypes),
  title: z.string().trim().min(2).max(200),
  metric: z.string().trim().min(2).max(100),
  value: z.string().trim().min(1).max(300),
  numericValue: optionalMetric,
  unit: z.string().trim().max(30).default(""),
  region: z.string().trim().max(100).default(""),
  sourceName: z.string().trim().min(2).max(150),
  sourceUrl: z.string().url().or(z.literal("")),
  observedAt: z.string().date(),
  note: z.string().trim().max(1000).default(""),
  verification: z.enum(["verified", "user_supplied", "needs_review"]),
  verificationMethod: z.enum(["none", "official_api"]).default("none"),
  sourceExcerpt: z.string().trim().max(2000).default(""),
  retrievedAt: z.string().datetime().or(z.literal("")).default(""),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).or(z.literal("")).default(""),
  attestation: z.string().trim().max(128).default(""),
  isDemo: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.verification === "verified") {
    const valid =
      value.verificationMethod === "official_api" &&
      isOfficialEvidenceUrl(value.sourceUrl) &&
      value.sourceExcerpt.length >= 10 &&
      Boolean(value.retrievedAt) &&
      Boolean(value.contentHash) &&
      Boolean(value.attestation) &&
      !value.isDemo;
    if (!valid) {
      context.addIssue({
        code: "custom",
        path: ["verification"],
        message: "공식 확인 완료로 표시하려면 자동 조회한 원문, 수집 시각, 위변조 확인값이 모두 있어야 합니다.",
      });
    }
  }
});

export type MarketEvidence = z.infer<typeof marketEvidenceSchema>;

export const locationCandidateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(2).max(300),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  areaSquareMeters: nonNegative,
  deposit: nonNegative,
  monthlyRent: nonNegative,
  monthlyMaintenance: nonNegative,
  keyMoney: nonNegative,
  interiorEstimate: nonNegative,
  expectedMonthlySales: optionalMetric,
  dailyFootTraffic: optionalMetric,
  residentPopulation: optionalMetric,
  workerPopulation: optionalMetric,
  competitorCount: optionalMetric,
  parkingScore: z.number().min(0).max(100).nullable(),
  visibilityScore: z.number().min(0).max(100).nullable(),
  targetCustomerFitScore: z.number().min(0).max(100).nullable(),
  buildingUseChecked: z.boolean(),
  registryChecked: z.boolean(),
  permitChecked: z.boolean(),
  fieldVisitCompleted: z.boolean(),
  sourceUrl: z.string().url().or(z.literal("")),
  observedAt: z.string().date().or(z.literal("")),
  note: z.string().trim().max(2000).default(""),
});

export type LocationCandidate = z.infer<typeof locationCandidateSchema>;

export const marketWorkspaceSchema = z.object({
  evidence: z.array(marketEvidenceSchema).max(100),
  locations: z.array(locationCandidateSchema).max(10),
  selectedLocationId: z.string().uuid().nullable(),
});

export type MarketWorkspace = z.infer<typeof marketWorkspaceSchema>;

export type LocationScore = {
  candidateId: string;
  totalScore: number | null;
  demandScore: number | null;
  costScore: number | null;
  competitionScore: number | null;
  operationalScore: number | null;
  evidenceCompleteness: number;
  monthlyOccupancyCost: number;
  occupancyCostRate: number | null;
  warnings: string[];
  missingMetrics: string[];
};

export type MarketAnalysis = {
  locations: LocationScore[];
  selectedLocationId: string | null;
  verifiedEvidenceCount: number;
  staleEvidenceCount: number;
  generatedAt: string;
  scoringVersion: string;
  connectorStatus: {
    sbizStoreApi: "configured" | "missing_key";
    kosisApi: "configured" | "missing_key";
    seoulOpenData: "configured" | "missing_key";
  };
};

export function emptyMarketWorkspace(): MarketWorkspace {
  return { evidence: [], locations: [], selectedLocationId: null };
}
