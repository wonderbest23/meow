import { createHash } from "node:crypto";
import { z } from "zod";
import { completeJson } from "../llm/complete";
import { resolvePlanningLLMConfig } from "../llm/config";
import { COACH_KEY, COACH_TYPES, coachContext, coachDocumentRevision, readCoach, type CoachState } from "./coach";
import { emptyCoach } from "./coach-job";
import { BUSINESS_DESIGN_RULES, businessDesignReply, businessDesignSchema } from "./coach-design";
import { loadPlanState, savePlanState, type ServerPlan } from "./plan-server-store";
import { INTAKE_KEY, type IntakeCommand, type IntakeJob, type IntakeJobRequest, type IntakeState } from "./intake-types";
import { applyIntakeAnswer, applyIntakeCandidates, createIntake, finishIntakeMutation, IntakeError, intakeBusinessFingerprint, intakeFieldRevision, intakeSnapshot, readIntake } from "./intake-core";
import { COACH_FIELD_LABELS } from "./coach-presentation";
import { extractIntakeFields, helpIntake, parseIntakeNote } from "./intake-extraction";
import { getServerSupabase } from "../persistence";
import { rateLimit } from "../rate-limit";
import { confirmedIntakeContext } from "./intake-context";

export const intakeCommandSchema = z.object({
  action: z.enum(["start", "answer", "message", "note", "confirm-extraction", "details", "extract", "extract-pending", "help", "design", "prepare"]),
  planId: z.string().min(1).max(60).optional(), revision: z.number().int().nonnegative().default(0), requestId: z.string().uuid(),
  mode: z.enum(["exploring", "startup", "operating"]).optional(), questionId: z.string().max(100).optional(),
  value: z.union([z.string().max(1200), z.number().finite(), z.array(z.string().max(200)).max(12), z.null()]).optional(),
  unknown: z.boolean().optional(), message: z.string().trim().max(8000).optional(),
  noteIntent: z.enum(["memo", "question"]).optional(),
  candidateIds: z.array(z.string().max(160)).max(24).optional(), rejectIds: z.array(z.string().max(160)).max(24).optional(), overwriteIds: z.array(z.string().max(160)).max(24).optional(),
}).strict();

function nextTimestamp(previous?: string) { return new Date(Math.max(Date.now(), (Date.parse(previous ?? "") || 0) + 1)).toISOString(); }
function active(job: IntakeJob | null) { return !!job && ["queued", "running"].includes(job.status); }
function fields(coach: CoachState) { return Object.fromEntries(coach.fields.map(field => [field.key, field.value])); }
function commandSignature(command: IntakeCommand) { return createHash("sha256").update(JSON.stringify(command)).digest("hex"); }

function storeDeferredNote(coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  if (!command.message) throw new IntakeError("message_required", "남길 내용을 입력해 주세요");
  const chunks = command.message.match(/[\s\S]{1,4000}/g) ?? [];
  if (intake.notes.length + chunks.length > 64 || intake.notes.reduce((sum, note) => sum + note.text.length, 0) + command.message.length > 100_000) throw new IntakeError("notes_limit", "메모가 많아요. 저장된 내용을 정리한 뒤 이어가 주세요", 413);
  intake.notes.push(...chunks.map((text, index) => ({ id: `${command.requestId}:${index}`, text, at, status: "stored" as const, intent: command.noteIntent ?? "memo" as const })));
  coach.messages.push({ id: command.requestId, role: "user", text: command.message, at });
}

export function newIntakeJob(coach: CoachState, intake: IntakeState, kind: IntakeJob["kind"], at: string, request?: string): IntakeJob | null {
  if (active(intake.job)) return null;
  const noteIds: string[] = []; let count = 0;
  if (kind === "extract") for (const note of intake.notes.filter(note => note.status === "queued")) {
    if (count + note.text.length > 8000) break;
    count += note.text.length; noteIds.push(note.id);
  }
  if (kind === "extract" && !noteIds.length) return null;
  const id = crypto.randomUUID();
  const baseFieldRevisions = Object.fromEntries((Object.keys(COACH_FIELD_LABELS) as CoachState["fields"][number]["key"][]).map(key => [key, intakeFieldRevision(coach, intake, key)]));
  const job: IntakeJob = { id, runId: `intake-${id}`, kind, status: "queued", noteIds, baseValues: fields(coach), baseFieldRevisions, baseDocumentRevision: coachDocumentRevision(coach), updatedAt: at, ...(request ? { request } : {}) };
  intake.job = job;
  return job;
}

export async function saveIntakeCommand(ownerHash: string, input: IntakeCommand, options: { aiAvailable?: boolean; aiAllowed?: boolean } = {}) {
  const command = intakeCommandSchema.parse(input), signature = commandSignature(command);
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await loadPlanState(ownerHash);
    let plan = state.plans.find(item => item.id === (command.planId ?? `plan_${command.requestId}`));
    if (command.planId && !plan) throw new IntakeError("not_found", "사업을 찾을 수 없어요", 404);
    if (!plan && command.action !== "start") throw new IntakeError("start_required", "먼저 사업 진단을 시작해 주세요");
    const previous = plan && readCoach(plan.answers), savedIntake = plan && readIntake(plan.answers);
    const receipt = savedIntake?.receipts.find(item => item.id === command.requestId);
    if (receipt) {
      if (receipt.signature !== signature) throw new IntakeError("request_reused", "같은 요청 번호로 다른 내용을 저장할 수 없어요", 409);
      return { plan: plan!, snapshot: intakeSnapshot(plan!, previous!, savedIntake!), job: savedIntake!.job?.status === "queued" && !savedIntake!.job.dispatched ? savedIntake!.job : null, duplicate: true };
    }
    if ((previous?.revision ?? 0) !== command.revision) throw new IntakeError("revision_conflict", "다른 화면에서 수정됐어요. 입력은 보관하고 최신 내용과 비교해 주세요", 409);
    if (plan && !previous) throw new IntakeError("legacy_plan", "이 문서는 기존 사업 편집 화면에서 계속할 수 있어요", 409);
    if (previous?.messages.some(message => message.id === command.requestId)) throw new IntakeError("request_reused", "이미 사용한 요청 번호예요", 409);
    if (!plan && state.plans.filter(item => readCoach(item.answers)).length >= 20) throw new IntakeError("plan_limit", "기존 사업에서 이어가거나 사용하지 않는 사업을 정리해 주세요", 429);
    const oldAt = plan?.updatedAt ?? null, at = nextTimestamp(oldAt ?? undefined);
    const coach = structuredClone(previous ?? emptyCoach());
    if (!plan) {
      plan = { id: `plan_${command.requestId}`, title: "새 사업 진단", planType: COACH_TYPES.startup, createdAt: at, updatedAt: at, answers: {}, sections: {} };
      state.plans.push(plan);
    }
    const intake = structuredClone(savedIntake ?? createIntake(coach, command.mode ?? (coach.stage === "operating" ? "operating" : "startup"), at));
    if (!savedIntake && plan.answers.__coach_job) {
      plan.answers.__intake_legacy_job = structuredClone(plan.answers.__coach_job);
      plan.answers.__coach_job = { ...plan.answers.__coach_job, token: crypto.randomUUID(), status: "failed", updatedAt: at };
    }
    const before = intakeBusinessFingerprint(coach, plan.answers);
    if (active(intake.job) && Date.now() - Date.parse(intake.job!.updatedAt) > 120_000) {
      intake.job = { ...intake.job!, status: "failed", error: "응답 확인 시간이 지났어요. 원문은 보관되어 있어요", updatedAt: at };
      intake.notes = intake.notes.map(note => intake.job!.noteIds.includes(note.id) ? { ...note, status: "failed" } : note);
    }
    let created: IntakeJob | null = null;
    if (command.action === "start") {
      if (savedIntake && command.mode && command.mode !== intake.mode) throw new IntakeError("mode_conflict", "진행 중인 사업 유형은 새 사업 진단에서 선택해 주세요", 409);
      if (command.message && (savedIntake || command.questionId !== undefined || command.value !== undefined)) throw new IntakeError("invalid_start", "처음 남긴 이야기와 답변은 구분해 저장해 주세요");
      if (command.questionId !== undefined || command.value !== undefined) {
        if (savedIntake) throw new IntakeError("start_exists", "이미 시작한 대화에서는 답변 수정으로 이어가 주세요", 409);
        if (command.questionId !== "business" || typeof command.value !== "string" || !command.value.trim() || command.unknown) throw new IntakeError("invalid_start", "처음 이야기할 사업 내용을 입력해 주세요");
        // Persist the first typed answer and new conversation in the same CAS write.
        applyIntakeAnswer(plan, coach, intake, { ...command, action: "answer" }, at);
      }
      if (command.message) storeDeferredNote(coach, intake, command, at);
      coach.stage = intake.mode === "operating" ? "operating" : intake.mode === "exploring" && !coach.fields.some(field => field.key === "business") ? "exploring" : "startup";
      coach.business.stage = coach.stage === "operating" ? "운영 중" : "사업 기획";
      if (plan.answers.__coach_job) {
        plan.answers.__intake_legacy_job = structuredClone(plan.answers.__coach_job);
        plan.answers.__coach_job = { ...plan.answers.__coach_job, token: crypto.randomUUID(), status: "failed", updatedAt: at };
      }
    } else if (command.action === "answer") applyIntakeAnswer(plan, coach, intake, command, at);
    else if (command.action === "details") intake.detailsRequested = true;
    else if (command.action === "confirm-extraction") applyIntakeCandidates(coach, intake, command, at);
    else if (command.action === "note") storeDeferredNote(coach, intake, command, at);
    else if (command.action === "message") {
      if (!command.message) throw new IntakeError("message_required", "메모 내용을 입력해 주세요");
      if (intake.notes.length >= 64 || intake.notes.reduce((total, note) => total + note.text.length, 0) + command.message.length > 100_000) throw new IntakeError("notes_limit", "메모가 많아요. 저장된 내용을 항목별로 정리한 뒤 이어가 주세요", 413);
      const chunks = command.message.match(/[\s\S]{1,4000}/g) ?? [];
      for (const [index, text] of chunks.entries()) {
        const id = `${command.requestId}:${index}`;
        const parsed = parseIntakeNote(text, id);
        intake.notes.push({ id, text, at, status: parsed.needsAI ? "queued" : parsed.candidates.length ? "review" : "stored" });
        intake.candidates.push(...parsed.candidates.map((candidate, ordinal) => ({ ...candidate, id: `${id}:rule:${ordinal}`, baseValue: coach.fields.find(field => field.key === candidate.fieldKey)?.value ?? null, baseFieldRevision: intakeFieldRevision(coach, intake, candidate.fieldKey), status: "pending" as const })));
      }
      coach.messages.push({ id: command.requestId, role: "user", text: command.message, at });
      if (options.aiAvailable && options.aiAllowed) created = newIntakeJob(coach, intake, "extract", at);
      else intake.notes = intake.notes.map(note => note.status === "queued" ? { ...note, status: "failed" } : note);
    } else if (["extract", "extract-pending", "help", "design"].includes(command.action)) {
      if (active(intake.job)) throw new IntakeError("ai_busy", "앞선 AI 작업이 진행 중이에요. 질문 답변과 직접 수정은 계속할 수 있어요", 409);
      if (!options.aiAvailable) throw new IntakeError("ai_unavailable", "AI 정리는 지금 연결되지 않았어요. 입력과 직접 수정은 계속할 수 있어요", 503);
      if (!options.aiAllowed) throw new IntakeError("ai_limit", "AI 이용 한도에 도달했어요. 기본 진단과 직접 수정은 계속할 수 있어요", 429);
      if (command.action === "extract") intake.notes = intake.notes.map(note => note.status === "failed" || note.status === "stored" && note.intent === "memo" ? { ...note, status: "queued" } : note);
      if (command.action === "help" && !command.message) throw new IntakeError("message_required", "사업과 관련해 궁금한 점을 입력해 주세요");
      if (command.action === "design" && !coach.ready) throw new IntakeError("business_required", "사업 후보를 선택하거나 생각한 사업을 먼저 입력해 주세요");
      created = newIntakeJob(coach, intake, command.action === "extract-pending" ? "extract" : command.action as IntakeJob["kind"], at, command.message);
    } else if (command.action === "prepare") throw new IntakeError("prepare_handler", "문서 생성 경로에서 처리해야 하는 요청이에요");
    finishIntakeMutation(coach, before, plan.answers);
    if (created) created.baseDocumentRevision = coachDocumentRevision(coach);
    intake.receipts.push({ id: command.requestId, signature });
    intake.receipts = intake.receipts.slice(-128);
    intake.stateRevision = (intake.stateRevision ?? 0) + 1;
    plan.answers[INTAKE_KEY] = { state: intake }; plan.answers[COACH_KEY] = { state: coach };
    plan.title = coach.business.name; plan.updatedAt = at;
    if (!Object.keys(plan.sections).length) plan.planType = intake.mode === "operating" ? COACH_TYPES.operating : COACH_TYPES.startup;
    state.activePlanId = plan.id;
    try { await savePlanState(ownerHash, state, { planId: plan.id, coachRevision: previous?.revision ?? 0, planUpdatedAt: oldAt }); }
    catch (error) { if (error instanceof Error && error.message === "PLAN_VERSION_CONFLICT" && attempt < 4) continue; throw error; }
    const snapshot = intakeSnapshot(plan, coach, intake);
    console.info("[business-intake]", JSON.stringify({ event: "saved", command: command.action, mode: intake.mode, coreAnswered: snapshot.coreAnswered, coreTotal: snapshot.coreTotal, complete: snapshot.coreComplete, sourceChanged: before !== intakeBusinessFingerprint(coach, plan.answers), aiQueued: !!created }));
    return { plan, snapshot, job: created, duplicate: false };
  }
  throw new IntakeError("revision_conflict", "다른 변경이 저장 중이에요. 최신 내용을 다시 확인해 주세요", 409);
}

export async function updateIntakeJob(request: IntakeJobRequest, mutate: (plan: ServerPlan, coach: CoachState, intake: IntakeState, job: IntakeJob) => void) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await loadPlanState(request.ownerHash), plan = state.plans.find(item => item.id === request.planId);
    const coach = plan && readCoach(plan.answers), intake = plan && readIntake(plan.answers);
    if (!plan || !coach || !intake || intake.job?.id !== request.jobId) throw new IntakeError("job_superseded", "이미 다른 작업으로 변경됐어요", 409);
    const before = plan.updatedAt, revision = coach.revision;
    mutate(plan, coach, intake, intake.job);
    intake.stateRevision = (intake.stateRevision ?? 0) + 1;
    plan.updatedAt = nextTimestamp(before); intake.job.updatedAt = plan.updatedAt;
    plan.answers[COACH_KEY] = { state: coach }; plan.answers[INTAKE_KEY] = { state: intake };
    try { await savePlanState(request.ownerHash, state, { planId: plan.id, coachRevision: revision, planUpdatedAt: before }); return { plan, coach, intake }; }
    catch (error) { if (error instanceof Error && error.message === "PLAN_VERSION_CONFLICT" && attempt < 4) continue; throw error; }
  }
  throw new IntakeError("job_conflict", "작업 상태 저장이 충돌했어요", 409);
}

export async function expireStaleIntakeJob(request: IntakeJobRequest) {
  try {
    return await updateIntakeJob(request, (_plan, _coach, intake, job) => {
      if (!active(job) || Date.now() - Date.parse(job.updatedAt) <= 120_000) throw new IntakeError("job_current", "진행 상태가 유효해요");
      job.status = "failed";
      job.error = "응답 확인 시간이 지났어요. 입력은 저장되어 있고 자동 정리만 미완료예요";
      intake.notes = intake.notes.map(note => job.noteIds.includes(note.id) ? { ...note, status: "failed" } : note);
    });
  } catch (error) {
    if (error instanceof IntakeError && ["job_current", "job_superseded"].includes(error.code)) return null;
    throw error;
  }
}

export async function executeIntakeJob(request: IntakeJobRequest): Promise<{ ok: boolean }> {
  const startedAt = Date.now();
  let queueMs = 0;
  let claimed: Awaited<ReturnType<typeof updateIntakeJob>>;
  try {
    claimed = await updateIntakeJob(request, (_plan, _coach, intake, job) => {
      if (job.status !== "queued") throw new IntakeError("job_claimed", "이미 처리한 작업이에요", 409);
      queueMs = Math.max(0, Date.now() - Date.parse(job.updatedAt));
      job.status = "running"; job.dispatched = true;
      intake.notes = intake.notes.map(note => job.noteIds.includes(note.id) ? { ...note, status: "processing" } : note);
    });
  } catch (error) { if (error instanceof IntakeError && ["job_claimed", "job_superseded"].includes(error.code)) return { ok: true }; throw error; }
  const job = claimed.intake.job!, config = resolvePlanningLLMConfig(request.ownerHash);
  console.info("[business-intake-job]", JSON.stringify({ event: "started", jobId: job.id, kind: job.kind, queueMs }));
  try {
    if (!config) throw new IntakeError("unavailable", "AI 연결을 사용할 수 없어요");
    const supabase = getServerSupabase();
    if (supabase) {
      // The shared counter must succeed before a paid call; never fall back to an isolate-local allowance.
      const allowance = await supabase.rpc("bump_rate_limit", { p_bucket: "business-intake-ai-daily", p_key: request.ownerHash, p_window_ms: 86_400_000 });
      if (allowance.error || typeof allowance.data !== "number" || allowance.data > 24) throw new IntakeError("ai_limit", "AI 이용량을 확인하지 못했거나 한도에 도달했어요. 입력과 직접 수정은 계속할 수 있어요");
    } else if (!rateLimit("business-intake-ai-daily", request.ownerHash, { limit: 24, windowMs: 86_400_000 }).ok) throw new IntakeError("ai_limit", "오늘 AI 정리 한도에 도달했어요. 기본 진단은 계속할 수 있어요");
    if (job.kind === "extract") {
      const result = await extractIntakeFields(config, claimed.intake.notes.filter(note => job.noteIds.includes(note.id)).map(({ id, text }) => ({ id, text })));
      if (!result.ok) throw new IntakeError(result.reason, "자동 정리를 완료하지 못했어요. 원문은 보관되어 있어요");
      await updateIntakeJob(request, (_plan, _coach, intake, current) => {
        if (current.status !== "running") throw new IntakeError("job_superseded", "기한이 지난 작업이에요", 409);
        intake.candidates.push(...result.candidates.map((candidate, index) => ({ ...candidate, id: `${job.id}:${index}`, baseValue: job.baseValues[candidate.fieldKey] ?? null, ...(job.baseFieldRevisions ? { baseFieldRevision: job.baseFieldRevisions[candidate.fieldKey] ?? null } : {}), status: "pending" as const })));
        intake.notes = intake.notes.map(note => job.noteIds.includes(note.id) ? { ...note, status: result.candidates.some(candidate => candidate.noteId === note.id) ? "review" : "stored" } : note);
        current.status = "complete";
      });
    } else if (job.kind === "help") {
      const context = JSON.stringify({ stage: claimed.coach.stage, business: claimed.coach.business.name, fields: claimed.coach.fields.map(field => ({ key: field.key, value: field.value.slice(0, 180), basis: field.basis })), excerpted: true });
      const result = await helpIntake(config, context, job.request ?? "");
      if (!result.ok) throw new IntakeError(result.reason, "AI 답변을 완료하지 못했어요. 질문을 짧게 나눠 다시 요청할 수 있고 사업정보는 그대로 보관되어 있어요");
      await updateIntakeJob(request, (_plan, coach, _intake, current) => {
        if (current.status !== "running") throw new IntakeError("job_superseded", "기한이 지난 작업이에요", 409);
        current.reply = result.message; current.status = "complete";
        const id = `${current.id}:reply`;
        if (!coach.messages.some(message => message.id === id)) {
          coach.messages.push({ id, role: "assistant", text: result.message, at: new Date().toISOString() });
          coach.revision += 1;
        }
      });
    } else {
      const raw = await completeJson(config, { system: BUSINESS_DESIGN_RULES, user: `${coachContext(claimed.coach)}\n${confirmedIntakeContext(claimed.plan.answers)}`, jsonSchema: { name: "intake_design", schema: z.toJSONSchema(businessDesignSchema) }, kind: "intake-design", timeoutMs: 60_000, maxOutputTokens: 3000, effort: "low", allowFallback: false });
      const parsed = businessDesignSchema.safeParse(raw);
      if (!parsed.success) throw new IntakeError("design_failed", "사업안 생성을 완료하지 못했어요. 입력 정보는 그대로 보관되어 있어요");
      await updateIntakeJob(request, (_plan, coach, _intake, current) => {
        if (current.status !== "running" || coachDocumentRevision(coach) !== job.baseDocumentRevision) throw new IntakeError("source_changed", "생성 중 사업정보가 바뀌었어요. 현재 입력을 확인한 뒤 다시 요청해 주세요", 409);
        coach.documentRevision = coachDocumentRevision(coach) + 1; coach.revision += 1;
        coach.design = { ...parsed.data, status: "proposal", sourceRevision: coach.documentRevision };
        current.reply = businessDesignReply(parsed.data); current.status = "complete";
      });
    }
    console.info("[business-intake-job]", JSON.stringify({ event: "complete", jobId: job.id, kind: job.kind, elapsedMs: Date.now() - startedAt }));
    return { ok: true };
  } catch (error) {
    await updateIntakeJob(request, (_plan, _coach, intake, current) => {
      if (current.status === "complete") return;
      current.status = "failed"; current.error = error instanceof IntakeError ? error.message : "자동 정리를 완료하지 못했어요. 원문은 보관되어 있어요";
      intake.notes = intake.notes.map(note => current.noteIds.includes(note.id) ? { ...note, status: "failed" } : note);
    }).catch(() => undefined);
    console.info("[business-intake-job]", JSON.stringify({ event: "failed", jobId: job.id, kind: job.kind, code: error instanceof IntakeError ? error.code : "unexpected", elapsedMs: Date.now() - startedAt }));
    return { ok: false };
  }
}
