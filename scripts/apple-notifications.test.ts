import assert from "node:assert/strict";
import { X509Certificate, sign } from "node:crypto";
import { readFileSync } from "node:fs";

/*
 * App Store 서버 알림(V2) — 시험용 가짜 인증서 사슬(scripts/fixtures/apple-iap, apple-iap.test.ts 와 같은 것)로 서명한 알림을
 * 넣고, Supabase REST 를 메모리 표로 흉내 내 실제 쿼리 그대로 확인한다(네트워크 없음).
 *  - 맞는 REFUND → 주문 refunded + 권한 닫힘, 같은 알림을 다시 받아도 한 번만
 *  - 서명이 틀림·애플 루트가 아님·다른 앱·환경 불일치 → 400, 아무것도 바꾸지 않음
 *  - 주문 없음 → 200 + 운영자 알림(한 번), TEST → 200
 */
process.env.PERSISTENCE_MODE = "supabase";
process.env.SUPABASE_URL = "https://fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
delete process.env.RESEND_API_KEY;

const dir = "scripts/fixtures/apple-iap";
const pem = (name: string) => readFileSync(`${dir}/${name}`, "utf8");
const der = (name: string) => new X509Certificate(pem(name)).raw.toString("base64");
const rootFp = new X509Certificate(pem("root.pem")).fingerprint256;
const chain = [der("leaf.pem"), der("mid.pem"), der("root.pem")];
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function jws(payload: Record<string, unknown>) {
  const head = b64({ alg: "ES256", x5c: chain });
  const body = b64(payload);
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), { key: pem("leaf.pk8"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${signature}`;
}

/* ---------- 메모리 Supabase ---------- */
type Row = Record<string, unknown>;
const TERMS = "2026-10-09-paid-first-pricing";
const order = (id: string, extra: Row): Row => ({
  id: `uuid-${id}`, order_id: id, guest_token_hash: "guest-hash", amount: 59000, currency: "KRW", owner_id: "owner-1", customer_email: "buyer@example.com",
  method: "APPLE_IAP", status: "done", provider_status: "APPLE_PRODUCTION", payment_key: `ios:${id}`, project_id: null, founder_profile: {}, terms_version: TERMS,
  terms_agreed_at: "2026-10-20T00:00:00Z", expires_at: "2026-10-20T00:00:00Z", confirmed_at: "2026-10-20T00:00:00Z", admin_note: null, created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z", ...extra,
});
const db: Record<string, Row[]> = {
  payment_orders: [
    order("IAP-A-1001", { order_name: "사업계획서 플랜 빌더", opportunity: { planId: "plan-1", planType: "cafe", product: "plan" } }),
    order("IAP-A-1002", { order_name: "사업계획서 플랜 빌더", opportunity: { planId: "plan-2", planType: "cafe", product: "plan" } }),
    order("IAP-A-1003", { order_name: "다시 생성 10회", amount: 9900, opportunity: { planId: "plan-2", planType: "cafe", product: "regen" } }),
    order("IAP-A-1004", { order_name: "사업계획서 + 홈페이지", opportunity: { planId: "plan-3", planType: "cafe", product: "bundle" } }),
    order("IAP-A-1005", { order_name: "사업계획서 플랜 빌더", provider_status: "APPLE_SANDBOX", opportunity: { planId: "plan-5", planType: "cafe", product: "plan" } }),
    order("IAP-A-1006", { order_name: "사업계획서 플랜 빌더", opportunity: { planId: "plan-6", planType: "cafe", product: "plan" } }),
    order("IAP-A-1007", { order_name: "사업계획서 플랜 빌더", opportunity: { planId: "plan-7", planType: "cafe", product: "plan" } }),
  ],
  payment_events: [],
  plan_regen_packs: [{ plan_id: "plan-2", owner_hash: "owner-1", order_id: "IAP-A-1003", granted: 10, amount: 9900, created_at: "2026-10-20T00:00:00Z" }],
  // 기본 10회 + 묶음에서 3회 쓴 상태
  plan_regenerations: Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, plan_id: "plan-2", ok: true })),
  projects: [{ id: "project-3", owner_id: "owner-1", opportunity: { planId: "plan-3" } }],
  landing_sites: [{ id: "site-3", project_id: "project-3", status: "published", custom_domain: null }],
  // 웹 결제 환불 요청 기록 — 어드민 매출 집계(12)가 앱 환불과 함께 읽는다
  refund_requests: [],
};
const field = (row: Row, key: string) => {
  const [column, nested] = key.split("->>");
  const value = row[column];
  return nested ? (value as Row | null)?.[nested] : value;
};
function inList(raw: string) {
  const items: string[] = [];
  for (const match of raw.slice(1, -1).matchAll(/"((?:[^"\\]|\\.)*)"|([^,]+)/g)) items.push(match[1] ?? match[2]);
  return items;
}
function matches(row: Row, params: URLSearchParams) {
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const actual = field(row, key);
    if (value.startsWith("eq.")) { if (String(actual) !== value.slice(3)) return false; }
    else if (value.startsWith("in.")) { if (!inList(value.slice(3)).includes(String(actual))) return false; }
    else throw new Error(`fixture: unsupported filter ${key}=${value}`);
  }
  return true;
}
const writes: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.equal(url.hostname, "fixture.invalid", `No real network: ${url.href}`);
  const table = url.pathname.replace("/rest/v1/", "");
  const rows = db[table];
  assert(rows, `fixture: unknown table ${table}`);
  const method = (init?.method ?? "GET").toUpperCase();
  const hit = rows.filter((row) => matches(row, url.searchParams));
  if (method === "GET") return Response.json(hit);
  if (method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `*/${hit.length}` } });
  writes.push(`${method} ${table}`);
  if (method === "POST") {
    const body = JSON.parse(String(init?.body));
    for (const item of Array.isArray(body) ? body : [body]) {
      if (table === "payment_events" && rows.some((row) => row.transmission_id === item.transmission_id)) return Response.json({ code: "23505", message: "duplicate key" }, { status: 409 });
      rows.push(item);
    }
    return new Response(null, { status: 201 });
  }
  if (method === "PATCH") {
    const patch = JSON.parse(String(init?.body));
    hit.forEach((row) => Object.assign(row, patch));
    return url.searchParams.has("select") ? Response.json(hit) : new Response(null, { status: 204 });
  }
  if (method === "DELETE") {
    db[table] = rows.filter((row) => !hit.includes(row));
    return new Response(null, { status: 204 });
  }
  throw new Error(`fixture: unsupported ${method}`);
}) as typeof fetch;

/* ---------- 알림 만들기 ---------- */
const BUNDLE = "com.oneulstart.app";
let seq = 0;
const tx = (transactionId: string, productId: string, extra: Row = {}) => ({
  transactionId, originalTransactionId: transactionId, bundleId: BUNDLE, productId, type: "Consumable", environment: "Production",
  purchaseDate: Date.now() - 86_400_000, revocationDate: Date.now(), revocationReason: 0, ...extra,
});
function notification(type: string, data: Row | null, extra: Row = {}) {
  seq += 1;
  return jws({ notificationType: type, notificationUUID: `uuid-${seq}`, version: "2.0", signedDate: Date.now(), ...(data ? { data: { bundleId: BUNDLE, environment: "Production", appAppleId: 1, ...data } } : {}), ...extra });
}
const refundOf = (transactionId: string, productId: string, extra: Row = {}, type = "REFUND") =>
  notification(type, { signedTransactionInfo: jws(tx(transactionId, productId, extra)), ...(extra.environment ? { environment: extra.environment } : {}) });

async function main() {
  const { handleAppleNotification } = await import("../lib/payments/apple-notifications");
  const { paidPlanEntitlement, paidHomepagePlanIds } = await import("../lib/payments/plan-orders");
  const alerts: Array<{ subject: string; lines: string[] }> = [];
  const notify = async (subject: string, lines: string[]) => { alerts.push({ subject, lines }); };
  const handle = (payload: unknown) => handleAppleNotification(payload, { rootFingerprint: rootFp, notify });
  const orderRow = (id: string) => db.payment_orders.find((row) => row.order_id === id)!;

  assert((await paidPlanEntitlement("owner-1")).planIds.has("plan-1"), "fixture starts with paid access");

  // 1) 맞는 REFUND — 주문 refunded, 권한 닫힘, 운영자 알림 한 번
  const refund = refundOf("1001", "oneulstart.plan");
  let result = await handle(refund);
  assert.deepEqual([result.status, result.body.result], [200, "refunded"]);
  assert.equal(orderRow("IAP-A-1001").status, "refunded");
  assert.match(String(orderRow("IAP-A-1001").admin_note), /^Apple 환불 \(App Store 서버 알림\)/);
  assert.equal((await paidPlanEntitlement("owner-1")).planIds.has("plan-1"), false, "refunded plan is locked again");
  assert.equal(alerts.length, 1);
  const alertText = alerts[0].lines.join("\n");
  for (const expected of ["IAP-A-1001", "59,000원", "buyer@example.com", "1001"]) assert(alertText.includes(expected), `alert has ${expected}`);
  assert(!alertText.includes("x5c") && !alertText.includes(refund.slice(0, 40)), "alert carries no signed blobs");

  // 2) 같은 알림을 다시(애플 재시도) — 아무것도 바뀌지 않고 알림도 없다
  const writesBefore = writes.filter((w) => w.startsWith("PATCH payment_orders")).length;
  result = await handle(refund);
  assert.deepEqual([result.status, result.body.result], [200, "already_refunded"]);
  // 같은 거래에 대한 새 알림 ID — 역시 한 번만
  result = await handle(refundOf("1001", "oneulstart.plan"));
  assert.deepEqual([result.status, result.body.result], [200, "already_refunded"]);
  assert.equal(writes.filter((w) => w.startsWith("PATCH payment_orders")).length, writesBefore, "no second refund write");
  assert.equal(alerts.length, 1, "no duplicate operator alert");
  assert.equal(db.payment_events.filter((row) => row.event_type === "apple.REFUND").length, 2, "each notificationUUID recorded once");
  assert(!JSON.stringify(db.payment_events).includes(chain[0].slice(0, 40)), "event log keeps no certificates/signed payloads");

  // 같은 거래의 알림 둘이 동시에 와도(둘 다 done 을 읽음) 조건부 갱신으로 한 번만 반영·알림
  const alertsBeforeRace = alerts.length;
  const raced = await Promise.all([handle(refundOf("1007", "oneulstart.plan")), handle(refundOf("1007", "oneulstart.plan"))]);
  assert.deepEqual(raced.map((r) => r.body.result).sort(), ["already_refunded", "refunded"]);
  assert.equal(alerts.length, alertsBeforeRace + 1, "concurrent deliveries alert once");

  // 3) 다시 생성 묶음(소모성) 환불 — 줄을 지우지 않고 이미 쓴 3회만 남긴다. 계획서(같은 사업의 다른 주문)는 그대로
  result = await handle(refundOf("1003", "oneulstart.regen10"));
  assert.equal(result.body.result, "refunded");
  assert.equal(db.plan_regen_packs.find((row) => row.order_id === "IAP-A-1003")?.granted, 3, "regen pack reduced to what was already used");
  assert((await paidPlanEntitlement("owner-1")).planIds.has("plan-2"), "regen refund does not close the plan itself");

  // 4) 묶음 환불 — 계획서와 홈페이지 권한이 닫히고 공개 홈페이지를 내린다
  assert((await paidHomepagePlanIds("owner-1")).has("plan-3"));
  result = await handle(refundOf("1004", "oneulstart.bundle"));
  assert.equal(result.body.result, "refunded");
  assert.equal((await paidHomepagePlanIds("owner-1")).has("plan-3"), false);
  assert.equal((await paidPlanEntitlement("owner-1")).planIds.has("plan-3"), false);
  assert.equal(db.landing_sites[0].status, "unpublished");

  // 5) REVOKE 도 환불처럼
  result = await handle(refundOf("1006", "oneulstart.plan", {}, "REVOKE"));
  assert.equal(result.body.result, "refunded");
  assert.match(String(orderRow("IAP-A-1006").admin_note), /REVOKE/);

  // 6) 받아들이지 않는 것 — 400, 주문은 그대로
  const alertsBefore = alerts.length;
  const eventsBefore = db.payment_events.length;
  const pending = refundOf("1002", "oneulstart.plan");
  const [h, , s] = pending.split(".");
  const forgedBody = b64({ notificationType: "REFUND", notificationUUID: "forged", data: { bundleId: BUNDLE, environment: "Production", signedTransactionInfo: jws(tx("1002", "oneulstart.plan")) } });
  assert.deepEqual([(await handle(`${h}.${forgedBody}.${s}`)).status, (await handle(`${h}.${forgedBody}.${s}`)).body.error], [400, "APPLE_SIGNATURE_INVALID"], "tampered outer payload");
  // 안쪽 거래만 바꿔치기
  const innerParts = jws(tx("1002", "oneulstart.plan")).split(".");
  const forgedInner = `${innerParts[0]}.${b64(tx("1002", "oneulstart.plan", { productId: "oneulstart.bundle" }))}.${innerParts[2]}`;
  assert.equal((await handle(notification("REFUND", { signedTransactionInfo: forgedInner }))).body.error, "APPLE_SIGNATURE_INVALID", "tampered inner transaction");
  // 기본값(진짜 애플 G3 지문)으로는 시험 사슬을 받지 않는다
  assert.equal((await handleAppleNotification(pending, { notify })).body.error, "APPLE_ROOT_MISMATCH");
  // 다른 앱 — 바깥·안쪽 모두
  assert.equal((await handle(notification("REFUND", { bundleId: "com.other.app", signedTransactionInfo: jws(tx("1002", "oneulstart.plan")) }))).body.error, "APPLE_BUNDLE_MISMATCH");
  assert.equal((await handle(notification("REFUND", { signedTransactionInfo: jws(tx("1002", "oneulstart.plan", { bundleId: "com.other.app" })) }))).body.error, "APPLE_BUNDLE_MISMATCH");
  // 바깥(Production)과 안쪽(Sandbox) 환경이 다름
  assert.equal((await handle(notification("REFUND", { signedTransactionInfo: jws(tx("1002", "oneulstart.plan", { environment: "Sandbox" })) }))).body.error, "APPLE_ENVIRONMENT_MISMATCH");
  // 모양이 틀린 것
  for (const bad of [undefined, "", "not-a-jws", "a.b.c", 42, "x".repeat(100_001)]) assert.equal((await handle(bad)).status, 400, `malformed ${String(bad).slice(0, 12)}`);
  assert.equal(orderRow("IAP-A-1002").status, "done", "rejected notifications change nothing");
  assert.equal(alerts.length, alertsBefore);
  assert.equal(db.payment_events.length, eventsBefore, "rejected notifications are not recorded as processed");

  // 7) 주문 환경과 다른 알림(Sandbox 주문에 Production 환불) — 반영하지 않고 알린다
  result = await handle(refundOf("1005", "oneulstart.plan"));
  assert.deepEqual([result.status, result.body.result], [200, "order_mismatch"]);
  assert.equal(orderRow("IAP-A-1005").status, "done");
  assert.equal(alerts.length, alertsBefore + 1);
  // 같은 환경이면 반영(시험 결제 환불)
  result = await handle(refundOf("1005", "oneulstart.plan", { environment: "Sandbox" }));
  assert.equal(result.body.result, "refunded");
  assert(alerts.at(-1)!.lines.join("\n").includes("Sandbox(시험 결제"), "sandbox refunds are labelled");

  // 8) 주문 없음 — 200 + 알림, 같은 알림을 다시 받으면 알림 없음
  const unknown = refundOf("9999", "oneulstart.plan");
  const alertsBeforeUnknown = alerts.length;
  result = await handle(unknown);
  assert.deepEqual([result.status, result.body.result], [200, "unknown_order"]);
  assert.equal(alerts.length, alertsBeforeUnknown + 1);
  assert(alerts.at(-1)!.lines.join("\n").includes("IAP-A-9999"));
  result = await handle(unknown);
  assert.deepEqual([result.status, result.body.result], [200, "unknown_order"]);
  assert.equal(alerts.length, alertsBeforeUnknown + 1, "retry of unknown-order notification does not re-alert");

  // 9) TEST — 기록하고 200, 알림 없음
  const alertsBeforeTest = alerts.length;
  result = await handle(notification("TEST", {}));
  assert.deepEqual([result.status, result.body.result], [200, "recorded"]);
  assert(db.payment_events.some((row) => row.event_type === "apple.TEST"));
  assert.equal(alerts.length, alertsBeforeTest);

  // 10) CONSUMPTION_REQUEST — 기록·알림(한 번), 주문은 그대로
  const consumption = notification("CONSUMPTION_REQUEST", { signedTransactionInfo: jws(tx("1002", "oneulstart.plan", { revocationDate: undefined })), consumptionRequestReason: "UNINTENDED_PURCHASE" });
  result = await handle(consumption);
  assert.deepEqual([result.status, result.body.result], [200, "recorded"]);
  result = await handle(consumption);
  assert.equal(result.status, 200);
  assert.equal(alerts.length, alertsBeforeTest + 1);
  assert(alerts.at(-1)!.lines.join("\n").includes("IAP-A-1002"));
  assert.equal(orderRow("IAP-A-1002").status, "done");

  // 11) 주소 — 로그인·출처 확인 없이 받고, 진짜 애플 루트만 믿는다(시험 사슬은 400)
  const { POST } = await import("../app/api/payments/iap/apple-notifications/route");
  const post = (body: string) => POST(new Request("https://oneulstart.com/api/payments/iap/apple-notifications", { method: "POST", headers: { "content-type": "application/json" }, body }));
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post(JSON.stringify({}))).status, 400);
  const routed = await post(JSON.stringify({ signedPayload: refundOf("1002", "oneulstart.plan") }));
  assert.equal(routed.status, 400);
  assert.equal((await routed.json()).error, "APPLE_ROOT_MISMATCH");
  assert.equal(orderRow("IAP-A-1002").status, "done");

  // 12) 어드민 매출 — 앱 환불(refunded, 환불 요청 기록 없음)은 전액 환불로 빠지고, 웹 환불은 처리 메모 금액만 빠진다
  const { getServerSupabase } = await import("../lib/persistence");
  const { loadRevenueSummary, summarizeRevenue } = await import("../lib/payments/revenue-stats");
  const appRefunded = db.payment_orders.filter((row) => row.status === "refunded").reduce((sum, row) => sum + Number(row.amount), 0);
  const appGross = db.payment_orders.filter((row) => ["done", "partial_canceled", "refunded"].includes(String(row.status))).reduce((sum, row) => sum + Number(row.amount), 0);
  assert(appRefunded > 0, "fixture has refunded app orders by now");
  db.payment_orders.push(order("WEB-CARD-1", { method: "CARD", status: "partial_canceled", amount: 30000, provider_status: "NICEPAY_live" }));
  db.payment_orders.push(order("WEB-CARD-2", { method: "CARD", status: "canceled", amount: 30000 }));
  db.refund_requests.push({ id: "rr-1", order_id: "WEB-CARD-1", status: "done", admin_note: "12,000원 카드 부분 취소 · 고객 요청" });
  db.refund_requests.push({ id: "rr-2", order_id: "WEB-CARD-9", status: "received", admin_note: "" });
  const revenue = await loadRevenueSummary(getServerSupabase()!);
  assert.deepEqual(revenue, { gross: appGross + 30000, refunded: appRefunded + 12000, storeRefunded: appRefunded, net: appGross + 30000 - appRefunded - 12000 });
  // 메모가 있으면 메모 금액(주문 금액을 넘지 않게), 없고 refunded 면 전액(계좌이체 바로 환불), 취소·실패 주문은 매출 아님
  assert.deepEqual(summarizeRevenue([
    { order_id: "A", amount: 59000, status: "refunded", method: "APPLE_IAP" },
    { order_id: "G", amount: 9900, status: "refunded", method: "GOOGLE_IAP" },
    { order_id: "T", amount: 50000, status: "refunded", method: "TRANSFER" },
    { order_id: "B", amount: 89000, status: "done", method: "CARD" },
    { order_id: "C", amount: 20000, status: "refunded", method: "CARD" },
    { order_id: "X", amount: 70000, status: "canceled", method: "CARD" },
  ], [{ order_id: "B", admin_note: "30,000원 카드 부분 취소" }, { order_id: "C", admin_note: "99,000원 카드 전액 취소" }, { order_id: "X", admin_note: "70,000원 카드 전액 취소" }]),
  { gross: 227900, refunded: 168900, storeRefunded: 68900, net: 59000 });

  console.log("apple-notifications: signed REFUND/REVOKE revoke once (plan·regen·bundle), forged/wrong-app/env-mismatch rejected, unknown order alerts once, TEST/CONSUMPTION_REQUEST recorded, admin revenue subtracts app and web refunds");
}

main().catch((error) => { console.error(error); process.exit(1); });
