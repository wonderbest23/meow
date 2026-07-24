import { z } from "zod";
import type { BusinessAssessment, BusinessSetup } from "./business/domain";
import type { BusinessPlanDocument } from "./business-plan/generator";
import type { MarketAnalysis, MarketWorkspace } from "./market/domain";
import type {
  OperationsAssessment,
  OperationsPackage,
  OperationsWorkspace,
} from "./operations/domain";
import type {
  ExecutionLoopAnalysis,
  ExecutionWorkspace,
} from "./execution-loop/domain";
import type { QualityAudit } from "./quality/domain";
import type { GrantAnalysis, GrantPackage, GrantWorkspace } from "./grants/domain";
import type { LaunchMissionWorkspace } from "./launch-missions/domain";
import type { DraftPackageRun, ProjectRefinementVersion } from "./draft-package/domain";
import type { PresentationDeckDrafts } from "./delivery/presentation-deck";
import type { DocumentDrafts } from "./delivery/document-drafts";

export const stageStatuses = [
  "not_started",
  "collecting_input",
  "ready_to_generate",
  "generating",
  "ready_for_review",
  "revision_requested",
  "approved",
  "failed",
] as const;

export type StageStatus = (typeof stageStatuses)[number];

const optionalText = z.string().trim().max(2000).optional().default("");
const requiredText = z.string().trim().min(2).max(2000);
const urlList = z.array(z.string().url()).max(20).default([]);

export const stageInputSchemas = [
  z.object({
    goal: requiredText,
    availableHoursPerWeek: z.number().min(1).max(100),
    budgetWon: z.number().int().min(0).max(10_000_000_000),
    mustAvoid: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    existingAssets: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
    referenceUrls: urlList,
    notes: optionalText,
  }),
  z.object({
    primaryCustomer: requiredText,
    problemStatement: requiredText,
    interviewNotes: z.array(z.object({
      participant: z.string().trim().max(100).default("익명"),
      situation: requiredText,
      currentAlternative: optionalText,
      currentSpendWon: z.number().int().min(0).optional(),
      quote: optionalText,
    })).max(30).default([]),
    evidenceUrls: urlList,
    unknowns: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  }),
  z.object({
    coreOutcome: requiredText,
    deliveryMethod: requiredText,
    basePriceWon: z.number().int().min(1_000).max(1_000_000_000),
    variableCostWon: z.number().int().min(0).max(1_000_000_000),
    monthlyFixedCostWon: z.number().int().min(0).max(10_000_000_000),
    monthlyRevenueGoalWon: z.number().int().min(0).max(100_000_000_000),
    capacityPerMonth: z.number().int().min(1).max(1_000_000),
    assumptions: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  }),
  z.object({
    preferredKeywords: z.array(z.string().trim().min(1).max(50)).min(1).max(20),
    prohibitedKeywords: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    tone: z.enum(["친근한", "전문적인", "대담한", "차분한", "실용적인"]),
    preferredNames: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
    selectedName: z.string().trim().max(100).optional(),
    legalNameCheckRequired: z.boolean().default(true),
  }),
  z.object({
    headline: requiredText,
    subheadline: requiredText,
    callToAction: requiredText,
    contactMethod: z.enum(["이메일", "전화", "카카오톡", "신청폼"]),
    contactValue: z.string().trim().min(2).max(300),
    proofItems: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
    faq: z.array(z.object({ question: requiredText, answer: requiredText })).max(20).default([]),
    legalNotice: optionalText,
  }),
  z.object({
    launchDate: z.string().date(),
    channels: z.array(z.enum(["지인", "이메일", "SNS", "블로그", "커뮤니티", "제휴", "광고"])).min(1),
    leadNames: z.array(z.string().trim().min(1).max(100)).max(200).default([]),
    weeklyContactGoal: z.number().int().min(1).max(10_000),
    monthlyCustomerGoal: z.number().int().min(1).max(100_000),
    supportProgramInterest: z.boolean().default(false),
    notes: optionalText,
  }),
] as const;

export function parseStageInput(stageIndex: number, value: unknown) {
  const schema = stageInputSchemas[stageIndex];
  if (!schema) throw new Error("지원하지 않는 프로젝트 단계입니다.");
  return schema.parse(value);
}

export const opportunitySnapshotSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  oneLiner: z.string().min(1),
  sector: z.string().min(1),
  model: z.string().min(1),
  customer: z.string().min(1),
  capital: z.enum(["소액", "중간", "높음"]),
  launchTime: z.string().min(1),
  revenue: z.string().min(1),
  stage: z.string().min(1),
  riasec: z.array(z.string()).default([]),
  founder: z.array(z.string()).default([]),
  market: z.number(),
  novelty: z.number(),
  feasibility: z.number(),
  evidenceStatus: z.enum(["hypothesis", "verified"]).default("hypothesis"),
  evidenceSources: z.array(z.object({
    title: z.string().min(1),
    url: z.string().url(),
    observedAt: z.string().date(),
  })).default([]),
  regulation: z.number(),
  skills: z.array(z.string()).default([]),
  risk: z.string(),
  firstTest: z.string(),
  color: z.string(),
  match: z.number().optional(),
  reasons: z.array(z.string()).optional(),
  caution: z.string().optional(),
  scoreBreakdown: z.record(z.string(), z.number().nullable()).optional(),
});

export const createProjectSchema = z.object({
  opportunity: opportunitySnapshotSchema,
  founderProfile: z.record(z.string(), z.unknown()).default({}),
  paymentStatus: z.enum(["pending", "test_paid", "paid"]).default("test_paid"),
  initialStageInputs: stageInputSchemas[0].optional(),
});

export const revisionRequestSchema = z.object({
  instruction: z.string().trim().min(10).max(2000),
  artifactId: z.string().uuid(),
});

export type StageInput = ReturnType<typeof parseStageInput>;

export type ArtifactRecord = {
  id: string;
  projectId: string;
  stageId: string;
  stageIndex: number;
  version: number;
  schemaVersion: string;
  content: Record<string, unknown>;
  explanations: string[];
  assumptions: string[];
  sources: { title: string; url?: string; accessedAt?: string }[];
  reviewStatus: "draft" | "automated_review" | "user_review" | "approved" | "rejected";
  createdAt: string;
};

export type ProjectStageRecord = {
  id: string;
  projectId: string;
  stageIndex: number;
  status: StageStatus;
  inputs: Record<string, unknown>;
  inputVersion: number;
  approvedArtifactId: string | null;
  approvedAt: string | null;
  artifacts: ArtifactRecord[];
};

export type ProjectRecord = {
  id: string;
  title: string;
  status: "draft" | "active" | "completed" | "cancelled";
  paymentStatus: "pending" | "test_paid" | "paid" | "failed" | "refunded";
  packagePrice: number;
  activeStage: number;
  opportunity: Record<string, unknown>;
  founderProfile: Record<string, unknown>;
  businessSetup: BusinessSetup | null;
  businessAssessment: BusinessAssessment | null;
  marketWorkspace: MarketWorkspace | null;
  marketAnalysis: MarketAnalysis | null;
  businessPlan: BusinessPlanDocument | null;
  operationsWorkspace: OperationsWorkspace | null;
  operationsAssessment: OperationsAssessment | null;
  operationsPackage: OperationsPackage | null;
  executionWorkspace: ExecutionWorkspace | null;
  executionAnalysis: ExecutionLoopAnalysis | null;
  grantWorkspace: GrantWorkspace | null;
  grantAnalysis: GrantAnalysis | null;
  grantPackage: GrantPackage | null;
  launchMissionWorkspace?: LaunchMissionWorkspace | null;
  qualityAudit?: QualityAudit | null;
  draftPackageRun?: DraftPackageRun | null;
  refinementHistory?: ProjectRefinementVersion[];
  presentationDecks?: PresentationDeckDrafts | null;
  documentDrafts?: DocumentDrafts | null;
  stages: ProjectStageRecord[];
  createdAt: string;
  updatedAt: string;
};
