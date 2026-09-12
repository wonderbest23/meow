import { createHash } from "node:crypto";
import { resolveLLMConfig, resolvePlanningLLMConfig } from "../llm/config";
import { coachContext, readCoach } from "./coach";
import { coachDocumentSnapshot } from "./coach-document";
import { chaptersForType } from "./blueprint";
import { buildDeckPlan, type DeckBuildInput } from "./deck-plan";
import { renderDeckPptx } from "./deck-render";
import { pickDeckTheme } from "./deck-themes";
import { DECK_JOB_KEY, readDeckJob, type DeckJob, type DeckJobRequest } from "./deck-job-types";
import { loadPlanState, savePlanState, type ServerPlan, type ServerBusinessProfile } from "./plan-server-store";

export function deckSource(plan: ServerPlan, business: ServerBusinessProfile): DeckBuildInput {
  const coach = readCoach(plan.answers);
  const snapshot = coachDocumentSnapshot(plan);
  if (snapshot && (snapshot.stale.length || snapshot.missing.length)) throw new Error("document_stale");
  const sections = snapshot?.sections ?? chaptersForType(plan.planType).flatMap(chapter => chapter.sections.flatMap(section => {
    const saved = plan.sections[`${chapter.id}/${section.id}`];
    return saved?.markdown ? [{ chapterTitle: chapter.title, sectionTitle: section.title, markdown: saved.markdown }] : [];
  }));
  if (sections.length < 3) throw new Error("not_enough_content");
  const sourceBusiness = snapshot?.business ?? business;
  return { businessName: sourceBusiness.name || plan.title, businessDescription: sourceBusiness.description, planType: plan.planType, sections, allAnswers: Object.fromEntries(Object.entries(plan.answers).filter(([key]) => !key.startsWith("__"))), ...(coach ? { businessContext: coachContext(coach) } : {}) };
}
export function deckFingerprint(source: DeckBuildInput) {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}
async function patchJob(request: DeckJobRequest, patch: Partial<DeckJob>, queuedOnly = false) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await loadPlanState(request.ownerHash);
    const plan = state.plans.find(p => p.id === request.planId);
    const job = plan && readDeckJob(plan.answers);
    if (!plan || !job || job.token !== request.token || job.status === "complete" || (queuedOnly && job.status !== "queued")) throw new Error("deck_superseded");
    const previousUpdatedAt = plan.updatedAt;
    plan.answers[DECK_JOB_KEY] = { ...job, ...patch, updatedAt: new Date().toISOString() };
    plan.updatedAt = new Date().toISOString();
    try { await savePlanState(request.ownerHash, state, { planId: plan.id, coachRevision: readCoach(plan.answers)?.revision ?? 0, planUpdatedAt: previousUpdatedAt }); return; }
    catch (error) { if (!(error instanceof Error) || error.message !== "PLAN_VERSION_CONFLICT" || attempt === 4) throw error; }
  }
}
export async function generateAndSaveDeck(request: DeckJobRequest): Promise<{ ok: boolean }> {
  const state = await loadPlanState(request.ownerHash);
  const plan = state.plans.find(p => p.id === request.planId);
  const job = plan && readDeckJob(plan.answers);
  if (!plan || !job || job.token !== request.token) throw new Error("deck_not_found");
  if (job.status === "complete") return { ok: true };
  await patchJob(request, { status: "running" }, true);
  let code = "generation_failed";
  const startedAt = Date.now();
  let stageStartedAt = startedAt;
  let previousStage: string = "queued";
  try {
    const source = deckSource(plan, state.business);
    if (deckFingerprint(source) !== job.fingerprint) throw new Error("document_changed");
    const config = source.businessContext ? resolvePlanningLLMConfig(request.ownerHash) : resolveLLMConfig(request.ownerHash, "anthropic");
    const result = job.result ?? await buildDeckPlan(config, source, async event => {
      const now = Date.now();
      console.log("[deck]", JSON.stringify({ token: request.token, ...event, previousStage, stageElapsedMs: now - stageStartedAt, totalElapsedMs: now - startedAt }));
      previousStage = event.stage; stageStartedAt = now;
      if (event.code) code = event.code;
      await patchJob(request, { phase: event.stage === "ready" ? "validating" : event.stage, ...(event.code ? { code: event.code } : {}) });
    }, { draft: job.draft, saveDraft: async draft => patchJob(request, { draft }) });
    if (!result) throw new Error(code);
    await patchJob(request, { phase: "rendering", result });
    try {
      const buffer = await renderDeckPptx(result, pickDeckTheme(plan.planType, result.brandName, ""));
      if (buffer.length < 1000 || buffer.subarray(0, 2).toString() !== "PK") throw new Error("invalid_pptx");
    } catch { throw new Error("render_failed"); }
    const latest = await loadPlanState(request.ownerHash);
    const current = latest.plans.find(p => p.id === request.planId);
    if (!current || deckFingerprint(deckSource(current, latest.business)) !== job.fingerprint) throw new Error("document_changed");
    await patchJob(request, { status: "complete", phase: "ready", result, code: undefined });
    console.log("[deck]", JSON.stringify({ token: request.token, stage: "ready", totalElapsedMs: Date.now() - startedAt }));
    return { ok: true };
  } catch (error) {
    code = error instanceof Error ? error.message : "generation_failed";
    console.error("[deck]", JSON.stringify({ token: request.token, stage: "failed", code, totalElapsedMs: Date.now() - startedAt }));
    await patchJob(request, { status: "failed", phase: "failed", code }).catch(() => undefined);
    return { ok: false };
  }
}
