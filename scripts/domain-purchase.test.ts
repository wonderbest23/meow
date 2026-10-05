import assert from "node:assert/strict";
import { availabilityFromStatus, normalizePurchaseDomain, rdapUrl, readDomainRequest } from "../lib/landing/domain-purchase";
import { productAmount, productName, summarizeDomainOrders } from "../lib/payments/plan-orders";
import { DOMAIN_PRODUCT_AMOUNT, DOMAIN_PRODUCT_NAME, DOMAIN_PURCHASE_PRODUCT_AMOUNT, DOMAIN_PURCHASE_PRODUCT_NAME, DOMAIN_PURCHASE_REGISTRATION_AMOUNT } from "../lib/payments/domain";
import { createLegalDocument, defaultPlatformLegalSettings } from "../lib/platform-legal/domain";

// 주소 정리: www·http·경로를 떼고, .com·.kr·.co.kr 한 단계 이름만
assert.equal(normalizePurchaseDomain("MyBrand.co.kr"), "mybrand.co.kr");
assert.equal(normalizePurchaseDomain("https://www.mybrand.com/about"), "mybrand.com");
assert.equal(normalizePurchaseDomain(" toegeun-dental.kr "), "toegeun-dental.kr");
assert.equal(normalizePurchaseDomain("mybrand.net"), null, "파는 끝자리가 아님");
assert.equal(normalizePurchaseDomain("shop.mybrand.com"), null, "하위 주소");
assert.equal(normalizePurchaseDomain("-mybrand.com"), null);
assert.equal(normalizePurchaseDomain("my--brand.com"), null);
assert.equal(normalizePurchaseDomain("우리가게.com"), null, "한글 주소는 아직 받지 않음");
assert.equal(normalizePurchaseDomain("a.kr"), null, "너무 짧음");
assert.equal(normalizePurchaseDomain(""), null);

// 등록 여부(RDAP): .com 은 Verisign, .kr·.co.kr 은 KISA
assert.equal(rdapUrl("mybrand.com"), "https://rdap.verisign.com/com/v1/domain/mybrand.com");
assert.equal(rdapUrl("mybrand.co.kr"), "https://rdap.nic.or.kr/domain/mybrand.co.kr");
assert.equal(rdapUrl("mybrand.kr"), "https://rdap.nic.or.kr/domain/mybrand.kr");
assert.equal(availabilityFromStatus(404), "available");
assert.equal(availabilityFromStatus(200), "taken");
assert.equal(availabilityFromStatus(429), "unknown");

assert.deepEqual(readDomainRequest({ domain: "www.MyBrand.com", status: "registered", registeredAt: "2026-10-01T00:00:00Z" }), { domain: "mybrand.com", status: "registered", registeredAt: "2026-10-01T00:00:00Z" });
assert.deepEqual(readDomainRequest({ domain: "mybrand.kr" }), { domain: "mybrand.kr", status: "requested" });
assert.equal(readDomainRequest({ domain: "bad" }), null);
assert.equal(readDomainRequest(null), null);

// 상품: 79,000원 = 연결·호스팅 59,000원 + 첫해 등록비 20,000원
assert.equal(productAmount("domain-purchase", ""), 79_000);
assert.equal(productName("domain-purchase"), DOMAIN_PURCHASE_PRODUCT_NAME);
assert.equal(DOMAIN_PURCHASE_PRODUCT_AMOUNT - DOMAIN_PURCHASE_REGISTRATION_AMOUNT, DOMAIN_PRODUCT_AMOUNT);
assert.equal(DOMAIN_PURCHASE_REGISTRATION_AMOUNT, 20_000);

// 연결 권한: 두 상품 모두 1년. 구매 대행은 가장 최근 주문의 주소·상태를 알려 준다
const now = Date.parse("2026-10-01T00:00:00Z");
const row = (name: string, planId: string, confirmedAt: string, domainRequest?: unknown, orderId = "o1") => ({ order_id: orderId, order_name: name, opportunity: { planId, ...(domainRequest ? { domainRequest } : {}) }, confirmed_at: confirmedAt, created_at: confirmedAt });
let summary = summarizeDomainOrders([row(DOMAIN_PURCHASE_PRODUCT_NAME, "plan_a", "2026-09-30T00:00:00Z", { domain: "mybrand.co.kr", status: "requested" })], "plan_a", now);
assert.equal(summary.active, true);
assert.equal(summary.expiresAt, "2027-09-30T00:00:00.000Z");
assert.deepEqual(summary.purchase, { domain: "mybrand.co.kr", status: "requested", orderId: "o1", paidAt: "2026-09-30T00:00:00Z" });
summary = summarizeDomainOrders([row(DOMAIN_PRODUCT_NAME, "plan_a", "2026-09-30T00:00:00Z")], "plan_a", now);
assert.equal(summary.active, true, "직접 산 도메인 연결 상품");
assert.equal(summary.purchase, null);
summary = summarizeDomainOrders([row(DOMAIN_PURCHASE_PRODUCT_NAME, "plan_b", "2026-09-30T00:00:00Z", { domain: "other.com" })], "plan_a", now);
assert.deepEqual(summary, { active: false, expiresAt: null, purchase: null }, "다른 사업의 주문은 세지 않는다");
summary = summarizeDomainOrders([
  row(DOMAIN_PURCHASE_PRODUCT_NAME, "plan_a", "2025-09-01T00:00:00Z", { domain: "old.com", status: "registered" }, "o-old"),
  row(DOMAIN_PURCHASE_PRODUCT_NAME, "plan_a", "2026-09-01T00:00:00Z", { domain: "mybrand.com", status: "registered" }, "o-new"),
], "plan_a", now);
assert.equal(summary.purchase?.orderId, "o-new", "가장 최근 주문");
assert.equal(summary.expiresAt, "2027-09-01T00:00:00.000Z");
// 만료 30일 전에 갱신해도 남은 30일은 사라지지 않는다 — 새 1년은 기존 만료일부터
summary = summarizeDomainOrders([
  row(DOMAIN_PRODUCT_NAME, "plan_a", "2025-10-31T00:00:00Z"),
  row(DOMAIN_PRODUCT_NAME, "plan_a", "2026-10-01T00:00:00Z"),
], "plan_a", now);
assert.equal(summary.expiresAt, new Date(Date.parse("2025-10-31T00:00:00Z") + 2 * 365 * 86_400_000).toISOString(), "조기 갱신은 이어 붙인다");
summary = summarizeDomainOrders([row(DOMAIN_PURCHASE_PRODUCT_NAME, "plan_a", "2025-01-01T00:00:00Z", { domain: "mybrand.com", status: "registered" })], "plan_a", now);
assert.equal(summary.active, false, "1년 지나면 만료(갱신 안내)");
assert.equal(summary.purchase?.domain, "mybrand.com", "만료돼도 어떤 주소였는지는 안다(갱신 링크)");

// 약관·환불·개인정보에 새 상품이 보인다
const text = (type: Parameters<typeof createLegalDocument>[0]) => JSON.stringify(createLegalDocument(type, defaultPlatformLegalSettings));
assert.ok(text("terms").includes(DOMAIN_PURCHASE_PRODUCT_NAME) && text("terms").includes("79,000원"), "이용약관 상품·가격");
assert.ok(text("terms").includes("이용자 명의"), "등록 명의");
assert.ok(text("refund").includes("20,000원"), "등록 후 등록비는 환불 제외");
assert.ok(text("privacy").includes("도메인 등록기관"), "등록기관 제공");

console.log("domain-purchase: normalize, RDAP, product price, entitlement summary, legal text");
