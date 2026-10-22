import assert from "node:assert/strict";
import type { PlanState } from "../lib/plan-builder/plan-store";

/*
 * 계정 연결 기능(ownerKey)이 꺼진 운영 그대로 — 로그아웃 없이 다른 계정으로 로그인해도
 * 이전 계정의 기기 저장본이 새 계정 화면에 보이거나 새 계정 서버에 올라가면 안 된다.
 * 비회원 → 첫 로그인은 지금처럼 이어 준다.
 */
const KEY = "oneul-plan-demo-v1";
const ACCOUNT = "oneul-plan-cache-account";

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

function state(...ids: string[]): PlanState {
  return {
    business: { name: ids[0] ?? "", description: "", role: "", industry: "", region: "", stage: "" },
    plans: ids.map(id => ({ id, title: id, planType: "창업 초기 · 사업계획서", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", answers: {}, sections: {} })),
    activePlanId: ids[0] ?? null,
  };
}

async function main() {
  const local = storage();
  const session = storage();
  const events = new Map<string, (event: Partial<StorageEvent>) => void>();
  let reloads = 0;
  Object.assign(globalThis, {
    window: { localStorage: local, location: { reload: () => { reloads++; } }, addEventListener: (name: string, listener: (event: Partial<StorageEvent>) => void) => events.set(name, listener) },
    localStorage: local,
    sessionStorage: session,
    document: { visibilityState: "visible", addEventListener: () => {} },
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: () => true } });

  // ownerKey 없음 = PLAN_ACCOUNT_LINKING_ENABLED 가 꺼진 운영 응답
  let server: Record<string, unknown> = { ...state(), authenticated: false };
  let reads = 0;
  const writes: PlanState[] = [];
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "PUT") { writes.push(JSON.parse(String(init.body))); return Response.json({ ok: true }); }
    if (init?.method === "DELETE") return Response.json({ ok: true });
    reads++;
    return Response.json(server);
  };

  local.setItem(KEY, JSON.stringify(state("guest-plan")));
  const api = await import("../lib/plan-builder/plan-store");
  let ownerNotifications = 0;
  const unsubscribe = api.subscribePlanOwnerChange(() => { ownerNotifications++; });
  const ownIds = () => api.loadState().plans.filter(plan => !api.isSamplePlan(plan.id)).map(plan => plan.id).sort();
  try {
    await api.hydrateFromServer(false);
    assert.deepEqual(ownIds(), ["guest-plan"], "비회원 저장본은 그대로 남는다");
    assert.equal(local.getItem(ACCOUNT), null, "비회원 저장본에는 계정 표식을 남기지 않는다");

    // 비회원 → 첫 로그인(A): 쓰던 사업을 A 계정으로 이어 준다
    server = { ...state("a-plan"), authenticated: true, accountKey: "account-a" };
    await api.hydrateFromServer(false);
    assert.deepEqual(ownIds(), ["a-plan", "guest-plan"], "첫 로그인은 비회원 사업을 계정으로 이어 준다");
    assert.equal(local.getItem(ACCOUNT), "account-a");
    assert.ok(await api.pushToServer());
    assert.deepEqual(writes.at(-1)?.plans.map(plan => plan.id).sort(), ["a-plan", "guest-plan"]);

    // 로그아웃 없이 B 로 로그인: A 의 사업을 보이지도, 올리지도 않는다
    session.setItem("coach-input:a-plan", "A 가 쓰던 대화");
    const notificationsBefore = ownerNotifications;
    const writesBefore = writes.length;
    server = { ...state("b-plan"), authenticated: true, accountKey: "account-b" };
    await api.hydrateFromServer();
    assert.deepEqual(ownIds(), ["b-plan"], "A 계정 저장본은 B 계정 화면에 보이지 않는다");
    assert.equal(local.getItem(ACCOUNT), "account-b");
    assert.equal(session.getItem("coach-input:a-plan"), null, "A 의 쓰다 만 대화도 지운다");
    assert.ok(ownerNotifications > notificationsBefore, "열린 화면은 새 계정으로 다시 불러온다");
    assert.ok(await api.pushToServer());
    assert.ok(writes.slice(writesBefore).every(write => write.plans.every(plan => plan.id === "b-plan")), "A 의 사업이 B 서버에 올라가지 않는다");

    // 표식이 생기기 전에 로그인해 쓰던 저장본 — 누구 것인지 모르니 서버에 있는 사업만 남긴다
    local.removeItem(ACCOUNT);
    local.setItem(KEY, JSON.stringify(state("b-plan", "unknown-plan")));
    await api.hydrateFromServer(false);
    assert.deepEqual(ownIds(), ["b-plan"], "주인을 모르는 옛 저장본의 낯선 사업은 올리지 않는다");
    assert.equal(local.getItem(ACCOUNT), "account-b");

    // 다른 탭이 C 로 로그인해 표식을 바꿨으면 이 탭은 확인 전까지 올리지 않는다
    server = { ...state("c-plan"), authenticated: true, accountKey: "account-c" };
    local.setItem(ACCOUNT, "account-c");
    local.setItem(KEY, JSON.stringify(state("c-plan")));
    const readsBefore = reads;
    assert.ok(await api.pushToServer());
    assert.ok(reads > readsBefore, "계정이 바뀐 탭은 다시 확인한 뒤에야 저장한다");
    assert.deepEqual(writes.at(-1)?.plans.map(plan => plan.id), ["c-plan"]);
    const reloadsBefore = reloads;
    events.get("storage")?.({ key: ACCOUNT, oldValue: "account-c", newValue: "account-d" });
    assert.equal(reloads, reloadsBefore + 1, "다른 탭의 계정 변경은 이 탭을 다시 불러온다");

    // 로그아웃하면 계정 표식도 지운다
    api.clearLocalState();
    assert.equal(local.getItem(ACCOUNT), null);
    // 대화 화면이 서버에 저장한 새 사업 이름은 같은 탭의 왼쪽 목록에 알린다(예시 사업·빈 이름은 알리지 않는다)
    const notices: Array<{ planId: string; title: string }> = [];
    const offTitle = api.subscribePlanTitle(notice => notices.push({ planId: notice.planId, title: notice.title }));
    api.announcePlanTitle({ planId: "plan_candle", title: "향기로운 캔들 공방", updatedAt: "2026-10-22T01:00:00.000Z" });
    api.announcePlanTitle({ planId: "plan_candle", title: "  ", updatedAt: "2026-10-22T01:00:01.000Z" });
    await new Promise(resolve => setTimeout(resolve, 0));
    offTitle();
    api.announcePlanTitle({ planId: "plan_candle", title: "다른 이름", updatedAt: "2026-10-22T01:00:02.000Z" });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(notices, [{ planId: "plan_candle", title: "향기로운 캔들 공방" }], "구독을 끊은 뒤에는 알림을 받지 않는다");
    console.log("plan-account-switch: account switch isolation, guest carry-over, legacy cache, cross-tab and title notice assertions passed");
  } finally {
    unsubscribe();
    api.clearLocalState();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
