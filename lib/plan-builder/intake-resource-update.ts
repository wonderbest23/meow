import type { IntakeCommand, IntakeState } from "./intake-types";
import type { CoachState } from "./coach";
import type { ServerPlan } from "./plan-server-store";
import { applyIntakeAnswer, effectiveStructure, IntakeError } from "./intake-core";
import { intakeCandidates } from "./intake-questions";
import { ksicByCode } from "./ksic";
import { parseResourceLimit } from "./intake-candidate-fit";
import { RESOURCE_KEYS, RESOURCE_ANSWER_IDS, RESOURCE_UNITS, resourceRecordSchema, resourceBusinessAssumptions } from "./intake-candidate-resources";

export function applyIntakeResources(plan: ServerPlan, coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  for (const key of RESOURCE_KEYS) if (command.resourceLimits && Object.hasOwn(command.resourceLimits, key)) {
    const raw = command.resourceLimits[key] ?? null, id = RESOURCE_ANSWER_IDS[key];
    const parsed = parseResourceLimit(raw, key), unknown = parsed.status === "missing" || parsed.status === "unknown";
    if (id === "budget" || id === "hoursPerWeek") applyIntakeAnswer(plan, coach, intake, { ...command, requestId: `${command.requestId}:${key}`, action: "answer", questionId: id, value: raw, unknown }, at);
    else intake.answers[id] = { status: unknown ? "unknown" : "answered", value: raw, quote: raw ?? "", messageId: command.requestId, at };
  }
  if (command.resourceContext) intake.resourceContext = command.resourceContext;
  if (command.resourceQuote) {
    const q = command.resourceQuote;
    if (q.candidateId.includes(":idea:") && intake.selectedCandidate?.id !== q.candidateId) throw new IntakeError("candidate_not_selected", "AI 후보를 먼저 선택한 뒤 실제 확인한 견적을 연결해 주세요");
    const known = q.candidateId === "custom-business" && !!coach.business.description || q.candidateId === intake.selectedCandidate?.id || intakeCandidates({}, Infinity).some(i => i.id === q.candidateId) || q.candidateId.startsWith("ksic:") && ksicByCode(q.candidateId.slice(5))?.level === 5;
    if (!known) throw new IntakeError("candidate_unknown", "견적을 연결할 사업 후보를 확인해 주세요");
    const parsed = parseResourceLimit(q.raw, q.metric);
    if (parsed.status !== "known") throw new IntakeError("resource_quote_invalid", "견적의 단위와 범위를 확인해 주세요");
    const record = resourceRecordSchema.safeParse({ schemaVersion: 1, candidateId: q.candidateId, ...(q.candidateId === "custom-business" ? { businessDescription: coach.business.description } : {}), context: q.context, metric: q.metric, unit: RESOURCE_UNITS[q.metric], lower: parsed.lower, upper: parsed.upper, complete: q.complete, includedItems: q.includedItems.split(/[,\n]/).map(s => s.trim()).filter(Boolean), excludedItems: q.excludedItems.split(/[,\n]/).map(s => s.trim()).filter(Boolean), source: { kind: "user-confirmed", reference: q.reference, reviewedAt: at, validFrom: at, expiresAt: q.expiresAt } });
    if (!record.success) throw new IntakeError("resource_quote_invalid", "출처·포함 항목·유효 기간을 확인해 주세요");
    record.data.structureAssumptions = { ...effectiveStructure(intake).values };
    record.data.businessAssumptions = resourceBusinessAssumptions(coach);
    record.data.raw = q.raw;
    const existing = intake.resourceQuotes ?? [];
    const next = existing.filter(r => !(r.candidateId === q.candidateId && r.metric === q.metric && JSON.stringify(r.context) === JSON.stringify(q.context)));
    if (next.length >= 100) throw new IntakeError("resource_quote_limit", "저장한 견적 자료가 많아요. 기존 항목을 수정해 주세요");
    intake.resourceQuotes = [...next, record.data];
    intake.resourceContext = q.context;
  }
}
