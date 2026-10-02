import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Module, { createRequire } from "node:module";

async function main() {
  const require = createRequire(import.meta.url);
  const moduleId = require.resolve("../lib/persistence"), previous = require.cache[moduleId];
  const names = ["OWNER_SMS_ENABLED", "OWNER_SMS_TRANSPORT", "OWNER_SMS_REPORT_READY_ENABLED", "OWNER_SMS_RELAY_URL", "OWNER_SMS_RELAY_SECRET", "OWNER_SMS_TO", "OWNER_SMS_MODE", "OWNER_SMS_DAILY_LIMIT"];
  const prior = names.map(name => [name, process.env[name]] as const);
  const originalFetch = globalThis.fetch;
  const secret = "syntheticSecret" + "x".repeat(40);
  const eventId = "00000000-0000-4000-8000-000000000001";
  const sign = (text: string) => createHmac("sha256", secret).update(text).digest("hex");
  let quota = 0, calls = 0, wrongEvent = false;
  const mod = new Module(moduleId); mod.filename = moduleId; mod.loaded = true;
  mod.exports = { getServerSupabase: () => ({ rpc: (name: string, args: unknown) => {
    assert.equal(name, "bump_rate_limit");
    assert.deepEqual(args, { p_bucket: "support-owner-sms", p_key: "oneulstart", p_window_ms: 86_400_000 });
    return { abortSignal: () => ({ retry: () => Promise.resolve({ data: ++quota, error: null }) }) };
  } }) };
  require.cache[moduleId] = mod;
  const { notifyOwnerBySms } = require("../lib/notify/owner-sms") as typeof import("../lib/notify/owner-sms");
  Object.assign(process.env, {
    OWNER_SMS_ENABLED: "1", OWNER_SMS_TRANSPORT: "relay", OWNER_SMS_REPORT_READY_ENABLED: "0",
    OWNER_SMS_RELAY_URL: "https://sms.example.invalid/_oneulstart/support-owner-sms",
    OWNER_SMS_RELAY_SECRET: secret, OWNER_SMS_TO: "01000000001", OWNER_SMS_MODE: "live", OWNER_SMS_DAILY_LIMIT: "3",
  });
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), process.env.OWNER_SMS_RELAY_URL);
    const body = JSON.parse(String(init!.body)), headers = new Headers(init!.headers);
    assert.deepEqual(body, { version: 2, eventId, mode: "live", recipientCheck: sign("recipient:01000000001"), service: "oneulstart", eventType: "business-plan-ready" });
    assert.equal(headers.get("x-oneul-signature"), sign(`${headers.get("x-oneul-time")}\nPOST\n/_oneulstart/support-owner-sms\n${init!.body}`));
    assert.equal(init!.redirect, "manual");
    assert.equal(String(init!.body).includes("01000000001"), false);
    return Response.json({ eventId, eventType: wrongEvent ? "support-inquiry" : "business-plan-ready", mode: "live", status: "accepted", code: "PROVIDER_ACCEPTED" });
  };
  try {
    assert.equal((await notifyOwnerBySms(eventId, "business-plan-ready")).code, "REPORT_SMS_DISABLED");
    assert.equal(calls, 0); assert.equal(quota, 0);
    process.env.OWNER_SMS_REPORT_READY_ENABLED = "1";
    process.env.OWNER_SMS_TRANSPORT = "aligo";
    assert.equal((await notifyOwnerBySms(eventId, "business-plan-ready")).code, "REPORT_SMS_RELAY_REQUIRED");
    assert.equal(calls, 0); assert.equal(quota, 0);
    process.env.OWNER_SMS_TRANSPORT = "relay";
    assert.deepEqual(await notifyOwnerBySms(eventId, "business-plan-ready"), { status: "accepted", code: "PROVIDER_ACCEPTED" });
    assert.equal(calls, 1);
    wrongEvent = true;
    assert.equal((await notifyOwnerBySms(eventId, "business-plan-ready")).code, "RELAY_INVALID_RECEIPT");
    assert.equal(calls, 2); wrongEvent = false;
    assert.equal((await notifyOwnerBySms(eventId, "business-plan-ready")).status, "accepted");
    assert.equal((await notifyOwnerBySms(eventId, "business-plan-ready")).code, "DAILY_LIMIT_REACHED");
    assert.equal(calls, 3);
    assert.equal((await notifyOwnerBySms(eventId, "other-project" as never)).code, "SMS_EVENT_INVALID");
    assert.equal(calls, 3); assert.equal(quota, 4);
    console.log("PASS owner report SMS: explicit opt-in, relay only, fixed service/event, recipient privacy, receipt binding, shared cap, unknown-event rejection");
  } finally {
    globalThis.fetch = originalFetch;
    if (previous) require.cache[moduleId] = previous; else delete require.cache[moduleId];
    for (const [name, value] of prior) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
