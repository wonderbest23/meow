import { z } from "zod";
import type { RankedOpportunity } from "../opportunity-engine";

const riasecAxisSchema = z.enum(["R", "I", "A", "S", "E", "C"]);
const founderAxisSchema = z.enum([
  "opportunity",
  "customer",
  "creation",
  "execution",
  "scale",
]);

const evidenceSourceSchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z.string().trim().url().max(2000),
  observedAt: z.string().trim().min(1).max(100),
});

export const rankedOpportunitySchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(300),
  oneLiner: z.string().trim().min(1).max(1000),
  sector: z.string().trim().min(1).max(160),
  model: z.string().trim().min(1).max(160),
  customer: z.string().trim().min(1).max(500),
  capital: z.enum(["소액", "중간", "높음"]),
  launchTime: z.string().trim().min(1).max(160),
  revenue: z.string().trim().min(1).max(500),
  stage: z.string().trim().min(1).max(160),
  riasec: z.array(riasecAxisSchema).min(1).max(6),
  founder: z.array(founderAxisSchema).min(1).max(5),
  market: z.number().finite().min(0).max(100),
  novelty: z.number().finite().min(0).max(100),
  feasibility: z.number().finite().min(0).max(100),
  evidenceStatus: z.enum(["hypothesis", "verified"]).optional(),
  evidenceSources: z.array(evidenceSourceSchema).max(30).optional(),
  regulation: z.number().finite().min(0).max(100),
  skills: z.array(z.string().trim().min(1).max(160)).max(30),
  risk: z.string().trim().min(1).max(2000),
  firstTest: z.string().trim().min(1).max(2000),
  color: z.string().trim().min(1).max(80),
  match: z.number().finite().min(0).max(100),
  reasons: z.array(z.string().trim().min(1).max(1000)).max(10),
  caution: z.string().trim().min(1).max(2000),
  scoreBreakdown: z.object({
    personalFit: z.number().finite().min(0).max(100),
    market: z.number().finite().min(0).max(100).nullable(),
    feasibility: z.number().finite().min(0).max(100),
    novelty: z.number().finite().min(0).max(100).nullable(),
  }),
});

export const opportunityPreferenceInputSchema = z.object({
  state: z.enum(["saved", "excluded"]),
  opportunity: rankedOpportunitySchema,
});

export type OpportunityPreferenceState = "saved" | "excluded";

export type OpportunityPreferenceRecord = {
  opportunityKey: string;
  state: OpportunityPreferenceState;
  opportunity: RankedOpportunity;
  createdAt: string;
  updatedAt: string;
};
