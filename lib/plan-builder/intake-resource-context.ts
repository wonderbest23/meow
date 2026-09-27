import type { CoachState } from "./coach";
import type { IntakeState } from "./intake-types";
import type { BusinessStructure } from "./business-structure";
import { parseResourceLimit } from "./intake-candidate-fit";
import { RESOURCE_KEYS, RESOURCE_ANSWER_IDS, RESOURCE_UNITS, RESOURCE_DATA_VERSION, resourceAssumptionsMatch, resourceBusinessAssumptions, sameResourceContext, loadResourceRecords } from "./intake-candidate-resources";

/** Projection of existing confirmed input, not a second business store. */
export function intakeResourceSource(coach: CoachState, intake: IntakeState | null, structure?: BusinessStructure) {
  if (!intake || !RESOURCE_KEYS.some(key => intake.answers[RESOURCE_ANSWER_IDS[key]]) && !intake.resourceQuotes?.length) return undefined;
  const limits = RESOURCE_KEYS.map(key => {
    const answer = intake.answers[RESOURCE_ANSWER_IDS[key]];
    const raw = answer ? answer.quote || (answer.value == null ? "" : String(answer.value)) : coach.fields.find(f => f.key === RESOURCE_ANSWER_IDS[key] && f.basis === "user")?.value ?? "";
    return { id: key, role: "user_limit_not_actual_cost_or_results", unit: RESOURCE_UNITS[key], ...parseResourceLimit(raw, key) };
  });
  const candidate = intake.answers.candidate;
  const selectedByCandidate = candidate?.messageId && coach.fields.some(field => field.key === "business" && field.basis === "user" && field.messageId === candidate.messageId);
  const selected = selectedByCandidate ? candidate.value : intake.answers.business?.value ? "custom-business" : candidate?.value ?? "custom-business";
  const quotes = loadResourceRecords(intake.resourceQuotes ?? []).filter(r => r.candidateId === selected && (r.candidateId !== "custom-business" || r.businessDescription === coach.business.description));
  return { version: RESOURCE_DATA_VERSION, limits, context: intake.resourceContext ?? null, structure: structure ?? null,
    quotes: quotes.map(record => ({ ...record, verification: "user_attestation_not_independently_verified", applicability: structure && resourceAssumptionsMatch(record, structure, resourceBusinessAssumptions(coach)) && sameResourceContext(intake.resourceContext, record.context) ? "assumptions_match_check_coverage_and_expiry" : "requires_reconfirmation" })) };
}
