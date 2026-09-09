import assert from "node:assert/strict";

async function main() {
  process.env.PERSISTENCE_MODE = "supabase";
  process.env.SUPABASE_URL = "https://coach-storage-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-secret";
  const { savePlanState, loadPlanState, normalizeState } = await import("../lib/plan-builder/plan-server-store");
  const at = "2026-09-06T00:00:00.000Z";
  const make = (id: string) => ({ id, title: id, planType: "일반 사업계획서", createdAt: at, updatedAt: at, sections: {}, answers: {} });
  let row: { owner_hash: string; updated_at: string; data: ReturnType<typeof normalizeState>; title?: string; plan_type?: string } | null = null;
  let race = false;
  let failRead = false;
  let updates = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "coach-storage-test.supabase.co", "테스트 이외의 서버를 호출하지 않는다");
    const method = init?.method || "GET";
    if (method === "GET") return failRead ? Response.json({ message: "unavailable", code: "TEST" }, { status: 500 }) : Response.json(row ? [structuredClone(row)] : []);
    const payload = JSON.parse(String(init?.body));
    if (method === "POST") { if (row) return Response.json({ code: "23505" }, { status: 409 }); row = payload; return new Response(null, { status: 201 }); }
    assert.equal(method, "PATCH"); updates++;
    if (race && row) {
      race = false;
      row.data.plans.push(make("created-in-another-tab"));
      row.updated_at = new Date(Date.parse(row.updated_at) + 1).toISOString();
    }
    if (url.searchParams.get("updated_at") !== `eq.${row?.updated_at}`) return Response.json([]);
    row = payload;
    return Response.json([{ owner_hash: payload.owner_hash }]);
  };
  try {
    await savePlanState("test-owner", normalizeState({ plans: [make("first")] }));
    race = true;
    await savePlanState("test-owner", normalizeState({ plans: [make("second")] }));
    assert.ok(updates >= 2, "충돌하면 최신 상태를 읽어 다시 저장한다");
    const saved = await loadPlanState("test-owner");
    assert.deepEqual(saved.plans.map(p => p.id).sort(), ["created-in-another-tab", "first", "second"]);
    failRead = true;
    await assert.rejects(() => loadPlanState("test-owner"), /PLAN_LOAD_FAILED/, "DB 오류를 빈 문서로 오해하지 않는다");
    await assert.rejects(() => savePlanState("test-owner", normalizeState({ plans: [] })), /PLAN_LOAD_FAILED/);
  } finally { globalThis.fetch = original; }
  console.log("business-coach storage: database compare-and-swap retry, concurrent plan preservation and read failures passed (mock database)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
