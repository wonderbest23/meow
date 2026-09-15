import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { LAB_URL, localCredentials } from "./local-account-lab.mts";
import { seedRewriteFixture, changeFixturePrice, mockRewrite, rewriteRequest } from "./proposal-rewrite-fixture";
import { saveProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { previewProposalRewrite, runProposalRewrite, type RewriteRuntime } from "../lib/plan-builder/proposal-rewrite-service";
import { createPlanOrder, markPlanOrderPaid } from "../lib/payments/plan-orders";

const credentials = await localCredentials();
assert.equal(credentials.apiUrl, "http://127.0.0.1:55431");
Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey, PLAN_ACCOUNT_LINKING_ENABLED: "true", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
const transport = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.equal(url.origin, credentials.apiUrl, "Only isolated local Supabase calls are allowed"); return transport(input, init); };
const modules = process.env.RUNTIME_NODE_MODULES; assert(modules);
const { chromium } = createRequire(`${modules}/package.json`)("playwright");
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const root = "/private/tmp/oneul-proposal-rewrite-20260914";
await mkdir(root, { recursive: true });
const live = JSON.parse(await readFile(new URL("../artifacts/proposal-rewrite-20260914/live-result.json", import.meta.url), "utf8"));
assert.equal(live.synthetic, true); assert.equal(live.job.status, "ready");
const runId = Date.now().toString(36), planId = `rewrite_${runId}`, email = `qa-rewrite-${runId}@example.invalid`, password = `LocalOnly!${randomUUID()}`;
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true }); assert.equal(error, null); assert(data.user);
const owner = createHash("sha256").update(createHmac("sha256", credentials.authSecret).update(`today-startup:${data.user.id}`).digest("base64url")).digest("hex");
const fixture = await seedRewriteFixture(owner, planId);
const manual = { "proposal-summary": { text: { title: "우리 고객에게 전하는 소개" }, layout: { title: { x: 1.1, y: 1.6, w: 9, h: .9 } } }, "proposal-offering": { text: { title: "직접 고친 제공 범위" } } };
await saveProposalEditor(owner, planId, { type: "save", requestId: randomUUID(), expectedRevision: 1, edits: manual });
await changeFixturePrice(owner, planId, fixture.commercialKey);
const replay: RewriteRuntime = { target: live.job.preview.target, generate: async payload => {
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), live.input);
  return { result: mockRewrite({ ...payload, slides: live.job.slides }), usage: live.job.usage };
} };
const preview = await previewProposalRewrite(owner, planId, replay);
const request = rewriteRequest(preview);
const ready = await runProposalRewrite(owner, planId, request, replay); assert.equal(ready.rewrite?.status, "ready", ready.rewrite?.error);
const order = await createPlanOrder({ ownerId: data.user.id, guestTokenHash: owner, customerEmail: email, planId, planType: "일반 사업계획서", product: "plan" });
await markPlanOrderPaid({ orderId: order.orderId, tid: `local-rewrite-${runId}`, raw: { synthetic: true, noPgCall: true } });
const budgetPath = new URL("../artifacts/synthetic-ai-launch/budget.json", import.meta.url);
const budgetBefore = await readFile(budgetPath, "utf8");
const checks: string[] = [], errors: string[] = [], screenshots: string[] = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await context.route("**/*", (route: any) => new URL(route.request().url()).origin === LAB_URL ? route.continue() : route.abort());
const page = await context.newPage(); page.on("pageerror", (e: Error) => errors.push(e.message));
const endpoint = `${LAB_URL}/api/plan/proposal?planId=${planId}`, url = `${LAB_URL}/plan/proposal?planId=${planId}`;
try {
  const login = await context.request.post(`${LAB_URL}/api/auth/login`, { data: { email, password } }); assert.equal(login.status(), 200);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByLabel("슬라이드 제목", { exact: true }).waitFor();
  const current = await (await context.request.get(endpoint)).json(); assert.equal(current.saved.rewrite.status, "ready");
  assert.equal(current.saved.document.deck.slides.find((slide: any) => slide.id === "proposal-commercial").table.rows[0][1], "150만원");
  checks.push("A real AI result is persisted in isolated Supabase and does not replace the old proposal before approval");
  await page.getByRole("button", { name: "새 문안 검토", exact: true }).click();
  const panel = page.getByRole("region", { name: "원문 변경 반영", exact: true });
  await panel.getByText("연관 페이지 3장", { exact: true }).waitFor();
  assert.equal(await panel.locator("article").count(), 3);
  assert(await panel.getByRole("button", { name: "확인한 문안 반영", exact: true }).isDisabled());
  await panel.locator("article").filter({ hasText: "우리 고객에게 전하는 소개" }).getByLabel("내 문안 유지", { exact: true }).check();
  await panel.locator("article").filter({ hasText: "직접 고친 제공 범위" }).getByLabel("새 문안으로 교체", { exact: true }).check();
  const desktop = `${root}/desktop-review.png`; await page.screenshot({ path: desktop }); screenshots.push(desktop);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal page overflow at ${width}px`);
    const table = panel.locator("table").first(); assert(await table.isVisible());
    if (width === 390) { const file = `${root}/mobile-review.png`; await panel.screenshot({ path: file }); screenshots.push(file); }
  }
  checks.push("Before/after content, tables, explicit manual choices and responsive review at 320/390/768/1440px");
  let lostResponse = true;
  await context.route(`${LAB_URL}/api/plan/proposal`, async (route: any) => {
    if (route.request().method() === "POST" && route.request().postDataJSON().command.type === "apply" && lostResponse) { lostResponse = false; const response = await route.fetch(); assert.equal(response.status(), 200); return route.abort(); }
    return route.continue();
  });
  await panel.getByRole("button", { name: "확인한 문안 반영", exact: true }).click();
  await page.getByRole("region", { name: "원문 변경 반영", exact: true }).waitFor({ state: "hidden" });
  const applied = await (await context.request.get(endpoint)).json();
  assert.equal(applied.saved.revision, ready.revision + 1); assert.equal(applied.sourceChanged, false);
  assert.equal(applied.saved.document.edits["proposal-summary"].text.title, manual["proposal-summary"].text.title);
  assert.deepEqual(applied.saved.document.edits["proposal-summary"].layout, manual["proposal-summary"].layout);
  assert.equal(applied.saved.document.edits["proposal-offering"].text, undefined);
  await context.unroute(`${LAB_URL}/api/plan/proposal`);
  checks.push("Approval survives a lost HTTP response, applies once and preserves selected manual text and layout");
  const retry = await context.request.post(`${LAB_URL}/api/plan/proposal`, { data: { planId, command: { type: "apply", id: request.id, expectedRevision: ready.revision, choices: { "proposal-summary": "keep_manual", "proposal-offering": "use_revised" } } } });
  assert.equal(retry.status(), 200); assert.equal((await retry.json()).saved.revision, applied.saved.revision);
  const ordinary = await context.request.get(`${LAB_URL}/api/plan/deck?planId=${planId}&download=1`); assert.equal(ordinary.status(), 200);
  const file = `${root}/updated-b2b-proposal.pptx`; await writeFile(file, await ordinary.body());
  const zip = await JSZip.loadAsync(await readFile(file));
  for (const item of preview.impact.affected) {
    const index = applied.saved.document.deck.slides.findIndex((slide: any) => slide.id === item.slideId) + 1;
    const xml = await zip.file(`ppt/slides/slide${index}.xml`)!.async("string");
    assert(xml.includes("180만원"), `New price in ${item.slideId}`); assert(!xml.includes("150만원"));
  }
  assert((await zip.file("ppt/slides/slide2.xml")!.async("string")).includes(`x="${Math.round(1.1 * 914400)}"`));
  checks.push("Standard PPT download uses the approved content and preserves native editable placement");
  page.on("dialog", (dialog: any) => dialog.accept());
  await page.getByRole("button", { name: "버전 기록", exact: true }).click();
  const versions = page.locator("section").filter({ has: page.getByRole("heading", { name: "버전 기록", exact: true }) });
  await versions.getByRole("button").first().click();
  await page.getByRole("region", { name: "원문 변경 반영", exact: true }).waitFor();
  const restored = await (await context.request.get(endpoint)).json();
  assert.equal(restored.saved.document.deck.slides.find((slide: any) => slide.id === "proposal-commercial").table.rows[0][1], "150만원");
  assert(restored.sourceChanged);
  await versions.getByRole("button").first().click();
  await page.getByRole("region", { name: "원문 변경 반영", exact: true }).waitFor({ state: "hidden" });
  checks.push("Version history restores both old slide content and its original source, and can restore the approved update again");
  await context.request.post(`${LAB_URL}/api/auth/logout`); await context.close();
  const reconnect = await browser.newContext();
  assert.equal((await reconnect.request.get(endpoint)).status(), 404);
  await reconnect.request.post(`${LAB_URL}/api/auth/login`, { data: { email, password } });
  const again = await reconnect.newPage(); await again.goto(url, { waitUntil: "domcontentloaded" });
  await again.getByLabel("슬라이드 제목", { exact: true }).waitFor();
  const persisted = await (await reconnect.request.get(endpoint)).json(); assert.equal(persisted.sourceChanged, false);
  assert.equal((await reconnect.request.get(`${endpoint}&download=1&revision=${persisted.saved.revision}`)).status(), 200);
  assert.equal((await reconnect.request.get(`${endpoint}&download=1&revision=1`)).status(), 409);
  assert.equal((await reconnect.request.post(`${LAB_URL}/api/plan/proposal`, { data: { planId, command: rewriteRequest(preview) } })).status(), 503);
  checks.push("Fresh login and revision-bound download retain the update; public AI transmission remains server-blocked");
  assert.equal(await readFile(budgetPath, "utf8"), budgetBefore); assert.deepEqual(errors, []);
  await writeFile(`${root}/browser-fixture.json`, JSON.stringify({ email, password, planId, url }), { mode: 0o600 });
} catch (error) {
  errors.push(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1;
  await page.screenshot({ path: `${root}/failure.png` }).catch(() => undefined);
} finally {
  await browser.close(); globalThis.fetch = transport;
  await writeFile(`${root}/report.json`, JSON.stringify({ checks, errors, screenshots, realAiResultReplayed: true, additionalPaidAiCalls: 0, realPayments: 0, localOnly: true }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ checks, errors, screenshots }, null, 2));
}
