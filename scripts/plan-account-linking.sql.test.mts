import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const modulePath = process.env.PGLITE_TEST_MODULE;
if (!modulePath) throw new Error("Set PGLITE_TEST_MODULE to an isolated @electric-sql/pglite module path");
const { PGlite } = await import(modulePath);
const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role;");
await db.exec(await readFile("supabase/migrations/0019_plan_states.sql", "utf8"));
await db.exec(await readFile("supabase/migrations/0027_plan_account_linking.sql", "utf8"));

process.env.PERSISTENCE_MODE = "supabase";
process.env.SUPABASE_URL = "https://fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
process.env.PLAN_ACCOUNT_LINKING_ENABLED = "true";
const originalFetch = globalThis.fetch;
let conflictHook: (() => Promise<void>) | null = null;
let claimCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.equal(url.hostname, "fixture.invalid", "Never contact a real database or provider");
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const name = url.pathname.split("/").at(-1)!;
    assert(["commit_plan_state", "claim_plan_state"].includes(name));
    if (name === "claim_plan_state") {
      claimCalls++;
      const hook = conflictHook; conflictHook = null; if (hook) await hook();
    }
    const body = JSON.parse(String(init?.body));
    const keys = Object.keys(body);
    assert(keys.every(key => /^p_[a-z_]+$/.test(key)));
    try {
      const result = await db.query(`select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(",")}) as result`, Object.values(body));
      return Response.json(result.rows[0].result);
    } catch (error) {
      return Response.json({ message: String(error), code: "XX000" }, { status: 400 });
    }
  }
  assert(!init?.method || init.method === "GET", "Writes must use the locked SQL functions");
  const table = url.pathname.split("/").at(-1);
  const column = table === "plan_states" ? "owner_hash" : "guest_hash";
  assert(["plan_states", "plan_owner_claims"].includes(table!));
  const owner = url.searchParams.get(column)?.replace(/^eq\./, "");
  const result = await db.query(`select ${table === "plan_states" ? "data, updated_at::text" : "guest_hash"} from public.${table} where ${column} = $1`, [owner]);
  return Response.json(result.rows[0] ?? null);
};

try {
  const { normalizeState, savePlanState, loadPlanState, claimGuestPlanState, deletePlanById } = await import("../lib/plan-builder/plan-server-store");
  const fixture = (id: string) => normalizeState({ plans: [{ id, title: id, planType: "test", createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z", sections: {}, answers: { __deck_job: { status: "failed", token: "saved-token", draft: { slides: ["saved"] } } } }], activePlanId: id });
  await savePlanState("guest", fixture("guest-plan"));
  await savePlanState("account", fixture("existing-plan"));
  conflictHook = () => savePlanState("account", fixture("simultaneous-save"));
  await claimGuestPlanState("guest", "account");
  assert.equal(claimCalls, 2, "A concurrent destination save must trigger a fresh merge");
  const saved = await loadPlanState("account");
  assert.deepEqual(saved.plans.map(p => p.id).sort(), ["existing-plan", "guest-plan", "simultaneous-save"]);
  assert.deepEqual(saved.plans.find(p => p.id === "guest-plan")?.answers.__deck_job, fixture("guest-plan").plans[0].answers.__deck_job);
  assert.equal((await loadPlanState("guest")).plans.length, 0);
  await claimGuestPlanState("guest", "account");
  assert.deepEqual(await loadPlanState("account"), saved, "Response loss retry must not overwrite the destination");
  assert.equal(await claimGuestPlanState("guest", "other-account"), "consumed");
  assert.equal((await loadPlanState("other-account")).plans.length, 0);
  await assert.rejects(savePlanState("guest", fixture("late-worker")), /PLAN_OWNER_CHANGED/);
  await deletePlanById("account", "existing-plan");
  assert.deepEqual((await loadPlanState("account")).plans.map(p => p.id).sort(), ["guest-plan", "simultaneous-save"]);

  const busy = fixture("busy"); busy.plans[0].answers.__coach_job = { status: "running" };
  await savePlanState("busy-guest", busy);
  await assert.rejects(claimGuestPlanState("busy-guest", "busy-account"), /PLAN_CLAIM_BUSY/);
  assert.deepEqual(await loadPlanState("busy-guest"), busy);
  assert.equal((await loadPlanState("busy-account")).plans.length, 0);

  await savePlanState("rollback-guest", fixture("rollback-plan"));
  await db.exec(`create function fail_claim_fixture() returns trigger language plpgsql as $$ begin if new.guest_hash = 'rollback-guest' then raise exception 'fixture rollback'; end if; return new; end; $$;
    create trigger fail_claim_fixture before insert on public.plan_owner_claims for each row execute function fail_claim_fixture();`);
  await assert.rejects(claimGuestPlanState("rollback-guest", "rollback-account"), /PLAN_CLAIM_FAILED/);
  assert.equal((await loadPlanState("rollback-guest")).plans[0].id, "rollback-plan", "Source remains after a late transaction error");
  assert.equal((await loadPlanState("rollback-account")).plans.length, 0, "Destination write rolls back too");
  await db.exec("drop trigger fail_claim_fixture on public.plan_owner_claims");
  await claimGuestPlanState("rollback-guest", "rollback-account");
  assert.equal((await loadPlanState("rollback-account")).plans[0].id, "rollback-plan");

  for (const role of ["anon", "authenticated"]) {
    const result = await db.query("select has_function_privilege($1, 'public.claim_plan_state(text,text,timestamptz,timestamptz,jsonb,text,text)', 'EXECUTE') as allowed", [role]);
    assert.equal(result.rows[0].allowed, false);
  }
  console.log("SQL engine: real migration, server adapter, CAS conflict retry, ownership, rollback, late writes and RPC permissions passed");
  console.log("Independent PostgreSQL WASM engine; real Supabase auth, networking and parallel transactions still require staging verification");
} finally {
  globalThis.fetch = originalFetch;
  await db.close();
}
