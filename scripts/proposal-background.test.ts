import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { seedBusinessRewriteFixture, documentFixtureResult, mockRewrite, rewriteRequest } from "./proposal-rewrite-fixture";
import { saveBusinessConditions } from "../lib/plan-builder/coach-expert-service";
import { loadPlanState } from "../lib/plan-builder/plan-server-store";
import { saveDocumentEdit } from "../lib/plan-builder/document-edit";
import { loadProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { proposalAIConfig } from "../lib/plan-builder/proposal-ai-config";
import { createDocumentRefreshRuntime } from "../lib/plan-builder/document-refresh-runtime";
import { documentRefreshRuntime, previewDocumentRefresh, runDocumentRefresh } from "../lib/plan-builder/document-refresh-service";
import { proposalRewriteRuntime, previewProposalRewrite } from "../lib/plan-builder/proposal-rewrite-service";
import { queueProposalUpdate, executeProposalUpdate, type ProposalBackgroundJob } from "../lib/plan-builder/proposal-background";
import { callProposalUpdateService, handlePlanSectionServiceRequest } from "../lib/plan-builder/section-service";

function assertStrictObjectSchemas(value: unknown) {
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (node.type === "object" && node.properties && typeof node.properties === "object") {
    assert.equal(node.additionalProperties, false);
    assert.deepEqual([...(node.required as string[] ?? [])].sort(), Object.keys(node.properties).sort(), "Provider requires every object property, including nested objects");
  }
  for (const child of Object.values(node)) assertStrictObjectSchemas(child);
}

async function main() {
  Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "test-only", ANTHROPIC_API_KEY: "", PROPOSAL_AI_ENABLED: "false" });
  assert.equal(proposalAIConfig("test"), null);
  process.env.PROPOSAL_AI_ENABLED = "true";
  process.env.OPENAI_API_KEY = ""; process.env.ANTHROPIC_API_KEY = "test-only";
  assert.equal(proposalAIConfig("test"), null, "Unapproved provider cannot be substituted");
  assert.throws(() => createDocumentRefreshRuntime({ provider: "anthropic", apiKey: "test", model: "test" }), /OPENAI_REQUIRED/);
  process.env.OPENAI_API_KEY = "test-only";
  const owner = randomUUID(), planId = "background-synthetic";
  const fixture = await seedBusinessRewriteFixture(owner, planId);
  await saveBusinessConditions(owner, { planId, revision: 1, requestId: randomUUID(), fields: [{ key: "price", value: "180만원" }] });
  const runtime = documentRefreshRuntime(owner)!;
  assert.equal(runtime.target.provider, "openai");
  const preview = await previewDocumentRefresh(owner, planId, [fixture.commercialKey], runtime);
  const command = { type: "document_generate" as const, id: randomUUID(), hash: preview.hash, sections: [fixture.commercialKey], consent: true as const };
  let calls = 0, mode = "success";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assertStrictObjectSchemas(body.text?.format?.schema);
    calls++;
    if (mode === "quota") return Response.json({ error: { code: "insufficient_quota" } }, { status: 429 });
    if (mode === "limit") return Response.json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    const payload = JSON.parse(body.input[1].content), name = body.text.format.name;
    const result = name.endsWith("review") ? { issues: mode === "review" ? [{ key: fixture.commercialKey, reason: "Test rejection" }] : [] }
      : name === "document_refresh" ? mode === "keys" ? { sections: [{ key: "wrong/key", markdown: "wrong", summary: "wrong" }] } : documentFixtureResult(payload) : mockRewrite(payload);
    return Response.json({ status: "completed", output_text: JSON.stringify(result), usage: { input_tokens: 100, output_tokens: 20 } });
  };
  const workflows = new Map<string, ProposalBackgroundJob>();
  let loseCreateResponse = false, outage = false, creates = 0;
  const binding = {
    async create(options: { id?: string; params: ProposalBackgroundJob }) {
      creates++;
      assert.equal((await loadProposalEditor(owner, planId)).saved?.documentRefresh?.id, command.id, "Reserve before dispatch");
      if (outage) throw new Error("Unavailable");
      workflows.set(options.id!, options.params);
      if (loseCreateResponse) throw new Error("Lost response");
      return { id: options.id };
    },
    async get(id: string) { if (outage || !workflows.has(id)) throw new Error("Missing"); return { status: async () => ({ status: "queued" }) }; },
  } as unknown as NonNullable<Parameters<typeof queueProposalUpdate>[3]>;
  await assert.rejects(() => queueProposalUpdate(owner, planId, command, null, runtime), /준비 중/);
  assert.equal((await loadProposalEditor(owner, planId)).saved?.documentRefresh, undefined);
  outage = true;
  await assert.rejects(() => queueProposalUpdate(owner, planId, command, binding, runtime), /실행 접수/);
  assert.equal((await loadProposalEditor(owner, planId)).saved?.documentRefresh?.status, "running");
  assert.equal(calls, 0);
  outage = false; loseCreateResponse = true;
  await queueProposalUpdate(owner, planId, command, binding, runtime);
  await queueProposalUpdate(owner, planId, command, binding, runtime);
  assert.equal(workflows.size, 1, "All dispatch retries use the original durable ID");
  const source = structuredClone((await loadPlanState(owner)).plans[0].sections);
  const job = workflows.values().next().value!;
  const secret = "local-internal-transport-test", env = { SUPABASE_SERVICE_ROLE_KEY: secret } as CloudflareEnv;
  const service = { fetch: (url: string, init: RequestInit) => handlePlanSectionServiceRequest(new Request(url, init), env) } as unknown as Fetcher;
  assert.deepEqual(await callProposalUpdateService(service, secret, job), { ok: true });
  assert.equal(calls, 2, "Only generation and review execute");
  const ready = (await loadProposalEditor(owner, planId)).saved!;
  assert.equal(ready.documentRefresh?.usage?.length, 2);
  assert.deepEqual((await loadPlanState(owner)).plans[0].sections, source, "Ready drafts do not change source documents");
  assert.deepEqual(await callProposalUpdateService(service, secret, job), { ok: true });
  await queueProposalUpdate(owner, planId, command, binding, runtime);
  assert.equal(calls, 2); assert.equal(creates, 3);
  await assert.rejects(() => callProposalUpdateService(service, "wrong-secret", job));
  const body = JSON.stringify({ operation: "completeProposalUpdate", job });
  const timestamp = String(Date.now() - 120000), signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const expired = await handlePlanSectionServiceRequest(new Request("https://test/__internal/plan-section", { method: "POST", headers: { "x-plan-timestamp": timestamp, "x-plan-signature": signature }, body }), env);
  assert.equal(expired?.status, 404);
  await assert.rejects(() => executeProposalUpdate({ ...job, operation: "unexpected" }));
  await runDocumentRefresh(owner, planId, { type: "document_apply", id: command.id, expectedRevision: ready.revision, decisions: { [fixture.commercialKey]: "replace" } });
  assert((await loadPlanState(owner)).plans[0].sections[fixture.commercialKey].markdown.includes("180만원"));
  for (const key of fixture.keys.filter(key => key !== fixture.commercialKey)) {
    const section = (await loadPlanState(owner)).plans[0].sections[key];
    assert(!section.markdown.includes("150만원"));
    await saveDocumentEdit(owner, { planId, key, action: "review", baseGeneratedAt: section.generatedAt, sourceRevision: 2 });
  }
  const pptRuntime = proposalRewriteRuntime(owner)!, pptPreview = await previewProposalRewrite(owner, planId, pptRuntime);
  const pptCommand = rewriteRequest(pptPreview);
  const pptJobs: ProposalBackgroundJob[] = [];
  const pptBinding = { create: async ({ params }: { params: ProposalBackgroundJob }) => { pptJobs.push(params); return {}; } } as unknown as typeof binding;
  await queueProposalUpdate(owner, planId, pptCommand, pptBinding, pptRuntime);
  assert.equal(pptJobs[0].operation, "proposal_rewrite");
  assert.deepEqual(await executeProposalUpdate(pptJobs[0]), { ok: true });
  assert.equal(calls, 4);
  await executeProposalUpdate(pptJobs[0]); assert.equal(calls, 4);

  for (const failure of ["review", "keys", "quota", "limit"] as const) {
    mode = failure;
    const before: number = calls;
    await assert.rejects(() => runtime.generate(preview.payload), new RegExp(({ review: "review_failed", keys: "invalid_response", quota: "quota_exhausted", limit: "output_limit" })[failure]!));
    assert.equal(calls - before, failure === "review" ? 2 : 1, "No paid retry, repair or provider fallback");
  }
  console.log("proposal background: default-off, OpenAI-only consent target, durable dispatch recovery, signed transport, duplicate worker, immutable drafts, token usage, linked PPT and fail-closed generation/review passed (no network)");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
