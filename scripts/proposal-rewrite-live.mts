import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { seedRewriteFixture, changeFixturePrice, mockRewrite, rewriteRequest } from "./proposal-rewrite-fixture";
import { createProposalRewriteRuntime, previewProposalRewrite, runProposalRewrite } from "../lib/plan-builder/proposal-rewrite-service";
import { SyntheticAiBudget } from "./synthetic-ai-budget";

const live = process.argv.includes("--live");
const directory = new URL("../artifacts/proposal-rewrite-20260914/", import.meta.url);
await mkdir(directory, { recursive: true });
// Do not load production Supabase, payment or deployment credentials into the test process.
Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "" });
const owner = "synthetic-rewrite-live", planId = "synthetic-rewrite-live";
const fixture = await seedRewriteFixture(owner, planId);
await changeFixturePrice(owner, planId, fixture.commercialKey);
const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const config = { provider: "openai" as const, model: "gpt-6-astra", apiKey: env.OPENAI_API_KEY ?? "" };
const runtime = createProposalRewriteRuntime(config);
const preview = await previewProposalRewrite(owner, planId, runtime);
assert.equal(preview.payload.businessName, "온결 스튜디오");
assert(preview.payload.sources.every(source => source.markdown.startsWith("가상 검증 자료이며 실제 사업이나 계약이 아닙니다")));
const transport = globalThis.fetch;
const reservations: number[] = [];
globalThis.fetch = async (input, init) => {
  assert.equal(String(input), "https://api.openai.com/v1/responses");
  const body = JSON.parse(String(init?.body));
  const full = JSON.stringify({ ...body, store: false, service_tier: "default" });
  reservations.push((Buffer.byteLength(full) + 16384) * 25 + body.max_output_tokens * 75);
  const reviewing = body.text.format.name === "proposal_rewrite_review";
  return Response.json({ status: "completed", output_text: JSON.stringify(reviewing ? { issues: [] } : mockRewrite(preview.payload)), usage: { input_tokens: 0, output_tokens: 0 } });
};
await runtime.generate(preview.payload);
globalThis.fetch = transport;
const budgetDir = new URL("../artifacts/synthetic-ai-launch/", import.meta.url).pathname;
const existing = JSON.parse(await readFile(`${budgetDir}budget.json`, "utf8"));
const remaining = existing.limitMicros - existing.calls.reduce((sum: number, call: { reservedMicros: number }) => sum + call.reservedMicros, 0);
const estimated = reservations.reduce((sum, value) => sum + value, 0);
console.log(JSON.stringify({ mode: live ? "live" : "preflight", keyConfigured: !!config.apiKey, affectedSlides: preview.impact.affected.length, remainingReservationUsd: remaining / 1e6, estimatedReservationUsd: estimated / 1e6, safetyMarginUsd: .08 }));
if (!live) process.exit(0);
assert(config.apiKey, "Configure the local OpenAI key before running");
assert(estimated + 80000 <= remaining, "Insufficient existing cumulative budget for generation plus review; no paid request sent");
const budget = new SyntheticAiBudget(budgetDir, 5);
const guarded = budget.wrap(transport);
globalThis.fetch = async (input, init) => {
  assert.equal(String(input), "https://api.openai.com/v1/responses");
  const body = JSON.parse(String(init?.body));
  const payload = JSON.parse(body.input[1].content);
  assert.deepEqual(payload.sources, preview.payload.sources, "Only the reviewed synthetic source may leave this process");
  return guarded(input, init);
};
try {
  const result = await runProposalRewrite(owner, planId, rewriteRequest(preview), runtime);
  const job = result.rewrite!;
  await writeFile(new URL("live-result.json", directory), JSON.stringify({ synthetic: true, inputHash: createHash("sha256").update(JSON.stringify(preview.payload)).digest("hex"), input: preview.payload, job, budget: budget.summary() }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ status: job.status, error: job.error, slides: job.slides?.length, usage: job.usage, budget: budget.summary() }, null, 2));
  assert.equal(job.status, "ready", "Paid result must pass source review and the proposal layout contract");
} finally { globalThis.fetch = transport; budget.close(); }
