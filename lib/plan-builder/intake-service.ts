import { patchDocumentAmounts } from "./fact-patch";
import { createHash } from "node:crypto";
import { classifyEditRequest, EDIT_REPLIES, EDIT_REPLIES_BEFORE_DOCUMENT, objectParticle, topicParticle, type EditRoute } from "./intake-edit-filter";
import { z } from "zod";
import { completeJson } from "../llm/complete";
import { resolveIntakeLLMConfig, intakeBetaSafetyRequired } from "../llm/intake-policy";
import { intakeJobExpired } from "./intake-timing";
import { COACH_KEY, COACH_TYPES, coachContext, coachDocumentRevision, readCoach, type CoachState } from "./coach";
import { emptyCoach } from "./coach-job";
import { BUSINESS_DESIGN_RULES, businessDesignReply, designValidationIssues, generatedBusinessDesignSchema, normalizeGeneratedDesign } from "./coach-design";
import { enforceDesignStepOrder, playbookStepOrder } from "./design-step-order";
import { businessProfile } from "./business-launch";
import { loadPlanState, savePlanState, type ServerPlan } from "./plan-server-store";
import { INTAKE_KEY, type IntakeCommand, type IntakeJob, type IntakeJobRequest, type IntakeState } from "./intake-types";
import { applyIntakeAnswer, applyIntakeEstimates, nameFromKind, applyUnderstood, applyGuessed, applyGuessedSector, applyShapedBusiness, applyRunning, applyRead, clearIntakeEstimates, assertAmountConfirmed, assertSectorChecked, planFinancialReference, applyIntakeCandidates, applyIntakeStructure, createIntake, finishIntakeMutation, IntakeError, intakeBusinessFingerprint, intakeFieldRevision, intakeSnapshot, readIntake, storeIntakeNote as storeDeferredNote, intakeQuestions, displayIntakeValue, READ_SUFFIX } from "./intake-core";
import { RUNNING_SIGNAL, SHAPED_SIGNAL } from "./idea-understanding";
import { adoptRenamedTitle } from "./business-name";
import { estimateIntake } from "./intake-estimate";
import { COACH_FIELD_LABELS, coachFieldDisplay } from "./coach-presentation";
import { chatIntake, editIntake, extractIntakeFields, helpIntake, parseIntakeNote } from "./intake-extraction";
import { EDITABLE_FACT_IDS } from "./fact-highlight";
import { getServerSupabase } from "../persistence";
import { notifyOwnerBySms } from "../notify/owner-sms";
import { rateLimit } from "../rate-limit";
import { GUEST_AI_LIMIT_CODE, GUEST_AI_LIMIT_MESSAGE } from "./guest-ai-budget";
import { confirmedIntakeContext, ownerNotesContext } from "./intake-context";

import { intakeCommandSchema } from "./intake-command";
import { applyIntakeResources } from "./intake-resource-update";
import { IDEA_RULES, IDEA_CALL_TIMEOUT_MS, IDEA_RESULT_DEADLINE_MS, IDEA_MAX_TURNS, ideaReplySchema, ideasPrompt, ideaSignature, ideaInputFingerprint } from "./intake-ideas";
export { intakeCommandSchema } from "./intake-command";

function nextTimestamp(previous?: string) { return new Date(Math.max(Date.now(), (Date.parse(previous ?? "") || 0) + 1)).toISOString(); }
function active(job: IntakeJob | null) { return !!job && ["queued", "running"].includes(job.status); }
function fields(coach: CoachState) { return Object.fromEntries(coach.fields.map(field => [field.key, field.value])); }
/** 한 계정이 만들 수 있는 사업 수 */
export const PLAN_LIMIT = 20;
/** 아무것도 답하지 않은 빈 사업(대화만 열어 둔 것) — 새 대화가 이 자리를 다시 쓴다. 문서·답·메모·진행 중 작업이 하나라도 있으면 아니다 */
function untouchedIntakePlan(plan: ServerPlan, mode: IntakeCommand["mode"]) {
  const coach = readCoach(plan.answers), intake = readIntake(plan.answers);
  if (!coach || !intake || Object.keys(plan.sections).length) return false;
  if (Object.keys(plan.answers).some(key => key !== COACH_KEY && key !== INTAKE_KEY)) return false;
  if (mode && intake.mode !== mode) return false;
  return !coach.fields.length && !coach.messages.some(message => message.role === "user") && !coach.design
    && !Object.keys(intake.answers).length && !intake.notes.length && !intake.candidates.length && !intake.job && !(intake.ideaTurns ?? []).length;
}
function commandSignature(command: IntakeCommand) { return createHash("sha256").update(JSON.stringify(command)).digest("hex"); }

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
  const job: IntakeJob = { id, runId: `intake-${id}`, kind, status: "queued", noteIds, baseValues: fields(coach), baseFieldRevisions, baseDocumentRevision: coachDocumentRevision(coach), updatedAt: at, createdAt: at, ...(request ? { request } : {}) };
  intake.job = job;
  return job;
}

/*
 * beforeAiJob: AI 작업을 만들기 바로 앞에서 한 번 부른다(손님 AI 하루 한도 — guest-ai-budget.ts). 검사 · 같은 요청 다시 보내기 · AI가 필요 없는 저장에서는 부르지 않는다.
 * false 면 이번 요청은 저장하지 않고 GUEST_AI_LIMIT_CODE 오류를 던진다. 저장 충돌로 다시 돌아도 한 번만 센다.
 */
/** 못 읽은 답을 미정으로 두고 넘어갈 때의 안내 한 줄 */
export const movedOnNotice = (label: string) => `${label}${topicParticle(label)} 아직 미정으로 두고 넘어갈게요. 정해지면 눌러서 고칠 수 있어요.`;

export async function saveIntakeCommand(ownerHash: string, input: IntakeCommand, options: { aiAvailable?: boolean; aiAllowed?: boolean; editRoute?: EditRoute; beforeAiJob?: (kind: IntakeJob["kind"]) => Promise<boolean> } = {}) {
  let aiJobAllowed: Promise<boolean> | undefined;
  const allowAiJob = async (kind: IntakeJob["kind"]) => {
    if (!options.beforeAiJob) return;
    aiJobAllowed ??= options.beforeAiJob(kind);
    if (!(await aiJobAllowed)) throw new IntakeError(GUEST_AI_LIMIT_CODE, GUEST_AI_LIMIT_MESSAGE, 401);
  };
  const parsed = intakeCommandSchema.safeParse(input);
  if (!parsed.success) {
    if (parsed.error.issues.some(issue => issue.code === "custom" && issue.path[0] === "structure")) throw new IntakeError("structure_required", "바꿀 사업 구조 항목을 골라 주세요");
    throw parsed.error;
  }
  const command = parsed.data, signature = commandSignature(command);
  /*
   * 세부 업종 표(kind-rules, 1.8MB)는 필요할 때 불러온다(2026-11-20). 맨 위에서 import 하면 묶음 도구가 이 파일을 쓰는 길마다(대화 · 계획서 생성)
   * 표를 한 벌씩 넣어 서버 묶음에 두 벌(gzip 약 510KiB씩)이 들어갔고, 묶음이 Cloudflare 한도(gzip 10MB)에 5KiB 앞까지 찼다.
   */
  const { ruleKind } = await import("./kind-rules");
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await loadPlanState(ownerHash);
    let plan = state.plans.find(item => item.id === (command.planId ?? `plan_${command.requestId}`));
    let reused = false, reusedRevision = 0;
    /*
     * 새 대화를 '생각한 사업이 있어요'처럼 아무 답 없이 시작할 때, 이미 아무것도 답하지 않은 빈 사업이 있으면 그 자리를 다시 쓴다.
     * 예전엔 누를 때마다 똑같은 '새 사업 구상'이 하나씩 생겨 20개까지 쌓였다(점검 2026-10-22). 같은 요청을 다시 보내면 그 사업을 그대로 찾는다.
     */
    if (!plan && !command.planId && command.action === "start" && !command.message && command.questionId === undefined && command.value === undefined) {
      plan = state.plans.find(item => readIntake(item.answers)?.receipts.some(receipt => receipt.id === command.requestId));
      const untouched = plan ? undefined : state.plans.find(item => untouchedIntakePlan(item, command.mode));
      // 저장 확인(CAS)은 비우기 전 서버 기록의 판(revision)으로 한다
      if (untouched) { reusedRevision = readCoach(untouched.answers)?.revision ?? 0; untouched.answers = {}; untouched.title = "새 사업"; plan = untouched; reused = true; }
    }
    if (command.planId && !plan) throw new IntakeError("not_found", "사업을 찾을 수 없어요", 404);
    if (!plan && command.action !== "start") throw new IntakeError("start_required", "먼저 사업 진단을 시작해 주세요");
    const previous = plan && readCoach(plan.answers), savedIntake = plan && readIntake(plan.answers);
    const receipt = savedIntake?.receipts.find(item => item.id === command.requestId);
    if (receipt) {
      if (receipt.signature !== signature) throw new IntakeError("request_reused", "같은 요청 번호로 다른 내용을 저장할 수 없어요", 409);
      return { plan: plan!, snapshot: intakeSnapshot(plan!, previous!, savedIntake!), job: savedIntake!.job?.status === "queued" && !savedIntake!.job.dispatched ? savedIntake!.job : null, duplicate: true };
    }
    if ((previous?.revision ?? 0) !== command.revision) throw new IntakeError("revision_conflict", "다른 화면에서 수정됐어요. 입력은 보관하고 최신 내용과 비교해 주세요", 409);
    if (plan && !previous && !reused) throw new IntakeError("legacy_plan", "이 문서는 기존 사업 편집 화면에서 계속할 수 있어요", 409);
    if (previous?.messages.some(message => message.id === command.requestId)) throw new IntakeError("request_reused", "이미 사용한 요청 번호예요", 409);
    if (!plan && state.plans.filter(item => readCoach(item.answers)).length >= PLAN_LIMIT) throw new IntakeError("plan_limit", `사업은 최대 ${PLAN_LIMIT}개까지 만들 수 있어요. 내 사업에서 쓰지 않는 사업을 정리하거나 기존 사업에서 이어가 주세요`, 429);
    const oldAt = plan?.updatedAt ?? null, at = nextTimestamp(oldAt ?? undefined);
    const coach = structuredClone(previous ?? emptyCoach());
    // 머리줄에서 바꾼 사업 이름(제목)을 확정 이름으로 받는다 — 아래에서 제목을 대화 속 이름으로 덮어써도 사라지지 않게
    if (plan && previous && savedIntake) adoptRenamedTitle(plan, coach);
    if (!plan) {
      plan = { id: `plan_${command.requestId}`, title: "새 사업", planType: COACH_TYPES.startup, createdAt: at, updatedAt: at, answers: {}, sections: {} };
      state.plans.push(plan);
    }
    const intake = structuredClone(savedIntake ?? createIntake(coach, command.mode ?? (coach.stage === "operating" ? "operating" : "startup"), at));
    if (!savedIntake && plan.answers.__coach_job) {
      plan.answers.__intake_legacy_job = structuredClone(plan.answers.__coach_job);
      plan.answers.__coach_job = { ...plan.answers.__coach_job, token: crypto.randomUUID(), status: "failed", updatedAt: at };
    }
    let before = intakeBusinessFingerprint(coach, plan.answers);
    const beforeIdeas = ideaInputFingerprint(coach, intake);
    if (intakeJobExpired(intake.job, Date.now())) {
      intake.job = { ...intake.job!, status: "failed", error: "응답 확인 시간이 지났어요. 원문은 보관되어 있어요", updatedAt: at };
      if (intake.job.kind === "ideas") intake.ideaTurns = (intake.ideaTurns ?? []).map(turn => turn.id === intake.job!.id ? { ...turn, status: "failed" } : turn);
      intake.notes = intake.notes.map(note => intake.job!.noteIds.includes(note.id) ? { ...note, status: "failed" } : note);
    }
    let created: IntakeJob | null = null;
    /** 계획서 전 채팅 수정에서 '바꾸기'를 눌렀다 — 값이 안 바뀌었어도 사업 방향을 옛 기준으로 표시해 다시 정리하게 한다 */
    let redoDirection = false;
    if (command.action === "start") {
      if (savedIntake && command.mode && command.mode !== intake.mode) throw new IntakeError("mode_conflict", "진행 중인 사업 유형은 새 대화에서 선택해 주세요", 409);
      if (command.message && (savedIntake || command.questionId !== undefined || command.value !== undefined)) throw new IntakeError("invalid_start", "처음 남긴 이야기와 답변은 구분해 저장해 주세요");
      if (command.questionId !== undefined || command.value !== undefined) {
        if (savedIntake) throw new IntakeError("start_exists", "이미 시작한 대화에서는 답변 수정으로 이어가 주세요", 409);
        if (command.questionId !== "business" || typeof command.value !== "string" || !command.value.trim() || command.unknown) throw new IntakeError("invalid_start", "처음 이야기할 사업 내용을 입력해 주세요");
        // Persist the first typed answer and new conversation in the same CAS write.
        applyIntakeAnswer(plan, coach, intake, { ...command, action: "answer" }, at);
        // 한 문장 → 바로 초안(시험 기능, INTAKE_ESTIMATE=1): 나머지 핵심 질문을 자체 기준표로 채운다
        if (command.depth === "expert") intake.depth = "expert";
        if (process.env.INTAKE_ESTIMATE === "1" && intake.depth !== "expert") applyIntakeEstimates(plan, coach, intake, command.requestId, at, ruleKind);
        // 전문가 모드는 기준값을 채우지 않지만 제목만은 찾은 이름으로(긴 문장이 중간에서 잘린 제목이 되던 문제)
        else if (intake.mode === "startup" && typeof command.value === "string") { const guess = estimateIntake(command.value, undefined, ruleKind); nameFromKind(coach, command.value.trim(), guess.word, guess.answers.offer); }
      } else if (!savedIntake && command.depth === "expert") intake.depth = "expert";
      if (command.message) storeDeferredNote(coach, intake, command, at);
      coach.stage = intake.mode === "operating" ? "operating" : intake.mode === "exploring" && !coach.fields.some(field => field.key === "business") ? "exploring" : "startup";
      coach.business.stage = coach.stage === "operating" ? "운영 중" : "사업 기획";
      if (plan.answers.__coach_job) {
        plan.answers.__intake_legacy_job = structuredClone(plan.answers.__coach_job);
        plan.answers.__coach_job = { ...plan.answers.__coach_job, token: crypto.randomUUID(), status: "failed", updatedAt: at };
      }
    } else if (command.action === "answer") {
      assertSectorChecked(plan, coach, intake, command);
      assertAmountConfirmed(intake, coach, command);
      const beforeAnswers = structuredClone(intake.answers);
      applyIntakeAnswer(plan, coach, intake, command, at);
      /*
       * 적은 말을 읽지 못해 화면이 '아직 미정'으로 넘긴 답(적은 말이 함께 온다, BusinessIntake repeatOrMoveOn) — 말없이 다음 질문으로 가지 않고 한 줄로 알린다.
       * '잘 모르겠어요'를 직접 누른 답(적은 말 없음)과 전문가 모드에는 붙이지 않는다.
       */
      if (command.unknown && command.message?.trim() && intake.depth !== "expert") {
        const label = intakeQuestions(intake, coach).find(question => question.id === command.questionId)?.label;
        if (label) coach.messages.push({ id: `${command.requestId}:moved-on`, role: "assistant", text: movedOnNotice(label), at });
      }
      if (process.env.INTAKE_ESTIMATE === "1" && intake.depth !== "expert" && (command.questionId === "business" || command.questionId === "industry" || command.questionId === "candidate") && !command.unknown) applyIntakeEstimates(plan, coach, intake, command.requestId, at, ruleKind);
      // 계획서가 있으면 고친 금액을 본문에 바로 바꿔 넣는다(AI 없음). 계산된 다른 값은 다시 작성하기로 맞춘다.
      patchDocumentAmounts(plan, beforeAnswers, intake.answers, at);
    }
    else if (command.action === "edit") {
      // 채팅 수정. 범위 밖 요청은 AI 없이 정해진 답으로 끝내고, 사실 변경 요청만 AI 작업으로 넘긴다.
      /*
       * 계획서 전이라도 사업 방향을 정리했으면 받는다(2026-11-17 사장님: 방향을 본 뒤 적은 말이 메모로만 남고 아무 대답도, 반영도 없었다).
       * 계획서 전에도 바꿀 내용을 먼저 보여 주고 '바꾸기 · 그대로 두기'를 묻는다(대표 결정 2026-11-26) — 예전 '바로 반영'(2026-11-17)은
       * 실수로 적은 한 줄에도 값이 바뀌고 사업 방향을 통째로 다시 정리했다(되돌릴 길도 없었다).
       */
      const beforeDocument = !Object.keys(plan.sections).length;
      if (beforeDocument && !coach.design) throw new IntakeError("edit_requires_document", "사업 방향을 정리한 뒤에 채팅으로 고칠 수 있어요", 409);
      const text = command.message?.trim() ?? "";
      if (text.length > 1200) throw new IntakeError("edit_too_long", "바꿀 내용을 1,200자 이내로 적어 주세요");
      const classified = options.editRoute ?? classifyEditRequest(text);
      // 계획서 전에는 고칠 문장이 없다 — 말투 · 새 사업처럼 보이는 말("친근하게 다가가는 동네 가게로 하고 싶어요")도 사업 이야기로 AI가 읽는다.
      // 정말 다른 사업이면 AI가 '새 대화'로 안내한다(chatIntake). 빈 말 · 인사만 정해진 답으로 끝난다.
      const route = beforeDocument && (classified === "style" || classified === "new_business") ? "in_scope" : classified;
      if (text) coach.messages.push({ id: command.requestId, role: "user", text, at });
      if (route !== "in_scope") coach.messages.push({ id: `${command.requestId}:reply`, role: "assistant", text: (beforeDocument ? EDIT_REPLIES_BEFORE_DOCUMENT : EDIT_REPLIES)[route], at });
      else {
        if (active(intake.job)) throw new IntakeError("ai_busy", "앞선 요청을 정리하고 있어요. 잠시 후 다시 보내 주세요", 409);
        if (!options.aiAvailable) throw new IntakeError("ai_unavailable", beforeDocument ? "지금은 채팅으로 반영할 수 없어요. 입력칸의 ＋에서 답을 직접 고칠 수 있어요" : "지금은 채팅 수정을 쓸 수 없어요. 계획서에서 문장으로 바로 고칠 수 있어요", 503);
        if (!options.aiAllowed) throw new IntakeError("ai_limit", beforeDocument ? "오늘 이 사업의 수정 요청 한도에 도달했어요. 입력칸의 ＋에서 답을 직접 고칠 수 있어요" : "오늘 이 계획서의 수정 요청 한도에 도달했어요. 계획서에서 문장으로 바로 고치기는 계속 쓸 수 있어요", 429);
        await allowAiJob("edit");
        created = newIntakeJob(coach, intake, "edit", at, text);
      }
    } else if (command.action === "edit-apply" || command.action === "edit-dismiss") {
      const job = intake.job;
      if (!job || job.kind !== "edit" || job.status !== "complete" || !(job.proposal?.length || job.rethink) || job.proposalStatus) throw new IntakeError("edit_missing", "바꿀 내용을 다시 요청해 주세요", 409);
      if (command.action === "edit-apply") {
        // Each change goes through the same validation as a typed answer; one invalid value stops the whole set.
        const beforeAnswers = structuredClone(intake.answers);
        const proposal = job.proposal ?? [];
        proposal.forEach((change, index) => applyIntakeAnswer(plan!, coach, intake, { ...command, action: "answer", questionId: change.questionId, value: change.value, unknown: false, requestId: `${command.requestId}:${index}` }, at));
        patchDocumentAmounts(plan, beforeAnswers, intake.answers, at);
        job.proposalStatus = "applied";
        if (!Object.keys(plan.sections).length) {
          /*
           * 계획서 전 — 값을 넣고 사업 방향을 다시 정리한다. 적은 말은 메모로도 남겨 칸으로 옮기지 못한 내용('정기구독도 하고 싶어요')까지
           * 방향 정리가 읽게 한다(ownerNotesContext). 값이 하나도 안 바뀌어도(rethink 뿐) 방향은 옛 기준으로 표시한다(아래 redoDirection).
           */
          const said = (job.request ?? "").trim().slice(0, 4000);
          if (said && intake.notes.length < 64 && intake.notes.reduce((total, note) => total + note.text.length, 0) + said.length <= 100_000) intake.notes.push({ id: `${job.id}:memo`, text: said, at, status: "stored", intent: "memo" });
          redoDirection = true;
          const questions = intakeQuestions(intake, coach);
          const labels = proposal.map(change => questions.find(question => question.id === change.questionId)?.label).filter((label): label is string => !!label);
          coach.messages.push({ id: `${command.requestId}:reply`, role: "assistant", text: labels.length ? `말씀하신 대로 ${labels.join(", ")}${objectParticle(labels.at(-1)!)} 바꿨어요. 이 기준으로 사업 방향을 다시 정리할게요.` : "말씀하신 내용을 넣어 사업 방향을 다시 정리할게요.", at });
        } else coach.messages.push({ id: `${command.requestId}:reply`, role: "assistant", text: "바꿨어요. \"계획서에 반영하기\"를 누르면 바뀐 내용으로 다시 써요.", at });
      } else {
        job.proposalStatus = "dismissed";
        coach.messages.push({ id: `${command.requestId}:reply`, role: "assistant", text: "그대로 둘게요. 다른 바꿀 내용이 있으면 말씀해 주세요.", at });
      }
    }
    else if (command.action === "sector-keep") {
      // 업종 확인에 '그대로 둘게요' — 이 설명으로는 다시 묻지 않는다. 업종·질문은 바꾸지 않는다.
      const business = coach.fields.find(field => field.key === "business" && field.basis === "user")?.value.trim();
      if (!business) throw new IntakeError("business_required", "사업 설명을 먼저 적어 주세요");
      intake.sectorCheck = { business, decision: "kept" };
    }
    else if (command.action === "resources") applyIntakeResources(plan, coach, intake, command, at);
    else if (command.action === "details") intake.detailsRequested = true;
    else if (command.action === "understand") {
      // 문장에서 읽은 답 — 계획서를 만든 뒤나 전문가 모드에서는 넣지 않는다(그때는 사용자가 직접 정한다)
      // 말한 값을 먼저 넣고, 적히지 않은 칸은 이 사업에 맞춘 짐작으로 기준표 값을 바꾼다(말한 값 · 직접 답한 값은 그대로)
      if (!Object.keys(plan.sections).length && intake.depth !== "expert") {
        // 적은 말이 사업 설명이 아니었으면 그 말로 잡은 사업을 먼저 넣는다 — 뒤의 업종 · 짐작이 모두 이 사업에 맞춘 값이다
        applyShapedBusiness(plan, coach, intake, command.guessed?.find(item => item.questionId === SHAPED_SIGNAL)?.value, command.requestId, at, ruleKind);
        // 이미 운영 중인 가게로 읽혔으면 먼저 표시한다 — 뒤의 다시 채우기가 목표를 넣지 않는다
        if (command.guessed?.some(item => item.questionId === RUNNING_SIGNAL)) applyRunning(plan, coach, intake);
        // 업종 짐작을 먼저 — 업종이 바뀌면 기준표 값이 새 업종으로 다시 채워지고, 그 위에 말한 값과 짐작이 얹힌다
        applyGuessedSector(plan, coach, intake, command.guessed?.find(item => item.questionId === "industry")?.value, command.requestId, at, ruleKind);
        applyUnderstood(coach, intake, command.understood ?? [], command.requestId, at);
        applyGuessed(coach, intake, command.guessed ?? [], command.requestId, at);
      }
      intake.understood = true;
    }
    else if (command.action === "read") {
      // 대화 중 적은 말에서 읽은 것 — 계획서를 만든 뒤에는 넣지 않는다(그때는 계획서에서 고친다)
      if (!Object.keys(plan.sections).length && command.read) {
        const doubtedBefore = new Set((command.read.doubted ?? []).filter(id => intake.answers[id]?.status === "answered"));
        applyRead(coach, intake, command.read, command.requestId, at);
        // 손님이 아니라고 해서 걷어 낸 칸 — 들었다는 것을 한 줄로 알린다(질문은 차례가 오면 다시 묻는다). 화면이 글을 함께 보내지 않은 조용한 읽기에서도 알린다
        const reopened = intakeQuestions(intake, coach).filter(question => doubtedBefore.has(question.id) && !intake.answers[question.id]).map(question => question.label);
        if (reopened.length) coach.messages.push({ id: `${command.requestId}:read-reopen`, role: "assistant", text: `${reopened.join(", ")}${topicParticle(reopened.at(-1)!)} 먼저 채운 값을 지웠어요. 조금 뒤에 다시 여쭤볼게요.`, at });
        /*
         * 화면이 질문 답으로 적은 글을 함께 보냈으면(규칙이 못 읽은 '하루8시간 주6일 48시간' 등) 대화에 그대로 남기고 메모로도 둔다 — 칸에 없는 말도
         * 사업 방향이 읽는다(ownerNotesContext). 그리고 무엇으로 넣었는지 한 줄로 알린다(AI가 잘못 읽었으면 손님이 바로 보고 고친다).
         */
        if (command.message?.trim()) {
          storeDeferredNote(coach, intake, { ...command, message: command.message.trim(), noteIntent: "memo" }, at);
          const readId = `${command.requestId}${READ_SUFFIX}`;
          const shown = intakeQuestions(intake, coach).flatMap(question => {
            const answer = intake.answers[question.id];
            if (answer?.messageId !== readId || answer.status !== "answered") return [];
            const value = displayIntakeValue(answer.value);
            return [`${question.label} ${coachFieldDisplay(question.kind === "number" && /^\d+$/.test(value) ? `${value}${question.unit ?? ""}` : value)}`];
          });
          if (shown.length) coach.messages.push({ id: `${command.requestId}:read-reply`, role: "assistant", text: `이렇게 넣었어요: ${shown.join(" · ")}. 다르면 눌러서 고칠 수 있어요.`, at });
        }
      }
    }
    else if (command.action === "depth") {
      // 대화 방식 바꾸기 — 계획서를 만든 뒤에는 질문이 아니라 계획서에서 고친다
      if (Object.keys(plan.sections).length) throw new IntakeError("depth_locked", "계획서를 만든 뒤에는 계획서에서 고칠 수 있어요", 409);
      if (command.depth === "expert") {
        intake.depth = "expert"; clearIntakeEstimates(coach, intake);
        coach.messages.push({ id: `${command.requestId}:depth`, role: "assistant", text: "전문가 모드로 바꿨어요. 하나씩 자세히 물어볼게요.", at });
      } else {
        delete intake.depth;
        if (process.env.INTAKE_ESTIMATE === "1") applyIntakeEstimates(plan, coach, intake, command.requestId, at, ruleKind);
        coach.messages.push({ id: `${command.requestId}:depth`, role: "assistant", text: "일반 모드로 바꿨어요. 꼭 필요한 것만 물어볼게요.", at });
      }
    }
    else if (command.action === "name") {
      // 사업 이름만 바꾼다. 내용이 바뀐 게 아니므로 정리한 사업 방향과 계획서를 '변경됨'으로 만들지 않는다.
      const name = typeof command.value === "string" ? command.value.replace(/\s+/g, " ").trim() : "";
      if (!name || name.length > 40) throw new IntakeError("name_invalid", "사업 이름은 40자 안으로 적어 주세요");
      // 처음 이름(답변에서 온 이름)을 남겨 둔다 — 추천 이름을 눌렀다가 되돌릴 수 있게 결과 화면에 칩으로 보인다.
      const previousName = coach.business.name.trim();
      if (!coach.business.nameConfirmed && previousName && previousName !== name && !["새 사업 구상", "새 사업 진단", "새 사업"].includes(previousName)) intake.originalName = previousName;
      coach.business.name = name; coach.business.nameConfirmed = true;
      before = intakeBusinessFingerprint(coach, plan.answers);
    }
    else if (command.action === "structure") applyIntakeStructure(plan, coach, intake, command, at);
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
      // 규칙으로 다 읽은 메모(AI가 정리할 메모가 없음)는 AI 작업을 만들지 않으니 손님 한도도 세지 않는다
      if (options.aiAvailable && options.aiAllowed) {
        if (!active(intake.job) && intake.notes.some(note => note.status === "queued")) await allowAiJob("extract");
        created = newIntakeJob(coach, intake, "extract", at);
      }
      else intake.notes = intake.notes.map(note => note.status === "queued" ? { ...note, status: "failed" } : note);
    } else if (["extract", "extract-pending", "help", "design", "ideas"].includes(command.action)) {
      if (active(intake.job)) throw new IntakeError("ai_busy", "앞선 AI 작업이 진행 중이에요. 질문 답변과 직접 수정은 계속할 수 있어요", 409);
      if (!options.aiAvailable) throw new IntakeError("ai_unavailable", "AI 정리는 지금 연결되지 않았어요. 입력과 직접 수정은 계속할 수 있어요", 503);
      if (!options.aiAllowed) throw new IntakeError("ai_limit", "AI 이용 한도에 도달했어요. 기본 진단과 직접 수정은 계속할 수 있어요", 429);
      if (command.action === "extract") intake.notes = intake.notes.map(note => note.status === "failed" || note.status === "stored" && note.intent === "memo" ? { ...note, status: "queued" } : note);
      if (command.action === "help" && !command.message) throw new IntakeError("message_required", "사업과 관련해 궁금한 점을 입력해 주세요");
      if (command.action === "help") {
        const lastUser = coach.messages.filter(message => message.role === "user").at(-1);
        const alreadyStored = !!lastUser && lastUser.text === command.message && intake.notes.some(note => note.id === `${lastUser.id}:0` && note.intent === "question");
        if (!alreadyStored) storeDeferredNote(coach, intake, { ...command, noteIntent: "question" }, at);
      }
      if (command.action === "design" && !coach.ready) throw new IntakeError("business_required", "살펴볼 사업을 고르거나 생각한 사업을 먼저 적어 주세요");
      if (command.action === "ideas") {
        if (intake.mode !== "exploring") throw new IntakeError("exploration_only", "새 사업 제안은 아이디어 탐색 대화에서 받을 수 있어요. 지금 사업은 그대로예요");
        if (!command.message?.trim() || command.message.length > 1200) throw new IntakeError("idea_request_required", "원하는 사업 방향을 1,200자 안으로 적어 주세요");
        if ((intake.ideaTurns?.length ?? 0) >= IDEA_MAX_TURNS) throw new IntakeError("idea_history_limit", "이 대화에서 받을 수 있는 제안 횟수를 다 썼어요. 받은 제안 중에서 고르거나 새 탐색 대화를 시작해 주세요");
        if ((command.rejectIds??[]).some(id=>!intake.generatedIdeas?.some(idea=>idea.id===id && idea.planId===plan!.id))) throw new IntakeError("candidate_unknown", "이 사업에서 받은 제안만 뺄 수 있어요", 404);
      }
      const kind = command.action === "extract-pending" ? "extract" : command.action as IntakeJob["kind"];
      if (kind !== "extract" || intake.notes.some(note => note.status === "queued")) await allowAiJob(kind);
      created = newIntakeJob(coach, intake, kind, at, command.message);
      if (created?.kind === "ideas") {
        created.baseIdeaRevision = intake.ideaInputRevision ?? 0;
        intake.ideaTurns = [...intake.ideaTurns??[], { id:created.id, request:command.message!, rejectedIds:command.rejectIds??[], baseInputRevision:created.baseIdeaRevision, at, status:"queued" }];
        intake.generatedIdeas = (intake.generatedIdeas??[]).map(idea=>(command.rejectIds??[]).includes(idea.id)?{...idea,rejected:true}:idea);
        coach.messages.push({id:command.requestId,role:"user",text:command.message!,at});
      }
    } else if (command.action === "prepare") throw new IntakeError("prepare_handler", "문서 생성 경로에서 처리해야 하는 요청이에요");
    if (!finishIntakeMutation(coach, before, plan.answers, intake) && redoDirection) coach.documentRevision = coachDocumentRevision(coach) + 1;
    if (beforeIdeas !== ideaInputFingerprint(coach, intake)) intake.ideaInputRevision = (intake.ideaInputRevision ?? 0) + 1;
    if (created) created.baseDocumentRevision = coachDocumentRevision(coach);
    intake.receipts.push({ id: command.requestId, signature });
    intake.receipts = intake.receipts.slice(-128);
    intake.stateRevision = (intake.stateRevision ?? 0) + 1;
    plan.answers[INTAKE_KEY] = { state: intake }; plan.answers[COACH_KEY] = { state: coach };
    plan.title = coach.business.name; plan.updatedAt = at;
    if (!Object.keys(plan.sections).length) plan.planType = intake.mode === "operating" ? COACH_TYPES.operating : COACH_TYPES.startup;
    state.activePlanId = plan.id;
    try { await savePlanState(ownerHash, state, { planId: plan.id, coachRevision: reused ? reusedRevision : previous?.revision ?? 0, planUpdatedAt: oldAt }); }
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
      if (!intakeJobExpired(job, Date.now())) throw new IntakeError("job_current", "진행 상태가 유효해요");
      job.status = "failed";
      job.error = "응답 확인 시간이 지났어요. 입력은 저장되어 있고 자동 정리만 미완료예요";
      if (job.kind === "ideas") intake.ideaTurns = (intake.ideaTurns ?? []).map(turn => turn.id === job.id ? { ...turn, status: "failed" } : turn);
      intake.notes = intake.notes.map(note => job.noteIds.includes(note.id) ? { ...note, status: "failed" } : note);
    });
  } catch (error) {
    if (error instanceof IntakeError && ["job_current", "job_superseded"].includes(error.code)) return null;
    throw error;
  }
}

/** 하루 AI 한도 판정. 공유 카운터가 숫자를 돌려주면 그것으로, 없거나 실패하면 메모리 한도로 판정한다(작업을 막지 않는다). */
export function intakeDailyAllowance(shared: { error: unknown; data: unknown } | null, memoryAllows: () => boolean): { ok: boolean; source: "shared" | "memory" | "unavailable" } {
  if (shared && !shared.error && typeof shared.data === "number" && Number.isSafeInteger(shared.data) && shared.data >= 1) return { ok: shared.data <= 24, source: "shared" };
  if (intakeBetaSafetyRequired()) return { ok: false, source: "unavailable" };
  return { ok: memoryAllows(), source: "memory" };
}

export async function executeIntakeJob(request: IntakeJobRequest, execution: { reserveCost?: import("../llm/intake-policy").IntakeCostReservation; budgetFailure?: () => { code: string; message: string } | null } = {}): Promise<{ ok: boolean }> {
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
  const job = claimed.intake.job!, config = resolveIntakeLLMConfig(request.ownerHash, job.kind, execution.reserveCost);
  console.info("[business-intake-job]", JSON.stringify({ event: "started", jobId: job.id, kind: job.kind, queueMs }));
  try {
    if (!config) throw new IntakeError("unavailable", process.env[`INTAKE_${job.kind.toUpperCase()}_FAILOVER_POLICY`] ? "AI 정책의 제공자·모델 검증 설정을 확인해 주세요 (model_policy_unverified). 입력은 보관되어 있어요." : "AI 연결을 사용할 수 없어요");
    const supabase = getServerSupabase();
    // 하루 한도(소유자당 24회). 공유 카운터(마이그레이션 0018의 bump_rate_limit)가 동작하면 그 값으로 판정한다.
    // 운영 DB에 함수가 없거나 호출이 실패하면 예전에는 여기서 작업을 실패시켰고, 그 결과 운영의 모든 AI 작업이 "이용량을 확인하지 못했어요"로 막혔다(2026-09-17 운영 로그로 확인).
    // 이제는 다른 API와 같은 메모리 한도로 내려간다. 요청 단계의 한도(business-intake-ai: 소유자당 10분 24회)는 그대로 앞에 있다. 0018을 적용하면 코드 변경 없이 공유 카운터로 돌아간다.
    const shared = supabase ? await supabase.rpc("bump_rate_limit", { p_bucket: "business-intake-ai-daily", p_key: request.ownerHash, p_window_ms: 86_400_000 }) : null;
    const allowance = intakeDailyAllowance(shared, () => rateLimit("business-intake-ai-daily", request.ownerHash, { limit: 24, windowMs: 86_400_000 }).ok);
    if (supabase && allowance.source === "memory") console.warn("[business-intake-job]", JSON.stringify({ event: "allowance_fallback", jobId: job.id, code: (shared?.error as { code?: string } | null)?.code ?? null, message: String((shared?.error as { message?: string } | null)?.message ?? "").slice(0, 160) }));
    if (allowance.source === "unavailable") throw new IntakeError("allowance_unavailable", "AI 이용 한도를 확인하지 못했어요. 입력은 저장되어 있으니 잠시 후 다시 요청해 주세요");
    if (!allowance.ok) throw new IntakeError("ai_limit", "오늘 AI 이용 한도에 도달했어요. 기본 진단과 직접 수정은 계속할 수 있어요");
    if (job.kind === "ideas") {
      if ((claimed.intake.ideaInputRevision ?? 0) !== job.baseIdeaRevision) throw new IntakeError("idea_source_changed", "대기 중 조건이 바뀌었어요. 최신 조건으로 다시 요청해 주세요", 409);
      const deadline = Date.parse(job.createdAt ?? job.updatedAt) + IDEA_RESULT_DEADLINE_MS;
      if (Date.now() >= deadline) throw new IntakeError("idea_timeout", "제안을 받는 시간이 지났어요. 요청은 보관해 뒀으니 다시 요청해 주세요");
      const prompt = ideasPrompt(claimed.coach, claimed.intake, confirmedIntakeContext(claimed.plan.answers), intakeSnapshot(claimed.plan,claimed.coach,claimed.intake).candidateIdeas);
      if (prompt.length > 64_000) throw new IntakeError("idea_context_limit", "탐색 내용이 많아요. 받은 제안과 요청은 보관해 뒀어요. 새 탐색 대화에서 이어가 주세요");
      const raw = await completeJson(config,{system:IDEA_RULES,user:prompt,jsonSchema:{name:"intake_ideas",schema:z.toJSONSchema(ideaReplySchema)},validateJson:value=>ideaReplySchema.safeParse(value).success,kind:"intake-ideas",timeoutMs:Math.min(IDEA_CALL_TIMEOUT_MS,deadline-Date.now()),maxOutputTokens:2400,effort:"low",allowFallback:false});
      const parsed = ideaReplySchema.safeParse(raw);
      if (!parsed.success) throw new IntakeError("ideas_failed", "새 사업 제안을 받지 못했어요. 요청은 보관해 뒀으니 다시 요청할 수 있어요");
      const signatures = new Set((claimed.intake.generatedIdeas??[]).map(ideaSignature));
      for (const idea of parsed.data.ideas) { const key=ideaSignature(idea); if(signatures.has(key)) throw new IntakeError("ideas_duplicate", "앞서 받은 제안과 거의 같은 제안이 왔어요. 다른 방향을 적어 다시 요청해 주세요"); signatures.add(key); }
      await updateIntakeJob(request,(_plan,coach,intake,current)=>{
        if(current.status!=="running" || (intake.ideaInputRevision??0)!==job.baseIdeaRevision || Date.now()>=deadline) throw new IntakeError("idea_source_changed","제안 중 조건이 바뀌었거나 시간이 지났어요. 최신 조건으로 다시 요청해 주세요",409);
        const generated = parsed.data.ideas.map((idea,index)=>({id:`${job.id}:idea:${index}`,title:idea.title,description:idea.description,sector:"general" as const,reasons:[idea.differences],cautions:["독창성·수요·수익성 미검증","자원 적합성 확인 필요"],source:"ai-generated" as const,planId:request.planId,baseInputRevision:job.baseIdeaRevision!,generatedAt:new Date().toISOString(),customer:idea.customer,problem:idea.problem,offering:idea.offering,delivery:idea.delivery,revenue:idea.revenue,differences:idea.differences,unknowns:idea.unknowns,proposedStructure:Object.fromEntries(Object.entries(idea.structure).filter(([,value])=>value!==null))}));
        intake.generatedIdeas=[...intake.generatedIdeas??[],...generated];
        intake.ideaTurns=(intake.ideaTurns??[]).map(turn=>turn.id===job.id?{...turn,status:"complete"}:turn);
        current.status="complete";
        coach.revision+=1;
      });
    } else if (job.kind === "extract") {
      const result = await extractIntakeFields(config, claimed.intake.notes.filter(note => job.noteIds.includes(note.id)).map(({ id, text }) => ({ id, text })));
      if (!result.ok) throw new IntakeError(result.reason, "자동 정리를 완료하지 못했어요. 원문은 보관되어 있어요");
      await updateIntakeJob(request, (_plan, _coach, intake, current) => {
        if (current.status !== "running") throw new IntakeError("job_superseded", "기한이 지난 작업이에요", 409);
        intake.candidates.push(...result.candidates.map((candidate, index) => ({ ...candidate, id: `${job.id}:${index}`, baseValue: job.baseValues[candidate.fieldKey] ?? null, ...(job.baseFieldRevisions ? { baseFieldRevision: job.baseFieldRevisions[candidate.fieldKey] ?? null } : {}), status: "pending" as const })));
        intake.notes = intake.notes.map(note => job.noteIds.includes(note.id) ? { ...note, status: result.candidates.some(candidate => candidate.noteId === note.id) ? "review" : "stored" } : note);
        current.status = "complete";
      });
    } else if (job.kind === "edit") {
      // The AI only sees the editable facts and returns changes; every value is tried on a copy before it is offered.
      const snapshot = intakeSnapshot(claimed.plan, claimed.coach, claimed.intake);
      const editable = new Set<string>(EDITABLE_FACT_IDS);
      const questions = snapshot.questions.filter(question => editable.has(question.id));
      const shown = (value: unknown) => Array.isArray(value) ? value.join(", ") : value === null || value === undefined ? "" : String(value);
      /*
       * 보기 중에서만 고르는 질문(single·multi)만 choices 로 묶는다. 주 고객처럼 보기 + 직접 입력인 질문까지 choices 로 주면
       * AI가 보기에 없는 '아이 있는 동네 엄마들' 같은 값을 못 내고 "찾지 못했어요"로 끝났다(실제 AI 시험 2026-10-21) — 그런 질문은 examples 로만 보여 준다.
       */
      const facts = questions.map(question => {
        const labels = question.options?.length ? question.options.map(option => option.label).slice(0, 24) : null;
        return { questionId: question.id, label: question.label, current: shown(claimed.intake.answers[question.id]?.value), ...(labels ? ["single", "multi"].includes(question.kind) ? { choices: labels } : { examples: labels } : {}) };
      });
      /*
       * 계획서 전(사업 방향만 본 상태)에는 AI 한 번이 답할 말 · 바꿀 칸 · 방향을 다시 정리할지를 함께 정한다(chatIntake) — 묻는 말에는 답하고,
       * 바꿀 말이면 넣고 다시 정리한다. 계획서 뒤에는 예전처럼 바꿀 칸만 찾아 확인 카드로 묻는다(editIntake).
       */
      const beforeDocument = !Object.keys(claimed.plan.sections).length;
      const design = claimed.coach.design;
      /*
       * 손님이 보고 있는 것을 그대로 넘긴다 — 방향 카드 전체(대안 · 가정 · 다음 할 일 …)와 카드가 쓴 계산 숫자(financial), 각 값을 누가 정했는지(by).
       * 예전엔 제목 · 한 줄 소개만 넘겨 "아래 두 후보는 제가 볼 수 없어요"라고 답하거나, 본전을 따로 계산해 카드와 다른 숫자를 말했다(AI 손님 점검 2026-11-17).
       */
      const chatContext = beforeDocument ? JSON.stringify({
        business: claimed.coach.business.name,
        fields: claimed.coach.fields.map(field => ({ key: field.key, value: field.value.slice(0, 180), by: field.basis === "user" ? "founder" : "service" })),
        direction: design ? JSON.stringify(design).slice(0, 7000) : null,
        financial: planFinancialReference(claimed.coach, claimed.plan.answers).slice(0, 2500),
        ownerNotes: claimed.intake.notes.slice(-4).map(note => note.text.slice(0, 600)),
      }).slice(0, 13000) : "";
      let chat: { answer: string; rethink: boolean; cannotChange: string[] } | null = null, changes: Array<{ questionId: string; value: string }> = [];
      if (beforeDocument) {
        const result = await chatIntake(config, facts, chatContext, job.request ?? "");
        if (!result.ok) throw new IntakeError(result.reason, "답을 정리하지 못했어요. 적은 말은 그대로 두었으니 다시 보내 주세요");
        chat = { answer: result.answer, rethink: result.rethink, cannotChange: result.cannotChange }; changes = result.changes;
      } else {
        const result = await editIntake(config, facts, job.request ?? "");
        if (!result.ok) throw new IntakeError(result.reason, "바꿀 내용을 정리하지 못했어요. 바꿀 항목과 값을 함께 적어 다시 보내 주세요");
        changes = result.changes;
      }
      const toValue = (questionId: string, text: string) => {
        const question = questions.find(item => item.id === questionId)!;
        if (!["single", "multi"].includes(question.kind)) return text;
        const resolve = (piece: string) => question.options?.find(option => [option.value, option.label].some(label => label.replace(/\s+/g, "") === piece.replace(/\s+/g, "")))?.value;
        if (question.kind === "single") return resolve(text);
        const picks = text.split(/,\s*/).map(resolve);
        return picks.every((pick): pick is string => !!pick) ? picks : undefined;
      };
      const proposal: Array<{ questionId: string; value: string | string[] }> = [];
      for (const change of changes) {
        if (proposal.some(item => item.questionId === change.questionId)) continue;
        const value = toValue(change.questionId, change.value.trim());
        if (value === undefined) continue;
        try { applyIntakeAnswer(structuredClone(claimed.plan), structuredClone(claimed.coach), structuredClone(claimed.intake), { action: "answer", revision: 0, requestId: crypto.randomUUID(), questionId: change.questionId, value }, new Date().toISOString()); }
        catch { continue; }
        proposal.push({ questionId: change.questionId, value });
      }
      await updateIntakeJob(request, (_plan, coach, _intake, current) => {
        if (current.status !== "running" || coachDocumentRevision(coach) !== job.baseDocumentRevision) throw new IntakeError("source_changed", "정리하는 중 사업정보가 바뀌었어요. 다시 요청해 주세요", 409);
        current.proposal = proposal; current.status = "complete";
        const id = `${current.id}:reply`;
        /*
         * 계획서 전(사업 방향만 정리한 상태) — 바꿀 내용을 먼저 보여 주고 확인을 기다린다(대표 결정 2026-11-26, 예전 '바로 반영'을 바꿨다).
         * 묻는 말 · 인사뿐이면 답만 한다.
         */
        if (!Object.keys(_plan.sections).length && !coach.messages.some(message => message.id === id)) {
          const at = new Date().toISOString();
          // 대화로 못 바꾸는 항목(업종 등)의 바꾸는 방법은 AI 글이 아니라 정해진 말로 붙인다 — AI가 바꿀 수 있는 값까지 "눌러서 고치세요"로 넘기던 것을 막는다
          const howTo = (chat?.cannotChange ?? []).map(name => name.trim()).filter(Boolean).slice(0, 3);
          const guide = howTo.length ? `\n\n${howTo.join(", ")}${topicParticle(howTo.at(-1)!)} 대화에 있는 그 항목을 눌러 바꿀 수 있어요.` : "";
          if (chat?.answer) current.reply = chat.answer;
          // 묻는 말 · 걱정 · 인사뿐이면 답만 한다 — 방향은 그대로 둔다(예전엔 무엇을 적든 방향을 통째로 다시 만들었다)
          if (chat && !proposal.length && !chat.rethink) {
            coach.messages.push({ id, role: "assistant", text: `${chat.answer}${guide}`, at });
            coach.revision += 1;
            return;
          }
          // 바꿀 값이 있거나 방향을 다시 정리할 말이면 — 넣지 않고 확인(바꾸기 · 그대로 두기)을 기다린다. '바꾸기'를 누르면 위 edit-apply 가 넣는다
          if (!proposal.length) current.rethink = true;
          const ask = proposal.length ? "바꿀 내용을 정리했어요. 아래에서 확인해 주세요." : "말씀하신 내용을 넣어 사업 방향을 다시 정리할 수 있어요. 아래에서 골라 주세요.";
          coach.messages.push({ id, role: "assistant", text: `${chat?.answer ? `${chat.answer}\n\n${ask}` : ask}${guide}`, at });
          coach.revision += 1;
          return;
        }
        if (!coach.messages.some(message => message.id === id)) {
          coach.messages.push({ id, role: "assistant", text: proposal.length ? "바꿀 내용을 정리했어요. 아래에서 확인해 주세요." : "어떤 내용을 어떻게 바꿀지 찾지 못했어요. 예: 가격을 5,000원으로, 주 고객을 1인 가구로", at: new Date().toISOString() });
          coach.revision += 1;
        }
      });
    } else if (job.kind === "help") {
      /*
       * 손님이 남긴 메모도 함께 — 실제 AI 시험(2026-10-21): 월세·강사비 같은 숫자를 메모로 다 적고 "몇 명이면 적자가 안 나요?"라고 물었는데,
       * 메모는 항목 칸으로 아직 옮겨지지 않아 AI가 "지금 나온 숫자는 회원 목표뿐"이라고 답했다. 최근 메모(최대 5개, 합계 3,000자)를 참고 자료로 넘긴다.
       */
      const base = { stage: claimed.coach.stage, business: claimed.coach.business.name, fields: claimed.coach.fields.map(field => ({ key: field.key, value: field.value.slice(0, 180), basis: field.basis })), excerpted: true };
      // 질문과 합쳐 8,000자(helpIntake 한도)를 넘지 않게 남는 만큼만
      const room = Math.min(3000, 7600 - JSON.stringify(base).length - (job.request ?? "").length);
      const recentNotes: string[] = []; let noteChars = 0;
      for (const note of [...claimed.intake.notes].reverse()) {
        if (recentNotes.length >= 5 || noteChars >= room - 50) break;
        const text = note.text.slice(0, Math.min(1200, room - noteChars - 50)); if (!text) break;
        recentNotes.unshift(text); noteChars += text.length + 10;
      }
      const context = JSON.stringify(recentNotes.length ? { ...base, ownerNotes: recentNotes } : base);
      const result = await helpIntake(config, context, job.request ?? "");
      if (!result.ok) throw new IntakeError(result.reason, "AI 답변을 완료하지 못했어요. 질문을 짧게 나눠 다시 요청할 수 있고 사업정보는 그대로 보관되어 있어요");
      await updateIntakeJob(request, (_plan, coach, _intake, current) => {
        if (current.status !== "running" || coachDocumentRevision(coach) !== job.baseDocumentRevision) throw new IntakeError("source_changed", "답변 중 사업정보가 바뀌었어요. 질문은 보관되어 있으니 최신 조건으로 다시 요청해 주세요", 409);
        current.reply = result.message; current.status = "complete";
        const id = `${current.id}:reply`;
        if (!coach.messages.some(message => message.id === id)) {
          coach.messages.push({ id, role: "assistant", text: result.message, at: new Date().toISOString() });
          coach.revision += 1;
        }
      });
    } else {
      /*
       * 형식이 깨진 응답(invalid_json·invalid_response)이면 한 번만 다시 부른다. 운영에서 첫 요청이 이렇게 실패해
       * 사용자가 '다시 요청'을 눌러야 했다(2026-09-29). 한도·장애·시간 초과는 다시 부르지 않는다.
       */
      let raw: Record<string, unknown> | null = null;
      // 업종 가이드가 있으면 신고·등록 순서를 따로 넘긴다 — 가이드가 길이 때문에 맥락에서 빠져도 순서는 남게(2026-10-22 사업자등록 순서 어긋남)
      const guide = businessProfile(claimed.plan).playbook;
      // 이미 영업 중인 가게에는 신고·개업 순서를 넘기지 않는다(2026-11-25 0원 점검). 서비스 이름(오늘창업 홈페이지)은 장 작성 쪽처럼 '사업 홈페이지'로 넘긴다(계획서 품질 Q4)
      const stepOrder = guide && claimed.intake.mode !== "operating" ? `\n${JSON.stringify({ industryStepOrder: { name: guide.name, steps: playbookStepOrder(guide) } }).replace(/오늘창업\s*홈페이지/g, "사업 홈페이지")}` : "";
      for (let designAttempt = 0; designAttempt < 2 && !raw; designAttempt++) {
        let designFailure: string | undefined;
        raw = await completeJson(config, { system: BUSINESS_DESIGN_RULES, user: `${coachContext(claimed.coach, planFinancialReference(claimed.coach, claimed.plan.answers))}\n${confirmedIntakeContext(claimed.plan.answers)}${stepOrder}${ownerNotesContext(claimed.intake.notes)}`, jsonSchema: { name: "intake_design", schema: z.toJSONSchema(generatedBusinessDesignSchema) }, validateJson: value => { const ok = normalizeGeneratedDesign(value) !== null; if (!ok) console.warn("[business-intake-job]", JSON.stringify({ event: "design-invalid", jobId: job.id, issues: designValidationIssues(value) })); return ok; }, kind: "intake-design", timeoutMs: 60_000, maxOutputTokens: 4200, effort: "low", allowFallback: false , onFailure: event => { designFailure = event.code; } });
        if (!raw && designFailure !== "invalid_json" && designFailure !== "invalid_response") break;
      }
      const normalized = normalizeGeneratedDesign(raw);
      if (!normalized) throw new IntakeError("design_failed", "사업안 생성을 완료하지 못했어요. 입력 정보는 그대로 보관되어 있어요");
      // 업종 가이드와 어긋난 순서(신고번호를 받은 뒤 사업자등록 등)는 그 칸 끝에 바른 순서를 붙인다(규칙)
      const ordered = enforceDesignStepOrder(normalized, guide);
      if (ordered.fixed) console.info("[business-intake-job]", JSON.stringify({ event: "design-step-order-fixed", jobId: job.id, fields: ordered.fixed }));
      const design = ordered.design;
      await updateIntakeJob(request, (_plan, coach, _intake, current) => {
        if (current.status !== "running" || coachDocumentRevision(coach) !== job.baseDocumentRevision) throw new IntakeError("source_changed", "생성 중 사업정보가 바뀌었어요. 현재 입력을 확인한 뒤 다시 요청해 주세요", 409);
        coach.documentRevision = coachDocumentRevision(coach) + 1; coach.revision += 1;
        coach.design = { ...design, status: "proposal", sourceRevision: coach.documentRevision };
        /* 상호를 아직 정하지 않았으면 첫 답 문장('그냥 치킨집이요. 질문 좀 그만…') 대신 짧은 이름표로 목록에 보인다 — 실제 AI 시험 2026-10-21 */
        // 운영 중인 가게는 이미 이름이 있다 — AI가 지은 이름표를 가게 이름으로 넣지 않는다(결과 화면이 실제 이름을 묻는다, 2026-11-16 점검)
        adoptRenamedTitle(_plan, coach);
        if (!coach.business.nameConfirmed && design.identity?.label && _intake.mode !== "operating") { coach.business.name = design.identity.label; _plan.title = design.identity.label; }
        current.reply = businessDesignReply(design); current.status = "complete";
      });
    }
    console.info("[business-intake-job]", JSON.stringify({ event: "complete", jobId: job.id, kind: job.kind, elapsedMs: Date.now() - startedAt }));
    if (job.kind === "design" && process.env.OWNER_SMS_ENABLED === "1" && process.env.OWNER_SMS_REPORT_READY_ENABLED === "1") {
      try {
        await notifyOwnerBySms(job.id, "business-plan-ready");
      } catch {
        // A notification failure must not invalidate the already saved result.
        console.warn("[owner-sms] blocked:REPORT_NOTIFICATION_UNAVAILABLE");
      }
    }
    return { ok: true };
  } catch (error) {
    const budgetFailure = execution.budgetFailure?.();
    if (budgetFailure && !(error instanceof IntakeError && ["source_changed", "idea_source_changed", "job_superseded"].includes(error.code))) error = new IntakeError(budgetFailure.code, budgetFailure.message);
    await updateIntakeJob(request, (_plan, _coach, intake, current) => {
      if (current.status === "complete") return;
      current.status = "failed"; current.error = error instanceof IntakeError ? error.message : "자동 정리를 완료하지 못했어요. 원문은 보관되어 있어요";
      if(current.kind==="ideas") intake.ideaTurns=(intake.ideaTurns??[]).map(turn=>turn.id===current.id?{...turn,status:"failed"}:turn);
      intake.notes = intake.notes.map(note => current.noteIds.includes(note.id) ? { ...note, status: "failed" } : note);
    }).catch(() => undefined);
    console.info("[business-intake-job]", JSON.stringify({ event: "failed", jobId: job.id, kind: job.kind, code: error instanceof IntakeError ? error.code : "unexpected", elapsedMs: Date.now() - startedAt }));
    return { ok: false };
  }
}
