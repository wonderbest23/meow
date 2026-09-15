import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { seedBusinessRewriteFixture, mockRewrite, rewriteRequest } from "./proposal-rewrite-fixture";
import { saveBusinessConditions } from "../lib/plan-builder/coach-expert-service";
import { proposalFinancialPreview } from "../lib/plan-builder/proposal-business";
import { loadProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { loadPlanState, preserveServerCoachRecords, savePlanState } from "../lib/plan-builder/plan-server-store";
import { COACH_KEY, readCoach } from "../lib/plan-builder/coach";
import { saveDocumentEdit } from "../lib/plan-builder/document-edit";
import { previewProposalRewrite, reserveProposalRewrite, executeProposalRewrite, runProposalRewrite, type RewriteRuntime } from "../lib/plan-builder/proposal-rewrite-service";

async function main() {
  Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
  const owner = randomUUID(), planId = "business-linked", fixture = await seedBusinessRewriteFixture(owner, planId);
  const original = await loadProposalEditor(owner, planId);
  assert.equal(original.business!.documents.current, 9);
  assert.equal(proposalFinancialPreview(original.business!.fields)?.operatingProfit, 1900000);
  assert.equal(proposalFinancialPreview(original.business!.fields.filter(field => field.key !== "cost")), null);
  assert.equal(proposalFinancialPreview(original.business!.fields.map(field => field.key === "volume" ? { ...field, value: "0" } : field))?.operatingProfit, -500000);
  const patch = { planId, revision: 1, requestId: randomUUID(), fields: [{ key: "price" as const, value: "180만원" }] };
  await assert.rejects(() => saveBusinessConditions("another-owner", patch), /찾을 수/);
  const result = await saveBusinessConditions(owner, patch), coach = readCoach(result.plan.answers)!;
  assert.equal(coach.stage, "operating"); assert.equal(coach.revision, 2);
  assert.equal(proposalFinancialPreview(coach.fields)?.operatingProfit, 2500000);
  assert((await saveBusinessConditions(owner, patch)).duplicate);
  const persisted = await loadPlanState(owner), forged = structuredClone(persisted);
  forged.plans[0].answers.__business_edit_receipts = { items: [] };
  assert.deepEqual(preserveServerCoachRecords(forged, persisted).plans[0].answers.__business_edit_receipts, persisted.plans[0].answers.__business_edit_receipts);
  await assert.rejects(() => saveBusinessConditions(owner, { ...patch, fields: [{ key: "price", value: "200만원" }] }), /같은 요청/);
  await assert.rejects(() => saveBusinessConditions(owner, { ...patch, requestId: randomUUID() }), /다른 화면/);
  const changed = await loadProposalEditor(owner, planId);
  assert.deepEqual(changed.saved?.document, original.saved?.document);
  assert.equal(changed.business?.documents.current, 0);
  await assert.rejects(() => previewProposalRewrite(owner, planId, null), /최신 사업계획서/);
  for (const key of fixture.keys) {
    const current = (await loadPlanState(owner)).plans[0].sections[key];
    const edited = key === fixture.commercialKey ? (await saveDocumentEdit(owner, { planId, key, action: "save", baseGeneratedAt: current.generatedAt, markdown: current.markdown.replaceAll("150만원", "180만원"), html: current.html.replaceAll("150만원", "180만원") })).section : current;
    await assert.rejects(() => saveDocumentEdit(owner, { planId, key, action: "review", baseGeneratedAt: edited.generatedAt, sourceRevision: 1 }), /BUSINESS_CONTEXT_CHANGED/);
    if (key === fixture.commercialKey) {
      assert((await loadProposalEditor(owner, planId)).business!.documents.manualReview.length);
      await assert.rejects(() => previewProposalRewrite(owner, planId, null), /최신 사업계획서/);
    }
    await saveDocumentEdit(owner, { planId, key, action: "review", baseGeneratedAt: edited.generatedAt, sourceRevision: 2 });
  }
  const reviewed = await loadProposalEditor(owner, planId);
  assert.equal(reviewed.business?.documents.current, 9); assert(reviewed.sourceChanged);
  let calls = 0, finish!: () => void;
  const runtime: RewriteRuntime = { target: { provider: "mock", model: "local-only" }, generate: payload => { calls++; return new Promise(resolve => { finish = () => resolve({ result: mockRewrite(payload) }); }); } };
  const preview = await previewProposalRewrite(owner, planId, runtime), request = rewriteRequest(preview);
  assert.equal(preview.impact.affected.length, 3);
  await reserveProposalRewrite(owner, planId, request, runtime);
  const worker = executeProposalRewrite(owner, planId, request.id, runtime);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 5));
  await executeProposalRewrite(owner, planId, request.id, runtime); assert.equal(calls, 1);
  finish(); const ready = await worker;
  assert.equal(ready.rewrite?.status, "ready");
  const applied = await runProposalRewrite(owner, planId, { type: "apply", id: request.id, expectedRevision: ready.revision, choices: {} }, null);
  assert.equal((await loadProposalEditor(owner, planId)).sourceChanged, false);
  assert.equal(applied.document.deck.slides.find(slide => slide.id === "proposal-commercial")?.table?.rows[0][1], "180만원");
  const next = await loadPlanState(owner);
  const previous = next.plans[0].sections[fixture.commercialKey].previous;
  assert(previous?.markdown.includes("150만원"), "Review keeps the previous manual document version");
  await saveDocumentEdit(owner, { planId, key: fixture.commercialKey, action: "restore", baseGeneratedAt: next.plans[0].sections[fixture.commercialKey].generatedAt });
  assert((await loadProposalEditor(owner, planId)).business!.documents.manualReview.length > 0, "Restored old content must be reviewed again");
  const source = readCoach(next.plans[0].answers)!;
  next.plans[0].answers[COACH_KEY] = { state: { ...source, revision: 3, documentRevision: 3 } };
  await savePlanState(owner, next);
  assert((await loadProposalEditor(owner, planId)).business!.documents.manualReview.length > 0);
  await assert.rejects(() => previewProposalRewrite(owner, planId, runtime), /최신 사업계획서/);
  console.log("proposal business: canonical edits, same-ID retry, cross-tab conflict, operating-stage retention, calculations, explicit document review, worker deduplication and three-page approval passed (no external calls)");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
