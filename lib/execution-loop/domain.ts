import { z } from "zod";

const count = z.number().int().min(0).max(1_000_000_000);
const money = z.number().finite().min(0).max(100_000_000_000_000);

export const executionExperimentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  type: z.enum(["interview", "outreach", "landing", "advertising", "offer", "sales"]),
  channel: z.enum(["direct", "referral", "community", "blog", "social", "search_ad", "display_ad", "offline", "partner", "landing"]),
  startedAt: z.string().date(),
  endedAt: z.string().date().or(z.literal("")),
  status: z.enum(["planned", "running", "completed"]),
  metrics: z.object({
    reached: count,
    impressions: count,
    clicks: count,
    landingVisitors: count,
    inquiries: count,
    interviews: count,
    proposals: count,
    purchases: count,
    refunds: count,
    refundAmount: money,
    revenue: money,
    adSpend: money,
    variableCost: money,
  }),
  evidenceUrl: z.string().url().or(z.literal("")),
  learning: z.string().trim().max(2000),
}).superRefine((value, context) => {
  if (value.metrics.clicks > value.metrics.impressions && value.metrics.impressions > 0) {
    context.addIssue({ code: "custom", path: ["metrics", "clicks"], message: "클릭 수는 노출 수보다 클 수 없습니다." });
  }
  if (value.metrics.purchases > value.metrics.proposals && value.metrics.proposals > 0) {
    context.addIssue({ code: "custom", path: ["metrics", "purchases"], message: "구매 수는 제안 수보다 클 수 없습니다." });
  }
  if (value.metrics.refunds > value.metrics.purchases) {
    context.addIssue({ code: "custom", path: ["metrics", "refunds"], message: "환불 수는 구매 수보다 클 수 없습니다." });
  }
  if (value.status === "completed" && !value.evidenceUrl) {
    context.addIssue({ code: "custom", path: ["evidenceUrl"], message: "완료한 실행에는 원본 자료나 화면 캡처의 인터넷 주소가 필요합니다." });
  }
});

export type ExecutionExperiment = z.infer<typeof executionExperimentSchema>;

export const executionHypothesisSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(["customer", "problem", "channel", "price"]),
  claim: z.string().trim().min(5).max(500),
  successCriterion: z.string().trim().min(5).max(500),
});

export type ExecutionHypothesis = z.infer<typeof executionHypothesisSchema>;

export const executionWorkspaceSchema = z.object({
  hypotheses: z.array(executionHypothesisSchema).min(4).max(20),
  experiments: z.array(executionExperimentSchema).max(500),
});

export type ExecutionWorkspace = z.infer<typeof executionWorkspaceSchema>;

export type HypothesisVerdict = {
  hypothesisId: string;
  category: ExecutionHypothesis["category"];
  verdict: "insufficient_data" | "promising" | "validated" | "invalidated";
  confidence: number;
  evidence: string[];
  nextAction: string;
};

export type ExecutionLoopAnalysis = {
  totals: ExecutionExperiment["metrics"];
  funnel: {
    clickThroughRate: number | null;
    visitorToInquiryRate: number | null;
    inquiryToProposalRate: number | null;
    proposalToPurchaseRate: number | null;
    visitorToPurchaseRate: number | null;
    refundRate: number | null;
  };
  calibratedFinancials: {
    observedAveragePrice: number | null;
    observedVariableCostPerPurchase: number | null;
    customerAcquisitionCost: number | null;
    observedContributionPerPurchase: number | null;
    observedContributionMarginRate: number | null;
    observedBreakEvenUnits: number | null;
    netRevenue: number;
  };
  verdicts: HypothesisVerdict[];
  bestChannel: {
    channel: ExecutionExperiment["channel"];
    purchases: number;
    revenue: number;
    acquisitionCost: number | null;
  } | null;
  confidenceScore: number;
  warnings: string[];
  recommendedActions: string[];
  generatedAt: string;
  modelVersion: string;
};
