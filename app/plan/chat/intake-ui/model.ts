import type { IntakeCandidate, IntakeCommand, IntakePayload, IntakeSnapshot, IntakeValue } from "../../../../lib/plan-builder/intake-types";
import { COACH_FIELD_LABELS } from "../../../../lib/plan-builder/coach-presentation";
import { applyIntakeAnswer, finishIntakeMutation, intakeBusinessFingerprint, intakeFieldRevision, intakeSnapshot } from "../../../../lib/plan-builder/intake-core";
import type { ServerPlan } from "../../../../lib/plan-builder/plan-server-store";
import type { IntakeQuestion } from "../../../../lib/plan-builder/intake-questions";
import { SECTOR_PROFILES, type ProposalSector } from "../../../../lib/plan-builder/proposal-blueprint";
import { coachAmount } from "../../../../lib/plan-builder/coach-feasibility";
import { formatWon, splitAssembledAnswer, STEP_SEPARATOR, LIST_SEPARATOR, assembleAnswer, CHIP_LIMITS, CHIP_GROUPS } from "../../../../lib/plan-builder/intake-options";
import { descriptionSector } from "../../../../lib/plan-builder/intake-sector";
export { descriptionSector } from "../../../../lib/plan-builder/intake-sector";

export type ComposerMode = "answer" | "memo" | "help";
/** `hint` is display-only: the previous stored answer when it could not be seeded into a control (never sent). */
export type AnswerDraft = { text: string; selected: string[]; custom: boolean; label?: string; hint?: string };
export type PendingRequest = { command: IntakeCommand; answer?: AnswerDraft; text?: string; intro?: string | null; conflict?: boolean; composer?: { text: string; mode: ComposerMode; questionId?: string } };
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

const questionIntent = /어떻게|왜\s|무엇(?:부터|을|이)|뭐부터|(?:할|일|될|괜찮을|좋을|맞을)까요|(?:좋|맞|괜찮|가능)[은을]?가요|(?:알려|추천해|비교해|설명해)\s*(?:줘|주세요)|고민(?:이에요|입니다)|조언/;
const acknowledgement = /^(?:안녕(?:하세요)?|반갑습니다|네|넵|예|좋아요|감사합니다|고마워요|알겠습니다|ok)[.!?~\s]*$/i;
const compoundFields = /(?:예산|가격|고객|매출|비용|상품|서비스|시간)\s*[:：]/g;
export const isConsultationText = (text: string) => questionIntent.test(text) || /[?？]/.test(text);
export function needsEntryConfirmation(text: string) {
  return acknowledgement.test(text.trim()) || questionIntent.test(text) || /[?？]/.test(text)
    || (text.match(compoundFields)?.length ?? 0) > 1 || /(?:예전에|과거에|그만둔|접었|폐업)/.test(text);
}

export type ComposerRoute =
  | { kind: "answer"; questionId: string; value: IntakeValue; unknown?: boolean }
  | { kind: "note"; intent: "memo" | "question" }
  | { kind: "clarify"; canAnswer: boolean };

/** Explicit question context or exact options become answers. Ambiguous prose never silently triggers AI. */
export function routeComposerInput(snapshot: IntakeSnapshot, question: IntakeQuestion | null, text: string): ComposerRoute {
  const value = text.trim();
  if (question && /^(?:아직\s*)?(?:미정|모르겠어요|모르겠습니다|정하지\s*못했어요)[.!\s]*$/.test(value)) return { kind: "answer", questionId: question.id, value: null, unknown: true };
  if (questionIntent.test(value)) return { kind: "note", intent: "question" };
  const canAnswer = !!question && ["text", "number"].includes(question.kind);
  if (/[?？]/.test(value) || acknowledgement.test(value) || (value.match(compoundFields)?.length ?? 0) > 1) return { kind: "clarify", canAnswer };
  if (!question) return { kind: "note", intent: "memo" };
  if (["single", "multi"].includes(question.kind)) {
    const choice = question.kind === "multi" && hasExclusiveOptions(question) ? undefined : typedChoiceAnswer(snapshot, question, value);
    return choice === undefined ? { kind: "clarify", canAnswer: false } : { kind: "answer", questionId: question.id, value: choice };
  }
  if (question.kind === "number" && !/^[\d\s,.억만천백십원%시간분개명건회좌석룸]+$/.test(value)) return { kind: "clarify", canAnswer: false };
  if (/\n.+|그리고|그런데|하지만/.test(value) || /\d\s*만원.*\d\s*시간/.test(value)) return { kind: "clarify", canAnswer };
  return { kind: "answer", questionId: question.id, value };
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
      && ["start", "answer", "message", "note", "confirm-extraction", "details", "extract", "extract-pending", "help", "design", "prepare"].includes(pending.command.action)
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
    // Only the candidate question's "직접 생각한 사업" toggle stores its draft under another key (candidate -> business).
    const key = customCandidateDraftKey(command.questionId, pending.answer?.custom);
    if (sameAnswer(next.answers[key], pending.answer)) {
      delete next.answers[key];
      if (next.editingId === key) next.editingId = null;
    } else if (next.answers[key]) next.editingId = key;
    if (pending.text !== undefined && next.memo === pending.text) next.memo = "";
  }
  if (command.action === "message" && next.memo === pending.text) next.memo = "";
  if (command.action === "message" && next.introMessage === pending.text) next.introMessage = null;
  if (command.action === "help" && next.help === pending.text) next.help = "";
  if (command.action === "note" && next.memo === pending.text) next.memo = "";
  if (command.action === "note" && next.introMessage === pending.text) next.introMessage = null;
  if (pending.composer) {
    const { text, mode, questionId } = pending.composer;
    if (questionId && next.answers[questionId]?.text === text) delete next.answers[questionId];
    else if (!questionId && mode === "help" && next.help === text) next.help = "";
    else if (!questionId && mode !== "help" && next.memo === text) next.memo = "";
  }
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

export type JobProgressView = { percent: number; elapsedSeconds: number; expectedSeconds: number; limitSeconds: number; slow: boolean };
/**
 * AI 작업의 예상 진행률. 실제 신호는 접수·실행·완료뿐이므로 그 사이는 보통 걸리는 시간으로 추정한다.
 * 보통 시간에 80%쯤, 그 뒤로는 천천히 95%까지만 오르고 완료 응답이 와야 100%가 된다.
 */
export function jobProgress(status: "queued" | "running" | "complete" | "failed", elapsedMs: number, expectedMs: number, limitMs: number): JobProgressView {
  const elapsed = Math.max(0, elapsedMs), expected = Math.max(1000, expectedMs);
  const estimated = Math.round(100 * (1 - Math.exp(-1.6 * elapsed / expected)));
  const percent = status === "complete" ? 100 : status === "failed" ? 0 : Math.max(3, Math.min(95, estimated));
  return { percent, elapsedSeconds: Math.floor(elapsed / 1000), expectedSeconds: Math.round(expected / 1000), limitSeconds: Math.round(limitMs / 1000), slow: status !== "complete" && elapsed > expected * 1.6 };
}

export function needsPolling(snapshot: IntakeSnapshot | null) {
  if (!snapshot) return false;
  return ["queued", "running"].includes(snapshot.intake.job?.status ?? "");
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
  const rows = snapshot.coach.fields.filter(field => keys.includes(field.key) && plainText(field.value)).map(field => `${COACH_FIELD_LABELS[field.key]}: ${displayAmount(plainText(field.value))}${field.basis === "proposal" ? " (AI 제안)" : ""}`);
  return rows.length ? `${rows.join("\n")}\n미입력 금액은 0원으로 계산하지 않습니다.` : "아직 입력한 금액이 없습니다. 모르는 금액은 미정으로 남겨 둡니다.";
}

export function answerText(value: IntakeValue) {
  return Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);
}

/** Spec §3.3: completed months only ("지난달", "최근 N개월"), plus "올해" (to today) and "작년". Dates are Asia/Seoul. */
export const PERIOD_PRESETS = [
  { id: "last", label: "지난달", months: 1 },
  { id: "3m", label: "최근 3개월", months: 3 },
  { id: "6m", label: "최근 6개월", months: 6 },
  { id: "12m", label: "최근 12개월", months: 12 },
  { id: "year", label: "올해", months: 0 },
  { id: "lastYear", label: "작년", months: 0 },
] as const;
export type PeriodPresetId = (typeof PERIOD_PRESETS)[number]["id"];

export function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Calendar date in Asia/Seoul for an instant, as [year, monthIndex, day]. */
export function seoulDate(instant: Date): [number, number, number] {
  const text = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  const [year, month, day] = text.split("-").map(Number);
  return [year, month - 1, day];
}

const iso = (year: number, monthIndex: number, day: number) => `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const lastDayOf = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** "YYYY-MM-DD / YYYY-MM-DD" for a preset. Month presets cover whole completed months (ending the last day of the previous month). */
export function periodPresetRange(preset: PeriodPresetId, today = new Date()): string {
  const [year, month, day] = seoulDate(today);
  if (preset === "year") return `${iso(year, 0, 1)} / ${iso(year, month, day)}`;
  if (preset === "lastYear") return `${iso(year - 1, 0, 1)} / ${iso(year - 1, 11, 31)}`;
  const months = PERIOD_PRESETS.find(item => item.id === preset)?.months ?? 1;
  const end = new Date(Date.UTC(year, month, 0)); // last day of the previous month
  const start = new Date(Date.UTC(year, month - months, 1));
  return `${iso(start.getUTCFullYear(), start.getUTCMonth(), 1)} / ${iso(end.getUTCFullYear(), end.getUTCMonth(), lastDayOf(end.getUTCFullYear(), end.getUTCMonth()))}`;
}

/** Two ISO dates found in a stored period answer, for seeding the date pickers. */
export function periodDates(text: string): [string, string] | null {
  const [start, end] = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  return start && end ? [start, end] : null;
}

// ---- Select-first controls (spec §2): assembly, exclusivity, seeding, display ----

/** Draft storage key: the candidate question's free-text toggle sends questionId "business" but keeps its draft under "candidate". */
export function customCandidateDraftKey(questionId: string, custom?: boolean) {
  return custom && questionId === "business" ? "candidate" : questionId;
}

export type ChipQuestion = Pick<IntakeQuestion, "id" | "kind" | "options" | "unit">;
/** A group whose name starts with "filter:" narrows later chips but is never written into the answer. */
export const FILTER_GROUP_PREFIX = "filter:";
export const isFilterGroup = (group?: string) => !!group && group.startsWith(FILTER_GROUP_PREFIX);
/** Display titles for the lib's catalogue step keys (intake-options.ts CHIP_GROUPS); merged and single-purpose steps show no title. */
const GROUP_TITLES: Record<string, string> = { [CHIP_GROUPS.channelCommon]: "", [CHIP_GROUPS.channelSector]: "", [CHIP_GROUPS.prefill]: "", [CHIP_GROUPS.people]: "누가", [CHIP_GROUPS.period]: "기간", [CHIP_GROUPS.unit]: "단위", [CHIP_GROUPS.metric]: "목표", [CHIP_GROUPS.amount]: "금액", [CHIP_GROUPS.priceBasis]: "가격 기준" };
export const groupTitle = (group?: string) => group ? (GROUP_TITLES[group] ?? group.replace(FILTER_GROUP_PREFIX, "").trim()) : "";

/** Catalogue groups that render as one step: channel/problem "common" + "sector" form a single 8-chip grid (spec §1.3). */
export const stepKey = (group?: string) => group === CHIP_GROUPS.channelSector ? CHIP_GROUPS.channelCommon : group;

/** Step groups in first-appearance order; ungrouped options form one unnamed step; aliased groups merge. */
export function optionGroups(options: IntakeQuestion["options"] = []): Array<{ name: string | undefined; options: NonNullable<IntakeQuestion["options"]> }> {
  const groups: Array<{ name: string | undefined; options: NonNullable<IntakeQuestion["options"]> }> = [];
  for (const option of options) {
    const found = groups.find(group => stepKey(group.name) === stepKey(option.group));
    if (found) found.options.push(option); else groups.push({ name: option.group, options: [option] });
  }
  return groups;
}

/** Selected-array encoding for a typed count inside a multi-step chip question ("#20" → 20). Spec: goal/capacity steps live in AnswerDraft.selected. */
export const COUNT_PREFIX = "#";
export const selectedCount = (selected: string[]): number | undefined => {
  const item = selected.find(value => value.startsWith(COUNT_PREFIX));
  const number = item === undefined ? NaN : Number.parseFloat(item.slice(COUNT_PREFIX.length));
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};
export const withCount = (selected: string[], count: number | undefined) => [...selected.filter(value => !value.startsWith(COUNT_PREFIX)), ...(count === undefined ? [] : [`${COUNT_PREFIX}${count}`])];
const pickedLabel = (options: NonNullable<IntakeQuestion["options"]>, selected: string[], group: string) => options.find(option => option.group === group && selected.includes(option.value))?.label;
/** The goal "amount" step applies only to metrics written with "N원"; "N건" metrics take a count instead. */
export const metricNeedsAmount = (label?: string) => !!label && label.includes("N원");
export const metricNeedsCount = (label?: string) => !!label && label.includes("N건");

/** Whether step `index` is shown: sequential reveal, plus goal's amount step only for "N원" metrics. */
export function stepVisible(question: Pick<IntakeQuestion, "id" | "options">, groups: ReturnType<typeof optionGroups>, index: number, selected: string[]) {
  const group = groups[index];
  if (!group) return false;
  if (question.id === "goal" && group.name === CHIP_GROUPS.amount) return metricNeedsAmount(pickedLabel(question.options ?? [], selected, CHIP_GROUPS.metric));
  if (index === 0 || group.options.some(option => selected.includes(option.value))) return true;
  return groups.slice(0, index).every(previous => previous.options.some(option => selected.includes(option.value)));
}

/** A chip whose value starts with "skip:" records a deliberate step skip ("아직 모름·해당 없음") without adding text. */
export const SKIP_VALUE_PREFIX = "skip:";
export const isSkipOption = (option: { value: string }) => option.value.startsWith(SKIP_VALUE_PREFIX);

/** Sector for client-side ladders (amount ranges): the confirmed intake sector, else the rule-based reading of the business text, else general. */
export function intakeChipSector(snapshot: Pick<IntakeSnapshot, "intake" | "coach">): ProposalSector {
  if (snapshot.intake.sector !== "general") return snapshot.intake.sector;
  const field = snapshot.coach.fields.find(item => item.key === "business" && item.basis === "user")?.value;
  const answer = snapshot.intake.answers.business;
  const text = field ?? (answer?.status === "answered" && typeof answer.value === "string" ? answer.value : "");
  return text.trim() ? descriptionSector(text) : "general";
}

/** kind text + catalogue options = hybrid_text_chips (spec §2); business stays a prefill-only typing exception. */
export const isHybridQuestion = (question: Pick<IntakeQuestion, "id" | "kind" | "options">) => question.kind === "text" && question.id !== "business" && question.id !== "period" && !!question.options?.length;
export const isPrefillQuestion = (question: Pick<IntakeQuestion, "id" | "kind" | "options">) => question.kind === "text" && question.id === "business" && !!question.options?.length;

/** Picks allowed per step for a hybrid question (spec CHIP_LIMITS; detail ids match on their suffix). */
export function chipLimit(questionId: string) {
  // experience is a multi-pick set in the spec (§3.1) but absent from CHIP_LIMITS; keep a client fallback until the lib lists it.
  return CHIP_LIMITS[questionId] ?? CHIP_LIMITS[questionId.split(".").pop() ?? questionId] ?? (questionId === "experience" ? 3 : 1);
}

/** "없음 / 해당 없음 / 아님" chips clear the rest of their step and are cleared by any other pick (client-only rule, spec §7). */
export const isExclusiveOption = (label: string) => /없음|아님|모름/.test(label) || label.startsWith(SKIP_VALUE_PREFIX);
export const hasExclusiveOptions = (question: Pick<IntakeQuestion, "options">) => !!question.options?.some(option => isExclusiveOption(option.label));

/** Toggle one chip inside its step, applying exclusivity and the per-step limit (limit 1 replaces). */
export function toggleChip(question: ChipQuestion, selected: string[], value: string, limit = question.kind === "multi" ? Number.POSITIVE_INFINITY : chipLimit(question.id)): string[] {
  const options = question.options ?? [];
  const option = options.find(item => item.value === value);
  if (!option) return selected;
  if (selected.includes(value)) return selected.filter(item => item !== value);
  const sameStep = (item: string) => { const candidate = options.find(entry => entry.value === item); return !!candidate && stepKey(candidate.group) === stepKey(option.group); };
  let next = selected.filter(item => !sameStep(item) || !isExclusiveOption(options.find(candidate => candidate.value === item)!.label) && !isExclusiveOption(option.label));
  const inStep = next.filter(sameStep);
  const stepLimit = isFilterGroup(option.group) ? 1 : limit;
  if (inStep.length >= stepLimit) next = stepLimit === 1 ? next.filter(item => !sameStep(item)) : next;
  if (next.filter(sameStep).length >= stepLimit) return next;
  return [...next, value];
}

/** Text pieces of a stored hybrid answer that are not chip labels (free supplements). */
export function unmatchedPieces(question: Pick<IntakeQuestion, "id" | "options">, text: string): string[] {
  const labels = new Set((question.options ?? []).map(option => option.label));
  return splitAssembledAnswer(text).flat().filter(piece => !labels.has(piece) && composedSelection(question, [piece]).length === 0);
}

/** Assembled answer text: step picks in catalogue order joined by " / ", picks inside a step by ", ", free supplements last. Filter steps are omitted. */
export function assembleHybridText(question: Pick<IntakeQuestion, "id" | "options">, selected: string[], extra: string[] = []): string {
  const options = question.options ?? [];
  if (question.id === "capacity") {
    // '대표자 혼자 / 하루 20건': people step, then period + count + unit as one piece (count optional).
    const people = options.filter(option => option.group === CHIP_GROUPS.people && selected.includes(option.value)).map(option => option.label);
    const period = pickedLabel(options, selected, CHIP_GROUPS.period), unit = pickedLabel(options, selected, CHIP_GROUPS.unit), count = selectedCount(selected);
    const volume = count !== undefined ? `${period ? `${period} ` : ""}${count.toLocaleString("ko-KR")}${unit ?? ""}` : period ?? "";
    return assembleAnswer([people, [volume], extra]);
  }
  if (question.id === "goal") {
    // '6개월 안에 월 매출 300만원': the metric is required; "기간 미정" saves the metric alone; N원 / N건 are filled from the amount step or the count.
    const period = pickedLabel(options, selected, CHIP_GROUPS.period), metric = pickedLabel(options, selected, CHIP_GROUPS.metric);
    if (!metric) return assembleAnswer([extra]);
    const amount = pickedLabel(options, selected, CHIP_GROUPS.amount), count = selectedCount(selected);
    const filled = metric.replace("N원", amount ?? "N원").replace("N건", count === undefined ? "N건" : `${count.toLocaleString("ko-KR")}건`);
    return assembleAnswer([[`${period && period !== "기간 미정" ? `${period} ` : ""}${filled}`], extra]);
  }
  const steps = optionGroups(options).filter(group => !isFilterGroup(group.name)).map(group => group.options.filter(option => selected.includes(option.value) && !isSkipOption(option)).map(option => option.label));
  return assembleAnswer([...steps, extra]);
}

/** Selected values that only belong to filter steps (never saved on their own). */
export function onlyFilterSelected(question: Pick<IntakeQuestion, "options">, selected: string[]) {
  const options = question.options ?? [];
  const picked = options.filter(option => selected.includes(option.value));
  return picked.length > 0 && picked.every(option => isFilterGroup(option.group));
}

/** Text that must not be saved as an answer: a "○○" placeholder left in a sentence chip, or a dangling separator. */
export function unfinishedAnswerText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/○○|〇〇|◯◯/.test(trimmed)) return true;
  if (/N원|N건/.test(trimmed)) return true; // goal metric placeholder not yet filled
  // Trailing " / ", ", ", " — " or ":" means a step or a supplement was started but not filled.
  return [STEP_SEPARATOR.trim(), LIST_SEPARATOR.trim(), "—", "–", ":"].some(separator => trimmed.endsWith(separator));
}

/** Number text for a stepper/keypad: JS number, "10시간", "12,000원" or "120만원" → digits; prose stays undefined. */
export function numericAnswer(question: Pick<IntakeQuestion, "unit">, value: IntakeValue): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const raw = value.replace(/\s/g, "");
  if (question.unit === "원") return coachAmount(raw);
  const match = raw.replace(/,/g, "").match(new RegExp(`^(\\d+(?:\\.\\d+)?)(?:${question.unit ?? ""})?$`));
  return match ? Number.parseFloat(match[1]) : undefined;
}

/** Draft restored for editing (spec §6 Phase 2 seed rules). */
export function seedAnswerDraft(question: IntakeQuestion, value: IntakeValue, candidateIdeas: IntakeSnapshot["candidateIdeas"] = []): AnswerDraft {
  const base: AnswerDraft = { text: "", selected: [], custom: false, label: question.label };
  if (value === null) return base;
  if (question.id === "period") return { ...base, text: answerText(value) };
  if (question.id === "candidate") {
    const id = String(value);
    return candidateIdeas.some(idea => idea.id === id) ? { ...base, selected: [id] } : { ...base, hint: id };
  }
  if (question.kind === "single" || question.kind === "multi") {
    const values = Array.isArray(value) ? value : [String(value)];
    const known = values.filter(item => question.options?.some(option => option.value === item || option.label === item)).map(item => question.options!.find(option => option.value === item || option.label === item)!.value);
    const unknown = values.filter(item => !question.options?.some(option => option.value === item || option.label === item));
    return { ...base, selected: [...new Set(known)], text: unknown.join(LIST_SEPARATOR) };
  }
  if (question.kind === "number") {
    const number = numericAnswer(question, value);
    return number === undefined ? { ...base, hint: answerText(value) } : { ...base, text: String(number) };
  }
  const text = answerText(value);
  if (question.options?.length) {
    const pieces = splitAssembledAnswer(text).flat();
    const selected = pieces.flatMap(piece => { const option = question.options!.find(item => item.label === piece); return option ? [option.value] : []; });
    return { ...base, text, selected: [...new Set([...selected, ...composedSelection(question, pieces)])] };
  }
  return { ...base, text };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Reverse the capacity / goal compositions ("하루 20건", "6개월 안에 월 매출 300만원") back into step values and a count. */
function composedSelection(question: Pick<IntakeQuestion, "id" | "options">, pieces: string[]): string[] {
  const options = question.options ?? [];
  const inGroup = (group: string) => options.filter(option => option.group === group);
  if (question.id === "capacity") {
    for (const piece of pieces) {
      const period = inGroup(CHIP_GROUPS.period).find(option => piece.startsWith(option.label));
      const rest = period ? piece.slice(period.label.length).trim() : piece;
      const match = rest.replace(/,/g, "").match(/^(\d+)(.*)$/);
      const unit = match ? inGroup(CHIP_GROUPS.unit).find(option => option.label === match[2].trim()) : undefined;
      if (match && unit) return [...(period ? [period.value] : []), unit.value, `${COUNT_PREFIX}${match[1]}`];
    }
    return [];
  }
  if (question.id === "goal") {
    for (const piece of pieces) {
      const period = inGroup(CHIP_GROUPS.period).find(option => option.label !== "기간 미정" && piece.startsWith(option.label));
      const rest = period ? piece.slice(period.label.length).trim() : piece;
      for (const metric of inGroup(CHIP_GROUPS.metric)) {
        const pattern = new RegExp(`^${escapeRegExp(metric.label).replace("N원", "(.+?원)").replace("N건", "(\\d[\\d,]*)건")}$`);
        const match = rest.match(pattern);
        if (!match) continue;
        const amount = metricNeedsAmount(metric.label) ? inGroup(CHIP_GROUPS.amount).find(option => option.label === match[1]) : undefined;
        const count = metricNeedsCount(metric.label) && match[1] ? [`${COUNT_PREFIX}${match[1].replace(/,/g, "")}`] : [];
        return [...(period ? [period.value] : []), metric.value, ...(amount ? [amount.value] : []), ...count];
      }
    }
  }
  return [];
}

/** Display formatting for stored amounts: "3000000원" / "300만원" → "3,000,000원"; anything unparsable stays as written. */
export function displayAmount(value: string) {
  const amount = coachAmount(value);
  return amount === undefined ? value : formatWon(amount);
}

/** Summary value for a question: candidate title, amounts formatted, numbers with unit and period ("30건 / 시간"), choices as labels. */
export function summaryAnswerText(question: Pick<IntakeQuestion, "id" | "kind" | "options" | "unit" | "period">, value: IntakeValue, candidateIdeas: IntakeSnapshot["candidateIdeas"] = []): string {
  if (value === null) return "";
  if (question.id === "candidate") return candidateIdeas.find(idea => idea.id === value)?.title ?? String(value);
  if (question.kind === "number") {
    const number = numericAnswer(question, value);
    if (number === undefined) return answerText(value);
    const amount = question.unit === "원" ? formatWon(number) : `${number.toLocaleString("ko-KR")}${question.unit ?? ""}`;
    return question.period ? `${amount} / ${question.period}` : amount;
  }
  if (question.unit === "원" && typeof value === "string") return displayAmount(value);
  const label = (item: string) => question.options?.find(option => option.value === item)?.label ?? item;
  return Array.isArray(value) ? value.map(label).join(LIST_SEPARATOR) : label(String(value));
}
