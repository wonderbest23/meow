import { COACH_FIELD_LABELS } from "./coach-presentation";
import { coachAmount } from "./coach-feasibility";
import { coachDocumentRevision, coachFinancialReference, type CoachField, type CoachState } from "./coach";
import { coreQuestions, detailQuestions, getIntakeQuestion, intakeCandidates, intakeSectorOptions, type IntakeMode, type IntakeQuestion } from "./intake-questions";
import { PROPOSAL_SECTORS, type ProposalSector } from "./proposal-blueprint";
import { INTAKE_KEY, INTAKE_VERSION, type IntakeCandidate, type IntakeCommand, type IntakeSnapshot, type IntakeState, type IntakeValue } from "./intake-types";
import type { ServerPlan } from "./plan-server-store";

export class IntakeError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function readIntake(answers: ServerPlan["answers"]): IntakeState | null {
  const value = answers[INTAKE_KEY]?.state as IntakeState | undefined;
  return value?.version === INTAKE_VERSION && value.answers && Array.isArray(value.notes) && Array.isArray(value.candidates) ? value : null;
}

export function createIntake(coach: CoachState, mode: IntakeMode, at: string): IntakeState {
  const sector = PROPOSAL_SECTORS.find(value => value === coach.business.industry || intakeSectorOptions.find(option => option.value === value)?.label === coach.business.industry) ?? "general";
  const state: IntakeState = { version: INTAKE_VERSION, packVersion: "2026-09-16.1", mode: coach.stage === "operating" ? "operating" : mode, sector, answers: {}, detailsRequested: false, notes: [], candidates: [], job: null, receipts: [], legacyImported: coach.messages.length > 0 };
  for (const question of coreQuestions(state.mode)) {
    const field = coach.fields.find(value => value.key === question.fieldKey && value.basis === "user");
    if (field) state.answers[question.id] = { status: "answered", value: field.value, messageId: field.messageId, at, quote: field.quote };
  }
  if (coach.business.industry) state.answers.industry = { status: "answered", value: sector, messageId: "legacy-industry", at };
  return state;
}

function candidateAnswers(intake: IntakeState, coach: CoachState) {
  return Object.fromEntries(Object.entries(intake.answers).map(([key, answer]) => [key, coach.fields.find(field => field.key === key && field.basis === "user")?.value ?? answer.value]));
}

export function intakeQuestions(intake: IntakeState, coach: CoachState): IntakeQuestion[] {
  const ideas = intakeCandidates(candidateAnswers(intake, coach));
  return [...coreQuestions(intake.mode), ...(intake.detailsRequested ? detailQuestions(intake.sector) : [])]
    .filter(question => question.id !== "candidate" || !coach.fields.some(field => field.key === "business" && field.basis === "user") || !!intake.answers.candidate)
    .map(question => question.id === "candidate" ? { ...question, options: ideas.map(idea => ({ value: idea.id, label: idea.title })) } : question);
}

export function answeredIntakeQuestion(intake: IntakeState, coach: CoachState, question: IntakeQuestion) {
  if (intake.answers[question.id]) return true;
  return !!question.fieldKey && coach.fields.some(field => field.key === question.fieldKey && field.basis === "user");
}

export function intakeSnapshot(plan: ServerPlan, coach: CoachState, intake: IntakeState): IntakeSnapshot {
  const questions = intakeQuestions(intake, coach);
  const coreIds = new Set(coreQuestions(intake.mode).map(question => question.id));
  const core = questions.filter(question => coreIds.has(question.id));
  const answered = core.filter(question => answeredIntakeQuestion(intake, coach, question)).length;
  const { receipts: _receipts, ...publicIntake } = intake;
  publicIntake.answers = structuredClone(intake.answers);
  for (const field of coach.fields.filter(item => item.basis === "user")) {
    const id = questions.find(question => question.fieldKey === field.key)?.id ?? (publicIntake.answers[field.key] ? field.key : null);
    if (id) publicIntake.answers[id] = { status: "answered", value: field.value, messageId: field.messageId, at: plan.updatedAt, quote: field.quote };
  }
  const summary: IntakeSnapshot["summary"] = coach.fields.map(field => ({ id: field.key, label: COACH_FIELD_LABELS[field.key], value: field.value, basis: field.basis }));
  for (const question of questions) {
    if (question.fieldKey || !intake.answers[question.id] || question.id === "candidate") continue;
    const answer = intake.answers[question.id];
    const value = answer.status === "unknown" ? "아직 미정" : question.options?.find(option => option.value === answer.value)?.label ?? displayIntakeValue(answer.value);
    summary.push({ id: question.id, label: question.label, value, basis: "user" });
  }
  return { planId: plan.id, title: plan.title, planType: plan.planType, updatedAt: plan.updatedAt, coach,
    intake: publicIntake, nextQuestion: questions.find(question => !answeredIntakeQuestion(intake, coach, question)) ?? null,
    questions, coreComplete: answered === core.length, coreAnswered: answered, coreTotal: core.length,
    summary, financialSummary: coachFinancialReference(coach), hasDocuments: Object.keys(plan.sections).length > 0,
    candidateIdeas: intakeCandidates(candidateAnswers(intake, coach)),
    pendingExtraction: intake.notes.some(note => ["queued", "processing"].includes(note.status)) || intake.candidates.some(candidate => candidate.status === "pending"),
  };
}

export function displayIntakeValue(value: IntakeValue): string {
  return Array.isArray(value) ? value.join(", ") : value === null ? "" : String(value);
}

export function intakeFieldRevision(coach: CoachState, intake: Pick<IntakeState, "mode" | "answers">, key: CoachField["key"]): string | null {
  const field = coach.fields.find(item => item.key === key);
  if (field) return field.messageId || null;
  const question = coreQuestions(intake.mode).find(item => item.fieldKey === key);
  return intake.answers[question?.id ?? key]?.messageId ?? null;
}

function validatedAnswer(question: IntakeQuestion, value: IntakeValue | undefined): IntakeValue {
  if (value === undefined || value === null || !displayIntakeValue(value).trim()) throw new IntakeError("answer_required", "답을 입력하거나 아직 미정을 선택해 주세요");
  if (displayIntakeValue(value).length > 1200) throw new IntakeError("answer_too_long", "답변은 1,200자 이내로 입력해 주세요. 긴 내용은 자유 메모에 보관할 수 있어요");
  if (question.kind !== "multi" && Array.isArray(value)) throw new IntakeError(question.kind === "number" ? "invalid_number" : "invalid_answer", "이 질문에는 하나의 답변을 입력해 주세요");
  if (question.id === "period") {
    const dates = String(value).match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    const valid = dates.length === 2 && dates.every(date => {
      const time = Date.parse(`${date}T00:00:00Z`);
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
    });
    if (!valid || dates[0] > dates[1]) throw new IntakeError("invalid_period", "실적 기간의 시작일과 종료일을 YYYY-MM-DD / YYYY-MM-DD 형식으로 확인해 주세요");
    return `${dates[0]} / ${dates[1]}`;
  }
  if (question.kind === "single") {
    if (!question.options?.some(option => option.value === value)) throw new IntakeError("invalid_option", "현재 질문의 선택지를 골라 주세요");
    return value;
  }
  if (question.kind === "multi") {
    if (!Array.isArray(value) || !value.length || value.some(item => !question.options?.some(option => option.value === item))) throw new IntakeError("invalid_option", "현재 질문의 선택지를 골라 주세요");
    return [...new Set(value)];
  }
  if (question.kind === "number") {
    const raw = String(value).trim();
    const number = question.unit === "원" ? coachAmount(raw) : new RegExp(`^\\d+(?:\\.\\d+)?(?:\\s*${question.unit ?? ""})?$`).test(raw) ? Number.parseFloat(raw) : undefined;
    if (number === undefined || !Number.isFinite(number) || number < 0 || number > 1e14 || question.unit === "%" && number > 100 || question.fieldKey === "hoursPerWeek" && number > 168) throw new IntakeError("invalid_number", "단위에 맞는 0 이상의 숫자를 입력해 주세요. 모르는 값은 미정으로 남겨 주세요");
    return number;
  }
  return String(value).trim();
}

function setField(coach: CoachState, key: CoachField["key"], value: string | null, messageId: string, quote: string) {
  const fields = coach.fields.filter(field => field.key !== key);
  if (value !== null) fields.push({ key, value, basis: "user", messageId, quote });
  coach.fields = fields;
  if (key === "business") {
    coach.business.description = value ?? "";
    if (value && (!coach.business.name || ["새 사업 구상", "새 사업 진단"].includes(coach.business.name))) coach.business.name = value.slice(0, 60);
    if (value && !coach.ideaOrigin) coach.ideaOrigin = { text: value, messageId };
  }
}

export function intakeBusinessFingerprint(coach: CoachState, answers: ServerPlan["answers"]) {
  const valueOnly = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const record = input as Record<string, unknown>;
    return { value: record.value ?? null, unit: record.unit ?? null, period: record.period ?? null, basis: record.basis ?? "user", quote: record.quote ?? "" };
  };
  return JSON.stringify({ stage: coach.stage, depth: coach.depth, business: coach.business,
    fields: [...coach.fields].sort((a, b) => a.key.localeCompare(b.key)).map(({ key, value, basis, quote }) => ({ key, value, basis, quote })),
    details: Object.fromEntries(Object.entries(answers["intake/details"] ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, valueOnly(value)])), period: valueOnly(answers["intake/period"]) });
}

export function applyIntakeAnswer(plan: ServerPlan, coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  const id = command.questionId;
  const questions = intakeQuestions(intake, coach);
  const question = questions.find(item => item.id === id)
    ?? (id === "business" || id === "industry" ? getIntakeQuestion("startup", intake.sector, id) : undefined);
  if (!question) throw new IntakeError("question_unknown", "이 사업의 질문을 다시 불러와 주세요");
  const previousAnswer = intake.answers[question.id];
  const value = command.unknown ? null : validatedAnswer(question, command.value);
  const quote = displayIntakeValue(command.value ?? null);
  intake.answers[question.id] = { status: command.unknown ? "unknown" : "answered", value, messageId: command.requestId, at, quote };
  if (question.fieldKey) setField(coach, question.fieldKey, value === null ? null : `${displayIntakeValue(value)}${question.kind === "number" ? question.unit ?? "" : ""}`, command.requestId, quote);
  if (question.id === "industry") {
    intake.sector = value === null ? "general" : value as ProposalSector;
    coach.business.industry = value === null ? "" : intakeSectorOptions.find(option => option.value === value)?.label ?? String(value);
  }
  if (question.id === "candidate" && value !== null) {
    const idea = intakeCandidates(candidateAnswers(intake, coach)).find(item => item.id === value);
    if (!idea) throw new IntakeError("candidate_unknown", "현재 사업 후보를 다시 확인해 주세요");
    setField(coach, "business", idea.description, command.requestId, `선택한 구상: ${idea.title}`);
    coach.business.name = idea.title; intake.sector = idea.sector;
    coach.business.industry = intakeSectorOptions.find(option => option.value === idea.sector)?.label ?? idea.sector;
  }
  if (question.id === "candidate" && value === null && coach.fields.some(field => field.key === "business" && field.messageId === previousAnswer?.messageId)) {
    setField(coach, "business", null, command.requestId, "");
    coach.business.name = "새 사업 구상";
    intake.sector = "general"; coach.business.industry = "";
  }
  if (question.id === "industry" || question.id === "candidate") {
    const activeDetails = detailQuestions(intake.sector);
    // Inactive answers remain in the question audit, never in the current document source.
    plan.answers["intake/details"] = Object.fromEntries(activeDetails.flatMap(detail => {
      const answer = intake.answers[detail.id];
      if (!answer) return [];
      return [[detail.id, plan.answers["intake/details"]?.[detail.id] ?? { value: answer.value, unit: detail.unit ?? null, period: detail.period ?? null, messageId: answer.messageId, quote: answer.quote ?? displayIntakeValue(answer.value) }]];
    }));
  }
  if (question.id === "period") plan.answers["intake/period"] = { value, basis: "user", messageId: command.requestId };
  if (detailQuestions(intake.sector).some(item => item.id === question.id)) plan.answers["intake/details"] = { ...(plan.answers["intake/details"] ?? {}), [question.id]: { value, unit: question.unit ?? null, period: question.period ?? null, messageId: command.requestId, quote } };
  coach.stage = intake.mode === "operating" ? "operating" : coach.fields.some(field => field.key === "business" && field.basis === "user") ? "startup" : "exploring";
  coach.business.stage = coach.stage === "operating" ? "운영 중" : "사업 기획";
  coach.ready = coach.stage !== "exploring" && !!coach.fields.find(field => field.key === "business" && field.basis === "user")?.value;
  const selected = question.options?.find(option => option.value === value)?.label;
  coach.messages.push({ id: command.requestId, role: "user", text: `${question.label}: ${command.unknown ? "아직 미정" : selected ?? quote}`, at });
}

export function applyIntakeCandidates(coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  const accept = new Set(command.candidateIds ?? []), reject = new Set(command.rejectIds ?? []), overwrite = new Set(command.overwriteIds ?? []);
  if ([...accept].some(id => reject.has(id))) throw new IntakeError("candidate_choice", "같은 내용은 반영과 제외 중 하나만 선택해 주세요");
  const selected: IntakeCandidate[] = [...accept, ...reject].map(id => {
    const candidate = intake.candidates.find(item => item.id === id && item.status === "pending");
    if (!candidate) throw new IntakeError("candidate_unknown", "이미 처리한 정리 결과예요. 최신 내용을 확인해 주세요", 409);
    return candidate;
  });
  const keys = selected.filter(candidate => accept.has(candidate.id)).map(candidate => candidate.fieldKey);
  if (new Set(keys).size !== keys.length) throw new IntakeError("ambiguous_candidate", "같은 항목에는 하나의 값만 선택해 주세요");
  for (const candidate of selected) {
    if (!accept.has(candidate.id)) continue;
    const current = coach.fields.find(field => field.key === candidate.fieldKey)?.value ?? null;
    const edited = candidate.baseFieldRevision !== undefined && intakeFieldRevision(coach, intake, candidate.fieldKey) !== candidate.baseFieldRevision;
    if ((current !== candidate.baseValue || edited) && current !== candidate.value && !overwrite.has(candidate.id)) throw new IntakeError("candidate_conflict", "정리하는 동안 직접 바꾼 항목이 있어요. 현재 값과 비교한 뒤 반영해 주세요", 409);
  }
  for (const candidate of selected) {
    if (!accept.has(candidate.id)) { candidate.status = "rejected"; continue; }
    setField(coach, candidate.fieldKey, candidate.value, candidate.noteId, candidate.quote);
    const question = coreQuestions(intake.mode).find(item => item.fieldKey === candidate.fieldKey);
    if (question) intake.answers[question.id] = { value: candidate.value, status: "answered", messageId: candidate.noteId, at, quote: candidate.quote };
    candidate.status = "applied";
  }
  coach.stage = intake.mode === "operating" ? "operating" : coach.fields.some(field => field.key === "business" && field.basis === "user") ? "startup" : "exploring";
  coach.business.stage = coach.stage === "operating" ? "운영 중" : "사업 기획";
  coach.ready = coach.stage !== "exploring" && !!coach.fields.find(field => field.key === "business" && field.basis === "user")?.value;
}

export function finishIntakeMutation(coach: CoachState, before: string, answers: ServerPlan["answers"]) {
  const changed = before !== intakeBusinessFingerprint(coach, answers);
  const documentRevision = coachDocumentRevision(coach);
  coach.revision += 1;
  coach.documentRevision = documentRevision + Number(changed);
  if (changed) {
    if (coach.directAction) coach.directAction = { ...coach.directAction, needsReview: true };
  }
  return changed;
}
