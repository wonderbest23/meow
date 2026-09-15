import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { LAB_URL, LAB_DB_URL, localCredentials } from "./local-account-lab.mts";
import { normalizeState } from "../lib/plan-builder/plan-server-store";
import { createPlanOrder, markPlanOrderPaid } from "../lib/payments/plan-orders";
import type { LandingDraft, LandingSiteRecord } from "../lib/landing/domain";

const credentials = await localCredentials();
Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PAYMENTS_ENABLED: "false" });
const transport = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  assert([LAB_URL, LAB_DB_URL].includes(url.origin), "Only isolated local app and database are allowed");
  return transport(input, init);
};
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = Date.now().toString(36);
const root = fileURLToPath(new URL("../artifacts/local-homepage-lifecycle/", import.meta.url));
const checks: Array<{ name: string; status: "passed" | "failed"; error?: string }> = [];
const password = `LocalOnly!${randomUUID()}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const userHash = (id: string) => hash(createHmac("sha256", credentials.authSecret).update(`today-startup:${id}`).digest("base64url"));
async function sql(query: string) {
  const url = new URL(credentials.dbUrl); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  return promisify(execFile)("psql", ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", query], { env: { PATH: process.env.PATH, HOME: process.env.HOME, PGPASSWORD: decodeURIComponent(url.password) }, timeout: 30_000 });
}
let sequence = 0;
const subnet = Math.floor(Math.random() * 250);
class Client {
  cookies = new Map<string, string>();
  ip = `198.18.${subnet}.${10 + ++sequence}`;
  async request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${LAB_URL}${path}`, { method, redirect: "manual", signal: AbortSignal.timeout(90_000), headers: { "Content-Type": "application/json", "X-Forwarded-For": this.ip, Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ") }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";", 1)[0]; const index = pair.indexOf("="); const key = pair.slice(0, index); const value = pair.slice(index + 1);
      if (!value || /Max-Age=0/i.test(line)) this.cookies.delete(key); else this.cookies.set(key, value);
    }
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, data: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : null };
  }
  async login(email: string) { assert.equal((await this.request("/api/auth/login", "POST", { email, password, remember: true })).status, 200); }
}
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); checks.push({ name, status: "passed" }); console.log(`[PASS] ${name}`); }
  catch (error) { checks.push({ name, status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "failed" }); throw error; }
}
async function account(suffix: string) {
  const email = `qa-site-${runId}-${suffix}@example.invalid`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(error, null); assert(data.user); return { email, id: data.user.id };
}
let publicPath = "";
try {
  const a = await account("a"); const b = await account("b"); const owner = userHash(a.id);
  const client = new Client(); const other = new Client(); const visitor = new Client();
  await client.login(a.email); await other.login(b.email);
  const planId = `plan_site_${runId}`; const now = new Date().toISOString();
  const state = normalizeState({ business: { name: "다른 사업의 비공개 정보", description: "PRIVATE-OTHER-BUSINESS", role: "", region: "", industry: "", stage: "" }, activePlanId: planId, plans: [{ id: planId, title: `QA 새벽커피 ${runId}`, planType: "일반 사업계획서", createdAt: now, updatedAt: now, sections: {}, answers: {
    "market/products": { main_offer: "테이크아웃 드립커피", offer_detail: "원두 두 종류 중 선택", price_value: "4,000원" },
    "market/segments": { first_target: "마포 직장인" },
    "overview/problem": { problems: ["출근길 대기 시간"], solutions: ["미리 준비한 커피 수령"], why_better: "정해진 시간에 수령" },
    "financials/expenses": { internal: "PRIVATE-FINANCIAL-DATA" },
  } }] });
  const seeded = await db.from("plan_states").upsert({ owner_hash: owner, title: state.plans[0].title, plan_type: state.plans[0].planType, data: state }); assert.equal(seeded.error, null);
  let site: LandingSiteRecord; let projectId = ""; let homepageOrder = "";
  const creation = () => client.request("/api/plan/landing", "POST", { planId });
  const path = () => `/api/projects/${projectId}/landing`;
  const read = async (from = client) => { const result = await from.request(path()); assert.equal(result.status, 200); return result.data as { site: LandingSiteRecord; leads: Array<{ email: string; message: string }> }; };
  const save = async (draft: LandingDraft, expected = site.updatedAt) => {
    const result = await client.request(path(), "PUT", { draft, expectedUpdatedAt: expected }); assert.equal(result.status, 200); site = result.data.site; return site;
  };
  const publish = (expected = site.updatedAt) => client.request(`${path()}/publish`, "POST", { expectedUpdatedAt: expected });
  const buy = async (product: "homepage" | "plan", targetPlan = planId) => {
    const order = await createPlanOrder({ ownerId: a.id, guestTokenHash: owner, customerEmail: a.email, planId: targetPlan, planType: state.plans[0].planType, product });
    await markPlanOrderPaid({ orderId: order.orderId, tid: `local-${order.orderId}`, raw: { synthetic: true, noPgCall: true } }); return order.orderId;
  };
  await check("concurrent first creation produces one project and one homepage", async () => {
    const results = await Promise.all([creation(), creation(), creation()]);
    for (const result of results) assert([200, 201].includes(result.status), `Create returned ${result.status}`);
    assert.equal(new Set(results.map(result => result.data.projectId)).size, 1);
    assert.equal(new Set(results.map(result => result.data.site.id)).size, 1);
    projectId = results[0].data.projectId; site = results[0].data.site;
    const projects = await db.from("projects").select("id").eq("guest_token_hash", owner).eq("opportunity->>planId", planId);
    assert.equal(projects.error, null); assert.equal(projects.data.length, 1);
    const stages = await db.from("project_stages").select("stage_index").eq("project_id", projectId);
    assert.equal(stages.error, null); assert.equal(stages.data.length, 6);
    assert.equal(results[0].data.editable, false);
  });
  await check("unpaid preview is private and unrelated business data is excluded", async () => {
    assert.equal(site.draft.businessName, state.plans[0].title);
    assert.doesNotMatch(JSON.stringify(site.draft), /PRIVATE-OTHER-BUSINESS|PRIVATE-FINANCIAL-DATA/);
    assert.equal((await visitor.request(`/api/public/landing/${site.slug}/lead`, "POST", {})).status, 404);
    assert.equal((await other.request(path())).status, 404);
    assert.equal((await client.request(path(), "PUT", { draft: site.draft, expectedUpdatedAt: site.updatedAt })).status, 402);
    assert.equal((await publish()).status, 402);
  });
  await check("transaction RPCs are unavailable to public and signed-in browser roles", async () => {
    const untrusted = createClient(credentials.apiUrl, credentials.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const authenticated of [false, true]) {
      if (authenticated) assert.equal((await untrusted.auth.signInWithPassword({ email: a.email, password })).error, null);
      assert((await untrusted.rpc("ensure_plan_project", { p_plan_id: planId, p_title: "forged", p_owner_hash: owner, p_owner_id: a.id })).error);
      assert((await untrusted.rpc("publish_landing_snapshot", { p_project_id: projectId, p_owner_hash: owner, p_expected_updated_at: site.updatedAt })).error);
      assert((await untrusted.rpc("rollback_landing_snapshot", { p_project_id: projectId, p_owner_hash: owner, p_version: 1, p_expected_updated_at: site.updatedAt })).error);
    }
    const wrongOwner = await db.rpc("publish_landing_snapshot", { p_project_id: projectId, p_owner_hash: userHash(b.id), p_expected_updated_at: site.updatedAt });
    assert.equal(wrongOwner.error?.message, "LANDING_NOT_FOUND");
  });
  await check("stage creation failure rolls back the entire new project", async () => {
    const failedId = `${planId}_failure`; const name = `qa_site_create_${runId}`;
    await sql(`create function public.${name}() returns trigger language plpgsql as $$ begin if new.stage_index = 3 and exists (select 1 from public.projects where id = new.project_id and opportunity->>'planId' = '${failedId}') then raise exception 'QA_STAGE_FAILURE'; end if; return new; end $$; create trigger ${name} before insert on public.project_stages for each row execute function public.${name}();`);
    try {
      const result = await db.rpc("ensure_plan_project", { p_plan_id: failedId, p_title: "Rollback fixture", p_owner_hash: owner, p_owner_id: a.id });
      assert.equal(result.error?.message, "QA_STAGE_FAILURE");
      const rows = await db.from("projects").select("id").eq("guest_token_hash", owner).eq("opportunity->>planId", failedId);
      assert.equal(rows.error, null); assert.equal(rows.data.length, 0);
    } finally { await sql(`drop trigger ${name} on public.project_stages; drop function public.${name}();`); }
  });
  await check("plan purchase and another homepage purchase cannot unlock this editor", async () => {
    await buy("plan"); await buy("homepage", `${planId}_other`);
    assert.equal((await publish()).status, 402);
    homepageOrder = await buy("homepage");
    assert.equal((await client.request(`/api/plan/landing?planId=${planId}`)).data.editable, true);
  });
  await check("authenticated save uses database CAS and rejects a stale tab", async () => {
    site = (await read()).site; const before = site;
    const results = await Promise.all(["A", "B"].map(tag => client.request(path(), "PUT", { draft: { ...before.draft, headline: `EDIT-${tag}-${runId}` }, expectedUpdatedAt: before.updatedAt })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    site = results.find(result => result.status === 200)!.data.site;
    assert.equal((await read()).site.draft.headline, site.draft.headline);
    const retry = await client.request(path(), "PUT", { draft: site.draft, expectedUpdatedAt: before.updatedAt });
    assert.equal(retry.status, 200); assert.equal(retry.data.site.updatedAt, site.updatedAt);
  });
  await check("publication requires the version the editor actually saved", async () => {
    const old = site.updatedAt;
    await save({ ...site.draft, slug: `qa-home-${runId}`, headline: `PUBLIC-V1-${runId}`, pageData: null });
    assert.equal((await publish(old)).status, 409);
    assert.equal((await client.request(`${path()}/publish`, "POST", {})).status, 428);
    assert.equal((await read()).site.status, "draft");
  });
  await check("publication database failure leaves no partial public version", async () => {
    assert.match(site.id, /^[a-f0-9-]{36}$/); const name = `qa_site_publish_${runId}`;
    await sql(`create function public.${name}() returns trigger language plpgsql as $$ begin if new.id = '${site.id}'::uuid then raise exception 'QA_PUBLISH_FAILURE'; end if; return new; end $$; create trigger ${name} before update of published_version on public.landing_sites for each row execute function public.${name}();`);
    try {
      assert.equal((await publish()).status, 400);
      const unchanged = (await read()).site;
      assert.equal(unchanged.status, "draft"); assert.equal(unchanged.versions.length, 0); assert.deepEqual(unchanged.draft, site.draft);
    } finally { await sql(`drop trigger ${name} on public.landing_sites; drop function public.${name}();`); }
  });
  await check("duplicate publish creates exactly one immutable public version", async () => {
    const expected = site.updatedAt;
    const results = await Promise.all([publish(expected), publish(expected)]);
    for (const result of results) assert.equal(result.status, 200);
    site = (await read()).site; assert.equal(site.versions.length, 1); assert.equal(site.publishedVersion, 1);
    publicPath = `/launch/${site.slug}`;
    const page = await visitor.request(publicPath); assert.equal(page.status, 200); assert(page.text.includes(`PUBLIC-V1-${runId}`));
    assert.equal((await publish(expected)).status, 200);
  });
  const versionOne = () => site.versions.find(version => version.version === 1)!;
  await check("saving a new slug and draft does not change the live version or URL", async () => {
    const original = versionOne().config;
    await save({ ...site.draft, slug: `qa-home-v2-${runId}`, headline: `PRIVATE-DRAFT-V2-${runId}`, pageData: null });
    const page = await visitor.request(`/launch/${original.slug}`);
    assert.equal(page.status, 200); assert(page.text.includes(`PUBLIC-V1-${runId}`)); assert(!page.text.includes(`PRIVATE-DRAFT-V2-${runId}`));
    assert.equal((await visitor.request(`/api/public/landing/${site.draft.slug}/lead`, "POST", {})).status, 404);
  });
  await check("republish switches the live snapshot and preserves previous content", async () => {
    const result = await publish(); assert.equal(result.status, 200); site = result.data.site;
    assert.equal(site.publishedVersion, 2); assert.equal(site.versions.length, 2);
    assert.equal(versionOne().config.headline, `PUBLIC-V1-${runId}`);
    const page = await visitor.request(`/launch/${site.slug}`); assert.equal(page.status, 200); assert(page.text.includes(`PRIVATE-DRAFT-V2-${runId}`));
    assert.equal((await visitor.request(`/api/public/landing/${versionOne().config.slug}/lead`, "POST", {})).status, 404);
  });
  await check("rollback refuses stale tabs and restores the selected public snapshot", async () => {
    const stale = site.updatedAt;
    await save({ ...site.draft, headline: `UNSAVED-PUBLIC-V3-${runId}` });
    const rollback = (expected: string) => client.request(`${path()}/rollback`, "POST", { version: 1, expectedUpdatedAt: expected });
    assert.equal((await rollback(stale)).status, 409);
    const result = await rollback(site.updatedAt); assert.equal(result.status, 200); site = result.data.site;
    assert.equal(site.publishedVersion, 1); assert.equal(site.versions.length, 2); assert.equal(site.draft.headline, `PUBLIC-V1-${runId}`);
    assert.equal((await visitor.request(`/launch/${site.slug}`)).status, 200); publicPath = `/launch/${site.slug}`;
  });
  await check("public lead validates consent and stores only with the correct site", async () => {
    const leadPath = `/api/public/landing/${site.slug}/lead`;
    const input = { name: "가상 문의자", email: `lead-${runId}@example.invalid`, phone: "", message: "가상 문의입니다 실제 연락 금지", privacyAgreed: true, marketingAgreed: false, source: "local-lifecycle-qa" };
    for (const invalid of [{ ...input, privacyAgreed: false }, { ...input, website: "spam" }, { ...input, phone: "01000000000" }]) assert.equal((await visitor.request(leadPath, "POST", invalid)).status, 400);
    const response = await visitor.request(leadPath, "POST", input); assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(response.data).sort(), ["leadId", "ok"]);
    const records = await read(); assert.equal(records.leads.length, 1); assert.equal(records.leads[0].email, input.email); assert.equal(records.site.metrics.leads, 1);
    assert.equal((await other.request(path())).status, 404);
    const page = await visitor.request(publicPath); assert(!page.text.includes(input.email));
  });
  await check("fresh login restores edits versions and owner-only leads", async () => {
    assert.equal((await client.request("/api/auth/logout", "POST")).status, 200);
    assert.equal((await client.request(path())).status, 404);
    const reconnect = new Client(); await reconnect.login(a.email);
    const result = await read(reconnect); assert.equal(result.site.id, site.id); assert.equal(result.site.versions.length, 2); assert.equal(result.leads.length, 1);
    await client.login(a.email); site = result.site;
  });
  await check("disabled lead capture is enforced from the published snapshot", async () => {
    await save({ ...site.draft, leadCaptureEnabled: false });
    const result = await publish(); assert.equal(result.status, 200); site = result.data.site;
    const response = await visitor.request(`/api/public/landing/${site.slug}/lead`, "POST", { name: "가상", email: "no-contact@example.invalid", privacyAgreed: true });
    assert.equal(response.status, 400); assert.equal((await read()).leads.length, 1);
  });
  await check("refund prevents editing publishing and rollback without erasing data", async () => {
    const before = (await read()).site;
    const changed = await db.from("payment_orders").update({ status: "refunded" }).eq("order_id", homepageOrder); assert.equal(changed.error, null);
    assert.equal((await client.request(path(), "PUT", { draft: before.draft, expectedUpdatedAt: before.updatedAt })).status, 402);
    assert.equal((await publish()).status, 402);
    assert.equal((await client.request(`${path()}/rollback`, "POST", { version: 1, expectedUpdatedAt: before.updatedAt })).status, 402);
    assert.deepEqual((await read()).site, before);
  });
  await mkdir(root, { recursive: true });
  await writeFile(`${root}browser-fixture.json`, JSON.stringify({ runId, email: a.email, password, userId: a.id, owner, planId, projectId, publicPath }), { mode: 0o600 });
} catch (error) {
  console.error(error instanceof Error ? error.message.slice(0, 500) : "Local homepage lifecycle failed"); process.exitCode = 1;
  if (!checks.some(check => check.status === "failed")) checks.push({ name: "setup", status: "failed" });
} finally {
  globalThis.fetch = transport;
  await mkdir(root, { recursive: true });
  const report = { runId, at: new Date().toISOString(), localOnly: true, publicPath, paidAiCalls: 0, realPayments: 0, outboundMessages: 0, passed: checks.filter(check => check.status === "passed").length, failed: checks.filter(check => check.status === "failed").length, checks, notVerified: ["External Google OAuth and PG", "Cloudflare deployment and custom domain", "Email/SMS notification delivery", "Browser editor interaction"] };
  await writeFile(`${root}report-${runId}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  await writeFile(`${root}report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ runId, passed: report.passed, failed: report.failed }));
}
