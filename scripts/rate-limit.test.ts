import assert from "node:assert/strict";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  delete process.env.RATE_LIMIT_BACKEND;
  const { clientKey, enforceRateLimit, rateLimit } = await import("../lib/rate-limit");

  for (let i = 0; i < 3; i += 1) {
    assert.equal(rateLimit("t", "k", { limit: 3, windowMs: 50 }).ok, true, `hit ${i} allowed`);
  }
  const blocked = rateLimit("t", "k", { limit: 3, windowMs: 50 });
  assert.equal(blocked.ok, false, "4th blocked");
  assert.ok(blocked.retryAfterSeconds >= 1, "retry-after set");

  // Independent keys and buckets.
  assert.equal(rateLimit("t", "k2", { limit: 3, windowMs: 50 }).ok, true, "other key independent");
  assert.equal(rateLimit("other-bucket", "k", { limit: 3, windowMs: 50 }).ok, true, "other bucket independent");

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(rateLimit("t", "k", { limit: 3, windowMs: 50 }).ok, true, "window resets");

  // clientKey header precedence.
  assert.equal(
    clientKey(new Request("http://x", { headers: { "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" } })),
    "1.2.3.4",
  );
  assert.equal(clientKey(new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 8.8.8.8" } })), "9.9.9.9");
  assert.equal(clientKey(new Request("http://x")), "unknown");

  // enforceRateLimit end-to-end (in-memory backend): null while allowed, 429 once exceeded.
  const req = new Request("http://x", { headers: { "cf-connecting-ip": "5.5.5.5" } });
  const opts = { limit: 2, windowMs: 1_000, key: "enforce-test" };
  assert.equal(await enforceRateLimit("e2e", req, opts), null, "1st allowed");
  assert.equal(await enforceRateLimit("e2e", req, opts), null, "2nd allowed");
  const blockedResponse = await enforceRateLimit("e2e", req, opts);
  assert.ok(blockedResponse, "3rd blocked returns a Response");
  assert.equal(blockedResponse!.status, 429, "blocked status is 429");
  assert.ok(blockedResponse!.headers.get("Retry-After"), "Retry-After header present");

  console.log("rate-limit: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
