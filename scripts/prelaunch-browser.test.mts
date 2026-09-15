import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { PRELAUNCH_ORIGIN, assertPrelaunchTarget, prelaunchScope } from "./prelaunch-db-safety";
import { normalizeState } from "../lib/plan-builder/plan-server-store";

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
assertPrelaunchTarget(env.SUPABASE_URL ?? "", process.argv[2]); assert(env.SUPABASE_SERVICE_ROLE_KEY);
const modules = process.env.RUNTIME_NODE_MODULES; assert(modules);
const { chromium } = createRequire(`${modules}/package.json`)("playwright");
const budgetFile = new URL("../artifacts/synthetic-ai-launch/budget.json", import.meta.url), budgetBefore = await readFile(budgetFile, "utf8");
const runId = randomBytes(8).toString("hex"), scope = prelaunchScope(runId);
const email = [...scope.emails][0], password = `BrowserQA!${randomUUID()}`;
const root = new URL(`../artifacts/prelaunch-browser/${runId}/`, import.meta.url);
await mkdir(root, { recursive: true, mode: 0o700 });
const app = await mkdtemp("/private/tmp/oneul-prelaunch-browser-");
for (const entry of ["app", "components", "lib", "data", "middleware.ts", "tsconfig.json", "package.json", "cloudflare-env.d.ts", "cloudflare-runtime-shim.d.ts"]) await cp(resolve(entry), join(app, entry), { recursive: true });
await cp(resolve("scripts/prelaunch-next.config.ts"), join(app, "next.config.ts"));
await symlink(resolve("node_modules"), join(app, "node_modules"), "dir");
await symlink(resolve("public"), join(app, "public"), "dir");
const port = await new Promise<number>((accept, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); assert(address && typeof address !== "string"); const port = address.port; server.close(() => accept(port)); });
});
const url = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--turbopack", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: app, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", PERSISTENCE_MODE: "supabase", SUPABASE_URL: PRELAUNCH_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY, AUTH_PROJECT_SECRET: env.AUTH_PROJECT_SECRET ?? "", PLAN_ACCOUNT_LINKING_ENABLED: "true", PAYMENTS_ENABLED: "false", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false", HOMEPAGE_EDITOR_PREVIEW_EMAILS: email, NEXT_PUBLIC_PPT_GENERATION_VERIFIED: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = new Promise<number | null>(accept => child.once("exit", accept));
let logs = ""; child.stdout.on("data", bytes => { logs = (logs + String(bytes)).slice(-120_000); }); child.stderr.on("data", bytes => { logs = (logs + String(bytes)).slice(-120_000); });
const checks: string[] = [], errors: string[] = [], pageErrors: string[] = [];
let privatePageEvidence: { status: number; noindex: boolean; privateTextAbsent: boolean; leadApiStatus: number } | null = null;
let browser: any, context: any, oldContext: any, visitor: any;
let siteId = "", projectId = "", accountId = "";
const transport = globalThis.fetch;
const db = createClient(PRELAUNCH_ORIGIN, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const record = async (name: string, fn: () => Promise<void>) => { await fn(); checks.push(name); console.log(`[PASS] ${name}`); };
try {
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), target = new URL(request.url);
    if (target.origin === url) assert.equal(request.method, "GET");
    else if (target.pathname === "/rest/v1/landing_sites" && request.method === "PATCH") {
      assert.equal(target.origin, PRELAUNCH_ORIGIN); assert(siteId && target.searchParams.get("id") === `eq.${siteId}`);
      assert.deepEqual(await request.clone().json(), { status: "draft", published_slug: null });
    } else {
      const body = request.method === "GET" ? undefined : await request.clone().json();
      scope.assertRequest(target, request.method, body);
    }
    return transport(request, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  };
  const account = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic: true, runId, purpose: "browser-prelaunch" } });
  if (account.error) throw new Error(`Synthetic account error ${account.error.code}`); assert(account.data.user); accountId = account.data.user.id;
  for (let attempt = 0; attempt < 90; attempt++) {
    assert(child.exitCode === null, "Isolated app exited before it was ready");
    try { if ((await fetch(`${url}/api/auth/session`)).status === 200) break; } catch { /* Wait only for this isolated app. */ }
    if (attempt === 89) throw new Error("Isolated app startup timed out");
    await new Promise(accept => setTimeout(accept, 1000));
  }
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", extraHTTPHeaders: { "X-Forwarded-For": `198.18.${parseInt(runId.slice(0, 2), 16)}.17` } });
  await context.route("**/*", (route: any) => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(90_000); page.on("pageerror", (error: Error) => pageErrors.push(error.message));
  const request = async (path: string, method = "GET", data?: unknown, from = context) => {
    assert(!/^https?:/.test(path));
    const response = await from.request.fetch(`${url}${path}`, { method, ...(data === undefined ? {} : { data }), timeout: 120_000 });
    const text = await response.text();
    return { status: response.status(), headers: response.headers(), data: response.headers()["content-type"]?.includes("application/json") ? JSON.parse(text) : text };
  };
  const now = new Date().toISOString(), planId = `${scope.prefix}browser`, title = `QA 홈페이지 ${runId}`;
  const state = normalizeState({ business: { name: title, description: "가상 서비스", role: "", region: "", industry: "", stage: "" }, activePlanId: planId, plans: [{ id: planId, title, planType: "일반 사업계획서", createdAt: now, updatedAt: now, sections: {}, answers: {
    "market/products": { main_offer: "테이크아웃 드립커피", offer_detail: "원두 두 종류 중 선택", price_value: "4,000원" }, "market/segments": { first_target: "가상 직장인" },
    "overview/problem": { problems: ["가상 대기 시간"], solutions: ["미리 준비한 커피 수령"], why_better: "정해진 시간에 수령" },
  } }] });
  let oldOwnerKey = "";
  await record("anonymous browser saves its synthetic business through the real state API", async () => {
    const initial = await request("/api/plan/state"); assert.equal(initial.status, 200); assert.equal(initial.data.authenticated, false); oldOwnerKey = initial.data.ownerKey; assert(oldOwnerKey);
    assert.equal((await request("/api/plan/state", "PUT", { ...state, ownerKey: oldOwnerKey })).status, 200);
    oldContext = await browser.newContext({ storageState: await context.storageState(), extraHTTPHeaders: { "X-Forwarded-For": "198.18.250.18" } });
  });
  await record("visible email login transfers the business and sets HttpOnly account cookies", async () => {
    await page.goto(`${url}/account?next=${encodeURIComponent("/plan")}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByPlaceholder("name@example.com").fill(email); await page.getByPlaceholder("비밀번호 입력").fill(password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(`${url}/plan`, { timeout: 120_000 });
    const saved = await request("/api/plan/state"); assert.equal(saved.status, 200); assert.equal(saved.data.authenticated, true); assert.notEqual(saved.data.ownerKey, oldOwnerKey);
    assert.equal(saved.data.activePlanId, planId); assert.equal(saved.data.plans[0].title, title);
    const cookies = await context.cookies(); assert(cookies.some((cookie: any) => cookie.name === "venture_access" && cookie.httpOnly));
    assert(cookies.some((cookie: any) => cookie.name === "venture_refresh" && cookie.httpOnly));
    await page.getByRole("heading", { name: title, exact: true }).waitFor({ state: "visible" });
    await page.screenshot({ path: new URL("signed-in-plan.png", root).pathname });
  });
  await record("old guest browser cannot read or overwrite the transferred business", async () => {
    const old = await request("/api/plan/state", "GET", undefined, oldContext); assert.equal(old.data.authenticated, false); assert.equal(old.data.plans.length, 0);
    assert.equal((await request("/api/plan/state", "PUT", { ...state, ownerKey: oldOwnerKey }, oldContext)).status, 409);
  });
  let site: any;
  await record("homepage creation uses the transferred plan and survives duplicate requests", async () => {
    const one = await request("/api/plan/landing", "POST", { planId }); assert([200, 201].includes(one.status), `Homepage create HTTP ${one.status}`);
    projectId = one.data.projectId; site = one.data.site; siteId = site.id;
    assert.equal(one.data.editable, true); assert.equal(site.status, "draft");
    const two = await request("/api/plan/landing", "POST", { planId }); assert.equal(two.status, 200); assert.equal(two.data.projectId, projectId); assert.equal(two.data.site.id, siteId);
  });
  const endpoint = () => `/api/projects/${projectId}/landing`;
  const save = async (draft: any, expected = site.updatedAt) => {
    const result = await request(endpoint(), "PUT", { draft, expectedUpdatedAt: expected }); assert.equal(result.status, 200); site = result.data.site;
  };
  visitor = await browser.newContext();
  await record("HTTP publication requires a version and serves the saved snapshot", async () => {
    await save({ ...site.draft, slug: `qa-browser-${runId}-v1`, headline: "QA browser public v1", leadCaptureEnabled: false, pageData: null });
    assert.equal((await request(`${endpoint()}/publish`, "POST", {})).status, 428);
    const result = await request(`${endpoint()}/publish`, "POST", { expectedUpdatedAt: site.updatedAt }); assert.equal(result.status, 200); site = result.data.site;
    const publicPage = await request(`/launch/${site.slug}`, "GET", undefined, visitor); assert.equal(publicPage.status, 200); assert(publicPage.data.includes("QA browser public v1"));
  });
  const original = structuredClone(site);
  await record("browser API preserves the public page while private edits are saved", async () => {
    await save({ ...site.draft, slug: `qa-browser-${runId}-v2`, headline: "QA browser private v2", pageData: null });
    const oldPage = await request(`/launch/${original.slug}`, "GET", undefined, visitor); assert.equal(oldPage.status, 200); assert(oldPage.data.includes("QA browser public v1"));
    assert(!oldPage.data.includes("QA browser private v2"));
    const privatePage = await visitor.newPage();
    const response = await privatePage.goto(`${url}/launch/${site.slug}`, { waitUntil: "networkidle", timeout: 120_000 }); assert(response);
    const html = await response.text();
    await writeFile(new URL("unpublished-page.html", root), html, { mode: 0o600 });
    // Next.js streams some notFound responses with HTTP 200; verify the content and public API too.
    assert([200, 404].includes(response.status()));
    assert.equal(await privatePage.getByRole("heading", { name: "404", exact: true }).count(), 1);
    const robots = await privatePage.locator('meta[name="robots"]').evaluateAll((elements: Element[]) => elements.map(element => element.getAttribute("content") ?? ""));
    assert(robots.some((value: string) => value.split(",").map(part => part.trim()).includes("noindex")));
    assert(!html.includes("QA browser private v2"));
    const lead = await request(`/api/public/landing/${site.slug}/lead`, "POST", {}, visitor);
    assert.equal(lead.status, 404); assert.equal(lead.data.error.code, "LANDING_NOT_FOUND");
    privatePageEvidence = { status: response.status(), noindex: true, privateTextAbsent: true, leadApiStatus: lead.status };
    await privatePage.screenshot({ path: new URL("unpublished-page.png", root).pathname }); await privatePage.close();
    assert.equal((await request(`${endpoint()}/publish`, "POST", { expectedUpdatedAt: original.updatedAt })).status, 409);
  });
  await record("HTTP republish and rollback restore the exact public version", async () => {
    const second = await request(`${endpoint()}/publish`, "POST", { expectedUpdatedAt: site.updatedAt }); assert.equal(second.status, 200); site = second.data.site;
    assert.equal(site.publishedVersion, 2);
    const restored = await request(`${endpoint()}/rollback`, "POST", { version: 1, expectedUpdatedAt: site.updatedAt }); assert.equal(restored.status, 200); site = restored.data.site;
    assert.equal(site.publishedVersion, 1); assert.deepEqual(site.draft, original.draft); assert.equal(site.versions.length, 2);
    const publicPage = await request(`/launch/${original.slug}`, "GET", undefined, visitor); assert.equal(publicPage.status, 200); assert(publicPage.data.includes("QA browser public v1"));
  });
  await record("logout and relogin restore homepage and deny unauthenticated editor access", async () => {
    assert.equal((await request("/api/auth/logout", "POST")).status, 200);
    assert.equal((await request(endpoint())).status, 404);
    const login = await request("/api/auth/login", "POST", { email, password, remember: true }); assert.equal(login.status, 200);
    const saved = await request(endpoint()); assert.equal(saved.status, 200); assert.deepEqual(saved.data.site.draft, original.draft);
    const reopened = await request(`/api/plan/landing?planId=${planId}`); assert.equal(reopened.data.projectId, projectId); assert.equal(reopened.data.site.publishedVersion, 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: title, exact: true }).waitFor({ state: "visible" });
    await page.screenshot({ path: new URL("reconnected-plan.png", root).pathname });
    assert.deepEqual(pageErrors, []);
  });
} catch (error) {
  errors.push((error instanceof Error ? error.message : "Browser verification failed").replaceAll(env.SUPABASE_SERVICE_ROLE_KEY, "[redacted]").slice(0, 1200)); process.exitCode = 1;
} finally {
  if (siteId) {
    try { const result = await db.from("landing_sites").update({ status: "draft", published_slug: null }).eq("id", siteId); if (result.error) throw result.error; }
    catch { errors.push("Synthetic browser homepage could not be unpublished"); process.exitCode = 1; }
  }
  try { await browser?.close(); } catch { errors.push("Browser cleanup failed"); process.exitCode = 1; }
  globalThis.fetch = transport;
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000); await exited; clearTimeout(timeout);
  await writeFile(new URL("server.log", root), logs.replaceAll(env.SUPABASE_SERVICE_ROLE_KEY, "[redacted]").replaceAll(password, "[redacted]"), { mode: 0o600 });
  const unchangedBudget = await readFile(budgetFile, "utf8") === budgetBefore;
  if (!unchangedBudget) { errors.push("AI budget changed"); process.exitCode = 1; }
  const report = { runId, checks, errors, pageErrors, privatePageEvidence, accountId, projectId, siteId, temporaryApp: app, temporaryAppStopped: true, previewEntitlement: "Synthetic email allowlist in isolated app only; not payment verification", homepageLeftPrivate: Boolean(siteId) && !errors.some(error => error.includes("unpublished")), paidAiCalls: 0, realPayments: 0, unchangedBudget, releaseReady: false };
  await writeFile(new URL("report.json", root), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: checks.length, errors, report: new URL("report.json", root).pathname }, null, 2));
}
