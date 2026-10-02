import { z } from "zod";
import { INTAKE_ACTIONS } from "./intake-types";
import { resourceContextSchema, resourceLimitsSchema, resourceQuoteSchema } from "./intake-candidate-resources";

// Shared with draft restoration; deliberately contains no server or credential imports.
export const intakeCommandSchema = z.object({
  action: z.enum(INTAKE_ACTIONS),
  planId: z.string().min(1).max(60).optional(), revision: z.number().int().nonnegative().default(0), requestId: z.string().uuid(),
  mode: z.enum(["exploring", "startup", "operating"]).optional(), questionId: z.string().max(100).optional(),
  value: z.union([z.string().max(1200), z.number().finite(), z.array(z.string().max(200)).max(12), z.null()]).optional(),
  unknown: z.boolean().optional(), ksic: z.string().regex(/^\d{5}$/).optional(), message: z.string().trim().max(8000).optional(),
  noteIntent: z.enum(["memo", "question"]).optional(),
  resourceLimits: resourceLimitsSchema.optional(), resourceContext: resourceContextSchema.optional(), resourceQuote: resourceQuoteSchema.optional(),
  structure: z.object({ payer: z.enum(["b2c", "b2b", "b2g", "mixed"]).optional(), offering: z.enum(["goods", "service", "software", "space", "content", "mixed"]).optional(), revenue: z.enum(["per_unit", "per_hour", "subscription", "rental", "commission", "project", "advertising", "freemium", "lead_fee", "listing_fee", "mixed"]).optional(), sides: z.enum(["one", "two"]).optional(), delivery: z.enum(["store", "visit", "online", "delivery", "production", "mixed"]).optional(), license: z.enum(["none", "registration", "permit", "professional", "varies"]).optional() }).strict().optional(),
  candidateIds: z.array(z.string().max(160)).max(24).optional(), rejectIds: z.array(z.string().max(160)).max(24).optional(), overwriteIds: z.array(z.string().max(160)).max(24).optional(),
}).strict().refine(command => command.action !== "structure" || !!command.structure && Object.values(command.structure).some(value => value !== undefined), { message: "바꿀 사업 구조 항목을 골라 주세요", path: ["structure"] }).refine(c => c.action !== "resources" || !!c.resourceQuote || !!c.resourceContext || !!c.resourceLimits && Object.keys(c.resourceLimits).length > 0, { message: "변경할 자원 조건을 입력해 주세요" });
