import assert from "node:assert/strict";
import {
  applyLandingTemplate,
  createLandingDraft,
  ensureLandingPageData,
  inferLandingTemplate,
  landingDraftSchema,
  landingEventSchema,
  landingLeadSchema,
  landingPublicationIssues,
  landingTemplateOptions,
} from "../lib/landing/domain";
import { normalizeLandingHostname } from "../lib/landing/custom-domain";
import {
  createLandingPageData,
  landingPageDataSchema,
  syncLandingPageData,
} from "../lib/landing/page-data";

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
assert.equal(inferLandingTemplate("인공지능 구독 플랫폼"), "tech");
assert.equal(inferLandingTemplate("작가 포트폴리오"), "creator");
assert.equal(landingTemplateOptions.length, 8);
assert.equal(applyLandingTemplate(publishable, "product").templateId, "product");
assert.ok(applyLandingTemplate(publishable, "product").heroImageUrl.includes("images.unsplash.com"));
assert.ok(publishable.pageData);

const templateLayouts = landingTemplateOptions.map((template) => (
  createLandingPageData(publishable, template.id).content.map((component) => component.type).join(",")
));
assert.equal(new Set(templateLayouts).size, landingTemplateOptions.length);

const upgradedLegacyDraft = ensureLandingPageData({ ...publishable, pageData: null });
assert.equal(upgradedLegacyDraft.pageData.content[0]?.type, "HeroSection");

const updatedPageData = syncLandingPageData(
  upgradedLegacyDraft.pageData,
  { ...publishable, headline: "바뀐 첫 화면 제목입니다" },
  ["headline"],
);
assert.equal(updatedPageData.content[0]?.props.title, "바뀐 첫 화면 제목입니다");

assert.equal(landingPageDataSchema.safeParse({
  root: { props: {} },
  content: [{ type: "RawHtml", props: { html: "<script>alert(1)</script>" } }],
}).success, false);

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

assert.equal(normalizeLandingHostname("https://WWW.MyBrand.com/path"), "www.mybrand.com");
assert.throws(() => normalizeLandingHostname("mybrand.com"), /CUSTOM_DOMAIN_WWW_REQUIRED/);
assert.throws(() => normalizeLandingHostname("www.oneulstart.com"), /CUSTOM_DOMAIN_INVALID/);

console.log(JSON.stringify({
  passed: 30,
  sample: {
    slug: draft.slug,
    contact: draft.collectEmail ? "email" : "phone",
    privacyController: draft.privacyController,
  },
}, null, 2));
