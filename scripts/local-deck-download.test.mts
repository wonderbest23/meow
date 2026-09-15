import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { LAB_URL, LAB_DB_URL, localCredentials } from "./local-account-lab.mts";
import { syntheticDeckInput } from "./synthetic-ai-fixture";
import { normalizeState, type ServerPlanState } from "../lib/plan-builder/plan-server-store";
import { deckFingerprint, deckSource } from "../lib/plan-builder/deck-job";
import { DECK_JOB_KEY, readDeckJob, type DeckJob } from "../lib/plan-builder/deck-job-types";
import type { DeckPlan } from "../lib/plan-builder/deck-plan";
import { createPlanOrder, markPlanOrderFailed, markPlanOrderPaid, type PlanProduct } from "../lib/payments/plan-orders";

const credentials = await localCredentials();
Object.assign(process.env, {
  PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey,
  OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", OPERATING_AI_ENABLED: "false", PAYMENTS_ENABLED: "false",
});
const transport = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  assert([LAB_URL, LAB_DB_URL].includes(url.origin), "Only isolated local app and Supabase requests are allowed");
  return transport(input, init);
};
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = Date.now().toString(36);
const root = fileURLToPath(new URL("../artifacts/local-deck-download/", import.meta.url));
const evidence = fileURLToPath(new URL("../artifacts/synthetic-ai-launch/", import.meta.url));
const password = `LocalOnly!${randomUUID()}`;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const userHash = (id: string) => hash(createHmac("sha256", credentials.authSecret).update(`today-startup:${id}`).digest("base64url"));
const checks: Array<{ name: string; status: "passed" | "failed"; elapsedMs: number; error?: string }> = [];
const downloads: Array<{ file: string; bytes: number; sha256: string; slides: number }> = [];
const parser = new XMLParser({ ignoreAttributes: false });
let clientSequence = 0;

class Client {
  cookies = new Map<string, string>();
  ip = `192.0.2.${100 + (++clientSequence)}`;
  constructor(copy?: Client) { if (copy) this.cookies = new Map(copy.cookies); }
  async request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${LAB_URL}${path}`, {
      method, redirect: "manual", signal: AbortSignal.timeout(90_000),
      headers: { "Content-Type": "application/json", "X-Forwarded-For": this.ip, Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";", 1)[0]; const index = pair.indexOf("=");
      const key = pair.slice(0, index); const value = pair.slice(index + 1);
      if (!value || /Max-Age=0/i.test(line)) this.cookies.delete(key); else this.cookies.set(key, value);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const data = response.headers.get("content-type")?.includes("application/json") ? JSON.parse(bytes.toString()) : null;
    return { status: response.status, headers: response.headers, bytes, data };
  }
  async state() {
    const result = await this.request("/api/plan/state"); assert.equal(result.status, 200);
    return result.data as ServerPlanState & { authenticated: boolean; ownerKey: string };
  }
  async login(email: string) { assert.equal((await this.request("/api/auth/login", "POST", { email, password, remember: true })).status, 200); }
}

async function check(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  try { await fn(); checks.push({ name, status: "passed", elapsedMs: Date.now() - started }); console.log(`[PASS] ${name}`); }
  catch (error) {
    checks.push({ name, status: "failed", elapsedMs: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 600) : "failed" });
    throw error;
  }
}
async function seed(owner: string, state: ServerPlanState) {
  const { error } = await db.from("plan_states").upsert({ owner_hash: owner, title: state.business.name, plan_type: syntheticDeckInput.planType, data: state, updated_at: new Date().toISOString() });
  assert.equal(error, null);
}
async function stored(owner: string) {
  const { data, error } = await db.from("plan_states").select("data").eq("owner_hash", owner).maybeSingle();
  assert.equal(error, null); return data?.data as ServerPlanState | undefined;
}
async function createAccount(suffix: string) {
  const email = `qa-deck-${runId}-${suffix}@example.invalid`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(error, null); assert(data.user); return { email, id: data.user.id };
}
async function usageCount() {
  const { count, error } = await db.from("llm_usage").select("id", { count: "exact", head: true });
  assert.equal(error, null); assert.notEqual(count, null); return count;
}
async function orderStatus(orderId: string, status: string) {
  const { error } = await db.from("payment_orders").update({ status, updated_at: new Date().toISOString() }).eq("order_id", orderId);
  assert.equal(error, null);
}
async function verifyDownload(client: Client, path: string, name: string, slideCount: number) {
  const result = await client.request(path);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.match(result.headers.get("content-disposition") ?? "", /^attachment;.*filename\*=UTF-8''/);
  assert.match(result.headers.get("cache-control") ?? "", /private, no-store/);
  const zip = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
  const slides = Object.keys(zip.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort();
  const notes = Object.keys(zip.files).filter(path => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)).sort();
  assert.equal(slides.length, slideCount); assert.equal(notes.length, slideCount);
  const contentTypes = parser.parse(await zip.file("[Content_Types].xml")!.async("string"));
  const overrides = [contentTypes.Types.Override].flat();
  for (const entry of overrides) assert(zip.file(entry["@_PartName"].replace(/^\//, "")), `Missing package part ${entry["@_PartName"]}`);
  const content: Record<string, string> = {};
  for (const path of [...slides, ...notes]) content[path] = await zip.file(path)!.async("string");
  assert(Object.values(content).some(xml => xml.includes("QA 메뉴 소개글")), "Downloaded slides must contain the real synthetic business");
  const file = `${runId}-${name}.pptx`;
  await writeFile(`${root}${file}`, result.bytes, { mode: 0o600 });
  downloads.push({ file, bytes: result.bytes.length, sha256: hash(result.bytes), slides: slides.length });
  return content;
}

try {
  await mkdir(root, { recursive: true });
  const manifest = JSON.parse(await readFile(`${evidence}manifest.json`, "utf8"));
  const deck = JSON.parse(await readFile(`${evidence}deck-plan.json`, "utf8")) as DeckPlan;
  assert.equal(manifest.synthetic, true); assert.equal(manifest.productionDatabase, false);
  assert.equal(manifest.fixtureHash, hash(JSON.stringify({ input: syntheticDeckInput, model: manifest.model, version: "launch-qa-v1" })));
  assert.equal(deck.slides.length, 9);
  const budgetBefore = await readFile(`${evidence}budget.json`);
  const usageBefore = await usageCount();
  const a = await createAccount("a"); const b = await createAccount("b");
  const owner = userHash(a.id);
  const guest = new Client(); await guest.state();
  const guestToken = guest.cookies.get("venture_guest"); assert(guestToken);
  const guestOwner = hash(guestToken); const oldGuest = new Client(guest);
  const now = new Date().toISOString(); const planId = `plan_deck_${runId}`;
  // Import the reviewed result into local storage; this does not exercise Workflow generation.
  // Legacy section labels differ from the harness, but every source paragraph is preserved.
  const keys = ["overview/summary", "market/personas", "strategy/price", "financials/expenses", "summary/executive"];
  const source = normalizeState({ business: { name: syntheticDeckInput.businessName, description: syntheticDeckInput.businessDescription, role: "", region: "", industry: "", stage: "" }, activePlanId: planId,
    plans: [{ id: planId, title: syntheticDeckInput.businessName, planType: syntheticDeckInput.planType, createdAt: now, updatedAt: now, answers: {},
      sections: Object.fromEntries(keys.map((key, index) => [key, { markdown: syntheticDeckInput.sections[index].markdown, html: "", generatedAt: now, edited: true, locked: true }])) }],
  });
  const localSource = deckSource(source.plans[0], source.business);
  assert.deepEqual(localSource.sections.map(section => section.markdown), syntheticDeckInput.sections.map(section => section.markdown));
  const job: DeckJob = { token: randomUUID(), runId: `import-${runId}`, fingerprint: deckFingerprint(localSource), status: "complete", phase: "ready", updatedAt: now, attempt: 1, result: deck };
  source.plans[0].answers[DECK_JOB_KEY] = { ...job };
  await seed(guestOwner, source);
  const path = `/api/plan/deck?planId=${planId}`; const download = `${path}&download=1`;
  const order = (product: PlanProduct = "plan", targetPlan = planId) => createPlanOrder({ ownerId: a.id, guestTokenHash: owner, customerEmail: a.email, planId: targetPlan, planType: source.plans[0].planType, product });
  const pay = (orderId: string) => markPlanOrderPaid({ orderId, tid: `local-simulated-${orderId}`, raw: { synthetic: true, noPgCall: true } });
  let paidOrder = ""; let firstContent: Record<string, string> = {};

  await check("anonymous completed deck requires login", async () => {
    assert.equal((await guest.request(download)).status, 401);
    assert.deepEqual((await stored(guestOwner))?.plans[0], source.plans[0]);
  });
  await check("login transfers the same business and reviewed nine-slide result", async () => {
    await guest.login(a.email); const state = await guest.state();
    assert.equal(state.authenticated, true); assert.equal(state.activePlanId, planId);
    assert.deepEqual(state.plans, source.plans); assert.deepEqual(state.business, source.business);
    assert.equal(await stored(guestOwner), undefined);
    assert.equal((await guest.request(download)).status, 402);
  });
  await check("old guest and another account cannot read the transferred deck", async () => {
    assert.equal((await oldGuest.request(download)).status, 404);
    const other = new Client(); await other.login(b.email);
    assert.equal((await other.request(download)).status, 404);
    assert.equal((await other.request("/api/plan/deck", "POST", { planId, background: true })).status, 402);
  });
  await check("pending cancelled and failed local orders never unlock downloads", async () => {
    const pending = await order();
    assert.equal((await guest.request(download)).status, 402);
    await orderStatus(pending.orderId, "canceled");
    assert.equal((await guest.request(download)).status, 402);
    const failed = await order();
    await markPlanOrderFailed({ orderId: failed.orderId, code: "local_test", message: "Simulated failure without PG" });
    assert.equal((await guest.request(download)).status, 402);
  });
  await check("homepage purchase and another plan purchase do not unlock this PPT", async () => {
    await pay((await order("homepage")).orderId);
    await pay((await order("plan", `${planId}_other`)).orderId);
    assert.equal((await guest.request(download)).status, 402);
  });
  await check("paid entitlement enables real PPT binary with nine slides and notes", async () => {
    paidOrder = (await order()).orderId; await pay(paidOrder);
    const status = await guest.request(path); assert.equal(status.status, 200);
    assert.equal(status.data.job.ready, true); assert.equal(status.data.stale, false);
    assert.equal(status.data.generationEnabled, false); assert.equal(status.data.job.result, undefined);
    firstContent = await verifyDownload(guest, download, "first-download", deck.slides.length);
  });
  await check("duplicate payment acknowledgements preserve the first transaction", async () => {
    const before = await db.from("payment_orders").select("status,payment_key,confirmed_at,raw_response").eq("order_id", paidOrder).single();
    assert.equal(before.error, null);
    await Promise.all([pay(paidOrder), pay(paidOrder)]);
    await assert.rejects(() => markPlanOrderPaid({ orderId: paidOrder, tid: "different-local-transaction", raw: {} }), /PAYMENT_STATE_CONFLICT/);
    const after = await db.from("payment_orders").select("status,payment_key,confirmed_at,raw_response").eq("order_id", paidOrder).single();
    assert.equal(after.error, null); assert.deepEqual(after.data, before.data);
  });
  await check("duplicate generation clicks reuse the same completed job", async () => {
    const results = await Promise.all([guest.request("/api/plan/deck", "POST", { planId, background: true }), guest.request("/api/plan/deck", "POST", { planId, background: true })]);
    for (const result of results) { assert.equal(result.status, 200); assert.equal(result.data.job.token, job.token); assert.equal(result.data.job.ready, true); }
    assert.deepEqual(readDeckJob((await stored(owner))!.plans[0].answers), job);
  });
  await check("late failure notification cannot revoke a completed order", async () => {
    await markPlanOrderFailed({ orderId: paidOrder, code: "late-local-test", message: "Late simulated callback" });
    assert.equal((await guest.request(path)).status, 200);
    const { data, error } = await db.from("payment_orders").select("status").eq("order_id", paidOrder).single();
    assert.equal(error, null); assert.equal(data.status, "done");
  });
  await check("logout removes access and fresh login restores identical slide contents", async () => {
    assert.equal((await guest.request("/api/auth/logout", "POST")).status, 200);
    assert.equal(guest.cookies.has("venture_access"), false); assert.equal(guest.cookies.has("venture_refresh"), false);
    assert.equal((await guest.request(download)).status, 404);
    const reconnect = new Client(); await reconnect.login(a.email);
    assert.deepEqual((await reconnect.state()).plans, source.plans);
    assert.deepEqual(await verifyDownload(reconnect, download, "reconnect-download", deck.slides.length), firstContent);
    await guest.login(a.email);
  });
  await check("expired access token refresh preserves payment and download access", async () => {
    guest.cookies.set("venture_access", "expired-local-fixture");
    assert.deepEqual(await verifyDownload(guest, download, "refreshed-download", deck.slides.length), firstContent);
    assert.notEqual(guest.cookies.get("venture_access"), "expired-local-fixture");
  });
  await check("document edits flag stale PPT without deleting the saved result", async () => {
    const state = await guest.state(); const plan = state.plans.find(plan => plan.id === planId)!;
    plan.updatedAt = new Date(Date.now() + 1000).toISOString();
    plan.sections[keys[0]] = { ...plan.sections[keys[0]], markdown: `${plan.sections[keys[0]].markdown}\n로컬 수정 검증`, generatedAt: plan.updatedAt };
    assert.equal((await guest.request("/api/plan/state", "PUT", state)).status, 200);
    assert.equal((await guest.request(path)).data.stale, true);
    assert.equal((await guest.request(download)).status, 409);
    const retry = await guest.request("/api/plan/deck", "POST", { planId, background: true });
    assert.equal(retry.status, 503); assert.equal(retry.data.code, "ppt_preparing");
    assert.deepEqual(readDeckJob((await stored(owner))!.plans[0].answers), job);
    await seed(owner, source);
  });
  await check("refund revokes access even after a previous successful download", async () => {
    await orderStatus(paidOrder, "refunded");
    assert.equal((await guest.request(path)).status, 402); assert.equal((await guest.request(download)).status, 402);
    assert.equal((await guest.request("/api/plan/deck", "POST", { planId, background: true })).status, 402);
    assert.deepEqual(readDeckJob((await stored(owner))!.plans[0].answers), job);
  });
  await check("late approval cannot reopen a refunded order", async () => {
    await assert.rejects(() => pay(paidOrder), /PAYMENT_STATE_CONFLICT/);
    assert.equal((await guest.request(download)).status, 402);
    const { data, error } = await db.from("payment_orders").select("status").eq("order_id", paidOrder).single();
    assert.equal(error, null); assert.equal(data.status, "refunded");
  });
  await check("completed deck is preserved with zero additional AI usage and no budget change", async () => {
    assert.equal(await usageCount(), usageBefore);
    assert.deepEqual(await readFile(`${evidence}budget.json`), budgetBefore);
    assert.deepEqual(readDeckJob((await stored(owner))!.plans[0].answers)?.result, deck);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message.slice(0, 600) : "Local download verification failed");
  if (!checks.some(check => check.status === "failed")) checks.push({ name: "setup or fixture provenance", status: "failed", elapsedMs: 0 });
  process.exitCode = 1;
} finally {
  globalThis.fetch = transport;
  await mkdir(root, { recursive: true });
  const report = { runId, at: new Date().toISOString(), localOnly: true, passed: checks.filter(check => check.status === "passed").length, failed: checks.filter(check => check.status === "failed").length,
    paymentMode: "simulated local order state; no PG request or real payment", aiMode: "previous real AI result imported; no new AI calls", downloads, checks,
    notVerified: ["Google OAuth", "PG sandbox approval/cancel/refund callbacks", "Browser download UI", "Cloudflare Workflow generation", "Production deployment"] };
  await writeFile(`${root}report-${runId}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  await writeFile(`${root}report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ runId, passed: report.passed, failed: report.failed, report: `${root}report.json` }));
}
