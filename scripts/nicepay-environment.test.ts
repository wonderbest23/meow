import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { nicepayEnvironment, isNicepaySdkUrl, NICEPAY_ENDPOINTS } from "../lib/payments/nicepay-environment";
import { approveNicepayPayment, cancelNicepayPayment, nicepayConfigured, nicepaySdkUrl, verifyAuthSignature } from "../lib/payments/nicepay-client";
import { loadNicepaySdk } from "../lib/payments/nicepay-sdk";
import { isProductionPaymentRuntime } from "../lib/payments/production-runtime";

async function main() {
  const keys = ["APP_ENV", "NICEPAY_ENVIRONMENT", "NICEPAY_CLIENT_KEY", "NICEPAY_SECRET_KEY", "NICEPAY_SANDBOX_CLIENT_KEY", "NICEPAY_SANDBOX_SECRET_KEY", "PAYMENTS_ENABLED"];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const fetchBefore = globalThis.fetch;
  const setEnv = (env: Record<string, string>) => { for (const key of keys) delete process.env[key]; Object.assign(process.env, env); };
  try {
    assert.equal(nicepayEnvironment({}).api, NICEPAY_ENDPOINTS.production.api);
    for (const APP_ENV of ["staging", "prelaunch"]) {
      assert.throws(() => nicepayEnvironment({ APP_ENV }), /SANDBOX_REQUIRED/);
      assert.throws(() => nicepayEnvironment({ APP_ENV, NICEPAY_ENVIRONMENT: "production" }), /SANDBOX_REQUIRED/);
    }
    assert.throws(() => nicepayEnvironment({ NICEPAY_ENVIRONMENT: "unknown" }), /ENVIRONMENT_INVALID/);
    // 운영(APP_ENV 없음 + NODE_ENV=production, 또는 APP_ENV=production)에서 시험 모드면 결제를 막는다 — 돈 없이 유료 기능이 열리는 길
    assert.equal(isProductionPaymentRuntime({ NODE_ENV: "production" }), true);
    assert.equal(isProductionPaymentRuntime({ APP_ENV: "production" }), true);
    assert.equal(isProductionPaymentRuntime({ NODE_ENV: "development", NEXT_PUBLIC_APP_ENV: "production" }), true);
    for (const APP_ENV of ["staging", "prelaunch", "local"]) assert.equal(isProductionPaymentRuntime({ NODE_ENV: "production", APP_ENV }), false);
    assert.equal(isProductionPaymentRuntime({ NODE_ENV: "development" }), false);
    assert.equal(isProductionPaymentRuntime({}), false);
    assert.throws(() => nicepayEnvironment({ NODE_ENV: "production", NICEPAY_ENVIRONMENT: "sandbox", NICEPAY_SANDBOX_CLIENT_KEY: "fixture-sandbox", NICEPAY_SANDBOX_SECRET_KEY: "fixture-sandbox" }), /SANDBOX_IN_PRODUCTION/);
    assert.throws(() => nicepayEnvironment({ APP_ENV: "production", NICEPAY_ENVIRONMENT: "sandbox" }), /SANDBOX_IN_PRODUCTION/);
    assert.equal(nicepayEnvironment({ NODE_ENV: "production", NICEPAY_CLIENT_KEY: "fixture-live" }).mode, "production");
    assert.equal(nicepayEnvironment({ NODE_ENV: "production", APP_ENV: "staging", NICEPAY_ENVIRONMENT: "sandbox" }).mode, "sandbox");
    assert.equal(nicepayEnvironment({ NODE_ENV: "development", NICEPAY_ENVIRONMENT: "sandbox" }).mode, "sandbox");
    assert.throws(() => nicepayEnvironment({ NICEPAY_ENVIRONMENT: "sandbox", NICEPAY_CLIENT_KEY: "fixture-live" }), /LIVE_KEYS_IN_SANDBOX/);
    assert.equal(nicepayEnvironment({ NICEPAY_ENVIRONMENT: "sandbox" }).clientKey, null);
    assert.equal(nicepayEnvironment({ NICEPAY_SANDBOX_CLIENT_KEY: "fixture-sandbox" }).clientKey, null);
    for (const bad of [null, undefined, "", `${NICEPAY_ENDPOINTS.sandbox.sdk}?other=1`, NICEPAY_ENDPOINTS.production.sdk.replace("https", "http"), "https://pay.nicepay.co.kr.evil.test/v1/js/"]) assert.equal(isNicepaySdkUrl(bad), false);
    for (const endpoint of Object.values(NICEPAY_ENDPOINTS)) assert(isNicepaySdkUrl(endpoint.sdk));

    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.origin, "https://sandbox-api.nicepay.co.kr");
      assert.equal(init?.redirect, "manual"); assert(init?.signal);
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("authorization"), `Basic ${Buffer.from("fixture-test-client:fixture-test-secret").toString("base64")}`);
      return Response.json({ resultCode: "0000", status: "paid", amount: 100, orderId: "fixture-order", tid: "fixture-tid" });
    };
    setEnv({ APP_ENV: "staging", NICEPAY_CLIENT_KEY: "fixture-live", NICEPAY_SECRET_KEY: "fixture-live" });
    assert.equal(nicepayConfigured(), false);
    await assert.rejects(() => approveNicepayPayment("fixture-tid", 100), /SANDBOX_REQUIRED/);
    assert.equal(await cancelNicepayPayment("fixture-tid", "fixture"), false); assert.equal(calls, 0);

    setEnv({ APP_ENV: "staging", NICEPAY_ENVIRONMENT: "sandbox", NICEPAY_SANDBOX_CLIENT_KEY: "fixture-test-client", NICEPAY_SANDBOX_SECRET_KEY: "fixture-test-secret", PAYMENTS_ENABLED: "false" });
    assert.equal(nicepayConfigured(), false);
    process.env.PAYMENTS_ENABLED = "true";
    assert.equal(nicepayConfigured(), true); assert.equal(nicepaySdkUrl(), NICEPAY_ENDPOINTS.sandbox.sdk);
    const signature = createHash("sha256").update("fixture-tokenfixture-test-client100fixture-test-secret").digest("hex");
    assert(verifyAuthSignature({ authToken: "fixture-token", clientId: "fixture-test-client", amount: 100, signature }));
    assert.equal((await approveNicepayPayment("fixture-tid", 100)).ok, true);
    assert.equal(await cancelNicepayPayment("fixture-tid", "fixture"), true); assert.equal(calls, 2);
    process.env.NICEPAY_SECRET_KEY = "fixture-live";
    await assert.rejects(() => approveNicepayPayment("fixture-tid", 100), /LIVE_KEYS_IN_SANDBOX/);
    assert.equal(calls, 2);

    class Script extends EventTarget {
      src = ""; async = false;
      remove() { const index = scripts.indexOf(this); if (index >= 0) scripts.splice(index, 1); }
    }
    const scripts: Script[] = [];
    const fakeWindow: { AUTHNICE?: { requestPay(): void } } = {};
    const globals = globalThis as unknown as Record<string, unknown>;
    const oldWindow = globals.window, oldDocument = globals.document;
    globals.window = fakeWindow;
    globals.document = { scripts, createElement: () => new Script(), head: { appendChild(script: Script) { scripts.push(script); } } };
    try {
      await assert.rejects(() => loadNicepaySdk("https://example.invalid/sdk.js"), /URL_INVALID/);
      const failed = loadNicepaySdk(NICEPAY_ENDPOINTS.sandbox.sdk);
      assert.equal(scripts.length, 1); scripts[0].dispatchEvent(new Event("error"));
      await assert.rejects(() => failed, /LOAD_FAILED/); assert.equal(scripts.length, 0);
      const loaded = loadNicepaySdk(NICEPAY_ENDPOINTS.sandbox.sdk);
      assert.equal(loadNicepaySdk(NICEPAY_ENDPOINTS.sandbox.sdk), loaded);
      await assert.rejects(() => loadNicepaySdk("https://sandbox-pay.nicepay.co.kr/v1/js/"), /URL_INVALID/);
      assert.equal(scripts.length, 1); assert.equal(scripts[0].src, NICEPAY_ENDPOINTS.sandbox.sdk);
      fakeWindow.AUTHNICE = { requestPay() {} }; scripts[0].dispatchEvent(new Event("load")); await loaded;
    } finally {
      if (oldWindow === undefined) delete globals.window; else globals.window = oldWindow;
      if (oldDocument === undefined) delete globals.document; else globals.document = oldDocument;
    }
    console.log("nicepay environment: official SDK allowlist, isolated API/keys, sandbox blocked in production, disabled checkout, signature, mixed-environment rejection and SDK retry passed (no external calls)");
  } finally {
    globalThis.fetch = fetchBefore;
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
