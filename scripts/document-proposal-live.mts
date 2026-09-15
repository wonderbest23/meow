import assert from "node:assert/strict";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import JSZip from "jszip";
import { seedBusinessRewriteFixture, documentFixtureResult, mockRewrite, rewriteRequest } from "./proposal-rewrite-fixture";
import { saveBusinessConditions } from "../lib/plan-builder/coach-expert-service";
import { saveDocumentEdit } from "../lib/plan-builder/document-edit";
import { loadPlanState } from "../lib/plan-builder/plan-server-store";
import { loadProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { createDocumentRefreshRuntime } from "../lib/plan-builder/document-refresh-runtime";
import { previewDocumentRefresh, runDocumentRefresh } from "../lib/plan-builder/document-refresh-service";
import { createProposalRewriteRuntime, previewProposalRewrite, runProposalRewrite } from "../lib/plan-builder/proposal-rewrite-service";
import { renderableProposal } from "../lib/plan-builder/proposal-revision";
import { renderDeckPptx } from "../lib/plan-builder/deck-render";
import { pickDeckTheme } from "../lib/plan-builder/deck-themes";
import { EXTENSION_APPROVAL_ID, SyntheticAiBudget } from "./synthetic-ai-budget";

const live = process.argv.includes("--live");
if (live) assert(process.argv.includes("--approved-total-usd=10"), "Explicit cumulative approval required");
Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PROPOSAL_AI_ENABLED: "false" });
const output = new URL("../artifacts/document-proposal-ai-20260914/", import.meta.url);
const budgetDir = new URL("../artifacts/synthetic-ai-launch/", import.meta.url).pathname;
const config = { provider: "openai" as const, model: "gpt-6-astra", apiKey: "preflight-only" };
const transport = globalThis.fetch;
const requests: Array<{ kind: string; reservedMicros: number }> = [];
let permittedPayload: unknown;
function assertPayload(body: { input: Array<{ content: string }>; text: { format: { name: string } } }) {
  const { draft: _draft, ...sent } = JSON.parse(body.input[1].content);
  const allowed = permittedPayload as { sources?: unknown; changes?: unknown };
  const expected = body.text.format.name === "proposal_rewrite_review" ? { sources: allowed.sources, changes: allowed.changes } : allowed;
  assert.deepEqual(sent, JSON.parse(JSON.stringify(expected)), "Only the selected synthetic payload may be transmitted");
}
async function checkpoint(name: string, value: unknown) {
  if (live) await writeFile(new URL(name, output), JSON.stringify(value, null, 2), { mode: 0o600 });
}

async function chain(mode: "preflight" | "live") {
  const owner = `synthetic-${mode}-${randomUUID()}`, planId = "synthetic-document-proposal";
  const fixture = await seedBusinessRewriteFixture(owner, planId);
  await saveBusinessConditions(owner, { planId, revision: 1, requestId: randomUUID(), fields: [{ key: "price", value: "180만원" }] });
  // This test changes price only. Unchanged sections are explicitly reviewed, not AI-regenerated.
  for (const key of fixture.keys.filter(key => key !== fixture.commercialKey)) {
    const section = (await loadPlanState(owner)).plans[0].sections[key];
    assert(!section.markdown.includes("150만원"));
    await saveDocumentEdit(owner, { planId, key, action: "review", baseGeneratedAt: section.generatedAt, sourceRevision: 2 });
  }
  const runtime = createDocumentRefreshRuntime(config);
  const preview = await previewDocumentRefresh(owner, planId, [fixture.commercialKey], runtime);
  assert.equal(preview.payload.businessName, "온결 스튜디오");
  assert(preview.payload.sections.every(section => section.markdown.startsWith("가상 검증 자료이며 실제 사업이나 계약이 아닙니다")));
  permittedPayload = preview.payload;
  const request = { type: "document_generate" as const, id: randomUUID(), hash: preview.hash, sections: [fixture.commercialKey], consent: true as const };
  const document = await runDocumentRefresh(owner, planId, request, runtime);
  if (mode === "live") await checkpoint("document-result.json", { synthetic: true, input: preview.payload, job: document.documentRefresh });
  assert.equal(document.documentRefresh?.status, "ready", document.documentRefresh?.error);
  assert((await loadPlanState(owner)).plans[0].sections[fixture.commercialKey].markdown.includes("150만원"), "Source unchanged before approval");
  const draft = document.documentRefresh!.drafts![0].markdown;
  assert(draft.includes("180만원") && !draft.includes("150만원"), "Price must be updated without retaining the old amount");
  await runDocumentRefresh(owner, planId, { type: "document_apply", id: request.id, expectedRevision: document.revision, decisions: { [fixture.commercialKey]: "replace" } });
  assert.equal((await loadProposalEditor(owner, planId)).business?.documents.current, 9);
  const pptRuntime = createProposalRewriteRuntime(config), pptPreview = await previewProposalRewrite(owner, planId, pptRuntime);
  assert.equal(pptPreview.impact.affected.length, 3);
  permittedPayload = pptPreview.payload;
  const pptRequest = rewriteRequest(pptPreview), ppt = await runProposalRewrite(owner, planId, pptRequest, pptRuntime);
  if (mode === "live") await checkpoint("ppt-result.json", { synthetic: true, input: pptPreview.payload, job: ppt.rewrite });
  assert.equal(ppt.rewrite?.status, "ready", ppt.rewrite?.error);
  const final = await runProposalRewrite(owner, planId, { type: "apply", id: pptRequest.id, expectedRevision: ppt.revision, choices: {} });
  assert.equal((await loadProposalEditor(owner, planId)).sourceChanged, false);
  const unchanged = fixture.fixture.deck.slides.filter(slide => !pptPreview.impact.affected.some(item => item.slideId === slide.id));
  assert.deepEqual(final.document.deck.slides.filter(slide => unchanged.some(item => item.id === slide.id)), unchanged);
  if (mode === "live") {
    const deck = renderableProposal(final.document), bytes = await renderDeckPptx(deck, pickDeckTheme("", deck.brandName, ""));
    const zip = await JSZip.loadAsync(bytes);
    for (const item of pptPreview.impact.affected) {
      const number = deck.slides.findIndex(slide => slide.id === item.slideId) + 1;
      const xml = await zip.file(`ppt/slides/slide${number}.xml`)!.async("string");
      assert(xml.includes("180만원") && !xml.includes("150만원"), `Native PPT price in ${item.slideId}`);
    }
    await writeFile(new URL("updated-proposal.pptx", output), bytes, { mode: 0o600 });
    await checkpoint("saved-result.json", { synthetic: true, saved: final, affectedSlides: pptPreview.impact.affected.map(slide => slide.slideId), unchangedSlides: unchanged.length });
  }
  return { sourceSectionsGenerated: 1, unchangedSectionsReviewed: 8, relatedSlidesUpdated: 3, unchangedSlides: unchanged.length };
}

globalThis.fetch = async (input, init) => {
  assert.equal(String(input), "https://api.openai.com/v1/responses");
  const body = JSON.parse(String(init?.body)), payload = JSON.parse(body.input[1].content), kind = body.text.format.name;
  assertPayload(body);
  const full = JSON.stringify({ ...body, store: false, service_tier: "default" });
  requests.push({ kind, reservedMicros: (Buffer.byteLength(full) + 16384) * 25 + body.max_output_tokens * 75 });
  const result = kind.endsWith("review") ? { issues: [] } : kind === "document_refresh" ? documentFixtureResult(payload) : mockRewrite(payload);
  return Response.json({ status: "completed", output_text: JSON.stringify(result), usage: { input_tokens: 0, output_tokens: 0 } });
};
try { await chain("preflight"); } finally { globalThis.fetch = transport; }
assert.equal(requests.length, 4);
const ledger = JSON.parse(await readFile(`${budgetDir}/budget.json`, "utf8"));
const effectiveLimit = ledger.limitMicros + (ledger.extensions?.some((item: { id: string }) => item.id === EXTENSION_APPROVAL_ID) ? 0 : 5_000_000);
const remaining = effectiveLimit - ledger.calls.reduce((sum: number, call: { reservedMicros: number }) => sum + call.reservedMicros, 0);
const estimate = requests.reduce((sum, request) => sum + request.reservedMicros, 0);
console.log(JSON.stringify({ mode: live ? "live" : "preflight", calls: requests.length, estimatedReservationUsd: estimate / 1e6, remainingAfterApprovedExtensionUsd: remaining / 1e6, safetyMarginUsd: .5 }));
assert(estimate + 500000 <= remaining, "Insufficient budget; no paid call sent");
if (!live) process.exit(0);
config.apiKey = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8")).OPENAI_API_KEY ?? "";
assert(config.apiKey, "Local OpenAI key required");
await mkdir(output, { recursive: true });
const marker = await open(new URL("run-started.json", output), "wx", 0o600);
await marker.writeFile(JSON.stringify({ startedAt: new Date().toISOString(), approval: EXTENSION_APPROVAL_ID, synthetic: true })); await marker.close();
const budget = new SyntheticAiBudget(budgetDir, 10, { id: EXTENSION_APPROVAL_ID, additionalUsd: 5 });
const guarded = budget.wrap(transport);
globalThis.fetch = (input, init) => {
  assert.equal(String(input), "https://api.openai.com/v1/responses");
  assertPayload(JSON.parse(String(init?.body)));
  return guarded(input, init);
};
try {
  const result = await chain("live");
  await checkpoint("report.json", { status: "passed", synthetic: true, ...result, budget: budget.summary(), productionDatabaseUsed: false, realPayments: 0 });
  console.log(JSON.stringify({ status: "passed", ...result, budget: budget.summary() }, null, 2));
} catch (error) {
  await checkpoint("report.json", { status: "failed", error: error instanceof Error ? error.message : "unknown", budget: budget.summary(), automaticPaidRetry: false });
  throw error;
} finally { globalThis.fetch = transport; budget.close(); }
