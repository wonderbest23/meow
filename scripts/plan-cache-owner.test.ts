import assert from "node:assert/strict";
import type { PlanState } from "../lib/plan-builder/plan-store";

const KEY = "oneul-plan-demo-v1";
const OWNER = "oneul-plan-cache-owner";

function storage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function state(id?: string): PlanState {
  return {
    business: { name: id ?? "", description: "", role: "", industry: "", region: "", stage: "" },
    plans: id ? [{ id, title: id, planType: "창업 초기 · 사업계획서", createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:00Z", answers: {}, sections: {} }] : [],
    activePlanId: id ?? null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function main() {
  const local = storage();
  const session = storage();
  const events = new Map<string, (event: Partial<StorageEvent>) => void>();
  const beacons: Blob[] = [];
  let reloads = 0;
  Object.assign(globalThis, {
    window: { localStorage: local, location: { reload: () => { reloads++; } }, addEventListener: (name: string, listener: (event: Partial<StorageEvent>) => void) => events.set(name, listener) },
    localStorage: local,
    sessionStorage: session,
    document: { visibilityState: "visible", addEventListener: () => {} },
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: (_url: string, body: Blob) => { beacons.push(body); return true; } } });

  let server = { ...state(), ownerKey: "guest", authenticated: false };
  let readOnce: (() => Promise<Response>) | null = null;
  let writeOnce: ((init: RequestInit) => Promise<Response>) | null = null;
  let failNetwork = false;
  const writes: Array<PlanState & { ownerKey: string }> = [];
  globalThis.fetch = async (_url, init) => {
    if (failNetwork) throw new Error("offline fixture");
    if (init?.method === "PUT") {
      writes.push(JSON.parse(String(init.body)));
      const next = writeOnce;
      writeOnce = null;
      return next ? next(init) : Response.json({ ok: true });
    }
    const next = readOnce;
    readOnce = null;
    return next ? next() : Response.json(server);
  };

  local.setItem(KEY, JSON.stringify(state("guest-local")));
  const api = await import("../lib/plan-builder/plan-store");
  const ownIds = () => api.loadState().plans.filter(plan => !api.isSamplePlan(plan.id)).map(plan => plan.id);
  try {
    await api.hydrateFromServer(false);
    assert.equal(local.getItem(OWNER), "guest");
    assert.deepEqual(ownIds(), ["guest-local"], "first anonymous cache acquires its server owner without losing drafts");
    await api.prepareAccountSignIn();
    assert.equal(writes.at(-1)?.ownerKey, "guest");
    assert.equal(writes.at(-1)?.plans[0]?.id, "guest-local", "sign-in flushes guest work before the auth cookie changes");

    server = { ...state("account-a-plan"), ownerKey: "account-a", authenticated: true };
    session.setItem("coach-input:guest-local", "unsent guest text");
    await api.hydrateFromServer(false);
    assert.deepEqual(ownIds(), ["account-a-plan"], "guest cache is never blindly merged into an authenticated owner");
    assert.equal(session.getItem("coach-input:guest-local"), null);
    const accountA = state("account-a-local");
    local.setItem(`${KEY}:account-a`, JSON.stringify(accountA));

    server = { ...state("account-b-plan"), ownerKey: "account-b", authenticated: true };
    await api.hydrateFromServer(false);
    await api.pushToServer();
    assert.deepEqual(ownIds(), ["account-b-plan"]);
    assert.deepEqual(writes.at(-1)?.plans.map(plan => plan.id), ["account-b-plan"], "A-to-B login must not upload A's cache to B");
    assert.equal(writes.at(-1)?.ownerKey, "account-b");
    assert.deepEqual(JSON.parse(local.getItem(`${KEY}:account-a`)!), accountA, "isolated unsynced A data remains available to A");

    const oldRead = deferred<Response>();
    readOnce = () => oldRead.promise;
    const oldHydration = api.hydrateFromServer(false);
    server = { ...state("account-c-plan"), ownerKey: "account-c", authenticated: true };
    await api.hydrateFromServer(false);
    oldRead.resolve(Response.json({ ...state("stale-b-plan"), ownerKey: "account-b", authenticated: true }));
    await oldHydration;
    assert.equal(local.getItem(OWNER), "account-c", "late identity responses cannot roll the active cache back");

    const changedWrite = deferred<Response>();
    writeOnce = () => changedWrite.promise;
    const stalePush = api.pushToServer();
    const queuedPush = api.pushToServer();
    const countBeforeConflict = writes.length;
    server = { ...state("account-d-plan"), ownerKey: "account-d", authenticated: true };
    changedWrite.resolve(Response.json({ error: { code: "PLAN_OWNER_CHANGED" } }, { status: 409 }));
    assert.equal(await stalePush, false);
    assert.equal(await queuedPush, false);
    assert.equal(writes.length, countBeforeConflict, "a stale queued save must not resume under the next account");
    assert.deepEqual(ownIds(), ["account-d-plan"]);
    assert.equal(reloads, 1, "a stale tab refreshes its mounted conversation after the owner changes");

    const pending = deferred<Response>();
    let signal: AbortSignal | null | undefined;
    writeOnce = init => { signal = init.signal; return pending.promise; };
    const pendingPush = api.pushToServer();
    events.get("pagehide")?.({});
    assert.equal(JSON.parse(await beacons.at(-1)!.text()).ownerKey, "account-d", "unload saves carry the verified owner");
    local.setItem(OWNER, "another-tab-owner");
    events.get("pagehide")?.({});
    assert.equal(beacons.length, 1, "a changed owner cannot send a stale unload save");
    api.clearLocalState();
    assert.equal(signal?.aborted, true);
    pending.resolve(Response.json({ ok: true }));
    assert.equal(await pendingPush, false);
    assert.equal(api.planSyncStatus(), "idle", "late responses after logout do not restore saved state or retries");

    const logoutRead = deferred<Response>();
    readOnce = () => logoutRead.promise;
    const hydrationBeforeLogout = api.hydrateFromServer(false);
    api.clearLocalState();
    logoutRead.resolve(Response.json(server));
    await hydrationBeforeLogout;
    assert.equal(local.getItem(OWNER), null);
    assert.deepEqual(ownIds(), [], "a late GET must not repopulate logged-out account data");

    server = { ...state("guest-new-plan"), ownerKey: "guest-new", authenticated: false };
    await api.hydrateFromServer(false);
    failNetwork = true;
    await assert.rejects(api.prepareAccountSignIn(), /서버에 저장하지 못했어요/);
    assert.equal(api.planSyncStatus(), "offline");
    failNetwork = false;
    api.clearLocalState();

    server = { ...state("account-e-plan"), ownerKey: "account-e", authenticated: true };
    await api.hydrateFromServer(false);
    session.setItem("coach-input:account-e-plan", "account E draft");
    events.get("storage")?.({ key: OWNER, oldValue: "account-e", newValue: "account-f" });
    assert.equal(session.getItem("coach-input:account-e-plan"), null);
    assert.equal(reloads, 2);
    events.get("storage")?.({ key: null, oldValue: null, newValue: null });
    assert.equal(reloads, 3, "cross-tab storage clear also invalidates identity");

    local.setItem("oneul-document-draft:private", "document draft");
    local.setItem(`${KEY}:other`, JSON.stringify(state("other")));
    local.setItem("unrelated-preference", "keep");
    api.clearLocalState();
    assert.equal(local.getItem("oneul-document-draft:private"), null);
    assert.equal(local.getItem(`${KEY}:other`), null);
    assert.equal(local.getItem("unrelated-preference"), "keep");
    console.log("plan-cache-owner: identity separation, stale responses, sign-in flush, unload and logout assertions passed");
  } finally {
    api.clearLocalState();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
