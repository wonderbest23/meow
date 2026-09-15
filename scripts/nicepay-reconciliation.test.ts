import assert from "node:assert/strict";
import { reconcileNicepayOrder } from "../lib/payments/nicepay-reconciliation";
import { isPaymentSameOrigin, paymentRequestOrigin } from "../lib/payments/request-origin";

async function main() {
  const originalOrigin = process.env.PLATFORM_APP_ORIGIN;
  delete process.env.PLATFORM_APP_ORIGIN;
  const localRequest = new Request("http://localhost:8099/api/payments/plan/reconcile", { headers: { host: "127.0.0.1:8099", origin: "http://127.0.0.1:8099" } });
  assert.equal(paymentRequestOrigin(localRequest), "http://127.0.0.1:8099");
  assert(isPaymentSameOrigin(localRequest));
  assert(!isPaymentSameOrigin(new Request(localRequest, { headers: { host: "127.0.0.1:8099", origin: "http://127.0.0.1:8100" } })));
  assert(!isPaymentSameOrigin(new Request(localRequest, { headers: { host: "foreign.invalid", origin: "https://foreign.invalid", "x-forwarded-host": "foreign.invalid" } })));
  process.env.PLATFORM_APP_ORIGIN = "https://stage.example.invalid";
  assert.equal(paymentRequestOrigin(localRequest), "https://stage.example.invalid");
  assert(!isPaymentSameOrigin(localRequest));
  assert(isPaymentSameOrigin(new Request(localRequest, { headers: { origin: "https://stage.example.invalid" } })));
  process.env.PLATFORM_APP_ORIGIN = "https://stage.example.invalid/path";
  assert.throws(() => paymentRequestOrigin(localRequest), /ORIGIN_INVALID/);
  assert(!isPaymentSameOrigin(localRequest));
  if (originalOrigin === undefined) delete process.env.PLATFORM_APP_ORIGIN;
  else process.env.PLATFORM_APP_ORIGIN = originalOrigin;
  Object.assign(process.env, { PERSISTENCE_MODE: "supabase", SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture", APP_ENV: "staging", NICEPAY_ENVIRONMENT: "sandbox", NICEPAY_SANDBOX_CLIENT_KEY: "fixture-client", NICEPAY_SANDBOX_SECRET_KEY: "fixture-secret" });
  delete process.env.NICEPAY_CLIENT_KEY; delete process.env.NICEPAY_SECRET_KEY;
  const original = globalThis.fetch;
  const rows = new Map<string, Record<string, any>>();
  let approve: (id: string) => Promise<Response>;
  let lookup: (id: string) => Promise<Response>;
  let settlementFailure = false, lostSettlementReply = false, claimMissing = false;
  const calls: string[] = [];
  const seed = (id: string) => {
    const row = { order_id: id, status: "created", owner_id: "owner", payment_key: null, provider_status: null, amount: 100, opportunity: { planId: id, product: "plan" }, expires_at: new Date(Date.now() + 60_000).toISOString() };
    rows.set(id, row); return row;
  };
  const paid = (id: string, fields: Record<string, unknown> = {}) => Response.json({ resultCode: "0000", tid: id, orderId: id, amount: 100, currency: "KRW", status: "paid", ...fields });
  const callback = (id: string) => reconcileNicepayOrder({ orderId: id, tid: id, allowApproval: true });
  const recover = (id: string) => reconcileNicepayOrder({ orderId: id, ownerId: "owner" });
  approve = async id => paid(id); lookup = async id => paid(id);
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    if (url.hostname === "sandbox-api.nicepay.co.kr") {
      assert(!url.pathname.endsWith("/cancel"), "Recovery never cancels a possibly committed order");
      const id = decodeURIComponent(url.pathname.split("/").at(-1)!);
      calls.push(`${init?.method}:${id}`);
      return init?.method === "POST" ? approve(id) : lookup(id);
    }
    assert.equal(url.hostname, "fixture.invalid", "External network disabled");
    if (url.pathname === "/rest/v1/payment_orders") {
      const row = rows.get(url.searchParams.get("order_id")!.slice(3));
      return Response.json(row ? [row] : []);
    }
    const body = JSON.parse(String(init?.body));
    const row = rows.get(body.p_order_id)!;
    if (url.pathname.endsWith("/claim_nicepay_plan_order")) {
      if (claimMissing) return Response.json({ message: "RPC missing" }, { status: 404 });
      if (row.status !== "created") return Response.json(false);
      Object.assign(row, { status: "confirming", payment_key: body.p_tid, provider_status: `NICEPAY_${body.p_environment}` });
      return Response.json(true);
    }
    assert(url.pathname.endsWith("/settle_nicepay_plan_order"));
    if (settlementFailure) return Response.json({ message: "Database unavailable" }, { status: 503 });
    const states: Record<string, string> = { paid: "done", failed: "failed", cancelled: "canceled", expired: "expired", partialCancelled: "partial_canceled" };
    Object.assign(row, { status: states[body.p_raw.status], raw_response: body.p_raw });
    if (lostSettlementReply) throw new Error("Committed but reply lost");
    return Response.json(row.status);
  };
  try {
    seed("lost-approval"); approve = async () => { throw new Error("Approval reply lost"); };
    assert.equal((await callback("lost-approval")).status, "ok");
    assert.deepEqual(calls, ["POST:lost-approval", "GET:lost-approval"]);
    assert.equal((await recover("lost-approval")).status, "ok"); assert.equal(calls.length, 2);
    seed("reconnect"); lookup = async () => { throw new Error("Lookup unavailable"); };
    assert.equal((await callback("reconnect")).status, "pending"); assert.equal(rows.get("reconnect")!.status, "confirming");
    lookup = async id => paid(id);
    assert.equal((await recover("reconnect")).status, "ok");
    assert.equal(calls.filter(x => x === "POST:reconnect").length, 1);

    seed("concurrent"); let finish!: (value: Response) => void; let entered!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    approve = async () => { entered(); return new Promise(resolve => { finish = resolve; }); };
    lookup = async id => paid(id, { status: "ready" });
    const first = callback("concurrent"); await enteredPromise;
    assert.equal((await callback("concurrent")).status, "pending");
    finish(paid("concurrent")); assert.equal((await first).status, "ok");
    assert.equal(calls.filter(x => x === "POST:concurrent").length, 1);

    approve = async id => paid(id); lookup = async id => paid(id);
    seed("db-failure"); settlementFailure = true;
    assert.equal((await callback("db-failure")).status, "pending"); settlementFailure = false;
    assert.equal((await recover("db-failure")).status, "ok");
    seed("db-reply-lost"); lostSettlementReply = true;
    assert.equal((await callback("db-reply-lost")).status, "pending"); lostSettlementReply = false;
    assert.equal((await recover("db-reply-lost")).status, "ok");

    for (const field of [{ amount: 101 }, { tid: "other" }, { orderId: "other" }, { currency: "USD" }]) {
      const id = `mismatch-${Object.keys(field)[0]}`; seed(id);
      approve = async name => paid(name, field); lookup = approve;
      assert.equal((await callback(id)).status, "pending"); assert.equal(rows.get(id)!.status, "confirming");
    }
    const before = calls.length;
    await assert.rejects(() => reconcileNicepayOrder({ orderId: "db-failure", ownerId: "other" }), /NOT_FOUND/);
    assert.equal(calls.length, before);
    seed("cancelled"); approve = async id => paid(id, { status: "cancelled" }); lookup = approve;
    assert.equal((await callback("cancelled")).status, "fail"); assert.equal(rows.get("cancelled")!.status, "canceled");
    approve = async id => paid(id); lookup = approve;
    assert.equal((await callback("cancelled")).status, "fail");
    seed("expired-before-approval"); rows.get("expired-before-approval")!.expires_at = "2020-01-01T00:00:00Z";
    const beforeExpired = calls.length;
    assert.equal((await callback("expired-before-approval")).status, "fail"); assert.equal(calls.length, beforeExpired);
    assert.equal(rows.get("expired-before-approval")!.status, "created");
    seed("missing-migration"); claimMissing = true; const count = calls.length;
    assert.equal((await callback("missing-migration")).status, "pending"); assert.equal(calls.length, count);
    const { POST } = await import("../app/api/payments/plan/reconcile/route");
    assert.equal((await POST(new Request("http://localhost/api/payments/plan/reconcile", { method: "POST", headers: { origin: "https://foreign.invalid" } }))).status, 403);
    console.log("nicepay reconciliation: lost replies, reconnect, concurrent callbacks, database failures, identity/amount/currency checks, owner isolation, terminal states and missing migration passed (mock DB/PG)");
  } finally { globalThis.fetch = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
