import assert from "node:assert/strict";
import { applyCurrentPlatformPolicy, createLegalDocument, defaultPlatformLegalSettings, evaluatePlatformLaunchReadiness, platformLegalSettingsSchema } from "../lib/platform-legal/domain";
import { hashIdentityToken, userProjectToken } from "../lib/identity-tokens";

const draftReadiness = evaluatePlatformLaunchReadiness(defaultPlatformLegalSettings, { authConfigured: true, paymentsConfigured: true });
assert.equal(draftReadiness.ready, false);
assert.equal(draftReadiness.paymentAllowed, false);
assert.equal(draftReadiness.siteOpen, false);
assert.ok(draftReadiness.missing.includes("대표자명"));
assert.ok(draftReadiness.missing.includes("실제 국외 처리 국가"));
assert.ok(draftReadiness.missing.includes("통신판매업 신고 완료 또는 신고 면제 근거"));

const complete = platformLegalSettingsSchema.parse({
  ...defaultPlatformLegalSettings,
  operatorName: "오늘창업 테스트",
  representativeName: "테스트 대표",
  businessRegistrationNumber: "123-45-67890",
  mailOrderStatus: "reported",
  mailOrderSalesNumber: "2026-서울테스트-0001",
  businessAddress: "서울특별시 테스트구 테스트로 1",
  supportEmail: "help@example.com",
  supportPhone: "02-0000-0000",
  privacyOfficer: "테스트 책임자",
  privacyEmail: "privacy@example.com",
  overseasCountries: "미국, 대한민국",
  infrastructureCountries: "싱가포르, 대한민국, 미국",
  openAiRegionConfirmed: true,
  infrastructureRegionConfirmed: true,
  authEmailDeliveryConfirmed: true,
  legalReviewConfirmed: true,
});

const freeReady = evaluatePlatformLaunchReadiness(complete, { authConfigured: true, paymentsConfigured: false });
assert.equal(freeReady.ready, true);
assert.equal(freeReady.paymentAllowed, false);
assert.equal(freeReady.siteOpen, true);
assert.equal(freeReady.commerceReportReady, true);
const paidReady = evaluatePlatformLaunchReadiness(complete, { authConfigured: true, paymentsConfigured: true });
assert.equal(paidReady.paymentAllowed, true);
assert.equal(evaluatePlatformLaunchReadiness(complete, { authConfigured: false, paymentsConfigured: true }).paymentAllowed, false);

const business = createLegalDocument("business", complete);
assert.ok(business.sections[0].items?.some((item) => item.includes("123-45-67890")));
assert.ok(business.sections.some((section) => section.items?.some((item) => item.includes("149,000원"))));
const ai = createLegalDocument("ai", complete);
assert.ok(ai.sections.some((section) => section.items?.some((item) => item.includes("미국, 대한민국"))));
const privacy = createLegalDocument("privacy", complete);
assert.ok(privacy.sections.some((section) => section.title.includes("개인정보")));
const refund = createLegalDocument("refund", complete);
assert.match(refund.summary, /단순 변심 환불이 제한/);
assert.ok(refund.sections.some((section) => section.paragraphs?.some((paragraph) => paragraph.includes("표시·광고 또는 계약 내용과 다르게"))));
const upgradedPolicy = applyCurrentPlatformPolicy({ ...complete, policyEffectiveDate: "2026-07-19", refundAfterSupply: "이전 기준" });
assert.equal(upgradedPolicy.policyEffectiveDate, "2026-07-23");
assert.match(upgradedPolicy.refundAfterSupply, /단순 변심/);

process.env.AUTH_PROJECT_SECRET = "test-secret-that-is-long-enough-for-a-stable-hmac";
const firstHash = hashIdentityToken(userProjectToken("user-a"));
const secondHash = hashIdentityToken(userProjectToken("user-a"));
const otherHash = hashIdentityToken(userProjectToken("user-b"));
assert.equal(firstHash, secondHash);
assert.notEqual(firstHash, otherHash);

console.log(JSON.stringify({ passed: 22, missingBeforeLaunch: draftReadiness.missing.length, documents: [business.title, ai.title, privacy.title, refund.title], stableAccountProjectAccess: true }, null, 2));
