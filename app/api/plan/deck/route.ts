import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { resolveLLMConfig, resolvePlanningLLMConfig } from "../../../../lib/llm/config";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { coachDocumentSnapshot } from "../../../../lib/plan-builder/coach-document";
import { coachContext, readCoach } from "../../../../lib/plan-builder/coach";
import { buildDeckPlan } from "../../../../lib/plan-builder/deck-plan";
import { renderDeckPptx } from "../../../../lib/plan-builder/deck-render";
import { pickDeckTheme } from "../../../../lib/plan-builder/deck-themes";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { savePlanState } from "../../../../lib/plan-builder/plan-server-store";
import { deckSource, deckFingerprint } from "../../../../lib/plan-builder/deck-job";
import { DECK_JOB_KEY, readDeckJob, deckJobActive, deckJobExpired, deckRetryState, publicDeckJob, type DeckJob } from "../../../../lib/plan-builder/deck-job-types";
import type { DeckBuildEvent } from "../../../../lib/plan-builder/deck-plan";
import { PPT_GENERATION_VERIFIED, PPT_PREPARING_MESSAGE } from "../../../../lib/plan-builder/deck-availability";

export const runtime = "nodejs";
export const maxDuration = 300;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function workflowBinding() {
  try { return (await getCloudflareContext({ async: true })).env.PLAN_SECTIONS_WORKFLOW ?? null; } catch { return null; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const planId = url.searchParams.get("planId");
  if (!planId || planId.length > 60) return json({ message: "사업을 선택해주세요." }, 400);
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  let plan = state.plans.find(p => p.id === planId);
  if (!plan) return json({ message: "문서를 찾을 수 없습니다." }, 404);
  const access = await resolvePlanAccess(plan.planType, planId);
  if (!access.authenticated || !access.paid) return json({ message: "발표자료는 로그인 및 결제 후 이용할 수 있습니다." }, access.authenticated ? 402 : 401);
  let job = readDeckJob(plan.answers);
  if (job && deckJobActive(job)) {
    try {
      const workflow = await workflowBinding();
      const status = workflow && (await (await workflow.get(job.runId)).status()).status;
      if (status && ["complete", "errored", "terminated"].includes(status)) {
        plan = (await loadPlanState(identity.hash)).plans.find(p => p.id === planId) ?? plan;
        const fresh = readDeckJob(plan.answers);
        if (fresh?.token === job.token && deckJobActive(fresh)) job = { ...fresh, status: "failed", phase: "failed", code: "workflow_incomplete" };
        else job = fresh;
      }
    } catch { /* Keep polling through transient status lookup errors. */ }
    if (job && deckJobActive(job) && deckJobExpired(job)) job = { ...job, status: "failed", phase: "failed", code: "job_timeout" };
  }
  let stale = false;
  try { stale = !!job && deckFingerprint(deckSource(plan, state.business)) !== job.fingerprint; } catch { stale = !!job; }
  if (url.searchParams.get("download") !== "1") return json({ job: publicDeckJob(job), stale, generationEnabled: PPT_GENERATION_VERIFIED });
  if (stale) return json({ message: "계획서가 수정됐습니다. 최신 내용으로 발표자료를 다시 만들어주세요." }, 409);
  if (job?.status !== "complete" || !job.result) return json({ message: "발표자료가 아직 준비되지 않았습니다." }, 409);
  const limited = await enforceRateLimit("deck-download", req, { limit: 12, windowMs: 10 * 60000 });
  if (limited) return limited;
  try {
    const buffer = await renderDeckPptx(job.result, pickDeckTheme(plan.planType, job.result.brandName, ""));
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="business-plan.pptx"; filename*=UTF-8''${encodeURIComponent(`${job.result.brandName} 사업 제안서.pptx`)}` } });
  } catch {
    console.error("[deck]", JSON.stringify({ token: job.token, stage: "rendering", code: "render_failed" }));
    return json({ message: "파일 제작에 실패했습니다. 완성된 발표자료 내용은 보관되어 있으니 내려받기를 다시 눌러주세요.", code: "render_failed" }, 502);
  }
}

// 완성한 계획서로 발표용 PPT를 만든다.
// 유료 결과물이므로 결제 여부를 먼저 확인한다.

export async function POST(req: Request) {
  // AI·렌더 비용이 드는 호출 — 화면 제어와 별개로 서버에서 빈도를 제한한다
  const limited = await enforceRateLimit("deck-build", req, { limit: 12, windowMs: 10 * 60_000, message: "발표자료 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as {
    /** true면 PPTX 대신 슬라이드 구성(JSON)을 돌려준다 — 품질 검수·테스트용 */
    planOnly?: boolean;
    background?: boolean;
    businessName?: string;
    businessDescription?: string;
    planType?: string;
    planId?: string;
    sections?: Array<{ chapterTitle?: string; sectionTitle?: string; markdown?: string }>;
    allAnswers?: Record<string, Record<string, unknown>>;
  };

  const access = await resolvePlanAccess(body.planType, typeof body.planId === "string" ? body.planId : undefined);
  if (!access.authenticated) {
    return NextResponse.json({ error: "login_required", message: "로그인 후 이용할 수 있습니다." }, { status: 401 });
  }
  if (!access.paid) {
    return NextResponse.json(
      { error: "payment_required", message: "발표자료는 결제 후 만들 수 있습니다." },
      { status: 402 },
    );
  }

  const identity = await requireGuestIdentity();
  if (body.background) {
    if (!body.planId || body.planId.length > 60) return json({ message: "사업을 선택해주세요." }, 400);
    const state = await loadPlanState(identity.hash);
    const saved = state.plans.find(p => p.id === body.planId);
    if (!saved) return json({ message: "문서를 찾을 수 없습니다." }, 404);
    let source;
    try { source = deckSource(saved, state.business); }
    catch { return json({ message: "먼저 최신 사업 내용을 계획서에 반영해주세요. 기존 문서는 유지됩니다." }, 409); }
    const fingerprint = deckFingerprint(source);
    const old = readDeckJob(saved.answers);
    if (old && deckJobActive(old) && !deckJobExpired(old)) {
      const workflow = await workflowBinding();
      let terminal = false;
      try { terminal = !!workflow && ["complete", "errored", "terminated"].includes((await (await workflow.get(old.runId)).status()).status); } catch { /* Avoid a duplicate when dispatch acceptance is uncertain. */ }
      if (!terminal) return json({ job: publicDeckJob(old), stale: old.fingerprint !== fingerprint }, 202);
    }
    if (old?.status === "complete" && old.fingerprint === fingerprint) return json({ job: publicDeckJob(old), stale: false });
    if (!PPT_GENERATION_VERIFIED) return json({ message: PPT_PREPARING_MESSAGE, code: "ppt_preparing" }, 503);
    const retry = deckRetryState(old, fingerprint);
    if (retry.retryAfterSeconds) return NextResponse.json({ message: `짧은 시간에 여러 번 제작을 시도했어요. ${Math.ceil(retry.retryAfterSeconds / 60)}분 후 다시 시도해주세요. 보관한 초안은 유지돼요.`, code: "retry_limited", reference: old?.token }, { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(retry.retryAfterSeconds) } });
    const workflow = await workflowBinding();
    if (!workflow) return json({ message: "현재 환경에는 발표자료 제작 서버가 연결되어 있지 않습니다." }, 503);
    const token = crypto.randomUUID();
    const job: DeckJob = { token, runId: `deck-${token}`, fingerprint, status: "queued", phase: "queued", updatedAt: new Date().toISOString(), attempt: retry.attempt, retryWindowStartedAt: retry.retryWindowStartedAt,
      ...(old?.fingerprint === fingerprint && old.draft && !["source_validation_failed", "invalid_slides", "review_json_invalid"].includes(old.code ?? "") ? { draft: old.draft } : {}),
      ...(old?.fingerprint === fingerprint && old.result && old.code === "render_failed" ? { result: old.result } : {}) };
    const previousUpdatedAt = saved.updatedAt;
    saved.answers[DECK_JOB_KEY] = { ...job }; saved.updatedAt = job.updatedAt;
    try { await savePlanState(identity.hash, state, { planId: saved.id, coachRevision: readCoach(saved.answers)?.revision ?? 0, planUpdatedAt: previousUpdatedAt }); }
    catch { return json({ message: "다른 화면에서 수정됐습니다. 문서를 새로 불러온 뒤 다시 시도해주세요." }, 409); }
    try { await workflow.create({ id: job.runId, params: { operation: "deck", ownerHash: identity.hash, planId: saved.id, token } }); }
    catch { return json({ job: publicDeckJob(job), message: "서버 접수 상태를 확인하고 있어요." }, 202); }
    return json({ job: publicDeckJob(job), stale: false }, 202);
  }
  if (!PPT_GENERATION_VERIFIED) return json({ message: PPT_PREPARING_MESSAGE, code: "ppt_preparing" }, 503);
  let businessContext: string | undefined;
  if (body.planId) {
    const saved = (await loadPlanState(identity.hash)).plans.find(p => p.id === body.planId);
    if (!saved) return NextResponse.json({ message: "문서를 찾을 수 없습니다." }, { status: 404 });
    const snapshot = coachDocumentSnapshot(saved);
    const coach = readCoach(saved.answers);
    if (snapshot && coach) {
      if (snapshot.stale.length || snapshot.missing.length) {
        return NextResponse.json({ message: "대화에서 최신 내용을 문서에 반영한 뒤 발표자료를 만들어주세요. 기존 내용은 유지되어 있습니다." }, { status: 409 });
      }
      body.businessName = snapshot.business.name;
      body.businessDescription = snapshot.business.description;
      body.planType = saved.planType;
      body.sections = snapshot.sections;
      body.allAnswers = saved.answers;
      businessContext = coachContext(coach);
    }
  }

  const sections = (Array.isArray(body.sections) ? body.sections : [])
    .map((s) => ({
      chapterTitle: String(s.chapterTitle ?? "").slice(0, 60),
      sectionTitle: String(s.sectionTitle ?? "").slice(0, 60),
      markdown: String(s.markdown ?? ""),
    }))
    .filter((s) => s.markdown.trim().length > 0);

  if (sections.length < 3) {
    return NextResponse.json(
      { error: "not_enough_content", message: "섹션을 3개 이상 작성한 뒤 만들 수 있습니다." },
      { status: 400 },
    );
  }

  const config = businessContext ? resolvePlanningLLMConfig(identity.hash) : resolveLLMConfig(identity.hash, "anthropic");

  const reference = crypto.randomUUID();
  let lastEvent: DeckBuildEvent | undefined;
  const plan = await buildDeckPlan(config, {
    businessName: String(body.businessName ?? "").slice(0, 60) || "사업 제안서",
    businessDescription: body.businessDescription ? String(body.businessDescription).slice(0, 500) : undefined,
    planType: body.planType,
    sections,
    allAnswers: body.allAnswers ?? {},
    businessContext,
  }, event => { lastEvent = event; console.log("[deck]", JSON.stringify({ reference, ...event })); });

  if (!plan) {
    return NextResponse.json(
      { error: "deck_failed", message: "발표자료를 만들지 못했습니다. 잠시 후 다시 시도해주세요.", reference, code: lastEvent?.code },
      { status: 502 },
    );
  }

  if (body.planOnly) {
    return NextResponse.json({ plan }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }

  const theme = pickDeckTheme(body.planType, String(body.businessName ?? ""), String(body.businessDescription ?? ""));
  const buffer = await renderDeckPptx(plan, theme);
  const safe = `${plan.brandName} 사업 제안서`.replace(/[\\/:*?"<>|]/g, "").trim() || "사업 제안서";
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${ascii}.pptx"; filename*=UTF-8''${encodeURIComponent(safe)}.pptx`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
