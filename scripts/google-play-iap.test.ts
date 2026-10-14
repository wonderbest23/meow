import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { GooglePlayIapError, consumeGooglePurchase, googlePlayConfigured, verifyGooglePurchase } from "../lib/payments/google-play-iap";

/*
 * 구글 플레이 인앱결제 확인 — 가짜 구글 서버(fetch)로 접근 토큰·구매 조회·소모 처리를 확인한다.
 * 서비스 계정 키는 시험 중에 새로 만든 가짜 키다.
 */
async function main() {
  delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  assert.equal(googlePlayConfigured(), false);
  await assert.rejects(verifyGooglePurchase({ packageName: "com.oneulstart.app", productId: "oneulstart.plan", purchaseToken: "t", accountId: "a" }), (e: unknown) => e instanceof GooglePlayIapError && e.code === "PLAY_NOT_CONFIGURED" && e.status === 503);

  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "play@test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  assert.equal(googlePlayConfigured(), true);

  const calls: string[] = [];
  const fake = (purchase: Record<string, unknown>, status = 200): typeof fetch => (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push(`${init?.method ?? "GET"} ${href.replace(/^https:\/\/[^/]+/, "")}`);
    if (href.startsWith("https://oauth2.googleapis.com/token")) {
      const body = String(init?.body);
      assert.match(body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
      return new Response(JSON.stringify({ access_token: "ya29.test" }), { status: 200 });
    }
    assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer ya29.test");
    return new Response(JSON.stringify(purchase), { status });
  }) as typeof fetch;

  const input = { packageName: "com.oneulstart.app", productId: "oneulstart.bundle", purchaseToken: "token-1", accountId: "acct-1" };
  const ok = await verifyGooglePurchase(input, fake({ orderId: "GPA.1234-5678", purchaseState: 0, consumptionState: 0, obfuscatedExternalAccountId: "acct-1" }));
  assert.equal(ok.transactionId, "GPA.1234-5678");
  assert.equal(ok.environment, "Production");
  assert.match(calls.at(-1)!, /^GET \/androidpublisher\/v3\/applications\/com\.oneulstart\.app\/purchases\/products\/oneulstart\.bundle\/tokens\/token-1$/);

  // 시험 결제: 주문 번호가 없으면 구매 토큰으로 같은 번호를 만든다
  const test1 = await verifyGooglePurchase(input, fake({ purchaseState: 0, purchaseType: 0, obfuscatedExternalAccountId: "acct-1" }));
  const test2 = await verifyGooglePurchase(input, fake({ purchaseState: 0, purchaseType: 0, obfuscatedExternalAccountId: "acct-1" }));
  assert.equal(test1.environment, "Test");
  assert.equal(test1.transactionId, test2.transactionId);

  const rejects = (purchase: Record<string, unknown>, code: string, status = 200) =>
    assert.rejects(verifyGooglePurchase(input, fake(purchase, status)), (e: unknown) => e instanceof GooglePlayIapError && e.code === code, code);
  await rejects({ orderId: "GPA.1", purchaseState: 0, obfuscatedExternalAccountId: "someone-else" }, "PLAY_ACCOUNT_MISMATCH");
  await rejects({ orderId: "GPA.1", purchaseState: 2, obfuscatedExternalAccountId: "acct-1" }, "PLAY_PENDING");
  await rejects({ orderId: "GPA.1", purchaseState: 1, obfuscatedExternalAccountId: "acct-1" }, "PLAY_NOT_PURCHASED");
  await rejects({}, "PLAY_PURCHASE_NOT_FOUND", 404);

  // 소모 처리: 아직이면 :consume 을 부르고, 이미 소모됐으면 부르지 않는다
  calls.length = 0;
  await consumeGooglePurchase({ ...input, accessToken: "ya29.test", consumptionState: 0 }, fake({}));
  assert.match(calls[0], /^POST .*\/tokens\/token-1:consume$/);
  calls.length = 0;
  await consumeGooglePurchase({ ...input, accessToken: "ya29.test", consumptionState: 1 }, fake({}));
  assert.equal(calls.length, 0);

  console.log("google-play-iap: service-account token, purchase lookup, account binding, pending/cancel/not-found, consume passed");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
