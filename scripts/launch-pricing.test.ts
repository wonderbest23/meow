import assert from "node:assert/strict";
import { BUNDLE_PRODUCT_AMOUNT, BUNDLE_PRODUCT_NAME, HOMEPAGE_PRODUCT_AMOUNT, PACKAGE_AMOUNT } from "../lib/payments/domain";
import { planPrice, PLAN_TYPE_PRICING, productAmount, productName } from "../lib/payments/plan-orders";
import { createLegalDocument, defaultPlatformLegalSettings } from "../lib/platform-legal/domain";

// 출시 기념가: 계획서 49,000 / 홈페이지 69,000 / 묶음 99,000
assert.equal(PACKAGE_AMOUNT, 49_000);
assert.equal(HOMEPAGE_PRODUCT_AMOUNT, 69_000);
assert.equal(BUNDLE_PRODUCT_AMOUNT, 99_000);
// 묶음이 따로 사는 것보다 싸야 주력 상품이 된다
assert.ok(BUNDLE_PRODUCT_AMOUNT < PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT);
// 모든 문서 유형과 기본가가 같은 가격을 따른다
for (const price of Object.values(PLAN_TYPE_PRICING)) assert.equal(price, PACKAGE_AMOUNT);
assert.equal(planPrice("없는 유형"), PACKAGE_AMOUNT);
assert.equal(productAmount("plan", "창업 초기 · 사업계획서"), PACKAGE_AMOUNT);
assert.equal(productAmount("homepage", ""), HOMEPAGE_PRODUCT_AMOUNT);
assert.equal(productAmount("bundle", ""), BUNDLE_PRODUCT_AMOUNT);
assert.equal(productName("bundle"), BUNDLE_PRODUCT_NAME);
// 공개 문서(약관·사업자 정보)의 가격도 같은 값을 쓴다
const terms = JSON.stringify(createLegalDocument("terms", defaultPlatformLegalSettings));
for (const text of ["49,000원", "69,000원", "사업계획서 + 홈페이지: 99,000원"]) assert.ok(terms.includes(text), text);
assert.ok(!terms.includes("149,000원"));

console.log(JSON.stringify({ passed: 16 }));
