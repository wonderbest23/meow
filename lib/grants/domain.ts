import { z } from "zod";

export const grantSupportTypes = [
  "seed_funding",
  "facility",
  "marketing",
  "loan_guarantee",
  "mentoring",
  "global",
] as const;

export type GrantSupportType = (typeof grantSupportTypes)[number];

export type GrantProgram = {
  id: string;
  title: string;
  organizer: string;
  supportType: GrantSupportType;
  maxSupportWon: number | null;
  applicationWindow: string;
  officialUrl: string;
  observedAt: string;
  summary: string;
  targetFounder: string[];
  targetArchetypes: string[];
  minTeamSize: number;
  maxTeamSize: number | null;
  requiresIncorporation: boolean | null;
  excludedKeywords: string[];
  requiredEvidence: string[];
};

export const grantWorkspaceSchema = z.object({
  founderAge: z.number().int().min(18).max(80).nullable().default(null),
  teamSize: z.number().int().min(1).max(100).default(1),
  priorGrantReceived: z.boolean().default(false),
  registrationStatus: z.enum(["unknown", "unregistered", "registered", "corporation"]).default("unknown"),
  registrationEvidenceUrl: z.string().url().or(z.literal("")).default(""),
  officialAnnouncementChecked: z.boolean().default(false),
  taxArrearsChecked: z.boolean().default(false),
  exclusionCriteriaChecked: z.boolean().default(false),
  supportingEvidenceUrls: z.array(z.string().url()).max(20).default([]),
  preferredSupportTypes: z.array(z.enum(grantSupportTypes)).max(6).default([]),
  targetRegions: z.array(z.string().trim().min(1).max(50)).max(5).default([]),
  applicationGoal: z.string().trim().max(1000).default(""),
  evidenceNotes: z.string().trim().max(2000).default(""),
  bookmarkedProgramIds: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

export type GrantWorkspace = z.infer<typeof grantWorkspaceSchema>;

export type GrantEligibilityStatus = "eligible" | "conditional" | "ineligible";

export type GrantMatch = {
  programId: string;
  title: string;
  organizer: string;
  status: GrantEligibilityStatus;
  fitScore: number;
  maxSupportWon: number | null;
  officialUrl: string;
  matchedCriteria: string[];
  blockers: string[];
  missingEvidence: string[];
  nextActions: string[];
};

export type GrantAnalysis = {
  generatedAt: string;
  rulesVersion: string;
  catalogObservedAt: string;
  readinessScore: number;
  eligibleCount: number;
  conditionalCount: number;
  readinessChecks: Array<{ label: string; passed: boolean }>;
  matches: GrantMatch[];
};

export type GrantApplicationSection = {
  programId: string;
  title: string;
  status: GrantEligibilityStatus;
  paragraphs: string[];
  evidenceChecklist: string[];
};

export type GrantPackage = {
  title: string;
  generatedAt: string;
  markdown: string;
  sections: GrantApplicationSection[];
};
