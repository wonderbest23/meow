import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { PRELAUNCH_ORIGIN, PRELAUNCH_REF, assertPrelaunchTarget, prelaunchScope } from "./prelaunch-db-safety";
import { seedBusinessRewriteFixture } from "./proposal-rewrite-fixture";
import { hashIdentityToken, userProjectToken } from "../lib/identity-tokens";
import { loadPlanState, savePlanState } from "../lib/plan-builder/plan-server-store";
import { loadProposalEditor, saveProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { renderableProposal } from "../lib/plan-builder/proposal-revision";
import { renderDeckPptx } from "../lib/plan-builder/deck-render";
import { pickDeckTheme } from "../lib/plan-builder/deck-themes";
import { loadOperatingRecords, saveOperatingRecords } from "../lib/plan-builder/operating-records-service";
import { comparePeriods, oldInput, previousPeriod, referenceFor, reportIsCurrent, reportMarkdown, type PeriodInput } from "../lib/plan-builder/operating-records";

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
assertPrelaunchTarget(env.SUPABASE_URL ?? "", process.argv[2]);
assert(env.SUPABASE_SERVICE_ROLE_KEY, "Service credentials must be configured locally");
// Only DB credentials are loaded. Existing app flags and paid-provider keys are not inherited.
Object.assign(process.env, {
  SUPABASE_URL: PRELAUNCH_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  AUTH_PROJECT_SECRET: env.AUTH_PROJECT_SECRET ?? "", PERSISTENCE_MODE: "supabase",
  PLAN_ACCOUNT_LINKING_ENABLED: "false", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false",
  OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
});
const runId = randomBytes(8).toString("hex"), scope = prelaunchScope(runId);
const output = new URL(`../artifacts/prelaunch-db/${runId}/`, import.meta.url);
await mkdir(output, { recursive: true });
const budgetFile = new URL("../artifacts/synthetic-ai-launch/budget.json", import.meta.url);
const budgetBefore = await readFile(budgetFile, "utf8");
const checks: Array<{ name: string; status: "passed" | "failed"; detail?: string }> = [];
const missing: Array<{ migration: string; object: string }> = [];
const accounts: Array<{ id: string; email: string; owner: string }> = [];
const errors: string[] = [];
const transport = globalThis.fetch;
let requests = 0;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
  const body = text ? JSON.parse(text) as Record<string, unknown> : undefined;
  scope.assertRequest(new URL(request.url), request.method, body);
  assert(++requests <= 240, "Prelaunch request budget exceeded");
  return transport(request, { redirect: "error", signal: AbortSignal.timeout(30_000) });
};
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(PRELAUNCH_ORIGIN, env.SUPABASE_SERVICE_ROLE_KEY, authOptions);
const sessionClient = () => createClient(PRELAUNCH_ORIGIN, env.SUPABASE_SERVICE_ROLE_KEY, authOptions);
const safeError = (error: unknown) => {
  let message = error instanceof Error ? error.message : "check_failed";
  for (const value of [env.SUPABASE_SERVICE_ROLE_KEY, env.AUTH_PROJECT_SECRET].filter(Boolean)) message = message.replaceAll(value, "[redacted]");
  return message.replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted-token]").slice(0, 700);
};
function dbOkay(error: { code?: string; status?: number } | null) {
  if (error) throw new Error(`Supabase request failed (${error.code ?? error.status ?? "unknown"})`);
}
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); checks.push({ name, status: "passed" }); console.log(`[PASS] ${name}`); }
  catch (error) { checks.push({ name, status: "failed", detail: safeError(error) }); throw error; }
}
async function readWithToken(token: string, owner: string) {
  const response = await fetch(`${PRELAUNCH_ORIGIN}/rest/v1/plan_states?owner_hash=eq.${owner}&select=data`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  assert(response.ok ? Array.isArray(body) && body.length === 0 : [401, 403].includes(response.status), "Authenticated clients must not read server-owned plan rows directly");
}

try {
  await check("read-only schema inventory without existing user data", async () => {
    const response = await fetch(`${PRELAUNCH_ORIGIN}/rest/v1/`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/openapi+json" } });
    assert.equal(response.status, 200);
    const schema = await response.json();
    assert(schema.paths?.["/plan_states"], "Base plan persistence table is missing");
    for (const [migration, object] of [
      ["0027", "/plan_owner_claims"], ["0027", "/rpc/commit_plan_state"], ["0027", "/rpc/claim_plan_state"],
      ["0029", "/rpc/admin_generation_jobs"], ["0030", "/rpc/ensure_plan_project"],
      ["0030", "/rpc/publish_landing_snapshot"], ["0030", "/rpc/rollback_landing_snapshot"],
    ]) if (!schema.paths?.[object]) missing.push({ migration, object });
    for (const [migration, table, column] of [
      ["0028", "plan_owner_claims", "legacy_completed_at"], ["0029", "llm_usage", "model"],
      ["0029", "llm_usage", "elapsed_ms"], ["0029", "llm_usage", "failure_code"],
      ["0030", "landing_sites", "published_slug"], ["0030", "landing_versions", "source_updated_at"],
    ]) if (!schema.definitions?.[table]?.properties?.[column]) missing.push({ migration, object: `${table}.${column}` });
  });

  const password = `PrelaunchOnly!${randomUUID()}`;
  const aClient = sessionClient(), bClient = sessionClient();
  let tokenA = "", tokenB = "";
  await check("two synthetic accounts sign in with separate identities", async () => {
    for (const email of scope.emails) {
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic: true, purpose: "prelaunch-db-verification", runId } });
      dbOkay(result.error); assert(result.data.user);
      const owner = hashIdentityToken(userProjectToken(result.data.user.id));
      scope.owners.add(owner); accounts.push({ id: result.data.user.id, email, owner });
      assert.equal((await loadPlanState(owner)).plans.length, 0, "Refusing to overwrite a nonempty owner");
    }
    const a = await aClient.auth.signInWithPassword({ email: accounts[0].email, password });
    const b = await bClient.auth.signInWithPassword({ email: accounts[1].email, password });
    dbOkay(a.error); dbOkay(b.error);
    assert.equal(a.data.user?.id, accounts[0].id); assert.equal(b.data.user?.id, accounts[1].id);
    assert(a.data.session && b.data.session); tokenA = a.data.session.access_token; tokenB = b.data.session.access_token;
  });
  const owner = accounts[0].owner, other = accounts[1].owner, planId = `${scope.prefix}b2b`;
  await check("B2B document and editable proposal persist in hosted DB", async () => {
    await seedBusinessRewriteFixture(owner, planId);
    const view = await loadProposalEditor(owner, planId);
    assert.equal(view.saved?.revision, 1); assert.equal(view.business?.documents.current, 9);
    assert.equal(view.sourceChanged, false); assert.equal(view.saved.document.deck.slides.length, 12);
    assert.equal((await loadPlanState(other)).plans.length, 0);
  });
  await check("authenticated clients cannot read either owner's raw plan row", async () => {
    await readWithToken(tokenA, owner); await readWithToken(tokenB, owner);
  });
  await check("another account cannot open proposal or operating records", async () => {
    await assert.rejects(loadProposalEditor(other, planId), error => (error as { status?: number }).status === 404);
    await assert.rejects(loadOperatingRecords(other, planId), error => (error as { status?: number }).status === 404);
  });
  await check("authenticated direct update cannot overwrite server-owned data", async () => {
    const before = await loadPlanState(owner);
    const response = await fetch(`${PRELAUNCH_ORIGIN}/rest/v1/plan_states?owner_hash=eq.${owner}`, {
      method: "PATCH", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ owner_hash: owner, title: "QA unauthorized write", data: before }),
    });
    const body = await response.json();
    assert(response.ok ? Array.isArray(body) && body.length === 0 : [401, 403].includes(response.status));
    assert.deepEqual(await loadPlanState(owner), before);
  });

  const initial = (await loadProposalEditor(owner, planId)).saved!;
  const slideId = initial.document.deck.slides[0].id;
  const editedTitle = "출시 전 검증용 B2B 제안서";
  const edit = { type: "save" as const, requestId: randomUUID(), expectedRevision: 1, edits: {
    [slideId]: { text: { title: editedTitle }, layout: { title: { x: .6, y: 1.9, w: 8.5, h: 1.1 } } },
  } };
  await check("proposal text and position edits save once despite request replay", async () => {
    const first = await saveProposalEditor(owner, planId, edit);
    const replay = await saveProposalEditor(owner, planId, edit);
    assert.equal(first.saved?.revision, 2); assert.equal(replay.saved?.revision, 2);
    assert.deepEqual(replay.saved?.document.edits, edit.edits);
  });
  await check("stale-tab edit is rejected without losing the saved version", async () => {
    await assert.rejects(saveProposalEditor(owner, planId, { ...edit, requestId: randomUUID() }), error => (error as { code?: string }).code === "revision_conflict");
    assert.equal((await loadProposalEditor(owner, planId)).saved?.revision, 2);
  });
  await check("simultaneous proposal edits have exactly one successful writer", async () => {
    const results = await Promise.allSettled(["A", "B"].map(label => saveProposalEditor(owner, planId, {
      ...edit, expectedRevision: 2, requestId: randomUUID(), edits: { [slideId]: { text: { title: `QA concurrent ${label}` } } },
    })));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const rejected = results.find(result => result.status === "rejected");
    assert(rejected?.status === "rejected"); assert.equal(rejected.reason.code, "revision_conflict");
    assert.equal((await loadProposalEditor(owner, planId)).saved?.revision, 3);
  });
  await check("restoring a proposal revision preserves its text and layout", async () => {
    const restored = await saveProposalEditor(owner, planId, { type: "restore", requestId: randomUUID(), expectedRevision: 3, revision: 2 });
    assert.equal(restored.saved?.revision, 4); assert.deepEqual(restored.saved?.document.edits, edit.edits);
    assert.equal(restored.saved?.history.length, 3);
  });

  const input: PeriodInput = { start: "2026-08-01", end: "2026-08-07", metrics: { inquiries: null, orders: 0, revenue: 100000, expenses: 50000 }, feedback: "가상 검증용 고객 반응", keep: "견적 기준", change: "응답 시간", nextAction: "문의 응답 시간 기록", successCriterion: "기록 누락 없이 일주일 확인" };
  const firstPeriod = randomUUID(), secondPeriod = randomUUID(), reportId = randomUUID();
  await check("period records compare null and zero correctly and archive once", async () => {
    await saveOperatingRecords(owner, planId, { action: "save", id: firstPeriod, expectedRevision: null, input });
    let result = await saveOperatingRecords(owner, planId, { action: "save", id: secondPeriod, expectedRevision: null, input: { ...input, start: "2026-08-08", end: "2026-08-14", metrics: { inquiries: 4, orders: 2, revenue: 200000, expenses: 70000 } } });
    const current = result.records.periods[0], baseline = previousPeriod(result.records.periods, current);
    const comparison = comparePeriods(current, baseline);
    assert.equal(comparison.find(row => row.key === "revenue")?.delta, 100000);
    assert.equal(comparison.find(row => row.key === "inquiries")?.delta, null);
    assert.equal(comparison.find(row => row.key === "orders")?.percent, null);
    const command = { action: "report" as const, id: reportId, reference: referenceFor(current, baseline) };
    await saveOperatingRecords(owner, planId, command);
    result = await saveOperatingRecords(owner, planId, command);
    assert.equal(result.records.reports.length, 1);
    assert.equal(result.records.reports[0].source, "user-records");
    await writeFile(new URL("operating-report.md", output), reportMarkdown(result.records.reports[0]));
  });
  await check("later period edits do not rewrite archived report snapshots", async () => {
    const before = (await loadOperatingRecords(owner, planId)).records;
    const current = before.periods.find(period => period.id === secondPeriod)!;
    const command = { action: "save" as const, id: secondPeriod, expectedRevision: 1, input: { ...oldInput(current), metrics: { ...current.metrics, revenue: 250000 } } };
    const after = (await saveOperatingRecords(owner, planId, command)).records;
    assert.deepEqual(after.reports, before.reports); assert.equal(reportIsCurrent(after, after.reports[0]), false);
    await assert.rejects(saveOperatingRecords(owner, planId, { ...command, input: { ...command.input, metrics: { ...command.input.metrics, revenue: 300000 } } }), error => (error as { code?: string }).code === "PERIOD_CHANGED");
  });

  await check("wrong password, refresh and logout/relogin preserve business data", async () => {
    const before = await loadPlanState(owner);
    const wrong = await sessionClient().auth.signInWithPassword({ email: accounts[0].email, password: "WrongSyntheticPassword!" });
    assert(wrong.error && !wrong.data.session);
    const refreshed = await aClient.auth.refreshSession(); dbOkay(refreshed.error); assert(refreshed.data.session);
    dbOkay((await aClient.auth.signOut({ scope: "local" })).error);
    assert.equal((await aClient.auth.getSession()).data.session, null);
    const reconnect = sessionClient();
    const loggedIn = await reconnect.auth.signInWithPassword({ email: accounts[0].email, password });
    dbOkay(loggedIn.error); assert.equal(loggedIn.data.user?.id, accounts[0].id);
    const restoredOwner = hashIdentityToken(userProjectToken(loggedIn.data.user!.id));
    assert.equal(restoredOwner, owner); assert.deepEqual(await loadPlanState(restoredOwner), before);
    dbOkay((await reconnect.auth.signOut({ scope: "local" })).error);
    dbOkay((await bClient.auth.signOut({ scope: "local" })).error);
  });
  await check("reconnected DB proposal renders to editable PPTX with saved title", async () => {
    const saved = (await loadProposalEditor(owner, planId)).saved!;
    assert.equal(saved.revision, 4);
    const deck = renderableProposal(saved.document);
    const bytes = await renderDeckPptx(deck, pickDeckTheme("", deck.brandName, ""));
    await writeFile(new URL("reconnected-proposal.pptx", output), bytes);
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    assert.equal(slides.length, 12);
    assert((await zip.file("ppt/slides/slide1.xml")!.async("string")).includes(editedTitle));
  });
  await check("unrelated business in the same account survives later saves", async () => {
    const state = await loadPlanState(owner);
    const plan = structuredClone(state.plans[0]); plan.id = `${scope.prefix}second`; plan.title = "QA second business";
    await savePlanState(owner, { ...state, plans: [...state.plans, plan] });
    const final = await loadPlanState(owner);
    assert.equal(final.plans.length, 2); assert.deepEqual(final.plans.find(item => item.id === planId), state.plans[0]);
    assert.equal((await loadPlanState(other)).plans.length, 0);
  });
} catch (error) {
  errors.push(safeError(error)); process.exitCode = 1;
} finally {
  globalThis.fetch = transport;
  const unchangedBudget = await readFile(budgetFile, "utf8") === budgetBefore;
  if (!unchangedBudget) { errors.push("AI budget changed during DB verification"); process.exitCode = 1; }
  const report = {
    runId, project: "newapp", projectRef: PRELAUNCH_REF, completedAt: new Date().toISOString(), checks, errors,
    missingSchema: missing, accounts, syntheticPlanPrefix: scope.prefix, requests,
    deletedRecords: 0, schemaChanges: 0, paidAiCalls: 0, payments: 0, unchangedBudget,
    retainedSyntheticData: true, accountLinkingEnabled: false, releaseReady: false,
    coverage: "Hosted Supabase auth and application service persistence, not browser/Google/PG/Cloudflare verification. PPT renders from a synthetic fixture, not a new AI call.",
  };
  await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ runId, passed: checks.filter(check => check.status === "passed").length, failed: checks.filter(check => check.status === "failed").length, errors, missingSchema: missing, requests, report: new URL("report.json", output).pathname }, null, 2));
}
