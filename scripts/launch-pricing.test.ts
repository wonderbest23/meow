import assert from "node:assert/strict";
import { ALLOWANCE_TERMS_FROM, BUNDLE_PRODUCT_AMOUNT, BUNDLE_PRODUCT_NAME, HOMEPAGE_PRODUCT_AMOUNT, isCurrentAllowanceTerms, LEGACY_REGEN_INCLUDED, PACKAGE_AMOUNT, REGEN_INCLUDED, REGEN_PACK_AMOUNT, TERMS_VERSION } from "../lib/payments/domain";
import { planPrice, PLAN_TYPE_PRICING, productAmount, productName } from "../lib/payments/plan-orders";
import { createLegalDocument, defaultPlatformLegalSettings } from "../lib/platform-legal/domain";

// 가격 개편(2026-10-09): 계획서 49,000 / 홈페이지(계획서 구매자 전용) 19,000 / 묶음 59,000 / 다시 생성 10회 9,900
assert.equal(PACKAGE_AMOUNT, 49_000);
assert.equal(HOMEPAGE_PRODUCT_AMOUNT, 19_000);
assert.equal(BUNDLE_PRODUCT_AMOUNT, 59_000);
assert.equal(REGEN_PACK_AMOUNT, 9_900);
assert.equal(REGEN_INCLUDED, 10);
assert.equal(LEGACY_REGEN_INCLUDED, 20);
assert.equal(TERMS_VERSION.slice(0, 10), ALLOWANCE_TERMS_FROM);
// 포함량은 결제 때 동의한 약관 버전으로 정한다 — 개편 전 주문(또는 버전 없음)은 예전 조건
assert.equal(isCurrentAllowanceTerms(TERMS_VERSION), true);
assert.equal(isCurrentAllowanceTerms("2026-11-01-later"), true);
assert.equal(isCurrentAllowanceTerms("2026-09-30-domain-purchase"), false);
assert.equal(isCurrentAllowanceTerms(null), false);
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
for (const text of ["49,000원", "19,000원", "사업계획서 + 홈페이지: 59,000원", "같은 사업의 사업계획서를 결제한 경우에만", "다시 생성 10회 추가: 9,900원", "무료로 써 보는 체험은 제공하지 않습니다"]) assert.ok(terms.includes(text), text);
for (const stale of ["69,000원", "99,000원", "4,900원", "무료 체험은 사업자등록"]) assert.ok(!terms.includes(stale), stale);
assert.ok(!terms.includes("149,000원"));

console.log(JSON.stringify({ passed: 31 }));
