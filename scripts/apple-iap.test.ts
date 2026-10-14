import assert from "node:assert/strict";
import { X509Certificate, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { AppleIapError, appAccountTokenFor, verifyAppleTransaction } from "../lib/payments/apple-iap";

/*
 * 애플 인앱결제 영수증 확인 — 시험용 가짜 인증서 사슬(scripts/fixtures/apple-iap, 애플 인증서와 같은 OID 를 넣음)로
 * 서명·사슬·내용 검사를 확인한다. 진짜 루트 지문 대신 시험 루트 지문을 넘긴다.
 */
const dir = "scripts/fixtures/apple-iap";
const pem = (name: string) => readFileSync(`${dir}/${name}`, "utf8");
const der = (name: string) => new X509Certificate(pem(name)).raw.toString("base64");
const rootFp = new X509Certificate(pem("root.pem")).fingerprint256;
const leafKey = pem("leaf.pk8");
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function jws(payload: Record<string, unknown>, chain = [der("leaf.pem"), der("mid.pem"), der("root.pem")], key = leafKey) {
  const head = b64({ alg: "ES256", x5c: chain });
  const body = b64(payload);
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${signature}`;
}

const account = appAccountTokenFor("user-1");
assert.match(account, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "UUID v5 shape (StoreKit requires a UUID)");
assert.equal(appAccountTokenFor("user-1"), account, "same user → same token");
assert.notEqual(appAccountTokenFor("user-2"), account);

const good = { transactionId: "2000000123456789", originalTransactionId: "2000000123456789", bundleId: "com.oneulstart.app", productId: "oneulstart.bundle", type: "Consumable", environment: "Sandbox", appAccountToken: account, purchaseDate: Date.now(), price: 59000000, currency: "KRW" };
const expect = { bundleId: "com.oneulstart.app", productId: "oneulstart.bundle", appAccountToken: account };
const check = (token: string, e = expect, fp = rootFp) => verifyAppleTransaction(token, e, new Date(), fp);
const fails = (fn: () => unknown, code: string) => assert.throws(fn, (error: unknown) => error instanceof AppleIapError && error.code === code, code);

// 맞는 영수증
assert.equal(check(jws(good)).transactionId, "2000000123456789");
// 루트가 애플이 아니면(기본값 = 진짜 애플 G3 지문) 거른다
fails(() => verifyAppleTransaction(jws(good), expect), "APPLE_ROOT_MISMATCH");
// 내용을 바꾸면 서명이 맞지 않는다
const [h, , s] = jws(good).split(".");
fails(() => check(`${h}.${b64({ ...good, productId: "oneulstart.plan" })}.${s}`), "APPLE_SIGNATURE_INVALID");
// 사슬 순서가 틀리면(잎을 중간이 서명하지 않음) 거른다
fails(() => check(jws(good, [der("mid.pem"), der("leaf.pem"), der("root.pem")])), "APPLE_CHAIN_INVALID");
// 다른 앱·다른 상품·다른 계정·환불된 결제
fails(() => check(jws({ ...good, bundleId: "com.other.app" })), "APPLE_BUNDLE_MISMATCH");
fails(() => check(jws({ ...good, productId: "oneulstart.plan" })), "APPLE_PRODUCT_MISMATCH");
fails(() => check(jws({ ...good, appAccountToken: appAccountTokenFor("someone-else") })), "APPLE_ACCOUNT_MISMATCH");
fails(() => check(jws({ ...good, revocationDate: Date.now() })), "APPLE_REVOKED");
// 모양이 틀린 영수증
fails(() => check("not-a-jws"), "APPLE_JWS_MALFORMED");
fails(() => check(jws(good, [der("leaf.pem"), der("root.pem")])), "APPLE_JWS_HEADER");

console.log("apple-iap: chain to pinned root, ES256 signature, bundle/product/account/revocation checks passed");
