import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { LAB_URL, LAB_DB_URL, localCredentials } from "./local-account-lab.mts";
import { createPlanOrder, markPlanOrderPaid } from "../lib/payments/plan-orders";

const credentials = await localCredentials();
const runtime = process.env.RUNTIME_NODE_MODULES; assert(runtime, "Set RUNTIME_NODE_MODULES to the bundled browser runtime");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const root = fileURLToPath(new URL("../artifacts/local-homepage-lifecycle/", import.meta.url));
const fixture = JSON.parse(await readFile(`${root}browser-fixture.json`, "utf8"));
assert.match(fixture.email, /^qa-site-[a-z0-9]+-a@example\.invalid$/);
assert.match(fixture.planId, /^plan_site_[a-z0-9]+$/);
Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
const transport = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  assert([LAB_URL, LAB_DB_URL].includes(url.origin)); return transport(input, init);
};
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const staleOrders = await db.from("payment_orders").update({ status: "refunded" }).eq("owner_id", fixture.userId).contains("opportunity", { planId: fixture.planId, product: "homepage" }).eq("status", "done").like("payment_key", "local-browser-%");
assert.equal(staleOrders.error, null);
const order = await createPlanOrder({ ownerId: fixture.userId, guestTokenHash: fixture.owner, customerEmail: fixture.email, planId: fixture.planId, planType: "일반 사업계획서", product: "homepage" });
await markPlanOrderPaid({ orderId: order.orderId, tid: `local-browser-${order.orderId}`, raw: { synthetic: true, noPgCall: true } });
let browser;
const checks: string[] = [];
const errors: string[] = [];
const blockedOrigins = new Set<string>();
const screenshotPaths: string[] = [];
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.route("**/*", (route: any) => {
    const url = new URL(route.request().url());
    if (url.origin === LAB_URL) return route.continue();
    blockedOrigins.add(url.origin); return route.abort();
  });
  const page = await context.newPage();
  let domainRequests = 0;
  page.on("request", (request: any) => { if (request.method() === "GET" && request.url().endsWith(`/api/projects/${fixture.projectId}/landing/domain`)) domainRequests++; });
  page.on("pageerror", (error: Error) => errors.push(error.message.slice(0, 300)));
  await page.goto(`${LAB_URL}/account?next=%2Fplan%2Fhomepage`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(fixture.email);
  await page.locator('input[autocomplete="current-password"]').fill(fixture.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/plan/homepage");
  await page.getByRole("heading", { name: "내 사업 홈페이지", exact: true }).waitFor();
  checks.push("real email login redirects to the authenticated homepage editor");
  await page.waitForTimeout(5000);
  assert(domainRequests >= 1 && domainRequests <= 3, `Idle homepage must not loop domain requests: ${domainRequests}`);
  checks.push("idle homepage does not repeatedly fetch domain status");
  const apiPath = `/api/projects/${fixture.projectId}/landing`;
  const save = async (value: string) => {
    if (!(await page.locator("#hk-business").getAttribute("open"))) {
      if (!(await page.getByLabel("영업시간", { exact: true }).isVisible())) await page.locator("#hk-business > summary").click();
    }
    await page.getByLabel("영업시간", { exact: true }).fill(value);
    await page.locator("#hk-business input[type=checkbox]").check();
    const [response] = await Promise.all([
      page.waitForResponse((response: any) => response.url().endsWith(apiPath) && response.request().method() === "PUT"),
      page.getByRole("button", { name: "저장", exact: true }).click(),
    ]);
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).site.draft.openHours, value);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#hk-business > summary").click();
    assert.equal(await page.getByLabel("영업시간", { exact: true }).inputValue(), value);
  };
  const publish = async () => {
    const [response] = await Promise.all([
      page.waitForResponse((response: any) => response.url().endsWith(`${apiPath}/publish`) && response.request().method() === "POST"),
      page.getByRole("button", { name: "새 버전 공개", exact: true }).click(),
    ]);
    assert.equal(response.status(), 200);
    assert.equal(typeof response.request().postDataJSON().expectedUpdatedAt, "string");
    return response.json();
  };
  await save("로컬 브라우저 검증 평일 09:00-18:00");
  checks.push("desktop editor saves to the server and survives reload");
  const desktopPublished = await publish();
  checks.push("desktop publish sends the saved version and receives a public snapshot");
  const publicPage = await context.newPage();
  publicPage.on("pageerror", (error: Error) => errors.push(error.message.slice(0, 300)));
  await publicPage.goto(`${LAB_URL}${desktopPublished.publicPath}`, { waitUntil: "networkidle" });
  assert((await publicPage.title()).includes(`QA 새벽커피 ${fixture.runId}`));
  const leadEmail = `browser-${Date.now()}@example.invalid`;
  await publicPage.locator('#landing-contact input[name="name"]').fill("가상 브라우저 문의자");
  await publicPage.locator('#landing-contact input[name="email"]').fill(leadEmail);
  await publicPage.locator('#landing-contact input[type="checkbox"]').first().check();
  const [leadResponse] = await Promise.all([
    publicPage.waitForResponse((response: any) => response.url().includes("/api/public/landing/") && response.url().endsWith("/lead")),
    publicPage.locator('#landing-contact button[type="submit"]').click(),
  ]);
  assert.equal(leadResponse.status(), 201);
  await publicPage.getByRole("heading", { name: "신청이 접수되었습니다" }).waitFor();
  checks.push("the public browser form accepts a synthetic inquiry with consent");
  const desktopPath = `${root}${fixture.runId}-public-desktop.png`;
  await publicPage.screenshot({ path: desktopPath, fullPage: true }); screenshotPaths.push(desktopPath);
  await publicPage.close();
  await page.locator("#hk-leads > summary").click();
  await page.getByRole("button", { name: "문의 새로고침" }).click();
  await page.locator("#hk-leads").getByText(leadEmail, { exact: true }).waitFor();
  checks.push("owner refresh shows the inquiry submitted through the public form");
  const failedLeadLoad = (route: any) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "local simulated outage" }) });
  await context.route(`${LAB_URL}${apiPath}`, failedLeadLoad);
  await page.getByRole("button", { name: "문의 새로고침" }).click();
  await page.locator("#hk-leads [role=alert]").waitFor();
  assert(!(await page.locator("#hk-leads").innerText()).includes("0건"));
  await context.unroute(`${LAB_URL}${apiPath}`, failedLeadLoad);
  await page.getByRole("button", { name: "문의 새로고침" }).click();
  await page.locator("#hk-leads").getByText(leadEmail, { exact: true }).waitFor();
  checks.push("a failed inquiry refresh shows an error, not zero inquiries, and retries successfully");
  await page.setViewportSize({ width: 390, height: 844 });
  await save("로컬 모바일 검증 평일 10:00-17:00");
  checks.push("390px mobile editor saves and restores the changed field");
  await publish(); checks.push("mobile publish reaches the version-checked API");
  await page.locator("#hk-leads > summary").click();
  await page.locator("#hk-leads").getByText(leadEmail, { exact: true }).waitFor();
  const toolbarVisible = await page.locator(".hk-mock-actions").evaluate((element: HTMLElement) => {
    const frame = element.closest(".hk-mock")!.getBoundingClientRect();
    return [...element.querySelectorAll("button")].every(button => {
      const bounds = button.getBoundingClientRect();
      return bounds.left >= frame.left && bounds.right <= frame.right && bounds.height >= 40;
    });
  });
  assert(toolbarVisible, "Mobile editor toolbar buttons must fit inside the preview frame");
  checks.push("mobile editor actions are fully visible with accessible tap heights");
  await page.evaluate(() => window.scrollTo(0, 0));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile page must not overflow horizontally");
  const mobilePath = `${root}${fixture.runId}-editor-mobile.png`;
  await page.screenshot({ path: mobilePath, fullPage: true }); screenshotPaths.push(mobilePath);
  assert.deepEqual(errors, []);
  checks.push("no browser runtime errors or mobile horizontal overflow");
} catch (error) {
  errors.push(error instanceof Error ? error.message.slice(0, 500) : "Browser verification failed"); process.exitCode = 1;
  for (const [index, page] of (browser?.contexts()[0]?.pages() ?? []).entries()) {
    const failure = `${root}${fixture.runId}-browser-failure-${index}.png`;
    await page.screenshot({ path: failure }).catch(() => undefined); screenshotPaths.push(failure);
  }
} finally {
  await browser?.close();
  const cleanup = await db.from("payment_orders").update({ status: "refunded" }).eq("order_id", order.orderId);
  if (cleanup.error) { errors.push("Local fixture entitlement cleanup failed"); process.exitCode = 1; }
  globalThis.fetch = transport;
  await writeFile(`${root}browser-report.json`, JSON.stringify({ runId: fixture.runId, checks, errors, screenshotPaths, blockedOrigins: [...blockedOrigins], localOnly: true, realPayments: 0, paidAiCalls: 0 }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ checks, errors, screenshotPaths }));
}
