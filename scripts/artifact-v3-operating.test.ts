import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seedBusinessRewriteFixture, documentFixtureResult, mockRewrite } from "./proposal-rewrite-fixture";
import { loadPlanState, savePlanState } from "../lib/plan-builder/plan-server-store";
import { ARTIFACT_SOURCE_KEY, type ArtifactRuntime } from "../lib/plan-builder/artifact-updates";
import { artifactBase, artifactSources, buildArtifactPreview } from "../lib/plan-builder/artifact-update-source";
import { approveArtifactUpdate, executeArtifactChunk, reserveArtifactUpdate } from "../lib/plan-builder/artifact-update-service";
import { readArtifactUpdate } from "../lib/plan-builder/artifact-update-store";
import { PROPOSAL_KEY, readSavedProposal } from "../lib/plan-builder/proposal-editor";
import { renderableProposal, upgradeProposalV3 } from "../lib/plan-builder/proposal-revision";
import { OPERATING_KEY, type OperatingPeriod } from "../lib/plan-builder/operating-records";

export async function runArtifactV3OperatingTests() {
  const owner = `qa-v3-${randomUUID()}`, planId = "qa-v3-operating";
  await seedBusinessRewriteFixture(owner, planId);
  const state = await loadPlanState(owner), plan = state.plans[0];
  for (const section of Object.values(plan.sections)) if (!section.markdown) section.markdown = "가상 검증 자료이며 실제 사업이나 계약이 아닙니다\n확인할 조건을 기록합니다";
  const saved = readSavedProposal(plan.answers)!;
  saved.document = upgradeProposalV3(saved.document);
  const pages = saved.document.pages!, originalId = pages[0].id, deletedId = pages[1].id;
  pages.splice(1, 1);
  pages.push({ ...pages[0], id: "copied-page" });
  pages.push({ id: "new-page", layout: "summary" });
  saved.document.edits["copied-page"] = { text: { title: "직접 고친 복제 페이지" }, layout: { title: { x: 1, y: 1, w: 10, h: 1 } } };
  saved.revision++; saved.document.revision = saved.revision;
  plan.answers[PROPOSAL_KEY] = { ...saved };
  plan.answers[ARTIFACT_SOURCE_KEY] = { sourceHash: artifactBase(plan, null).sourceHash, slideSources: { [originalId]: ["section:overview/summary"] } };
  assert.equal(buildArtifactPreview(plan, null, null).documents.length, 0);

  const at = new Date().toISOString(), period: OperatingPeriod = { id: randomUUID(), revision: 1, createdAt: at, updatedAt: at,
    start: "2026-09-01", end: "2026-09-07", metrics: { inquiries: 6, orders: 2, revenue: 3000000, expenses: null }, feedback: "가상 문의 기록", keep: "", change: "", nextAction: "", successCriterion: "" };
  plan.answers[OPERATING_KEY] = { version: 1, revision: 1, periods: [period], reports: [], analyses: [] };
  const preview = buildArtifactPreview(plan, null, null);
  assert.equal(preview.base.sourceRevision, 1, "Operating-only edits do not bump coach revision");
  assert.equal(preview.documents.length, Object.keys(plan.sections).length, "Period changes invalidate all dependent documents");
  assert(!preview.slides.some(slide => slide.id === deletedId));
  assert(preview.slides.find(slide => slide.id === "copied-page")?.manual);
  assert(preview.slides.find(slide => slide.id === "new-page")?.manual);
  assert.deepEqual(preview.slides.find(slide => slide.id === "copied-page")?.sourceIds, ["section:overview/summary"]);
  const expenseId = `period:${period.id}/metric:expenses`;
  assert.deepEqual(artifactSources(plan).find(source => source.id === expenseId), { id: expenseId, label: "2026-09-01 ~ 2026-09-07 지출", value: "미입력", basis: "missing", unit: "원", period: "2026-09-01/2026-09-07", revision: 1 });
  await savePlanState(owner, state);
  let sawOperating = false;
  const runtime: ArtifactRuntime = { target: { provider: "mock", model: "v3-operations" }, document: { generate: async payload => {
    sawOperating ||= payload.financialReference.includes("실제 운영 실적") && payload.financialReference.includes("3,000,000원") && payload.financialReference.includes("지출: 현재 미입력");
    return documentFixtureResult(payload);
  } }, ppt: { target: { provider: "mock", model: "v3-operations" }, generate: async payload => {
    assert(payload.slides.length <= 4);
    assert(!payload.slides.some(slide => slide.id === deletedId));
    const result = mockRewrite(payload);
    result.slides.forEach(slide => { slide.sourceSections = slide.sourceSections?.slice(0, 4); });
    return { result };
  } } };
  const current = buildArtifactPreview((await loadPlanState(owner)).plans[0], null, runtime.target);
  const job = await reserveArtifactUpdate(owner, planId, { type: "generate", id: randomUUID(), hash: current.hash, base: current.base, consent: true, includeHomepage: false }, runtime);
  for (let i = 0; i < job.chunks.length; i++) {
    const result = await executeArtifactChunk(owner, planId, job.id, i, 0, runtime);
    const status = await readArtifactUpdate(owner, planId, job.id);
    assert(result.ok, JSON.stringify({ error: status?.error, chunks: status?.chunks }));
  }
  assert(sawOperating, "Actual metrics and missing costs reach the generator");
  const ready = (await readArtifactUpdate(owner, planId, job.id))!;
  const applied = await approveArtifactUpdate(owner, planId, { type: "approve", id: job.id, expectedRevision: ready.revision, base: current.base,
    documents: Object.fromEntries(current.documents.map(section => [section.key, "replace"])),
    slides: Object.fromEntries(current.slides.map(slide => [slide.id, slide.id === "copied-page" ? "keep" : "replace"])), homepage: "keep", homepageChoices: {} });
  const reloaded = readSavedProposal((await loadPlanState(owner)).plans[0].answers)!;
  const rendered = renderableProposal(reloaded.document);
  assert.equal(rendered.slides.find(slide => slide.id === "copied-page")?.title, "직접 고친 복제 페이지");
  assert.deepEqual(reloaded.document.edits["copied-page"], saved.document.edits["copied-page"]);
  assert.equal(rendered.slides.length, pages.length);
  assert(!rendered.slides.some(slide => slide.id === deletedId));
  assert(applied.staleItems?.includes("slide:copied-page"));
  return { owner, planId, jobId: job.id, checks: ["operating-only invalidation", "stable period IDs and units", "missing cost preserved", "actual operating generator context", "copied/new/deleted pages", "page-local approval", "manual text and layout preserved", "kept page remains stale"] };
}
if (process.argv[1]?.endsWith("artifact-v3-operating.test.ts")) {
  Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", PROPOSAL_AI_ENABLED: "false", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
  globalThis.fetch = async () => { throw new Error("NO_NETWORK"); };
  void runArtifactV3OperatingTests().then(result => console.log(JSON.stringify({ passed: result.checks, mockOnly: true, paidCalls: 0 }))).catch(error => { console.error(error); process.exitCode = 1; });
}
