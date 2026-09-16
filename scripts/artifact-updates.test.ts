import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { seedBusinessRewriteFixture, documentFixtureResult, mockRewrite } from "./proposal-rewrite-fixture";
import { loadPlanState, savePlanState, preserveServerCoachRecords } from "../lib/plan-builder/plan-server-store";
import { saveBusinessConditions } from "../lib/plan-builder/coach-expert-service";
import { PROPOSAL_KEY, readSavedProposal } from "../lib/plan-builder/proposal-editor";
import { previewArtifactUpdate, reserveArtifactUpdate, executeArtifactChunk, approveArtifactUpdate, cancelArtifactUpdate, reconcileArtifactUpdate, resumeArtifactUpdate, applyHomepageArtifactUpdate } from "../lib/plan-builder/artifact-update-service";
import { readArtifactUpdate, writeArtifactUpdate } from "../lib/plan-builder/artifact-update-store";
import { artifactDigest } from "../lib/plan-builder/artifact-update-source";
import { ARTIFACT_SOURCE_KEY, publicArtifactUpdate, type ArtifactCommand, type ArtifactRuntime, type ArtifactUpdate } from "../lib/plan-builder/artifact-updates";
import { ensureProjectForPlan } from "../lib/plan-builder/project-bridge";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { saveLandingDraft, getLandingForProject } from "../lib/landing/repository";
import { seedLandingSourceSnapshot } from "../lib/landing/source-update";

const identity = () => createHash("sha256").update(randomUUID()).digest("hex");
export async function runArtifactTests() {
  let calls = 0;
  const ai: ArtifactRuntime = { target: { provider: "mock", model: "no-network" },
    document: { generate: async payload => { assert(payload.sections.length <= 3); calls++; return documentFixtureResult(payload); } },
    ppt: { target: { provider: "mock", model: "no-network" }, generate: async payload => { assert(payload.slides.length <= 4); calls++; return { result: mockRewrite(payload) }; } } };
  const owner = identity(), planId = `qa-artifact-${randomUUID().slice(0, 8)}`;
  await seedBusinessRewriteFixture(owner, planId);
  let state = await loadPlanState(owner), plan = state.plans[0];
  plan.answers[ARTIFACT_SOURCE_KEY] = { revision: 1, staleItems: ["homepage:legacy-node"], sectionSources: { "section:legacy/retained": ["field:price"] } };
  await savePlanState(owner, state);
  const projectId = await ensureProjectForPlan(plan, { hash: owner, userId: null });
  const initialDraft = seedLandingSourceSnapshot(landingDraftFromPlan({ planTitle: plan.title, business: {}, answers: plan.answers, contactEmail: "qa@example.invalid" }), planId, "1");
  const site = await saveLandingDraft(projectId, owner, { ...initialDraft, slug: `qa-${randomUUID().slice(0, 8)}` }, { expectedUpdatedAt: null });
  await saveBusinessConditions(owner, { planId, requestId: randomUUID(), revision: 1, fields: [{ key: "price", value: "180만원" }] });
  const preview = await previewArtifactUpdate(owner, planId, ai.target);
  assert(preview.slides.length > 6); assert(preview.documents.length > 3); assert(preview.homepage);
  const command: Extract<ArtifactCommand, { type: "generate" }> = { type: "generate", id: randomUUID(), hash: preview.hash, base: preview.base, consent: true, includeHomepage: true };
  await assert.rejects(() => reserveArtifactUpdate(owner, planId, { ...command, consent: false } as any, ai));
  const job = await reserveArtifactUpdate(owner, planId, command, ai);
  assert.equal((await reserveArtifactUpdate(owner, planId, command, null)).id, job.id, "Saved request reconnects even after the flag is disabled");
  await assert.rejects(() => reserveArtifactUpdate(owner, planId, { ...command, includeHomepage: false }, ai));
  assert.equal(await readArtifactUpdate(identity(), planId, job.id), null);
  const publicJob = publicArtifactUpdate(job); assert(!("snapshot" in publicJob)); assert(!("ownerHash" in publicJob));
  await assert.rejects(() => reserveArtifactUpdate(owner, planId, { ...command, id: randomUUID() }, ai));
  for (let index = 0; index < job.chunks.length; index++) assert((await executeArtifactChunk(owner, planId, job.id, index, 0, ai)).ok);
  const ready = (await readArtifactUpdate(owner, planId, job.id))!; assert.equal(ready.status, "ready", ready.error ?? "ready");
  const count = calls; await executeArtifactChunk(owner, planId, job.id, 0, 0, ai); assert.equal(calls, count);
  assert((await loadPlanState(owner)).plans[0].sections["strategy/price"].markdown.includes("150만원"), "Generating does not mutate canonical sections");
  const approve: Extract<ArtifactCommand, { type: "approve" }> = { type: "approve", id: job.id, expectedRevision: ready.revision, base: preview.base,
    documents: Object.fromEntries(preview.documents.map(section => [section.key, "replace"])), slides: Object.fromEntries(preview.slides.map(slide => [slide.id, "replace"])), homepage: "replace", homepageChoices: Object.fromEntries(preview.homepage!.changed.map(id => [id, "replace"])) };
  await assert.rejects(() => approveArtifactUpdate(owner, planId, { ...approve, documents: {} }));
  await assert.rejects(() => approveArtifactUpdate(owner, planId, { ...approve, documents: { ...approve.documents, "strategy/price": "keep" } }));
  const applied = await approveArtifactUpdate(owner, planId, approve);
  assert.equal(applied.status, "applied");
  assert.equal((await approveArtifactUpdate(owner, planId, approve)).revision, applied.revision);
  state = await loadPlanState(owner); plan = state.plans[0];
  assert(plan.sections["strategy/price"].markdown.includes("180만원"));
  assert(plan.sections["strategy/price"].previous?.markdown.includes("150만원"));
  assert((plan.answers[ARTIFACT_SOURCE_KEY].staleItems as string[]).includes("homepage:legacy-node"));
  assert.deepEqual((plan.answers[ARTIFACT_SOURCE_KEY].sectionSources as any)["section:legacy/retained"], ["field:price"]);
  const updatedSite = (await getLandingForProject(projectId, owner))!;
  assert.equal(updatedSite.publishedVersion, site.publishedVersion); assert.equal(updatedSite.publishedSlug ?? null, site.publishedSlug ?? null);
  assert(updatedSite.draft.priceLabel.includes("180만원"));
  const forged = structuredClone(state); forged.plans[0].answers[ARTIFACT_SOURCE_KEY] = { revision: 99999, staleItems: [] };
  assert.deepEqual(preserveServerCoachRecords(forged, state).plans[0].answers[ARTIFACT_SOURCE_KEY], plan.answers[ARTIFACT_SOURCE_KEY]);

  // No saved proposal is required for document-only updates.
  const documentOwner = identity(), documentId = `qa-doc-${randomUUID().slice(0, 8)}`, docState = structuredClone(state);
  docState.plans[0].id = documentId; docState.activePlanId = documentId; delete docState.plans[0].answers[PROPOSAL_KEY];
  delete docState.plans[0].answers[ARTIFACT_SOURCE_KEY];
  for (const section of Object.values(docState.plans[0].sections)) section.coachRevision = 0;
  docState.plans[0].sections["market/personas"].locked = true;
  await savePlanState(documentOwner, docState);
  const dp = await previewArtifactUpdate(documentOwner, documentId, ai.target); assert.equal(dp.slides.length, 0);
  const dj = await reserveArtifactUpdate(documentOwner, documentId, { type: "generate", id: randomUUID(), hash: dp.hash, base: dp.base, consent: true, includeHomepage: false }, ai);
  for (let i = 0; i < dj.chunks.length; i++) await executeArtifactChunk(documentOwner, documentId, dj.id, i, 0, ai);
  const dr = (await readArtifactUpdate(documentOwner, documentId, dj.id))!;
  const da = await approveArtifactUpdate(documentOwner, documentId, { type: "approve", id: dj.id, expectedRevision: dr.revision, base: dp.base, documents: Object.fromEntries(dp.documents.map(section => [section.key, section.locked ? "keep" : "replace"])), slides: {}, homepage: "keep", homepageChoices: {} });
  assert(da.staleItems?.includes("section:market/personas")); assert.equal((await loadPlanState(documentOwner)).plans[0].sections["market/personas"].coachRevision, 0);

  // An expired in-flight claim is reconciled on status/resume, never reissued.
  const staleOwner = identity(), staleId = `qa-claim-${randomUUID().slice(0, 8)}`;
  await seedBusinessRewriteFixture(staleOwner, staleId);
  await saveBusinessConditions(staleOwner, { planId: staleId, requestId: randomUUID(), revision: 1, fields: [{ key: "price", value: "180만원" }] });
  const sp = await previewArtifactUpdate(staleOwner, staleId, ai.target), sj = await reserveArtifactUpdate(staleOwner, staleId, { ...command, id: randomUUID(), hash: sp.hash, base: sp.base, includeHomepage: false }, ai);
  const unknown = structuredClone(sj); unknown.revision++; unknown.status = "running"; unknown.chunks[0] = { ...unknown.chunks[0], status: "running", claim: randomUUID(), startedAt: new Date(Date.now() - 130000).toISOString() };
  await writeArtifactUpdate(unknown, sj.revision);
  const reconciled = await reconcileArtifactUpdate(unknown); assert.equal(reconciled.error, "outcome_unknown");
  const beforeCalls = calls;
  await assert.rejects(() => resumeArtifactUpdate(staleOwner, staleId, { type: "resume", id: sj.id, expectedRevision: reconciled.revision, consent: true }, ai));
  assert.equal(calls, beforeCalls);
  await cancelArtifactUpdate(staleOwner, staleId, { type: "cancel", id: sj.id, expectedRevision: reconciled.revision });

  // Independent source/homepage CAS prevents partial commits after a concurrent edit.
  await saveBusinessConditions(owner, { planId, requestId: randomUUID(), revision: 2, fields: [{ key: "price", value: "200만원" }] });
  const hp = await previewArtifactUpdate(owner, planId, null);
  const hc: Extract<ArtifactCommand, { type: "homepage_apply" }> = { type: "homepage_apply", id: randomUUID(), hash: hp.hash, base: hp.base, choices: Object.fromEntries(hp.homepage!.changed.map(id => [id, "replace"])) };
  const activeSite = (await getLandingForProject(projectId, owner))!;
  await saveLandingDraft(projectId, owner, { ...activeSite.draft, headline: "직접 바꾼 제목" }, { expectedUpdatedAt: activeSite.updatedAt });
  const canonical = artifactDigest((await loadPlanState(owner)).plans[0]);
  await assert.rejects(() => applyHomepageArtifactUpdate(owner, planId, hc));
  assert.equal(await readArtifactUpdate(owner, planId, hc.id), null);
  assert.equal(artifactDigest((await loadPlanState(owner)).plans[0]), canonical);
  const fresh = await previewArtifactUpdate(owner, planId, null);
  const result = await applyHomepageArtifactUpdate(owner, planId, { ...hc, id: randomUUID(), hash: fresh.hash, base: fresh.base, choices: Object.fromEntries(fresh.homepage!.sourcePreview.changes.map(change => [change.id, change.conflict ? "keep" : "replace"])) });
  assert.equal(result.status, "applied"); assert.equal((await getLandingForProject(projectId, owner))?.draft.headline, "직접 바꾼 제목");
  assert.equal((await getLandingForProject(projectId, owner))?.publishedVersion, site.publishedVersion);
  return { owner, planId, calls, checks: ["independent document jobs", "all-page PPT chunks", "immutable proposal until approval", "explicit section and slide choices", "protected server metadata", "atomic homepage+document+PPT approval", "homepage manual conflicts", "no auto publish", "owner isolation", "same-ID reconnect", "expired claim quarantine", "locked stale never current", "unaffected stale metadata preserved", "source/homepage CAS"] };
}
if (process.argv[1]?.endsWith("artifact-updates.test.ts")) {
  Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PROPOSAL_AI_ENABLED: "false" });
  globalThis.fetch = async () => { throw new Error("NO_NETWORK_IN_UNIT_TEST"); };
  void runArtifactTests().then(result => console.log(JSON.stringify(result.checks))).catch(error => { console.error(error); process.exitCode = 1; });
}
