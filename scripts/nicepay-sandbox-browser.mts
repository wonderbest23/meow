import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { parseEnv, promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { localCredentials } from "./local-account-lab.mts";
import { nicepayEnvironment } from "../lib/payments/nicepay-environment";

assert.equal(process.argv[2], "--allow-nicepay-sandbox", "Explicit sandbox approval is required");
const root = resolve(new URL("..", import.meta.url).pathname);
const keyFile = join(root, ".env.nicepay-sandbox.local");
assert.equal((await stat(keyFile)).mode & 0o777, 0o600, "Test keys must be owner-readable only");
await promisify(execFile)("git", ["check-ignore", "--quiet", keyFile], { cwd: root });
const keys = parseEnv(await readFile(keyFile, "utf8"));
const pg = nicepayEnvironment(keys);
assert.equal(pg.mode, "sandbox");
assert.equal(pg.api, "https://sandbox-api.nicepay.co.kr/v1");
assert(pg.clientKey && pg.secretKey);
assert.match(pg.clientKey, /^S2_[a-f0-9]{32}$/i, "Only a Server/Basic sandbox client key is allowed");
const credentials = await localCredentials();
assert.equal(credentials.apiUrl, "http://127.0.0.1:55431");
const modules = process.env.RUNTIME_NODE_MODULES; assert(modules);
const { chromium } = createRequire(`${modules}/package.json`)("playwright");
const run = randomUUID().slice(0, 8), email = `nicepay-browser-${run}@example.test`, password = randomUUID();
const planId = `qa-nicepay-${run}`, planType = "일반 사업계획서";
const output = join(root, "artifacts/nicepay-sandbox", run);
await mkdir(output, { recursive: true, mode: 0o700 });
const temp = await mkdtemp("/private/tmp/oneul-nicepay-sandbox-");
const safeFile = (path: string) => !/^\.env(?:\.|$)|^\.dev\.vars|^\.git$/.test(basename(path));
for (const entry of ["app", "components", "lib", "data", "middleware.ts", "tsconfig.json", "package.json", "cloudflare-env.d.ts", "cloudflare-runtime-shim.d.ts"]) {
  await cp(join(root, entry), join(temp, entry), { recursive: true, filter: safeFile });
}
await cp(join(root, "scripts/prelaunch-next.config.ts"), join(temp, "next.config.ts"));
await symlink(join(root, "node_modules"), join(temp, "node_modules"), "dir");
await symlink(join(root, "public"), join(temp, "public"), "dir");
const port = await new Promise<number>((accept, reject) => {
  const reserve = createServer(); reserve.once("error", reject);
  reserve.listen(0, "127.0.0.1", () => { const address = reserve.address(); assert(address && typeof address !== "string"); reserve.close(() => accept(address.port)); });
});
const origin = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: temp,
  env: {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", APP_ENV: "local",
    PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey,
    AUTH_PROJECT_SECRET: credentials.authSecret, PLAN_ACCOUNT_LINKING_ENABLED: "true",
    PAYMENTS_ENABLED: "true", NICEPAY_ENVIRONMENT: "sandbox",
    NICEPAY_SANDBOX_CLIENT_KEY: pg.clientKey, NICEPAY_SANDBOX_SECRET_KEY: pg.secretKey,
    NEXT_PUBLIC_PPT_GENERATION_VERIFIED: "false", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = new Promise<void>(accept => app.once("exit", () => accept()));
let logs = "";
app.stdout.on("data", bytes => { logs = (logs + String(bytes)).slice(-120_000); });
app.stderr.on("data", bytes => { logs = (logs + String(bytes)).slice(-120_000); });
const redact = (value: string) => [pg.clientKey!, pg.secretKey!, credentials.serviceKey, credentials.anonKey, credentials.authSecret, password].reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), value).replace(/eyJ[A-Za-z0-9._-]+/g, "[TOKEN]");
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
let browser: any, page: any;
let owner = "";
const checks: string[] = [], errors: string[] = [], blockedOrigins = new Set<string>();
let orderId = "", amount = 0, providerApprovalVerified = false;
try {
  const account = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic: true, purpose: "nicepay-sandbox", run } });
  assert.ifError(account.error); assert(account.data.user); owner = account.data.user.id;
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    assert.equal(app.exitCode, null, "Isolated app exited before readiness");
    try { ready = (await fetch(`${origin}/api/auth/session`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
    if (ready) break;
    await new Promise(accept => setTimeout(accept, 500));
  }
  assert(ready, "Isolated app startup timed out");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
  // Only the local app and NICEPAY's documented payment SDK may be contacted.
  const allowed = new Set([origin, "https://pay.nicepay.co.kr", "https://sandbox-pay.nicepay.co.kr", "https://web.nicepay.co.kr", "https://pg-cdn.nicepay.co.kr", "https://cache.nicepay.co.kr", "https://vbv.samsungcard.co.kr"]);
  await context.route("**/*", (route: any) => {
    const target = new URL(route.request().url());
    if (allowed.has(target.origin)) return route.continue();
    blockedOrigins.add(target.origin); return route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(90_000);
  page.on("pageerror", (error: Error) => errors.push(redact(error.message)));
  let callbackBody: string | null = null, prepareCalls = 0;
  context.on("request", (request: any) => {
    if (request.url() === `${origin}/api/payments/plan/prepare` && request.method() === "POST") prepareCalls++;
    if (request.url() === `${origin}/api/payments/plan/return` && request.method() === "POST") callbackBody = request.postData();
  });
  const login = await context.request.post(`${origin}/api/auth/login`, { data: { email, password }, headers: { Origin: origin } });
  assert.equal(login.status(), 200, "Local synthetic account login failed");
  const initial = await (await context.request.get(`${origin}/api/plan/state`)).json();
  const now = new Date().toISOString();
  const state = await context.request.put(`${origin}/api/plan/state`, { data: {
    ...initial, activePlanId: planId, plans: [{ id: planId, title: `[QA] 테스트 결제 ${run}`, planType, createdAt: now, updatedAt: now, sections: {}, answers: {} }],
  } });
  assert.equal(state.status(), 200, "Synthetic plan persistence failed");
  checks.push("synthetic account login and plan saved through real local HTTP routes");
  const checkoutUrl = `${origin}/plan/pay?${new URLSearchParams({ planId, planType })}`;
  await page.goto(checkoutUrl, { waitUntil: "networkidle" });
  const accessBefore = await (await context.request.get(`${origin}/api/plan/access?planId=${planId}`)).json();
  assert.equal(accessBefore.paid, false); assert.equal(accessBefore.payable, true);
  const prepared = page.waitForResponse((response: any) => response.url() === `${origin}/api/payments/plan/prepare` && response.request().method() === "POST");
  await page.getByRole("button", { name: "카드로 결제하기", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  const response = await prepared; assert.equal(response.status(), 200);
  const order = await response.json(); assert.equal(order.clientId, pg.clientKey); assert.equal(order.sdkUrl, pg.sdk);
  orderId = order.orderId; amount = order.amount;
  assert.match(orderId, /^PB-/); assert.equal(amount, 149_000);
  const stored = await db.from("payment_orders").select("owner_id,status,amount").eq("order_id", orderId).single();
  assert.ifError(stored.error); assert.equal(stored.data.owner_id, owner); assert.equal(stored.data.status, "created"); assert.equal(stored.data.amount, amount);
  checks.push("checkout uses the issued sandbox client key and persists the server-priced order locally");
  let paymentFrame: any;
  for (let attempt = 0; attempt < 60; attempt++) {
    paymentFrame = page.frames().find((frame: any) => frame.url().startsWith("https://web.nicepay.co.kr/"));
    if (paymentFrame) break;
    await page.waitForTimeout(250);
  }
  assert(paymentFrame, "NICEPAY payment frame did not open");
  await paymentFrame.getByText("테스트결제(실결제불가)", { exact: true }).waitFor();
  checks.push("provider checkout explicitly identifies itself as test-only with real payment unavailable");
  await paymentFrame.getByText("이용약관 전체동의", { exact: true }).click();
  await paymentFrame.getByText("모두 동의 후 진행", { exact: true }).click();
  await paymentFrame.getByText("삼성", { exact: true }).click();
  await paymentFrame.getByText("다음", { exact: true }).click();
  await paymentFrame.locator("#chkConfirm").check();
  await page.screenshot({ path: join(output, "checkout-sdk.png"), fullPage: true });
  await paymentFrame.getByRole("button", { name: "149,000원 결제", exact: true }).click();
  if (process.argv.includes("--inspect-card-auth")) {
    await page.waitForTimeout(5000);
    const surfaces = [];
    for (const openPage of context.pages()) {
      for (const frame of openPage.frames()) {
        surfaces.push({ origin: new URL(frame.url() || "about:blank").origin, text: redact(await frame.locator("body").innerText({ timeout: 5000 }).catch(() => "")).slice(0, 10000) });
      }
    }
    await page.screenshot({ path: join(output, "card-auth.png"), fullPage: true, timeout: 5000 }).catch(() => {});
    await writeFile(join(output, "card-auth.json"), JSON.stringify(surfaces, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ surfaces, blockedOrigins: [...blockedOrigins] }, null, 2));
    if (new URL(page.url()).pathname !== "/plan/pay/result") throw new Error("CARD_AUTH_INSPECTION_ONLY: no card number or cardholder authentication was submitted");
  }
  await page.waitForURL((url: URL) => url.origin === origin && url.pathname === "/plan/pay/result", { timeout: 90_000 });
  const returned = new URL(page.url());
  assert.equal(returned.searchParams.get("status"), "ok", `Provider callback returned ${returned.searchParams.get("status")}`);
  assert.equal(returned.searchParams.get("orderId"), orderId);
  assert.equal(returned.searchParams.get("planId"), planId);
  const approved = await db.from("payment_orders").select("status,amount,payment_key,provider_status,confirmed_at,raw_response").eq("order_id", orderId).single();
  assert.ifError(approved.error); assert.equal(approved.data.status, "done");
  assert.equal(approved.data.provider_status, "NICEPAY_sandbox"); assert.equal(approved.data.amount, amount);
  assert.equal(approved.data.raw_response.resultCode, "0000"); assert.equal(approved.data.raw_response.status, "paid");
  assert(!("authToken" in approved.data.raw_response)); assert(!("buyerEmail" in approved.data.raw_response));
  const access = await (await context.request.get(`${origin}/api/plan/access?planId=${planId}`)).json();
  assert.equal(access.paid, true);
  providerApprovalVerified = true;
  checks.push("real sandbox authentication and server approval return to the app and grant the local document entitlement");
  assert.equal(prepareCalls, 1);
  assert(callbackBody, "Provider authentication callback was not observed");
  // Replay the provider's actual signed callback in memory; never persist the token or signature.
  const callback = callbackBody;
  const repeated = await Promise.all([1, 2].map(() => context.request.post(`${origin}/api/payments/plan/return`, {
    data: callback, headers: { "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
  })));
  for (const replay of repeated) {
    assert.equal(replay.status(), 303); assert.equal(new URL(replay.headers().location).searchParams.get("status"), "ok");
  }
  const afterReplay = await db.from("payment_orders").select("status,amount,payment_key,provider_status,confirmed_at,raw_response").eq("order_id", orderId).single();
  assert.ifError(afterReplay.error); assert.deepEqual(afterReplay.data, approved.data);
  checks.push("duplicate checkout clicks create one order and concurrent signed callback replays preserve the first settlement");
  const duplicate = await context.request.post(`${origin}/api/payments/plan/prepare`, { data: { planId, planType }, headers: { Origin: origin } });
  assert.equal(duplicate.status(), 409); assert.equal((await duplicate.json()).error, "already_paid");
  checks.push("a settled document cannot be purchased again");
  const signedIn = await context.storageState();
  await context.close();
  const restored = await browser.newContext({ storageState: signedIn, viewport: { width: 390, height: 844 } });
  await restored.route("**/*", (route: any) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page = await restored.newPage();
  await page.goto(checkoutUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "이 문서는 이미 열려 있습니다", exact: true }).waitFor();
  const restoredAccess = await (await restored.request.get(`${origin}/api/plan/access?planId=${planId}`)).json();
  assert.equal(restoredAccess.paid, true);
  const restoredState = await (await restored.request.get(`${origin}/api/plan/state`)).json();
  assert(restoredState.plans.some((plan: { id: string }) => plan.id === planId));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(output, "restored-paid-mobile.png"), fullPage: true });
  checks.push("a new browser context restores the same business and paid entitlement without offering another payment");
} catch (error) {
  errors.push(redact(error instanceof Error ? error.message : String(error)));
  if (page) await page.screenshot({ path: join(output, "error.png"), fullPage: true, timeout: 5000 }).catch(() => {});
} finally {
  await browser?.close();
  app.kill("SIGTERM");
  const force = setTimeout(() => app.kill("SIGKILL"), 5000); await exited; clearTimeout(force);
  const report = { run, passed: errors.length === 0 && providerApprovalVerified, checks, errors, orderId, amount, database: "isolated-local-supabase", pgMode: "sandbox", blockedOrigins: [...blockedOrigins], providerApprovalVerified, realCharges: 0, paidAiCalls: 0, productionModified: false, serverStopped: true, notVerified: ["Live merchant payment", "Refund and entitlement revocation", "Provider failure and cancellation callbacks", "Production browser checkout"], at: new Date().toISOString() };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  if (errors.length) await writeFile(join(output, "server.log"), redact(logs), { mode: 0o600 });
  console.log(JSON.stringify({ ...report, output }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
