import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localCredentials } from "./local-account-lab.mts";
import { runArtifactTests } from "./artifact-updates.test";
import { seedBusinessRewriteFixture, documentFixtureResult, mockRewrite } from "./proposal-rewrite-fixture";
import { previewArtifactUpdate, reserveArtifactUpdate, executeArtifactChunk } from "../lib/plan-builder/artifact-update-service";
import { readArtifactUpdate } from "../lib/plan-builder/artifact-update-store";
import { saveBusinessConditions } from "../lib/plan-builder/coach-expert-service";
import { loadPlanState } from "../lib/plan-builder/plan-server-store";
import { ensureProjectForPlan } from "../lib/plan-builder/project-bridge";
import { saveLandingDraft, getLandingForProject } from "../lib/landing/repository";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { createPlanOrder, markPlanOrderPaid } from "../lib/payments/plan-orders";
import type { ArtifactRuntime, ArtifactCommand } from "../lib/plan-builder/artifact-updates";
import { createRequire } from "node:module";
import { cp, mkdir, writeFile, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const credentials = await localCredentials();
assert.equal(credentials.apiUrl, "http://127.0.0.1:55431");
const origin = "http://127.0.0.1:8124", root = `/private/tmp/oneul-artifact-update-${Date.now()}`;
Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey, PLAN_ACCOUNT_LINKING_ENABLED: "true", PROPOSAL_AI_ENABLED: "false", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" });
const transport = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert([credentials.apiUrl, origin].includes(url.origin), "Only isolated local endpoints are allowed"); return transport(input, init); };
const db = createClient(credentials.apiUrl, credentials.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const results = await runArtifactTests();
console.log(`Local SQL service scenarios: ${results.checks.length} passed`);

// A late draft conflict must roll back BOTH the plan and the job even after the plan lock is held.
const state = await loadPlanState(results.owner), old = state.plans[0];
const siteRows = await db.from("projects").select("id").eq("guest_token_hash", results.owner).eq("opportunity->>planId", results.planId); assert.equal(siteRows.error, null);
const site = (await getLandingForProject(siteRows.data![0].id, results.owner))!;
const storedJob = await db.from("plan_artifact_updates").select("data").eq("owner_hash", results.owner).eq("plan_id", results.planId).eq("status", "applied").limit(1).single(); assert.equal(storedJob.error, null);
const beforeJob = storedJob.data.data, changedPlan = structuredClone(old); changedPlan.title = "MUST ROLLBACK";
const forgedNext = { ...beforeJob, revision: beforeJob.revision + 1, updatedAt: new Date().toISOString() };
const conflict = await db.rpc("commit_artifact_update", { p_owner_hash: results.owner, p_plan_id: results.planId, p_id: beforeJob.id, p_expected_revision: beforeJob.revision, p_data: forgedNext,
  p_expected_plan: old, p_next_plan: changedPlan, p_site_id: site.id, p_site_at: "2001-01-01T00:00:00Z", p_draft: site.draft });
assert.equal(conflict.error, null); assert.equal(conflict.data, "source_changed");
assert.equal((await loadPlanState(results.owner)).plans[0].title, old.title);
assert.equal((await readArtifactUpdate(results.owner, results.planId, beforeJob.id))?.revision, beforeJob.revision);
const anon = createClient(credentials.apiUrl, credentials.anonKey, { auth: { persistSession: false } });
assert((await anon.from("plan_artifact_updates").select("data")).error, "Browser/anon role cannot read update proposals");
assert((await anon.rpc("commit_artifact_update", { p_owner_hash: results.owner, p_plan_id: results.planId, p_id: beforeJob.id, p_expected_revision: beforeJob.revision, p_data: forgedNext })).error, "Browser role cannot invoke transactional writer");

const runId = randomUUID().slice(0, 8), email = `qa-artifact-api-${runId}@example.invalid`, password = `LocalOnly!${randomUUID()}`;
const user = await db.auth.admin.createUser({ email, password, email_confirm: true }); assert.equal(user.error, null); assert(user.data.user);
const owner = createHash("sha256").update(createHmac("sha256", credentials.authSecret).update(`today-startup:${user.data.user.id}`).digest("base64url")).digest("hex");
const planId = `qa-artifact-api-${runId}`;
await seedBusinessRewriteFixture(owner, planId);
const initialPlan = (await loadPlanState(owner)).plans[0];
const projectId = await ensureProjectForPlan(initialPlan, { hash: owner, userId: user.data.user.id });
await saveLandingDraft(projectId, owner, { ...landingDraftFromPlan({ planTitle: initialPlan.title, answers: initialPlan.answers, business: {}, contactEmail: email }), slug: `qa-artifact-${runId}` }, { expectedUpdatedAt: null });
await saveBusinessConditions(owner, { planId, requestId: randomUUID(), revision: 1, fields: [{ key: "price", value: "180만원" }] });
const ai: ArtifactRuntime = { target: { provider: "mock", model: "local-only" }, document: { generate: async payload => documentFixtureResult(payload) }, ppt: { target: { provider: "mock", model: "local-only" }, generate: async payload => ({ result: mockRewrite(payload) }) } };
const preview = await previewArtifactUpdate(owner, planId, ai.target);
const reserved = await reserveArtifactUpdate(owner, planId, { type: "generate", id: randomUUID(), hash: preview.hash, base: preview.base, consent: true, includeHomepage: true }, ai);
for (let index = 0; index < reserved.chunks.length; index++) await executeArtifactChunk(owner, planId, reserved.id, index, 0, ai);
const ready = (await readArtifactUpdate(owner, planId, reserved.id))!; assert.equal(ready.status, "ready", ready.error);
await mkdir(root, { recursive: true });
for (const entry of ["app", "components", "lib", "public", "data", "middleware.ts", "tsconfig.json", "package.json", "cloudflare-env.d.ts", "cloudflare-runtime-shim.d.ts"]) await cp(resolve(entry), join(root, entry), { recursive: true });
await symlink(resolve("node_modules"), join(root, "node_modules"), "dir");
await writeFile(join(root, "next.config.ts"), "export default { devIndicators: false, turbopack: { root: '/' } };\n");
const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--turbopack", "--hostname", "127.0.0.1", "--port", "8124"], { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", PERSISTENCE_MODE: "supabase", SUPABASE_URL: credentials.apiUrl, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey, AUTH_PROJECT_SECRET: credentials.authSecret, PLAN_ACCOUNT_LINKING_ENABLED: "true", PROPOSAL_AI_ENABLED: "false", PAYMENTS_ENABLED: "false", NEXT_PUBLIC_PPT_GENERATION_VERIFIED: "false" }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", data => { serverLog += String(data); }); server.stderr.on("data", data => { serverLog += String(data); });
const modules = process.env.RUNTIME_NODE_MODULES ?? "/Users/juhong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = createRequire(`${modules}/package.json`)("playwright");
let browser: any;
try {
  for (let i = 0; i < 120 && !serverLog.includes("Ready"); i++) { if (server.exitCode !== null) throw new Error("LOCAL_SERVER_EXITED"); await new Promise(resolve => setTimeout(resolve, 500)); }
  assert(serverLog.includes("Ready"), "Local dev server did not become ready");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(), endpoint = `${origin}/api/plan/artifact-updates`;
  await context.route("**/*", (route: any) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  assert.equal((await context.request.get(`${endpoint}?planId=${planId}`)).status(), 401);
  assert.equal((await context.request.post(`${origin}/api/auth/login`, { data: { email, password } })).status(), 200);
  assert.equal((await context.request.get(`${endpoint}?planId=foreign-plan`)).status(), 404);
  const response = await context.request.get(`${endpoint}?planId=${planId}&id=${ready.id}`); assert.equal(response.status(), 200);
  const view = (await response.json()).job; assert(!view.ownerHash && !view.snapshot); assert(view.chunks.every((chunk: any) => !chunk.claim));
  const apply: Extract<ArtifactCommand, { type: "approve" }> = { type: "approve", id: ready.id, expectedRevision: ready.revision, base: ready.preview.base,
    documents: Object.fromEntries(ready.preview.documents.map(section => [section.key, "replace"])), slides: Object.fromEntries(ready.preview.slides.map(slide => [slide.id, "replace"])), homepage: "replace", homepageChoices: Object.fromEntries(ready.preview.homepage!.changed.map(id => [id, "replace"])) };
  assert.equal((await context.request.post(endpoint, { data: { planId, command: apply } })).status(), 402);
  for (const product of ["plan", "homepage"] as const) {
    const order = await createPlanOrder({ ownerId: user.data.user.id, guestTokenHash: owner, customerEmail: email, planId, planType: "일반 사업계획서", product });
    await markPlanOrderPaid({ orderId: order.orderId, tid: `local-artifact-${product}-${runId}`, raw: { synthetic: true, noPgCall: true } });
  }
  assert.equal((await context.request.post(endpoint, { headers: { origin: "https://foreign.example" }, data: { planId, command: apply } })).status(), 403);
  const publicPreview = await (await context.request.get(`${endpoint}?planId=${planId}&preview=1`)).json(); assert.equal(publicPreview.target, null);
  assert.equal((await context.request.post(endpoint, { data: { planId, command: { type: "generate", id: randomUUID(), base: publicPreview.base, hash: publicPreview.hash, consent: true, includeHomepage: true } } })).status(), 503, "Public AI creation remains disabled");
  const page = await context.newPage();
  await page.goto(`${origin}/plan/workspace?planId=${planId}&tab=documents`, { waitUntil: "domcontentloaded" });
  const panel = page.getByRole("region", { name: "결과물 변경 관리" });
  await panel.locator("p").filter({ hasText: "비교 후 반영" }).first().waitFor();
  const action = panel.getByRole("button", { name: "선택한 변경 반영" }); assert(await action.isDisabled());
  const choices = panel.getByRole("radio", { name: "변경안 반영", exact: true });
  for (let i = 0; i < await choices.count(); i++) await choices.nth(i).check();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    assert(await panel.evaluate((element: HTMLElement) => element.scrollWidth <= element.clientWidth + 1), `Panel fits ${width}px`);
    await panel.screenshot({ path: join(root, `artifact-panel-${width}.png`) });
  }
  const approvalResponse = page.waitForResponse((response: any) => response.url() === endpoint && response.request().method() === "POST");
  await action.click();
  const approval = await approvalResponse;
  const approvalBody = await approval.json();
  assert.equal(approval.status(), 200, JSON.stringify(approvalBody));
  await panel.getByText("반영했어요. 홈페이지 공개는 별도로 진행해 주세요", { exact: true }).waitFor();
  const retry = await context.request.post(endpoint, { data: { planId, command: apply } }); assert.equal(retry.status(), 200);
  const after = (await loadPlanState(owner)).plans[0]; assert(after.sections["strategy/price"].markdown.includes("180만원"));
  assert.equal((await getLandingForProject(projectId, owner))?.publishedVersion, null);
  await page.reload({ waitUntil: "domcontentloaded" }); await panel.locator("p").filter({ hasText: "반영됨" }).first().waitFor();
  await context.close();
  const reopened = await browser.newContext(); await reopened.request.post(`${origin}/api/auth/login`, { data: { email, password } });
  assert.equal((await reopened.request.get(`${endpoint}?planId=${planId}&id=${ready.id}`)).status(), 200); await reopened.close();
  console.log(JSON.stringify({ passed: true, sql: results.checks, http: ["real local login", "owner isolation", "403 origin", "402 entitlement", "default-off AI", "server metadata redacted", "browser explicit approvals", "atomic apply", "idempotent replay", "reconnect"], viewports: [320,390,768,1440], root, mockOnly: true, paidCalls: 0 }));
} finally {
  await browser?.close(); server.kill("SIGTERM");
  await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else { server.once("exit", () => resolve()); setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 10000).unref(); } });
}
