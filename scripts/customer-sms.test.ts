import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { customerSmsConfig, normalizeAlertPhone, sendCustomerSms, stableEventId } from "../lib/notify/customer-sms";
import { processLandingLeadNotification } from "../lib/landing/lead-notifications";

const SECRET = "s".repeat(43);
const ENV = { CUSTOMER_SMS_ENABLED: "1", OWNER_SMS_RELAY_URL: "https://api.example.com/_oneulstart/support-owner-sms", OWNER_SMS_RELAY_SECRET: SECRET, OWNER_SMS_MODE: "live" };

async function hmacHex(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))), (v) => v.toString(16).padStart(2, "0")).join("");
}

(async () => {
  // 켜기: CUSTOMER_SMS_ENABLED=1 과 중계 연결 값이 모두 맞아야
  assert.equal(customerSmsConfig({ ...ENV, CUSTOMER_SMS_ENABLED: undefined }), null, "기본은 꺼짐");
  assert.equal(customerSmsConfig({ ...ENV, OWNER_SMS_RELAY_URL: "https://api.example.com/other" }), null, "정해진 중계 경로만");
  assert.equal(customerSmsConfig({ ...ENV, OWNER_SMS_MODE: undefined }), null, "모드는 명시");
  const config = customerSmsConfig(ENV)!;
  assert.equal(config.mode, "live");

  assert.equal(normalizeAlertPhone("010-1234-5678"), "01012345678");
  assert.equal(normalizeAlertPhone(" 010 1234 5678 "), "01012345678");
  assert.equal(normalizeAlertPhone("02-123-4567"), null, "휴대폰만");
  assert.equal(normalizeAlertPhone("0101234567"), null);

  const id = await stableEventId("weekly-report:site:2026-09-28");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(id, await stableEventId("weekly-report:site:2026-09-28"), "같은 일에는 같은 id");
  assert.notEqual(id, await stableEventId("weekly-report:site:2026-10-05"));

  // 요청: 받는 번호와 숫자만, 서명은 대표 알림과 같은 방식
  const calls: Array<{ url: string; headers: Headers; body: string }> = [];
  let reply = (body: Record<string, unknown>) => new Response(JSON.stringify({ eventId: body.eventId, mode: "live", status: "accepted", code: "PROVIDER_ACCEPTED", duplicate: false }), { status: 200 });
  const transport = (async (url: string, init?: RequestInit) => { calls.push({ url, headers: new Headers(init?.headers), body: String(init?.body) }); return reply(JSON.parse(String(init?.body))); }) as unknown as typeof fetch;
  const eventId = crypto.randomUUID();
  assert.deepEqual(await sendCustomerSms(config, { eventId, eventType: "weekly-report", recipient: "01012345678", params: { leads: 3, prevLeads: 1, views: 42 } }, transport), { status: "accepted", code: "PROVIDER_ACCEPTED" });
  const sent = JSON.parse(calls[0].body);
  assert.deepEqual(sent, { version: 3, eventId, mode: "live", service: "oneulstart", eventType: "weekly-report", recipient: "01012345678", params: { leads: 3, prevLeads: 1, views: 42 } });
  assert.equal(calls[0].headers.get("x-oneul-signature"), await hmacHex(SECRET, `${calls[0].headers.get("x-oneul-time")}\nPOST\n/_oneulstart/support-owner-sms\n${calls[0].body}`));
  assert.ok(!calls[0].body.includes("msg") && !calls[0].body.includes("sender"), "문구·발신번호는 중계가 정한다");

  assert.equal((await sendCustomerSms(config, { eventId, eventType: "homepage-lead", recipient: "0212345678", params: {} }, transport)).code, "CUSTOMER_SMS_INPUT_INVALID");
  assert.equal(calls.length, 1, "잘못된 번호는 중계에 보내지도 않는다");

  reply = (body) => new Response(JSON.stringify({ eventId: body.eventId, mode: "live", eventType: "homepage-lead", status: "blocked", code: "RECIPIENT_DAILY_LIMIT_REACHED" }), { status: 429 });
  assert.deepEqual(await sendCustomerSms(config, { eventId, eventType: "homepage-lead", recipient: "01012345678", params: {} }, transport), { status: "blocked", code: "RECIPIENT_DAILY_LIMIT_REACHED" });
  reply = () => new Response("bad gateway", { status: 502 });
  assert.equal((await sendCustomerSms(config, { eventId, eventType: "homepage-lead", recipient: "01012345678", params: {} }, transport)).status, "uncertain");
  reply = () => new Response(JSON.stringify({ eventId: crypto.randomUUID(), mode: "live", status: "accepted", code: "PROVIDER_ACCEPTED" }), { status: 200 });
  assert.equal((await sendCustomerSms(config, { eventId, eventType: "homepage-lead", recipient: "01012345678", params: {} }, transport)).code, "RELAY_INVALID_RECEIPT", "다른 일의 영수증은 믿지 않는다");
  reply = (body) => new Response(JSON.stringify({ eventId: body.eventId, mode: "live", status: "test_accepted", code: "ALIGO_TEST_ACCEPTED" }), { status: 200 });
  assert.equal((await sendCustomerSms(config, { eventId, eventType: "homepage-lead", recipient: "01012345678", params: {} }, transport)).code, "RELAY_INVALID_RECEIPT", "실발송 모드에 시험 영수증은 이상하다");
  assert.equal((await sendCustomerSms(config, { eventId, eventType: "homepage-lead", recipient: "01012345678", params: {} }, (async () => { throw new Error("down"); }) as typeof fetch)).code, "RELAY_UNREACHABLE");

  /* 새 문의 알림: 번호가 있고 문자가 켜져 있으면 문자, 아니면 메일 설정 확인 */
  function fixture(alertPhone: string | null) {
    const row: Record<string, any> = { lead_id: crypto.randomUUID(), site_id: "site-1", status: "pending", attempts: 0, first_attempt_at: null, delivery_uncertain: false, payload: null, lease_token: null };
    const db = {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        if (row.status === "sent" || row.lease_token) return { data: [], error: null };
        row.status = "processing"; row.lease_token = args.p_token;
        return { data: [structuredClone(row)], error: null };
      },
      from: (table: string) => {
        let patch: Record<string, unknown> | null = null;
        const chain: any = {
          select: () => chain, eq: () => chain,
          update: (values: Record<string, unknown>) => { patch = values; return chain; },
          maybeSingle: async () => ({ data: table === "landing_sites" ? { alert_phone: alertPhone } : null, error: null }),
          then: (resolve: (value: unknown) => unknown) => {
            if (patch) Object.assign(row, patch);
            return Promise.resolve({ data: [{ lead_id: row.lead_id }], error: null }).then(resolve);
          },
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    return { row, db };
  }
  const smsCalls: string[] = [];
  let smsReply: (body: Record<string, unknown>) => Response = (body) => new Response(JSON.stringify({ eventId: body.eventId, mode: "live", status: "accepted", code: "PROVIDER_ACCEPTED" }), { status: 200 });
  const smsTransport = (async (_url: string, init?: RequestInit) => { smsCalls.push(String(init?.body)); return smsReply(JSON.parse(String(init?.body))); }) as unknown as typeof fetch;
  const noEmail = (async () => { throw new Error("email must not be used"); }) as typeof fetch;

  let lead = fixture("01012345678");
  await processLandingLeadNotification(lead.row.lead_id, false, { db: lead.db, config: null, transport: noEmail, sms: config, smsTransport });
  assert.equal(lead.row.status, "sent");
  assert.match(String(lead.row.provider_id), /^sms:/);
  assert.equal(JSON.parse(smsCalls[0]).eventId, lead.row.lead_id, "문의 id 가 곧 중계 eventId(중복 방지)");
  assert.equal(JSON.parse(smsCalls[0]).eventType, "homepage-lead");

  lead = fixture("01012345678");
  smsReply = () => new Response("down", { status: 503 });
  await processLandingLeadNotification(lead.row.lead_id, false, { db: lead.db, config: null, transport: noEmail, sms: config, smsTransport });
  assert.equal(lead.row.status, "retry", "확인 불가는 같은 id 로 다시");
  assert.equal(lead.row.error_code, "delivery_unknown");

  lead = fixture("01012345678");
  smsReply = (body) => new Response(JSON.stringify({ eventId: body.eventId, mode: "live", status: "blocked", code: "CUSTOMER_DAILY_LIMIT_REACHED" }), { status: 429 });
  await processLandingLeadNotification(lead.row.lead_id, false, { db: lead.db, config: null, transport: noEmail, sms: config, smsTransport });
  assert.deepEqual([lead.row.status, lead.row.error_code], ["blocked", "provider_unavailable"], "한도에 걸리면 멈춘다");

  lead = fixture(null);
  await processLandingLeadNotification(lead.row.lead_id, false, { db: lead.db, config: null, transport: noEmail, sms: config, smsTransport });
  assert.deepEqual([lead.row.status, lead.row.error_code], ["blocked", "recipient_missing"], "문자는 켜졌는데 번호가 없다");
  lead = fixture(null);
  await processLandingLeadNotification(lead.row.lead_id, false, { db: lead.db, config: null, transport: noEmail, sms: null });
  assert.deepEqual([lead.row.status, lead.row.error_code], ["blocked", "missing_email_config"], "둘 다 설정 없음");

  console.log("customer-sms: config gate, phone, stable id, signed v3 request, receipt checks, lead alert by SMS");
})().catch((error) => { console.error(error); process.exit(1); });
