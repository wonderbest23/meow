import { z } from "zod";
import type { BusinessStructure } from "./business-structure";
import type { CoachState } from "./coach";

export const RESOURCE_DATA_VERSION = "2026-09-20.2";
export const RESOURCE_KEYS = ["initialCost", "monthlyOperatingCost", "preparationHours", "weeklyOperatingHours"] as const;
export type ResourceKey = typeof RESOURCE_KEYS[number];
export const RESOURCE_LABELS: Record<ResourceKey, string> = { initialCost: "초기 투자 예산", monthlyOperatingCost: "월 운영비 한도", preparationHours: "총 준비 시간", weeklyOperatingHours: "주당 운영 시간" };
export const RESOURCE_UNITS = { initialCost: "KRW", monthlyOperatingCost: "KRW/month", preparationHours: "hour", weeklyOperatingHours: "hour/week" } as const;
export const RESOURCE_ANSWER_IDS: Record<ResourceKey, string> = { initialCost: "budget", monthlyOperatingCost: "resource.monthlyBudget", preparationHours: "resource.preparationHours", weeklyOperatingHours: "hoursPerWeek" };
export const resourceContextSchema = z.object({ variant: z.string().trim().min(1).max(160), region: z.string().trim().min(1).max(100), scale: z.string().trim().min(1).max(160) }).strict();
export type ResourceContext = z.infer<typeof resourceContextSchema>;
const date = z.string().datetime();
export const resourceRecordSchema = z.object({
  schemaVersion: z.literal(1), candidateId: z.string().min(1).max(160), context: resourceContextSchema,
  businessDescription: z.string().max(1200).optional(),
  raw: z.string().max(120).optional(),
  structureAssumptions: z.record(z.string().max(40), z.union([z.string().max(80), z.boolean()])).optional(),
  businessAssumptions: z.record(z.string().max(40), z.string().max(1200)).optional(),
  metric: z.enum(RESOURCE_KEYS), unit: z.enum(["KRW", "KRW/month", "hour", "hour/week"]),
  lower: z.number().finite().nonnegative().max(1e14), upper: z.number().finite().nonnegative().max(1e14),
  complete: z.boolean(), includedItems: z.array(z.string().trim().min(1).max(200)).min(1).max(20), excludedItems: z.array(z.string().max(200)).max(20),
  source: z.object({ kind: z.enum(["public", "user-confirmed"]), reference: z.string().trim().min(1).max(1000), reviewedAt: date, validFrom: date, expiresAt: date }).strict(),
}).strict().refine(r => r.lower <= r.upper && r.unit === RESOURCE_UNITS[r.metric] && Date.parse(r.source.validFrom) <= Date.parse(r.source.reviewedAt) && Date.parse(r.source.reviewedAt) < Date.parse(r.source.expiresAt), { message: "범위·단위·출처 확인 기간을 확인해 주세요" });
export type ResourceRecord = z.infer<typeof resourceRecordSchema>;
export function resourceBusinessAssumptions(coach: CoachState) {
  return { description: coach.business.description, ...Object.fromEntries(["customer", "offer", "price", "volume", "channel", "capacity", "minutesPerSale"].map(key => [key, coach.fields.find(f => f.key === key && f.basis === "user")?.value ?? ""])) };
}
export function resourceAssumptionsMatch(record: ResourceRecord, structure: BusinessStructure, business?: Record<string, string>) {
  return !!record.structureAssumptions && Object.entries(structure).every(([key, value]) => record.structureAssumptions?.[key] === value)
    && (!business || record.source.kind !== "user-confirmed" || !!record.businessAssumptions && Object.entries(business).every(([key, value]) => record.businessAssumptions?.[key] === value));
}
export const resourceLimitsSchema = z.object({ initialCost: z.string().max(120).nullable().optional(), monthlyOperatingCost: z.string().max(120).nullable().optional(), preparationHours: z.string().max(120).nullable().optional(), weeklyOperatingHours: z.string().max(120).nullable().optional() }).strict();
export const resourceQuoteSchema = z.object({ candidateId: z.string().min(1).max(160), metric: z.enum(RESOURCE_KEYS), raw: z.string().trim().min(1).max(120), context: resourceContextSchema, reference: z.string().trim().min(1).max(1000), includedItems: z.string().trim().min(1).max(1000), excludedItems: z.string().max(1000), complete: z.boolean(), expiresAt: date, confirmed: z.literal(true) }).strict();
export type ResourceQuote = z.infer<typeof resourceQuoteSchema>;

// Public platform fees are not complete business budgets. No inferred totals are shipped.
const PUBLIC_RESOURCE_RECORDS: readonly ResourceRecord[] = [];
export function loadResourceRecords(input: readonly unknown[] = PUBLIC_RESOURCE_RECORDS): ResourceRecord[] {
  return input.flatMap(value => { const parsed = resourceRecordSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
}
export function sameResourceContext(a: ResourceContext | undefined, b: ResourceContext) {
  return !!a && a.variant === b.variant && a.region === b.region && a.scale === b.scale;
}
