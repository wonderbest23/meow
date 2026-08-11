import assert from "node:assert/strict";

/*
 * 계정(서버)이 원래 상태다. 브라우저 저장분은 사본일 뿐이라
 * 서버 저장이 실패하면 반드시 알려주고 다시 시도해야 한다.
 *
 * 예전에는 응답 코드조차 보지 않아 500도 성공으로 쳤다.
 */
async function main() {
  const store = new Map<string, string>();
  const local = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as Record<string, unknown>).window = { localStorage: local, addEventListener: () => {} };
  (globalThis as Record<string, unknown>).localStorage = local;
  (globalThis as Record<string, unknown>).document = { addEventListener: () => {}, visibilityState: "visible" };

  let status = 500;
  const sent: number[] = [];
  let inFlight = 0;
  let maxConcurrent = 0;
  (globalThis as Record<string, unknown>).fetch = async () => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight -= 1;
    sent.push(status);
    return { ok: status < 400, status, json: async () => ({}) };
  };

  const { pushToServer, planSyncStatus, createPlan } = await import("../lib/plan-builder/plan-store");
  createPlan("창업 초기 · 사업계획서", "테스트");

  // 1) 서버가 500이면 실패로 보고 '저장 안 됨'이 된다
  const ok = await pushToServer();
  assert.equal(ok, false, "500을 성공으로 치면 안 된다");
  assert.equal(planSyncStatus(), "offline", "실패는 화면이 알 수 있어야 한다");

  // 2) 한 번에 하나씩만 보낸다 — 빠른 저장이 뒤바뀌어 덮어쓰지 않게
  sent.length = 0;
  status = 200;
  await Promise.all([pushToServer(), pushToServer(), pushToServer()]);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(maxConcurrent, 1, "동시에 두 개가 나가면 순서가 뒤바뀔 수 있다");

  // 3) 성공하면 '저장됨'
  assert.equal(planSyncStatus(), "saved");

  console.log("plan-sync: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
