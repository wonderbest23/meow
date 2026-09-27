import assert from "node:assert/strict";
Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: "https://synthetic.example.test", SUPABASE_SERVICE_ROLE_KEY: "synthetic-only" });
let calls = 0;
globalThis.fetch = async () => { calls++; return Response.json([]); };
async function main() {
  const { loadPlanState } = await import("../lib/plan-builder/plan-server-store");
  const first = await loadPlanState("synthetic-owner-a");
  first.plans.push({ id: "synthetic-private-plan", title: "owner A only", planType: "test", createdAt: "2026-01-01", updatedAt: "2026-01-01", answers: {}, sections: {} });
  const second = await loadPlanState("synthetic-owner-b");
  assert.deepEqual(second.plans, [], "An owner with no DB row must not inherit another owner's mutable empty state");
  assert.notEqual(first.plans, second.plans);
  assert.equal(calls, 2);
  console.log("PASS missing PostgreSQL rows produce independent owner states; provider calls=0");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
