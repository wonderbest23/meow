import { z } from "zod";
import {
  BUNDLE_PRODUCT_AMOUNT, BUNDLE_PRODUCT_NAME, CUSTOM_HOMEPAGE_FROM_AMOUNT, DOMAIN_PRODUCT_AMOUNT, DOMAIN_PRODUCT_NAME, DOMAIN_PURCHASE_PRODUCT_AMOUNT, DOMAIN_PURCHASE_PRODUCT_NAME, DOMAIN_PURCHASE_REGISTRATION_AMOUNT, HOMEPAGE_PRODUCT_AMOUNT, PACKAGE_AMOUNT,
  REGEN_INCLUDED, REGEN_PACK_AMOUNT, REGEN_PACK_COUNT, TOKEN_PACK_AMOUNT, TOKEN_PACK_NAME, TOKEN_PACK_TOKENS, TOKEN_VALIDITY_DAYS,
} from "../payments/domain";

export const PLATFORM_POLICY_VERSION = "2026-07-23";

export const mailOrderStatusSchema = z.enum(["preparing", "reported", "exempt"]);
export type MailOrderStatus = z.infer<typeof mailOrderStatusSchema>;

export const mailOrderStatusLabels: Record<MailOrderStatus, string> = {
  preparing: "통신판매업 신고 준비 중",
  reported: "통신판매업 신고 완료",
  exempt: "통신판매업 신고 면제",
};

export const platformLegalSettingsSchema = z.object({
  serviceName: z.string().trim().min(1).max(80),
  operatorName: z.string().trim().max(120),
  representativeName: z.string().trim().max(80),
  businessRegistrationNumber: z.string().trim().max(20),
  mailOrderStatus: mailOrderStatusSchema,
  mailOrderSalesNumber: z.string().trim().max(60),
  mailOrderExemptionReason: z.string().trim().max(500),
  internetDomainName: z.string().trim().max(240),
  hostServerLocation: z.string().trim().max(240),
  businessAddress: z.string().trim().max(240),
  supportEmail: z.string().trim().max(160),
  supportPhone: z.string().trim().max(40),
  privacyOfficer: z.string().trim().max(100),
  privacyEmail: z.string().trim().max(160),
  hostingProvider: z.string().trim().max(120),
  policyEffectiveDate: z.string().trim().max(20),
  accountRetention: z.string().trim().max(500),
  projectRetention: z.string().trim().max(500),
  infrastructureRecipients: z.string().trim().max(500),
  infrastructureCountries: z.string().trim().max(500),
  infrastructureProcessingDetails: z.string().trim().max(1000),
  overseasRecipient: z.string().trim().max(240),
  overseasCountries: z.string().trim().max(500),
  overseasTransferredData: z.string().trim().max(1000),
  overseasPurpose: z.string().trim().max(500),
  overseasTimingAndMethod: z.string().trim().max(500),
  overseasRetention: z.string().trim().max(500),
  overseasRefusalImpact: z.string().trim().max(500),
  refundBeforeSupply: z.string().trim().max(1000),
  refundAfterSupply: z.string().trim().max(1000),
  serviceSupplyTiming: z.string().trim().max(500),
  legalReviewConfirmed: z.boolean(),
  openAiRegionConfirmed: z.boolean(),
  infrastructureRegionConfirmed: z.boolean(),
  authEmailDeliveryConfirmed: z.boolean(),
});

export type PlatformLegalSettings = z.infer<typeof platformLegalSettingsSchema>;

export const defaultPlatformLegalSettings: PlatformLegalSettings = {
  serviceName: "오늘창업",
  operatorName: "",
  representativeName: "",
  businessRegistrationNumber: "",
  mailOrderStatus: "preparing",
  mailOrderSalesNumber: "",
  mailOrderExemptionReason: "",
  internetDomainName: "oneulstart.com",
  hostServerLocation: "Cloudflare 글로벌 네트워크",
  businessAddress: "",
  supportEmail: "",
  supportPhone: "",
  privacyOfficer: "",
  privacyEmail: "",
  hostingProvider: "Cloudflare, Inc.",
  /* 2026-10-05: 결제 수단을 카드로 한정(계좌이체 삭제), 제공 범위에서 발표자료(PPT) 삭제 */
  policyEffectiveDate: "2026-10-05",
  accountRetention: "회원 탈퇴 시까지 보관하며, 법령상 보존 의무가 있는 정보는 해당 기간 동안 분리 보관합니다.",
  projectRetention: "사용자가 프로젝트를 삭제하거나 회원 탈퇴를 요청할 때까지 보관합니다.",
  infrastructureRecipients: "Supabase, Inc. 및 Cloudflare, Inc.",
  infrastructureCountries: "",
  infrastructureProcessingDetails: "Supabase는 로그인·계정 복구와 프로젝트 데이터베이스를, Cloudflare는 웹 호스팅·콘텐츠 전송·보안과 오류 기록을 처리합니다.",
  overseasRecipient: "Anthropic, OpenAI 및 각 사가 공개한 하위처리자",
  overseasCountries: "",
  overseasTransferredData: "사업 아이디어, 경력·관심사, 예산·가능 시간, 지역과 사용자가 입력한 프로젝트 내용 중 생성에 필요한 부분",
  overseasPurpose: "맞춤 사업 추천, 문서 초안 작성, 문장 수정과 이미지 생성",
  overseasTimingAndMethod: "사용자가 인공지능 생성 기능을 실행할 때 암호화된 통신망으로 전송",
  overseasRetention: "텍스트 생성 요청은 저장 옵션을 끄고 전송합니다. 이미지 생성 등 기능별 처리 기준은 다를 수 있으며, 오남용 방지 로그는 각 인공지능 사업자의 기본 정책에 따라 최대 30일 보관될 수 있습니다. 법적 의무가 있으면 더 길어질 수 있습니다.",
  overseasRefusalImpact: "인공지능 처리를 원하지 않으면 해당 생성 기능을 사용하지 않을 수 있습니다. 이 경우 기본 계산·서식 기능은 이용할 수 있지만 맞춤 문장·이미지 생성은 제한됩니다.",
  refundBeforeSupply: "카드 결제는 승인 전까지 주문을 취소할 수 있습니다. 이미 결제했더라도 맞춤 결과물 생성이 실제로 시작되지 않았다면 전액 환불하며, 카드 승인 취소로 돌려드립니다.",
  refundAfterSupply: "카드 결제가 승인되어 이용자 입력에 맞춘 인공지능 호출과 디지털 결과물 제작이 시작된 뒤에는 생성 비용이 발생하고 제3자에게 재판매할 수 없는 맞춤 결과물이 만들어지므로, 단순 변심에 따른 청약철회와 환불이 제한됩니다. 다만 약정한 핵심 결과물이 제공되지 않았거나 표시·광고 또는 계약 내용과 다르게 제공된 경우, 정상 이용할 수 없는 중대한 하자가 합리적인 기간 안에 고쳐지지 않은 경우와 그 밖에 관계 법령이 보장하는 경우에는 재제공, 일부 환급 또는 전액 환급을 요청할 수 있습니다.",
  serviceSupplyTiming: "신용·체크카드 결제는 NicePay(나이스페이먼츠) 결제 승인 즉시 해당 상품의 제공이 시작됩니다. 제공이 시작되면 이용자 입력을 바탕으로 인공지능 호출과 사업계획서·홈페이지 제작을 진행합니다.",
  legalReviewConfirmed: false,
  openAiRegionConfirmed: false,
  infrastructureRegionConfirmed: false,
  authEmailDeliveryConfirmed: false,
};

export function applyCurrentPlatformPolicy(settings: PlatformLegalSettings): PlatformLegalSettings {
  const savedDate = Date.parse(settings.policyEffectiveDate);
  const currentDate = Date.parse(defaultPlatformLegalSettings.policyEffectiveDate);
  if (Number.isFinite(savedDate) && savedDate >= currentDate) return settings;
  return {
    ...settings,
    policyEffectiveDate: defaultPlatformLegalSettings.policyEffectiveDate,
    refundBeforeSupply: defaultPlatformLegalSettings.refundBeforeSupply,
    refundAfterSupply: defaultPlatformLegalSettings.refundAfterSupply,
    serviceSupplyTiming: defaultPlatformLegalSettings.serviceSupplyTiming,
  };
}

const requiredFields: Array<{ key: keyof PlatformLegalSettings; label: string }> = [
  { key: "operatorName", label: "상호 또는 운영자명" },
  { key: "representativeName", label: "대표자명" },
  { key: "businessRegistrationNumber", label: "사업자등록번호" },
  { key: "businessAddress", label: "사업장 주소" },
  { key: "supportEmail", label: "고객 문의 이메일" },
  { key: "supportPhone", label: "고객 문의 전화번호" },
  { key: "privacyOfficer", label: "개인정보 보호책임자" },
  { key: "privacyEmail", label: "개인정보 문의 이메일" },
  { key: "policyEffectiveDate", label: "정책 시행일" },
  { key: "internetDomainName", label: "인터넷 도메인 이름" },
  { key: "hostServerLocation", label: "호스트서버 소재지" },
  { key: "infrastructureCountries", label: "Supabase·Cloudflare 실제 처리 국가" },
  { key: "overseasRecipient", label: "국외 이전받는 자" },
  { key: "overseasCountries", label: "실제 국외 처리 국가" },
  { key: "refundBeforeSupply", label: "제공 시작 전 환불 기준" },
  { key: "refundAfterSupply", label: "제공 시작 후 환불 기준" },
  { key: "serviceSupplyTiming", label: "서비스 제공 시기" },
];

export type LaunchReadiness = {
  siteOpen: boolean;
  commerceReportReady: boolean;
  ready: boolean;
  paymentAllowed: boolean;
  missing: string[];
  warnings: string[];
};

export function evaluatePlatformLaunchReadiness(
  settings: PlatformLegalSettings,
  options: { authConfigured: boolean; paymentsConfigured: boolean },
): LaunchReadiness {
  const missing = requiredFields
    .filter(({ key }) => {
      const value = settings[key];
      return typeof value === "string" && value.trim().length === 0;
    })
    .map(({ label }) => label);
  if (!settings.openAiRegionConfirmed) missing.push("Anthropic·OpenAI 실제 처리 지역 확인");
  if (!settings.infrastructureRegionConfirmed) missing.push("Supabase·Cloudflare 처리 지역 확인");
  if (!settings.authEmailDeliveryConfirmed) missing.push("가입·계정복구 메일 실사용 확인");
  if (!settings.legalReviewConfirmed) missing.push("운영자 최종 검토 확인");
  if (!options.authConfigured) missing.push("로그인·계정 복구 설정");
  if (settings.mailOrderStatus === "preparing") missing.push("통신판매업 신고 완료 또는 신고 면제 근거");
  if (settings.mailOrderStatus === "reported" && !settings.mailOrderSalesNumber.trim()) missing.push("통신판매업 신고번호");
  if (settings.mailOrderStatus === "exempt" && !settings.mailOrderExemptionReason.trim()) missing.push("통신판매업 신고 면제 근거");

  const warnings = [
    "운영자 정보나 수탁사 설정이 바뀌면 공개 문서도 즉시 갱신해야 합니다.",
    "이 자동 문서는 실제 운영값을 반영하는 초안이며 법률 자문을 대신하지 않습니다.",
  ];

  const siteOpen = [
    settings.operatorName,
    settings.representativeName,
    settings.businessRegistrationNumber,
    settings.businessAddress,
    settings.internetDomainName,
  ].every((value) => value.trim().length > 0);
  const commerceReportReady = siteOpen && [
    settings.supportPhone,
    settings.supportEmail,
    settings.hostServerLocation,
  ].every((value) => value.trim().length > 0);
  const ready = missing.length === 0;
  return {
    siteOpen,
    commerceReportReady,
    ready,
    paymentAllowed: ready && options.paymentsConfigured,
    missing,
    warnings,
  };
}

export type LegalDocumentType = "business" | "privacy" | "ai" | "terms" | "refund";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export type LegalDocument = {
  title: string;
  summary: string;
  effectiveDate: string;
  sections: LegalSection[];
};

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
const tokenCount = (tokens: number) => `${(tokens / 10_000).toLocaleString("ko-KR")}만`;
/** 도메인 환불 예시: 3개월 사용 → 12개월 중 9개월분 */
const DOMAIN_REFUND_EXAMPLE = Math.floor((DOMAIN_PRODUCT_AMOUNT * 9) / 12);
/** 토큰 환불 예시: 20만 중 12만 남음 */
const TOKEN_REFUND_EXAMPLE_LEFT = 120_000;
const TOKEN_REFUND_EXAMPLE = Math.floor((TOKEN_PACK_AMOUNT * TOKEN_REFUND_EXAMPLE_LEFT) / TOKEN_PACK_TOKENS);
const TOKEN_VALIDITY = TOKEN_VALIDITY_DAYS === 365 ? "1년" : `${TOKEN_VALIDITY_DAYS}일`;

/* 지금 결제 화면은 카드만 받는다 — 받지 않는 결제 수단을 법적 안내에 적지 않는다 */
const PAYMENT_METHODS = "신용·체크카드(결제대행: 나이스페이먼츠 NicePay)";

const PRODUCT_ITEMS = [
  `사업계획서(문서 1부): ${won(PACKAGE_AMOUNT)}(부가세 포함)`,
  `사업계획서 홈페이지 수정·공개: ${won(HOMEPAGE_PRODUCT_AMOUNT)}(부가세 포함, 홈페이지 1개)`,
  `${BUNDLE_PRODUCT_NAME}: ${won(BUNDLE_PRODUCT_AMOUNT)}(부가세 포함, 같은 사업의 문서 1부와 홈페이지 1개를 함께 제공)`,
  `${DOMAIN_PRODUCT_NAME}: ${won(DOMAIN_PRODUCT_AMOUNT)}(부가세 포함, 결제일부터 1년. 도메인 등록비는 별도)`,
  `${DOMAIN_PURCHASE_PRODUCT_NAME}: ${won(DOMAIN_PURCHASE_PRODUCT_AMOUNT)}(부가세 포함, 결제일부터 1년. .com·.kr·.co.kr 주소의 첫해 등록비 ${won(DOMAIN_PURCHASE_REGISTRATION_AMOUNT)} 포함)`,
  `${TOKEN_PACK_NAME}: ${won(TOKEN_PACK_AMOUNT)}(부가세 포함, ${tokenCount(TOKEN_PACK_TOKENS)} 토큰, 충전일부터 ${TOKEN_VALIDITY} 유효)`,
  `다시 생성 ${REGEN_PACK_COUNT}회 추가: ${won(REGEN_PACK_AMOUNT)}(부가세 포함)`,
];

const DOMAIN_REFUND_ITEMS = [
  "도메인 연결을 완료하기 전에 요청하면 전액 환불합니다.",
  "연결을 완료한 날부터 7일 이내에 요청하면 전액 환불합니다.",
  `그 이후에는 남은 개월 수만큼 월할로 환불합니다. 사용 기간은 결제일부터 계산하며 일부라도 사용한 달은 한 달로 봅니다. 예: 3개월 사용 후 요청 → 12개월 중 9개월분 ${won(DOMAIN_REFUND_EXAMPLE)}.`,
  "환불 수수료는 받지 않습니다. 환불하면 해당 도메인 연결과 호스팅이 종료됩니다.",
  "가비아 등 도메인 등록기관에서 이용자가 직접 구매한 도메인 등록비는 오늘창업이 받은 금액이 아니므로 환불 대상이 아니며, 해당 등록기관의 기준을 따릅니다.",
];

const DOMAIN_PURCHASE_ITEMS = [
  `${DOMAIN_PURCHASE_PRODUCT_NAME} 상품은 이용자가 고른 주소(.com·.kr·.co.kr)를 오늘창업이 이용자 명의로 등록기관에 등록하고, 결제일부터 1년 동안 홈페이지에 연결해 호스팅합니다.`,
  "결제 후 영업일 1~2일 안에 등록을 진행하며, 등록에 필요한 정보(이름·연락처 등)는 계정 이메일로 요청할 수 있습니다. 결제 전에 보여 드리는 '비어 있음' 확인은 등록소 조회 결과를 옮긴 참고 정보입니다.",
  "등록할 수 없는 주소(이미 등록됨, 등록기관이 거절한 주소 등)로 확인되면 이용자와 다른 주소를 정하거나 전액 환불합니다.",
  "등록한 도메인은 이용자 소유입니다. 환불·해지 뒤에도 도메인은 이용자에게 남으며, 요청하면 등록기관의 이전 절차를 안내합니다.",
  `2년째부터는 같은 상품(${won(DOMAIN_PURCHASE_PRODUCT_AMOUNT)})으로 등록 갱신과 호스팅을 함께 연장합니다. 만료 30일 전부터 갱신할 수 있으며, 갱신하지 않으면 등록기관 기준에 따라 도메인이 만료될 수 있습니다.`,
];

const DOMAIN_PURCHASE_REFUND_ITEMS = [
  "도메인을 등록하기 전에 요청하면 전액 환불합니다.",
  `등록한 뒤에는 첫해 등록비 ${won(DOMAIN_PURCHASE_REGISTRATION_AMOUNT)}을 뺀 ${won(DOMAIN_PRODUCT_AMOUNT)}에 위 도메인 연결·호스팅 기준(연결 완료 후 7일 이내 전액, 그 뒤 남은 개월 수만큼 월할)을 적용합니다.`,
  "환불하면 홈페이지 연결과 호스팅이 종료되며, 등록한 도메인은 이용자 소유로 남습니다.",
];

const TOKEN_REFUND_ITEMS = [
  `충전한 토큰은 충전일부터 ${TOKEN_VALIDITY} 동안 해당 홈페이지에서 사용할 수 있습니다. 먼저 충전한 토큰부터 차감하며, 유효기간이 지난 토큰은 소멸합니다.`,
  "인공지능이 실제로 결과를 만든 경우에만 사용한 만큼 차감하며, 실패한 요청은 차감하지 않습니다.",
  "충전일부터 7일 이내이고 사용하지 않았다면 전액 환불합니다.",
  `일부 사용했거나 7일이 지났다면, 유효기간 안에서 남은 토큰 비율만큼 환불합니다(원 단위 미만 버림). 예: ${tokenCount(TOKEN_PACK_TOKENS)} 중 ${tokenCount(TOKEN_REFUND_EXAMPLE_LEFT)} 남음 → ${won(TOKEN_REFUND_EXAMPLE)}.`,
  "환불 수수료는 받지 않습니다. 유효기간이 지나 소멸한 토큰은 환불 대상이 아닙니다.",
];

function shown(value: string, fallback = "정식 출시 전 입력 예정") {
  return value.trim() || fallback;
}

function businessDocument(settings: PlatformLegalSettings): LegalDocument {
  const mailOrderStatus = mailOrderStatusLabels[settings.mailOrderStatus];
  const supportChannels = [settings.supportPhone, settings.supportEmail].filter((value) => value.trim()).join(" / ");
  return {
    title: "사업자·통신판매 정보",
    summary: "오늘창업을 운영하고 온라인으로 디지털 결과물과 홈페이지 제작 서비스를 제공하는 판매자 정보입니다.",
    effectiveDate: settings.policyEffectiveDate,
    sections: [{
      title: "판매자 정보",
      items: [
        `상호 또는 운영자명: ${shown(settings.operatorName)}`,
        `대표자: ${shown(settings.representativeName)}`,
        `사업자등록번호: ${shown(settings.businessRegistrationNumber)}`,
        `통신판매업 상태: ${mailOrderStatus}`,
        settings.mailOrderStatus === "reported"
          ? `통신판매업 신고번호: ${shown(settings.mailOrderSalesNumber)}`
          : settings.mailOrderStatus === "exempt"
            ? `신고 면제 근거: ${shown(settings.mailOrderExemptionReason)}`
            : "통신판매업 신고번호: 신고 완료 후 표시",
        `사업장 주소: ${shown(settings.businessAddress)}`,
        `고객 문의: ${supportChannels || "사이트 우측 하단 1:1 상담(전화·이메일은 신고 전 등록)"}`,
        `인터넷 도메인 이름: ${shown(settings.internetDomainName)}`,
        `호스팅서비스 제공자: ${shown(settings.hostingProvider)}`,
        `호스트서버 소재지: ${shown(settings.hostServerLocation)}`,
      ],
    }, {
      title: "판매 사이트 정보",
      items: [
        "판매 방식: 인터넷",
        "취급 품목: 맞춤 사업계획서 등 디지털 문서, 홈페이지 자동 제작과 도메인 연결·호스팅, 홈페이지 AI 수정 토큰, 맞춤 홈페이지 디자인·개발",
        ...PRODUCT_ITEMS,
        `맞춤 홈페이지 제작: ${won(CUSTOM_HOMEPAGE_FROM_AMOUNT)}부터(상담 후 범위와 금액 확정)`,
        `결제 방법: ${PAYMENT_METHODS}`,
        `서비스 제공 시기: ${settings.serviceSupplyTiming}`,
      ],
    }, {
      title: "취소·환불 확인",
      paragraphs: [
        settings.refundBeforeSupply,
        settings.refundAfterSupply,
        "도메인 연결·호스팅, AI 수정 토큰, 다시 생성 추가 횟수는 남은 기간·수량에 따라 환불하며, 자세한 기준은 ‘취소·환불 기준’에서 확인할 수 있습니다.",
      ],
    }],
  };
}

/** 개인정보처리방침 변경 이력 (최신이 위). 방침 본문을 바꾸면 여기에 한 줄 추가한다. */
export const PRIVACY_POLICY_HISTORY = [
  { date: "2026-10-05", summary: "결제 수단을 신용·체크카드로 한정하고, 계좌이체 관련 항목은 이전 주문의 처리 기준으로 정리" },
  { date: "2026-10-01", summary: "홈페이지 문의·주간 리포트 문자 알림(선택)의 휴대폰 번호 수집과 문자 발송 수탁사(알리고) 추가" },
  { date: "2026-09-30", summary: "도메인 구매 대행(선택 상품)의 수집 항목과 도메인 등록기관 제공 추가" },
  { date: "2026-09-28", summary: "신용카드 결제(나이스페이먼츠)와 이메일 발송(Resend) 수탁사, 소셜 로그인 수집 항목, 법정 보존기간, 국외 이전 세부 항목, 권익침해 구제 방법과 변경 이력 추가" },
  { date: "2026-07-23", summary: "맞춤 디지털 결과물 제공 시점과 결제·환불 처리 정보 정비" },
];

/** 관계 법령에 따른 보존 기간 */
const LEGAL_RETENTION_ITEMS = [
  "계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률)",
  "대금결제 및 재화 등의 공급에 관한 기록: 5년 (같은 법)",
  "소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (같은 법)",
  "표시·광고에 관한 기록: 6개월 (같은 법)",
  "세법상 거래 증빙 서류: 5년 (국세기본법)",
  "서비스 접속 기록(로그인 기록, IP 주소 등): 3개월 (통신비밀보호법)",
];

/** 국외 이전 — 개인정보 보호법 제28조의8 고지 항목(이전받는 자·연락처, 국가, 항목, 시기·방법, 목적·보유기간, 거부 방법) */
function overseasTransferItems(settings: PlatformLegalSettings) {
  const infraCountries = shown(settings.infrastructureCountries, "실제 Supabase 프로젝트와 Cloudflare 계약의 처리 지역 확인 후 입력");
  return [
    `Supabase, Inc.(privacy@supabase.com) / 국가: ${infraCountries} / 항목: 계정 정보, 프로젝트 입력, 주문·결제 기록 / 시기·방법: 가입·이용 시 암호화된 통신망으로 저장 / 목적: 로그인·계정 복구, 데이터베이스 운영 / 보유: 이 방침의 보유 기간과 같음`,
    "Cloudflare, Inc.(privacyquestions@cloudflare.com) / 국가: 미국 등 이용자와 가까운 전 세계 Cloudflare 데이터센터 / 항목: 접속 기록, IP 주소, 기기·브라우저 정보, 요청 내용 / 시기·방법: 서비스 접속 시 암호화된 통신망으로 전송 / 목적: 호스팅, 콘텐츠 전송, 보안과 오류 기록 / 보유: Cloudflare 기본 정책에 따른 로그 보관 기간",
    "Resend, Inc.(support@resend.com) / 국가: 미국 / 항목: 받는 사람 이메일, 메일 본문(결제·서비스 안내, 홈페이지 문의 알림) / 시기·방법: 메일 발송 시 암호화된 통신망으로 전송 / 목적: 서비스 이메일 발송 / 보유: 발송 기록 확인에 필요한 기간",
    `Anthropic·OpenAI(인공지능 생성): 국가 ${shown(settings.overseasCountries, "운영 중인 Anthropic·OpenAI 계정의 실제 처리 지역 확인 후 입력")} / 항목·시기·보관 기준과 연락처는 ‘인공지능 및 국외 처리 안내’에서 확인할 수 있습니다.`,
    "국외 이전을 원하지 않으면 회원 탈퇴나 해당 기능 미사용으로 이전을 거부할 수 있습니다. 다만 Supabase·Cloudflare는 서비스 운영에 꼭 필요하므로 거부하면 서비스를 이용할 수 없고, 인공지능 생성을 거부하면 맞춤 문장·이미지 생성이 제한됩니다.",
  ];
}

function privacyDocument(settings: PlatformLegalSettings): LegalDocument {
  return {
    title: "개인정보처리방침",
    summary: `${settings.serviceName}은 필요한 개인정보만 수집하고, 이용 목적과 보관 기간을 분명하게 공개합니다.`,
    effectiveDate: settings.policyEffectiveDate,
    sections: [
      {
        title: "1. 처리하는 개인정보와 이용 목적",
        items: [
          "계정(이메일 가입): 이메일, 인증 식별자 - 로그인, 본인 확인, 계정 복구",
          "계정(카카오·구글 로그인): 소셜 계정 식별자, 이메일, 이름(닉네임), 프로필 사진 - 로그인과 본인 확인. 카카오·구글이 이용자의 동의를 받아 전달하는 항목만 받으며, 동의하지 않은 항목은 받지 않습니다.",
          "사업 설계: 경력, 관심사, 예산, 가능한 시간, 지역, 사업 아이디어와 프로젝트 입력 - 맞춤 추천과 결과물 작성",
          "결제(카드): 주문번호, 상품명, 금액·상태, 결제일시, 구매자 이메일, 결제대행사 거래번호와 승인 결과(카드사명, 일부가 가려진 카드번호, 승인번호, 할부 개월) - 결제 확인, 취소·환불과 분쟁 대응. 전체 카드번호, 유효기간, CVC와 카드 비밀번호는 결제대행사(나이스페이먼츠)가 직접 처리하며 오늘창업은 수집·저장하지 않습니다.",
          "결제(이전 계좌이체 주문): 주문번호, 금액·상태, 입금자명, 연락처, 현금영수증 종류와 발급 식별정보 - 입금 확인, 현금영수증 발급, 취소·환급과 분쟁 대응. 계좌 비밀번호나 인터넷뱅킹 인증정보는 수집하지 않습니다.",
          "도메인 구매 대행(선택): 원하는 주소, 등록 명의자 이름·이메일·연락처·주소 - 이용자 명의 도메인 등록과 갱신. 이 상품을 결제한 경우에만 계정 이메일로 요청해 받습니다.",
          "문자 알림(선택): 홈페이지 주인이 등록한 휴대폰 번호와 동의 시각 - 새 홈페이지 문의와 주간 리포트 문자 발송. 번호는 홈페이지에 공개하지 않으며, 지우면 문자 알림이 멈춥니다.",
          "문의: 이메일 또는 대화 내용 - 고객 요청 처리",
          "자동 생성 정보: 접속 기록, 쿠키, 기기·브라우저 정보, IP 주소 - 보안, 오류 대응, 부정 이용 방지",
          "인공지능 연결 정보: 사용자가 직접 입력한 API 키의 끝 4자리와 연결 시각 - 연결 상태 표시. 키 원문은 데이터베이스와 브라우저 저장소에 보관하지 않고 서버 메모리에서 최대 4시간 사용합니다.",
        ],
      },
      {
        title: "2. 보유 및 이용 기간",
        paragraphs: ["이용 목적을 달성하면 지체 없이 파기합니다. 다만 관계 법령이 보존을 요구하는 정보는 아래 기간 동안 분리 보관한 뒤 파기합니다."],
        items: [
          `계정 정보: ${settings.accountRetention}`,
          `프로젝트 정보: ${settings.projectRetention}`,
          ...LEGAL_RETENTION_ITEMS,
        ],
      },
      {
        title: "3. 개인정보의 제3자 제공",
        paragraphs: ["이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 이용자가 미리 동의한 경우와 법령에 특별한 규정이 있거나 수사기관 등이 법령에 정한 절차에 따라 요구하는 경우에는 필요한 범위에서 제공할 수 있습니다."],
        items: [
          "도메인 구매 대행을 결제하며 동의한 경우 — 제공받는 자: 도메인 등록기관(㈜가비아 등, 실제 등록한 기관은 등록 완료 때 알립니다) / 목적: 이용자 명의 도메인 등록·관리와 등록기관의 법정 의무 이행(도메인 등록정보 관리 등) / 항목: 등록 명의자 이름, 이메일, 연락처, 주소 / 보유: 도메인 등록 기간과 등록기관이 정한 기간. 동의하지 않으면 도메인 구매 대행을 이용할 수 없고, 직접 산 도메인의 연결 상품은 그대로 이용할 수 있습니다.",
        ],
      },
      {
        title: "4. 개인정보의 처리위탁",
        paragraphs: ["서비스 운영을 위해 다음 업체에 개인정보 처리를 위탁합니다. 위탁 계약에서 목적 외 처리 금지, 안전성 확보 조치, 재위탁 제한과 관리·감독 등을 정하고 있습니다. 이전에 계좌이체로 받은 대금은 운영자가 거래내역을 직접 확인했습니다."],
        items: [
          "㈜나이스페이먼츠(NicePay): 신용·체크카드 결제 처리, 결제 취소와 환불",
          "Supabase, Inc.: 로그인·계정 복구, 데이터베이스",
          "Cloudflare, Inc.: 웹 호스팅, 콘텐츠 전송, 보안과 오류 기록",
          "Resend, Inc.: 결제·서비스 안내와 홈페이지 문의 알림 이메일 발송",
          "알리고(Aligo): 홈페이지 문의·주간 리포트·운영 안내 문자 발송(받는 번호와 정해진 안내 문구만 전달하며 문의 내용은 보내지 않습니다)",
          "Amazon Web Services, Inc.(Lightsail, 서울 리전): 문자 발송 중계 서버 호스팅(문자 발송사가 정해진 서버 주소에서만 요청을 받아 그 서버를 거칩니다)",
          "Anthropic, PBC·OpenAI: 인공지능 생성",
        ],
      },
      {
        title: "5. 개인정보의 국외 이전",
        paragraphs: ["서비스 제공에 필요한 범위에서 다음과 같이 개인정보를 국외로 이전(처리위탁·보관)합니다."],
        items: overseasTransferItems(settings),
      },
      {
        title: "6. 이용자 홈페이지 방문자의 개인정보",
        paragraphs: ["이용자가 오늘창업으로 만든 홈페이지에서 문의를 받으면, 방문자가 입력한 이름, 연락처, 이메일, 문의 내용과 동의 여부를 저장해 해당 홈페이지 운영자(이용자)에게 전달합니다. 이 정보의 처리자는 홈페이지 운영자이며, 오늘창업은 운영자를 위해 저장·전달을 대신하는 수탁자입니다. 방문자는 홈페이지 운영자에게 열람·삭제 등을 요청할 수 있고, 운영자가 해당 프로젝트를 삭제하면 함께 삭제됩니다."],
      },
      {
        title: "7. 파기 절차와 방법",
        paragraphs: ["이용 목적이 끝난 개인정보는 지체 없이 삭제합니다. 법령상 보존해야 하는 정보는 별도 공간에 분리한 뒤 보존기간이 끝나면 복구하기 어려운 방법으로 삭제합니다. 전자 파일은 복구할 수 없는 방법으로 삭제하고, 종이 문서는 분쇄하거나 소각합니다."],
      },
      {
        title: "8. 이용자의 권리와 행사 방법",
        paragraphs: ["이용자는 자신의 개인정보 열람, 정정, 삭제, 처리정지와 동의 철회를 요청할 수 있습니다. 계정 화면 또는 개인정보 문의처를 통해 요청하면 본인 확인 후 10일 이내에 처리하고 결과를 알려드립니다. 법정대리인이나 위임받은 사람을 통해서도 요청할 수 있습니다. 만 14세 미만 이용자는 법정대리인 동의 없이 가입할 수 없습니다."],
      },
      {
        title: "9. 안전성 확보 조치",
        items: ["전송 구간 암호화", "비밀번호 원문 미보관", "전체 카드번호·카드 인증정보 미보관(결제대행사 처리)", "관리자 권한 제한과 인증", "서비스 역할키의 브라우저 비공개", "접근 기록과 오류 점검"],
      },
      {
        title: "10. 쿠키",
        paragraphs: ["로그인 상태와 비회원 프로젝트를 구분하기 위해 필수 쿠키를 사용합니다. 브라우저 설정에서 쿠키 저장을 거부할 수 있지만, 필수 쿠키를 차단하면 로그인 또는 저장한 프로젝트 이용이 어려울 수 있습니다. 광고 목적의 쿠키는 사용하지 않습니다."],
      },
      {
        title: "11. 개인정보 보호책임자",
        items: [
          `개인정보 보호책임자: ${shown(settings.privacyOfficer)}`,
          `이메일: ${shown(settings.privacyEmail)}`,
          `전화: ${shown(settings.supportPhone)}`,
        ],
      },
      {
        title: "12. 권익침해 구제 방법",
        paragraphs: ["개인정보 침해에 대한 상담이나 분쟁 해결이 필요하면 아래 기관에 문의할 수 있습니다."],
        items: [
          "개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)",
          "개인정보침해신고센터(한국인터넷진흥원): 국번 없이 118 (privacy.kisa.or.kr)",
          "대검찰청: 국번 없이 1301 (www.spo.go.kr)",
          "경찰청: 국번 없이 182 (ecrm.police.go.kr)",
        ],
      },
      {
        title: "13. 방침 변경과 이력",
        paragraphs: ["이 방침이 바뀌면 시행 7일 전부터 서비스 화면에서 변경 내용과 시행일을 알립니다. 수집 항목이나 이용 목적이 늘어나는 등 이용자 권리에 중대한 변경은 시행 30일 전부터 알리고 필요하면 다시 동의를 받습니다."],
        items: PRIVACY_POLICY_HISTORY.map((entry) => `${entry.date} 시행: ${entry.summary}`),
      },
    ],
  };
}

function aiDocument(settings: PlatformLegalSettings): LegalDocument {
  return {
    title: "인공지능 및 국외 처리 안내",
    summary: "오늘창업의 추천과 문서 일부는 생성형 인공지능으로 만들어지며, 이용자가 이를 분명히 알 수 있도록 표시합니다.",
    effectiveDate: settings.policyEffectiveDate,
    sections: [
      {
        title: "1. 인공지능 사용 사실",
        paragraphs: ["사업 추천, 문서 초안, 문장 수정과 로고 이미지 생성에 생성형 인공지능을 사용할 수 있습니다. 생성된 화면과 파일에는 ‘인공지능 초안’ 또는 같은 의미의 표시를 제공합니다."],
      },
      {
        title: "2. 결과 확인 원칙",
        items: [
          "인공지능 결과는 성공, 매출, 지원금 선정, 인허가 또는 법률·세무 판단을 보장하지 않습니다.",
          "공식 자료로 확인되지 않은 숫자와 조건은 가정 또는 확인 필요로 표시합니다.",
          "최종 제출·계약·신고 전에는 원문, 실제 견적, 관할 기관 안내를 확인해야 합니다.",
        ],
      },
      {
        title: "3. 인공지능 국외 처리",
        items: [
          `이전받는 자: ${shown(settings.overseasRecipient)}`,
          "연락처: Anthropic privacy@anthropic.com(국내대리인 Anthropic Korea, Limited, 02-734-0940, anthropic_privacy@kimchang.com) / OpenAI dsar@openai.com",
          `처리 국가: ${shown(settings.overseasCountries, "운영 중인 Anthropic·OpenAI 계정의 실제 처리 지역 확인 후 입력")}`,
          `이전 항목: ${settings.overseasTransferredData}`,
          `목적: ${settings.overseasPurpose}`,
          `시기와 방법: ${settings.overseasTimingAndMethod}`,
          `보관 기준: ${settings.overseasRetention}`,
          `거부 방법과 영향: ${settings.overseasRefusalImpact}`,
        ],
      },
      {
        title: "4. 민감정보 입력 금지",
        paragraphs: ["주민등록번호, 계좌 비밀번호, 카드번호, 건강정보, 타인의 개인정보처럼 사업 설계에 필요하지 않은 정보는 입력하지 마세요. 생성 요청에는 필요한 내용만 선별하여 사용합니다."],
      },
    ],
  };
}

function termsDocument(settings: PlatformLegalSettings): LegalDocument {
  return {
    title: "이용약관",
    summary: `${settings.serviceName}의 계정, 사업 설계, 디지털 결과물과 판매 페이지 이용 조건입니다.`,
    effectiveDate: settings.policyEffectiveDate,
    sections: [
      { title: "1. 목적과 적용", paragraphs: ["이 약관은 운영자와 이용자 사이의 서비스 이용 조건, 권리와 책임을 정합니다. 결제 화면에 별도로 표시한 상품명, 금액, 제공 시기와 환불 조건도 계약 내용에 포함됩니다."] },
      { title: "2. 계정", items: ["이용자는 정확한 이메일로 가입하고 자신의 계정을 안전하게 관리해야 합니다.", "타인의 계정을 사용하거나 계정을 양도할 수 없습니다.", "계정 분실 시 이메일 계정 복구 절차를 이용할 수 있습니다."] },
      { title: "3. 서비스 제공", items: ["아이디어 탐색과 무료 체험은 사업자등록 여부와 관계없이 이용할 수 있습니다.", `유료 결과물 제공 시기: ${settings.serviceSupplyTiming}`, "카드 결제 승인이 맞춤 디지털 결과물 제공 개시 시점이며, 결제 화면에서 이용자의 별도 동의를 받습니다.", "사용자의 입력과 승인에 따라 추천, 보고서, 사업계획서, 판매 페이지와 실행 안내를 제공합니다.", "베타 기능은 예고 후 변경될 수 있으나 이미 결제한 상품의 핵심 제공 범위를 일방적으로 축소하지 않습니다."] },
      { title: "4. 상품, 가격과 결제", items: [...PRODUCT_ITEMS, `결제 방법: ${PAYMENT_METHODS}. 카드 결제는 결제대행사 화면에서 이뤄지며 오늘창업은 카드번호를 받지 않습니다.`, "도메인 연결·호스팅, AI 수정 토큰, 다시 생성 추가 횟수는 결제한 문서 또는 홈페이지에서만 사용할 수 있고 다른 문서·홈페이지나 다른 계정으로 옮길 수 없습니다."] },
      { title: "5. 인공지능 결과", paragraphs: ["일부 결과는 생성형 인공지능이 작성한 초안입니다. 이용자는 실제 사업에 사용하기 전에 사실관계, 수치, 권리침해 여부와 관계 법령을 확인해야 합니다. 운영자는 고의 또는 중대한 과실이 없는 한 이용자가 확인 없이 결과를 사용해 발생한 손해를 책임지지 않습니다."] },
      { title: "6. 맞춤 제작과 환불 제한(사업계획서·홈페이지)", paragraphs: [settings.refundAfterSupply, "결제 전 완성 결과 예시와 제공 항목을 확인할 수 있습니다. 결제 화면에서는 제작 시작 시점과 단순 변심 환불 제한을 별도로 알리고 전자적 동의를 받습니다."] },
      {
        title: "7. 다시 생성 횟수",
        items: [
          `문서 1부에는 섹션 ‘다시 생성’ ${REGEN_INCLUDED}회가 포함됩니다.`,
          "작성된 글을 이용자가 직접 고쳐 쓰는 것은 횟수에 포함되지 않으며 제한이 없습니다.",
          "인공지능이 실제로 본문을 만들어 낸 경우에만 1회로 계산하며, 생성에 실패한 요청은 차감하지 않습니다.",
          `포함 횟수를 모두 사용하면 ${REGEN_PACK_COUNT}회 묶음을 ${REGEN_PACK_AMOUNT.toLocaleString("ko-KR")}원(부가세 포함)에 추가로 구매할 수 있습니다. 추가 구매는 선택이며, 구매하지 않아도 이미 만들어진 문서의 열람과 내려받기는 계속 이용할 수 있습니다.`,
          "추가 구매한 횟수는 해당 문서에서만 사용할 수 있습니다.",
          "이 조항은 이 조항을 게시한 날 이후에 결제한 문서부터 적용합니다. 그 전에 결제한 문서는 결제 당시의 조건을 그대로 따릅니다.",
        ],
      },
      { title: "8. 도메인 연결·호스팅", items: [`${DOMAIN_PRODUCT_NAME} 상품은 결제일부터 1년 동안 이용자의 도메인을 홈페이지에 연결하고 호스팅합니다.`, `${DOMAIN_PRODUCT_NAME} 상품에서 도메인 등록(구매)은 이용자가 가비아 등 등록기관에서 직접 하며, 등록비와 등록기관의 약관은 이 계약에 포함되지 않습니다.`, "기간이 끝나면 갱신을 안내하며, 갱신 전까지 홈페이지 편집이 제한될 수 있습니다.", ...DOMAIN_REFUND_ITEMS.slice(0, 3), ...DOMAIN_PURCHASE_ITEMS] },
      { title: "9. AI 수정 토큰", items: TOKEN_REFUND_ITEMS },
      { title: "10. 이용자의 콘텐츠와 권리", paragraphs: ["이용자가 입력한 콘텐츠의 권리는 이용자에게 남습니다. 이용자는 서비스 제공에 필요한 범위에서 해당 콘텐츠를 처리할 권한을 운영자에게 부여합니다. 타인의 저작권, 상표권, 개인정보를 침해하는 내용을 입력해서는 안 됩니다."] },
      { title: "11. 금지행위", items: ["서비스 또는 계정의 부정 사용", "보안 우회, 과도한 자동 요청, 역공학", "불법·기만적 사업이나 타인의 권리를 침해하는 결과물 제작", "생성 결과를 전문가의 확정 판단으로 허위 표시하는 행위"] },
      { title: "12. 이용 종료", paragraphs: ["이용자는 계정 삭제를 요청할 수 있습니다. 운영자는 중대한 약관 위반이나 서비스 보안 위험이 있는 경우 사전 통지 후 이용을 제한할 수 있으며, 긴급한 위험은 먼저 제한한 뒤 사유를 알릴 수 있습니다."] },
      { title: "13. 책임과 분쟁", paragraphs: [`문의는 ${shown(settings.supportEmail)} 또는 ${shown(settings.supportPhone)}로 접수합니다. 분쟁은 먼저 협의하여 해결하고, 해결되지 않으면 관계 법령에 따른 관할 법원이나 소비자분쟁조정 절차를 이용할 수 있습니다.`] },
    ],
  };
}

function refundDocument(settings: PlatformLegalSettings): LegalDocument {
  return {
    title: "취소·환불 기준",
    summary: "사업계획서·홈페이지는 맞춤 제작 시작 전에는 전액 환불하며, 제작 시작 후에는 단순 변심 환불이 제한됩니다. 도메인 연결·AI 수정 토큰·다시 생성 추가 횟수는 남은 기간·수량만큼 환불합니다. 미제공·계약 불일치·중대한 하자 등 법정 권리는 그대로 보장합니다.",
    effectiveDate: settings.policyEffectiveDate,
    sections: [
      { title: "1. 서비스 제공 시기", paragraphs: [settings.serviceSupplyTiming] },
      { title: "2. 제공 시작 전", paragraphs: [settings.refundBeforeSupply] },
      { title: "3. 사업계획서·홈페이지: 제작 시작 후 단순 변심", paragraphs: [settings.refundAfterSupply, "아래 도메인 연결·호스팅, AI 수정 토큰, 다시 생성 추가 횟수는 이 제한 대신 각 항목의 기준을 따릅니다."] },
      { title: "4. 결제 전 확인 방법", paragraphs: ["‘내 사업’ 화면의 ‘완성 예시 보기’에서 샘플 사업계획서 전체를 결제 전에 읽어볼 수 있고, 홈페이지는 결제 전에 내 사업으로 만든 초안을 미리 볼 수 있습니다. 결제 화면에서는 제작 시작 시점과 환불 제한을 별도 항목으로 확인하고 동의합니다."] },
      { title: "5. 하자와 계약 불이행", paragraphs: ["약정한 핵심 결과물이 제공되지 않거나 표시·광고 또는 계약 내용과 다르게 제공된 경우, 정상적으로 이용할 수 없는 중대한 하자가 있고 합리적인 기간 안에 고쳐지지 않은 경우에는 관계 법령에 따라 재제공, 일부 환급 또는 전액 환급을 요청할 수 있습니다."] },
      {
        title: "6. 다시 생성 추가 구매",
        paragraphs: [
          `문서 1부에는 섹션 ‘다시 생성’ ${REGEN_INCLUDED}회가 포함됩니다. 작성한 글을 직접 고쳐 쓰는 것은 횟수에 포함되지 않으며 제한이 없습니다.`,
          `포함된 횟수를 모두 사용한 뒤에는 ${REGEN_PACK_COUNT}회 묶음을 ${REGEN_PACK_AMOUNT.toLocaleString("ko-KR")}원(부가세 포함)에 추가로 구매할 수 있습니다. 추가 구매는 선택이며, 구매하지 않아도 이미 만들어진 문서의 열람과 내려받기는 그대로 이용할 수 있습니다.`,
          "인공지능이 실제로 본문을 만들어 낸 경우에만 1회로 계산합니다. 생성에 실패한 요청은 횟수에서 차감하지 않습니다.",
          "추가 구매한 횟수는 해당 문서에서만 사용할 수 있고 다른 문서로 옮길 수 없습니다. 사용하지 않은 횟수는 결제일부터 7일 이내에 전액 환급을 요청할 수 있으며, 일부라도 사용한 경우에는 남은 횟수에 해당하는 금액을 환급합니다.",
        ],
      },
      { title: "7. 도메인 연결 + 호스팅 1년", items: [...DOMAIN_REFUND_ITEMS, ...DOMAIN_PURCHASE_REFUND_ITEMS.map((item) => `${DOMAIN_PURCHASE_PRODUCT_NAME}: ${item}`)] },
      { title: "8. AI 수정 토큰", items: TOKEN_REFUND_ITEMS },
      {
        title: "9. 신청 방법과 처리",
        items: [
          `신청: ${shown(settings.supportEmail)} / ${shown(settings.supportPhone)}`,
          "주문번호, 결제일과 신청 사유를 알려주세요. 이전에 계좌이체로 결제한 주문은 입금자명도 함께 알려주세요.",
          "환불이 확정되면 3영업일 이내에 처리합니다.",
          "카드 결제는 결제대행사(나이스페이먼츠)를 통해 승인 취소하며, 일부 환불은 부분 취소로 처리합니다. 카드사 사정에 따라 청구 내역과 한도에 반영되기까지 영업일 기준 3~7일이 더 걸릴 수 있습니다.",
          "이전에 계좌이체로 결제한 주문은 본인 확인이 가능한 환급 계좌를 안내받아 송금합니다. 운영자가 환급 완료를 기록한 뒤에도 은행 처리 시간에 따라 계좌 반영이 늦어질 수 있습니다.",
          "중복 결제나 금액 착오가 확인되면 실제 결제액을 기준으로 정산합니다.",
        ],
      },
      { title: "10. 법정 권리", paragraphs: ["이 기준은 전자상거래법 등 관계 법령이 보장하는 소비자의 청약철회, 계약 해제·해지, 손해배상 권리를 제한하지 않습니다."] },
    ],
  };
}

export function createLegalDocument(type: LegalDocumentType, settings: PlatformLegalSettings): LegalDocument {
  if (type === "business") return businessDocument(settings);
  if (type === "privacy") return privacyDocument(settings);
  if (type === "ai") return aiDocument(settings);
  if (type === "terms") return termsDocument(settings);
  return refundDocument(settings);
}
