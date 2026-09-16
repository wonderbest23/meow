import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seedRewriteFixture, seedBusinessRewriteFixture, changeFixturePrice, mockRewrite, rewriteRequest, documentFixtureResult } from "./proposal-rewrite-fixture";
import { loadPlanState, savePlanState } from "../lib/plan-builder/plan-server-store";
import { loadProposalEditor, saveProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { previewProposalRewrite, runProposalRewrite } from "../lib/plan-builder/proposal-rewrite-service";
import { previewDocumentRefresh } from "../lib/plan-builder/document-refresh-service";
import { readSavedProposal } from "../lib/plan-builder/proposal-editor";
import { renderableProposal } from "../lib/plan-builder/proposal-revision";
import { coachDocumentSnapshot, completedDocumentKey } from "../lib/plan-builder/coach-document";
import { artifactBase } from "../lib/plan-builder/artifact-update-source";
import { operatingSourceFingerprint } from "../lib/plan-builder/artifact-source-status";
import { previewArtifactUpdate, reserveArtifactUpdate, executeArtifactChunk, approveArtifactUpdate } from "../lib/plan-builder/artifact-update-service";
import { readArtifactUpdate } from "../lib/plan-builder/artifact-update-store";
import { ARTIFACT_SOURCE_KEY, type ArtifactRuntime } from "../lib/plan-builder/artifact-updates";
import { OPERATING_KEY, type OperatingPeriod } from "../lib/plan-builder/operating-records";

export async function runProposalSourceStalenessTests() {
  const owner = `qa-chart-${randomUUID()}`, planId = "qa-chart-staleness";
  const fixture = await seedRewriteFixture(owner, planId);
  let editor = await loadProposalEditor(owner, planId);
  const chartId = editor.saved!.document.deck.slides.find(slide => slide.composition?.role === "commercial")!.id!;
  const chart = { type: "bar" as const, categories: ["제안 가격"], series: [{ id: "price", name: "판매가", values: [150] }], unit: "만원", basis: "estimate" as const, source: "기존 제안 가격 150만원" };
  await saveProposalEditor(owner, planId, { type: "save", requestId: randomUUID(), expectedRevision: editor.saved!.revision, edits: { [chartId]: { content: { chart } } } });
  await changeFixturePrice(owner, planId, fixture.commercialKey);
  const runtime = { target: { provider: "mock", model: "staleness-only" }, generate: async (payload: Parameters<typeof mockRewrite>[0]) => ({ result: mockRewrite(payload) }) };
  const preview = await previewProposalRewrite(owner, planId, runtime);
  const ready = await runProposalRewrite(owner, planId, rewriteRequest(preview), runtime);
  assert.equal(ready.rewrite?.status, "ready");
  await runProposalRewrite(owner, planId, { type: "apply", id: ready.rewrite!.id, expectedRevision: ready.revision, choices: Object.fromEntries(ready.rewrite!.preview.impact.affected.filter(slide => slide.textConflict).map(slide => [slide.slideId, "use_revised"])) }, runtime);
  editor = await loadProposalEditor(owner, planId);
  const rendered = renderableProposal(editor.saved!.document).slides.find(slide => slide.id === chartId)!;
  assert(JSON.stringify(rendered.table).includes("180만원")); assert.deepEqual(rendered.chart, chart);
  assert.equal(editor.sourceChanged, true); assert(editor.saved!.document.retainedSlideIds?.includes(chartId));
  const secondPreview = await previewProposalRewrite(owner, planId, runtime);
  assert(secondPreview.impact.affected.find(slide => slide.slideId === chartId)?.textConflict, "Old chart remains selectable and keepable on the next review");
  const edits = structuredClone(editor.saved!.document.edits);
  edits[chartId] = { ...edits[chartId], text: { title: "보관할 수동 제목" }, content: { ...edits[chartId]?.content, chart: { ...chart, series: [{ ...chart.series[0], values: [180] }] } } };
  await saveProposalEditor(owner, planId, { type: "save", requestId: randomUUID(), expectedRevision: editor.saved!.revision, edits });
  editor = await loadProposalEditor(owner, planId);
  assert(editor.saved!.document.retainedSlideIds?.includes(chartId), "Chart editing is not an acknowledgment of other retained content");
  assert.equal(editor.sourceChanged, true);

  const ghostOwner = `qa-ghost-${randomUUID()}`, ghostId = "qa-deleted-retained";
  await seedBusinessRewriteFixture(ghostOwner, ghostId);
  const ghostState = await loadPlanState(ghostOwner), ghostPlan = ghostState.plans[0], ghostSaved = readSavedProposal(ghostPlan.answers)!;
  const deletedId = ghostSaved.document.pages![0].id;
  ghostSaved.revision++; ghostSaved.document.revision = ghostSaved.revision;
  ghostSaved.document.retainedSlideIds = [deletedId, "already-deleted"];
  ghostPlan.answers[ARTIFACT_SOURCE_KEY] = { revision: 1, sourceHash: artifactBase(ghostPlan, null).sourceHash,
    staleItems: [`slide:${deletedId}:chart`, "slide:already-deleted", "homepage:keep-me"] };
  await savePlanState(ghostOwner, ghostState);
  assert(!(await loadProposalEditor(ghostOwner, ghostId)).saved!.document.retainedSlideIds?.includes("already-deleted"), "Read path filters old corrupt IDs");
  await saveProposalEditor(ghostOwner, ghostId, { type: "save", requestId: randomUUID(), expectedRevision: ghostSaved.revision, pages: ghostSaved.document.pages!.filter(page => page.id !== deletedId), edits: {} });
  const ghostView = await loadProposalEditor(ghostOwner, ghostId), ghostReload = (await loadPlanState(ghostOwner)).plans[0];
  assert.deepEqual(ghostView.saved!.document.retainedSlideIds, []); assert.equal(ghostView.sourceChanged, false);
  assert.deepEqual(ghostReload.answers[ARTIFACT_SOURCE_KEY].staleItems, ["homepage:keep-me"]);
  assert(!readSavedProposal(ghostReload.answers)!.document.pages!.some(page => page.id === deletedId));
  await saveProposalEditor(ghostOwner, ghostId, { type: "restore", requestId: randomUUID(), expectedRevision: ghostView.saved!.revision, revision: ghostSaved.revision });
  const restoredGhost = await loadProposalEditor(ghostOwner, ghostId);
  assert(restoredGhost.saved!.document.pages!.some(page => page.id === deletedId));
  assert(restoredGhost.saved!.document.retainedSlideIds?.includes(deletedId), "Restoring a page restores its previous retained-state history");
  assert.equal(restoredGhost.sourceChanged, true);

  const opOwner = `qa-operating-stale-${randomUUID()}`, opId = "qa-operating-status";
  await seedBusinessRewriteFixture(opOwner, opId);
  const state = await loadPlanState(opOwner), plan = state.plans[0], before = structuredClone(plan.sections);
  const at = new Date().toISOString();
  const period: OperatingPeriod = { id: randomUUID(), revision: 1, createdAt: at, updatedAt: at, start: "2026-09-01", end: "2026-09-07", metrics: { inquiries: 5, orders: 2, revenue: 3000000, expenses: null }, feedback: "가상 기록", keep: "", change: "", nextAction: "", successCriterion: "" };
  plan.answers[ARTIFACT_SOURCE_KEY] = { revision: 1, sourceHash: artifactBase(plan, null).sourceHash, operatingFingerprint: "", staleItems: [] };
  plan.answers[OPERATING_KEY] = { version: 1, revision: 1, periods: [period], reports: [], analyses: [] };
  await savePlanState(opOwner, state);
  const stale = (await loadPlanState(opOwner)).plans[0], staleView = await loadProposalEditor(opOwner, opId);
  assert.deepEqual(stale.sections, before, "Status does not mutate stored documents");
  assert.equal(staleView.sourceChanged, true); assert.equal(staleView.business!.documents.current, 0);
  assert.equal(coachDocumentSnapshot(stale)!.stale.length, Object.keys(before).length); assert.equal(completedDocumentKey(stale), null);
  await assert.rejects(() => previewDocumentRefresh(opOwner, opId, ["strategy/price"], null), (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "artifact_update_required");
  const ai: ArtifactRuntime = { target: runtime.target, document: { generate: async payload => documentFixtureResult(payload) }, ppt: runtime };
  const impact = await previewArtifactUpdate(opOwner, opId, ai.target);
  const job = await reserveArtifactUpdate(opOwner, opId, { type: "generate", id: randomUUID(), hash: impact.hash, base: impact.base, consent: true, includeHomepage: false }, ai);
  for (let i = 0; i < job.chunks.length; i++) assert((await executeArtifactChunk(opOwner, opId, job.id, i, 0, ai)).ok);
  const finished = (await readArtifactUpdate(opOwner, opId, job.id))!;
  await approveArtifactUpdate(opOwner, opId, { type: "approve", id: job.id, expectedRevision: finished.revision, base: impact.base,
    documents: Object.fromEntries(impact.documents.map((section, index) => [section.key, index === 0 ? "replace" : "keep"])), slides: Object.fromEntries(impact.slides.map(slide => [slide.id, "keep"])), homepage: "keep", homepageChoices: {} });
  const partialView = await loadProposalEditor(opOwner, opId), partialPlan = (await loadPlanState(opOwner)).plans[0];
  assert.equal(partialView.business!.documents.current, 1, "One approved section never makes the remaining old sections current");
  assert.equal(coachDocumentSnapshot(partialPlan)!.outdated.length, impact.documents.length - 1);
  assert.equal(completedDocumentKey(partialPlan), null); assert.equal(partialView.sourceChanged, true);
  const remaining = await previewArtifactUpdate(opOwner, opId, ai.target);
  assert.equal(remaining.documents.length, impact.documents.length - 1);
  const nextJob = await reserveArtifactUpdate(opOwner, opId, { type: "generate", id: randomUUID(), hash: remaining.hash, base: remaining.base, consent: true, includeHomepage: false }, ai);
  for (let i = 0; i < nextJob.chunks.length; i++) assert((await executeArtifactChunk(opOwner, opId, nextJob.id, i, 0, ai)).ok);
  const nextReady = (await readArtifactUpdate(opOwner, opId, nextJob.id))!;
  await approveArtifactUpdate(opOwner, opId, { type: "approve", id: nextJob.id, expectedRevision: nextReady.revision, base: remaining.base,
    documents: Object.fromEntries(remaining.documents.map(section => [section.key, "replace"])), slides: Object.fromEntries(remaining.slides.map(slide => [slide.id, "replace"])), homepage: "keep", homepageChoices: {} });
  const updated = (await loadPlanState(opOwner)).plans[0], updatedView = await loadProposalEditor(opOwner, opId);
  assert.equal(updatedView.business!.documents.current, Object.keys(before).length); assert.equal(updatedView.sourceChanged, false);
  assert(completedDocumentKey(updated)); assert.equal(updated.answers[ARTIFACT_SOURCE_KEY].operatingFingerprint, operatingSourceFingerprint(updated.answers));
  assert.deepEqual(updated.answers[OPERATING_KEY].periods, [period]);
  assert.deepEqual((await readArtifactUpdate(opOwner, opId, job.id))!.snapshot.sections, before, "Original actual records and document snapshots remain available");
  return ["legacy chart remains stale after use_revised", "retained chart is reviewable with keep", "manual retain survives chart edit and reload", "corrupt deleted retain IDs filtered on read", "deleted page metadata pruned on save/reload", "restoring deleted pages restores stale history", "operating-only change invalidates shared document status", "legacy refresh routes to unified updates", "partial approval leaves unapproved sections stale", "atomic approval records operating baseline", "original documents and actual records preserved"];
}

if (process.argv[1]?.endsWith("proposal-source-staleness.test.ts")) {
  Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PROPOSAL_AI_ENABLED: "false" });
  globalThis.fetch = async () => { throw new Error("NO_NETWORK"); };
  void runProposalSourceStalenessTests().then(checks => console.log(JSON.stringify({ passed: checks, mockOnly: true, paidCalls: 0 }))).catch(error => { console.error(error); process.exitCode = 1; });
}
