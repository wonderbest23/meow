import type { IntakeCommand, IntakeState } from "./intake-types";
import type { CoachState } from "./coach";
import type { ServerPlan } from "./plan-server-store";
import { applyIntakeAnswer, effectiveStructure, IntakeError } from "./intake-core";
import { intakeCandidates } from "./intake-questions";
import { ksicByCode } from "./ksic";
import { parseResourceLimit } from "./intake-candidate-fit";
import { RESOURCE_KEYS, RESOURCE_ANSWER_IDS, RESOURCE_LABELS, RESOURCE_UNITS, resourceRecordSchema, resourceBusinessAssumptions } from "./intake-candidate-resources";

/*
 * 예산·시간 고치기. 빈 칸은 '바꾸지 않음'이다 — 예전엔 빈 칸이 '아직 미정'으로 저장되고(답하지 않은 질문까지),
 * 저장할 때마다 대화 끝에 "준비에 쓸 수 있는 돈은 얼마인가요? 아직 미정" 같은 질문·답이 순서 없이 다시 붙었다(여정 점검 2026-10-22).
 * 이제 바뀐 값만 답을 고치고, 대화에는 고친 내용을 한 줄로만 남긴다. 직접 '미정'이라고 적은 값은 그대로 미정이다.
 */
export function applyIntakeResources(plan: ServerPlan, coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  const messageCount = coach.messages.length;
  const changed: string[] = [];
  for (const key of RESOURCE_KEYS) if (command.resourceLimits && Object.hasOwn(command.resourceLimits, key)) {
    const raw = command.resourceLimits[key]?.trim() || null, id = RESOURCE_ANSWER_IDS[key];
    if (raw === null) continue;
    const previous = intake.answers[id];
    if (previous && (previous.quote || String(previous.value ?? "")).trim() === raw) continue;
    const parsed = parseResourceLimit(raw, key), unknown = parsed.status === "missing" || parsed.status === "unknown";
    if (id === "budget" || id === "hoursPerWeek") applyIntakeAnswer(plan, coach, intake, { ...command, requestId: `${command.requestId}:${key}`, action: "answer", questionId: id, value: raw, unknown }, at);
    else intake.answers[id] = { status: unknown ? "unknown" : "answered", value: raw, quote: raw, messageId: command.requestId, at };
    changed.push(`${RESOURCE_LABELS[key]} ${unknown ? "아직 미정" : raw}`);
  }
  // 질문·답 말풍선(applyIntakeAnswer 가 붙인 것)은 빼고, 고친 내용 한 줄만 남긴다
  coach.messages.splice(messageCount);
  if (changed.length) coach.messages.push({ id: command.requestId, role: "user", text: `예산·시간을 고쳤어요: ${changed.join(" · ")}`, at });
  if (command.resourceContext) intake.resourceContext = command.resourceContext;
  if (command.resourceQuote) {
    const q = command.resourceQuote;
    if (q.candidateId.includes(":idea:") && intake.selectedCandidate?.id !== q.candidateId) throw new IntakeError("candidate_not_selected", "AI 제안을 먼저 고른 뒤 실제로 받은 견적을 연결해 주세요");
    const known = q.candidateId === "custom-business" && !!coach.business.description || q.candidateId === intake.selectedCandidate?.id || intakeCandidates({}, Infinity).some(i => i.id === q.candidateId) || q.candidateId.startsWith("ksic:") && ksicByCode(q.candidateId.slice(5))?.level === 5;
    if (!known) throw new IntakeError("candidate_unknown", "견적을 연결할 사업을 확인해 주세요");
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
