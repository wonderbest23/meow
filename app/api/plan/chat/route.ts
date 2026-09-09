import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { resolvePlanningLLMConfig } from "../../../../lib/llm/config";
import { emptyCoach, generateAndSaveCoach, updateCoachJob } from "../../../../lib/plan-builder/coach-job";
import { COACH_JOB_KEY, readCoachJob, isCoachJobActive, isCoachJobStale, type CoachJob } from "../../../../lib/plan-builder/coach-job-types";
import { serverPersistenceMode } from "../../../../lib/persistence";
import { loadPlanState, savePlanState, type ServerPlan } from "../../../../lib/plan-builder/plan-server-store";
import { chaptersForType } from "../../../../lib/plan-builder/blueprint";
import { checkSectionAccess, freePlanLimitReached, resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { COACH_KEY, COACH_TYPES, readCoach, coachDocumentRevision } from "../../../../lib/plan-builder/coach";
import { coachDocumentSnapshot } from "../../../../lib/plan-builder/coach-document";
import { resolveRegenQuota } from "../../../../lib/plan-builder/regen-quota";
import { loadConsultSession, saveConsultTurn, consultLimitFor } from "../../../../lib/consult/repository";

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

async function visibleJob(plan: ServerPlan): Promise<CoachJob | null> {
  const job = readCoachJob(plan.answers);
  if (!job || !isCoachJobActive(job)) return job;
  if (isCoachJobStale(job)) return { ...job, status: "failed" };
  if (job.durable) {
    const workflow = await binding();
    if (workflow) {
      try {
        const status = (await (await workflow.get(job.runId)).status()).status;
        if (["errored", "terminated", "complete"].includes(status)) return { ...job, status: "failed" };
        return { ...job, dispatched: true };
      } catch { /* A temporary status lookup failure is not a failed generation. */ }
    }
  }
  return job;
}

export async function GET(request: Request) {
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const id = new URL(request.url).searchParams.get("planId");
  const plan = id ? state.plans.find(p => p.id === id) : state.plans.filter(p => readCoach(p.answers)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!plan) return json({ plan: null, authenticated: !!identity.userId });
  if (!readCoach(plan.answers)) return json({ message: "이 문서는 내 사업 목록의 기존 편집 화면에서 확인해주세요." }, 404);
  const access = await resolvePlanAccess(plan.planType, plan.id);
  let runStatus: string | null = null;
  const runId = plan.answers.__coach_generation?.runId;
  if (typeof runId === "string") {
    const workflow = await binding();
    if (workflow) {
      try { runStatus = (await (await workflow.get(runId)).status()).status; } catch { runStatus = "unknown"; }
    }
  }
  return json({ plan: publicPlan(plan, await visibleJob(plan)), authenticated: !!identity.userId, paid: access.paid, runStatus });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("business-coach", request, { limit: 24, windowMs: 10 * 60000 });
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "메시지를 다시 확인해주세요." }, 400);
  const input = parsed.data;
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  let plan = state.plans.find(p => p.id === (input.planId ?? `plan_${input.requestId}`));
  if (input.planId && !plan) return json({ message: "이 사업을 찾을 수 없습니다." }, 404);
  const previous = plan ? readCoach(plan.answers) : null;
  if (plan && !previous) return json({ message: "기존 문서를 바꾸려면 내 사업 목록에서 해당 문서를 열어주세요." }, 400);
  if (previous?.messages.some(m => m.id === input.requestId)) return json({ plan: publicPlan(plan!), authenticated: !!identity.userId });
  if ((previous?.revision ?? 0) !== input.revision) return json({ message: "다른 화면에서 수정됐습니다. 최신 대화를 불러와주세요." }, 409);

  const oldJob = plan ? readCoachJob(plan.answers) : null;
  const shownJob = plan ? await visibleJob(plan) : null;
  if (isCoachJobActive(shownJob)) return input.action === "message" && oldJob?.message.id === input.requestId
    ? json({ plan: publicPlan(plan!, shownJob), authenticated: !!identity.userId }, 202)
    : json({ message: "먼저 보낸 내용을 정리하고 있어요. 완료 후 이어서 말씀해 주세요." }, 409);

  if (input.action === "prepare") {
    if (!plan || !previous?.ready) return json({ message: "먼저 어떤 사업인지 대화로 알려주세요." }, 400);
    const access = await resolvePlanAccess(plan.planType, plan.id);
    if (!access.authenticated) return json({ message: "대화는 보관했습니다. 로그인 후 초안을 만들 수 있습니다.", login: true }, 401);
    if (!access.paid && freePlanLimitReached(plan.id, state.plans, access.paidPlanIds)) return json({ message: "무료 초안 이용 범위를 모두 사용했습니다. 기존 문서에서 이어가거나 결제 후 제작해주세요." }, 402);
    const sections = chaptersForType(plan.planType).flatMap(c => c.sections.map(s => ({ chapterId: c.id, sectionId: s.id })))
      .filter(s => checkSectionAccess(access, `${s.chapterId}/${s.sectionId}`) === "ok");
    const workflow = await binding();
    if (!workflow) return json({ message: "현재 환경에는 문서 제작 서버가 연결되어 있지 않습니다. 대화는 저장되어 있습니다." }, 503);
    const revision = coachDocumentRevision(previous);
    const existing = plan.answers.__coach_generation;
    if (existing?.revision === revision && existing?.runId && existing?.paid === access.paid) {
      try {
        const status = await (await workflow.get(String(existing.runId))).status();
        if (!["errored", "terminated", "complete"].includes(status.status)) return json({ plan: publicPlan(plan), started: true, paid: access.paid });
      } catch { /* A saved dispatch may have failed before the workflow was created. */ }
    }
    const regenerations = sections.filter(s => { const v = plan!.sections[`${s.chapterId}/${s.sectionId}`]; return v && !v.edited && !v.locked && v.coachRevision !== revision; }).length;
    if (regenerations && (await resolveRegenQuota(plan.id)).remaining < regenerations) return json({ message: `수정 내용 반영에 ${regenerations}회 재작성이 필요합니다. 문서 화면에서 남은 횟수를 확인해주세요.` }, 402);
    for (const s of sections) plan.answers[`${s.chapterId}/${s.sectionId}`] ??= { planning_source: "사업 기획 대화의 공통 정보" };
    // Save context before dispatch; the worker always reads the owner's stored snapshot.
    const runId = `coach-${input.requestId}`;
    plan.answers.__coach_generation = { revision, runId, keys: sections.map(s => `${s.chapterId}/${s.sectionId}`), paid: access.paid };
    plan.updatedAt = new Date().toISOString();
    state.activePlanId = plan.id;
    try { await savePlanState(identity.hash, state, { planId: plan.id, coachRevision: previous.revision }); }
    catch { return json({ message: "저장 상태가 변경됐습니다. 대화를 다시 불러온 뒤 제작해주세요." }, 409); }
    try { await workflow.create({ id: runId, params: { ownerHash: identity.hash, planId: plan.id, sections, reviewedBusiness: true } }); }
    catch { return json({ message: "제작 요청을 보내지 못했습니다. 다시 시도해주세요." }, 503); }
    return json({ plan: publicPlan(plan), started: true, paid: access.paid });
  }

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
