import { z } from "zod";
import { COACH_KEY, coachFieldSchema, coachDocumentRevision, currentNextAction, readCoach, type CoachState } from "./coach";
import { COACH_FIELD_LABELS } from "./coach-presentation";

export const EXPERT_HISTORY_KEY = "__business_edit_history";
export const expertPatchSchema = z.object({
  planId: z.string().min(1).max(60), revision: z.number().int().nonnegative(), requestId: z.string().uuid(),
  title: z.string().trim().min(1).max(100).optional(),
  nextAction: z.object({ action: z.string().trim().min(1).max(1200), doneWhen: z.string().trim().min(1).max(1200), usableText: z.string().trim().min(1).max(1200) }).optional(),
  fields: z.array(z.object({ key: coachFieldSchema.shape.key, value: z.string().trim().min(1).max(1200).nullable() })).max(17),
}).refine(p => new Set(p.fields.map(f => f.key)).size === p.fields.length, "동일 항목은 한 번만 수정할 수 있어요.");
export type ExpertPatch = z.infer<typeof expertPatchSchema>;
export type ExpertChange = { key: string; label: string; before: string | null; after: string | null };
export type ExpertHistory = { id: string; at: string; revision: number; changes: ExpertChange[] };

export function expertChanges(coach: CoachState, patch: Pick<ExpertPatch, "title" | "fields" | "nextAction">): ExpertChange[] {
  const changes: ExpertChange[] = [];
  if (patch.title && patch.title !== coach.business.name) changes.push({ key: "title", label: "사업 이름", before: coach.business.name, after: patch.title });
  if (patch.nextAction) for (const key of ["action", "doneWhen", "usableText"] as const) {
    const before = currentNextAction(coach)?.[key] ?? null;
    if (before !== patch.nextAction[key]) changes.push({ key: `nextAction.${key}`, label: { action: "먼저 할 일", doneWhen: "완료 기준", usableText: "바로 쓸 작업안" }[key], before, after: patch.nextAction[key] });
  }
  for (const field of patch.fields) {
    const before = coach.fields.find(f => f.key === field.key)?.value ?? null;
    if (before !== field.value) changes.push({ key: field.key, label: COACH_FIELD_LABELS[field.key], before, after: field.value });
  }
  return changes;
}

export function applyExpertPatch(answers: Record<string, Record<string, unknown>>, patch: ExpertPatch, at: string) {
  const previous = readCoach(answers);
  if (!previous || previous.revision !== patch.revision) throw new Error("REVISION_CONFLICT");
  const changes = expertChanges(previous, patch);
  if (!changes.length) return { answers, coach: previous, changes };
  const message = { id: patch.requestId, role: "user" as const, at, text: "사업 정보를 직접 수정합니다.\n" + changes.map(c => `${c.label}: ${c.after ?? "미정으로 변경"}`).join("\n") };
  const fields = new Map(previous.fields.map(f => [f.key, f]));
  for (const field of patch.fields) {
    if (!changes.some(c => c.key === field.key)) continue;
    if (field.value === null) fields.delete(field.key);
    else fields.set(field.key, { key: field.key, value: field.value, basis: "user", quote: field.value, messageId: message.id });
  }
  const coach: CoachState = { ...previous, revision: previous.revision + 1, documentRevision: coachDocumentRevision(previous) + 1,
    ...(patch.nextAction ? { directAction: { ...patch.nextAction, sourceRevision: coachDocumentRevision(previous) + 1 } } : previous.directAction ? { directAction: { ...previous.directAction, sourceRevision: coachDocumentRevision(previous) + 1, needsReview: true } } : {}),
    fields: [...fields.values()], business: { ...previous.business, name: patch.title ?? previous.business.name, description: fields.get("business")?.value ?? "" },
    ready: previous.ready && fields.has("business"),
    messages: [...previous.messages, message, { id: `${message.id}-reply`, role: "assistant", at, text: "직접 수정한 사업 정보를 저장했어요. 기존 문서는 유지되며, 바뀐 내용의 반영은 별도로 요청할 수 있어요." }],
  };
  const entries = Array.isArray(answers[EXPERT_HISTORY_KEY]?.entries) ? answers[EXPERT_HISTORY_KEY].entries as ExpertHistory[] : [];
  return { coach, changes, answers: { ...answers, [COACH_KEY]: { state: coach }, [EXPERT_HISTORY_KEY]: { entries: [...entries, { id: patch.requestId, at, revision: coach.revision, changes }].slice(-20) } } };
}
