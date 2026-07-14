import assert from "node:assert/strict";
import {
  applyLandingTemplate,
  createLandingDraft,
  inferLandingTemplate,
  landingDraftSchema,
  landingEventSchema,
  landingLeadSchema,
  landingPublicationIssues,
} from "../lib/landing/domain";

const draft = createLandingDraft({
  title: "초보 창업 테스트",
  oneLiner: "처음 시작하는 사람의 사업 준비를 간단하게 만듭니다.",
  customer: "예비 창업자",
  model: "온라인 맞춤 서비스",
});

assert.match(draft.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
assert.equal(landingDraftSchema.parse(draft).collectEmail, true);
assert.ok(landingPublicationIssues(draft).includes("개인정보 문의 연락처"));
assert.ok(landingPublicationIssues({ ...draft, privacyContact: "privacy@sample.kr" }).includes("테스트·예시 데이터 제거"));
const publishable = createLandingDraft({
  title: "첫 사업 안내",
  oneLiner: "처음 시작하는 사람의 사업 준비를 간단하게 만듭니다.",
  customer: "예비 창업자",
  model: "온라인 맞춤 서비스",
});
assert.equal(landingPublicationIssues({ ...publishable, privacyContact: "privacy@sample.kr" }).length, 0);
assert.equal(inferLandingTemplate("온라인 교육"), "class");
assert.equal(inferLandingTemplate("동네 미용실"), "local");
assert.equal(inferLandingTemplate("화장품 제조 판매"), "product");
assert.equal(applyLandingTemplate(publishable, "product").templateId, "product");
assert.ok(applyLandingTemplate(publishable, "product").heroImageUrl.includes("images.unsplash.com"));

const brochure = {
  ...publishable,
  leadCaptureEnabled: false,
  privacyContact: "",
};
assert.equal(landingPublicationIssues(brochure).length, 0, "개인정보를 받지 않는 소개 홈페이지는 바로 공개할 수 있어야 합니다.");

const transactionIssues = landingPublicationIssues({
  ...publishable,
  pageMode: "transaction",
  leadCaptureEnabled: false,
});
assert.ok(transactionIssues.includes("대표자 성명"));
assert.ok(transactionIssues.includes("사업자등록번호"));
assert.ok(transactionIssues.includes("청약철회·교환·환불 조건"));

const transactionReady = {
  ...publishable,
  pageMode: "transaction" as const,
  leadCaptureEnabled: false,
  businessRepresentative: "김대표",
  businessAddress: "서울특별시 중구 세종대로 1",
  businessPhone: "02-1234-5678",
  businessEmail: "hello@example.kr",
  businessRegistrationNumber: "123-45-67890",
  mailOrderSalesNumber: "2026-서울중구-0001",
  refundPolicy: "서비스 시작 전까지 전액 환불하며 접수 후 3영업일 안에 처리합니다.",
  termsUrl: "https://example.kr/terms",
};
assert.equal(landingPublicationIssues(transactionReady).length, 0);

const noContact = { ...draft, collectEmail: false, collectPhone: false };
assert.equal(landingDraftSchema.safeParse(noContact).success, false);

const noController = { ...draft, privacyController: "" };
assert.equal(landingDraftSchema.safeParse(noController).success, false);

const lead = landingLeadSchema.parse({
  name: "테스트",
  email: "test@example.com",
  phone: "",
  message: "",
  privacyAgreed: true,
  marketingAgreed: false,
  source: "test",
});
assert.equal(lead.email, "test@example.com");

assert.equal(landingLeadSchema.safeParse({
  name: "테스트",
  email: "",
  phone: "",
  message: "",
  privacyAgreed: true,
  marketingAgreed: false,
  source: "test",
}).success, false);

assert.equal(landingLeadSchema.safeParse({
  name: "테스트",
  email: "test@example.com",
  phone: "",
  message: "",
  privacyAgreed: false,
  marketingAgreed: false,
  source: "test",
}).success, false);

assert.equal(landingEventSchema.safeParse({
  eventType: "page_view",
  visitorId: crypto.randomUUID(),
  path: "/launch/test",
  referrer: "",
  analyticsConsent: true,
}).success, true);

assert.equal(landingEventSchema.safeParse({
  eventType: "purchase",
  visitorId: crypto.randomUUID(),
  path: "/launch/test",
  referrer: "",
  analyticsConsent: true,
}).success, false);

console.log(JSON.stringify({
  passed: 19,
  sample: {
    slug: draft.slug,
    contact: draft.collectEmail ? "email" : "phone",
    privacyController: draft.privacyController,
  },
}, null, 2));
