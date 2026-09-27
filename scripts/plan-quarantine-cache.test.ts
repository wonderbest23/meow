import assert from "node:assert/strict";
import { filterQuarantinedCache, readQuarantineNotice } from "../lib/plan-builder/quarantine-cache";

async function main() {
  const items = new Map<string, string>();
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); }, key: (index: number) => [...items.keys()][index] ?? null, get length() { return items.size; } };
  const events = new Map<string, (event: unknown) => void>();
  Object.assign(globalThis, { localStorage: storage, sessionStorage: storage, window: { localStorage: storage, location: { reload() {} }, addEventListener: (name: string, handler: (e: unknown) => void) => events.set(name, handler) }, document: { addEventListener() {}, visibilityState: "visible" } });
  const business = { name: "unresolved", description: "", role: "", industry: "", stage: "", region: "" };
  const plan = (id: string) => ({ id, title: id, answers: {}, sections: {}, planType: "test", createdAt: "2026-09-01", updatedAt: "2026-09-01" });
  const state = { business, plans: [plan("held"), plan("safe")], activePlanId: "held" };
  const notice = { revision: "r1", blockedPlanIds: ["held"], profileBlocked: true };
  assert.equal(readQuarantineNotice({ ...notice, blockedPlanIds: [123] }), null);
  assert.equal(filterQuarantinedCache(state, notice, { ...business, name: "" }).plans.length, 1);
  storage.setItem("oneul-plan-cache-owner", "owner-a");
  const key = "oneul-plan-demo-v1:owner-a";
  storage.setItem(key, JSON.stringify(state));
  const writes: typeof state[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "PUT") { writes.push(JSON.parse(String(init.body)));return Response.json({ ok: true }); }
    return Response.json({ business: {}, plans: [plan("safe")], activePlanId: null, ownerKey: "owner-a", authenticated: true, quarantine: notice });
  };
  const api = await import("../lib/plan-builder/plan-store");
  await api.hydrateFromServer(false);
  assert.deepEqual(JSON.parse(storage.getItem(`${key}:quarantine-backup:r1`)!), state);
  assert.deepEqual(api.loadState().plans.filter(p => !api.isSamplePlan(p.id)).map(p => p.id), ["safe"]);
  assert.equal(api.loadState().business.name, "");
  await api.pushToServer();
  assert.deepEqual(writes[0].plans.map(p => p.id), ["safe"]);
  await api.hydrateFromServer(false);
  assert.deepEqual(JSON.parse(storage.getItem(`${key}:quarantine-backup:r1`)!), state, "repeat hydration must not replace preserved draft");
  const oldEpoch = api.planOwnerEpoch();
  events.get("storage")!({ key: `${key}:quarantine`, oldValue: "old", newValue: JSON.stringify(notice) });
  assert(api.planOwnerEpoch() > oldEpoch);
  console.log("PASS quarantine cache: real hydration, backup preservation, no resurrection, no root-context carryover, clean autosave, tab invalidation");
}
main().catch(error => { console.error(error);process.exitCode = 1; });
