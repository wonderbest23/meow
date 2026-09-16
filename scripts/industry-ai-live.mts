import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import JSZip from "jszip";
import { APPROVAL_ID, EXTENSION_APPROVAL_ID, INDUSTRY_APPROVAL_ID, SyntheticAiBudget } from "./synthetic-ai-budget";
import { INDUSTRY_AI_FIXTURES, type IndustryAiFixture } from "./industry-ai-fixtures";
import type { SectionGenInput } from "../lib/plan-builder/section-generator";
import type { ServerPlanState } from "../lib/plan-builder/plan-server-store";
import type { DocumentRefreshPayload } from "../lib/plan-builder/document-refresh";
import type { DeckBuildInput } from "../lib/plan-builder/deck-plan";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUTPUT = join(ROOT, "artifacts/industry-ai-20260915");
const LEDGER = join(ROOT, "artifacts/synthetic-ai-launch");
const MODEL = "gpt-6-astra";
const VERSION = "industry-live-v1";
const MAX_SECTION_CHARS = 1600;
const SAFETY_MICROS = 100_000;
const KEYS = ["overview/summary", "market/products", "strategy/price"] as const;
const NOTICE = "가상 검증 자료이며 실제 사업이나 계약이 아닙니다";
const RECOVERY_ID = "b2b-generate-0-empty-heading-20260915";
const recoveryFlag = `--recover-reviewed-section=${RECOVERY_ID}`;
const recoveryCheckFlag = `--check-reviewed-recovery=${RECOVERY_ID}`;
const REBASE_ID = "b2b-stale-status-20260915";
const rebaseFlag = `--rebase-reviewed-runtime=${REBASE_ID}`;
const rebaseCheckFlag = `--check-reviewed-runtime=${REBASE_ID}`;
const SCHEMA_RECOVERY_ID = "ppt-points-required-20260915";
const schemaRecoveryFlag = `--recover-reviewed-schema=${SCHEMA_RECOVERY_ID}`;
const args = process.argv.slice(2), live = args.includes("--live");
const recovering = args.includes(recoveryFlag), checkingRecovery = args.includes(recoveryCheckFlag);
const rebasing = args.includes(rebaseFlag), checkingRebase = args.includes(rebaseCheckFlag);
const recoveringSchema = args.includes(schemaRecoveryFlag);
assert(args.every(arg => ["--live", "--approved-total-usd=30", recoveryFlag, recoveryCheckFlag, rebaseFlag, rebaseCheckFlag, schemaRecoveryFlag].includes(arg)), "Unknown option or unreviewed recovery receipt");
assert(!(recovering || checkingRecovery || rebasing || checkingRebase || recoveringSchema) || args.length === 1, "Offline recovery/rebase cannot be combined with live or other options");
assert(!live || args.includes("--approved-total-usd=30"), "Live requires explicit --approved-total-usd=30");
const config = { provider: "openai" as const, model: MODEL, apiKey: "dry-run-no-key" };
const transport = globalThis.fetch;
const isolatedEnv = { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_ANON_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false", PAYMENTS_ENABLED: "false" };
const priorEnv = Object.fromEntries(Object.keys(isolatedEnv).map(key => [key, process.env[key]]));
Object.assign(process.env, isolatedEnv);
globalThis.fetch = async () => { throw new Error("NETWORK_DISABLED_OUTSIDE_LIVE_PHASE"); };

type CallSpec = { name: string; maxBodyBytes: number; maxOutputTokens: number; format?: string };
type PhaseReceipt = { status: "running" | "complete" | "failed"; startedAt: string; finishedAt?: string; error?: string; provenance?: string; recoveryReceipt?: string };
type Progress = { version: string; fixtureHash: string; sector: string; status: "running" | "complete" | "failed" | "budget_stopped"; phases: Record<string, PhaseReceipt>; state?: ServerPlanState; error?: string; initialDeckGeneratedByAI?: boolean; expectedSourceChanged?: boolean; requestCount: number; outputHashes?: Record<string, string> };
const digest = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const reservation = (spec: CallSpec) => Math.ceil((spec.maxBodyBytes + 16384) * 25 + spec.maxOutputTokens * 75);
const total = (specs: CallSpec[]) => specs.reduce((sum, spec) => sum + reservation(spec), 0);
const usd = (micros: number) => Number((micros / 1e6).toFixed(6));
const readJson = async <T,>(path: string): Promise<T | null> => { try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } };
async function saveJson(path: string, value: unknown) {
  const serialized = JSON.stringify(value, null, 2);
  assert(config.apiKey === "dry-run-no-key" || !serialized.includes(config.apiKey), "Secret must never enter artifacts");
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(`${path}.tmp`, serialized, { mode: 0o600 }); await rename(`${path}.tmp`, path);
}
const safeError = (error: unknown) => (error instanceof Error ? error.message : "UNKNOWN_FAILURE").replaceAll(config.apiKey, "[redacted]").slice(0, 500);
const documentContent = <T extends { revision: number }>(document: T) => { const { revision: _revision, ...content } = document; return content; };
const RECOVERY_FILES = {
  "manifest.json": "40d8669437818887ac548b2bf5ae742dffb6f91e33da3623f6b62caa65a630a9",
  "b2b_service/checkpoint.json": "d8a5fc62887ecb2353e92aaf1320d6b55bfb155f1ce18ac959137aa0cca680ee",
  "b2b_service/document-0-input.json": "6217ef6662dd1ea8554bfc44697506b2f218c649dd8efe3df0b1f139b47a8201",
  "b2b_service/requests/001-generate-overview-summary-request.json": "b8b4adcc2757a9cf385d31797bb9c4e4eb696c98b1e6a1e8ae4bb8f6b8fafe85",
  "b2b_service/requests/001-generate-overview-summary-response.json": "445241ba2b3a44634c3dddf191ac92d7c6698310fe06285d6ac919a4ed12272d",
} as const;
const RECOVERY_REQUEST_HASH = "22f503f10eb4671745ee498c8fc74a70cc780b49da04564197f9ac0a5e818860";
function verifyRecoveryEvidence(files: Record<string, string>, ledgerText: string) {
  for (const [path, expected] of Object.entries(RECOVERY_FILES)) assert.equal(digest(files[path]), expected, `Reviewed evidence changed: ${path}`);
  const ledger = JSON.parse(ledgerText), request = JSON.parse(files["b2b_service/requests/001-generate-overview-summary-request.json"]);
  const response = JSON.parse(files["b2b_service/requests/001-generate-overview-summary-response.json"]);
  const checkpoint = JSON.parse(files["b2b_service/checkpoint.json"]) as Progress;
  const input = JSON.parse(files["b2b_service/document-0-input.json"]) as SectionGenInput;
  const manifest = JSON.parse(files["manifest.json"]);
  const calls = ledger.calls.filter((call: any) => call.requestHash === RECOVERY_REQUEST_HASH);
  assert.equal(calls.length, 1, "Exactly one original paid reservation is required");
  assert.equal(calls[0].id, "9c6267af-5fb9-473a-ada8-2e8ef2bb1320");
  assert.equal(calls[0].status, "completed"); assert.equal(calls[0].model, MODEL);
  assert.equal(calls[0].reservedMicros, 1155050); assert.equal(calls[0].inputTokens, 1389); assert.equal(calls[0].outputTokens, 386);
  assert.equal(request.requestHash, RECOVERY_REQUEST_HASH); assert.equal(digest(request.body), RECOVERY_REQUEST_HASH);
  assert.equal(response.status, 200); assert.equal(response.result.status, "completed");
  assert.equal(response.result.id, "resp_027f56e2d5b37743016aa9623d6adc87d0b9074127dd06e28d");
  assert.equal(response.result.model, MODEL); assert.equal(response.result.error, null); assert.equal(response.result.incomplete_details, null);
  assert.equal(checkpoint.status, "failed"); assert.equal(checkpoint.requestCount, 1);
  assert.deepEqual(Object.keys(checkpoint.phases), ["generate-0"]); assert.equal(checkpoint.phases["generate-0"].status, "failed");
  assert(checkpoint.error?.startsWith("Actual section generation failed; fixture output is never substituted"));
  assert(checkpoint.state && checkpoint.state.plans.length === 1 && Object.keys(checkpoint.state.plans[0].sections).length === 0);
  assert.equal(checkpoint.fixtureHash, digest({ fixture: INDUSTRY_AI_FIXTURES[0], sourceHash: manifest.sourceHash }));
  assert.equal(manifest.fixtureHash, digest(INDUSTRY_AI_FIXTURES));
  return { ledger, request, response, checkpoint, input, manifest };
}
function unfinishedCalls(calls: CallSpec[], progress?: Progress | null) {
  const groups = [
    ...KEYS.map((_, index) => ({ phase: `generate-${index}`, calls: calls.slice(index, index + 1) })),
    { phase: "deck-generate", calls: calls.slice(3, 5) },
    { phase: "document-update", calls: calls.slice(5, 7) },
    { phase: "ppt-update", calls: calls.slice(7) },
  ];
  return groups.filter(group => progress?.phases[group.phase]?.status !== "complete").flatMap(group => group.calls);
}
function validateRequest(body: Record<string, any>, spec: CallSpec, fixture: IndustryAiFixture) {
  assert(Object.keys(body).every(key => ["model", "store", "reasoning", "max_output_tokens", "text", "input"].includes(key)), "Unexpected unbudgeted request features");
  assert.equal(body.model, MODEL); assert.equal(body.max_output_tokens, spec.maxOutputTokens);
  assert(Array.isArray(body.input) && body.input.length === 2 && body.input.every((item: any) => ["system", "user"].includes(item.role) && typeof item.content === "string"));
  assert(body.input.some((item: { content: string }) => item.content.includes(fixture.name)), "Only this sector's synthetic input is permitted");
  if (spec.format) assert.equal(body.text?.format?.name, spec.format);
  else assert(!body.text?.format?.name, "Unexpected repair/review request");
  const sent = { ...body, store: false, service_tier: "default" }, serialized = JSON.stringify(sent);
  assert(Buffer.byteLength(serialized) <= spec.maxBodyBytes && spec.maxBodyBytes + 16384 <= 200000, "Request exceeds preflight byte reservation; nothing sent");
  return { sent, serialized };
}
async function currentSourceHash() {
  const runtimeFiles = (await readdir(join(ROOT, "lib"), { recursive: true })).filter(path => /\.(ts|tsx)$/.test(path)).sort().map(path => `lib/${path}`);
  return digest(await Promise.all(["scripts/industry-ai-live.mts", "scripts/industry-ai-fixtures.ts", "scripts/synthetic-ai-budget.ts", ...runtimeFiles].map(async path => ({ path, content: await readFile(join(ROOT, path), "utf8") }))));
}
const REBASE_FILES = {
  "manifest.json": "3a5fb0fa5d83c6ca23095a5b65097ef49c4cb38b9d95bdbbf9f377d0da84115d",
  "b2b_service/checkpoint.json": "63df115ffe23435c8f5870443d8b229dd6b5ed6f405891a75b0e8034a91fc81f",
  "b2b_service/document-0-generated.json": "28ad89605518c116136fe5017265e8dff68a04d2eb9f2db7d27ecd99b470bdfb",
  [`recoveries/${RECOVERY_ID}/receipt.json`]: "08afb5be166f693e7b86e6040db66666eb4f538072e92748b9b3ce90a9fac046",
  [`recoveries/${RECOVERY_ID}/committed.json`]: "4c679a09ba76e9ec98f86dcc1229660db1e33e993de4a5071b6b6a8f805db627",
  ...Object.fromEntries(Object.entries(RECOVERY_FILES).filter(([path]) => !["manifest.json", "b2b_service/checkpoint.json"].includes(path))),
};
const PHASE_ZERO_RUNTIME = {
  "lib/plan-builder/section-generator.ts": "010c1ceb0f7a05cabf6bdb109af00c604af97b9c25b1c151273360f2b985377e",
  "lib/plan-builder/document-quality.ts": "dce7ccc93b3599a548d2995319d1ac0daac8b851d86b0c54c3d9e6195e87df1e",
  "lib/llm/complete.ts": "58108a136514600da0190a2423f458af8c008db0566b6d03ed8718ea8a5acb33",
};
const RECOVERED_LEDGER_HASH = "ca3b2273c8ba1b18668a847aa600c58c459a8843c1e74ba5c7980323bba177e9";
function verifyRebaseEvidence(files: Record<string, string>, originals: Record<string, string>, ledger: string, requests: string[]) {
  for (const [path, expected] of Object.entries(REBASE_FILES)) assert.equal(digest(files[path]), expected, `Exact recovered state changed: ${path}`);
  assert.equal(digest(ledger), RECOVERED_LEDGER_HASH, "Ledger changed after the reviewed recovery");
  const original = verifyRecoveryEvidence(originals, ledger);
  assert.equal(original.ledger.calls.length, 10);
  assert.equal(original.ledger.calls.reduce((sum: number, call: any) => sum + call.reservedMicros, 0), 8305150);
  const expectedRequests = Object.keys(REBASE_FILES).filter(path => path.includes("/requests/")).sort();
  assert.deepEqual(requests, expectedRequests, "No subsequent provider requests are permitted");
  const checkpoint = JSON.parse(files["b2b_service/checkpoint.json"]) as Progress, manifest = JSON.parse(files["manifest.json"]);
  const receipt = JSON.parse(files[`recoveries/${RECOVERY_ID}/receipt.json`]);
  const generated = JSON.parse(files["b2b_service/document-0-generated.json"]);
  assert.equal(checkpoint.status, "running"); assert.equal(checkpoint.requestCount, 1); assert.equal(checkpoint.error, undefined);
  assert.deepEqual(Object.keys(checkpoint.phases), ["generate-0"]); assert.equal(checkpoint.phases["generate-0"].status, "complete");
  assert.equal(checkpoint.phases["generate-0"].recoveryReceipt, RECOVERY_ID);
  assert.equal(checkpoint.phases["generate-0"].provenance, "existing-provider-response-revalidated-no-newcall");
  assert.equal(receipt.paidCalls, 0); assert.equal(receipt.originalLedgerSha256, RECOVERED_LEDGER_HASH);
  assert.equal(receipt.recoveredCheckpointSha256, digest(files["b2b_service/checkpoint.json"]));
  assert.equal(receipt.recoveredManifestSha256, digest(files["manifest.json"]));
  assert.equal(checkpoint.fixtureHash, digest({ fixture: INDUSTRY_AI_FIXTURES[0], sourceHash: manifest.sourceHash }));
  assert.equal(manifest.fixtureHash, digest(INDUSTRY_AI_FIXTURES));
  assert(checkpoint.state && checkpoint.state.plans.length === 1);
  assert.deepEqual(Object.keys(checkpoint.state.plans[0].sections), [KEYS[0]]);
  const providerText = original.response.result.output.flatMap((item: any) => item.content ?? []).filter((item: any) => item.type === "output_text").map((item: any) => item.text).join("").trim();
  assert.equal(checkpoint.state.plans[0].sections[KEYS[0]].markdown, providerText); assert.equal(generated.markdown, providerText);
  return { checkpoint, manifest, receipt };
}
async function rebaseReviewedRuntime() {
  const loadFiles = async (paths: string[], base = OUTPUT): Promise<Record<string, string>> => Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(join(base, path), "utf8")] as const)));
  const requestInventory = async () => (await Promise.all(INDUSTRY_AI_FIXTURES.map(async fixture => {
    try { return (await readdir(join(OUTPUT, fixture.sector, "requests"))).map(name => `${fixture.sector}/requests/${name}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }))).flat().sort();
  const ledgerPath = join(LEDGER, "budget.json"), ledger = await readFile(ledgerPath, "utf8");
  assert(!(await readdir(LEDGER)).includes("budget.lock"), "A paid run holds the ledger lock");
  const files = await loadFiles(Object.keys(REBASE_FILES));
  const originals = await loadFiles(Object.keys(RECOVERY_FILES), join(OUTPUT, "recoveries", RECOVERY_ID, "original"));
  const requests = await requestInventory(), evidence = verifyRebaseEvidence(files, originals, ledger, requests);
  for (const [path, expected] of Object.entries(PHASE_ZERO_RUNTIME)) assert.equal(digest(await readFile(join(ROOT, path), "utf8")), expected, "Phase-zero generation/validation changed; this receipt cannot authorize it");
  let guardTests = 0;
  for (const path of Object.keys(REBASE_FILES)) { assert.throws(() => verifyRebaseEvidence({ ...files, [path]: `${files[path]} ` }, originals, ledger, requests)); guardTests++; }
  assert.throws(() => verifyRebaseEvidence(files, originals, `${ledger} `, requests)); guardTests++;
  assert.throws(() => verifyRebaseEvidence(files, originals, ledger, [...requests, "b2b_service/requests/002-extra.json"])); guardTests++;
  const sourceHash = await currentSourceHash(), checkpoint = { ...evidence.checkpoint, fixtureHash: digest({ fixture: INDUSTRY_AI_FIXTURES[0], sourceHash }) }, manifest = { ...evidence.manifest, sourceHash };
  assert.deepEqual({ ...checkpoint, fixtureHash: evidence.checkpoint.fixtureHash }, evidence.checkpoint, "Only checkpoint hash metadata may change");
  assert.deepEqual({ ...manifest, sourceHash: evidence.manifest.sourceHash }, evidence.manifest, "Only manifest source hash may change");
  const receipt = { id: REBASE_ID, reviewedScope: "chart stale status, operating-only stale status, deleted retained slide IDs", createdAt: new Date().toISOString(), previousRecovery: RECOVERY_ID, originalFiles: REBASE_FILES, ledgerSha256: RECOVERED_LEDGER_HASH, reservedUsd: 8.30515, paidCalls: 0, networkCalls: 0, replayedResponses: 0, guardTests, beforeSourceHash: evidence.manifest.sourceHash, afterSourceHash: sourceHash, phaseZeroRuntimeHashes: PHASE_ZERO_RUNTIME, preservedPlanStateSha256: digest(checkpoint.state), afterCheckpointSha256: digest(JSON.stringify(checkpoint, null, 2)), afterManifestSha256: digest(JSON.stringify(manifest, null, 2)) };
  if (checkingRebase) { console.log(JSON.stringify({ ...receipt, status: "offline-rebase-check-passed-no-writes" })); return; }
  const lock = join(LEDGER, "budget.lock"), audit = join(OUTPUT, "runtime-rebases", REBASE_ID);
  await mkdir(lock, { mode: 0o700 });
  try {
    assert.equal(await readFile(ledgerPath, "utf8"), ledger);
    const currentFiles = await loadFiles(Object.keys(REBASE_FILES)); assert.deepEqual(currentFiles, files);
    verifyRebaseEvidence(currentFiles, originals, ledger, await requestInventory());
    assert.equal(await currentSourceHash(), sourceHash, "Runtime changed during reviewed rebase");
    await mkdir(join(OUTPUT, "runtime-rebases"), { recursive: true }); await mkdir(audit, { mode: 0o700 });
    for (const [path, original] of Object.entries(files)) { const target = join(audit, "original", path); await mkdir(join(target, ".."), { recursive: true }); await writeFile(target, original, { flag: "wx", mode: 0o444 }); }
    await writeFile(join(audit, "original-ledger.json"), ledger, { flag: "wx", mode: 0o444 });
    await writeFile(join(audit, "receipt.json"), JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o444 });
    await saveJson(join(OUTPUT, "manifest.json"), manifest); await saveJson(join(OUTPUT, "b2b_service/checkpoint.json"), checkpoint);
    assert.equal(await readFile(ledgerPath, "utf8"), ledger);
    await writeFile(join(audit, "committed.json"), JSON.stringify({ receipt: REBASE_ID, committedAt: new Date().toISOString(), planContentChanged: false, ledgerChanged: false }, null, 2), { flag: "wx", mode: 0o444 });
    console.log(JSON.stringify({ ...receipt, status: "offline-rebase-complete", audit }));
  } finally { await rmdir(lock); }
}

async function recoverReviewedSchema() {
  const expected = {
    "manifest.json": "aef13a52057522d5cb8692a626fc6869c9c089ae7d1ad509b9f5643c7a7aeba5",
    "b2b_service/checkpoint.json": "824893088882e1f6a27f4204a21e52d667813ae30db142a7614f45a4a0aa9c99",
    "b2b_service/requests/008-ppt-update-generate-request.json": "0fa5d9c4abe4ac1db8ce3e718b68b215333ff01d373713b4b49e94d5647e8ce5",
    "b2b_service/requests/008-ppt-update-generate-response.json": "6fa3d0a897845169499df0d9dea42bd450eb726b83d1d9411bf7305df4b4d45c",
  };
  const ledgerPath = join(LEDGER, "budget.json"), lock = join(LEDGER, "budget.lock");
  const ledgerText = await readFile(ledgerPath, "utf8");
  assert.equal(digest(ledgerText), "ca40dd1b47b72729bc28979d2da00de35791d1e54572df2bd392a7fae16789f8");
  const ledger = JSON.parse(ledgerText), last = ledger.calls.at(-1);
  assert.equal(ledger.calls.length, 17); assert.equal(last.status, "http_failed");
  assert.equal(last.requestHash, "89784b39417645e5255dfc33c1fff6677cac9db81f3152ac3ccd0a722041d496");
  const files: Record<string, string> = {};
  for (const [path, hash] of Object.entries(expected)) { files[path] = await readFile(join(OUTPUT, path), "utf8"); assert.equal(digest(files[path]), hash); }
  const request = JSON.parse(files["b2b_service/requests/008-ppt-update-generate-request.json"]);
  const response = JSON.parse(files["b2b_service/requests/008-ppt-update-generate-response.json"]);
  assert.equal(digest(request.body), last.requestHash); assert.equal(response.status, 400);
  assert.equal(response.result.error.code, "invalid_json_schema"); assert.equal(response.result.error.param, "text.format.schema");
  assert(response.result.error.message.includes("Missing 'id'"));
  const progress = JSON.parse(files["b2b_service/checkpoint.json"]) as Progress;
  assert.equal(progress.status, "failed"); assert.equal(progress.requestCount, 8);
  for (const name of ["generate-0", "generate-1", "generate-2", "document-manual-edit", "deck-generate", "ppt-manual-edit", "document-update"]) assert.equal(progress.phases[name]?.status, "complete");
  assert.equal(progress.phases["ppt-update"]?.status, "failed");
  assert.equal(Object.keys(progress.phases).length, 8); assert(progress.initialDeckGeneratedByAI);
  const { z } = await import("zod");
  const { rewriteProviderResultSchema } = await import("../lib/plan-builder/proposal-rewrite");
  const schema = z.toJSONSchema(rewriteProviderResultSchema, { target: "draft-7" });
  function strict(value: any) {
    if (!value || typeof value !== "object") return;
    if (value.type === "object") { assert.equal(value.additionalProperties, false); assert.deepEqual([...(value.required ?? [])].sort(), Object.keys(value.properties ?? {}).sort()); }
    for (const item of Object.values(value)) strict(item);
  }
  strict(schema); assert.notDeepEqual(schema, request.body.text.format.schema);
  const beforeStateHash = digest(progress.state), sourceHash = await currentSourceHash();
  const manifest = { ...JSON.parse(files["manifest.json"]), sourceHash };
  progress.fixtureHash = digest({ fixture: INDUSTRY_AI_FIXTURES[0], sourceHash });
  progress.status = "running"; delete progress.error; delete progress.phases["ppt-update"];
  assert.equal(digest(progress.state), beforeStateHash, "Completed artifacts and the failed job remain unchanged");
  const receipt = { id: SCHEMA_RECOVERY_ID, reason: "Provider HTTP 400 invalid_json_schema: optional point identity removed from provider-only schema; local IDs preserved", createdAt: new Date().toISOString(), originalFiles: expected, ledgerSha256: digest(ledgerText), preservedStateSha256: beforeStateHash, newSourceHash: sourceHash, paidCalls: 0, automaticRetries: 0, unchangedCompletedPhases: 7, nextPhase: "ppt-update", reservedUsd: 15.554375, remainingReservationUsd: 14.445625 };
  await mkdir(lock, { mode: 0o700 });
  try {
    assert.equal(await readFile(ledgerPath, "utf8"), ledgerText);
    for (const [path, original] of Object.entries(files)) assert.equal(await readFile(join(OUTPUT, path), "utf8"), original);
    assert.equal(await currentSourceHash(), sourceHash);
    const audit = join(OUTPUT, "recoveries", SCHEMA_RECOVERY_ID); await mkdir(audit, { mode: 0o700 });
    for (const [path, original] of Object.entries(files)) { const target = join(audit, "original", path); await mkdir(join(target, ".."), { recursive: true }); await writeFile(target, original, { flag: "wx", mode: 0o444 }); }
    await writeFile(join(audit, "original-ledger.json"), ledgerText, { flag: "wx", mode: 0o444 });
    await writeFile(join(audit, "receipt.json"), JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o444 });
    await saveJson(join(OUTPUT, "manifest.json"), manifest); await saveJson(join(OUTPUT, "b2b_service/checkpoint.json"), progress);
    assert.equal(await readFile(ledgerPath, "utf8"), ledgerText);
    console.log(JSON.stringify({ ...receipt, status: "reviewed-schema-recovery-complete" }));
  } finally { await rmdir(lock); }
}

async function main() {
  if (recoveringSchema) { await recoverReviewedSchema(); return; }
  if (rebasing || checkingRebase) { await rebaseReviewedRuntime(); return; }
  const { chaptersForType } = await import("../lib/plan-builder/blueprint");
  const { generateSection, validateSectionDraft } = await import("../lib/plan-builder/section-generator");
  const { checkDocumentQuality } = await import("../lib/plan-builder/document-quality");
  const { buildDeckPlan, blueprintForDeckInput } = await import("../lib/plan-builder/deck-plan");
  const { normalizeState, loadPlanState, savePlanState } = await import("../lib/plan-builder/plan-server-store");
  const { deckSource, deckFingerprint } = await import("../lib/plan-builder/deck-job");
  const { saveDocumentEdit } = await import("../lib/plan-builder/document-edit");
  const { saveProposalEditor, loadProposalEditor } = await import("../lib/plan-builder/proposal-editor-service");
  const { createDocumentRefreshRuntime } = await import("../lib/plan-builder/document-refresh-runtime");
  const { documentRefreshResultSchema } = await import("../lib/plan-builder/document-refresh");
  const { createProposalRewriteRuntime, previewProposalRewrite, runProposalRewrite } = await import("../lib/plan-builder/proposal-rewrite-service");
  const { renderableProposal } = await import("../lib/plan-builder/proposal-revision");
  const { renderPlanMarkdown } = await import("../lib/plan-builder/markdown");
  const { parseAmount } = await import("../lib/plan-builder/financials");
  const entries = chaptersForType("일반 사업계획서").flatMap(chapter => chapter.sections.map(section => ({ chapter, section, key: `${chapter.id}/${section.id}` })));
  assert(KEYS.every(key => entries.some(entry => entry.key === key)), "Production blueprint changed; review fixture mappings");
  const targets = KEYS.map(key => entries.find(entry => entry.key === key)!);
  const money = (text: string) => [...text.matchAll(/\d[\d,.]*(?:\s*(?:억|천|백|만)(?:\s*\d[\d,.]*)?)*\s*원/g)].map(match => parseAmount(match[0]));
  const presentation = (fixture: IndustryAiFixture) => ({ sector: fixture.sector, purpose: "sales" as const, stage: "prelaunch" as const, evidence: { pricing: true, images: false, financials: false, actuals: false, references: false, schedule: false } });
  const business = (fixture: IndustryAiFixture) => ({ name: fixture.name, description: `${NOTICE}. ${fixture.customer}에게 ${fixture.offer}을 제공하는 검증용 구상. ${fixture.exclusions}`, industry: fixture.sector, stage: "시작 전", region: "", role: "" });
  function sourceText(fixture: IndustryAiFixture, index: number) {
    return `${NOTICE}. ${index === 0 ? `${fixture.customer}을 위한 ${fixture.offer}. ${fixture.exclusions}` : index === 1 ? `${fixture.process}. ${fixture.nextAction}. ${fixture.exclusions}` : `검증용 제안 가격은 ${fixture.unit} 기준 ${fixture.price}. 비용과 실제 매출은 미입력. ${fixture.exclusions}. 가격의 적절성을 확인하며 납품 범위는 고객과 합의할 조건입니다.`}`;
  }
  function inputFor(fixture: IndustryAiFixture, index: number, priorSections: string[] = []): SectionGenInput {
    const { chapter, section } = targets[index];
    return { chapter, section, planTitle: fixture.name, planType: "일반 사업계획서", business: business(fixture), answers: { supplied_conditions: sourceText(fixture, index), editorial_scope: "결론과 근거 및 다음 행동을 짧게 정리하는 검증용 문서 항목. 전체 상세 계획서가 아니며 600자 이내를 목표로 합니다." }, priorSections };
  }
  function estimateSource(fixture: IndustryAiFixture): DeckBuildInput {
    return { businessName: fixture.name, businessDescription: business(fixture).description, planType: "일반 사업계획서", sections: targets.map(({ chapter, section }, index) => ({ chapterTitle: chapter.title, sectionTitle: section.title, markdown: sourceText(fixture, index) })), allAnswers: {}, presentation: presentation(fixture) };
  }

  const rawLedger = await readJson<{ version: number; approval: string; limitMicros: number; calls: Array<{ reservedMicros: number; status: string }>; extensions?: Array<{ id: string; additionalMicros: number }> }>(join(LEDGER, "budget.json"));
  assert(rawLedger?.version === 1 && rawLedger.approval === APPROVAL_ID, "Existing original ledger required; never create/reset it here");
  const extensions = rawLedger.extensions ?? [];
  assert(extensions.some(item => item.id === EXTENSION_APPROVAL_ID && item.additionalMicros === 5_000_000), "Previous cumulative $10 approval receipt required");
  assert(extensions.every(item => item.id === EXTENSION_APPROVAL_ID && item.additionalMicros === 5_000_000 || item.id === INDUSTRY_APPROVAL_ID && item.additionalMicros === 20_000_000));
  assert(new Set(extensions.map(item => item.id)).size === extensions.length);
  const effectiveLimit = Math.min(30_000_000, rawLedger.limitMicros + (extensions.some(item => item.id === INDUSTRY_APPROVAL_ID) ? 0 : 20_000_000));
  assert(effectiveLimit === 30_000_000 && rawLedger.calls.every(call => Number.isInteger(call.reservedMicros) && call.reservedMicros > 0), "Review ledger consistency");
  const reserved = rawLedger.calls.reduce((sum, call) => sum + call.reservedMicros, 0);
  const remaining = effectiveLimit - reserved;
  assert(remaining >= 0 && rawLedger.calls.length <= 64, "Existing ledger exceeds approved limits");

  const estimates: Array<{ fixture: IndustryAiFixture; calls: CallSpec[]; expected: number; worst: number; batches: number }> = [];
  for (const fixture of INDUSTRY_AI_FIXTURES) {
    const documentCalls: CallSpec[] = [];
    for (let index = 0; index < targets.length; index++) {
      let capture: Record<string, any> | null = null;
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), "https://api.openai.com/v1/responses"); assert(!capture, "Unexpected fallback/retry during dry-run capture");
        capture = JSON.parse(String(init?.body)); throw new Error("DRY_RUN_REQUEST_CAPTURED_NOT_SENT");
      };
      // Bound every prior section, including JSON escaping, without inventing a model response.
      const priorSections = Array.from({ length: index }, () => "\u0000".repeat(MAX_SECTION_CHARS));
      const value = await generateSection(config, inputFor(fixture, index, priorSections));
      assert.equal(value.source, "failed"); assert(capture, "Production generator did not produce a request");
      const body = capture as Record<string, any>;
      const spec = { name: `generate:${KEYS[index]}`, maxBodyBytes: Buffer.byteLength(JSON.stringify({ ...body, store: false, service_tier: "default" })), maxOutputTokens: body.max_output_tokens };
      validateRequest(body, spec, fixture);
      documentCalls.push(spec);
    }
    globalThis.fetch = async () => { throw new Error("NETWORK_DISABLED_OUTSIDE_LIVE_PHASE"); };
    const batches = Math.ceil(blueprintForDeckInput(estimateSource(fixture)).slots.length / 4);
    const calls = [...documentCalls,
      { name: "deck:generate", maxBodyBytes: 36000, maxOutputTokens: 8000 }, { name: "deck:review", maxBodyBytes: 48000, maxOutputTokens: 4000, format: "business_plan_review" },
      { name: "document-update:generate", maxBodyBytes: 16000, maxOutputTokens: 2400, format: "document_refresh" }, { name: "document-update:review", maxBodyBytes: 28000, maxOutputTokens: 700, format: "document_refresh_review" },
      ...Array.from({ length: batches }, () => [{ name: "ppt-update:generate", maxBodyBytes: 36000, maxOutputTokens: 3000, format: "proposal_rewrite" }, { name: "ppt-update:review", maxBodyBytes: 48000, maxOutputTokens: 1000, format: "proposal_rewrite_review" }]).flat(),
    ];
    estimates.push({ fixture, calls, expected: total(calls.slice(0, 9)), worst: total(calls), batches });
  }
  const sourceHash = await currentSourceHash();
  const resumePreflight = await Promise.all(estimates.map(async estimate => {
    const progress = await readJson<Progress>(join(OUTPUT, estimate.fixture.sector, "checkpoint.json"));
    const calls = unfinishedCalls(estimate.calls, progress);
    return { sector: estimate.fixture.sector, checkpointStatus: progress?.status ?? "not_started", unfinishedPaidCalls: calls.length, unfinishedReservationUsd: usd(total(calls)), fitsRemaining: total(calls) + SAFETY_MICROS <= remaining, requiresReviewedRecovery: progress?.status === "failed" || Object.values(progress?.phases ?? {}).some(phase => phase.status !== "complete") };
  }));
  const report = { mode: live ? "live-preflight" : recovering ? "offline-reviewed-recovery" : checkingRecovery ? "offline-recovery-check" : "dry-run", sourceHash, paidCalls: 0, approval: INDUSTRY_APPROVAL_ID, cumulativeLimitUsd: 30, existingReservedUsd: usd(reserved), remainingReservationUsd: usd(remaining), safetyMarginUsd: usd(SAFETY_MICROS), resumePreflight, scope: "3 actual generated document sections, actual generated/reviewed PPT, manual edit, actual document/PPT refresh, JSON restoration and local files; not all detailed plan chapters or browser/remote workflow", accounting: "Conservative reservations, not actual billing. No old reservation is refunded.", calls: estimates.map(item => ({ sector: item.fixture.sector, expectedCallsOneUpdateBatch: 9, maximumCalls: item.calls.length, reservationOneUpdateBatchUsd: usd(item.expected), reservationAllSlidesUpdatedUsd: usd(item.worst), fitsWorstCase: item.worst + SAFETY_MICROS <= remaining, perCall: item.calls.map(call => ({ ...call, reservationUsd: usd(reservation(call)) })) })), all11MinimumReservationUsd: usd(estimates.reduce((sum, item) => sum + item.expected, 0)), reusedGeneratedTemplateFixtures: false, dryRunSource: "Synthetic authored input only; initial request bytes captured from production generateSection with maximum-length prior sections, without HTTP transport or model responses. Future request byte ceilings are enforced estimates." };
  console.log(JSON.stringify(report, null, 2));
  if (recovering || checkingRecovery) {
    const ledgerPath = join(LEDGER, "budget.json");
    assert(!(await readdir(LEDGER)).includes("budget.lock"), "A paid run holds the ledger lock; recovery is forbidden");
    const ledgerText = await readFile(ledgerPath, "utf8"), ledgerHash = digest(ledgerText);
    const files: Record<string, string> = Object.fromEntries(await Promise.all(Object.keys(RECOVERY_FILES).map(async path => [path, await readFile(join(OUTPUT, path), "utf8")] as const)));
    const evidence = verifyRecoveryEvidence(files, ledgerText);
    assert.deepEqual(evidence.input, inputFor(INDUSTRY_AI_FIXTURES[0], 0), "Current generation inputs must exactly match the paid request");
    let guardTests = 0;
    for (const path of Object.keys(RECOVERY_FILES)) {
      assert.throws(() => verifyRecoveryEvidence({ ...files, [path]: `${files[path]} ` }, ledgerText)); guardTests++;
    }
    for (const mutate of [
      (ledger: any) => { ledger.calls.find((call: any) => call.requestHash === RECOVERY_REQUEST_HASH).status = "uncertain"; },
      (ledger: any) => { ledger.calls.push(structuredClone(ledger.calls.find((call: any) => call.requestHash === RECOVERY_REQUEST_HASH))); },
      (ledger: any) => { ledger.calls.find((call: any) => call.requestHash === RECOVERY_REQUEST_HASH).outputTokens++; },
    ]) {
      const invalid = structuredClone(evidence.ledger); mutate(invalid);
      assert.throws(() => verifyRecoveryEvidence(files, JSON.stringify(invalid))); guardTests++;
    }
    const text = evidence.response.result.output.flatMap((item: any) => item.content ?? []).filter((item: any) => item.type === "output_text").map((item: any) => item.text).join("").trim();
    const legacyEmptyHeadings = text.split(/(?=^#{1,6}\s)/m).filter((chunk: string) => /^#{1,6}\s/.test(chunk) && !chunk.split("\n").slice(1).join("").trim()).length;
    assert(legacyEmptyHeadings > 0, "The explicitly reviewed empty_heading failure must be reproducible");
    const quality = checkDocumentQuality(text, JSON.stringify(evidence.input));
    assert.deepEqual(quality.issues, [], "Recovery only permits the reviewed heading defect; any remaining issue stops recovery");
    assert(validateSectionDraft(text, evidence.input), "Current production quality validation must pass");
    let replayed = 0;
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://api.openai.com/v1/responses"); assert.equal(init?.method, "POST");
      assert.equal(++replayed, 1, "Offline recovery allows exactly one saved provider response, never a repair or retry");
      const { sent, serialized } = validateRequest(JSON.parse(String(init?.body)), estimates[0].calls[0], INDUSTRY_AI_FIXTURES[0]);
      assert.equal(digest(serialized), RECOVERY_REQUEST_HASH); assert.deepEqual(sent, evidence.request.body);
      return new Response(JSON.stringify(evidence.response.result), { status: 200, headers: { "content-type": "application/json" } });
    };
    let result;
    try { result = await generateSection(config, evidence.input); }
    finally { globalThis.fetch = async () => { throw new Error("NETWORK_DISABLED_AFTER_OFFLINE_REPLAY"); }; }
    assert.equal(replayed, 1); assert.equal(result.source, "ai"); assert.equal(result.markdown, text, "The original provider text must not be edited or replaced");
    assert(result.markdown.length <= MAX_SECTION_CHARS);
    assert(!money(result.markdown).includes(parseAmount(INDUSTRY_AI_FIXTURES[0].price)));
    const progress = structuredClone(evidence.checkpoint), now = new Date().toISOString();
    const provenance = "existing-provider-response-revalidated-no-newcall";
    const generatedAt = new Date(evidence.response.result.completed_at * 1000).toISOString();
    progress.state!.plans[0].sections[KEYS[0]] = { markdown: result.markdown, html: await renderPlanMarkdown(result.markdown), generatedAt };
    progress.state!.plans[0].updatedAt = generatedAt;
    progress.fixtureHash = digest({ fixture: INDUSTRY_AI_FIXTURES[0], sourceHash }); progress.status = "running"; delete progress.error;
    progress.phases["generate-0"] = { status: "complete", startedAt: evidence.checkpoint.phases["generate-0"].startedAt, finishedAt: now, provenance, recoveryReceipt: RECOVERY_ID };
    const pending = unfinishedCalls(estimates[0].calls, progress);
    assert.equal(pending.length, estimates[0].calls.length - 1);
    assert.equal(total(pending), total(estimates[0].calls) - reservation(estimates[0].calls[0]));
    const manifest = { ...evidence.manifest, sourceHash };
    const generated = { ...result, synthetic: true, provenance, recoveryReceipt: RECOVERY_ID, originalRequestHash: RECOVERY_REQUEST_HASH, originalResponseId: evidence.response.result.id };
    const receipt = { id: RECOVERY_ID, approvedRepair: "empty_heading parent heading with populated nested heading", provenance, recoveredAt: now, beforeSourceHash: evidence.manifest.sourceHash, afterSourceHash: sourceHash, originalFiles: RECOVERY_FILES, originalLedgerSha256: ledgerHash, originalRequestHash: RECOVERY_REQUEST_HASH, originalLedgerCallId: "9c6267af-5fb9-473a-ada8-2e8ef2bb1320", paidCalls: 0, offlineReplayedResponses: replayed, guardTests, legacyEmptyHeadings, currentQuality: quality, markdownChars: text.length, recoveredCheckpointSha256: digest(JSON.stringify(progress, null, 2)), recoveredManifestSha256: digest(JSON.stringify(manifest, null, 2)), unfinishedPaidCalls: pending.length, unfinishedReservationUsd: usd(total(pending)), remainingReservationUsd: usd(remaining) };
    assert.equal(digest(await readFile(ledgerPath, "utf8")), ledgerHash, "Ledger changed during offline review");
    if (checkingRecovery) { console.log(JSON.stringify({ ...receipt, status: "offline-check-passed-no-files-written" })); return; }
    const lock = join(LEDGER, "budget.lock"), audit = join(OUTPUT, "recoveries", RECOVERY_ID);
    await mkdir(lock, { mode: 0o700 });
    try {
      for (const path of Object.keys(RECOVERY_FILES)) assert.equal(await readFile(join(OUTPUT, path), "utf8"), files[path], "Evidence changed during replay");
      assert.equal(digest(await readFile(ledgerPath, "utf8")), ledgerHash);
      await mkdir(join(OUTPUT, "recoveries"), { recursive: true });
      await mkdir(audit, { mode: 0o700 }); // Exclusive creation prevents repeated or automatic recovery.
      for (const [path, original] of Object.entries(files)) {
        const target = join(audit, "original", path); await mkdir(join(target, ".."), { recursive: true });
        await writeFile(target, original, { flag: "wx", mode: 0o444 });
      }
      await writeFile(join(audit, "original-ledger.json"), ledgerText, { flag: "wx", mode: 0o444 });
      await writeFile(join(audit, "receipt.json"), JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o444 });
      await writeFile(join(OUTPUT, "b2b_service/document-0-generated.json"), JSON.stringify(generated, null, 2), { flag: "wx", mode: 0o600 });
      await saveJson(join(OUTPUT, "manifest.json"), manifest);
      await saveJson(join(OUTPUT, "b2b_service/checkpoint.json"), progress);
      assert.equal(digest(await readFile(ledgerPath, "utf8")), ledgerHash, "Offline recovery must not alter reservations");
      await writeFile(join(audit, "committed.json"), JSON.stringify({ receipt: RECOVERY_ID, committedAt: new Date().toISOString(), ledgerUnchanged: true }, null, 2), { flag: "wx", mode: 0o444 });
      console.log(JSON.stringify({ ...receipt, status: "offline-recovery-complete", audit }));
    } finally { await rmdir(lock); }
    return;
  }
  if (!live) return;

  config.apiKey = parseEnv(await readFile(join(ROOT, ".env.local"), "utf8")).OPENAI_API_KEY ?? "";
  assert(config.apiKey && config.apiKey !== "dry-run-no-key", "Set the local OpenAI key; no secret is read from remote services");
  const budget = new SyntheticAiBudget(LEDGER, 30, { id: INDUSTRY_APPROVAL_ID, additionalUsd: 20 });
  const guarded = budget.wrap(transport);
  let active: { specs: CallSpec[]; cursor: number; sector: string; phase: string; directory: string; progress: Progress } | null = null;
  const requestHashes = new Set(budget.summary().calls.map(call => call.requestHash));
  globalThis.fetch = async (url, init) => {
    const phase = active;
    assert(phase, "Network is forbidden outside an active paid checkpoint");
    assert.equal(String(url), "https://api.openai.com/v1/responses"); assert.equal(init?.method, "POST");
    assert.equal(typeof init?.body, "string");
    const body = JSON.parse(String(init.body)), spec = phase.specs[phase.cursor];
    assert(spec, "Automatic retry/repair or extra call is not approved");
    const { sent, serialized } = validateRequest(body, spec, INDUSTRY_AI_FIXTURES.find(fixture => fixture.sector === phase.sector)!);
    const hash = digest(serialized); assert(!requestHashes.has(hash), "Identical paid request already reserved; manual review required");
    phase.cursor++; requestHashes.add(hash);
    const id = `${String(++phase.progress.requestCount).padStart(3, "0")}-${spec.name.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
    await saveJson(join(phase.directory, "requests", `${id}-request.json`), { synthetic: true, phase: phase.phase, requestHash: hash, reservationUpperBoundUsd: usd(reservation(spec)), body: sent });
    await saveJson(join(phase.directory, "checkpoint.json"), phase.progress);
    const response = await guarded(url, init);
    const result = await response.clone().json().catch(() => null);
    await saveJson(join(phase.directory, "requests", `${id}-response.json`), { status: response.status, result });
    assert(response.ok && result?.status === "completed" && !result?.incomplete_details, "Provider response failed/incomplete; no automatic retry");
    return response;
  };

  try {
    await mkdir(OUTPUT, { recursive: true }); await saveJson(join(OUTPUT, "preflight.json"), report);
    const manifest = { version: VERSION, model: MODEL, approval: INDUSTRY_APPROVAL_ID, sourceHash, fixtureHash: digest(INDUSTRY_AI_FIXTURES), synthetic: true, productionDatabase: false };
    const oldManifest = await readJson<typeof manifest>(join(OUTPUT, "manifest.json"));
    if (oldManifest) assert.deepEqual(oldManifest, manifest, "Script/runtime/fixtures changed; inspect previous paid evidence before another run");
    else await saveJson(join(OUTPUT, "manifest.json"), manifest);
    for (const estimate of estimates) {
      const fixture = estimate.fixture, directory = join(OUTPUT, fixture.sector), owner = `qa-industry-${fixture.sector}`, planId = `qa-industry-${fixture.sector}`;
      const fixtureHash = digest({ fixture, sourceHash });
      const existing = await readJson<Progress>(join(directory, "checkpoint.json"));
      if (existing) assert.equal(existing.fixtureHash, fixtureHash);
      if (existing?.status === "complete") { console.log(JSON.stringify({ sector: fixture.sector, status: "already_complete", paidCalls: 0 })); continue; }
      assert(!existing || existing.status !== "failed" && !Object.values(existing.phases).some(phase => phase.status !== "complete"), "A previous failed/interrupted industry requires manual review; never retry automatically");
      const progress: Progress = existing ?? { version: VERSION, fixtureHash, sector: fixture.sector, status: "running", phases: {}, requestCount: 0 };
      const stamp = new Date().toISOString();
      const seed = normalizeState({ business: business(fixture), activePlanId: planId, plans: [{ id: planId, title: fixture.name, planType: "일반 사업계획서", createdAt: stamp, updatedAt: stamp, answers: Object.fromEntries(targets.map((target, index) => [target.key, { supplied_conditions: sourceText(fixture, index) }])), sections: {} }] });
      await savePlanState(owner, progress.state ?? seed);
      const budgetRoom = (specs: CallSpec[]) => { const summary = budget.summary(); return total(specs) + SAFETY_MICROS <= summary.remainingReservationUsd * 1e6 && summary.calls.length + specs.length <= 64; };
      const pendingCalls = unfinishedCalls(estimate.calls, progress);
      if (!budgetRoom(pendingCalls)) {
        progress.status = "budget_stopped"; progress.state = await loadPlanState(owner); await saveJson(join(directory, "checkpoint.json"), progress);
        console.log(JSON.stringify({ sector: fixture.sector, status: "budget_stopped_before_industry", unfinishedPaidCalls: pendingCalls.length, requiredReservationUsd: usd(total(pendingCalls) + SAFETY_MICROS), budget: budget.summary() })); break;
      }
      async function phase(name: string, specs: CallSpec[], task: () => Promise<void>) {
        if (progress.phases[name]?.status === "complete") return;
        if (!budgetRoom(specs)) throw new Error("BUDGET_PREFLIGHT_STOP");
        progress.phases[name] = { status: "running", startedAt: new Date().toISOString() }; progress.status = "running"; progress.state = await loadPlanState(owner);
        await saveJson(join(directory, "checkpoint.json"), progress);
        active = { specs, cursor: 0, sector: fixture.sector, phase: name, directory, progress };
        try {
          await task(); assert.equal(active.cursor, specs.length, "Expected actual production calls were not completed");
          progress.state = await loadPlanState(owner); progress.phases[name].status = "complete"; progress.phases[name].finishedAt = new Date().toISOString();
          await saveJson(join(directory, "checkpoint.json"), progress);
        } catch (error) {
          progress.status = "failed"; progress.error = safeError(error); progress.phases[name].status = "failed"; progress.phases[name].error = progress.error;
          progress.state = await loadPlanState(owner); await saveJson(join(directory, "checkpoint.json"), progress); throw error;
        } finally { active = null; }
      }
      try {
        for (let index = 0; index < targets.length; index++) await phase(`generate-${index}`, [estimate.calls[index]], async () => {
          const state = await loadPlanState(owner), plan = state.plans[0];
          const input = inputFor(fixture, index, Object.values(plan.sections).map(section => section.markdown));
          await saveJson(join(directory, `document-${index}-input.json`), input);
          const result = await generateSection(config, input);
          assert.equal(result.source, "ai", "Actual section generation failed; fixture output is never substituted");
          assert(result.markdown.length <= MAX_SECTION_CHARS, "Actual section exceeds bounded chain length; stop for editorial review");
          if (index < 2) assert(!money(result.markdown).includes(parseAmount(fixture.price)), "Price leaked into an unrelated source section; review scope before updating");
          else assert(money(result.markdown).includes(parseAmount(fixture.price)), "Generated commercial section must contain the supplied price");
          const at = new Date().toISOString();
          plan.sections[KEYS[index]] = { markdown: result.markdown, html: await renderPlanMarkdown(result.markdown), generatedAt: at }; plan.updatedAt = at;
          await savePlanState(owner, state); await saveJson(join(directory, `document-${index}-generated.json`), { ...result, synthetic: true, provenance: "actual-openai-production-generateSection" });
        });
        await phase("document-manual-edit", [], async () => {
          const current = (await loadPlanState(owner)).plans[0].sections[KEYS[0]];
          const markdown = `${current.markdown}\n\n수동 편집 기록: ${fixture.nextAction}.`;
          await saveDocumentEdit(owner, { planId, key: KEYS[0], baseGeneratedAt: current.generatedAt, action: "save", markdown, html: await renderPlanMarkdown(markdown) });
        });
        await phase("deck-generate", estimate.calls.slice(3, 5), async () => {
          const state = await loadPlanState(owner), source = { ...deckSource(state.plans[0], state.business), presentation: presentation(fixture) };
          await saveJson(join(directory, "deck-input.json"), source);
          const deck = await buildDeckPlan(config, source, async event => {
            await saveJson(join(directory, "deck-event.json"), event);
            assert(event.attempt <= 1 && !["repairing", "failed"].includes(event.stage), `DECK_STOP_${event.code ?? event.stage}`);
          }, { saveDraft: draft => saveJson(join(directory, "deck-unreviewed-draft.json"), { provenance: "actual-generated-not-yet-reviewed", draft }) });
          assert(deck?.blueprint && deck.slides.length >= 8, "Actual deck generation/review did not finish");
          const token = randomUUID(), at = new Date().toISOString();
          const latest = await loadPlanState(owner);
          latest.plans[0].answers.__deck_job = { token, runId: "industry-ai-live", fingerprint: deckFingerprint(source), presentation: presentation(fixture), status: "complete", phase: "ready", attempt: 1, updatedAt: at, result: deck };
          await savePlanState(owner, latest);
          await saveProposalEditor(owner, planId, { type: "initialize", generationToken: token, expectedRevision: 0, requestId: randomUUID() });
          progress.initialDeckGeneratedByAI = true;
          await saveJson(join(directory, "deck-generated.json"), { provenance: "actual-openai-generated-and-reviewed", deck });
        });
        await phase("ppt-manual-edit", [], async () => {
          const saved = (await loadProposalEditor(owner, planId)).saved!;
          const id = saved.document.deck.slides[0].id!;
          await saveProposalEditor(owner, planId, { type: "save", expectedRevision: saved.revision, requestId: randomUUID(), edits: { [id]: { text: { title: `${fixture.name} 검토안` }, alignment: { title: "left" } } } });
        });
        await phase("document-update", estimate.calls.slice(5, 7), async () => {
          const state = await loadPlanState(owner), old = state.plans[0].sections[KEYS[2]], untouched = state.plans[0].sections[KEYS[0]];
          const payload: DocumentRefreshPayload = { businessName: fixture.name, businessDescription: business(fixture).description, sector: fixture.sector, purpose: "sales", stage: "startup", fields: [{ key: "business", value: fixture.offer, basis: "user" }, { key: "customer", value: fixture.customer, basis: "user" }, { key: "offer", value: fixture.offer, basis: "user" }, { key: "price", value: fixture.nextPrice, basis: "user" }], financialReference: "미입력 비용은 0원이 아닙니다. 손익 계산과 실제 매출은 제공되지 않았습니다.", sections: [{ key: KEYS[2], chapterTitle: targets[2].chapter.title, sectionTitle: targets[2].section.title, markdown: old.markdown }] };
          await saveJson(join(directory, "document-update-input.json"), payload);
          const draft = documentRefreshResultSchema.parse(await createDocumentRefreshRuntime(config).generate(payload));
          const markdown = draft.sections[0].markdown;
          assert(money(markdown).includes(parseAmount(fixture.nextPrice)) && !money(markdown).includes(parseAmount(fixture.price)), "New price missing or previous price retained");
          assert.deepEqual((await loadPlanState(owner)).plans[0].sections[KEYS[2]], old, "Draft must not overwrite before explicit test approval");
          await saveJson(join(directory, "document-update-approved.json"), { syntheticApproval: true, draft });
          await saveDocumentEdit(owner, { planId, key: KEYS[2], baseGeneratedAt: old.generatedAt, action: "save", markdown, html: await renderPlanMarkdown(markdown) });
          const approved = await loadPlanState(owner);
          approved.plans[0].answers[KEYS[2]] = { supplied_conditions: sourceText({ ...fixture, price: fixture.nextPrice }, 2) };
          await savePlanState(owner, approved);
          assert.deepEqual((await loadPlanState(owner)).plans[0].sections[KEYS[0]], untouched, "Unrelated manual document edit must remain");
        });
        if (!progress.phases["ppt-update"]?.status) {
          const preview = await previewProposalRewrite(owner, planId, createProposalRewriteRuntime(config));
          const batches = Math.ceil(preview.impact.affected.length / 4);
          assert(batches > 0 && batches <= estimate.batches);
          await saveJson(join(directory, "ppt-update-preview.json"), preview);
          await phase("ppt-update", estimate.calls.slice(7, 7 + batches * 2), async () => {
            const before = (await loadProposalEditor(owner, planId)).saved!;
            const id = randomUUID(), result = await runProposalRewrite(owner, planId, { type: "generate", id, hash: preview.hash, consent: true }, createProposalRewriteRuntime(config));
            assert.equal(result.rewrite?.status, "ready", result.rewrite?.error ?? "Rewrite was not reviewed successfully");
            assert.deepEqual(documentContent(result.document), documentContent(before.document), "PPT draft must remain separate before approval");
            const choices = Object.fromEntries(preview.impact.affected.filter(item => item.textConflict).map(item => [item.slideId, "keep_manual" as const]));
            await saveJson(join(directory, "ppt-update-approved.json"), { syntheticApproval: true, choices, rewrite: result.rewrite });
            const applied = await runProposalRewrite(owner, planId, { type: "apply", id, expectedRevision: result.revision, choices });
            assert.deepEqual(applied.document.edits, before.document.edits, "Manual PPT text/alignment must survive update");
            progress.expectedSourceChanged = Object.keys(choices).length > 0;
            assert.equal((await loadProposalEditor(owner, planId)).sourceChanged, progress.expectedSourceChanged, "Retained old/manual content must not be marked current");
          });
        }
        await phase("restore-and-render", [], async () => {
          const state = await loadPlanState(owner), path = join(directory, "saved-state.json"); await saveJson(path, state);
          const restored = await readJson<ServerPlanState>(path); assert(restored);
          const restoredOwner = `${owner}-restored`;
          await savePlanState(restoredOwner, normalizeState(restored));
          const loaded = await loadPlanState(restoredOwner); assert.deepEqual(loaded, JSON.parse(JSON.stringify(state)), "JSON restore must preserve all serialized values");
          const saved = (await loadProposalEditor(restoredOwner, planId)).saved!;
          assert(saved);
          assert.equal((await loadProposalEditor(restoredOwner, planId)).sourceChanged, progress.expectedSourceChanged ?? false);
          const deck = renderableProposal(saved.document);
          const { renderDeckPptx } = await import("../lib/plan-builder/deck-render"), { pickDeckTheme } = await import("../lib/plan-builder/deck-themes");
          const { renderPdf, renderDocx } = await import("../lib/delivery/document-renderer");
          const pptx = await renderDeckPptx(deck, pickDeckTheme("일반 사업계획서", fixture.name, business(fixture).description));
          const zip = await JSZip.loadAsync(pptx); assert(zip.file("ppt/presentation.xml"));
          const xml = (await Promise.all(Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path)).map(path => zip.file(path)!.async("string")))).join("\n");
          assert(xml.includes(`${fixture.name} 검토안`), "Manual text missing from editable PPTX");
          const document = { id: planId, title: `${fixture.name} 검증용 요약 계획서`, type: "실제 AI 생성 3항목", versionLabel: "가상 검증", markdown: targets.map(target => `## ${target.section.title}\n\n${loaded.plans[0].sections[target.key].markdown}`).join("\n\n") };
          const project = { title: fixture.name, sector: fixture.sector, model: "가상 검증", customer: fixture.customer, generatedAt: new Date().toISOString(), sample: true };
          const font = await readFile(join(ROOT, "public/fonts/NanumGothic-Regular.ttf"));
          const pdf = await renderPdf([document], project, font), docx = await renderDocx([document], project, font);
          progress.outputHashes = {};
          for (const [name, bytes] of [["updated.pptx", pptx], ["document.pdf", pdf], ["document.docx", docx]] as const) { await writeFile(join(directory, name), bytes, { mode: 0o600 }); progress.outputHashes[name] = createHash("sha256").update(bytes).digest("hex"); }
          await saveJson(join(directory, "result.json"), { status: "actual-ai-chain-complete-not-release-approved", synthetic: true, documentSections: 3, slides: deck.slides.length, outputs: progress.outputHashes, initialDeckGeneratedByAI: progress.initialDeckGeneratedByAI, templateGeneratedResultsReused: false, remainingGates: ["visual inspection of rendered slides and document pages", "full detailed business plan chapters", "browser editing and reconnect/download", "remote auth/PG/Workflow", "all five presentation purposes"] });
        });
        progress.status = "complete"; await saveJson(join(directory, "checkpoint.json"), progress);
        console.log(JSON.stringify({ sector: fixture.sector, status: "complete", budget: budget.summary() }));
      } catch (error) {
        if (safeError(error) === "BUDGET_PREFLIGHT_STOP") progress.status = "budget_stopped";
        else progress.status = "failed";
        progress.error = safeError(error); progress.state = await loadPlanState(owner); await saveJson(join(directory, "checkpoint.json"), progress);
        throw error; // Never continue to another sector after a partial or failed lifecycle.
      }
    }
  } finally { active = null; globalThis.fetch = async () => { throw new Error("NETWORK_DISABLED_AFTER_LIVE"); }; try { await saveJson(join(OUTPUT, "budget-summary.json"), budget.summary()); } finally { budget.close(); } }
}

try { await main(); }
catch (error) { console.error(safeError(error)); process.exitCode = 1; }
finally { globalThis.fetch = transport; for (const [key, value] of Object.entries(priorEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
