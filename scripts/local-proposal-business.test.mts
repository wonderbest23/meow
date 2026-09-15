import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { LAB_URL, localCredentials } from "./local-account-lab.mts";
import { seedBusinessRewriteFixture, mockRewrite } from "./proposal-rewrite-fixture";
import { loadProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { previewProposalRewrite, runProposalRewrite, type RewriteRuntime } from "../lib/plan-builder/proposal-rewrite-service";
import { loadPlanState } from "../lib/plan-builder/plan-server-store";
import { createPlanOrder, markPlanOrderPaid } from "../lib/payments/plan-orders";
import { verifyDocumentRefreshBrowser } from "./local-document-refresh-browser.mts";

const credentials = await localCredentials();
assert.equal(credentials.apiUrl, "http://127.0.0.1:55431");
Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey, PLAN_ACCOUNT_LINKING_ENABLED: "true", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
const transport = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.equal(url.origin, credentials.apiUrl); return transport(input, init); };
const modules = process.env.RUNTIME_NODE_MODULES; assert(modules);
const { chromium } = createRequire(`${modules}/package.json`)("playwright");
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const refreshDocuments = process.env.PROPOSAL_DOCUMENT_REFRESH_TEST === "1";
const root = refreshDocuments ? "/private/tmp/oneul-document-refresh-20260914" : "/private/tmp/oneul-proposal-business-20260914"; await mkdir(root, { recursive: true });
const runId = Date.now().toString(36), planId = `business_${runId}`, email = `qa-business-${runId}@example.invalid`, password = `LocalOnly!${randomUUID()}`;
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true }); assert.equal(error, null); assert(data.user);
const owner = createHash("sha256").update(createHmac("sha256", credentials.authSecret).update(`today-startup:${data.user.id}`).digest("base64url")).digest("hex");
const fixture = await seedBusinessRewriteFixture(owner, planId);
const order = await createPlanOrder({ ownerId: data.user.id, guestTokenHash: owner, customerEmail: email, planId, planType: "일반 사업계획서", product: "plan" });
await markPlanOrderPaid({ orderId: order.orderId, tid: `local-business-${runId}`, raw: { synthetic: true, noPgCall: true } });
const budgetPath = new URL("../artifacts/synthetic-ai-launch/budget.json", import.meta.url), budgetBefore = await readFile(budgetPath, "utf8");
const checks: string[] = [], errors: string[] = [];
let mockCalls = 0, documentMockCalls = 0;
const mock: RewriteRuntime = { target: { provider: "mock", model: "local-synthetic-only" }, generate: async payload => { mockCalls++; return { result: mockRewrite(payload) }; } };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await context.route("**/*", (route: any) => new URL(route.request().url()).origin === LAB_URL ? route.continue() : route.abort());
const page = await context.newPage(); page.on("pageerror", (error: Error) => errors.push(error.message));
const endpoint = `${LAB_URL}/api/plan/proposal?planId=${planId}`, url = `${LAB_URL}/plan/proposal?planId=${planId}`;
try {
  assert.equal((await context.request.post(`${LAB_URL}/api/auth/login`, { data: { email, password } })).status(), 200);
  await page.goto(url, { waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: "조건 수정", exact: true }).click();
  const business = page.getByRole("region", { name: "공통 사업 조건", exact: true });
  assert.equal(await business.getByLabel("건당 판매가", { exact: true }).inputValue(), "150만원");
  const second = await context.newPage();
  await second.goto(url, { waitUntil: "domcontentloaded" }); await second.getByRole("button", { name: "조건 수정", exact: true }).click();
  await second.getByLabel("건당 판매가", { exact: true }).fill("200만원");
  await page.bringToFront();
  await business.getByLabel("건당 판매가", { exact: true }).fill("180만원");
  await business.getByText("2,500,000원", { exact: true }).waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}`);
    if (width === 390 || width === 1440) await business.screenshot({ path: `${root}/conditions-${width}.png` });
  }
  let lost = true; const ids: string[] = [];
  await context.route(`${LAB_URL}/api/plan/expert`, async (route: any) => {
    ids.push(route.request().postDataJSON().requestId);
    if (lost) { lost = false; const response = await route.fetch(); assert.equal(response.status(), 200); return route.abort(); }
    return route.continue();
  });
  await business.getByRole("button", { name: "공통 조건 저장", exact: true }).click();
  await business.getByRole("button", { name: "같은 요청으로 저장 확인", exact: true }).click();
  await business.getByText("공통 조건을 저장했어요. 기존 문서와 제안서는 보관되어 있어요", { exact: true }).waitFor();
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]); await context.unroute(`${LAB_URL}/api/plan/expert`);
  let state = await (await context.request.get(endpoint)).json();
  assert.equal(state.business.revision, 2); assert.equal(state.business.documents.current, 0);
  assert.equal(state.saved.document.deck.slides.find((slide: any) => slide.id === "proposal-commercial").table.rows[0][1], "150만원");
  assert.equal((await context.request.get(`${endpoint}&preview=source`)).status(), 409);
  await second.bringToFront(); await second.evaluate(() => window.dispatchEvent(new Event("focus")));
  await second.getByText("다른 화면에서 사업 정보를 수정했어요. 작성한 값은 유지됩니다", { exact: true }).waitFor();
  assert.equal(await second.getByLabel("건당 판매가", { exact: true }).inputValue(), "200만원");
  assert(await second.getByRole("button", { name: "공통 조건 저장", exact: true }).isDisabled());
  second.on("dialog", (dialog: any) => dialog.accept());
  await second.getByRole("button", { name: "저장된 조건 불러오기", exact: true }).click();
  assert.equal(await second.getByLabel("건당 판매가", { exact: true }).inputValue(), "180만원");
  await second.close(); await page.bringToFront();
  checks.push("Common price edit recalculates planned profit, survives a lost response with one save, and keeps old PPT/source blocked");
  checks.push("A second tab retains its unsaved input and blocks stale overwrite until the user chooses current server conditions");
  if (refreshDocuments) {
    const result = await verifyDocumentRefreshBrowser({ page, context, owner, planId, root }); documentMockCalls = result.calls; checks.push(...result.checks);
  } else {
  await business.getByRole("link", { name: "계획서 확인", exact: true }).click();
  const reviews = page.getByLabel("최신 사업 조건 검토", { exact: true }); await reviews.first().waitFor();
  await reviews.first().locator("summary").click();
  await reviews.first().getByText("180만원", { exact: true }).waitFor();
  assert(await reviews.first().getByRole("button", { name: "현재 조건으로 검토 완료", exact: true }).isDisabled());
  await reviews.first().getByRole("checkbox").check();
  await reviews.first().screenshot({ path: `${root}/document-review.png` });
  await reviews.first().getByRole("button", { name: "현재 조건으로 검토 완료", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="최신 사업 조건 검토"]').length === 1);
  // The remaining synthetic sections are explicitly reviewed through the real document API.
  for (const key of fixture.keys) {
    const plan = (await loadPlanState(owner)).plans[0]; let section = plan.sections[key];
    if (section.coachRevision === 2) continue;
    if (key === fixture.commercialKey) {
      const response = await context.request.patch(`${LAB_URL}/api/plan/document/section`, { data: { planId, key, action: "save", baseGeneratedAt: section.generatedAt, markdown: section.markdown.replaceAll("150만원", "180만원") } });
      assert.equal(response.status(), 200); section = (await response.json()).section;
    }
    const response = await context.request.patch(`${LAB_URL}/api/plan/document/section`, { data: { planId, key, action: "review", baseGeneratedAt: section.generatedAt, sourceRevision: 2 } });
    assert.equal(response.status(), 200);
  }
  checks.push("Document screen exposes current conditions and requires explicit review; real section API preserves edits and records latest revision");
  }
  await page.goto(url, { waitUntil: "domcontentloaded" }); await page.getByLabel("슬라이드 제목", { exact: true }).waitFor();
  state = await (await context.request.get(endpoint)).json(); assert.equal(state.business.documents.current, 9);
  const closed = await (await context.request.get(`${endpoint}&preview=source`)).json(); assert.equal(closed.target, null);
  assert.equal((await context.request.post(`${LAB_URL}/api/plan/proposal`, { data: { planId, command: { type: "generate", id: randomUUID(), hash: closed.hash, consent: true } } })).status(), 503);
  await context.route(`${LAB_URL}/api/plan/proposal**`, async (route: any) => {
    const request = route.request(), parsed = new URL(request.url());
    if (request.method() === "GET" && parsed.searchParams.get("preview") === "source") return route.fulfill({ json: await previewProposalRewrite(owner, planId, mock) });
    if (request.method() === "POST" && request.postDataJSON().command.type === "generate") {
      assert.equal(request.postDataJSON().command.consent, true);
      await runProposalRewrite(owner, planId, request.postDataJSON().command, mock);
      return route.fulfill({ json: await loadProposalEditor(owner, planId) });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "변경분 확인", exact: true }).click();
  const panel = page.getByRole("region", { name: "원문 변경 반영", exact: true });
  const consent = panel.getByRole("checkbox"); await consent.waitFor();
  assert.equal(mockCalls, 0); assert(await panel.getByRole("button", { name: "동의한 자료로 새 문안 작성", exact: true }).isDisabled());
  await panel.getByText("전송 자료 전체 보기", { exact: true }).click();
  assert((await panel.locator("pre").last().innerText()).includes("180만원"));
  await consent.check(); await panel.screenshot({ path: `${root}/transmission-preview.png` });
  await panel.getByRole("button", { name: "동의한 자료로 새 문안 작성", exact: true }).click();
  await panel.getByRole("button", { name: "확인한 문안 반영", exact: true }).click();
  await panel.waitFor({ state: "hidden" }); assert.equal(mockCalls, 1);
  checks.push("Payload/target preview and unchecked consent gate drive local mocked rewriting; three related pages apply only after approval");
  await context.unroute(`${LAB_URL}/api/plan/proposal**`);
  await page.reload(); await page.getByLabel("슬라이드 제목", { exact: true }).waitFor();
  state = await (await context.request.get(endpoint)).json(); assert.equal(state.sourceChanged, false);
  const download = await context.request.get(`${endpoint}&download=1&revision=${state.saved.revision}`); assert.equal(download.status(), 200);
  const bytes = await download.body(); await writeFile(`${root}/business-updated.pptx`, bytes);
  const zip = await JSZip.loadAsync(bytes);
  const commercial = state.saved.document.deck.slides.findIndex((slide: any) => slide.id === "proposal-commercial") + 1;
  const xml = await zip.file(`ppt/slides/slide${commercial}.xml`)!.async("string"); assert(xml.includes("180만원")); assert(!xml.includes("150만원"));
  await context.request.post(`${LAB_URL}/api/auth/logout`);
  assert.equal((await context.request.get(endpoint)).status(), 404);
  assert.equal((await context.request.post(`${LAB_URL}/api/auth/login`, { data: { email, password } })).status(), 200);
  assert.equal((await context.request.get(`${endpoint}&download=1&revision=${state.saved.revision}`)).status(), 200);
  checks.push("Reload, logout/login and revision-bound native PPT download preserve the approved price; public AI remains blocked");
  assert.equal(await readFile(budgetPath, "utf8"), budgetBefore); assert.deepEqual(errors, []);
  await writeFile(`${root}/browser-fixture.json`, JSON.stringify({ email, password, planId, url }), { mode: 0o600 });
} catch (error) {
  errors.push(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1;
  await page.screenshot({ path: `${root}/failure.png` }).catch(() => undefined);
} finally {
  await browser.close(); globalThis.fetch = transport;
  const report = { checks, errors, mockCalls, documentMockCalls, paidAiCalls: 0, realPayments: 0, localOnly: true, documentRefresh: refreshDocuments ? "mocked generation and explicit per-section approval, not real AI" : "explicit manual edit/review, not AI generation" };
  await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
