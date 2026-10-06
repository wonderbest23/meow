import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { operatorRelayConfig, relayUnsupported, sendRelayV4, stableEventId, type CustomerSmsConfig } from "../lib/notify/customer-sms";
import { buildPaymentReceiptEmail, noticePhoneOf, notifyPaymentComplete, paidProduct, type PaymentNoticeDependencies } from "../lib/payments/paid-notifications";
import { leadContactParams, leadStoreName, processLandingLeadNotification, sendLeadVisitorConfirmation } from "../lib/landing/lead-notifications";
import { startRegisteredDomainConnection, type DomainAutoConnectDependencies } from "../lib/landing/domain-auto-connect";
import { dueTaxReminders, taxDeadlines } from "../lib/operations/tax-calendar";
import { runTaxReminders } from "../lib/operations/tax-reminders";

/*
 * 출시 전 알림(중계 v4) — 결제 완료(운영자·구매자), 문의자 이름·연락처, 방문자 확인, 도메인 자동 연결, 세금 마감.
 * 실제 중계·알리고·Resend·Cloudflare 는 부르지 않는다(가짜 transport). 저장소도 아래 메모리 가짜.
 */

const SECRET = "s".repeat(43);
const ENV = { OWNER_SMS_RELAY_URL: "https://api.example.com/_oneulstart/support-owner-sms", OWNER_SMS_RELAY_SECRET: SECRET, OWNER_SMS_MODE: "live" };
const sms: CustomerSmsConfig = { endpoint: ENV.OWNER_SMS_RELAY_URL, secret: SECRET, mode: "live" };
const ORDER = "PB-mg1abc2d-0123456789ab";

async function hmacHex(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))), (v) => v.toString(16).padStart(2, "0")).join("");
}

/* ---- 메모리 저장소: 쓰는 만큼만(select/eq/is/gte/not/limit/maybeSingle/update/insert/delete) ---- */
type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>, options: { keys?: Record<string, string[]>; missingColumns?: Record<string, string[]>; users?: Record<string, { email: string; email_confirmed_at: string | null }> } = {}) {
  const value = (row: Row, column: string) => column.includes("->>") ? row[column.split("->>")[0]]?.[column.split("->>")[1]] : row[column];
  const db = {
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: options.users?.[id] ?? null }, error: null }) } },
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let action: "select" | "update" | "insert" | "delete" = "select";
      let patch: Row = {};
      let single = false;
      const missing = !(table in tables);
      const chain: any = {
        select: () => chain, limit: () => chain, order: () => chain,
        eq: (column: string, v: unknown) => { filters.push((row) => value(row, column) === v); return chain; },
        is: (column: string, v: unknown) => { filters.push((row) => (value(row, column) ?? null) === v); return chain; },
        gte: (column: string, v: string) => { filters.push((row) => String(value(row, column) ?? "") >= v); return chain; },
        not: (column: string, _op: string, _v: null) => { filters.push((row) => value(row, column) != null); return chain; },
        update: (values: Row) => { action = "update"; patch = values; return chain; },
        insert: (values: Row) => { action = "insert"; patch = values; return chain; },
        delete: () => { action = "delete"; return chain; },
        maybeSingle: () => { single = true; return chain; },
        then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve().then(() => {
            if (missing) return { data: null, error: { code: "42P01", message: "missing table" } };
            const rows = tables[table];
            if (action === "update" && Object.keys(patch).some((column) => options.missingColumns?.[table]?.includes(column))) return { data: null, error: { code: "PGRST204", message: "missing column" } };
            if (action === "insert") {
              const key = options.keys?.[table] ?? [];
              if (key.length && rows.some((row) => key.every((column) => row[column] === patch[column]))) return { data: null, error: { code: "23505", message: "duplicate" } };
              rows.push({ ...patch });
              return { data: [{ ...patch }], error: null };
            }
            const hits = rows.filter((row) => filters.every((test) => test(row)));
            if (action === "update") hits.forEach((row) => Object.assign(row, patch));
            if (action === "delete") tables[table] = rows.filter((row) => !hits.includes(row));
            const data = hits.map((row) => ({ ...row }));
            return { data: single ? data[0] ?? null : data, error: null };
          }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return db as unknown as SupabaseClient;
}

/* 가짜 중계 — v4 를 아는 새 중계(accept) 또는 모르는 예전 중계(old) */
function relay(kind: "new" | "old" | "down" = "new") {
  const bodies: Array<Record<string, any>> = [];
  const transport = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (kind === "down") return new Response("down", { status: 503 });
    if (kind === "old" && body.version === 4) return new Response(JSON.stringify({ status: "blocked", code: "INVALID_REQUEST" }), { status: 400 });
    return new Response(JSON.stringify({ eventId: body.eventId, mode: "live", eventType: body.eventType, status: "accepted", code: "PROVIDER_ACCEPTED", duplicate: false }), { status: 200 });
  }) as unknown as typeof fetch;
  return { bodies, transport };
}
function mail() {
  const sent: Array<{ key: string | null; body: Record<string, any> }> = [];
  const transport = (async (_url: string, init?: RequestInit) => {
    sent.push({ key: new Headers(init?.headers).get("Idempotency-Key"), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ id: `mail-${sent.length}` }), { status: 200 });
  }) as unknown as typeof fetch;
  return { sent, transport };
}

(async () => {
  /* ---- 중계 v4 요청 모양 ---- */
  assert.equal(operatorRelayConfig({ ...ENV, OWNER_SMS_ENABLED: "1", OWNER_SMS_TRANSPORT: "relay", OWNER_SMS_TO: "01000000001" }), null, "결제 운영자 문자는 따로 켠다");
  assert.equal(operatorRelayConfig({ ...ENV, OWNER_SMS_ENABLED: "1", OWNER_SMS_PAYMENT_ENABLED: "1", OWNER_SMS_TRANSPORT: "aligo", OWNER_SMS_TO: "01000000001" }), null, "중계 전송만");
  const operator = operatorRelayConfig({ ...ENV, OWNER_SMS_ENABLED: "1", OWNER_SMS_PAYMENT_ENABLED: "1", OWNER_SMS_TRANSPORT: "relay", OWNER_SMS_TO: "01000000001" })!;
  assert.equal(operator.ownerPhone, "01000000001");

  const r = relay();
  const eventId = crypto.randomUUID();
  assert.equal((await sendRelayV4(sms, { eventId, eventType: "payment-paid", ownerPhone: "01000000001", params: { product: "plan", amount: 49000, orderId: ORDER } }, r.transport)).status, "accepted");
  assert.deepEqual(r.bodies[0], { version: 4, eventId, mode: "live", service: "oneulstart", eventType: "payment-paid", recipientCheck: await hmacHex(SECRET, "recipient:01000000001"), params: { product: "plan", amount: 49000, orderId: ORDER } });
  assert.ok(!JSON.stringify(r.bodies[0]).includes("01000000001"), "운영자 번호는 요청에 싣지 않는다(확인값만)");
  await sendRelayV4(sms, { eventId, eventType: "lead-received", recipient: "01012345678", params: { store: "카페" } }, r.transport);
  assert.equal(r.bodies[1].recipient, "01012345678");
  assert.ok(!("msg" in r.bodies[1]) && !("sender" in r.bodies[1]), "문구·발신번호는 중계가 정한다");
  assert.equal((await sendRelayV4(sms, { eventId, eventType: "lead-received", recipient: "0212345678", params: { store: "카페" } }, r.transport)).code, "CUSTOMER_SMS_INPUT_INVALID");
  const old = relay("old");
  const rejected = await sendRelayV4(sms, { eventId, eventType: "tax-deadline", recipient: "01012345678", params: { kind: "income", days: 7, month: 5, day: 31 } }, old.transport);
  assert.ok(relayUnsupported(rejected), "예전 중계는 v4 를 400 으로 거절 → 물러선다");
  assert.ok(!relayUnsupported({ status: "blocked", code: "RECIPIENT_DAILY_LIMIT_REACHED" }), "한도는 '모름'이 아니다");

  /* ---- 결제 완료 ---- */
  assert.equal(paidProduct({ order_name: "사업계획서 + 홈페이지", opportunity: {} }), "bundle", "옛 주문은 상품명으로");
  assert.equal(paidProduct({ order_name: "x", opportunity: { product: "tokens" } }), "tokens");
  assert.equal(noticePhoneOf({ opportunity: { noticePhone: "01012345678" } }), "01012345678");
  assert.equal(noticePhoneOf({ opportunity: { noticePhone: "0212345678" } }), null);
  const now = Date.parse("2026-10-06T03:00:00Z");
  const order = (extra: Row = {}): Row => ({ order_id: ORDER, amount: 49000, order_name: "사업계획서 플랜 빌더", status: "done", confirmed_at: new Date(now - 60_000).toISOString(), customer_email: "buyer@example.com", paid_notified_at: null, opportunity: { planId: "plan-1", product: "plan", noticePhone: "01012345678" }, ...extra });
  const paymentDeps = (db: SupabaseClient, smsRelay: ReturnType<typeof relay>, email: ReturnType<typeof mail>, opsMail: string[]): PaymentNoticeDependencies => ({
    db, email: { key: "fake", from: "alerts@example.com" }, sms, operator, smsTransport: smsRelay.transport, emailTransport: email.transport, now,
    operatorEmail: async (subject) => { opsMail.push(subject); },
  });

  {
    const tables = { payment_orders: [order()] };
    const db = fakeDb(tables), s = relay(), m = mail(), ops: string[] = [];
    const first = await notifyPaymentComplete(ORDER, true, paymentDeps(db, s, m, ops));
    assert.equal(first.claimed, "marker");
    assert.deepEqual(s.bodies.map((body) => body.eventType).sort(), ["payment-paid", "payment-receipt"]);
    const receipt = s.bodies.find((body) => body.eventType === "payment-receipt")!;
    assert.deepEqual([receipt.recipient, receipt.params], ["01012345678", { product: "plan", orderId: ORDER }]);
    assert.equal(receipt.eventId, await stableEventId(`payment-receipt:${ORDER}`), "주문마다 같은 eventId — 중계도 한 번만");
    assert.equal(m.sent.length, 1);
    assert.equal(m.sent[0].key, `payment-receipt/${ORDER}`);
    assert.match(m.sent[0].body.text, /49,000원/);
    assert.deepEqual(ops, [], "운영자 문자가 됐으면 메일은 없다");
    assert.ok(tables.payment_orders[0].paid_notified_at, "보냈다는 표시");
    // return 과 reconcile 이 둘 다 와도 한 번
    const again = await notifyPaymentComplete(ORDER, false, paymentDeps(db, s, m, ops));
    assert.equal(again.claimed, "skipped");
    assert.equal(s.bodies.length, 2); assert.equal(m.sent.length, 1);
  }
  {
    // 동시에 두 경로
    const db = fakeDb({ payment_orders: [order()] }), s = relay(), m = mail();
    await Promise.all([notifyPaymentComplete(ORDER, true, paymentDeps(db, s, m, [])), notifyPaymentComplete(ORDER, false, paymentDeps(db, s, m, []))]);
    assert.equal(s.bodies.filter((body) => body.eventType === "payment-paid").length, 1, "동시에 와도 한 번");
  }
  {
    // 오래된 주문(24시간 지남)은 결과 화면을 다시 열어도 알리지 않는다
    const db = fakeDb({ payment_orders: [order({ confirmed_at: new Date(now - 25 * 3_600_000).toISOString() })] }), s = relay(), m = mail();
    assert.equal((await notifyPaymentComplete(ORDER, false, paymentDeps(db, s, m, []))).claimed, "skipped");
    assert.equal(s.bodies.length + m.sent.length, 0);
  }
  {
    // 0040 전(칸 없음): 이번 요청이 완료시킨 주문만
    const tables = { payment_orders: [order()] };
    const db = fakeDb(tables, { missingColumns: { payment_orders: ["paid_notified_at"] } }), s = relay(), m = mail();
    assert.equal((await notifyPaymentComplete(ORDER, false, paymentDeps(db, s, m, []))).claimed, "skipped", "이미 done 이던 주문은 보내지 않는다");
    assert.equal((await notifyPaymentComplete(ORDER, true, paymentDeps(db, s, m, []))).claimed, "first-completion");
    assert.equal(s.bodies.length, 2);
  }
  {
    // 예전 중계: 운영자는 메일로 물러서고, 구매자 문자는 빠지고 메일 영수증은 간다. 던지지 않는다
    const db = fakeDb({ payment_orders: [order({ opportunity: { product: "domain-purchase", planId: "plan-1" } })] }), s = relay("old"), m = mail(), ops: string[] = [];
    const result = await notifyPaymentComplete(ORDER, true, paymentDeps(db, s, m, ops));
    assert.match(String(result.operator), /email$/);
    assert.equal(ops.length, 1); assert.match(ops[0], /결제 완료/);
    assert.equal(result.buyerSms, "no_phone");
    assert.equal(result.buyerEmail, "sent");
  }
  {
    // 저장소가 터져도 결제 경로로 던지지 않는다
    const broken = { from: () => { throw new Error("db down"); } } as unknown as SupabaseClient;
    assert.deepEqual(await notifyPaymentComplete(ORDER, true, paymentDeps(broken, relay(), mail(), [])), { claimed: "skipped" });
  }
  assert.match(buildPaymentReceiptEmail("a@x", "b@x", order() as never).subject, /결제가 완료됐어요/);

  /* ---- 홈페이지 문의: 사장님께 이름·연락처, 예전 중계면 v3 고정 문구 ---- */
  assert.deepEqual(leadContactParams(" 김철수 ", "010-9999-8888"), { name: "김철수", phone: "01099998888" });
  assert.deepEqual(leadContactParams("a", "+82 10"), { name: "a", phone: "" }, "형식이 아니면 번호는 뺀다");
  const leadId = crypto.randomUUID();
  const leadTables = () => ({
    landing_lead_notifications: [{ lead_id: leadId, site_id: "site-1", status: "pending", attempts: 0, first_attempt_at: null, delivery_uncertain: false, payload: null, lease_token: null }],
    landing_sites: [{ id: "site-1", alert_phone: "01012345678" }],
    landing_leads: [{ id: leadId, name: "김철수", phone: "010-9999-8888" }],
  });
  const withClaim = (tables: Record<string, Row[]>) => {
    const db = fakeDb(tables) as any;
    db.rpc = async (_name: string, args: Record<string, unknown>) => {
      const row = tables.landing_lead_notifications[0];
      if (row.status === "sent" || row.lease_token) return { data: [], error: null };
      row.status = "processing"; row.lease_token = args.p_token;
      return { data: [{ ...row }], error: null };
    };
    return db as SupabaseClient;
  };
  const noEmail = (async () => { throw new Error("email must not be used"); }) as typeof fetch;
  {
    const tables = leadTables(), s = relay();
    await processLandingLeadNotification(leadId, false, { db: withClaim(tables), config: null, transport: noEmail, sms, smsTransport: s.transport });
    assert.equal(tables.landing_lead_notifications[0].status, "sent");
    assert.deepEqual([s.bodies[0].version, s.bodies[0].eventType, s.bodies[0].eventId, s.bodies[0].params], [4, "homepage-lead-contact", leadId, { name: "김철수", phone: "01099998888" }]);
  }
  {
    const tables = leadTables(), s = relay("old");
    await processLandingLeadNotification(leadId, false, { db: withClaim(tables), config: null, transport: noEmail, sms, smsTransport: s.transport });
    assert.equal(tables.landing_lead_notifications[0].status, "sent", "예전 중계면 v3 고정 문구로 보낸다");
    assert.deepEqual(s.bodies.map((body) => [body.version, body.eventType, body.eventId]), [[4, "homepage-lead-contact", leadId], [3, "homepage-lead", leadId]]);
  }
  {
    const tables = leadTables(), s = relay("down");
    await processLandingLeadNotification(leadId, false, { db: withClaim(tables), config: null, transport: noEmail, sms, smsTransport: s.transport });
    assert.equal(tables.landing_lead_notifications[0].status, "retry", "확인 불가는 v3 로 물러서지 않고 같은 v4 로 다시");
    assert.equal(s.bodies.length, 1);
  }

  /* ---- 방문자 확인 문자 ---- */
  assert.equal(leadStoreName("오늘 카페☕ 강남점입니다요"), "오늘 카페 강남점입니다");
  {
    const s = relay();
    assert.equal((await sendLeadVisitorConfirmation({ leadId, phone: "010-2222-3333", store: "오늘 카페" }, { sms, transport: s.transport })).status, "accepted");
    assert.deepEqual([s.bodies[0].eventType, s.bodies[0].recipient, s.bodies[0].params], ["lead-received", "01022223333", { store: "오늘 카페" }]);
    assert.equal(s.bodies[0].eventId, await stableEventId(`lead-received:${leadId}`), "문의마다 한 번");
    assert.equal((await sendLeadVisitorConfirmation({ leadId, phone: "02-123-4567", store: "카페" }, { sms, transport: s.transport })).status, "skipped", "010 번호만");
    assert.equal((await sendLeadVisitorConfirmation({ leadId, phone: "01022223333", store: "카페" }, { sms: null, transport: s.transport })).status, "skipped", "문자가 꺼져 있으면 보내지 않는다");
    assert.equal((await sendLeadVisitorConfirmation({ leadId, phone: "01022223333", store: "☕☕" }, { sms, transport: s.transport })).status, "skipped", "가게 이름이 비면 보내지 않는다");
    assert.equal(s.bodies.length, 1);
  }

  /* ---- 도메인 등록 완료 → 자동 연결 + 사장님 알림 ---- */
  const domainTables = (site: Row = {}) => ({
    payment_orders: [{ order_id: ORDER, order_name: "도메인 구매 + 연결·호스팅 1년", status: "done", owner_id: "user-1", customer_email: "owner@example.com", opportunity: { planId: "plan-1", product: "domain-purchase", domainRequest: { domain: "mybrand.com", status: "registered" } } }],
    projects: [{ id: "project-1", owner_id: "user-1", opportunity: { planId: "plan-1" } }],
    landing_sites: [{ id: "site-1", project_id: "project-1", slug: "mybrand", status: "published", custom_domain: null, alert_phone: "01012345678", ...site }],
  });
  const domainDeps = (tables: Record<string, Row[]>, connect: DomainAutoConnectDependencies["connect"], s: ReturnType<typeof relay>, m: ReturnType<typeof mail>): DomainAutoConnectDependencies => ({
    db: fakeDb(tables), configured: true, connect, disconnect: async () => {}, sms, email: { key: "fake", from: "alerts@example.com" }, smsTransport: s.transport, emailTransport: m.transport,
  });
  {
    const tables = domainTables(), s = relay(), m = mail(), connected: string[] = [];
    const result = await startRegisteredDomainConnection(ORDER, domainDeps(tables, (async (hostname: string) => { connected.push(hostname); return {} as never; }) as never, s, m));
    assert.deepEqual([result.connected, result.hostname, result.warning, result.notified], [true, "www.mybrand.com", null, ["sms", "email"]]);
    assert.deepEqual(connected, ["www.mybrand.com"]);
    assert.equal(tables.landing_sites[0].custom_domain, "www.mybrand.com");
    assert.deepEqual([s.bodies[0].eventType, s.bodies[0].params], ["domain-connect-started", { domain: "www.mybrand.com" }]);
    assert.equal(m.sent[0].key, `domain-connect/${ORDER}`);
  }
  {
    const s = relay(), m = mail();
    const failing = await startRegisteredDomainConnection(ORDER, domainDeps(domainTables(), (async () => { throw new Error("CLOUDFLARE_DOMAIN_ERROR:quota"); }) as never, s, m));
    assert.equal(failing.connected, false);
    assert.match(String(failing.warning), /자동 연결에 실패했어요\(quota\)/, "실패는 던지지 않고 경고로");
    assert.equal(s.bodies.length + m.sent.length, 0, "연결이 안 되면 '시작했어요'를 보내지 않는다");
    const draft = await startRegisteredDomainConnection(ORDER, domainDeps(domainTables({ status: "draft" }), (async () => ({})) as never, s, m));
    assert.match(String(draft.warning), /공개 전/);
    const other = await startRegisteredDomainConnection(ORDER, domainDeps(domainTables({ custom_domain: "www.other.com" }), (async () => ({})) as never, s, m));
    assert.match(String(other.warning), /www\.other\.com/, "다른 도메인이 붙어 있으면 바꾸지 않는다");
    const oldRelay = relay("old");
    const partial = await startRegisteredDomainConnection(ORDER, domainDeps(domainTables(), (async () => ({})) as never, oldRelay, m));
    assert.equal(partial.connected, true);
    assert.deepEqual(partial.notified, ["email"], "예전 중계면 메일만");
    assert.match(String(partial.warning), /문자/);
  }

  /* ---- 세금 신고 마감 ---- */
  assert.deepEqual(taxDeadlines(2027).map((item) => item.date), ["2027-05-31", "2027-01-25", "2027-07-26"], "7/25(일) → 7/26(월)");
  const at = (kst: string) => Date.parse(`${kst}+09:00`);
  assert.deepEqual(dueTaxReminders(at("2027-05-24T09:00:00")).map((item) => [item.kind, item.daysBefore, item.date]), [["income", 7, "2027-05-31"]]);
  assert.deepEqual(dueTaxReminders(at("2027-07-25T10:00:00")).map((item) => [item.kind, item.daysBefore]), [["vat", 1]]);
  assert.deepEqual(dueTaxReminders(at("2026-12-28T00:30:00"))[0]?.date, undefined);
  assert.deepEqual(dueTaxReminders(at("2027-01-18T12:00:00")).map((item) => item.date), ["2027-01-25"], "1월 마감 D-7");
  {
    const tables: Record<string, Row[]> = {
      landing_sites: [{ alert_phone: "01012345678", published_version: 1, status: "published", weekly_report_opt_out: false }, { alert_phone: "01012345678", published_version: 2, status: "published", weekly_report_opt_out: false },
        { alert_phone: "01055556666", published_version: 1, status: "published", weekly_report_opt_out: true }, { alert_phone: null, published_version: 1, status: "published", weekly_report_opt_out: false },
        // 환불로 내린 홈페이지(published_version 은 남아 있다)에는 보내지 않는다
        { alert_phone: "01077778888", published_version: 1, status: "unpublished", weekly_report_opt_out: false }],
      tax_reminder_sends: [],
    };
    const s = relay();
    const deps = { db: fakeDb(tables, { keys: { tax_reminder_sends: ["recipient_key", "deadline", "days_before"] } }), sms, transport: s.transport };
    assert.equal((await runTaxReminders({ ...deps, now: at("2027-05-24T08:59:00") })).reason, "not_due", "9시 전에는 보내지 않는다");
    assert.equal((await runTaxReminders({ ...deps, now: at("2027-05-25T10:00:00") })).reason, "not_due", "마감 7일·1일 전이 아니면");
    const first = await runTaxReminders({ ...deps, now: at("2027-05-24T09:05:00") });
    assert.deepEqual([first.sent, first.failed], [1, 0], "같은 번호의 홈페이지 둘에도 한 통, 리포트를 끈 곳은 빼고");
    assert.deepEqual([s.bodies[0].eventType, s.bodies[0].recipient, s.bodies[0].params], ["tax-deadline", "01012345678", { kind: "income", days: 7, month: 5, day: 31 }]);
    assert.equal(tables.tax_reminder_sends[0].status, "sent");
    assert.ok(!JSON.stringify(tables.tax_reminder_sends).includes("01012345678"), "표에는 번호 원문을 두지 않는다");
    const second = await runTaxReminders({ ...deps, now: at("2027-05-24T09:10:00") });
    assert.equal(second.sent, 0, "5분 뒤 다시 돌아도 보내지 않는다");
    assert.equal(s.bodies.length, 1);
    assert.equal((await runTaxReminders({ ...deps, sms: null, now: at("2027-05-24T09:10:00") })).reason, "sms_disabled");
    // 표(0040)가 없으면 조용히 건너뛴다
    const missing = await runTaxReminders({ db: fakeDb({ landing_sites: tables.landing_sites }), sms, transport: s.transport, now: at("2027-05-30T09:00:00") });
    assert.equal(missing.reason, "migration_required");
    // 예전 중계면 맡은 줄을 지우고 멈춘다(업그레이드 뒤 그날 다시)
    const oldTables: Record<string, Row[]> = { landing_sites: tables.landing_sites, tax_reminder_sends: [] };
    const stopped = await runTaxReminders({ db: fakeDb(oldTables), sms, transport: relay("old").transport, now: at("2027-05-30T09:00:00") });
    assert.equal(stopped.reason, "relay_upgrade_required");
    assert.equal(oldTables.tax_reminder_sends.length, 0);
  }

  console.log("launch-notifications: v4 request shape, payment once per order + fallbacks, lead contact + v3 fallback, visitor receipt, domain auto-connect, tax reminders dedupe");
})().catch((error) => { console.error(error); process.exit(1); });
