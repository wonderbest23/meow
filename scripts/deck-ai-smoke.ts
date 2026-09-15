import assert from "node:assert/strict";
import { buildDeckPlan } from "../lib/plan-builder/deck-plan";
import { renderDeckPptx } from "../lib/plan-builder/deck-render";
import { pickDeckTheme } from "../lib/plan-builder/deck-themes";
import { resolvePlanningLLMConfig } from "../lib/llm/config";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SyntheticAiBudget } from "./synthetic-ai-budget";
import { analysisPayload, analysisRuntime } from "../lib/plan-builder/operating-analysis-service";
import { validateAnalysisResult } from "../lib/plan-builder/operating-analysis-contract";
import type { OperatingPeriod } from "../lib/plan-builder/operating-records";
import type { DeckPlan } from "../lib/plan-builder/deck-plan";
import { syntheticDeckInput, syntheticDescription } from "./synthetic-ai-fixture";

const output = fileURLToPath(new URL("../artifacts/synthetic-ai-launch/", import.meta.url));
async function save(name: string, value: unknown) {
  await mkdir(output, { recursive: true });
  const path = join(output, name);
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
async function saved(name: string) {
  try { return JSON.parse(await readFile(join(output, name), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

async function main() {
  // Synthetic input only; do not read or mutate any production account.
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
  const config = resolvePlanningLLMConfig("deck-qa-synthetic");
  const blockers = !config ? ["OPENAI_API_KEY is not configured"] : config.model !== "gpt-6-astra" ? ["Review model pricing before paid verification"] : [];
  if (!process.argv.includes("--run-paid-synthetic")) {
    console.log(JSON.stringify({ mode: "preflight-only", paidCalls: 0, ready: blockers.length === 0, model: config?.model ?? process.env.PLANNING_MODEL ?? "gpt-6-astra", blockers, next: "Requires --run-paid-synthetic --approved-budget-usd=5 after local key setup" }));
    return;
  }
  assert.ok(config?.provider === "openai", "An OpenAI planning key is required; no provider fallback is authorized");
  const approved = Number(process.argv.find(arg => arg.startsWith("--approved-budget-usd="))?.split("=")[1]);
  const budget = new SyntheticAiBudget(output, approved);
  const transport = globalThis.fetch;
  globalThis.fetch = budget.wrap(transport);
  try {
  const description = syntheticDescription;
  const started = Date.now();
  const input = syntheticDeckInput;
  const planType = input.planType;
  const fixtureHash = createHash("sha256").update(JSON.stringify({ input, model: config.model, version: "launch-qa-v1" })).digest("hex");
  const previous = await saved("manifest.json");
  assert(!previous || previous.fixtureHash === fixtureHash, "Fixture/model changed: review the existing verification evidence before another run");
  await save("manifest.json", { fixtureHash, synthetic: true, model: config.model, productionDatabase: false });

  const period: OperatingPeriod = { id: "00000000-0000-4000-8000-000000000002", revision: 1, start: "2026-09-01", end: "2026-09-07", createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z", metrics: { inquiries: 5, orders: 1, revenue: 50000, expenses: 10000 }, feedback: "", keep: "", change: "", nextAction: "", successCriterion: "" };
  const baseline: OperatingPeriod = { ...period, id: "00000000-0000-4000-8000-000000000001", start: "2026-08-25", end: "2026-08-31", metrics: { inquiries: 3, orders: 0, revenue: 0, expenses: 5000 } };
  const payload = analysisPayload("QA 가상 메뉴 소개글 서비스", period, baseline, { feedback: false, notes: false });
  const existingAnalysis = await saved("operating-analysis.json");
  if (existingAnalysis) validateAnalysisResult(existingAnalysis.result, payload);
  else {
    process.env.OPERATING_AI_ENABLED = "true";
    const runtime = analysisRuntime("deck-qa-synthetic");
    assert(runtime?.target.provider === "openai");
    const result = await runtime.generate(payload);
    await save("operating-analysis.json", { synthetic: true, payload, result: validateAnalysisResult(result.result, payload), usage: result.usage ?? null });
  }

  const events: unknown[] = await saved("deck-events.json") ?? [];
  const complete = await saved("deck-plan.json");
  const draft = await saved("deck-draft.json");
  const plan: DeckPlan | null = complete ?? await buildDeckPlan(config, input, async event => {
    const record = { at: new Date().toISOString(), elapsedSeconds: Math.round((Date.now() - started) / 1000), ...event };
    events.push(record); console.log(JSON.stringify(record)); await save("deck-events.json", events);
  }, { ...(draft ? { draft } : {}), saveDraft: value => save("deck-draft.json", value) });
  assert.ok(plan, "Deck generation/review did not complete");
  await save("deck-plan.json", plan);
  const bytes = await renderDeckPptx(plan, pickDeckTheme(planType, plan.brandName, description));
  assert.ok(bytes.length > 1000);
  await writeFile(join(output, "synthetic-business.pptx"), bytes);
  const result = { result: "generated-not-release-approved", slides: plan.slides.length, pptxBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), budget: budget.summary(), stillRequired: ["Render and visually inspect every slide", "Authenticated download and reconnect on staging", "Google and PG sandbox verification"] };
  await save("result.json", result); console.log(JSON.stringify(result));
  } finally {
    globalThis.fetch = transport;
    try { await save("budget-summary.json", budget.summary()); } finally { budget.close(); }
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Smoke failed"); process.exitCode = 1; });
