import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Module, { createRequire } from "node:module";

async function main() {
  const require = createRequire(import.meta.url);
  const moduleId = require.resolve("../lib/persistence"), before = require.cache[moduleId];
  const names = ["OWNER_SMS_ENABLED", "OWNER_SMS_TRANSPORT", "OWNER_SMS_RELAY_URL", "OWNER_SMS_RELAY_SECRET", "OWNER_SMS_TO", "OWNER_SMS_MODE", "OWNER_SMS_DAILY_LIMIT"];
  const prior = names.map(name => [name, process.env[name]] as const);
  const originalFetch = globalThis.fetch;
  let calls = 0, quota = 0, error = false, wrong = false;
  const mod = new Module(moduleId); mod.filename = moduleId; mod.loaded = true;
  mod.exports = { getServerSupabase: () => ({ rpc: () => ({ abortSignal: () => ({ retry: () => Promise.resolve({ data: ++quota, error: error ? {} : null }) }) }) }) };
  require.cache[moduleId] = mod;
  const { notifyOwnerBySms } = require("../lib/notify/owner-sms") as typeof import("../lib/notify/owner-sms");
  const eventId = "00000000-0000-4000-8000-000000000001";
  const secret = "syntheticSecret" + "x".repeat(40);
  const sign = (text: string) => createHmac("sha256", secret).update(text).digest("hex");
  Object.assign(process.env, {
    OWNER_SMS_ENABLED: "1", OWNER_SMS_TRANSPORT: "relay", OWNER_SMS_RELAY_URL: "https://sms.example.invalid/_oneulstart/support-owner-sms",
    OWNER_SMS_RELAY_SECRET: secret, OWNER_SMS_TO: "01000000001", OWNER_SMS_MODE: "live", OWNER_SMS_DAILY_LIMIT: "10",
  });
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), process.env.OWNER_SMS_RELAY_URL);
    assert.equal(init!.redirect, "error"); assert.equal(init!.method, "POST");
    const body = JSON.parse(String(init!.body)), headers = new Headers(init!.headers);
    assert.deepEqual(Object.keys(body), ["version", "eventId", "mode", "recipientCheck"]);
    assert.equal(body.recipientCheck, sign("recipient:01000000001"));
    assert.equal(headers.get("x-oneul-signature"), sign(`${headers.get("x-oneul-time")}\nPOST\n/_oneulstart/support-owner-sms\n${init!.body}`));
    assert.equal(String(init!.body).includes("01000000001"), false);
    return Response.json({ eventId: wrong ? "00000000-0000-4000-8000-000000000002" : eventId, mode: "live", status: "accepted", code: "PROVIDER_ACCEPTED", duplicate: false });
  };
  try {
    assert.deepEqual(await notifyOwnerBySms(eventId), { status: "accepted", code: "PROVIDER_ACCEPTED" });
    assert.equal(calls, 1);
    assert.equal((await notifyOwnerBySms()).code, "SMS_RELAY_CONFIG_REQUIRED"); assert.equal(calls, 1);
    wrong = true;
    assert.equal((await notifyOwnerBySms(eventId)).code, "RELAY_INVALID_RECEIPT"); assert.equal(calls, 2); wrong = false;
    error = true;
    assert.equal((await notifyOwnerBySms(eventId)).code, "LIMIT_UNAVAILABLE"); assert.equal(calls, 2); error = false;
    for (const invalid of ["http://sms.example.invalid/_oneulstart/support-owner-sms", "https://sms.example.invalid/other", "https://sms.example.invalid/_oneulstart/support-owner-sms?to=other"]) {
      process.env.OWNER_SMS_RELAY_URL = invalid;
      assert.equal((await notifyOwnerBySms(eventId)).code, "SMS_RELAY_CONFIG_REQUIRED");
    }
    assert.equal(calls, 2);
    console.log("PASS relay: fixed signed body, no phone disclosure, stable event binding, durable quota, no direct fallback, invalid endpoint denial");
  } finally {
    globalThis.fetch = originalFetch;
    if (before) require.cache[moduleId] = before; else delete require.cache[moduleId];
    for (const [name, value] of prior) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
