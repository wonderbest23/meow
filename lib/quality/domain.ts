export type QualityFinding = {
  id: string;
  category: "calculation" | "consistency" | "legal" | "evidence" | "operations" | "security";
  severity: "blocker" | "warning" | "info";
  title: string;
  detail: string;
  action: string;
  blocksApproval: boolean;
  relatedStage: number | null;
};

export type LegalSourceDefinition = {
  id: string;
  name: string;
  authority: string;
  url: string;
  reviewIntervalDays: number;
  affectedModules: string[];
};

export type LegalSourceSnapshot = {
  sourceId: string;
  fingerprint: string | null;
  previousFingerprint: string | null;
  status: "baseline" | "unchanged" | "changed" | "unavailable";
  httpStatus: number | null;
  etag: string | null;
  lastModified: string | null;
  checkedAt: string;
  acknowledgedAt: string | null;
  error: string | null;
};

export type QualityAudit = {
  status: "passed" | "conditional" | "blocked";
  score: number;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  regressionScenarios: Array<{
    id: string;
    name: string;
    status: "passed" | "failed" | "not_applicable";
    detail: string;
  }>;
  findings: QualityFinding[];
  legalSources: Array<{
    definition: LegalSourceDefinition;
    snapshot: LegalSourceSnapshot | null;
    stale: boolean;
  }>;
  generatedAt: string;
  engineVersion: string;
};
