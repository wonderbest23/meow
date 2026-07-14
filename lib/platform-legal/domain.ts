import { z } from "zod";

export const PLATFORM_POLICY_VERSION = "2026-07-14";

export const platformLegalSettingsSchema = z.object({
  serviceName: z.string().trim().min(1).max(80),
  operatorName: z.string().trim().max(120),
  representativeName: z.string().trim().max(80),
  businessRegistrationNumber: z.string().trim().max(20),
  mailOrderSalesNumber: z.string().trim().max(60),
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
  mailOrderSalesNumber: "",
  businessAddress: "",
  supportEmail: "",
  supportPhone: "",
  privacyOfficer: "",
  privacyEmail: "",
  hostingProvider: "Cloudflare, Inc.",
  policyEffectiveDate: "2026-07-14",
  accountRetention: "회원 탈퇴 시까지 보관하며, 법령상 보존 의무가 있는 정보는 해당 기간 동안 분리 보관합니다.",
  projectRetention: "사용자가 프로젝트를 삭제하거나 회원 탈퇴를 요청할 때까지 보관합니다.",
  infrastructureRecipients: "Supabase, Inc. 및 Cloudflare, Inc.",
  infrastructureCountries: "",
  infrastructureProcessingDetails: "Supabase는 로그인·계정 복구와 프로젝트 데이터베이스를, Cloudflare는 웹 호스팅·콘텐츠 전송·보안과 오류 기록을 처리합니다.",
  overseasRecipient: "OpenAI 및 OpenAI가 공개한 하위처리자",
  overseasCountries: "",
  overseasTransferredData: "사업 아이디어, 경력·관심사, 예산·가능 시간, 지역과 사용자가 입력한 프로젝트 내용 중 생성에 필요한 부분",
  overseasPurpose: "맞춤 사업 추천, 문서 초안 작성, 문장 수정과 이미지 생성",
  overseasTimingAndMethod: "사용자가 인공지능 생성 기능을 실행할 때 암호화된 통신망으로 전송",
  overseasRetention: "텍스트 생성 요청은 저장 옵션을 끄고 전송합니다. 이미지 생성 등 기능별 처리 기준은 다를 수 있으며, 오남용 방지 로그는 OpenAI의 기본 정책에 따라 최대 30일 보관될 수 있습니다. 법적 의무가 있으면 더 길어질 수 있습니다.",
  overseasRefusalImpact: "인공지능 처리를 원하지 않으면 해당 생성 기능을 사용하지 않을 수 있습니다. 이 경우 기본 계산·서식 기능은 이용할 수 있지만 맞춤 문장·이미지 생성은 제한됩니다.",
  refundBeforeSupply: "유료 디지털 결과물의 제공이 시작되기 전에는 결제를 전액 취소합니다.",
  refundAfterSupply: "제공이 시작된 뒤에는 전자상거래법상 청약철회 가능 여부, 제공된 범위와 하자를 확인하여 처리합니다. 법에서 보장한 소비자 권리는 이 기준보다 우선합니다.",
  serviceSupplyTiming: "결제 승인 직후 프로젝트와 기본 결과물 생성을 시작하고, 사용자의 단계별 입력과 승인에 따라 후속 결과물을 제공합니다.",
  legalReviewConfirmed: false,
  openAiRegionConfirmed: false,
  infrastructureRegionConfirmed: false,
  authEmailDeliveryConfirmed: false,
};

const requiredFields: Array<{ key: keyof PlatformLegalSettings; label: string }> = [
  { key: "operatorName", label: "상호 또는 운영자명" },
  { key: "representativeName", label: "대표자명" },
  { key: "businessRegistrationNumber", label: "사업자등록번호" },
  { key: "mailOrderSalesNumber", label: "통신판매업 신고번호" },
  { key: "businessAddress", label: "사업장 주소" },
  { key: "supportEmail", label: "고객 문의 이메일" },
  { key: "supportPhone", label: "고객 문의 전화번호" },
  { key: "privacyOfficer", label: "개인정보 보호책임자" },
  { key: "privacyEmail", label: "개인정보 문의 이메일" },
  { key: "policyEffectiveDate", label: "정책 시행일" },
  { key: "infrastructureCountries", label: "Supabase·Cloudflare 실제 처리 국가" },
  { key: "overseasRecipient", label: "국외 이전받는 자" },
  { key: "overseasCountries", label: "실제 국외 처리 국가" },
  { key: "refundBeforeSupply", label: "제공 시작 전 환불 기준" },
  { key: "refundAfterSupply", label: "제공 시작 후 환불 기준" },
  { key: "serviceSupplyTiming", label: "서비스 제공 시기" },
];

export type LaunchReadiness = {
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
  if (!settings.openAiRegionConfirmed) missing.push("OpenAI 실제 처리 지역 확인");
  if (!settings.infrastructureRegionConfirmed) missing.push("Supabase·Cloudflare 처리 지역 확인");
  if (!settings.authEmailDeliveryConfirmed) missing.push("가입·계정복구 메일 실사용 확인");
  if (!settings.legalReviewConfirmed) missing.push("운영자 최종 검토 확인");
  if (!options.authConfigured) missing.push("로그인·계정 복구 설정");

  const warnings = [
    "운영자 정보나 수탁사 설정이 바뀌면 공개 문서도 즉시 갱신해야 합니다.",
    "이 자동 문서는 실제 운영값을 반영하는 초안이며 법률 자문을 대신하지 않습니다.",
  ];

  const ready = missing.length === 0;
  return {
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

function shown(value: string, fallback = "정식 출시 전 입력 예정") {
  return value.trim() || fallback;
}

function businessDocument(settings: PlatformLegalSettings): LegalDocument {
  return {
    title: "사업자 정보",
    summary: "오늘창업을 운영하고 온라인 서비스를 제공하는 판매자 정보입니다.",
    effectiveDate: settings.policyEffectiveDate,
    sections: [{
      title: "판매자 정보",
      items: [
        `상호 또는 운영자명: ${shown(settings.operatorName)}`,
        `대표자: ${shown(settings.representativeName)}`,
        `사업자등록번호: ${shown(settings.businessRegistrationNumber)}`,
        `통신판매업 신고번호: ${shown(settings.mailOrderSalesNumber)}`,
        `사업장 주소: ${shown(settings.businessAddress)}`,
        `고객 문의: ${shown(settings.supportPhone)} / ${shown(settings.supportEmail)}`,
        `호스팅서비스 제공자: ${shown(settings.hostingProvider)}`,
      ],
    }],
  };
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
          "계정: 이메일, 인증 식별자 - 로그인, 본인 확인, 계정 복구",
          "사업 설계: 경력, 관심사, 예산, 가능한 시간, 지역, 사업 아이디어와 프로젝트 입력 - 맞춤 추천과 결과물 작성",
          "결제: 주문번호, 결제 금액·상태, 결제수단 종류, 결제 승인 식별자 - 결제 확인, 취소·환불, 분쟁 대응. 카드번호와 계좌 비밀번호는 오늘창업이 저장하지 않습니다.",
          "문의: 이메일 또는 대화 내용 - 고객 요청 처리",
          "자동 생성 정보: 접속 기록, 쿠키, 기기·브라우저 정보, IP 주소 - 보안, 오류 대응, 부정 이용 방지",
          "OpenAI 연결 정보: 사용자가 직접 입력한 API 키의 끝 4자리와 연결 시각 - 연결 상태 표시. 키 원문은 데이터베이스와 브라우저 저장소에 보관하지 않고 서버 메모리에서 최대 4시간 사용합니다.",
        ],
      },
      {
        title: "2. 보유 및 이용 기간",
        items: [
          `계정 정보: ${settings.accountRetention}`,
          `프로젝트 정보: ${settings.projectRetention}`,
          "계약·결제·공급 기록은 전자상거래법 등 관계 법령에서 요구하는 기간 동안 분리 보관할 수 있습니다.",
        ],
      },
      {
        title: "3. 개인정보의 처리위탁과 국외 처리",
        paragraphs: [
          "서비스 운영을 위해 Supabase(로그인·데이터베이스), Cloudflare(호스팅·보안), 결제 개시 후 토스페이먼츠(결제), OpenAI(인공지능 생성)를 이용할 수 있습니다.",
          `기반 서비스 국외 처리: ${shown(settings.infrastructureRecipients)} / 처리 국가 ${shown(settings.infrastructureCountries, "실제 Supabase 프로젝트와 Cloudflare 계약의 처리 지역 확인 후 입력")} / ${settings.infrastructureProcessingDetails}`,
          "OpenAI로 전송되는 항목, 국가, 시기와 방법, 보관 기준은 ‘인공지능 및 국외 처리 안내’에서 별도로 확인할 수 있습니다.",
        ],
      },
      {
        title: "4. 파기 절차와 방법",
        paragraphs: ["이용 목적이 끝난 개인정보는 지체 없이 삭제합니다. 법령상 보존해야 하는 정보는 별도 공간에 분리한 뒤 보존기간이 끝나면 복구하기 어려운 방법으로 삭제합니다."],
      },
      {
        title: "5. 이용자의 권리",
        paragraphs: ["이용자는 자신의 개인정보 열람, 정정, 삭제, 처리정지와 동의 철회를 요청할 수 있습니다. 계정 화면 또는 개인정보 문의처를 통해 요청하면 본인 확인 후 처리합니다. 만 14세 미만 이용자는 법정대리인 동의 없이 가입할 수 없습니다."],
      },
      {
        title: "6. 안전성 확보 조치",
        items: ["전송 구간 암호화", "비밀번호 원문 미보관", "관리자 권한 제한과 인증", "서비스 역할키의 브라우저 비공개", "접근 기록과 오류 점검"],
      },
      {
        title: "7. 쿠키",
        paragraphs: ["로그인 상태와 비회원 프로젝트를 구분하기 위해 필수 쿠키를 사용합니다. 필수 쿠키를 차단하면 로그인 또는 저장한 프로젝트 이용이 어려울 수 있습니다."],
      },
      {
        title: "8. 개인정보 문의",
        items: [
          `개인정보 보호책임자: ${shown(settings.privacyOfficer)}`,
          `이메일: ${shown(settings.privacyEmail)}`,
          `전화: ${shown(settings.supportPhone)}`,
        ],
      },
      {
        title: "9. 방침 변경",
        paragraphs: ["이 방침이 바뀌면 시행 전에 서비스 화면에서 변경 내용과 시행일을 알립니다. 이용자 권리에 중대한 변경은 필요한 방식으로 별도 안내합니다."],
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
        title: "3. OpenAI 국외 처리",
        items: [
          `이전받는 자: ${shown(settings.overseasRecipient)}`,
          `처리 국가: ${shown(settings.overseasCountries, "운영 중인 OpenAI 계정의 실제 처리 지역 확인 후 입력")}`,
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
      { title: "3. 서비스 제공", items: [`제공 시기: ${settings.serviceSupplyTiming}`, "사용자의 입력과 승인에 따라 추천, 보고서, 사업계획서, 판매 페이지와 실행 안내를 제공합니다.", "베타 기능은 예고 후 변경될 수 있으나 이미 결제한 상품의 핵심 제공 범위를 일방적으로 축소하지 않습니다."] },
      { title: "4. 인공지능 결과", paragraphs: ["일부 결과는 생성형 인공지능이 작성한 초안입니다. 이용자는 실제 사업에 사용하기 전에 사실관계, 수치, 권리침해 여부와 관계 법령을 확인해야 합니다. 운영자는 고의 또는 중대한 과실이 없는 한 이용자가 확인 없이 결과를 사용해 발생한 손해를 책임지지 않습니다."] },
      { title: "5. 이용자의 콘텐츠와 권리", paragraphs: ["이용자가 입력한 콘텐츠의 권리는 이용자에게 남습니다. 이용자는 서비스 제공에 필요한 범위에서 해당 콘텐츠를 처리할 권한을 운영자에게 부여합니다. 타인의 저작권, 상표권, 개인정보를 침해하는 내용을 입력해서는 안 됩니다."] },
      { title: "6. 금지행위", items: ["서비스 또는 계정의 부정 사용", "보안 우회, 과도한 자동 요청, 역공학", "불법·기만적 사업이나 타인의 권리를 침해하는 결과물 제작", "생성 결과를 전문가의 확정 판단으로 허위 표시하는 행위"] },
      { title: "7. 이용 종료", paragraphs: ["이용자는 계정 삭제를 요청할 수 있습니다. 운영자는 중대한 약관 위반이나 서비스 보안 위험이 있는 경우 사전 통지 후 이용을 제한할 수 있으며, 긴급한 위험은 먼저 제한한 뒤 사유를 알릴 수 있습니다."] },
      { title: "8. 책임과 분쟁", paragraphs: [`문의는 ${shown(settings.supportEmail)} 또는 ${shown(settings.supportPhone)}로 접수합니다. 분쟁은 먼저 협의하여 해결하고, 해결되지 않으면 관계 법령에 따른 관할 법원이나 소비자분쟁조정 절차를 이용할 수 있습니다.`] },
    ],
  };
}

function refundDocument(settings: PlatformLegalSettings): LegalDocument {
  return {
    title: "취소·환불 기준",
    summary: "결제 전 제공 시기와 디지털 결과물 공급 개시 여부를 확인하고, 법에서 보장한 청약철회 권리를 우선 적용합니다.",
    effectiveDate: settings.policyEffectiveDate,
    sections: [
      { title: "1. 서비스 제공 시기", paragraphs: [settings.serviceSupplyTiming] },
      { title: "2. 제공 시작 전", paragraphs: [settings.refundBeforeSupply] },
      { title: "3. 제공 시작 후", paragraphs: [settings.refundAfterSupply] },
      { title: "4. 하자와 계약 불이행", paragraphs: ["약정한 핵심 결과물이 제공되지 않거나 정상적으로 이용할 수 없는 하자가 있고 합리적인 기간 안에 고쳐지지 않으면, 관계 법령에 따라 재제공, 일부 환불 또는 전액 환불을 요청할 수 있습니다."] },
      { title: "5. 신청 방법과 처리", items: [`신청: ${shown(settings.supportEmail)} / ${shown(settings.supportPhone)}`, "주문번호, 결제일, 신청 사유를 알려주세요.", "환불이 승인되면 원 결제수단을 통해 처리하며 결제사 사정에 따라 실제 반영까지 시간이 걸릴 수 있습니다."] },
      { title: "6. 법정 권리", paragraphs: ["이 기준은 전자상거래법 등 관계 법령이 보장하는 소비자의 청약철회, 계약 해제·해지, 손해배상 권리를 제한하지 않습니다."] },
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
