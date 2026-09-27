import assert from "node:assert/strict";
import Module from "node:module";

async function main() {
  process.env.PLAN_QUARANTINE_ENABLED = "1";
  process.env.PLAN_ACCOUNT_LINKING_ENABLED = "true";
  const raw = { business: { name: "private original", description: "", role: "", industry: "", region: "", stage: "" },
    plans: [{ id: "held", title: "original", planType: "test", createdAt: "2026-09-01", updatedAt: "2026-09-01", answers: {}, sections: {}, opaque: { preserve: true } },
      { id: "safe", title: "safe", planType: "test", createdAt: "2026-09-02", updatedAt: "2026-09-02", answers: {}, sections: {} }], activePlanId: "held" };
  const original = structuredClone(raw);
  const status = { revision: "fixture", blockedPlanIds: ["held"], profileBlocked: true, blockedProjectIds: [] };
  let unavailable = false, commits = 0, calls = 0, committed: typeof raw | null = null;
  const db = {
    from(table: string) {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ error: null, data: { data: table === "plan_states_accessible" ? { ...raw, business: {}, plans: raw.plans.filter(p => p.id !== "held"), activePlanId: null } : structuredClone(raw), updated_at: "2026-09-01T00:00:00Z" } }) };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "plan_quarantine_status") return { data: unavailable ? null : status, error: unavailable ? { message: "fixture outage" } : null };
      assert.equal(name, "commit_plan_state");commits++;committed = args.p_data as typeof raw;return { data: "saved", error: null };
    },
  };
  const loader = Module as unknown as { _load: (id: string, parent: unknown, main: boolean) => unknown };
  const previous = loader._load;
  loader._load = function(id, parent, main) { if (id === "../persistence") return { getServerSupabase: () => db };return previous.call(this, id, parent, main); };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls++;throw Error("NETWORK_BLOCKED"); };
  try {
    const api = await import("../lib/plan-builder/plan-server-store");
    const visible = await api.loadPlanState("owner");
    assert.deepEqual(visible.plans.map(p => p.id), ["safe"]);
    assert.equal(visible.business.name, "");
    await assert.rejects(api.savePlanState("owner", api.normalizeState(raw)), /PLAN_QUARANTINED/);
    await assert.rejects(api.deletePlanById("owner", "held"), /PLAN_QUARANTINED/);
    assert.equal(await api.claimGuestPlanState("owner", "account"), "deferred");
    assert.equal(commits, 0);
    visible.plans[0].title = "edited safe";
    await api.savePlanState("owner", visible);
    assert.equal(commits, 1);
    assert.deepEqual(committed!.plans.find(p => p.id === "held"), original.plans[0]);
    assert.deepEqual(committed!.business, original.business);
    assert.equal(committed!.plans.find(p => p.id === "safe")?.title, "edited safe");
    await assert.rejects(api.savePlanState("owner", visible, { planId: "held", coachRevision: 0 }), /PLAN_QUARANTINED/);
    await api.deletePlanById("owner", "safe");
    assert.equal(commits, 2);
    assert.deepEqual(committed!.plans, [original.plans[0]]);
    unavailable = true;
    await assert.rejects(api.savePlanState("owner", visible), /PLAN_QUARANTINE_UNAVAILABLE/);
    assert.equal(commits, 2);
    assert.equal(calls, 0);
    console.log("PASS quarantine server: filtered read, direct denial, deferred claim, byte-preserved safe save, late-job denial, fail-closed, AI0");
  } finally { loader._load = previous;globalThis.fetch = nativeFetch; }
}
main().catch(error => { console.error(error);process.exitCode = 1; });
