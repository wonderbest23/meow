import type { IntakeCandidate, IntakeCommand, IntakePayload, IntakeSnapshot, IntakeValue } from "../../../../lib/plan-builder/intake-types";
import { COACH_FIELD_LABELS } from "../../../../lib/plan-builder/coach-presentation";
import { applyIntakeAnswer, finishIntakeMutation, intakeBusinessFingerprint, intakeFieldRevision, intakeSnapshot } from "../../../../lib/plan-builder/intake-core";
import type { ServerPlan } from "../../../../lib/plan-builder/plan-server-store";
import type { IntakeQuestion } from "../../../../lib/plan-builder/intake-questions";
import { inferProposalSector, SECTOR_PROFILES, type ProposalSector } from "../../../../lib/plan-builder/proposal-blueprint";

export type ComposerMode = "answer" | "memo" | "help";
export type AnswerDraft = { text: string; selected: string[]; custom: boolean; label?: string };
export type PendingRequest = { command: IntakeCommand; answer?: AnswerDraft; text?: string; intro?: string | null; conflict?: boolean };
export type IntakeDraft = {
  version: 1;
  ownerScope: string | null;
  mode: ComposerMode;
  editingId: string | null;
  answers: Record<string, AnswerDraft>;
  memo: string;
  help: string;
  introMessage: string | null;
  pending: PendingRequest | null;
};

export const emptyAnswer = (): AnswerDraft => ({ text: "", selected: [], custom: false });
export const emptyDraft = (): IntakeDraft => ({ version: 1, ownerScope: null, mode: "answer", editingId: null, answers: {}, memo: "", help: "", introMessage: null, pending: null });
export const draftKey = (planId?: string | null, ownerScope?: string | null) => `business-intake:v2:${encodeURIComponent(ownerScope || "unverified")}:${planId || "new"}`;

export function typedEntryCommand(text: string): Pick<IntakeCommand, "action" | "mode" | "questionId" | "value"> {
  const value = text.trim();
  const compact = value.replace(/[\s.!?。！？]/g, "");
  if (["아이디어가없어요", "아이디어없어요", "아이디어를찾고있어요", "아직아이디어가없어요"].includes(compact)) return { action: "start", mode: "exploring" };
  if (["사업을운영중이에요", "사업운영중", "운영중이에요", "운영중입니다"].includes(compact)) return { action: "start", mode: "operating" };
  if (["생각한사업이있어요", "아이디어가있어요"].includes(compact)) return { action: "start", mode: "startup" };
  const operating = /운영\s*(?:중|하고\s*있)/.test(value) && !/(?:아니|않|아직|예정|계획)/.test(value);
  return { action: "start", mode: operating ? "operating" : "startup", questionId: "business", value };
}

export function entryMessage(draft: Pick<IntakeDraft, "memo" | "introMessage">) {
  const previous = draft.introMessage?.trim() ?? "", current = draft.memo.trim();
  return previous && current && previous !== current ? `${previous}\n${current}` : current || previous;
}

export function typedChoiceAnswer(snapshot: IntakeSnapshot, question: IntakeQuestion, text: string): IntakeValue | undefined {
  if (!["single", "multi"].includes(question.kind) || !text.trim()) return undefined;
  const normalize = (value: string) => value.replace(/\s+/g, "").toLocaleLowerCase();
  const options = question.id === "candidate" ? snapshot.candidateIdeas.map(idea => ({ value: idea.id, label: idea.title })) : question.options ?? [];
  const resolve = (part: string) => {
    const matches = options.filter(option => [option.value, option.label, ...option.label.split(/[·/]/)].some(label => normalize(label) === normalize(part)));
    return matches.length === 1 ? matches[0].value : undefined;
  };
  if (question.kind === "single") return resolve(text);
  const selected = text.split(/[,\n]/).map(resolve);
  return selected.every((value): value is string => !!value) ? [...new Set(selected)] : undefined;
}

function descriptionSector(text: string): ProposalSector {
  // The delivery format matters more than the industry of the intended customer.
  const subject = text.replace(/^.*?(?:대상(?:으로)?|을 위한|를 위한|에게)\s*/, "");
  if (/(?:앱|소프트웨어|플랫폼|웹사이트|게임|영상|사진).{0,12}(?:강의|수업|교육|과외|코칭)/i.test(subject)) return "education";
  if (/(?:홈페이지|웹사이트|앱).{0,8}(?:제작|개발)\s*(?:대행|용역)|(?:플랫폼|소프트웨어).{0,8}컨설팅/i.test(subject)) return "b2b_service";
  if (/웹\s*(?:사이트|서비스)|게임\s*개발|애플리케이션|어플|\bapp\b|\bsaas\b|앱(?:으로|을|은|이|$)/i.test(subject)) return "software";
  if (/과외|클래스|튜터/.test(subject)) return "education";
  if (/스마트스토어|온라인\s*쇼핑|쇼핑\s*몰/.test(subject)) return "retail_commerce";
  return inferProposalSector(subject);
}

export function suggestedIntakeIndustry(snapshot: IntakeSnapshot): { value: ProposalSector; label: string } | null {
  const texts = ["business", "offer"].flatMap(key => {
    const field = snapshot.coach.fields.find(field => field.key === key);
    if (field) return field.basis === "user" && field.value.trim() ? [field.value.trim()] : [];
    const answer = snapshot.intake.answers[key];
    return answer?.status === "answered" && typeof answer.value === "string" && answer.value.trim() ? [answer.value.trim()] : [];
  });
  if (!texts.length) return null;
  const sectors = new Set<ProposalSector>();
  for (const text of texts) {
    // Negation and independent business lines need an explicit choice, not a guess.
    if (/아니|아닌|않|말고|제외/.test(text)) return null;
    const parts = text.split(/그리고|겸|동시에|(?:와|과)\s+|[+&/\n]/).filter(part => part.trim());
    const separate = new Set(parts.map(descriptionSector).filter(sector => sector !== "general"));
    if (separate.size > 1) return null;
    const sector = descriptionSector(text);
    if (sector !== "general") sectors.add(sector);
  }
  if (sectors.size !== 1) return null;
  const value = [...sectors][0];
  return { value, label: SECTOR_PROFILES[value].label };
}

export function persistDraft(key: string, draft: IntakeDraft, memory: Map<string, IntakeDraft>, storage: () => Pick<Storage, "setItem">): boolean {
  memory.set(key, draft);
  try { storage().setItem(key, JSON.stringify(draft)); return true; }
  catch { return false; }
}

function isAnswer(value: unknown): value is AnswerDraft {
  if (!value || typeof value !== "object") return false;
  const answer = value as AnswerDraft;
  return typeof answer.text === "string" && typeof answer.custom === "boolean" && Array.isArray(answer.selected) && answer.selected.every(item => typeof item === "string");
}

export function parseDraft(raw: string | null, planId?: string | null, ownerScope?: string | null): IntakeDraft {
  if (!raw) return emptyDraft();
  try {
    const value = JSON.parse(raw) as IntakeDraft;
    if (!ownerScope || value.ownerScope !== ownerScope) return emptyDraft();
    if (value.version !== 1 || !["answer", "memo", "help"].includes(value.mode) || typeof value.memo !== "string" || typeof value.help !== "string" || !value.answers || typeof value.answers !== "object") return emptyDraft();
    const answers = Object.fromEntries(Object.entries(value.answers).filter(([, answer]) => isAnswer(answer)));
    const pending = value.pending;
    const validPending = pending && typeof pending.command?.requestId === "string" && Number.isInteger(pending.command.revision)
      && ["start", "answer", "message", "confirm-extraction", "details", "extract", "extract-pending", "help", "design", "prepare"].includes(pending.command.action)
      && (pending.command.planId ?? null) === (planId ?? null);
    return { ...emptyDraft(), ...value, answers, introMessage: typeof value.introMessage === "string" ? value.introMessage : null, editingId: typeof value.editingId === "string" ? value.editingId : null, pending: validPending ? pending : null };
  } catch { return emptyDraft(); }
}

export function sameAnswer(a: AnswerDraft | undefined, b: AnswerDraft | undefined) {
  return !!a && !!b && a.text === b.text && a.custom === b.custom && a.selected.length === b.selected.length && a.selected.every((item, index) => item === b.selected[index]);
}

export function settleDraft(draft: IntakeDraft, pending: PendingRequest): IntakeDraft {
  const next = { ...draft, answers: { ...draft.answers }, pending: null };
  const command = pending.command;
  if (command.action === "start" && pending.text !== undefined) {
    if (next.memo === pending.text) next.memo = "";
    if (next.introMessage === pending.intro) next.introMessage = null;
  }
  if (command.action === "answer" && command.questionId) {
    const key = pending.answer?.custom ? "candidate" : command.questionId;
    if (sameAnswer(next.answers[key], pending.answer)) {
      delete next.answers[key];
      if (next.editingId === key) next.editingId = null;
    } else if (next.answers[key]) next.editingId = key;
    if (pending.text !== undefined && next.memo === pending.text) next.memo = "";
  }
  if (command.action === "message" && next.memo === pending.text) next.memo = "";
  if (command.action === "message" && next.introMessage === pending.text) next.introMessage = null;
  if (command.action === "help" && next.help === pending.text) next.help = "";
  return next;
}

export function shouldAcceptSnapshot(current: IntakeSnapshot | null, incoming: IntakeSnapshot) {
  if (!current) return true;
  if (current.planId !== incoming.planId) return false;
  if (incoming.coach.revision !== current.coach.revision) return incoming.coach.revision > current.coach.revision;
  return incoming.updatedAt >= current.updatedAt;
}

export function isIntakePayload(value: unknown): value is IntakePayload {
  if (!value || typeof value !== "object") return false;
  const data = value as IntakePayload;
  if (data.flowVersion !== 2 || typeof data.enabled !== "boolean") return false;
  if (data.plan === null) return true;
  const plan = data.plan;
  return !!plan && typeof plan.planId === "string" && Number.isInteger(plan.coach?.revision)
    && Array.isArray(plan.questions) && Array.isArray(plan.summary) && Array.isArray(plan.coach.fields)
    && !!plan.intake?.answers && Array.isArray(plan.intake.notes) && Array.isArray(plan.intake.candidates);
}

export function readIntakePayload(value: unknown): IntakePayload | null {
  if (!value || typeof value !== "object") return null;
  const normalized = { ...value, plan: (value as Partial<IntakePayload>).plan ?? null };
  return isIntakePayload(normalized) ? normalized : null;
}

export function previewIntakeAnswer(snapshot: IntakeSnapshot, command: IntakeCommand): IntakeSnapshot | null {
  if (command.action !== "answer" || command.revision !== snapshot.coach.revision) return null;
  const coach = structuredClone(snapshot.coach);
  const intake = { ...structuredClone(snapshot.intake), receipts: [] };
  const plan: ServerPlan = { id: snapshot.planId, title: snapshot.title, planType: snapshot.planType, createdAt: snapshot.updatedAt, updatedAt: snapshot.updatedAt, sections: {}, answers: {} };
  const before = intakeBusinessFingerprint(coach, plan.answers);
  applyIntakeAnswer(plan, coach, intake, command, new Date().toISOString());
  finishIntakeMutation(coach, before, plan.answers);
  plan.title = coach.business.name;
  return { ...intakeSnapshot(plan, coach, intake), hasDocuments: snapshot.hasDocuments };
}

export function needsPolling(snapshot: IntakeSnapshot | null) {
  if (!snapshot) return false;
  return ["queued", "running"].includes(snapshot.intake.job?.status ?? "")
    || snapshot.intake.notes.some(note => ["queued", "processing"].includes(note.status));
}

export function candidateConflict(snapshot: IntakeSnapshot, candidate: IntakeCandidate) {
  const current = snapshot.coach.fields.find(field => field.key === candidate.fieldKey)?.value ?? null;
  const changed = current !== candidate.baseValue || candidate.baseFieldRevision !== undefined && intakeFieldRevision(snapshot.coach, snapshot.intake, candidate.fieldKey) !== candidate.baseFieldRevision;
  return { current, changed, requiresOverwrite: current !== candidate.value && (changed || current !== null) };
}

export function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (/^```(?:json)?/i.test(text)) return "";
  if (/^[\[{]/.test(text)) {
    try { const parsed: unknown = JSON.parse(text); if (parsed && typeof parsed === "object") return ""; }
    catch { /* Brackets in ordinary user prose are not JSON. */ }
  }
  return text;
}

export function readableFinancialSummary(snapshot: IntakeSnapshot) {
  const summary = plainText(snapshot.financialSummary);
  if (summary) return summary;
  const keys = ["budget", "price", "unitCost", "cost", "volume", "sales"];
  const rows = snapshot.coach.fields.filter(field => keys.includes(field.key) && plainText(field.value)).map(field => `${COACH_FIELD_LABELS[field.key]}: ${plainText(field.value)}${field.basis === "proposal" ? " (AI 제안)" : ""}`);
  return rows.length ? `${rows.join("\n")}\n미입력 금액은 0원으로 계산하지 않습니다.` : "아직 입력한 금액이 없습니다. 모르는 금액은 미정으로 남겨 둡니다.";
}

export function answerText(value: IntakeValue) {
  return Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);
}
