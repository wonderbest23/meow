import assert from "node:assert/strict";

async function main() {
  process.env.PERSISTENCE_MODE = "supabase";
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
  process.env.NICEPAY_SECRET_KEY = "fixture-only";
  const originalFetch = globalThis.fetch;
  const rows = ["created", "done", "failed", "canceled", "refunded"].map(status => ({ order_id: status, status, owner_id: "owner-a", order_name: "사업계획서 플랜 빌더", opportunity: { planId: `plan-${status}` } }));
  let writes = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.hostname, "fixture.invalid", "No real payment or database requests");
    assert.equal(url.pathname, "/rest/v1/payment_orders");
    const matching = rows.filter(row => [...url.searchParams].every(([key, value]) => !value.startsWith("eq.") || String(row[key as keyof typeof row]) === value.slice(3)));
    if (init?.method === "PATCH") {
      writes++;
      const patch = JSON.parse(String(init.body));
      matching.forEach(row => Object.assign(row, patch));
      return new Response(null, { status: 204 });
    }
    return Response.json(matching.map(row => ({ opportunity: row.opportunity })));
  };
  try {
    const { markPlanOrderFailed, paidPlanEntitlement } = await import("../lib/payments/plan-orders");
    for (const row of rows) await markPlanOrderFailed({ orderId: row.order_id, code: "LATE_FAILURE", message: "Fixture callback" });
    assert.deepEqual(rows.map(row => row.status), ["failed", "done", "failed", "canceled", "refunded"], "Late failure cannot revoke paid access or overwrite refunds");
    const access = await paidPlanEntitlement("owner-a");
    assert.deepEqual([...access.planIds], ["plan-done"]);
    assert.equal(access.allAccess, false);
    assert.equal((await paidPlanEntitlement("owner-b")).planIds.size, 0, "Entitlement stays with the paying owner");
    const { POST } = await import("../app/api/payments/plan/return/route");
    const before = writes;
    for (const body of [new URLSearchParams({ orderId: "done", authResultCode: "CANCELLED" }), new URLSearchParams({ orderId: "done", authResultCode: "0000", signature: "forged" })]) {
      const result = await POST(new Request("http://localhost/api/payments/plan/return", { method: "POST", body }));
      assert.equal(result.status, 303);
      assert.equal(new URL(result.headers.get("location")!).searchParams.get("status"), "fail");
    }
    assert.equal(writes, before, "Unverified callbacks must not mutate stored orders");
    console.log("plan payment status: paid/refunded protection, owner entitlement, cancel and forged callback passed (mock database, no PG calls)");
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
