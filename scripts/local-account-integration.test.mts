import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { LAB_URL, LAB_DB_URL, localCredentials } from "./local-account-lab.mts";
import { applyCoachReply } from "../lib/plan-builder/coach";
import { normalizeState, type ServerPlanState } from "../lib/plan-builder/plan-server-store";

const exec = promisify(execFile);
const credentials = await localCredentials();
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  assert([LAB_URL, LAB_DB_URL].includes(url.origin), "Integration tests must never contact cloud services");
  return originalFetch(input, init);
};
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = Date.now().toString(36);
const password = "LocalOnly!20260912Plan";
const checks: Array<{ name: string; status: "passed" | "failed"; error?: string }> = [];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const userHash = (id: string) => hash(createHmac("sha256", credentials.authSecret).update(`today-startup:${id}`).digest("base64url"));
let clientSequence = Date.now() % 200;

class Client {
  cookies = new Map<string, string>();
  lastSetCookies: string[] = [];
  ip = `192.0.2.${++clientSequence}`;
  constructor(copy?: Client) { if (copy) { this.cookies = new Map(copy.cookies); this.ip = copy.ip; } }
  async request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${LAB_URL}${path}`, {
      method, redirect: "manual", headers: { "Content-Type": "application/json", "X-Forwarded-For": this.ip, Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000),
    });
    this.lastSetCookies = response.headers.getSetCookie();
    for (const line of this.lastSetCookies) {
      const pair = line.split(";", 1)[0]; const index = pair.indexOf("=");
      const key = pair.slice(0, index); const value = pair.slice(index + 1);
      if (!value || /Max-Age=0/i.test(line)) this.cookies.delete(key); else this.cookies.set(key, value);
    }
    const data = await response.json();
    return { status: response.status, data, headers: response.headers };
  }
  async state() { const result = await this.request("/api/plan/state"); assert.equal(result.status, 200); return result.data as ServerPlanState & { authenticated: boolean; ownerKey: string }; }
  async login(email: string) { return this.request("/api/auth/login", "POST", { email, password, remember: true }); }
  ownerHash() { const token = this.cookies.get("venture_guest"); assert(token); return hash(token); }
}

function fixture(id: string): ServerPlanState {
  const now = new Date().toISOString();
  const coach = applyCoachReply(null, { message: "작은 메뉴 촬영 상품부터 준비해 보겠습니다", title: "로컬 검증용 메뉴 사진 제작", stage: "startup", depth: "practical", ready: true, suggestions: ["첫 고객 제안을 준비해 주세요"], fields: [{ key: "business", value: "메뉴 사진 제작", basis: "user", quote: "메뉴 사진 제작", messageId: "fixture-user" }] }, { id: "fixture-user", role: "user", text: "메뉴 사진 제작 사업을 시작하고 싶어요", at: now });
  return normalizeState({ business: coach.business, plans: [{ id, title: coach.business.name, planType: "일반 사업계획서", createdAt: now, updatedAt: now,
    sections: { "overview/summary": { markdown: "직접 수정한 사업 소개", html: "<p>직접 수정한 사업 소개</p>", generatedAt: now, edited: true, locked: true } },
    answers: { __business_coach: { state: coach }, __deck_job: { status: "failed", token: `deck-${id}`, draft: { slides: [{ title: "저장된 PPT 초안" }] }, updatedAt: now } },
  }], activePlanId: id });
}

async function seed(owner: string, state: ServerPlanState) {
  const { error } = await db.from("plan_states").upsert({ owner_hash: owner, title: state.business.name, plan_type: "일반 사업계획서", data: state, updated_at: new Date().toISOString() });
  assert.equal(error, null);
}
async function stored(owner: string) {
  const { data, error } = await db.from("plan_states").select("data,updated_at").eq("owner_hash", owner).maybeSingle();
  assert.equal(error, null); return data;
}
async function sql(query: string) {
  const url = new URL(credentials.dbUrl);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  return exec("psql", ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", query], { env: { PATH: process.env.PATH, HOME: process.env.HOME, PGPASSWORD: decodeURIComponent(url.password) }, timeout: 30_000 });
}
async function holdOwnerLock(owner: string) {
  assert.match(owner, /^[a-f0-9]{64}$/);
  const url = new URL(credentials.dbUrl);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  const child = spawn("psql", ["-X", "-qAt", "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PGPASSWORD: decodeURIComponent(url.password) }, stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = new Promise<number | null>(resolve => child.once("exit", resolve));
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Local SQL lock acquisition timed out")), 10_000);
      child.stdout.on("data", data => { if (String(data).includes("qa-lock-ready")) { clearTimeout(timer); resolve(); } });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); if (code) reject(new Error(`Local SQL lock exited ${code}`)); });
      child.stdin.write(`begin; select pg_advisory_xact_lock(hashtextextended('plan-state:${owner}', 0)); select 'qa-lock-ready';\n`);
    });
  } catch (error) { child.kill(); await exited; throw error; }
  return async () => { child.stdin.end("commit;\n\\q\n"); assert.equal(await exited, 0); };
}
async function check(name: string, fn: () => Promise<void>) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  try { await fn(); checks.push({ name, status: "passed" }); console.log(`[PASS] ${name}`); }
  catch (error) { checks.push({ name, status: "failed", error: error instanceof Error ? error.message.slice(0, 600) : "failed" }); console.error(`[FAIL] ${name}: ${error instanceof Error ? error.message.slice(0, 600) : "failed"}`); }
}
async function createAccount(suffix: string) {
  const email = `qa-${runId}-${suffix}@example.invalid`;
  const result = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(result.error, null); assert(result.data.user); return { email, id: result.data.user.id };
}

try {
  const ready = await fetch(`${LAB_URL}/api/auth/session`, { signal: AbortSignal.timeout(60_000) });
  assert.equal(ready.status, 200);
  const a = await createAccount("a"); const b = await createAccount("b");
  const guest = new Client(); await guest.state();
  const guestOwner = guest.ownerHash();
  const source = fixture(`plan_qa_${runId}_guest`);
  await seed(guestOwner, source);
  await seed(userHash(a.id), fixture(`plan_qa_${runId}_existing`));
  const oldGuest = new Client(guest);
  const loginReplay = new Client(guest);
  const otherAccountReplay = new Client(guest);
  const projectId = randomUUID();
  const projectInsert = await db.from("projects").insert({ id: projectId, guest_token_hash: guestOwner, title: "Local ownership QA", opportunity: {} });
  assert.equal(projectInsert.error, null);
  const orderId = `qa-${runId}-order`;
  const orderInsert = await db.from("payment_orders").insert({ order_id: orderId, guest_token_hash: guestOwner, amount: 100, order_name: "Local ownership fixture only", method: "CARD", project_id: projectId, opportunity: {}, terms_version: "local-qa", terms_agreed_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString() });
  assert.equal(orderInsert.error, null);
  const preferenceInsert = await db.from("opportunity_preferences").insert({ guest_token_hash: guestOwner, opportunity_key: `qa-${runId}`, preference: "saved", opportunity: {} });
  assert.equal(preferenceInsert.error, null);

  await check("wrong password preserves anonymous data and session", async () => {
    const result = await guest.request("/api/auth/login", "POST", { email: a.email, password: "wrong-local-password" });
    assert.equal(result.status, 401); assert.equal(result.data.error.code, "LOGIN_FAILED");
    assert.equal(guest.cookies.has("venture_access"), false);
    assert.deepEqual((await stored(guestOwner))?.data, source);
  });
  await check("email login transfers full plan, document lock, coach history and saved deck draft", async () => {
    const result = await guest.login(a.email); assert.equal(result.status, 200);
    assert(guest.lastSetCookies.some(cookie => cookie.startsWith("venture_access=") && /httponly/i.test(cookie) && /samesite=lax/i.test(cookie)));
    assert.equal(guest.cookies.has("venture_guest"), false);
    const state = await guest.state(); assert.equal(state.authenticated, true); assert.equal(state.plans.length, 2);
    assert.deepEqual(state.plans.find(plan => plan.id === source.activePlanId), source.plans[0]);
    assert.equal(state.activePlanId, source.activePlanId); assert.equal(await stored(guestOwner), null);
    const project = await db.from("projects").select("owner_id,guest_token_hash").eq("id", projectId).single();
    assert.equal(project.data?.owner_id, a.id); assert.equal(project.data?.guest_token_hash, userHash(a.id));
    const order = await db.from("payment_orders").select("guest_token_hash,status,amount").eq("order_id", orderId).single();
    assert.equal(order.data?.guest_token_hash, userHash(a.id)); assert.equal(order.data?.status, "created"); assert.equal(order.data?.amount, 100);
    const preference = await db.from("opportunity_preferences").select("owner_id,guest_token_hash").eq("opportunity_key", `qa-${runId}`).single();
    assert.equal(preference.data?.owner_id, a.id); assert.equal(preference.data?.guest_token_hash, userHash(a.id));
  });
  await check("old anonymous cookie and stale PUT cannot read or recreate the transferred plan", async () => {
    const oldOwnerKey = hash(`plan-cache:${guestOwner}`);
    const state = await oldGuest.state(); assert.equal(state.authenticated, false); assert.equal(state.plans.length, 0); assert.notEqual(state.ownerKey, oldOwnerKey);
    const put = await oldGuest.request("/api/plan/state", "PUT", { ...source, ownerKey: oldOwnerKey });
    assert.equal(put.status, 409); assert.equal(put.data.error.code, "PLAN_OWNER_CHANGED");
    assert.equal(await stored(guestOwner), null);
  });
  await check("login response retry does not duplicate plans", async () => {
    const claim = await db.from("plan_owner_claims").select("account_hash").eq("guest_hash", guestOwner).single();
    assert.equal(claim.data?.account_hash, userHash(a.id));
    const before = (await guest.state()).plans;
    assert.equal((await loginReplay.login(a.email)).status, 200);
    assert.deepEqual((await loginReplay.state()).plans, before);
  });
  await check("the same anonymous source cannot be claimed by a second account", async () => {
    assert.equal((await otherAccountReplay.login(b.email)).status, 200);
    assert.equal((await otherAccountReplay.state()).plans.length, 0);
    const project = await db.from("projects").select("owner_id").eq("id", projectId).single();
    assert.equal(project.data?.owner_id, a.id);
  });
  await check("account switch rejects old owner's autosave and DELETE", async () => {
    const previous = await guest.state(); assert.equal((await guest.login(b.email)).status, 200);
    const next = await guest.state(); assert.equal(next.plans.length, 0); assert.notEqual(next.ownerKey, previous.ownerKey);
    assert.equal((await guest.request("/api/plan/state", "PUT", previous)).status, 409);
    assert.equal((await guest.request(`/api/plan/state?planId=${source.activePlanId}&ownerKey=${previous.ownerKey}`, "DELETE")).status, 409);
    assert.equal((await stored(userHash(a.id)))?.data.plans.length, 2);
  });
  await check("expired access token refreshes session without changing ownership", async () => {
    const previous = await guest.state(); guest.cookies.set("venture_access", "expired-local-fixture");
    const next = await guest.state(); assert.equal(next.authenticated, true); assert.equal(next.ownerKey, previous.ownerKey);
    assert.notEqual(guest.cookies.get("venture_access"), "expired-local-fixture");
  });
  await check("logout removes all auth cookies and returns an empty anonymous state", async () => {
    assert.equal((await guest.request("/api/auth/logout", "POST")).status, 200);
    assert.equal(guest.cookies.has("venture_access"), false); assert.equal(guest.cookies.has("venture_refresh"), false);
    const next = await guest.state(); assert.equal(next.authenticated, false); assert.equal(next.plans.length, 0);
  });
  await check("busy AI job blocks login without moving or losing the source", async () => {
    const busy = fixture(`plan_qa_${runId}_busy`); busy.plans[0].answers.__coach_job = { status: "running" };
    const owner = guest.ownerHash(); await seed(owner, busy);
    const blocked = await guest.login(b.email); assert.equal(blocked.status, 409); assert.equal(blocked.data.error.code, "PLAN_CLAIM_BUSY");
    assert.equal(guest.cookies.has("venture_access"), false); assert.deepEqual((await stored(owner))?.data, busy);
    busy.plans[0].answers.__coach_job.status = "failed"; await seed(owner, busy);
    assert.equal((await guest.login(b.email)).status, 200);
    assert.equal((await guest.state()).plans[0].id, busy.activePlanId);
  });
  await check("auth token callback links the same anonymous plan", async () => {
    const callback = new Client(); await callback.state(); const own = callback.ownerHash(); const draft = fixture(`plan_qa_${runId}_callback`); await seed(own, draft);
    const auth = createClient(credentials.apiUrl, credentials.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await auth.auth.signInWithPassword({ email: a.email, password }); assert.equal(signed.error, null); assert(signed.data.session);
    const result = await callback.request("/api/auth/session", "POST", { accessToken: signed.data.session.access_token, refreshToken: signed.data.session.refresh_token });
    assert.equal(result.status, 200); assert.match(result.headers.get("cache-control") ?? "", /no-store/);
    assert((await callback.state()).plans.some(plan => plan.id === draft.activePlanId)); assert.equal(await stored(own), null);
  });
  await check("new email registration creates consent and imports anonymous plan", async () => {
    const registration = new Client(); await registration.state(); const draft = fixture(`plan_qa_${runId}_register`); await seed(registration.ownerHash(), draft);
    const result = await registration.request("/api/auth/register", "POST", { email: `qa-${runId}-register@example.invalid`, password, terms: true, privacy: true, aiNotice: true });
    assert.equal(result.status, 200); assert.equal(result.data.authenticated, true);
    assert.equal((await registration.state()).plans[0].id, draft.activePlanId);
    const registered = await db.auth.getUser(registration.cookies.get("venture_access")); assert(registered.data.user);
    const consent = await db.from("account_consents").select("terms_agreed,privacy_agreed,ai_notice_confirmed").eq("user_id", registered.data.user.id).single();
    assert.equal(consent.error, null); assert.deepEqual(consent.data, { terms_agreed: true, privacy_agreed: true, ai_notice_confirmed: true });
  });
  await check("password recovery accepts real tokens and preserves anonymous work", async () => {
    const resetAccount = await createAccount("reset");
    const resetClient = new Client(); await resetClient.state(); const owner = resetClient.ownerHash(); const draft = fixture(`plan_qa_${runId}_reset`); await seed(owner, draft);
    const link = await db.auth.admin.generateLink({ type: "recovery", email: resetAccount.email }); assert.equal(link.error, null); assert(link.data.properties);
    const auth = createClient(credentials.apiUrl, credentials.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const verified = await auth.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "recovery" }); assert.equal(verified.error, null); assert(verified.data.session);
    const result = await resetClient.request("/api/auth/reset", "POST", { accessToken: verified.data.session.access_token, refreshToken: verified.data.session.refresh_token, password: `${password}Changed` });
    assert.equal(result.status, 200); assert.equal(result.data.reset, true); assert.equal((await resetClient.state()).plans[0].id, draft.activePlanId);
    const relogin = await auth.auth.signInWithPassword({ email: resetAccount.email, password: `${password}Changed` }); assert.equal(relogin.error, null);
  });
  await check("invalid callback tokens do not authenticate or transfer data", async () => {
    const invalid = new Client(); await invalid.state(); const owner = invalid.ownerHash(); const draft = fixture(`plan_qa_${runId}_invalid`); await seed(owner, draft);
    const result = await invalid.request("/api/auth/session", "POST", { accessToken: "invalid-access", refreshToken: "123456789abc" });
    assert.equal(result.status, 400); assert.equal(invalid.cookies.has("venture_access"), false); assert.deepEqual((await stored(owner))?.data, draft);
  });
  await check("legacy transfer failure can resume after the guest cookie rotates", async () => {
    const interrupted = new Client(); await interrupted.state(); const owner = interrupted.ownerHash(); const draft = fixture(`plan_qa_${runId}_legacy`); await seed(owner, draft);
    const legacyId = randomUUID(); const inserted = await db.from("projects").insert({ id: legacyId, guest_token_hash: owner, title: "Local legacy retry QA", opportunity: {} }); assert.equal(inserted.error, null);
    await sql(`create or replace function public.qa_fail_legacy() returns trigger language plpgsql as $$ begin if old.guest_token_hash = '${owner}' then raise exception 'local legacy failure'; end if; return new; end; $$; create trigger qa_fail_legacy before update on public.projects for each row execute function public.qa_fail_legacy();`);
    let failed: Awaited<ReturnType<Client["login"]>>;
    try { failed = await interrupted.login(a.email); }
    finally { await sql("drop trigger if exists qa_fail_legacy on public.projects; drop function if exists public.qa_fail_legacy();"); }
    await interrupted.state();
    const other = new Client(interrupted); assert.equal((await other.login(b.email)).status, 200);
    const unclaimed = await db.from("projects").select("owner_id").eq("id", legacyId).single(); assert.equal(unclaimed.data?.owner_id, null, "Another account must not resume A's pending handoff");
    const retry = await interrupted.login(a.email); assert.equal(retry.status, 200);
    const legacy = await db.from("projects").select("owner_id,guest_token_hash").eq("id", legacyId).single();
    assert.equal(legacy.data?.owner_id, a.id, "A completed plan handoff must retain the unfinished legacy migration for the same account");
    assert.equal(legacy.data?.guest_token_hash, userHash(a.id));
    assert.equal(failed.status, 503); assert.equal(failed.data.error.code, "PLAN_CLAIM_FAILED");
    assert((await interrupted.state()).plans.some(plan => plan.id === draft.activePlanId));
    const completion = await db.from("plan_owner_claims").select("legacy_completed_at").eq("guest_hash", owner).single(); assert(completion.data?.legacy_completed_at);
  });
  await check("two concurrent account logins claim a guest plan exactly once", async () => {
    const first = new Client(); await first.state(); const second = new Client(first);
    const own = first.ownerHash(); const draft = fixture(`plan_qa_${runId}_parallel`); await seed(own, draft);
    const responses = await Promise.all([first.login(a.email), second.login(b.email)]);
    assert(responses.every(response => response.status === 200));
    const states = await Promise.all([first.state(), second.state()]);
    assert.equal(states.filter(state => state.plans.some(plan => plan.id === draft.activePlanId)).length, 1);
    assert.equal(await stored(own), null);
  });
  await check("real PostgreSQL lock contention preserves an accepted save during login", async () => {
    const writer = new Client(); await writer.state(); const login = new Client(writer); const own = writer.ownerHash();
    const draft = fixture(`plan_qa_${runId}_contended`); await seed(own, draft);
    const before = await writer.state();
    const changed = structuredClone(before); changed.plans[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    changed.plans[0].sections["overview/summary"] = { ...changed.plans[0].sections["overview/summary"], markdown: "동시 저장 검증", html: "<p>동시 저장 검증</p>", generatedAt: changed.plans[0].updatedAt };
    const release = await holdOwnerLock(own);
    let writing: ReturnType<Client["request"]> | undefined;
    let signingIn: ReturnType<Client["login"]> | undefined;
    try {
      writing = writer.request("/api/plan/state", "PUT", changed);
      signingIn = login.login(a.email);
      let blocked = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
        const { stdout } = await sql("select count(*) from pg_stat_activity where wait_event = 'advisory' and pid <> pg_backend_pid()");
        blocked = Number(stdout.trim()); if (blocked >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert(blocked >= 2, "Both writes must actually contend on the database lock");
    } finally { await release(); if (writing && signingIn) await Promise.all([writing, signingIn]); }
    const [saveResult, loginResult] = await Promise.all([writing!, signingIn!]);
    assert.equal(loginResult.status, 200); assert([200, 409].includes(saveResult.status));
    const transferred = (await login.state()).plans.find(plan => plan.id === draft.activePlanId)!;
    assert(transferred);
    if (saveResult.status === 200) assert.equal(transferred.sections["overview/summary"].markdown, "동시 저장 검증");
    else assert.equal(saveResult.data.error.code, "PLAN_OWNER_CHANGED");
  });
  await check("SQL failure during claim rolls back all plan state and reports a retryable link error", async () => {
    const failed = new Client(); await failed.state(); const owner = failed.ownerHash(); const draft = fixture(`plan_qa_${runId}_rollback`); await seed(owner, draft);
    await sql(`create or replace function public.qa_fail_claim() returns trigger language plpgsql as $$ begin if new.guest_hash = '${owner}' then raise exception 'local QA rollback'; end if; return new; end; $$; create trigger qa_fail_claim before insert on public.plan_owner_claims for each row execute function public.qa_fail_claim();`);
    try {
      const result = await failed.login(a.email); assert.equal(result.status, 503); assert.equal(result.data.error.code, "PLAN_CLAIM_FAILED");
      assert.equal(failed.cookies.has("venture_access"), false); assert.deepEqual((await stored(owner))?.data, draft);
      assert.equal((await stored(userHash(a.id)))?.data.plans.some((plan: { id: string }) => plan.id === draft.activePlanId), false);
    } finally { await sql("drop trigger if exists qa_fail_claim on public.plan_owner_claims; drop function if exists public.qa_fail_claim();"); }
  });

  await mkdir("artifacts/local-account-integration", { recursive: true });
  const report = JSON.stringify({ runId, filter: process.argv[2] ?? null, at: new Date().toISOString(), baseUrl: LAB_URL, database: "isolated-local-supabase", fixtureConversation: true, realAiCalls: 0, realPayments: 0, checks, notVerified: ["Google provider login", "Cloudflare deployment and Workflows", "real PPT generation", "PG sandbox checkout"] }, null, 2);
  await writeFile(`artifacts/local-account-integration/report-${runId}.json`, report);
  await writeFile("artifacts/local-account-integration/report.json", report);
  console.log(`${checks.filter(check => check.status === "passed").length}/${checks.length} local integration checks passed; report: artifacts/local-account-integration/report.json`);
  if (checks.some(check => check.status === "failed")) process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
}
