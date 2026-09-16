import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { resolvePlanningLLMConfig } from "../../../../lib/llm/config";
import { emptyCoach, generateAndSaveCoach, updateCoachJob } from "../../../../lib/plan-builder/coach-job";
import { COACH_JOB_KEY, readCoachJob, isCoachJobActive, isCoachJobStale, type CoachJob } from "../../../../lib/plan-builder/coach-job-types";
import { reconcileCoachJob } from "../../../../lib/plan-builder/coach-job-status";
import { serverPersistenceMode } from "../../../../lib/persistence";
import { loadPlanState, savePlanState, type ServerPlan } from "../../../../lib/plan-builder/plan-server-store";
import { chaptersForType } from "../../../../lib/plan-builder/blueprint";
import { checkSectionAccess, freePlanLimitReached, resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { COACH_KEY, COACH_TYPES, readCoach, coachDocumentRevision } from "../../../../lib/plan-builder/coach";
import { coachDocumentSnapshot } from "../../../../lib/plan-builder/coach-document";
import { resolveRegenQuota } from "../../../../lib/plan-builder/regen-quota";
import { loadConsultSession, saveConsultTurn, consultLimitFor } from "../../../../lib/consult/repository";
import { intakeGet, intakePost } from "../../../../lib/plan-builder/intake-http";
import { intakeFeatureEnabled } from "../../../../lib/plan-builder/intake-types";

export const runtime = "nodejs";
export const maxDuration = 300;
const requestSchema = z.object({
  action: z.enum(["message", "prepare"]).default("message"), planId: z.string().max(60).optional(),
  revision: z.number().int().nonnegative().default(0), requestId: z.string().uuid(),
  message: z.string().trim().max(22000).default(""), retry: z.boolean().default(false),
});
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function binding() {
  try { return (await getCloudflareContext({ async: true })).env.PLAN_SECTIONS_WORKFLOW ?? null; } catch { return null; }
}
function publicPlan(plan: ServerPlan, job = readCoachJob(plan.answers)) {
  const coach = readCoach(plan.answers);
  const keys = chaptersForType(plan.planType).flatMap(c => c.sections.map(s => `${c.id}/${s.id}`));
  const completed = keys.filter(k => {
    const section = plan.sections[k] as (ServerPlan["sections"][string] & { coachRevision?: number }) | undefined;
    return section && (section.edited || section.locked || section.coachRevision === (coach && coachDocumentRevision(coach)));
  });
  return { job: job ? { ...job, durable: job.durable && !!job.dispatched } : null, updatedAt: plan.updatedAt, hasDocuments: !!Object.keys(plan.sections).length, planId: plan.id, title: plan.title, planType: plan.planType, coach, completed, total: keys.length, manualReview: coachDocumentSnapshot(plan)?.manualReview ?? [], generation: plan.answers.__coach_generation ?? null };
}

async function visiblePlan(plan: ServerPlan, ownerHash: string): Promise<{ plan: ServerPlan; job: CoachJob | null }> {
  const job = readCoachJob(plan.answers);
  if (!job || !isCoachJobActive(job)) return { plan, job };
  if (isCoachJobStale(job)) return { plan, job: { ...job, status: "failed" } };
  if (job.durable) {
    const workflow = await binding();
    if (workflow) {
      try {
        const status = (await (await workflow.get(job.runId)).status()).status;
        if (["errored", "terminated", "complete"].includes(status)) {
          // The workflow can finish after the initial read. Return the fresh coach and job together.
          const latest = (await loadPlanState(ownerHash)).plans.find(p => p.id === plan.id);
          if (latest) return reconcileCoachJob(latest, job.token, status);
          return { plan, job };
        }
        return { plan, job: { ...job, dispatched: true } };
      } catch { /* A temporary status lookup failure is not a failed generation. */ }
    }
  }
  return { plan, job };
}

const prepareReceiptSchema = z.object({ id: z.string(), signature: z.string(), runId: z.string(), paid: z.boolean(), accepted: z.boolean() });
const prepareGenerationSchema = z.object({
  revision: z.number().int().nonnegative(), runId: z.string().min(1), keys: z.array(z.string()), paid: z.boolean(),
  receipts: z.array(prepareReceiptSchema).max(128).default([]),
  dispatchState: z.enum(["reserved", "dispatching", "uncertain", "dispatched"]).optional(),
  dispatchAt: z.string().optional(), dispatchToken: z.string().optional(),
}).passthrough();
type PrepareGeneration = z.infer<typeof prepareGenerationSchema>;
type PrepareWorkflow = NonNullable<Awaited<ReturnType<typeof binding>>>;
const nextPlanTimestamp = (at: string) => new Date(Math.max(Date.now(), (Date.parse(at) || 0) + 1)).toISOString();
const readGeneration = (plan: ServerPlan) => plan.answers.__coach_generation ? prepareGenerationSchema.parse(plan.answers.__coach_generation) : null;
const prepareConflict = () => json({ code: "revision_conflict", message: "사업정보나 제작 요청이 바뀌었어요. 최신 내용을 확인해주세요." }, 409);
const prepareUnavailable = () => json({ code: "prepare_unavailable", message: "제작 접수 상태를 확인하지 못했어요. 같은 요청으로 다시 확인해주세요." }, 503);

async function generationStatus(workflow: PrepareWorkflow, runId: string) {
  try { return (await (await workflow.get(runId)).status()).status; } catch { return null; }
}

async function prepareQuota(plan: ServerPlan, keys: string[], revision: number) {
  const count = keys.filter(key => { const value = plan.sections[key]; return value && !value.edited && !value.locked && value.coachRevision !== revision; }).length;
  if (!count) return null;
  const quota = await resolveRegenQuota(plan.id);
  if (quota.unavailable) return json({ code: "quota_unavailable", message: "재작성 이용량을 확인하지 못했어요. 기존 문서는 보관되어 있고 제작은 시작하지 않았어요." }, 503);
  return quota.remaining < count ? json({ message: `수정 내용 반영에 ${count}회 재작성이 필요합니다. 문서 화면에서 남은 횟수를 확인해주세요.` }, 402) : null;
}

async function markPrepareDispatch(ownerHash: string, planId: string, runId: string, accepted: boolean, token?: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await loadPlanState(ownerHash), plan = state.plans.find(item => item.id === planId);
    const coach = plan && readCoach(plan.answers), generation = plan && readGeneration(plan);
    if (!plan || !coach || !generation || generation.runId !== runId || token && generation.dispatchToken !== token) return null;
    const updatedAt = plan.updatedAt;
    generation.dispatchState = accepted ? "dispatched" : "uncertain";
    generation.dispatchAt = nextPlanTimestamp(updatedAt);
    if (accepted) generation.receipts = generation.receipts.map(receipt => receipt.runId === runId ? { ...receipt, accepted: true } : receipt);
    plan.answers.__coach_generation = generation;
    plan.updatedAt = generation.dispatchAt;
    try { await savePlanState(ownerHash, state, { planId, coachRevision: coach.revision, planUpdatedAt: updatedAt }); return plan; }
    catch (error) { if (!(error instanceof Error) || error.message !== "PLAN_VERSION_CONFLICT" || attempt === 4) throw error; }
  }
  return null;
}

async function dispatchPreparedPlan(ownerHash: string, planId: string, runId: string, workflow: PrepareWorkflow) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await loadPlanState(ownerHash), plan = state.plans.find(item => item.id === planId);
    const coach = plan && readCoach(plan.answers), generation = plan && readGeneration(plan);
    if (!plan || !coach || !generation || generation.runId !== runId) return prepareConflict();
    const status = await generationStatus(workflow, runId);
    if (status !== null) {
      const saved = await markPrepareDispatch(ownerHash, planId, runId, true).catch(() => null);
      if (["errored", "terminated"].includes(status)) return json({ plan: publicPlan(saved ?? plan), code: "generation_failed", message: "기존 제작 작업이 중단됐어요. 자동으로 다시 생성하지 않았습니다.", started: false }, 502);
      return json({ plan: publicPlan(saved ?? plan), started: true, paid: generation.paid });
    }
    if (generation.dispatchState === "dispatched") return json({ plan: publicPlan(plan), started: true, paid: generation.paid }, 202);
    if (generation.dispatchState === "dispatching" && Date.now() - Date.parse(generation.dispatchAt ?? "") < 60_000) return json({ plan: publicPlan(plan), started: false, message: "저장된 제작 요청의 접수를 확인하고 있어요." }, 202);
    if (coachDocumentRevision(coach) !== generation.revision) return prepareConflict();
    const quota = await prepareQuota(plan, generation.keys, generation.revision);
    if (quota) return quota;
    const updatedAt = plan.updatedAt, token = randomUUID();
    generation.dispatchState = "dispatching";
    generation.dispatchToken = token;
    generation.dispatchAt = nextPlanTimestamp(updatedAt);
    plan.answers.__coach_generation = generation;
    plan.updatedAt = generation.dispatchAt;
    try { await savePlanState(ownerHash, state, { planId, coachRevision: coach.revision, planUpdatedAt: updatedAt }); }
    catch (error) {
      if (error instanceof Error && error.message === "PLAN_VERSION_CONFLICT") continue;
      return prepareUnavailable();
    }
    // A retry can only recover this reserved ID, never start another paid workflow.
    try {
      await workflow.create({ id: runId, params: { ownerHash, planId, sections: generation.keys.map(key => { const [chapterId, sectionId] = key.split("/"); return { chapterId, sectionId }; }), reviewedBusiness: true } });
    } catch {
      const recovered = await generationStatus(workflow, runId);
      if (recovered === null) {
        await markPrepareDispatch(ownerHash, planId, runId, false, token).catch(() => undefined);
        return prepareUnavailable();
      }
      const saved = await markPrepareDispatch(ownerHash, planId, runId, true, token).catch(() => null);
      if (["errored", "terminated"].includes(recovered)) return json({ plan: publicPlan(saved ?? plan), code: "generation_failed", message: "기존 제작 작업이 중단됐어요. 자동으로 다시 생성하지 않았습니다.", started: false }, 502);
      return json({ plan: publicPlan(saved ?? plan), started: true, paid: generation.paid });
    }
    const saved = await markPrepareDispatch(ownerHash, planId, runId, true, token).catch(() => null);
    return json({ plan: publicPlan(saved ?? plan), started: true, paid: generation.paid });
  }
  return prepareConflict();
}

async function preparePlan(ownerHash: string, planId: string | undefined, input: z.infer<typeof requestSchema>) {
  if (!planId) return json({ message: "먼저 어떤 사업인지 대화로 알려주세요." }, 400);
  const signature = createHash("sha256").update(JSON.stringify({ action: "prepare", planId, revision: input.revision, message: input.message, retry: input.retry })).digest("hex");
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const state = await loadPlanState(ownerHash), plan = state.plans.find(item => item.id === planId);
      const coach = plan && readCoach(plan.answers);
      if (!plan || !coach) return json({ message: "이 사업을 찾을 수 없습니다." }, 404);
      const existing = readGeneration(plan), receipt = existing?.receipts.find(item => item.id === input.requestId);
      if (receipt && receipt.signature !== signature || coach.messages.some(message => message.id === input.requestId)) return json({ code: "request_reused", message: "같은 요청 번호로 다른 작업을 시작할 수 없어요." }, 409);
      const access = await resolvePlanAccess(plan.planType, plan.id);
      if (!access.authenticated) return json({ message: "대화는 보관했습니다. 로그인 후 초안을 만들 수 있습니다.", login: true }, 401);
      if (receipt?.accepted) return json({ plan: publicPlan(plan), started: true, paid: receipt.paid });
      if (coach.revision !== input.revision) return prepareConflict();
      if (!coach.ready) return json({ message: "먼저 어떤 사업인지 대화로 알려주세요." }, 400);
      const coachJob = readCoachJob(plan.answers);
      if (isCoachJobActive(coachJob) && !isCoachJobStale(coachJob!)) return prepareConflict();
      if (!access.paid && freePlanLimitReached(plan.id, state.plans, access.paidPlanIds)) return json({ message: "무료 초안 이용 범위를 모두 사용했습니다. 기존 문서에서 이어가거나 결제 후 제작해주세요." }, 402);
      const keys = chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => `${chapter.id}/${section.id}`)).filter(key => checkSectionAccess(access, key) === "ok");
      const workflow = await binding();
      if (!workflow) return prepareUnavailable();
      const revision = coachDocumentRevision(coach);
      const reusable = existing?.revision === revision && existing.paid === access.paid && JSON.stringify(existing.keys) === JSON.stringify(keys);
      if (receipt && (!reusable || receipt.runId !== existing?.runId)) return prepareConflict();
      if (receipt && existing) return await dispatchPreparedPlan(ownerHash, planId, existing.runId, workflow);
      if ((existing?.receipts.length ?? 0) >= 128) return json({ code: "prepare_limit", message: "제작 요청 보관 한도에 도달했어요. 기존 요청과 문서를 확인해주세요." }, 429);
      // A reservation with no dispatch claim can be superseded without paid work.
      if (existing && !reusable && existing.dispatchState !== "reserved") {
        const status = await generationStatus(workflow, existing.runId);
        if (status === null) return prepareUnavailable();
        if (!["complete", "errored", "terminated"].includes(status)) return prepareConflict();
      }
      const quota = !reusable && await prepareQuota(plan, keys, revision);
      if (quota) return quota;
      const runId = reusable ? existing!.runId : `coach-${createHash("sha256").update(`${ownerHash}\0${planId}\0${input.requestId}`).digest("hex").slice(0, 48)}`;
      const generation: PrepareGeneration = reusable ? existing! : { revision, runId, keys, paid: access.paid, receipts: existing?.receipts ?? [], dispatchState: "reserved" };
      generation.receipts.push({ id: input.requestId, signature, runId, paid: access.paid, accepted: reusable && existing!.dispatchState === "dispatched" });
      const updatedAt = plan.updatedAt;
      for (const key of keys) plan.answers[key] ??= { planning_source: "사업 기획 대화의 공통 정보" };
      plan.answers.__coach_generation = generation;
      plan.updatedAt = nextPlanTimestamp(updatedAt);
      state.activePlanId = plan.id;
      try { await savePlanState(ownerHash, state, { planId, coachRevision: coach.revision, planUpdatedAt: updatedAt }); }
      catch (error) {
        if (error instanceof Error && error.message === "PLAN_VERSION_CONFLICT") continue;
        return prepareUnavailable();
      }
      return await dispatchPreparedPlan(ownerHash, planId, runId, workflow);
    }
    return prepareConflict();
  } catch { return prepareUnavailable(); }
}

export async function GET(request: Request) {
  if (request.headers.get("x-business-intake") === "2") return intakeGet(request);
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const id = new URL(request.url).searchParams.get("planId");
  let plan = id ? state.plans.find(p => p.id === id) : state.plans.filter(p => readCoach(p.answers)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!plan) return json({ plan: null, authenticated: !!identity.userId });
  if (!readCoach(plan.answers)) return json({ message: "이 문서는 내 사업 목록의 기존 편집 화면에서 확인해주세요." }, 404);
  const visible = await visiblePlan(plan, identity.hash);
  plan = visible.plan;
  const access = await resolvePlanAccess(plan.planType, plan.id);
  let runStatus: string | null = null;
  const runId = plan.answers.__coach_generation?.runId;
  if (typeof runId === "string") {
    const workflow = await binding();
    if (workflow) {
      try { runStatus = (await (await workflow.get(runId)).status()).status; } catch { runStatus = "unknown"; }
    }
  }
  return json({ plan: publicPlan(plan, visible.job), authenticated: !!identity.userId, paid: access.paid, runStatus });
}

export async function POST(request: Request) {
  if (request.headers.get("x-business-intake") === "2") return intakePost(request, postLegacyChat);
  if (intakeFeatureEnabled()) return json({ message: "새 사업 진단 화면을 불러와 주세요. 입력은 그대로 보관해 주세요.", code: "flow_upgrade" }, 409);
  return postLegacyChat(request);
}

async function postLegacyChat(request: Request) {
  const limited = await enforceRateLimit("business-coach", request, { limit: 24, windowMs: 10 * 60000 });
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "메시지를 다시 확인해주세요." }, 400);
  const input = parsed.data;
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  let plan = state.plans.find(p => p.id === (input.planId ?? `plan_${input.requestId}`));
  if (input.planId && !plan) return json({ message: "이 사업을 찾을 수 없습니다." }, 404);
  const visible = plan ? await visiblePlan(plan, identity.hash) : null;
  if (visible) {
    const index = state.plans.findIndex(p => p.id === visible.plan.id);
    state.plans[index] = visible.plan;
    plan = visible.plan;
  }
  const previous = plan ? readCoach(plan.answers) : null;
  if (plan && !previous) return json({ message: "기존 문서를 바꾸려면 내 사업 목록에서 해당 문서를 열어주세요." }, 400);
  if (input.action === "prepare") return preparePlan(identity.hash, plan?.id, input);
  if (previous?.messages.some(m => m.id === input.requestId)) return json({ plan: publicPlan(plan!), authenticated: !!identity.userId });
  if ((previous?.revision ?? 0) !== input.revision) return json({ message: "다른 화면에서 수정됐습니다. 최신 대화를 불러와주세요." }, 409);

  const oldJob = plan ? readCoachJob(plan.answers) : null;
  const shownJob = visible?.job ?? null;
  if (isCoachJobActive(shownJob)) return input.action === "message" && oldJob?.message.id === input.requestId
    ? json({ plan: publicPlan(plan!, shownJob), authenticated: !!identity.userId }, 202)
    : json({ message: "먼저 보낸 내용을 정리하고 있어요. 완료 후 이어서 말씀해 주세요." }, 409);

  const retry = !!input.retry && !!plan && !!oldJob && oldJob.message.id === input.requestId && shownJob?.status === "failed";
  if (input.retry && !retry) return json({ message: "다시 시도할 작업을 찾지 못했어요. 대화를 새로 불러와 주세요." }, 409);
  if (retry && oldJob!.attempt >= 3) return json({ message: "여러 번 완성하지 못했어요. 잠시 후 내용을 짧게 정리해 다시 보내주세요." }, 429);
  if (!retry && !input.message) return json({ message: "메시지를 입력해주세요." }, 400);
  const session = await loadConsultSession(identity.hash);
  const limit = consultLimitFor(identity.userId);
  if (!retry && (session?.turnsToday ?? 0) >= limit) return json({ message: identity.userId ? "오늘 대화 이용량을 모두 사용했습니다. 저장된 계획은 계속 확인할 수 있습니다." : "로그인하면 지금 대화에서 이어갈 수 있습니다.", login: !identity.userId }, 429);
  if (!resolvePlanningLLMConfig(identity.hash)) return json({ message: "사업 기획 AI 연결을 준비 중입니다. 잠시 후 다시 시도해주세요." }, 503);
  if ((previous?.messages.length ?? 0) >= 160) return json({ message: "대화가 길어졌습니다. 작성한 문서에서 이어서 수정해주세요." }, 400);
  if ((previous?.messages.reduce((total, m) => total + m.text.length, 0) ?? 0) + input.message.length > 240000) return json({ message: "첨부한 대화 자료가 많습니다. 필요한 부분만 나누어 새 대화에서 이어가주세요." }, 413);
  if (!plan && state.plans.filter(p => readCoach(p.answers)).length >= 20) return json({ message: "기존 사업 대화에서 이어가거나 사용하지 않는 사업을 삭제해주세요." }, 400);
  const at = new Date().toISOString();
  const previousUpdatedAt = plan?.updatedAt ?? null;
  const workflow = await binding();
  const durable = !!workflow && serverPersistenceMode() === "supabase";
  const token = crypto.randomUUID();
  const job: CoachJob = {
    token, runId: `coach-chat-${token}`, baseRevision: previous?.revision ?? 0,
    message: retry ? oldJob!.message : { id: input.requestId, role: "user", text: input.message, at },
    status: "queued", phase: "queued", durable, attempt: retry ? oldJob!.attempt + 1 : 1, updatedAt: at,
  };
  if (!plan) {
    plan = { id: `plan_${input.requestId}`, title: "새 사업 구상", planType: COACH_TYPES.startup, createdAt: at, updatedAt: at, answers: { [COACH_KEY]: { state: emptyCoach() } }, sections: {} };
    state.plans.push(plan);
  }
  plan.answers[COACH_JOB_KEY] = job;
  plan.updatedAt = at;
  state.activePlanId = plan.id;
  const requestJob = { ownerHash: identity.hash, planId: plan.id, token };
  try {
    await savePlanState(identity.hash, state, { planId: plan.id, coachRevision: input.revision, jobToken: oldJob?.token ?? null, planUpdatedAt: previousUpdatedAt });
  } catch { return json({ message: "저장 상태가 변경됐어요. 대화를 새로 불러온 뒤 이어가 주세요." }, 409); }
  try {
    // Reserve the turn before dispatch. Retrying this saved request does not count a new turn.
    if (!retry) await saveConsultTurn(identity.hash, { profile: session?.profile ?? {}, appended: [], turnsToday: (session?.turnsToday ?? 0) + 1 });
    if (durable) {
      try { await workflow!.create({ id: job.runId, params: { operation: "coach", ...requestJob } }); }
      catch (error) {
        // A lost dispatch response may still have created the workflow.
        try { await (await workflow!.get(job.runId)).status(); }
        catch {
          // Do not start another workflow while acceptance is uncertain. GET reconciles this run ID.
          return json({ plan: publicPlan(plan), authenticated: !!identity.userId, message: "서버 접수 상태를 확인하고 있어요." }, 202);
        }
      }
      return json({ plan: publicPlan(plan, { ...job, dispatched: true }), authenticated: !!identity.userId }, 202);
    }
    // Local environments without a durable workflow must not promise background completion.
    await generateAndSaveCoach(requestJob);
    const saved = (await loadPlanState(identity.hash)).plans.find(p => p.id === plan!.id)!;
    return json({ plan: publicPlan(saved), authenticated: !!identity.userId });
  } catch {
    await updateCoachJob(requestJob, { status: "failed" }).catch(() => undefined);
    const saved = (await loadPlanState(identity.hash)).plans.find(p => p.id === plan!.id);
    return json({ plan: saved ? publicPlan(saved) : null, authenticated: !!identity.userId, message: "답변을 완성하지 못했어요. 저장된 내용으로 다시 시도해 주세요." }, 502);
  }
}
