import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { PRELAUNCH_ORIGIN, PRELAUNCH_REF, assertPrelaunchTarget } from "./prelaunch-db-safety";
import { prelaunchLifecycleScope } from "./prelaunch-lifecycle-safety";
import { prelaunchManagement } from "./prelaunch-management";
import { hashIdentityToken, userProjectToken } from "../lib/identity-tokens";
import { loadPlanState, savePlanState, normalizeState, claimGuestPlanState, planGuestWasClaimed } from "../lib/plan-builder/plan-server-store";
import { seedBusinessRewriteFixture } from "./proposal-rewrite-fixture";
import { loadProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { ensureProjectForPlan } from "../lib/plan-builder/project-bridge";
import { createLandingDraft } from "../lib/landing/domain";
import { getLandingForProject, getPublishedLandingBySlug, publishLanding, rollbackLanding, saveLandingDraft } from "../lib/landing/repository";

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
assertPrelaunchTarget(env.SUPABASE_URL ?? "", process.argv[2]);
assert(env.SUPABASE_SERVICE_ROLE_KEY);
Object.assign(process.env, { SUPABASE_URL: PRELAUNCH_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY, AUTH_PROJECT_SECRET: env.AUTH_PROJECT_SECRET ?? "", PERSISTENCE_MODE: "supabase", PLAN_ACCOUNT_LINKING_ENABLED: "true", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", PROPOSAL_AI_ENABLED: "false", OPERATING_AI_ENABLED: "false", PAYMENTS_ENABLED: "false" });
const runId = randomBytes(8).toString("hex"), scope = prelaunchLifecycleScope(runId);
const root = new URL(`../artifacts/prelaunch-lifecycle/${runId}/`, import.meta.url);
await mkdir(root, { recursive: true, mode: 0o700 });
const budgetFile = new URL("../artifacts/synthetic-ai-launch/budget.json", import.meta.url);
const budgetBefore = await readFile(budgetFile, "utf8");
const checks: string[] = [], errors: string[] = [], cleanup: string[] = [];
const accounts: Array<{ id: string; owner: string; email: string }> = [];
const transport = globalThis.fetch;
let requests = 0;
const record = async (name: string, test: () => Promise<void>) => { await test(); checks.push(name); console.log(`[PASS] ${name}`); };
function okay(error: { code?: string; status?: number } | null) { if (error) throw new Error(`Supabase error ${error.code ?? error.status ?? "unknown"}`); }
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init) } };
const db = createClient(PRELAUNCH_ORIGIN, env.SUPABASE_SERVICE_ROLE_KEY, options);
const sessions = [createClient(PRELAUNCH_ORIGIN, env.SUPABASE_SERVICE_ROLE_KEY, options), createClient(PRELAUNCH_ORIGIN, env.SUPABASE_SERVICE_ROLE_KEY, options)];

try {
  await record("new transaction functions deny anon and authenticated SQL roles", async () => {
    const rows = await prelaunchManagement()(`select p.proname, has_function_privilege('anon',p.oid,'execute') as anon, has_function_privilege('authenticated',p.oid,'execute') as authenticated, has_function_privilege('service_role',p.oid,'execute') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('commit_plan_state','claim_plan_state','ensure_plan_project','publish_landing_snapshot','rollback_landing_snapshot','admin_generation_jobs') order by p.proname`);
    assert.equal(rows.length, 6); assert(rows.every(row => row.anon === false && row.authenticated === false && row.service === true));
    await writeFile(new URL("permissions.json", root), JSON.stringify(rows, null, 2), { mode: 0o600 });
  });
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    const raw = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
    const body = raw ? JSON.parse(raw) : undefined;
    scope.assertRequest(url, request.method, body);
    assert(++requests <= 700, "Lifecycle request limit reached");
    const response = await transport(request, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    // Register only IDs returned by a creation that already passed the synthetic owner guard.
    if (response.ok && url.pathname === "/rest/v1/rpc/ensure_plan_project") {
      const id = await response.clone().json(); assert.match(id, /^[a-f0-9-]{36}$/); scope.projects.add(id);
    }
    if (response.ok && url.pathname === "/rest/v1/landing_sites" && request.method === "POST") {
      const result = await response.clone().json();
      for (const row of Array.isArray(result) ? result : [result]) { assert(scope.projects.has(row.project_id)); assert.match(row.id, /^[a-f0-9-]{36}$/); scope.sites.add(row.id); }
    }
    return response;
  };
  const { claimGuestProjects } = await import("../lib/account-auth");
  const password = `PrelaunchLifecycle!${randomUUID()}`;
  for (const email of scope.emails) {
    const result = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic: true, runId, purpose: "account-homepage-lifecycle" } });
    okay(result.error); assert(result.data.user);
    const id = result.data.user.id, owner = hashIdentityToken(userProjectToken(id));
    scope.users.add(id); scope.owners.add(owner); accounts.push({ id, owner, email });
  }
  const [a, b] = accounts;
  const guests = Array.from({ length: 4 }, () => hashIdentityToken(`prelaunch:${runId}:${randomUUID()}`));
  guests.forEach(owner => scope.owners.add(owner));
  const [guest, interrupted, busy, race] = guests;
  const planId = `${scope.prefix}b2b`;
  const tiny = (suffix: string) => {
    const at = new Date().toISOString();
    return normalizeState({ business: { name: `QA ${suffix}`, description: "Synthetic verification only", stage: "", role: "", industry: "", region: "" }, activePlanId: `${scope.prefix}${suffix}`, plans: [{ id: `${scope.prefix}${suffix}`, title: `QA ${suffix}`, planType: "", createdAt: at, updatedAt: at, answers: {}, sections: {} }] });
  };
  await record("synthetic guest saves full B2B proposal before login", async () => {
    await seedBusinessRewriteFixture(guest, planId);
    await savePlanState(a.owner, tiny("existing"));
    assert.equal((await loadProposalEditor(guest, planId)).saved?.document.deck.slides.length, 12);
  });
  let projectId = "";
  await record("concurrent homepage project creation yields one project and six stages", async () => {
    const ids = await Promise.all([1, 2, 3].map(() => ensureProjectForPlan({ id: planId, title: "QA prelaunch homepage" }, { hash: guest, userId: null })));
    assert.equal(new Set(ids).size, 1); projectId = ids[0];
    const stages = await db.from("project_stages").select("stage_index").eq("project_id", projectId); okay(stages.error); assert.equal(stages.data?.length, 6);
  });
  const guestBefore = await loadPlanState(guest);
  await record("password login transfers complete guest plan and associated project", async () => {
    for (let i = 0; i < accounts.length; i++) {
      const login = await sessions[i].auth.signInWithPassword({ email: accounts[i].email, password }); okay(login.error); assert.equal(login.data.user?.id, accounts[i].id);
    }
    await claimGuestProjects(a.id, guest);
    const state = await loadPlanState(a.owner);
    assert.equal(state.plans.length, 2); assert.deepEqual(state.plans.find(plan => plan.id === planId), guestBefore.plans[0]);
    assert.equal((await loadPlanState(guest)).plans.length, 0); assert.equal(await planGuestWasClaimed(guest), true);
    const project = await db.from("projects").select("owner_id,guest_token_hash").eq("id", projectId); okay(project.error);
    assert.equal(project.data?.[0].owner_id, a.id); assert.equal(project.data?.[0].guest_token_hash, a.owner);
    const claim = await db.from("plan_owner_claims").select("account_hash,legacy_completed_at").eq("guest_hash", guest); okay(claim.error);
    assert.equal(claim.data?.[0].account_hash, a.owner); assert(claim.data?.[0].legacy_completed_at);
  });
  await record("replayed login and another account cannot duplicate or steal the guest source", async () => {
    const before = await loadPlanState(a.owner);
    await claimGuestProjects(a.id, guest); await claimGuestProjects(b.id, guest);
    assert.deepEqual(await loadPlanState(a.owner), before); assert.equal((await loadPlanState(b.owner)).plans.length, 0);
    await assert.rejects(savePlanState(guest, guestBefore), /PLAN_OWNER_CHANGED/);
    assert.equal((await loadPlanState(guest)).plans.length, 0);
    await assert.rejects(loadProposalEditor(b.owner, planId), error => (error as { status?: number }).status === 404);
  });
  await record("lost guest cookie still resumes an unfinished project handoff", async () => {
    const state = tiny("interrupted"); await savePlanState(interrupted, state);
    const id = await ensureProjectForPlan(state.plans[0], { hash: interrupted, userId: null });
    assert.equal(await claimGuestPlanState(interrupted, a.owner), "claimed");
    await claimGuestProjects(a.id, null);
    const project = await db.from("projects").select("owner_id,guest_token_hash").eq("id", id); okay(project.error);
    assert.equal(project.data?.[0].owner_id, a.id); assert.equal(project.data?.[0].guest_token_hash, a.owner);
    const claim = await db.from("plan_owner_claims").select("legacy_completed_at").eq("guest_hash", interrupted); okay(claim.error); assert(claim.data?.[0].legacy_completed_at);
  });
  await record("running generation blocks handoff without consuming guest data", async () => {
    const state = tiny("busy"); state.plans[0].answers.__coach_job = { status: "running", token: randomUUID() };
    await savePlanState(busy, state); await assert.rejects(claimGuestPlanState(busy, a.owner), /PLAN_CLAIM_BUSY/);
    assert.deepEqual(await loadPlanState(busy), state); assert.equal(await planGuestWasClaimed(busy), false);
    state.plans[0].answers.__coach_job.status = "failed"; state.plans[0].updatedAt = new Date().toISOString();
    await savePlanState(busy, state); assert.equal(await claimGuestPlanState(busy, a.owner), "claimed");
  });
  await record("simultaneous account claims choose one owner atomically", async () => {
    const state = tiny("race"); await savePlanState(race, state);
    const results = await Promise.all([claimGuestPlanState(race, a.owner), claimGuestPlanState(race, b.owner)]);
    assert.deepEqual(results.sort(), ["claimed", "consumed"]);
    const states = [await loadPlanState(a.owner), await loadPlanState(b.owner)];
    assert.equal(states.filter(item => item.plans.some(plan => plan.id === state.activePlanId)).length, 1);
    await assert.rejects(savePlanState(race, state), /PLAN_OWNER_CHANGED/);
  });

  const originalSlug = `qa-${runId}-v1`, draftSlug = `qa-${runId}-v2`;
  scope.slugs.add(originalSlug); scope.slugs.add(draftSlug);
  const draft = { ...createLandingDraft({ title: "출시 전 검증용 홈페이지", oneLiner: "가상 사업의 홈페이지 공개와 복원 검증", customer: "가상 고객", model: "검증용 서비스", sector: "서비스" }), slug: originalSlug, leadCaptureEnabled: false };
  let site = await saveLandingDraft(projectId, a.owner, draft, { expectedUpdatedAt: null });
  await record("homepage draft is private and wrong owners cannot read or publish", async () => {
    assert.equal(await getPublishedLandingBySlug(originalSlug), null);
    await assert.rejects(getLandingForProject(projectId, b.owner), /PROJECT_NOT_FOUND/);
    await assert.rejects(publishLanding(projectId, b.owner, site.updatedAt), /PROJECT_NOT_FOUND/);
    const wrong = await db.rpc("publish_landing_snapshot", { p_project_id: projectId, p_owner_hash: b.owner, p_expected_updated_at: site.updatedAt });
    assert.equal(wrong.error?.message, "LANDING_NOT_FOUND");
  });
  await record("signed-in JWT cannot call server-only publication or handoff RPCs", async () => {
    const session = (await sessions[1].auth.getSession()).data.session; assert(session);
    for (const [name, body] of [
      ["ensure_plan_project", { p_plan_id: planId, p_title: "forged", p_owner_hash: a.owner, p_owner_id: a.id }],
      ["publish_landing_snapshot", { p_project_id: projectId, p_owner_hash: a.owner, p_expected_updated_at: site.updatedAt }],
      ["claim_plan_state", { p_guest_hash: guest, p_account_hash: b.owner, p_guest_at: null, p_account_at: null, p_data: guestBefore, p_title: "forged", p_plan_type: "" }],
    ] as const) {
      const response = await fetch(`${PRELAUNCH_ORIGIN}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert([401, 403].includes(response.status));
    }
    assert.equal((await getLandingForProject(projectId, a.owner))?.status, "draft");
  });
  await record("concurrent homepage edits reject stale changes and replay the winning save", async () => {
    const before = site;
    const results = await Promise.allSettled(["A", "B"].map(label => saveLandingDraft(projectId, a.owner, { ...before.draft, headline: `QA saved ${label}`, pageData: null }, { expectedUpdatedAt: before.updatedAt })));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const winner = results.find(result => result.status === "fulfilled"); assert(winner?.status === "fulfilled"); site = winner.value;
    const loser = results.find(result => result.status === "rejected"); assert(loser?.status === "rejected"); assert.match(loser.reason.message, /LANDING_DRAFT_CONFLICT/);
    const replay = await saveLandingDraft(projectId, a.owner, site.draft, { expectedUpdatedAt: before.updatedAt }); assert.equal(replay.updatedAt, site.updatedAt);
  });
  await record("duplicate publication creates one immutable public snapshot", async () => {
    const expected = site.updatedAt;
    const results = await Promise.all([publishLanding(projectId, a.owner, expected), publishLanding(projectId, a.owner, expected)]);
    assert(results.every(result => result.versions.length === 1 && result.publishedVersion === 1));
    site = results[0]; assert.equal((await publishLanding(projectId, a.owner, expected)).versions.length, 1);
    assert.equal((await getPublishedLandingBySlug(originalSlug))?.config.headline, site.draft.headline);
  });
  const publicV1 = structuredClone(site.versions.find(version => version.version === 1)!.config);
  await record("private edits and new slug do not change the published snapshot", async () => {
    const old = site.updatedAt;
    site = await saveLandingDraft(projectId, a.owner, { ...site.draft, slug: draftSlug, headline: "QA private v2", pageData: null }, { expectedUpdatedAt: old });
    assert.equal((await getPublishedLandingBySlug(originalSlug))?.config.headline, publicV1.headline);
    assert.equal(await getPublishedLandingBySlug(draftSlug), null);
    await assert.rejects(publishLanding(projectId, a.owner, old), /LANDING_DRAFT_CONFLICT/);
    const stored = await getLandingForProject(projectId, a.owner); assert.equal(stored?.versions.length, 1);
  });
  await record("republish switches public version and preserves previous content", async () => {
    site = await publishLanding(projectId, a.owner, site.updatedAt);
    assert.equal(site.versions.length, 2); assert.equal(site.publishedVersion, 2);
    assert.equal(await getPublishedLandingBySlug(originalSlug), null);
    assert.equal((await getPublishedLandingBySlug(draftSlug))?.config.headline, "QA private v2");
    assert.deepEqual(site.versions.find(version => version.version === 1)!.config, publicV1);
  });
  await record("stale rollback is blocked and exact-version restore is replayable", async () => {
    const stale = site.updatedAt;
    site = await saveLandingDraft(projectId, a.owner, { ...site.draft, headline: "QA private v3", pageData: null }, { expectedUpdatedAt: site.updatedAt });
    await assert.rejects(rollbackLanding(projectId, a.owner, 1, stale), /LANDING_DRAFT_CONFLICT/);
    const expected = site.updatedAt;
    site = await rollbackLanding(projectId, a.owner, 1, expected);
    const replay = await rollbackLanding(projectId, a.owner, 1, expected);
    assert.equal(replay.updatedAt, site.updatedAt); assert.equal(site.publishedVersion, 1); assert.equal(site.versions.length, 2);
    assert.deepEqual(site.draft, publicV1); assert.equal(site.publishedSlug, originalSlug);
    assert.equal(await getPublishedLandingBySlug(draftSlug), null);
    await assert.rejects(rollbackLanding(projectId, a.owner, 99, site.updatedAt), /LANDING_VERSION_NOT_FOUND/);
  });
  await record("logout and password relogin recover linked proposal and restored homepage", async () => {
    const state = await loadPlanState(a.owner), view = await getLandingForProject(projectId, a.owner);
    okay((await sessions[0].auth.signOut({ scope: "local" })).error);
    const login = await sessions[0].auth.signInWithPassword({ email: a.email, password }); okay(login.error); assert(login.data.user);
    const owner = hashIdentityToken(userProjectToken(login.data.user.id)); assert.equal(owner, a.owner);
    await claimGuestProjects(a.id, null);
    assert.deepEqual(await loadPlanState(owner), state); assert.deepEqual((await getLandingForProject(projectId, owner))?.draft, view?.draft);
    assert.equal((await loadProposalEditor(owner, planId)).saved?.document.deck.slides.length, 12);
    await writeFile(new URL("restored-homepage.json", root), JSON.stringify({ draft: site.draft, versions: site.versions }, null, 2), { mode: 0o600 });
  });
} catch (error) {
  errors.push((error instanceof Error ? error.message : "Lifecycle check failed").replaceAll(env.SUPABASE_SERVICE_ROLE_KEY, "[redacted]").slice(0, 1200));
  process.exitCode = 1;
} finally {
  // Leave diagnostic synthetic records, but never leave a test homepage publicly published.
  for (const id of scope.sites) {
    try {
      const result = await db.from("landing_sites").update({ status: "draft", published_slug: null }).eq("id", id); okay(result.error); cleanup.push(id);
    } catch { errors.push("Synthetic homepage could not be unpublished; inspect report site IDs"); process.exitCode = 1; }
  }
  for (const client of sessions) { try { await client.auth.signOut({ scope: "local" }); } catch { /* No retained session credentials. */ } }
  globalThis.fetch = transport;
  const unchangedBudget = await readFile(budgetFile, "utf8") === budgetBefore;
  if (!unchangedBudget) { errors.push("AI budget changed during verification"); process.exitCode = 1; }
  const report = { runId, projectRef: PRELAUNCH_REF, checks, errors, accounts, projectIds: [...scope.projects], siteIds: [...scope.sites], unpublishedTestSites: cleanup, requests, unchangedBudget, paidAiCalls: 0, realPayments: 0, releaseReady: false, scope: "Hosted DB and auth/service functions. No Google OAuth, browser cookies, payment provider or public Worker deployment.", completedAt: new Date().toISOString() };
  await writeFile(new URL("report.json", root), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ runId, passed: checks.length, errors, requests, unpublishedTestSites: cleanup.length, report: new URL("report.json", root).pathname }, null, 2));
}
