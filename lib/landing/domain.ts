import { z } from "zod";
import {
  createLandingPageData,
  landingPageDataSchema,
  type LandingPageData,
} from "./page-data";

const shortText = z.string().trim().min(1).max(120);
const bodyText = z.string().trim().min(1).max(1000);
const landingImage = z.string().trim().max(900_000).refine(
  (value) => !value || /^https:\/\//.test(value) || /^data:image\/(?:png|jpeg|webp);base64,/.test(value),
  "이미지는 https 주소 또는 업로드한 이미지여야 합니다.",
);

export const landingTemplateIds = [
  "service",
  "local",
  "product",
  "class",
  "tech",
  "creator",
  "wellness",
  "editorial",
] as const;
export type LandingTemplateId = (typeof landingTemplateIds)[number];

export const landingDraftSchema = z.object({
  slug: z.string().trim().toLowerCase().min(3).max(60).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "주소는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.",
  ),
  businessName: shortText,
  pageMode: z.enum(["lead_validation", "transaction"]).default("lead_validation"),
  templateId: z.enum(landingTemplateIds).default("service"),
  leadCaptureEnabled: z.boolean().default(true),
  logoImageUrl: landingImage.default(""),
  heroImageUrl: landingImage.default(""),
  heroImageAlt: z.string().trim().max(200).default(""),
  pageData: landingPageDataSchema.nullable().default(null),
  heroLabel: z.string().trim().max(80).default("지금 사전 신청을 받고 있어요"),
  headline: z.string().trim().min(5).max(120),
  subheadline: z.string().trim().min(5).max(300),
  ctaLabel: z.string().trim().min(2).max(40),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundTone: z.enum(["cream", "white", "dark"]),
  benefits: z.array(z.object({
    title: shortText,
    description: bodyText,
  })).min(1).max(6),
  offerTitle: shortText,
  offerDescription: bodyText,
  priceLabel: z.string().trim().max(100).default("가격 상담"),
  proofItems: z.array(z.string().trim().min(1).max(200)).max(8),
  faq: z.array(z.object({
    question: shortText,
    answer: bodyText,
  })).max(10),
  collectEmail: z.boolean(),
  collectPhone: z.boolean(),
  collectMessage: z.boolean(),
  privacyController: z.string().trim().min(2).max(120),
  privacyContact: z.string().trim().max(200).default(""),
  privacyPurpose: z.string().trim().min(5).max(500),
  privacyRetentionPeriod: z.string().trim().min(2).max(120),
  privacyRefusalNotice: z.string().trim().max(500).default(""),
  privacyPolicy: z.string().trim().max(8000).default(""),
  marketingOptInEnabled: z.boolean(),
  legalNotice: z.string().trim().max(1000),
  analyticsEnabled: z.boolean(),
  analyticsNotice: z.string().trim().max(500).default(""),
  businessRepresentative: z.string().trim().max(100).default(""),
  businessAddress: z.string().trim().max(300).default(""),
  businessContact: z.string().trim().max(200).default(""),
  businessPhone: z.string().trim().max(50).default(""),
  businessEmail: z.string().trim().email().or(z.literal("")).default(""),
  businessRegistrationNumber: z.string().trim().max(50).default(""),
  mailOrderSalesNumber: z.string().trim().max(100).default(""),
  hostingProvider: z.string().trim().max(120).default("오늘창업"),
  refundPolicy: z.string().trim().max(2000).default(""),
  termsUrl: z.string().url().or(z.literal("")).default(""),
}).superRefine((value, context) => {
  if (!value.collectEmail && !value.collectPhone) {
    context.addIssue({
      code: "custom",
      path: ["collectEmail"],
      message: "이메일 또는 전화번호 중 하나는 수집해야 합니다.",
    });
  }
});

export type LandingDraft = z.infer<typeof landingDraftSchema>;

export const landingTemplateOptions: Array<{
  id: LandingTemplateId;
  name: string;
  description: string;
  accentColor: string;
  backgroundTone: LandingDraft["backgroundTone"];
  heroImageUrl: string;
}> = [
  {
    id: "service",
    name: "신뢰형 서비스",
    description: "상담·돌봄·전문 서비스",
    accentColor: "#176b4d",
    backgroundTone: "white",
    heroImageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1800&q=82",
  },
  {
    id: "local",
    name: "동네 매장",
    description: "매장·공방·지역 예약",
    accentColor: "#a04435",
    backgroundTone: "cream",
    heroImageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1800&q=82",
  },
  {
    id: "product",
    name: "상품 판매",
    description: "온라인 상품·정기 배송",
    accentColor: "#2457a6",
    backgroundTone: "white",
    heroImageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1800&q=82",
  },
  {
    id: "class",
    name: "수업·예약",
    description: "교육·체험·예약 서비스",
    accentColor: "#6d4ca3",
    backgroundTone: "cream",
    heroImageUrl: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1800&q=82",
  },
  {
    id: "tech",
    name: "앱·플랫폼",
    description: "기술 서비스·구독·소프트웨어",
    accentColor: "#0f766e",
    backgroundTone: "dark",
    heroImageUrl: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1800&q=82",
  },
  {
    id: "creator",
    name: "작가·전문가",
    description: "포트폴리오·콘텐츠·개인 브랜드",
    accentColor: "#c03f55",
    backgroundTone: "white",
    heroImageUrl: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1800&q=82",
  },
  {
    id: "wellness",
    name: "뷰티·웰니스",
    description: "케어·건강·라이프스타일",
    accentColor: "#7d5a50",
    backgroundTone: "cream",
    heroImageUrl: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1800&q=82",
  },
  {
    id: "editorial",
    name: "브랜드 스토리",
    description: "브랜드 소개·제작 철학·스튜디오",
    accentColor: "#232323",
    backgroundTone: "white",
    heroImageUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1800&q=82",
  },
];

export function inferLandingTemplate(sector: string): LandingTemplateId {
  if (/(앱|플랫폼|소프트웨어|SaaS|인공지능|AI|데이터|개발)/i.test(sector)) return "tech";
  if (/(콘텐츠|디자인|작가|사진|영상|크리에이터|마케팅)/.test(sector)) return "creator";
  if (/(뷰티|웰니스|건강|헬스|피부|테라피|마사지)/.test(sector)) return "wellness";
  if (/(브랜드|스튜디오|에이전시|제작)/.test(sector)) return "editorial";
  if (/(쇼핑|상품|유통|커머스|제조|판매)/.test(sector)) return "product";
  if (/(교육|수업|체험|클래스|코칭)/.test(sector)) return "class";
  if (/(매장|공방|외식|카페|지역|방문|미용|네일|식당|음식점|베이커리|숙박|스튜디오|세탁|수리|운동|피트니스|필라테스|요가)/.test(sector)) return "local";
  return "service";
}

export function applyLandingTemplate(
  draft: LandingDraft,
  templateId: LandingTemplateId,
): LandingDraft {
  const template = landingTemplateOptions.find((item) => item.id === templateId) ?? landingTemplateOptions[0];
  const next = {
    ...draft,
    templateId,
    accentColor: template.accentColor,
    backgroundTone: template.backgroundTone,
    heroImageUrl: template.heroImageUrl,
    heroImageAlt: draft.heroImageAlt || `${draft.businessName} 대표 이미지`,
  };
  return {
    ...next,
    pageData: createLandingPageData(next, templateId),
  };
}

export function ensureLandingPageData(draft: LandingDraft): LandingDraft & { pageData: LandingPageData } {
  return {
    ...draft,
    pageData: draft.pageData ?? createLandingPageData(draft, draft.templateId),
  };
}

export type LandingVersion = {
  id: string;
  version: number;
  config: LandingDraft;
  createdAt: string;
  publishedAt: string | null;
};

export type LandingSiteRecord = {
  id: string;
  projectId: string;
  slug: string;
  status: "draft" | "published" | "unpublished";
  draft: LandingDraft;
  publishedVersion: number | null;
  versions: LandingVersion[];
  customDomain: string | null;
  createdAt: string;
  updatedAt: string;
  metrics: {
    pageViews: number;
    ctaClicks: number;
    leads: number;
    conversionRate: number;
  };
};

export const landingLeadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200).or(z.literal("")),
  phone: z.string().trim().max(30),
  message: z.string().trim().max(2000),
  privacyAgreed: z.literal(true),
  marketingAgreed: z.boolean().default(false),
  source: z.string().trim().max(100).default("landing"),
}).superRefine((value, context) => {
  if (!value.email && !value.phone) {
    context.addIssue({
      code: "custom",
      path: ["email"],
      message: "이메일 또는 전화번호를 입력해주세요.",
    });
  }
});

export type LandingLeadInput = z.infer<typeof landingLeadSchema>;

export type LandingLeadRecord = LandingLeadInput & {
  id: string;
  siteId: string;
  createdAt: string;
};

export const landingEventSchema = z.object({
  eventType: z.enum(["page_view", "cta_click"]),
  visitorId: z.string().trim().min(8).max(100),
  path: z.string().trim().max(300),
  referrer: z.string().trim().max(500).default(""),
  analyticsConsent: z.literal(true),
});

export type LandingEventInput = z.infer<typeof landingEventSchema>;

function slugify(value: string) {
  const latin = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return latin.length >= 3 ? latin.slice(0, 50) : `launch-${crypto.randomUUID().slice(0, 8)}`;
}

export function landingCollectedItems(value: LandingDraft) {
  return [
    "이름",
    ...(value.collectEmail ? ["이메일"] : []),
    ...(value.collectPhone ? ["전화번호"] : []),
    ...(value.collectMessage ? ["문의 내용"] : []),
  ];
}

export function landingPublicationIssues(value: LandingDraft) {
  const issues: string[] = [];
  if (value.leadCaptureEnabled && value.privacyContact.trim().length < 3) issues.push("개인정보 문의 연락처");
  if (value.leadCaptureEnabled && value.privacyRefusalNotice.trim().length < 10) issues.push("동의 거부 권리와 불이익 안내");
  if (value.leadCaptureEnabled && value.privacyPolicy.trim().length < 100) issues.push("전체 개인정보처리방침");
  if (value.analyticsEnabled && value.analyticsNotice.trim().length < 20) issues.push("방문 분석 수집 안내");
  if (/(?:개인가|개인를|합니다\.를|하세요\.로)/.test(`${value.headline} ${value.subheadline}`)) {
    issues.push("공개 문구의 조사·문장 오류");
  }
  if (/(?:테스트|example\.com|테스트로\s*\d+)/i.test(JSON.stringify(value))) {
    issues.push("테스트·예시 데이터 제거");
  }
  if (value.pageMode === "transaction") {
    if (!value.businessRepresentative) issues.push("대표자 성명");
    if (!value.businessAddress) issues.push("사업장 주소");
    if (!(value.businessPhone || value.businessContact)) issues.push("사업자 전화번호");
    if (!(value.businessEmail || value.businessContact.includes("@"))) issues.push("사업자 이메일");
    if (!value.businessRegistrationNumber) issues.push("사업자등록번호");
    if (!value.mailOrderSalesNumber) issues.push("통신판매업 신고번호 또는 신고면제 근거");
    if (value.refundPolicy.trim().length < 20) issues.push("청약철회·교환·환불 조건");
    if (!value.termsUrl) issues.push("거래조건·약관 인터넷 주소");
  }
  return [...new Set(issues)];
}

export function createLandingDraft(input: {
  title: string;
  oneLiner: string;
  customer: string;
  model: string;
  legalNotice?: string;
  sector?: string;
}): LandingDraft {
  const templateId = inferLandingTemplate(input.sector ?? "");
  const template = landingTemplateOptions.find((item) => item.id === templateId) ?? landingTemplateOptions[0];
  const draft: LandingDraft = {
    slug: slugify(input.title),
    businessName: input.title,
    pageMode: "lead_validation",
    templateId,
    leadCaptureEnabled: true,
    logoImageUrl: "",
    heroImageUrl: template.heroImageUrl,
    heroImageAlt: `${input.title} 대표 이미지`,
    pageData: null,
    heroLabel: "지금 첫 고객을 모집하고 있어요",
    headline: input.oneLiner || `${input.title}, 가장 작은 실행부터 시작하세요`,
    subheadline: `${input.customer || "고객"}에게 필요한 결과를 ${input.model || "맞춤 방식"}으로 검증합니다.`,
    ctaLabel: "무료로 신청하기",
    accentColor: template.accentColor,
    backgroundTone: template.backgroundTone,
    benefits: [
      { title: "문제를 먼저 확인", description: "불필요한 기능보다 지금 해결해야 할 문제부터 확인합니다." },
      { title: "작게 시작", description: "큰 비용을 쓰기 전에 가장 작은 실행으로 반응을 검증합니다." },
      { title: "결과를 기록", description: "신청과 피드백을 다음 개선에 바로 반영합니다." },
    ],
    offerTitle: "첫 신청에서 확인하는 내용",
    offerDescription: "현재 상황, 원하는 결과, 예상 일정과 비용을 확인한 뒤 다음 행동을 안내합니다.",
    priceLabel: "첫 상담 무료",
    proofItems: [],
    faq: [
      { question: "신청 후에는 어떻게 되나요?", answer: "입력한 연락처로 확인 후 다음 절차를 안내합니다." },
      { question: "바로 결제해야 하나요?", answer: "아니요. 필요한 범위와 조건을 먼저 확인합니다." },
    ],
    collectEmail: true,
    collectPhone: false,
    collectMessage: true,
    privacyController: input.title,
    privacyContact: "",
    privacyPurpose: "상담 신청 확인 및 서비스 안내를 위한 연락",
    privacyRetentionPeriod: "상담 종료 후 3개월 또는 동의 철회 시까지",
    privacyRefusalNotice: "동의를 거부할 수 있으나, 필수 연락정보가 없으면 상담 신청을 접수할 수 없습니다.",
    privacyPolicy: [
      `${input.title}은 상담 신청 처리를 위해 개인정보를 처리합니다.`,
      "1. 처리 목적: 상담 신청 확인, 문의 답변, 서비스 안내",
      "2. 처리 항목: 이름, 이메일, 문의 내용 중 신청폼에 표시된 항목",
      "3. 보유 기간: 상담 종료 후 3개월 또는 동의 철회 시까지",
      "4. 파기: 보유 목적 달성 또는 기간 종료 후 복구할 수 없는 방법으로 지체 없이 파기",
      "5. 정보주체 권리: 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다.",
      "6. 개인정보 문의: 공개 전 담당 연락처를 입력해야 합니다.",
      "7. 처리 위탁·제3자 제공·자동 수집 도구를 사용하는 경우 실제 운영 내용에 맞게 별도 공개합니다.",
    ].join("\n"),
    marketingOptInEnabled: false,
    legalNotice: input.legalNotice ?? "제공 내용과 일정은 상담 결과에 따라 달라질 수 있습니다.",
    analyticsEnabled: false,
    analyticsNotice: "페이지 방문·버튼 클릭 측정을 위해 임의 방문자 ID, 방문 경로와 유입 주소를 저장합니다.",
    businessRepresentative: "",
    businessAddress: "",
    businessContact: "",
    businessPhone: "",
    businessEmail: "",
    businessRegistrationNumber: "",
    mailOrderSalesNumber: "",
    hostingProvider: "오늘창업",
    refundPolicy: "",
    termsUrl: "",
  };
  return {
    ...draft,
    pageData: createLandingPageData(draft, templateId),
  };
}
