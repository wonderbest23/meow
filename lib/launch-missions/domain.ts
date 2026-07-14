import { z } from "zod";

export const launchMissionStatuses = ["todo", "doing", "blocked", "done"] as const;
export type LaunchMissionStatus = (typeof launchMissionStatuses)[number];

export const launchMissionProgressSchema = z.object({
  status: z.enum(launchMissionStatuses),
  evidence: z.string().trim().max(1000),
  note: z.string().trim().max(2000),
  updatedAt: z.string().datetime(),
});

export type LaunchMissionProgress = z.infer<typeof launchMissionProgressSchema>;

export const spaceQuoteSchema = z.object({
  id: z.string().min(1).max(100),
  provider: z.string().trim().max(120),
  optionType: z.enum(["home", "soho", "shared_office", "commercial_lease", "factory"]),
  depositWon: z.number().int().min(0).max(100_000_000_000),
  monthlyRentWon: z.number().int().min(0).max(10_000_000_000),
  monthlyMaintenanceWon: z.number().int().min(0).max(10_000_000_000),
  monthlyMailWon: z.number().int().min(0).max(10_000_000_000),
  setupFeeWon: z.number().int().min(0).max(10_000_000_000),
  vatIncluded: z.boolean(),
  contractMonths: z.number().int().min(1).max(120),
  registrationEligible: z.boolean(),
  industryApproved: z.boolean(),
  subleaseConsentVerified: z.boolean(),
  cancellationChecked: z.boolean(),
  evidence: z.string().trim().max(1000),
});

export type SpaceQuote = z.infer<typeof spaceQuoteSchema>;

export const launchBrandSchema = z.object({
  brandName: z.string().trim().max(80),
  slogan: z.string().trim().max(120),
  markStyle: z.enum(["wordmark", "monogram", "badge", "spark", "frame", "arch"]),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const supportOptionIds = [
  "brand-review",
] as const;

export type SupportOptionId = (typeof supportOptionIds)[number];

export const launchMissionWorkspaceSchema = z.object({
  schemaVersion: z.literal("kr-beginner-launch-v1"),
  startDate: z.string().date(),
  missionProgress: z.record(z.string(), launchMissionProgressSchema),
  spaceQuotes: z.array(spaceQuoteSchema).length(3),
  brand: launchBrandSchema,
  selectedSupportOptions: z.array(z.enum(supportOptionIds)).max(supportOptionIds.length),
  updatedAt: z.string().datetime(),
});

export type LaunchMissionWorkspace = z.infer<typeof launchMissionWorkspaceSchema>;

export type MissionPhase = "validate" | "place" | "register" | "brand" | "launch" | "operate";
export type MissionRequirement = "required" | "conditional" | "optional";

export type MissionSource = {
  label: string;
  authority: string;
  url: string;
};

export type LaunchMission = {
  id: string;
  phase: MissionPhase;
  period: string;
  dueOffsetDays: number;
  title: string;
  summary: string;
  requirement: MissionRequirement;
  estimatedMinutes: number;
  costGuide: string;
  stopGate: boolean;
  dependencies: string[];
  actions: string[];
  completionEvidence: string;
  output: string;
  expertRole?: string;
  expertTrigger?: string;
  sources: MissionSource[];
};

export type LaunchMissionContext = {
  projectId: string;
  title: string;
  region: string;
  archetype: "digital_service" | "ecommerce" | "local_retail" | "professional_service" | "manufacturing" | "regulated";
  legalForm: "undecided" | "sole_proprietor" | "corporation";
  workplaceType: "home" | "soho" | "shared_office" | "commercial_lease" | "factory";
  employeeCount: number;
  onlineSales: boolean;
  handlesPersonalData: boolean;
  hasPermitBlocker: boolean;
  risk: string;
};
