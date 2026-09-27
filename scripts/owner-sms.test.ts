import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFileSync } from "node:fs";

async function main() {
  const require = createRequire(import.meta.url);
  const moduleId = require.resolve("../lib/persistence"), priorModule = require.cache[moduleId];
  const envNames = ["OWNER_SMS_ENABLED", "OWNER_SMS_TRANSPORT", "ALIGO_API_KEY", "ALIGO_USER_ID", "OWNER_SMS_MODE", "OWNER_SMS_FROM", "OWNER_SMS_TO", "OWNER_SMS_DAILY_LIMIT"];
  const priorEnv = envNames.map(name => [name, process.env[name]] as const);
  const originalFetch = globalThis.fetch, originalWarn = console.warn, originalTimer = globalThis.setTimeout;
  const logs: string[] = [];
  console.warn = (...values) => { logs.push(values.join(" ")); };
  let dbAvailable = true, dbThrows = false, count = 0, quotaError = false, invalidCount: unknown = undefined, quotaWait = false;
  let sends = 0, quotaCalls = 0, cancelled = 0, timeoutRequests = 0;
  let responseMode = "accepted", httpStatus = 200;
  let lastRequest: RequestInit | undefined;
  const receipts = () => ({ result_code: 1, message: "success", msg_id: 123456789, success_cnt: 1, error_cnt: 0, msg_type: "SMS" });
  const db = {
    rpc(name: string, args: unknown) {
      quotaCalls++;
      assert.equal(name, "bump_rate_limit");
      assert.deepEqual(args, { p_bucket: "support-owner-sms", p_key: "oneulstart", p_window_ms: 86_400_000 });
      return { abortSignal(signal: AbortSignal) {
        return { retry(enabled: boolean) {
          assert.equal(enabled, false);
          if (quotaWait) return new Promise((_, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); });
          return Promise.resolve({ data: invalidCount === undefined ? ++count : invalidCount, error: quotaError ? { message: "synthetic-private-db-error" } : null });
        } };
      } };
    },
  };
  const mod = new Module(moduleId); mod.filename = moduleId; mod.loaded = true;
  mod.exports = { getServerSupabase: () => { if (dbThrows) throw new Error("synthetic-private-db-error"); return dbAvailable ? db : null; } };
  require.cache[moduleId] = mod;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://apis.aligo.in/send/");
    sends++; lastRequest = init;
    if (responseMode === "network") throw new Error("synthetic-private-provider-error");
    if (responseMode === "wait") return new Promise((_, reject) => { init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true }); });
    if (responseMode === "body-wait") return new Response(new ReadableStream({
      start(controller) { init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason), { once: true }); },
      cancel() { cancelled++; },
    }));
    if (responseMode === "too-large") return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(20_000))); },
      cancel() { cancelled++; },
    }));
    if (responseMode === "invalid-json") return new Response("<html>synthetic provider error</html>");
    if (responseMode === "invalid-shape") return Response.json({ ok: true });
    if (httpStatus !== 200) return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("synthetic-private-provider-error")); },
      cancel() { cancelled++; },
    }), { status: httpStatus });
    const receipt = receipts();
    if (responseMode === "rejected") return Response.json({ result_code: -101, message: "synthetic-private-provider-error" });
    if (responseMode === "unconfirmed") receipt.result_code = 0;
    if (responseMode === "wrong-type") receipt.msg_type = "LMS";
    if (responseMode === "wrong-count") receipt.success_cnt = 2;
    if (responseMode === "missing-id") return Response.json({ ...receipt, msg_id: undefined });
    return Response.json(receipt);
  };
  const { notifyOwnerBySms } = require("../lib/notify/owner-sms") as typeof import("../lib/notify/owner-sms");
  const results: { name: string; status: string }[] = [];
  function reset() {
    Object.assign(process.env, {
      OWNER_SMS_ENABLED: "1", OWNER_SMS_TRANSPORT: "aligo", ALIGO_API_KEY: "syntheticKeyOnly", ALIGO_USER_ID: "synthetic-account", OWNER_SMS_MODE: "live",
      OWNER_SMS_FROM: "0200000000", OWNER_SMS_TO: "01000000001", OWNER_SMS_DAILY_LIMIT: "3",
    });
    dbAvailable = true; dbThrows = false; quotaError = false; invalidCount = undefined; quotaWait = false;
    count = 0; sends = 0; quotaCalls = 0; cancelled = 0; responseMode = "accepted"; httpStatus = 200; lastRequest = undefined;
    globalThis.setTimeout = originalTimer;
  }
  function shortenTestClock() {
    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, milliseconds?: number, ...args: unknown[]) => {
      assert.equal(milliseconds, 6000, "production deadline stays six seconds"); timeoutRequests++;
      return originalTimer(callback, 25, ...args);
    }) as typeof setTimeout;
  }
  async function check(name: string, run: () => Promise<void> | void) {
    reset();
    try { await run(); results.push({ name, status: "passed" }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, status: "failed" }); console.error(`FAIL ${name}: ${String(error)}`); }
  }
  try {
    await check("disabled or missing configuration performs no DB/provider work", async () => {
      delete process.env.OWNER_SMS_ENABLED;
      assert.equal((await notifyOwnerBySms()).status, "disabled");
      process.env.OWNER_SMS_ENABLED = "1"; delete process.env.ALIGO_API_KEY;
      assert.equal((await notifyOwnerBySms()).code, "SMS_CONFIG_REQUIRED");
      assert.equal(sends, 0); assert.equal(quotaCalls, 0);
    });
    await check("invalid recipient/sender, credentials and unapproved cap fail closed", async () => {
      for (const [key, value] of [["OWNER_SMS_TO", "01000000001,01000000002"], ["OWNER_SMS_FROM", "+821000000001"], ["ALIGO_API_KEY", "synthetic\nkey"], ["ALIGO_USER_ID", "synthetic\naccount"], ["OWNER_SMS_DAILY_LIMIT", "0"], ["OWNER_SMS_DAILY_LIMIT", "1001"], ["OWNER_SMS_DAILY_LIMIT", ""], ["OWNER_SMS_DAILY_LIMIT", "3.5"]]) {
        const prior = process.env[key]; process.env[key] = value;
        assert.equal((await notifyOwnerBySms()).code, "SMS_CONFIG_REQUIRED"); process.env[key] = prior;
      }
      assert.equal(sends, 0); assert.equal(quotaCalls, 0);
    });
    await check("one authenticated fixed SMS request has no inquiry text or automatic upgrades", async () => {
      assert.deepEqual(await notifyOwnerBySms(), { status: "accepted", code: "PROVIDER_ACCEPTED" });
      assert.equal(sends, 1); assert.equal(count, 1);
      const init = lastRequest!;
      assert.equal(init.method, "POST"); assert.equal(init.redirect, "error");
      assert.equal(new Headers(init.headers).get("Content-Type"), "application/x-www-form-urlencoded;charset=UTF-8");
      assert.ok(init.body instanceof URLSearchParams);
      const body = Object.fromEntries(init.body);
      assert.deepEqual(body, {
        key: "syntheticKeyOnly", user_id: "synthetic-account", sender: "0200000000", receiver: "01000000001",
        msg: "[오늘창업] 새 고객센터 문의가 접수됐습니다.", msg_type: "SMS", testmode_yn: "N",
      });
      assert.equal(new Headers(init.headers).has("Authorization"), false);
      const text = body.msg;
      assert.match(text, /^[\x00-\x7f가-힣]+$/);
      assert.ok([...text].reduce((bytes, char) => bytes + (char.charCodeAt(0) > 127 ? 2 : 1), 0) <= 90);
    });
    await check("explicit test mode cannot be reported as a real send", async () => {
      process.env.OWNER_SMS_MODE = "test";
      assert.deepEqual(await notifyOwnerBySms(), { status: "test_accepted", code: "ALIGO_TEST_ACCEPTED" });
      assert.ok(lastRequest!.body instanceof URLSearchParams);
      assert.equal(lastRequest!.body.get("testmode_yn"), "Y");
      assert.equal(sends, 1);
    });
    await check("missing or invalid mode never silently enables live sending", async () => {
      delete process.env.OWNER_SMS_MODE;
      assert.equal((await notifyOwnerBySms()).code, "SMS_CONFIG_REQUIRED");
      process.env.OWNER_SMS_MODE = "production";
      assert.equal((await notifyOwnerBySms()).code, "SMS_CONFIG_REQUIRED");
      assert.equal(sends, 0); assert.equal(quotaCalls, 0);
    });
    await check("shared atomic quota admits only cap even for concurrent callers", async () => {
      const responses = await Promise.all(Array.from({ length: 12 }, () => notifyOwnerBySms()));
      assert.equal(responses.filter(response => response.status === "accepted").length, 3);
      assert.equal(responses.filter(response => response.code === "DAILY_LIMIT_REACHED").length, 9);
      assert.equal(sends, 3); assert.equal(count, 12);
    });
    await check("missing DB, RPC errors and invalid counts never use memory approval", async () => {
      dbAvailable = false; assert.equal((await notifyOwnerBySms()).code, "DURABLE_LIMIT_REQUIRED"); dbAvailable = true;
      dbThrows = true; assert.equal((await notifyOwnerBySms()).code, "LIMIT_UNAVAILABLE"); dbThrows = false;
      quotaError = true; assert.equal((await notifyOwnerBySms()).code, "LIMIT_UNAVAILABLE"); quotaError = false;
      for (const value of [null, "1", 0, -1, 1.5]) { invalidCount = value; assert.equal((await notifyOwnerBySms()).code, "LIMIT_UNAVAILABLE"); }
      assert.equal(sends, 0);
    });
    await check("HTTP 200 and JSON alone cannot prove provider acceptance", async () => {
      for (const mode of ["invalid-json", "invalid-shape", "unconfirmed"]) {
        responseMode = mode; const before = sends;
        assert.equal((await notifyOwnerBySms()).status, "uncertain"); assert.equal(sends, before + 1);
      }
      assert.equal((await notifyOwnerBySms()).code, "DAILY_LIMIT_REACHED"); assert.equal(sends, 3);
    });
    await check("Aligo application-level rejection stays rejected despite HTTP 200", async () => {
      responseMode = "rejected";
      assert.deepEqual(await notifyOwnerBySms(), { status: "rejected", code: "ALIGO_REJECTED_-101" }); assert.equal(sends, 1);
    });
    await check("wrong message type, multiple recipients or missing receipt ID cannot pass", async () => {
      for (const mode of ["wrong-type", "wrong-count", "missing-id"]) {
        responseMode = mode;
        assert.equal((await notifyOwnerBySms()).code, "UNCONFIRMED_PROVIDER_RECEIPT");
      }
      assert.equal(sends, 3);
    });
    await check("provider auth, quota and server errors do not retry and release response bodies", async () => {
      for (const status of [401, 429, 503]) {
        httpStatus = status; const before = sends;
        assert.equal((await notifyOwnerBySms()).code, `PROVIDER_HTTP_${status}`); assert.equal(sends, before + 1);
      }
      assert.equal(cancelled, 3); assert.equal(count, 3);
    });
    await check("network error is uncertain and still consumes the attempt allowance", async () => {
      responseMode = "network";
      assert.equal((await notifyOwnerBySms()).status, "uncertain"); assert.equal(sends, 1); assert.equal(count, 1);
    });
    await check("slow quota expires before any provider request", async () => {
      shortenTestClock(); quotaWait = true;
      assert.deepEqual(await notifyOwnerBySms(), { status: "blocked", code: "SMS_TIMEOUT" }); assert.equal(sends, 0);
    });
    await check("provider timeout is uncertain without retry or quota refund", async () => {
      shortenTestClock(); responseMode = "wait";
      assert.deepEqual(await notifyOwnerBySms(), { status: "uncertain", code: "SMS_TIMEOUT" }); assert.equal(sends, 1); assert.equal(count, 1);
    });
    await check("deadline covers response body reading, not just headers", async () => {
      shortenTestClock(); responseMode = "body-wait";
      assert.deepEqual(await notifyOwnerBySms(), { status: "uncertain", code: "SMS_TIMEOUT" }); assert.equal(sends, 1);
    });
    await check("oversized receipts are stopped and never treated as success", async () => {
      responseMode = "too-large";
      assert.equal((await notifyOwnerBySms()).status, "uncertain"); assert.equal(cancelled, 1); assert.equal(sends, 1);
    });
    await check("server boundary and logs exclude private credentials, recipient and provider bodies", () => {
      assert.match(readFileSync("lib/notify/owner-sms.ts", "utf8"), /^import "server-only";/);
      assert.doesNotMatch(readFileSync("app/account/support/SupportCenter.tsx", "utf8"), /ALIGO|OWNER_SMS|notifyOwnerBySms/);
      const output = logs.join("\n");
      for (const secret of ["syntheticKeyOnly", "synthetic-account", "01000000001", "synthetic-private-db-error", "synthetic-private-provider-error"]) assert.equal(output.includes(secret), false);
      assert.equal(timeoutRequests, 3);
    });
  } finally {
    globalThis.fetch = originalFetch; console.warn = originalWarn; globalThis.setTimeout = originalTimer;
    if (priorModule) require.cache[moduleId] = priorModule; else delete require.cache[moduleId];
    for (const [name, value] of priorEnv) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
  console.log(JSON.stringify({ results, scope: "Real Aligo adapter, synthetic atomic RPC and intercepted provider only; no actual Aligo test/live call or PostgreSQL integration", actualSmsCalls: 0, actualAligoApiCalls: 0 }));
  if (results.some(test => test.status === "failed")) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
