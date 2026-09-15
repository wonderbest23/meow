import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const buildRoot = process.argv[2];
assert(buildRoot && /^\/private\/tmp\/oneul-staging-build-[a-zA-Z0-9]+$/.test(buildRoot), "An isolated staging build is required");
const build = JSON.parse(await readFile(`${buildRoot}/staging-build-report.json`, "utf8"));
assert(build.passed && build.compiledEnvironmentEmpty && build.environmentFiles.length === 0);
assert(!(await readdir(buildRoot)).some(name => /^\.env(?:\.|$)|^\.dev\.vars/.test(name)));
const runtime = process.env.RUNTIME_NODE_MODULES;
assert(runtime, "RUNTIME_NODE_MODULES is required");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const reserve = createServer();
await new Promise<void>(resolve => reserve.listen(0, "127.0.0.1", resolve));
const address = reserve.address();
assert(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((resolve, reject) => reserve.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const output = fileURLToPath(new URL(`../artifacts/local-payment-recovery/${Date.now()}/`, import.meta.url));
await mkdir(output, { recursive: true, mode: 0o700 });
const app = spawn(process.execPath, [`${buildRoot}/node_modules/next/dist/bin/next`, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: buildRoot,
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", APP_ENV: "staging", PAYMENTS_ENABLED: "false", OPERATING_AI_ENABLED: "false", PROPOSAL_AI_ENABLED: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
app.stdout.on("data", data => { logs += String(data); });
app.stderr.on("data", data => { logs += String(data); });
const exited = new Promise<void>(resolve => app.once("exit", () => resolve()));
const checks: string[] = [], errors: string[] = [], screenshots: string[] = [];
const blockedOrigins = new Set<string>();
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (app.exitCode !== null) throw new Error(`Temporary app exited: ${app.exitCode}`);
    try { ready = (await fetch(`${origin}/plan/pay/result?status=pending`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Temporary app did not become ready");
  for (const [requestOrigin, expected] of [["https://untrusted.invalid", 403], [origin, 401]] as const) {
    const response = await fetch(`${origin}/api/payments/plan/reconcile`, { method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify({ orderId: "PB-ui-fixture" }) });
    assert.equal(response.status, expected);
  }
  checks.push("real HTTP rejects cross-origin and unauthenticated recovery requests");
  const callback = await fetch(`${origin}/api/payments/plan/return`, { method: "POST", body: new URLSearchParams({ authResultCode: "9999" }), redirect: "manual" });
  assert.equal(callback.status, 303);
  assert.equal(new URL(callback.headers.get("location")!).origin, origin);
  assert.equal(new URL(callback.headers.get("location")!).searchParams.get("status"), "fail");
  assert.equal(callback.headers.get("cache-control"), "no-store");
  checks.push("invalid payment callback returns a non-cacheable failure redirect");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", (route: any) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    blockedOrigins.add(url.origin); return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error: Error) => errors.push(error.message));
  const url = `${origin}/plan/pay/result?status=pending&orderId=PB-ui-fixture&planId=plan-ui-fixture`;
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "결제 결과를 확인하고 있어요" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "다시 시도하기" }).count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const button = await page.getByRole("button", { name: "결제 결과 확인" }).boundingBox();
    assert(button && button.height >= 40 && button.x >= 0 && button.x + button.width <= viewport.width);
    const screenshot = `${output}pending-${viewport.width}.png`;
    await page.screenshot({ path: screenshot, fullPage: true }); screenshots.push(screenshot);
  }
  checks.push("mobile and desktop pending screens fit and do not offer another payment");
  await page.getByRole("button", { name: "결제 결과 확인" }).click();
  const login = page.getByRole("link", { name: "로그인하고 결과 확인" });
  await login.waitFor();
  const loginUrl = new URL((await login.getAttribute("href"))!, origin);
  assert.equal(new URL(loginUrl.searchParams.get("next")!, origin).searchParams.get("orderId"), "PB-ui-fixture");
  checks.push("real HTTP 401 offers login with the same order return URL");
  await page.goto(url, { waitUntil: "networkidle" });
  let calls = 0;
  let answer: (value: { status: string }) => void = () => {};
  const result = new Promise<{ status: string }>(resolve => { answer = resolve; });
  const recoveryRoute = `${origin}/api/payments/plan/reconcile`;
  await context.route(recoveryRoute, async (route: any) => {
    calls++;
    assert.equal(route.request().postDataJSON().orderId, "PB-ui-fixture");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(await result) });
  });
  await page.getByRole("button", { name: "결제 결과 확인" }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await page.getByRole("button", { name: "확인 중", exact: true }).waitFor();
  assert(await page.getByRole("button", { name: "확인 중", exact: true }).isDisabled());
  answer({ status: "ok" });
  await page.getByRole("heading", { name: "결제가 완료되었습니다" }).waitFor();
  assert.equal(calls, 1);
  checks.push("mocked recovery success changes the view and duplicate clicks send one request");
  await context.unroute(recoveryRoute);
  await context.route(recoveryRoute, (route: any) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "SYNTHETIC_OUTAGE" }) }));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "결제 결과 확인" }).click();
  await page.getByText("아직 결과를 확인하지 못했습니다. 다시 결제하지 말고 잠시 후 확인해주세요.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "다시 시도하기" }).count(), 0);
  checks.push("mocked lookup outage stays pending without offering another payment");
  assert.deepEqual(errors, []);
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  app.kill("SIGTERM");
  const timer = setTimeout(() => app.kill("SIGKILL"), 5000);
  await exited; clearTimeout(timer);
  await writeFile(`${output}server.log`, logs, { mode: 0o600 });
  const report = { buildRoot, passed: errors.length === 0, checks, errors, screenshots, blockedOrigins: [...blockedOrigins], localOnly: true, realPgCalls: 0, paidAiCalls: 0, visualRecoveryResponsesMocked: true, serverStopped: true };
  await writeFile(`${output}report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ output, ...report }, null, 2));
}
