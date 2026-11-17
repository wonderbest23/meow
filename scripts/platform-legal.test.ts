import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyCurrentPlatformPolicy, countryNamesKo, createLegalDocument, defaultPlatformLegalSettings, evaluatePlatformLaunchReadiness, formatRoadAddress, platformLegalSettingsSchema } from "../lib/platform-legal/domain";
import { ftcBusinessCheckUrl } from "../lib/platform-legal/footer";
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
assert.ok(business.sections.some((section) => section.items?.some((item) => item.includes("49,000원"))));
const businessText = JSON.stringify(business);
assert.ok(!businessText.includes("카카오뱅크 계좌이체"), "받지 않는 결제 수단을 안내하지 않는다");
for (const expected of ["신용·체크카드", "나이스페이먼츠", "49,000원", "19,000원", "사업계획서 + 홈페이지: 59,000원", "59,000원", "다시 생성 10회 추가: 9,900원"]) assert.ok(businessText.includes(expected), expected);
// 오픈 범위(2026-10-08): 팔지 않는 상품(AI 수정 토큰·맞춤 홈페이지 제작)은 판매 목록에 없다. 토큰 묶음은 다시 생성 묶음과 값이 같아(9,900원) 이름으로 본다
for (const closed of ["홈페이지 AI 수정 토큰 20만", "맞춤 홈페이지 제작", "홈페이지 AI 수정 토큰, 맞춤 홈페이지 디자인"]) assert.ok(!businessText.includes(closed), closed);
const ai = createLegalDocument("ai", complete);
assert.ok(ai.sections.some((section) => section.items?.some((item) => item.includes("미국, 대한민국"))));
const privacy = createLegalDocument("privacy", complete);
assert.ok(privacy.sections.some((section) => section.title.includes("개인정보")));
const privacyText = JSON.stringify(privacy);
for (const expected of ["나이스페이먼츠", "승인번호", "수집·저장하지 않습니다", "Resend"]) assert.ok(privacyText.includes(expected), expected);
assert.ok(!privacyText.includes("현재 대금은 안내된 계좌로 직접 이체받고"));
for (const expected of ["5년 (전자상거래", "3개월 (통신비밀보호법)", "1833-6972", "118", "1301", "182", "2026-09-28 시행", "2026-10-05 시행", "2026-10-14 시행", "카카오·구글·애플", "앱 안 결제", "Google LLC(Google Play 결제 확인)", "제3자에게 제공하지 않습니다", "카카오·구글", "privacy@supabase.com", "privacyquestions@cloudflare.com", "support@resend.com", "홈페이지 운영자(이용자)"]) assert.ok(privacyText.includes(expected), expected);
assert.ok(JSON.stringify(ai).includes("anthropic_privacy@kimchang.com"));
const terms = JSON.stringify(createLegalDocument("terms", complete));
for (const expected of ["충전일부터 1년", "도메인 등록(구매)은 이용자가"]) assert.ok(terms.includes(expected), expected);
// 약관 4항에 AI 수정 토큰 가격이 있다(새로 팔지 않는 상품이라 이미 충전한 토큰의 기준으로) — 사업자 정보의 판매 목록에는 없다
assert.ok(terms.includes("AI 수정 토큰: 지금은 새로 판매하지 않습니다. 이미 충전한 토큰은 20만 토큰 9,900원(부가세 포함) 기준"), "terms state the token price");
assert.ok(!businessText.includes("AI 수정 토큰: 지금은"), "the business-info sales list does not list tokens");
// 앱 안에서 여는 안내는 스토어 결제만 말한다(App Store 3.1.1 — 앱 안에서 카드·웹 결제를 안내하지 않는다)
const appBusiness = JSON.stringify(createLegalDocument("business", complete, { inApp: true }));
const appTerms = JSON.stringify(createLegalDocument("terms", complete, { inApp: true }));
for (const text of [appBusiness, appTerms]) {
  assert.ok(text.includes("App Store"), "app documents name the store payment");
  assert.ok(!/결제 방법: [^"]*(카드|나이스)/.test(text), "app documents do not list card payment as a way to pay");
}
assert.ok(terms.includes("Google Play"), "the web terms also say how the apps take payment");
const refund = createLegalDocument("refund", complete);
assert.match(refund.summary, /단순 변심 환불이 제한/);
assert.ok(refund.sections.some((section) => section.paragraphs?.some((paragraph) => paragraph.includes("표시·광고 또는 계약 내용과 다르게"))));
const refundText = JSON.stringify(refund);
for (const expected of ["reportaproblem.apple.com", "44,250원", "5,940원", "연결을 완료한 날부터 7일 이내", "충전일부터 1년", "승인 취소", "3영업일 이내"]) assert.ok(refundText.includes(expected), expected);
const upgradedPolicy = applyCurrentPlatformPolicy({ ...complete, policyEffectiveDate: "2026-07-19", refundAfterSupply: "이전 기준" });
assert.equal(upgradedPolicy.policyEffectiveDate, "2026-11-17");
assert.match(upgradedPolicy.serviceSupplyTiming, /NicePay/);
assert.match(upgradedPolicy.refundAfterSupply, /단순 변심/);

// 환불 기준은 '작성이 시작되기 전(시작 못 함·실패)/시작된 뒤' 하나(대표 결정 2026-11-17, 결제하면 바로 작성 시작) — 예전 '결제 승인 즉시 제공'·'생성이 시작되지 않았으면'이 함께 있어 모호했다
const ONE_RULE_BEFORE = "작성이 시작되지 못했거나 작성이 실패하면 전액 환불됩니다";
const ONE_RULE_AFTER = "작성이 시작된 뒤에는 AI 작성 비용이 들어 환불되지 않습니다";
assert.ok(refundText.includes(ONE_RULE_BEFORE) && refundText.includes(ONE_RULE_AFTER), "refund page states the one rule");
assert.ok(terms.includes(ONE_RULE_AFTER) && terms.includes("결제 후 사업계획서 작성이 시작된 때가"), "terms use the same moment");
assert.ok(businessText.includes(ONE_RULE_BEFORE), "business-info refund check uses the same rule");
for (const text of [refundText, terms, businessText]) {
  assert.ok(!text.includes("생성이 실제로 시작되지 않았다면"), "the old 'generation not started' rule is gone");
  assert.ok(!text.includes("결제 승인(앱 안 결제는 스토어 결제 확인)이 맞춤 디지털 결과물 제공 개시 시점"), "payment approval is no longer the refund moment");
  assert.ok(text.includes("제17조 제2항") || text === businessText, "the e-commerce act withdrawal limit stays");
}
const appRefund = JSON.stringify(createLegalDocument("refund", complete, { inApp: true }));
assert.ok(appRefund.includes("작성이 시작되지 못했거나 실패했다면 전액 환불 대상") && appRefund.includes("App Store"), "app refund page keeps the store path with the same rule");
for (const path of ["app/plan/pay/PlanCheckout.tsx", "lib/support-chat/faq.ts"]) {
  const source = readFileSync(path, "utf8");
  assert.ok(source.includes("작성이 시작되지 못했거나 실패하면 전액 환불"), `${path}: 결제 화면·자주 묻는 질문도 같은 기준`);
  assert.ok(!source.includes("인공지능 작성이 시작되기 전에는") && !source.includes("결제가 승인되면 바로 내 사업에 맞춘"), `${path}: 예전 환불 기준 문구가 남았다`);
}

// 공개 문서 표기 — 처리 국가는 한국어, 도로명 주소는 건물번호 앞을 띄운다, 닫힌 기능(로고 이미지 생성)은 말하지 않는다(점검 2026-11-16)
assert.equal(countryNamesKo("usa, singapore"), "미국, 싱가포르");
assert.equal(countryNamesKo("싱가포르, 대한민국, 미국"), "싱가포르, 대한민국, 미국");
assert.equal(formatRoadAddress("서울특별시 마포구 독막로6길9"), "서울특별시 마포구 독막로6길 9");
assert.equal(formatRoadAddress("서울특별시 테스트구 테스트로 1"), "서울특별시 테스트구 테스트로 1");
const rawSettings = { ...complete, overseasCountries: "usa, singapore", infrastructureCountries: "usa", businessAddress: "서울특별시 마포구 독막로6길9" };
const rawAi = JSON.stringify(createLegalDocument("ai", rawSettings));
const rawPrivacy = JSON.stringify(createLegalDocument("privacy", rawSettings));
assert.ok(rawAi.includes("처리 국가: 미국, 싱가포르") && !/usa|singapore/i.test(rawAi), "AI notice shows Korean country names");
assert.ok(!/국가: usa|국가 usa/i.test(rawPrivacy), "privacy policy shows Korean country names");
assert.ok(JSON.stringify(createLegalDocument("business", rawSettings)).includes("독막로6길 9"), "business info spaces the building number");
assert.ok(!rawAi.includes("로고 이미지 생성"), "the closed logo-image feature is not mentioned");
assert.match(readFileSync("wrangler.jsonc", "utf8"), /"PLATFORM_BUSINESS_ADDRESS": "서울특별시 마포구 독막로6길 9"/);

// 인공지능기본법 제31조 링크 — 예전 lsSideInfoP 주소가 404 였다. 법 이름 주소로(국가법령정보센터)
for (const path of ["components/platform-legal-page.tsx", "app/plan/info/page.tsx"]) {
  const source = readFileSync(path, "utf8");
  assert.ok(source.includes("https://www.law.go.kr/법령/인공지능발전과신뢰기반조성등에관한기본법/제31조"), `${path}: 인공지능기본법 제31조 링크`);
  assert.ok(!source.includes("lsiSeq=282791"), `${path}: 404 나던 예전 링크가 남았다`);
}

// 첫 화면 바닥글 — 사업자 정보는 서버가 첫 HTML 에 그리고(늦게 불러오지 않음) 처음부터 펼쳐 두며, 공정위 사업자정보 확인 링크를 붙인다
assert.equal(ftcBusinessCheckUrl("186-17-01752"), "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=1861701752");
assert.equal(ftcBusinessCheckUrl(""), null);
assert.equal(ftcBusinessCheckUrl("123-45"), null);
const homePage = readFileSync("app/home-page.tsx", "utf8");
const homeServer = readFileSync("app/page.tsx", "utf8");
assert.match(homeServer, /export const dynamic = "force-dynamic"/, "home footer reads the live settings on the server");
assert.match(homeServer, /<HomePage business=\{business\} \/>/, "the server passes the business info to the home page");
assert.match(homePage, /<details className="home-footer-details" open>/, "footer details start open");
assert.match(homePage, /ftcBusinessCheckUrl\(/, "footer links the FTC business check");
assert.doesNotMatch(homePage, /사업자 정보를 불러오고 있어요|\/api\/platform\/readiness/, "footer no longer loads the business info late");

process.env.AUTH_PROJECT_SECRET = "test-secret-that-is-long-enough-for-a-stable-hmac";
const firstHash = hashIdentityToken(userProjectToken("user-a"));
const secondHash = hashIdentityToken(userProjectToken("user-a"));
const otherHash = hashIdentityToken(userProjectToken("user-b"));
assert.equal(firstHash, secondHash);
assert.notEqual(firstHash, otherHash);

console.log(JSON.stringify({ passed: 57, missingBeforeLaunch: draftReadiness.missing.length, documents: [business.title, ai.title, privacy.title, refund.title], stableAccountProjectAccess: true }, null, 2));
