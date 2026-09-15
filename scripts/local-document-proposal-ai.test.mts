import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { LAB_URL, localCredentials } from "./local-account-lab.mts";
import { seedBusinessRewriteFixture, mockRewrite } from "./proposal-rewrite-fixture";
import { loadPlanState } from "../lib/plan-builder/plan-server-store";
import { loadProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { previewDocumentRefresh, executeDocumentRefresh, type DocumentRefreshRuntime } from "../lib/plan-builder/document-refresh-service";
import { previewProposalRewrite, executeProposalRewrite, type RewriteRuntime } from "../lib/plan-builder/proposal-rewrite-service";
import { queueProposalUpdate, type ProposalBackgroundJob } from "../lib/plan-builder/proposal-background";
import { createPlanOrder, markPlanOrderPaid } from "../lib/payments/plan-orders";

const credentials = await localCredentials();
assert.equal(credentials.apiUrl, "http://127.0.0.1:55431");
Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey, PLAN_ACCOUNT_LINKING_ENABLED: "true", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PROPOSAL_AI_ENABLED: "false" });
const transport = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.equal(url.origin, credentials.apiUrl); return transport(input, init); };
const modules = process.env.RUNTIME_NODE_MODULES; assert(modules);
const { chromium } = createRequire(`${modules}/package.json`)("playwright");
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const root = "/private/tmp/oneul-document-proposal-ai-20260914"; await mkdir(root, { recursive: true });
const artifacts = new URL("../artifacts/document-proposal-ai-20260914/", import.meta.url);
const documentResult = JSON.parse(await readFile(new URL("document-result.json", artifacts), "utf8"));
const pptResult = JSON.parse(await readFile(new URL("ppt-result.json", artifacts), "utf8"));
for (const result of [documentResult, pptResult]) { assert.equal(result.synthetic, true); assert.equal(result.job.status, "ready"); }
const budgetPath = new URL("../artifacts/synthetic-ai-launch/budget.json", import.meta.url), budgetBefore = await readFile(budgetPath, "utf8");
const runId = Date.now().toString(36), planId = `ai_chain_${runId}`, email = `qa-ai-chain-${runId}@example.invalid`, password = `LocalOnly!${randomUUID()}`;
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true }); assert.equal(error, null); assert(data.user);
const owner = createHash("sha256").update(createHmac("sha256", credentials.authSecret).update(`today-startup:${data.user.id}`).digest("base64url")).digest("hex");
const fixture = await seedBusinessRewriteFixture(owner, planId);
const order = await createPlanOrder({ ownerId: data.user.id, guestTokenHash: owner, customerEmail: email, planId, planType: "일반 사업계획서", product: "plan" });
await markPlanOrderPaid({ orderId: order.orderId, tid: `local-ai-chain-${runId}`, raw: { synthetic: true, noPgCall: true } });
let documentReplays = 0, pptReplays = 0;
const documentRuntime: DocumentRefreshRuntime = { target: documentResult.job.preview.target, generate: async (payload, usage) => {
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), documentResult.input); documentReplays++;
  documentResult.job.usage.forEach((item: any) => usage?.(item));
  return { sections: documentResult.job.drafts.map(({ key, markdown, summary }: any) => ({ key, markdown, summary })) };
} };
const pptRuntime: RewriteRuntime = { target: pptResult.job.preview.target, generate: async payload => {
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), pptResult.input); pptReplays++;
  return { result: mockRewrite({ ...payload, slides: pptResult.job.slides }), usage: pptResult.job.usage };
} };
const jobs = new Map<string, ProposalBackgroundJob>(), attempts = new Map<string, number>(), ids: Record<string, string[]> = {};
const binding = {
  create: async ({ id, params }: { id: string; params: ProposalBackgroundJob }) => {
    const count = (attempts.get(params.operation) ?? 0) + 1; attempts.set(params.operation, count);
    if (count === 1) throw new Error("Simulated dispatch outage");
    jobs.set(id, params); return { id };
  },
  get: async (id: string) => { if (!jobs.has(id)) throw new Error("Not dispatched"); return { status: async () => ({ status: "queued" }) }; },
} as unknown as NonNullable<Parameters<typeof queueProposalUpdate>[3]>;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await context.route("**/*", (route: any) => new URL(route.request().url()).origin === LAB_URL ? route.continue() : route.abort());
const page = await context.newPage(), checks: string[] = [], errors: string[] = [];
page.on("pageerror", (error: Error) => errors.push(error.message));
const endpoint = `${LAB_URL}/api/plan/proposal?planId=${planId}`, url = `${LAB_URL}/plan/proposal?planId=${planId}`;
try {
  assert.equal((await context.request.post(`${LAB_URL}/api/auth/login`, { data: { email, password } })).status(), 200);
  assert.equal((await context.request.patch(`${LAB_URL}/api/plan/expert`, { data: { planId, revision: 1, requestId: randomUUID(), fields: [{ key: "price", value: "180만원" }] } })).status(), 200);
  for (const key of fixture.keys.filter(key => key !== fixture.commercialKey)) {
    const section = (await loadPlanState(owner)).plans[0].sections[key]; assert(!section.markdown.includes("150만원"));
    assert.equal((await context.request.patch(`${LAB_URL}/api/plan/document/section`, { data: { planId, key, action: "review", baseGeneratedAt: section.generatedAt, sourceRevision: 2 } })).status(), 200);
  }
  await context.route(`${LAB_URL}/api/plan/proposal**`, async (route: any) => {
    const request = route.request(), parsed = new URL(request.url());
    try {
      if (request.method() === "GET" && parsed.searchParams.get("preview") === "document") return route.fulfill({ json: await previewDocumentRefresh(owner, planId, parsed.searchParams.getAll("section"), documentRuntime) });
      if (request.method() === "GET" && parsed.searchParams.get("preview") === "source") return route.fulfill({ json: await previewProposalRewrite(owner, planId, pptRuntime) });
      const command = request.method() === "POST" ? request.postDataJSON().command : null;
      if (command && ["document_generate", "generate"].includes(command.type)) {
        (ids[command.type] ??= []).push(command.id); assert.equal(command.consent, true);
        const document = command.type === "document_generate";
        await queueProposalUpdate(owner, planId, command, binding, document ? documentRuntime : pptRuntime);
        if (document) await executeDocumentRefresh(owner, planId, command.id, documentRuntime);
        else await executeProposalRewrite(owner, planId, command.id, pptRuntime);
        return route.fulfill({ status: 202, json: await loadProposalEditor(owner, planId) });
      }
      return route.continue();
    } catch (error) { return route.fulfill({ status: 503, json: { message: error instanceof Error ? error.message : "Test dispatch failure" } }); }
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const documentPanel = page.getByRole("region", { name: "계획서 갱신 검토", exact: true });
  await documentPanel.getByRole("button", { name: "계획서 갱신", exact: true }).click();
  await documentPanel.locator("fieldset").first().getByRole("checkbox").check();
  await documentPanel.getByRole("button", { name: "선택한 전송 자료 확인", exact: true }).click();
  const transmission = documentPanel.getByRole("region", { name: "계획서 전송 자료 확인", exact: true });
  const generate = transmission.getByRole("button", { name: "동의한 자료로 본문 갱신", exact: true });
  await generate.waitFor(); assert(await generate.isDisabled()); await transmission.getByRole("checkbox").check(); await generate.click();
  await documentPanel.getByRole("button", { name: "같은 요청으로 실행 접수 확인", exact: true }).waitFor();
  assert.equal(documentReplays, 0);
  await page.reload(); await documentPanel.getByRole("button", { name: "계획서 갱신", exact: true }).click();
  await documentPanel.getByRole("button", { name: "같은 요청으로 실행 접수 확인", exact: true }).click();
  await documentPanel.getByRole("button", { name: "선택한 본문 반영", exact: true }).waitFor();
  assert.equal(documentReplays, 1); assert.equal(ids.document_generate.length, 2); assert.equal(ids.document_generate[0], ids.document_generate[1]);
  assert((await loadPlanState(owner)).plans[0].sections[fixture.commercialKey].markdown.includes("150만원"));
  await page.reload(); await documentPanel.getByRole("button", { name: "본문 변경안 검토", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}`);
    if (width === 390 || width === 1440) await documentPanel.screenshot({ path: `${root}/document-${width}.png` });
  }
  await documentPanel.getByRole("radio", { name: "새 본문으로 교체", exact: true }).check();
  await documentPanel.getByRole("button", { name: "선택한 본문 반영", exact: true }).click(); await documentPanel.waitFor({ state: "hidden" });
  checks.push("Real AI document draft survives dispatch outage and reload; same request is submitted once and source changes only on approval");
  const pptPanel = page.getByRole("region", { name: "원문 변경 반영", exact: true });
  await pptPanel.getByRole("button", { name: "변경분 확인", exact: true }).click();
  await pptPanel.getByRole("checkbox").check();
  await pptPanel.getByRole("button", { name: "동의한 자료로 새 문안 작성", exact: true }).click();
  await pptPanel.getByRole("button", { name: "같은 요청으로 실행 접수 확인", exact: true }).waitFor(); assert.equal(pptReplays, 0);
  await page.reload(); await pptPanel.getByRole("button", { name: "변경분 확인", exact: true }).click();
  await pptPanel.getByRole("button", { name: "같은 요청으로 실행 접수 확인", exact: true }).click();
  await pptPanel.getByRole("button", { name: "확인한 문안 반영", exact: true }).waitFor();
  assert.equal(pptReplays, 1); assert.equal(ids.generate[0], ids.generate[1]);
  await pptPanel.screenshot({ path: `${root}/ppt-review.png` });
  await pptPanel.getByRole("button", { name: "확인한 문안 반영", exact: true }).click(); await pptPanel.waitFor({ state: "hidden" });
  checks.push("Real AI three-page PPT update survives dispatch outage and reload with its original request ID and separate approval");
  await context.unroute(`${LAB_URL}/api/plan/proposal**`);
  await page.reload(); await page.getByLabel("슬라이드 제목", { exact: true }).waitFor();
  const state = await (await context.request.get(endpoint)).json(); assert.equal(state.sourceChanged, false);
  const response = await context.request.get(`${endpoint}&download=1&revision=${state.saved.revision}`); assert.equal(response.status(), 200);
  const bytes = await response.body(); await writeFile(`${root}/downloaded-proposal.pptx`, bytes);
  const zip = await JSZip.loadAsync(bytes);
  for (const item of pptResult.job.preview.impact.affected) {
    const index = state.saved.document.deck.slides.findIndex((slide: any) => slide.id === item.slideId) + 1;
    const xml = await zip.file(`ppt/slides/slide${index}.xml`)!.async("string"); assert(xml.includes("180만원") && !xml.includes("150만원"));
  }
  await context.request.post(`${LAB_URL}/api/auth/logout`);
  assert.equal((await context.request.get(endpoint)).status(), 404);
  assert.equal((await context.request.post(`${LAB_URL}/api/auth/login`, { data: { email, password } })).status(), 200);
  assert.equal((await context.request.get(`${endpoint}&download=1&revision=${state.saved.revision}`)).status(), 200);
  assert.equal((await context.request.get(`${endpoint}&download=1&revision=1`)).status(), 409);
  checks.push("Approved native PPT download contains updated prices and remains available after logout/login; stale-version download is rejected");
  assert.equal(await readFile(budgetPath, "utf8"), budgetBefore); assert.deepEqual(errors, []);
  await writeFile(`${root}/browser-fixture.json`, JSON.stringify({ email, password, planId, url }), { mode: 0o600 });
} catch (error) { errors.push(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; await page.screenshot({ path: `${root}/failure.png` }).catch(() => undefined); }
finally {
  await browser.close(); globalThis.fetch = transport;
  const report = { checks, errors, documentReplays, pptReplays, newPaidAiCalls: 0, realPayments: 0, localOnly: true, workflowDispatch: "simulated; real Cloudflare execution remains unverified", input: artifacts.pathname };
  await writeFile(`${root}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 }); console.log(JSON.stringify(report, null, 2));
}
