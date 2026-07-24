import assert from "node:assert/strict";

async function main() {
  process.env.ADMIN_CHAT_PASSWORD = "super-secret-admin-pw";
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_PAYMENTS_PASSWORD;

  const {
    ADMIN_SESSION_TTL_MS,
    isScopeConfigured,
    paymentsHasOwnCredential,
    resolveScope,
    signAdminSessionToken,
    verifyAdminSessionToken,
  } = await import("../lib/support-chat/admin-session");

  assert.equal(isScopeConfigured("support"), true, "8+ char support password configured");

  // Round-trip: a freshly signed support token verifies.
  const token = await signAdminSessionToken("support");
  assert.equal(token.split(".").length, 3, "token has three parts");
  assert.equal(await verifyAdminSessionToken(token, "support"), true, "fresh token verifies");

  // Distinct tokens per login (nonce).
  assert.notEqual(token, await signAdminSessionToken("support"), "each login is distinct");

  // Expiry + future-dating.
  const expired = await signAdminSessionToken("support", Date.now() - ADMIN_SESSION_TTL_MS - 1000);
  assert.equal(await verifyAdminSessionToken(expired, "support"), false, "expired rejected");
  const future = await signAdminSessionToken("support", Date.now() + 5 * 60_000);
  assert.equal(await verifyAdminSessionToken(future, "support"), false, "future rejected");

  // Tamper + garbage.
  const [, nonce, sig] = token.split(".");
  assert.equal(await verifyAdminSessionToken(`${Date.now()}.${nonce}.${sig}`, "support"), false, "tampered rejected");
  assert.equal(await verifyAdminSessionToken("", "support"), false);
  assert.equal(await verifyAdminSessionToken("a.b.c", "support"), false);
  assert.equal(await verifyAdminSessionToken(undefined, "support"), false);

  // Scope fallback: without a dedicated payments password, payments collapses to support.
  assert.equal(paymentsHasOwnCredential(), false, "no dedicated payments credential yet");
  assert.equal(resolveScope("payments"), "support", "payments falls back to support");

  // With a dedicated payments credential, scopes are isolated.
  process.env.ADMIN_PAYMENTS_PASSWORD = "distinct-payments-password";
  assert.equal(paymentsHasOwnCredential(), true);
  assert.equal(resolveScope("payments"), "payments");
  const paymentsToken = await signAdminSessionToken("payments");
  assert.equal(await verifyAdminSessionToken(paymentsToken, "payments"), true, "payments token verifies");
  // Cross-scope: a support token must NOT be accepted as payments, and vice versa.
  const supportToken = await signAdminSessionToken("support");
  assert.equal(await verifyAdminSessionToken(supportToken, "payments"), false, "support token rejected for payments");
  assert.equal(await verifyAdminSessionToken(paymentsToken, "support"), false, "payments token rejected for support");

  // Secret rotation invalidates existing tokens.
  process.env.ADMIN_SESSION_SECRET = "a-dedicated-rotation-secret-value";
  assert.equal(await verifyAdminSessionToken(supportToken, "support"), false, "rotation invalidates old token");
  assert.equal(await verifyAdminSessionToken(await signAdminSessionToken("support"), "support"), true, "new token verifies");

  // Unconfigured scope rejects everything.
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_PAYMENTS_PASSWORD;
  process.env.ADMIN_CHAT_PASSWORD = "short";
  assert.equal(isScopeConfigured("support"), false);
  assert.equal(await verifyAdminSessionToken(token, "support"), false, "unconfigured verifies nothing");

  console.log("admin-session: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
