import { z } from "zod";
import type { LLMCompleteParams, LLMConfig, LLMProvider } from "./complete";
import { resolveAlternateLLMConfig, resolvePlanningLLMConfig } from "./config";
import { IDEA_CALL_TIMEOUT_MS } from "../plan-builder/intake-timing";

export const intakeBetaSafetyRequired = () => process.env.INTAKE_BETA_SAFETY === "1";

export type IntakeFeature = "ideas" | "design" | "help" | "extract" | "edit";
export type IntakeCostReservation = NonNullable<LLMCompleteParams["failover"]>["reserve"];
const provider = z.enum(["openai", "anthropic"]);
const policySchema = z.object({
  primary: provider,
  fallback: provider,
  totalTimeoutMs: z.number().int().min(100).max(60_000),
  attemptTimeoutMs: z.number().int().min(50).max(60_000),
  minRemainingMs: z.number().int().min(1).max(10_000),
  allowedErrors: z.array(z.enum(["unavailable", "timeout", "rate_limited"])).max(3),
  // Exact models must pass the feature's real schema qualification before being listed.
  qualifiedModels: z.array(z.object({ provider, model: z.string().min(1) }).strict()).max(8),
}).strict().refine(p => p.primary !== p.fallback && p.attemptTimeoutMs <= p.totalTimeoutMs && p.minRemainingMs < p.totalTimeoutMs);

/** Server-only policy, disabled unless explicitly configured. Never reads keys from policy JSON. */
export function resolveIntakeLLMConfig(ownerHash: string, feature: IntakeFeature, reserve?: IntakeCostReservation): LLMConfig | null {
  const existing = resolvePlanningLLMConfig(ownerHash);
  const raw = process.env[`INTAKE_${feature.toUpperCase()}_FAILOVER_POLICY`];
  if (!raw) return intakeBetaSafetyRequired() ? null : existing;
  let parsed: ReturnType<typeof policySchema.safeParse>;
  try { parsed = policySchema.safeParse(JSON.parse(raw)); } catch { return null; }
  if (!parsed.success || !existing) return null;
  const policy = parsed.data;
  const configs = [existing, resolveAlternateLLMConfig(ownerHash, existing.provider)].filter((value): value is LLMConfig => !!value);
  const find = (p: LLMProvider) => configs.find(c => c.provider === p && policy.qualifiedModels.some(q => q.provider === p && q.model === c.model));
  const primary = find(policy.primary), alternate = find(policy.fallback) ?? null;
  if (!primary) return null;
  return { ...primary, execution: {
    alternate: intakeBetaSafetyRequired() ? null : alternate,
    allowedErrors: intakeBetaSafetyRequired() ? [] : policy.allowedErrors,
    totalTimeoutMs: Math.min(policy.totalTimeoutMs, feature === "ideas" ? IDEA_CALL_TIMEOUT_MS : feature === "design" ? 60_000 : 20_000),
    attemptTimeoutMs: policy.attemptTimeoutMs, minRemainingMs: policy.minRemainingMs,
    compatible: !!alternate,
    // Server-injected durable reservation leases are required; no implicit ledger or budget creation.
    reserve: reserve ?? (async () => false),
  } };
}
