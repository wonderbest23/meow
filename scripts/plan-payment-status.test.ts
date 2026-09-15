import assert from "node:assert/strict";
import { createHash } from "node:crypto";

async function main() {
  process.env.PERSISTENCE_MODE = "supabase";
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
  process.env.NICEPAY_SECRET_KEY = "fixture-only";
  process.env.NICEPAY_CLIENT_KEY = "fixture-client";
  const originalFetch = globalThis.fetch;
  const fixture = (id: string, status: string) => ({ order_id: id, status, owner_id: "owner-a", order_name: "사업계획서 플랜 빌더", opportunity: { planId: `plan-${id}` }, payment_key: status === "done" ? `tid-${id}` : null as string | null, amount: 100, expires_at: new Date(Date.now() + 60_000).toISOString() });
  const rows = ["created", "done", "failed", "canceled", "refunded"].map(status => fixture(status, status));
  let writes = 0;
  const pgRequests: string[] = [];
  let simulateCompensation = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.nicepay.co.kr") {
      pgRequests.push(url.pathname);
      assert(simulateCompensation, "Unexpected PG request; all requests are mocked");
      return Response.json(url.pathname.endsWith("/cancel") ? { resultCode: "CANCEL_FAILED" } : { resultCode: "0000", status: "paid", amount: 100, orderId: "compensation-failed", tid: "tid-compensation" });
    }
    assert.equal(url.hostname, "fixture.invalid", "No real payment or database requests");
    assert.equal(url.pathname, "/rest/v1/payment_orders");
    const matching = rows.filter(row => [...url.searchParams].every(([key, value]) => !value.startsWith("eq.") || String(row[key as keyof typeof row]) === value.slice(3)));
    if (init?.method === "PATCH") {
      writes++;
      const patch = JSON.parse(String(init.body));
      if (matching.some(row => row.order_id === "compensation-failed") && patch.status === "done") return Response.json({ code: "fixture_database_failure", message: "Simulated write failure" }, { status: 500 });
      matching.forEach(row => Object.assign(row, patch));
      if (url.searchParams.has("select")) return Response.json(matching[0] ?? null);
      return new Response(null, { status: 204 });
    }
    return Response.json(matching);
  };
  try {
    const { markPlanOrderFailed, markPlanOrderPaid, paidPlanEntitlement } = await import("../lib/payments/plan-orders");
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
    const signed = (orderId: string) => {
      const authToken = "local-auth-token"; const clientId = "fixture-client"; const amount = "100";
      const signature = createHash("sha256").update(`${authToken}${clientId}${amount}fixture-only`).digest("hex");
      return new Request("http://localhost/api/payments/plan/return", { method: "POST", body: new URLSearchParams({ orderId, authResultCode: "0000", authToken, clientId, amount, signature, tid: "tid-compensation" }) });
    };
    for (const id of ["failed", "canceled", "refunded"]) {
      await assert.rejects(() => markPlanOrderPaid({ orderId: id, tid: `tid-${id}`, raw: {} }), /PAYMENT_STATE_CONFLICT/);
      const response = await POST(signed(id));
      assert.equal(new URL(response.headers.get("location")!).searchParams.get("status"), "fail");
    }
    assert.equal(pgRequests.length, 0, "Terminal orders cannot trigger a new PG approval");
    rows.push(fixture("fresh", "created"));
    await markPlanOrderPaid({ orderId: "fresh", tid: "tid-fresh", raw: { first: true } });
    const completed = JSON.stringify(rows.find(row => row.order_id === "fresh"));
    await markPlanOrderPaid({ orderId: "fresh", tid: "tid-fresh", raw: { repeated: true } });
    assert.equal(JSON.stringify(rows.find(row => row.order_id === "fresh")), completed, "Duplicate approval must preserve the first payment record");
    await assert.rejects(() => markPlanOrderPaid({ orderId: "fresh", tid: "different-transaction", raw: {} }), /PAYMENT_STATE_CONFLICT/);
    await assert.rejects(() => markPlanOrderPaid({ orderId: "missing", tid: "missing", raw: {} }), /PAYMENT_STATE_CONFLICT/);
    assert.equal(pgRequests.length, 0);
    console.log("plan payment status: terminal-state protection, idempotent approval, ownership and forged callbacks passed (mock DB/PG, zero network)");
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
