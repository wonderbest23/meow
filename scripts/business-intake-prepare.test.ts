import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";
import type { ServerPlan, ServerPlanState } from "../lib/plan-builder/plan-server-store";

type Generation = {
  revision: number; runId: string; keys: string[]; paid: boolean;
  receipts: Array<{ id: string; signature: string; runId: string; paid: boolean; accepted: boolean }>;
  dispatchState?: string; dispatchAt?: string;
};
type Dispatch = { id: string; params: { ownerHash: string; planId: string; reviewedBusiness: boolean } };
type QuotaResult = { count?: unknown; data?: unknown; error: unknown };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", RATE_LIMIT_BACKEND: "memory",
    PLAN_ACCOUNT_LINKING_ENABLED: "false", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "0", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
  });
  const require = createRequire(import.meta.url);
  const originals = new Map<string, NodeJS.Module | undefined>();
  function mock(path: string, exports: unknown) {
    const id = require.resolve(path);
    if (!originals.has(id)) originals.set(id, require.cache[id]);
    const module = new Module(id);
    module.filename = id; module.loaded = true; module.exports = exports;
    require.cache[id] = module;
  }
  function restore(path: string) {
    const id = require.resolve(path), original = originals.get(id);
    if (original) require.cache[id] = original;
    else delete require.cache[id];
  }
  const originalFetch = globalThis.fetch;
  const networkCalls: string[] = [];
  globalThis.fetch = async input => {
    networkCalls.push(String(input));
    throw new Error("This test never contacts a provider or database");
  };

  let quotaAvailable = true, quotaThrows = false, quotaReads = 0;
  let usage: QuotaResult = { error: null, count: 0 };
  let packs: QuotaResult = { error: null, data: [] };
  const quotaDatabase = {
    from(table: string) {
      assert.ok(["plan_regenerations", "plan_regen_packs"].includes(table));
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (value: QuotaResult) => unknown, reject: (error: unknown) => unknown) => {
          quotaReads++;
          return Promise.resolve(table === "plan_regenerations" ? usage : packs).then(resolve, reject);
        },
      };
      return query;
    },
  };

  try {
    // Only quota resolution sees the fake database. The real plan store uses demo memory.
    mock("../lib/persistence", { getServerSupabase: () => {
      if (quotaThrows) throw new Error("quota backend unavailable");
      return quotaAvailable ? quotaDatabase : null;
    } });
    const quota = require("../lib/plan-builder/regen-quota") as typeof import("../lib/plan-builder/regen-quota");
    restore("../lib/persistence");
    const store = require("../lib/plan-builder/plan-server-store") as typeof import("../lib/plan-builder/plan-server-store");
    let saveHook: (state: ServerPlanState, guard: Parameters<typeof store.savePlanState>[2]) => Promise<void> = async () => undefined;
    mock("../lib/plan-builder/plan-server-store", { ...store, savePlanState: async (...args: Parameters<typeof store.savePlanState>) => {
      await saveHook(args[1], args[2]);
      return store.savePlanState(...args);
    } });
    let owner = "", authenticated = true, paid = true;
    let accessHook: () => Promise<void> = async () => undefined;
    mock("../lib/api-auth", { requireGuestIdentity: async () => ({ hash: owner, userId: authenticated ? "fixture-user" : null }) });
    mock("../lib/rate-limit", { enforceRateLimit: async () => null });
    mock("../lib/plan-builder/access", {
      resolvePlanAccess: async () => { await accessHook(); return { authenticated, paid, paidPlanIds: new Set<string>() }; },
      freePlanLimitReached: () => false,
      checkSectionAccess: (_access: unknown, key: string) => ["overview/summary", "overview/problem"].includes(key) ? "ok" : "locked",
    });
    const attempts: Dispatch[] = [], workflows = new Map<string, string>();
    let statusUnavailable = false, bindingAvailable = true;
    let createHook: (dispatch: Dispatch) => Promise<void> = async () => undefined;
    const workflow = {
      get: async (id: string) => ({ status: async () => {
        if (statusUnavailable || !workflows.has(id)) throw new Error("workflow lookup unavailable or not found");
        return { status: workflows.get(id) };
      } }),
      create: async (dispatch: Dispatch) => {
        attempts.push(dispatch);
        const state = await store.loadPlanState(dispatch.params.ownerHash);
        const saved = state.plans.find(plan => plan.id === dispatch.params.planId)!;
        const generation = saved.answers.__coach_generation as unknown as Generation;
        assert.equal(generation.runId, dispatch.id, "reserve a durable identity before dispatch");
        assert.equal(generation.dispatchState, "dispatching", "claim dispatch with CAS before external work");
        assert.equal(dispatch.params.reviewedBusiness, true);
        await createHook(dispatch);
        if (workflows.has(dispatch.id)) throw new Error("workflow already exists");
        workflows.set(dispatch.id, "running");
      },
    };
    mock("@opennextjs/cloudflare", { getCloudflareContext: async () => ({ env: { PLAN_SECTIONS_WORKFLOW: bindingAvailable ? workflow : null } }) });
    const { POST } = require("../app/api/plan/chat/route") as typeof import("../app/api/plan/chat/route");
    const { emptyCoach } = require("../lib/plan-builder/coach-job") as typeof import("../lib/plan-builder/coach-job");
    const { COACH_KEY, COACH_TYPES, readCoach } = require("../lib/plan-builder/coach") as typeof import("../lib/plan-builder/coach");
    const { INTAKE_KEY } = require("../lib/plan-builder/intake-types") as typeof import("../lib/plan-builder/intake-types");
    const { createIntake, readIntake } = require("../lib/plan-builder/intake-core") as typeof import("../lib/plan-builder/intake-core");
    const { updateIntakeJob } = require("../lib/plan-builder/intake-service") as typeof import("../lib/plan-builder/intake-service");

    let passed = 0;
    const failures: string[] = [];
    async function check(name: string, run: () => Promise<void>) {
      owner = `prepare-test-${randomUUID()}`;
      authenticated = paid = quotaAvailable = bindingAvailable = true;
      quotaThrows = statusUnavailable = false; quotaReads = 0;
      usage = { count: 0, error: null }; packs = { data: [], error: null };
      attempts.length = networkCalls.length = 0; workflows.clear();
      saveHook = async () => undefined; accessHook = async () => undefined; createHook = async () => undefined;
      process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 = "0";
      try {
        await run();
        assert.deepEqual(networkCalls, [], "no provider, database, retry, or fallback network traffic");
        passed++;
        console.log(`PASS ${name}`);
      } catch (error) { failures.push(name); console.error(`FAIL ${name}`, error); }
    }
    async function seed(options: { intake?: boolean; section?: boolean } = {}) {
      const at = new Date().toISOString(), id = randomUUID();
      const coach = { ...emptyCoach(), revision: 2, documentRevision: 2, stage: "startup" as const, ready: true };
      coach.fields = [{ key: "business", value: "Fixture photo service", basis: "user", quote: "Fixture photo service", messageId: "fixture-business" }];
      coach.business.name = "Fixture photo service";
      const plan: ServerPlan = { id, title: coach.business.name, planType: COACH_TYPES.startup, createdAt: at, updatedAt: at,
        sections: options.section ? { "overview/summary": { markdown: "Original document", html: "<p>Original document</p>", generatedAt: at, coachRevision: 1 } } : {},
        answers: { [COACH_KEY]: { state: coach } } };
      if (options.intake) plan.answers[INTAKE_KEY] = { state: createIntake(coach, "startup", at) };
      await store.savePlanState(owner, store.normalizeState({ plans: [plan], activePlanId: id }));
      return id;
    }
    async function read(id: string) {
      const state = await store.loadPlanState(owner), plan = state.plans.find(item => item.id === id);
      assert.ok(plan);
      return { state, plan, coach: readCoach(plan.answers)!, generation: plan.answers.__coach_generation as unknown as Generation | undefined };
    }
    async function mutate(id: string, change: (plan: ServerPlan) => void) {
      const { state, plan, coach } = await read(id), updatedAt = plan.updatedAt, revision = coach.revision;
      change(plan);
      plan.updatedAt = new Date(Math.max(Date.now(), Date.parse(updatedAt) + 1)).toISOString();
      await store.savePlanState(owner, state, { planId: id, coachRevision: revision, planUpdatedAt: updatedAt });
    }
    async function prepare(id: string, requestId = randomUUID(), options: { revision?: number; message?: string; v2?: boolean; scope?: string } = {}) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (options.v2) headers["x-business-intake"] = "2";
      if (options.scope) headers["x-business-intake-owner"] = options.scope;
      const response = await POST(new Request("http://localhost/api/plan/chat", { method: "POST", headers,
        body: JSON.stringify({ action: "prepare", planId: id, revision: options.revision ?? 2, requestId, ...(options.message ? { message: options.message } : {}) }) }));
      return { status: response.status, body: await response.json() as { started?: boolean; code?: string; flowVersion?: number; plan?: { planId: string }; login?: boolean } };
    }

    await check("legacy prepare reserves atomically and completed replay never dispatches twice", async () => {
      const id = await seed(), requestId = randomUUID();
      const first = await prepare(id, requestId);
      assert.equal(first.status, 200); assert.equal(first.body.started, true);
      const saved = await read(id);
      assert.equal(saved.generation?.receipts.length, 1);
      assert.equal(saved.generation?.receipts[0].accepted, true);
      workflows.set(saved.generation!.runId, "complete");
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.deepEqual((await read(id)).state, saved.state);
      assert.equal(attempts.length, 1); assert.equal(workflows.size, 1);
    });

    for (const sameRequest of [true, false]) await check(`concurrent ${sameRequest ? "identical" : "different"} request IDs share one workflow`, async () => {
      const id = await seed(), requestId = randomUUID();
      const results = await Promise.all([prepare(id, requestId), prepare(id, sameRequest ? requestId : randomUUID())]);
      assert.ok(results.every(result => [200, 202].includes(result.status)));
      assert.equal(attempts.length, 1); assert.equal(workflows.size, 1);
      assert.equal((await read(id)).generation?.receipts.length, sameRequest ? 1 : 2);
    });

    await check("pending dispatch lease prevents a second external create call", async () => {
      const id = await seed(), entered = deferred(), release = deferred();
      createHook = async () => { entered.resolve(); await release.promise; };
      const first = prepare(id);
      await entered.promise;
      try {
        const duplicate = await prepare(id);
        assert.equal(duplicate.status, 202); assert.equal(duplicate.body.started, false);
        assert.equal(attempts.length, 1);
      } finally { release.resolve(); }
      assert.equal((await first).status, 200);
      assert.equal(workflows.size, 1);
    });

    await check("receipt binds payload; stale new requests fail without changing saved state", async () => {
      const id = await seed(), requestId = randomUUID();
      assert.equal((await prepare(id, requestId)).status, 200);
      const saved = (await read(id)).state;
      assert.equal((await prepare(id, requestId, { message: "different operation" })).status, 409);
      assert.equal((await prepare(id, requestId, { revision: 3 })).status, 409);
      assert.equal((await prepare(id, randomUUID(), { revision: 1 })).status, 409);
      assert.deepEqual((await read(id)).state, saved);
      assert.equal(attempts.length, 1);
    });

    await check("accepted replay after a source edit acknowledges only the original workflow", async () => {
      const id = await seed(), requestId = randomUUID();
      await prepare(id, requestId);
      await mutate(id, plan => { const coach = readCoach(plan.answers)!; coach.revision++; coach.documentRevision = 3; plan.answers[COACH_KEY] = { state: coach }; });
      const saved = (await read(id)).state;
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.deepEqual((await read(id)).state, saved);
      assert.equal(attempts.length, 1);
    });

    await check("CAS preserves extraction completion at unchanged coach revision", async () => {
      const id = await seed({ intake: true }), jobId = randomUUID();
      await mutate(id, plan => {
        const intake = readIntake(plan.answers)!;
        intake.notes = [{ id: "note", text: "price 5000", at: plan.updatedAt, status: "processing" }];
        intake.job = { id: jobId, runId: `intake-${jobId}`, kind: "extract", status: "running", noteIds: ["note"], baseValues: {}, baseDocumentRevision: 2, updatedAt: plan.updatedAt };
        plan.answers[INTAKE_KEY] = { state: intake };
      });
      let raced = false;
      saveHook = async (state, guard) => {
        const generation = state.plans.find(plan => plan.id === id)?.answers.__coach_generation;
        if (raced || generation?.dispatchState !== "reserved") return;
        raced = true;
        assert.ok(guard?.planUpdatedAt, "reservation must protect async-only metadata revisions");
        await updateIntakeJob({ ownerHash: owner, planId: id, jobId }, (_plan, _coach, intake, job) => {
          intake.notes[0].status = "review";
          intake.candidates = [{ id: "candidate", fieldKey: "price", value: "5000", quote: "price 5000", noteId: "note", baseValue: null, status: "pending" }];
          job.status = "complete";
        });
      };
      assert.equal((await prepare(id)).status, 200);
      const saved = await read(id), intake = readIntake(saved.plan.answers)!;
      assert.equal(raced, true); assert.equal(saved.coach.revision, 2);
      assert.equal(intake.job?.status, "complete"); assert.equal(intake.candidates.length, 1);
      assert.equal(intake.notes[0].status, "review"); assert.equal(attempts.length, 1);
    });

    await check("CAS rejects a canonical answer edit racing with reservation", async () => {
      const id = await seed();
      let raced = false;
      saveHook = async state => {
        if (raced || !state.plans.find(plan => plan.id === id)?.answers.__coach_generation) return;
        raced = true;
        await mutate(id, plan => {
          const coach = readCoach(plan.answers)!;
          coach.revision++; coach.documentRevision = 3;
          coach.fields.push({ key: "price", value: "9000", basis: "user", quote: "9000", messageId: "price-edit" });
          plan.answers[COACH_KEY] = { state: coach };
        });
      };
      assert.equal((await prepare(id)).status, 409);
      const saved = await read(id);
      assert.equal(saved.coach.fields.find(field => field.key === "price")?.value, "9000");
      assert.equal(saved.generation, undefined); assert.equal(attempts.length, 0);
    });

    await check("intake route wrapper and guest ownership remain intact", async () => {
      process.env.NEXT_PUBLIC_BUSINESS_INTAKE_V2 = "1";
      const id = await seed({ intake: true }), actualOwner = owner;
      owner = `other-${randomUUID()}`;
      assert.equal((await prepare(id, randomUUID(), { v2: true })).status, 404);
      owner = actualOwner;
      assert.equal((await prepare(id, randomUUID(), { v2: true, scope: "forged-owner" })).status, 409);
      authenticated = false;
      const guest = await prepare(id, randomUUID(), { v2: true });
      assert.equal(guest.status, 401); assert.equal(guest.body.login, true);
      assert.equal(attempts.length, 0);
      authenticated = true;
      const scope = createHash("sha256").update(`intake-draft:${owner}`).digest("hex").slice(0, 32);
      const success = await prepare(id, randomUUID(), { v2: true, scope });
      assert.equal(success.status, 200); assert.equal(success.body.flowVersion, 2);
      assert.equal(success.body.plan?.planId, id); assert.equal(success.body.started, true);
      assert.equal((await prepare(id)).status, 409, "the parent feature-upgrade wrapper is preserved");
      assert.equal(attempts.length, 1);
    });

    await check("verified quota is allowed; unavailable and malformed quota fail closed", async () => {
      assert.deepEqual(await quota.resolveRegenQuota("fixture"), { allowed: 20, used: 0, remaining: 20 });
      packs = { error: null, data: [{ granted: 10 }] }; usage = { error: null, count: 4 };
      assert.deepEqual(await quota.resolveRegenQuota("fixture"), { allowed: 30, used: 4, remaining: 26 });
      const unavailable = { allowed: 0, used: 0, remaining: 0, unavailable: true };
      const badUsage: QuotaResult[] = [{ error: "offline", count: 0 }, { error: null, count: null }, { error: null }, { error: null, count: -1 }, { error: null, count: 1.5 }];
      for (const value of badUsage) { usage = value; assert.deepEqual(await quota.resolveRegenQuota("fixture"), unavailable); }
      usage = { error: null, count: 0 };
      for (const data of [null, {}, [{ granted: -1 }], [{ granted: "10" }], [{ granted: Number.MAX_SAFE_INTEGER }], [null]]) {
        packs = { error: null, data }; assert.deepEqual(await quota.resolveRegenQuota("fixture"), unavailable);
      }
      packs = { error: "offline", data: [] };
      assert.deepEqual(await quota.resolveRegenQuota("fixture"), unavailable);
      quotaAvailable = false;
      assert.deepEqual(await quota.resolveRegenQuota("fixture"), unavailable);
      quotaThrows = true;
      assert.deepEqual(await quota.resolveRegenQuota("fixture"), unavailable);
      assert.deepEqual(await quota.resolveRegenQuota(), unavailable);
    });

    await check("quota outage and exhaustion prevent reservation and all external work", async () => {
      const id = await seed({ section: true }), requestId = randomUUID(), saved = (await read(id)).state;
      usage = { error: "offline", count: null };
      const failed = await prepare(id, requestId);
      assert.equal(failed.status, 503); assert.equal(failed.body.code, "quota_unavailable");
      assert.deepEqual((await read(id)).state, saved); assert.equal(attempts.length, 0);
      usage = { error: null, count: 20 };
      assert.equal((await prepare(id, requestId)).status, 402);
      assert.deepEqual((await read(id)).state, saved); assert.equal(attempts.length, 0);
      usage = { error: null, count: 0 };
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.equal(attempts.length, 1);
    });

    await check("quota failure after reservation recovers only its original reserved ID", async () => {
      const id = await seed({ section: true }), requestId = randomUUID();
      saveHook = async state => {
        if (state.plans.find(plan => plan.id === id)?.answers.__coach_generation?.dispatchState === "reserved") quotaAvailable = false;
      };
      assert.equal((await prepare(id, requestId)).status, 503);
      const reserved = (await read(id)).generation!;
      assert.equal(reserved.dispatchState, "reserved"); assert.equal(attempts.length, 0);
      saveHook = async () => undefined; quotaAvailable = true;
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.equal(attempts.length, 1); assert.equal(attempts[0].id, reserved.runId);
    });

    await check("first generation does not require a regeneration quota lookup", async () => {
      const id = await seed(); quotaAvailable = false;
      assert.equal((await prepare(id)).status, 200);
      assert.equal(quotaReads, 0); assert.equal(attempts.length, 1);
    });

    for (const failAt of ["reserved", "dispatching"]) await check(`storage failure at ${failAt} performs no work and explicit replay recovers`, async () => {
      const id = await seed(), requestId = randomUUID();
      saveHook = async state => { if (state.plans.find(plan => plan.id === id)?.answers.__coach_generation?.dispatchState === failAt) throw new Error("storage unavailable"); };
      assert.equal((await prepare(id, requestId)).status, 503);
      assert.equal(attempts.length, 0);
      const reserved = (await read(id)).generation;
      assert.equal(!!reserved, failAt === "dispatching");
      saveHook = async () => undefined;
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.equal(attempts.length, 1);
      if (reserved) assert.equal(attempts[0].id, reserved.runId);
    });

    await check("failed dispatch has no automatic retry or alternate workflow", async () => {
      const id = await seed(), requestId = randomUUID();
      createHook = async () => { throw new Error("dispatch rejected before acceptance"); };
      assert.equal((await prepare(id, requestId)).status, 503);
      assert.equal(attempts.length, 1); assert.equal(workflows.size, 0);
      const reserved = (await read(id)).generation!;
      assert.equal(reserved.dispatchState, "uncertain");
      createHook = async () => undefined;
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.equal(attempts.length, 2); assert.equal(workflows.size, 1);
      assert.ok(attempts.every(attempt => attempt.id === reserved.runId));
    });

    for (const lookupFailure of [false, true]) await check(`accepted dispatch with lost response recovers without duplicate create (lookup outage=${lookupFailure})`, async () => {
      const id = await seed(), requestId = randomUUID();
      createHook = async dispatch => { workflows.set(dispatch.id, "running"); statusUnavailable = lookupFailure; throw new Error("response lost after acceptance"); };
      assert.equal((await prepare(id, requestId)).status, lookupFailure ? 503 : 200);
      assert.equal(attempts.length, 1); assert.equal(workflows.size, 1);
      statusUnavailable = false; createHook = async () => undefined;
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.equal(attempts.length, 1); assert.equal(workflows.size, 1);
      assert.equal((await read(id)).generation?.receipts[0].accepted, true);
    });

    await check("lost acknowledgement save recovers an accepted workflow without duplicate create", async () => {
      const id = await seed(), requestId = randomUUID();
      saveHook = async state => { if (state.plans.find(plan => plan.id === id)?.answers.__coach_generation?.dispatchState === "dispatched") throw new Error("ack save unavailable"); };
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.equal((await read(id)).generation?.dispatchState, "dispatching");
      saveHook = async () => undefined;
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.equal((await read(id)).generation?.dispatchState, "dispatched");
      assert.equal(attempts.length, 1);
    });

    await check("expired dispatch lease recovers the reserved ID after a process crash", async () => {
      const id = await seed(), requestId = randomUUID();
      saveHook = async state => { if (state.plans.find(plan => plan.id === id)?.answers.__coach_generation?.dispatchState === "dispatching") throw new Error("process ended before dispatch"); };
      assert.equal((await prepare(id, requestId)).status, 503);
      saveHook = async () => undefined;
      await mutate(id, plan => { plan.answers.__coach_generation.dispatchState = "dispatching"; plan.answers.__coach_generation.dispatchAt = new Date(Date.now() - 61_000).toISOString(); });
      const runId = (await read(id)).generation!.runId;
      assert.equal((await prepare(id, requestId)).status, 200);
      assert.equal(attempts.length, 1); assert.equal(attempts[0].id, runId);
    });

    await check("a source edit can replace an undispatched reservation but cannot replay its stale request", async () => {
      const id = await seed(), requestId = randomUUID();
      saveHook = async state => { if (state.plans.find(plan => plan.id === id)?.answers.__coach_generation?.dispatchState === "dispatching") throw new Error("claim save failed"); };
      assert.equal((await prepare(id, requestId)).status, 503);
      const originalRun = (await read(id)).generation!.runId;
      saveHook = async () => undefined;
      await mutate(id, plan => {
        const coach = readCoach(plan.answers)!;
        coach.revision++; coach.documentRevision = 3;
        plan.answers[COACH_KEY] = { state: coach };
      });
      assert.equal((await prepare(id, requestId)).status, 409);
      assert.equal(attempts.length, 0);
      assert.equal((await prepare(id, randomUUID(), { revision: 3 })).status, 200);
      assert.equal(attempts.length, 1); assert.notEqual(attempts[0].id, originalRun);
      assert.equal((await read(id)).generation!.receipts.length, 2);
    });

    await check("an uncertain dispatch cannot be replaced after a source edit", async () => {
      const id = await seed(), requestId = randomUUID();
      createHook = async dispatch => { workflows.set(dispatch.id, "running"); statusUnavailable = true; throw new Error("lost acknowledgement"); };
      assert.equal((await prepare(id, requestId)).status, 503);
      const originalRun = (await read(id)).generation!.runId;
      await mutate(id, plan => {
        const coach = readCoach(plan.answers)!;
        coach.revision++; coach.documentRevision = 3;
        plan.answers[COACH_KEY] = { state: coach };
      });
      assert.equal((await prepare(id, randomUUID(), { revision: 3 })).status, 503);
      assert.equal(attempts.length, 1); assert.equal((await read(id)).generation!.runId, originalRun);
    });

    await check("new source generation retains old receipts and checks verified regeneration quota", async () => {
      const id = await seed({ section: true }), originalRequest = randomUUID();
      assert.equal((await prepare(id, originalRequest)).status, 200);
      const originalRun = (await read(id)).generation!.runId;
      workflows.set(originalRun, "complete");
      await mutate(id, plan => {
        const coach = readCoach(plan.answers)!;
        coach.revision++; coach.documentRevision = 3;
        plan.answers[COACH_KEY] = { state: coach };
      });
      const beforeQuota = quotaReads;
      assert.equal((await prepare(id, randomUUID(), { revision: 3 })).status, 200);
      assert.equal(attempts.length, 2); assert.ok(quotaReads > beforeQuota);
      assert.notEqual(attempts[1].id, originalRun);
      const saved = (await read(id)).state;
      assert.equal((await prepare(id, originalRequest)).status, 200);
      assert.deepEqual((await read(id)).state, saved); assert.equal(attempts.length, 2);
    });

    await check("workflow identities are scoped to owner and plan, not a client UUID alone", async () => {
      const requestId = randomUUID();
      const firstId = await seed();
      assert.equal((await prepare(firstId, requestId)).status, 200);
      const secondId = await seed();
      assert.equal((await prepare(secondId, requestId)).status, 200);
      owner = `other-owner-${randomUUID()}`;
      const thirdId = await seed();
      assert.equal((await prepare(thirdId, requestId)).status, 200);
      assert.equal(new Set(attempts.map(attempt => attempt.id)).size, 3);
      assert.equal(workflows.size, 3);
    });

    await check("terminal failed workflow is not automatically restarted by a new request ID", async () => {
      const id = await seed();
      await prepare(id);
      workflows.set((await read(id)).generation!.runId, "errored");
      assert.equal((await prepare(id)).status, 502);
      assert.equal(attempts.length, 1); assert.equal(workflows.size, 1);
    });

    await check("legacy completed generation is adopted without another workflow", async () => {
      const id = await seed(), runId = "coach-legacy-fixture";
      await mutate(id, plan => { plan.answers.__coach_generation = { revision: 2, runId, keys: ["overview/summary", "overview/problem"], paid: true }; });
      workflows.set(runId, "complete");
      assert.equal((await prepare(id)).status, 200);
      assert.equal(attempts.length, 0); assert.equal((await read(id)).generation!.runId, runId);
    });

    await check("missing workflow binding preserves raw state without reservation", async () => {
      const id = await seed(), saved = (await read(id)).state;
      bindingAvailable = false;
      assert.equal((await prepare(id)).status, 503);
      assert.deepEqual((await read(id)).state, saved); assert.equal(attempts.length, 0);
    });

    console.log(`business intake prepare: ${passed} passed, ${failures.length} failed (memory and mocked boundaries only)`);
    assert.deepEqual(failures, []);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [id, original] of originals) {
      if (original) require.cache[id] = original;
      else delete require.cache[id];
    }
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
