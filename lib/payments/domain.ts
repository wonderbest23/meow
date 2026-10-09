import { z } from "zod";
import { opportunitySnapshotSchema } from "../service-domain";

/*
 * 출시 기념가(2026-09 출시). 첫 결제 문턱을 낮춰 결제 경험자를 먼저 모은다.
 * 할인율·종전가 표시는 하지 않는다 — 이 가격이 실제 판매가다(표시광고법상 허위 할인 방지).
 *
 * 가격 구조(소유자 결정 2026-10-09): 무료 체험은 없다 — 사업계획서 본문은 결제 후에만 쓴다.
 * 입구(첫 결제)는 싸게, 만든 뒤 고치고 다듬는 비용(다시 생성 묶음)과 도메인 연결로 계속 받는다.
 * 운영 실측 AI 원가(Opus 5.5, 2026-08~10 llm_usage): 계획서 1부 약 5~8천원, 항목 하나 다시 쓰기 약 430원,
 * 홈페이지 AI 채우기 1회 약 120원.
 */
export const LAUNCH_PRICE_LABEL = "출시 기념가";
export const PACKAGE_AMOUNT = 49_000;
export const PACKAGE_LIST_AMOUNT = 199_000;
export const CUSTOM_HOMEPAGE_FROM_AMOUNT = 490_000;
/** 계획서로 만든 홈페이지의 수정·공개 권한 가격 — 그 사업의 계획서를 결제한 분만 살 수 있다(법적 고지 문서도 이 값을 쓴다) */
export const HOMEPAGE_PRODUCT_AMOUNT = 19_000;
/** 계획서 + 홈페이지 묶음 — 따로 사면 68,000원. 주력 상품(첫 결제 입구) */
export const BUNDLE_PRODUCT_NAME = "사업계획서 + 홈페이지";
export const BUNDLE_PRODUCT_AMOUNT = 59_000;
export const PACKAGE_NAME = "맞춤 사업 실행 파일";
export const PACKAGE_SUPPLY_AMOUNT = Math.round(PACKAGE_AMOUNT / 1.1);
export const PACKAGE_VAT_AMOUNT = PACKAGE_AMOUNT - PACKAGE_SUPPLY_AMOUNT;
/*
 * 섹션 다시 생성 — 문서 1부에 포함되는 횟수와 추가 묶음.
 *
 * '무제한'으로 팔면 AI 실비가 그대로 손실이 된다. 다만 손님이 예측할 수 있는
 * 단위여야 해서 실비가 아니라 횟수로 판다 — 모델 단가가 바뀌어도 약속이
 * 흔들리지 않고, 남은 횟수를 화면에서 눈으로 볼 수 있다.
 *
 * 여기서 세는 것은 '이미 쓰인 섹션을 AI 로 다시 만드는 것'뿐이다. 손님이
 * 직접 글을 고쳐 쓰는 것은 비용이 들지 않으므로 제한하지 않는다.
 */
export const REGEN_INCLUDED = 10;
/** 2026-10-09 약관 이전에 결제한 계획서는 결제 당시 약속대로 20회 — 기존 구매자 조건은 줄이지 않는다 */
export const LEGACY_REGEN_INCLUDED = 20;
/** 이 날짜(약관 버전 앞 10자리)부터 결제한 계획서에 새 포함량(다시 생성·무료 반영)을 적용한다 */
export const ALLOWANCE_TERMS_FROM = "2026-10-09";
export const REGEN_PACK_COUNT = 10;
export const REGEN_PACK_AMOUNT = 9_900;
export const REGEN_PACK_NAME = "다시 생성 10회";

/** 결제 주문에 남은 약관 버전으로 새 포함량 대상인지 본다. 버전이 없거나 그 전이면 예전 조건 */
export function isCurrentAllowanceTerms(termsVersion: unknown): boolean {
  return typeof termsVersion === "string" && termsVersion.slice(0, 10) >= ALLOWANCE_TERMS_FROM;
}

export const TERMS_VERSION = "2026-10-09-paid-first-pricing";

export const paymentMethodSchema = z.enum(["CARD", "TOSSPAY", "TRANSFER"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const cashReceiptTypeSchema = z.enum(["PERSONAL", "BUSINESS", "NONE"]);
export type CashReceiptType = z.infer<typeof cashReceiptTypeSchema>;

export const manualTransferCustomerSchema = z.object({
  depositorName: z.string().trim().min(2, "입금자명을 2자 이상 입력해주세요.").max(40),
  phone: z.string().trim().regex(/^01[016789]-?\d{3,4}-?\d{4}$/, "휴대전화 번호를 확인해주세요."),
  cashReceiptType: cashReceiptTypeSchema,
  cashReceiptIdentifier: z.string().trim().max(30).default(""),
}).superRefine((value, context) => {
  if (value.cashReceiptType === "PERSONAL" && !/^01[016789]\d{7,8}$/.test(value.cashReceiptIdentifier.replaceAll("-", ""))) {
    context.addIssue({ code: "custom", path: ["cashReceiptIdentifier"], message: "현금영수증용 휴대전화 번호를 확인해주세요." });
  }
  if (value.cashReceiptType === "BUSINESS" && !/^\d{10}$/.test(value.cashReceiptIdentifier.replaceAll("-", ""))) {
    context.addIssue({ code: "custom", path: ["cashReceiptIdentifier"], message: "현금영수증용 사업자등록번호 10자리를 확인해주세요." });
  }
});

export const createPaymentOrderSchema = z.object({
  opportunity: opportunitySnapshotSchema,
  founderProfile: z.record(z.string(), z.unknown()).default({}),
  method: paymentMethodSchema,
  customer: manualTransferCustomerSchema.optional(),
  terms: z.object({
    service: z.literal(true),
    privacy: z.literal(true),
    refund: z.literal(true),
    aiLimitations: z.literal(true),
    digitalSupply: z.literal(true),
    personalizedDigitalNoRefund: z.literal(true),
  }),
}).superRefine((value, context) => {
  if (value.method === "TRANSFER" && !value.customer) {
    context.addIssue({ code: "custom", path: ["customer"], message: "계좌이체 주문 정보를 입력해주세요." });
  }
});

export const confirmPaymentSchema = z.object({
  paymentKey: z.string().min(10).max(300),
  orderId: z.string().min(6).max(64),
  amount: z.number().int().positive(),
});

export const testConfirmSchema = z.object({
  orderId: z.string().min(6).max(64),
});

export type PaymentOrderStatus =
  | "created"
  | "awaiting_deposit"
  | "deposit_reported"
  | "confirming"
  | "done"
  | "refunded"
  | "canceled"
  | "partial_canceled"
  | "aborted"
  | "expired"
  | "failed";

export type PaymentOrder = {
  id: string;
  orderId: string;
  guestTokenHash: string;
  amount: number;
  currency: "KRW";
  orderName: string;
  ownerId: string | null;
  customerEmail: string | null;
  method: PaymentMethod;
  status: PaymentOrderStatus;
  providerStatus: string | null;
  paymentKey: string | null;
  projectId: string | null;
  opportunity: Record<string, unknown>;
  founderProfile: Record<string, unknown>;
  termsVersion: string;
  termsAgreedAt: string;
  rawResponse: Record<string, unknown> | null;
  failureCode: string | null;
  failureMessage: string | null;
  expiresAt: string;
  confirmedAt: string | null;
  depositorName: string | null;
  customerPhone: string | null;
  cashReceiptType: CashReceiptType | null;
  cashReceiptIdentifier: string | null;
  cashReceiptStatus: "not_requested" | "requested" | "issued";
  cashReceiptIssuedAt: string | null;
  depositReportedAt: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TossPaymentResponse = {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: string;
  totalAmount: number;
  balanceAmount: number;
  method: string | null;
  approvedAt: string | null;
  cancels?: Array<{ cancelAmount: number; canceledAt: string; cancelStatus: string }> | null;
  [key: string]: unknown;
};

/*
 * 홈페이지 부가 상품 — 원가 대비 남는 구조로 잡았다.
 *
 * 도메인 연결 + 호스팅 1년 59,000원
 *   원가: Cloudflare for SaaS 커스텀 호스트네임(100개까지 무료, 이후 월 $0.10)
 *   + 트래픽·저장 ≈ 연 1,000~2,000원. 마진 95% 안팎. 도메인 '등록'은 손님이
 *   가비아 등에서 직접 사고(연 1~2만원), 우리는 연결과 운영을 판다.
 *   1년 지나면 연결을 끊지 않고 갱신을 안내한다(갱신 전까지 편집만 막는다).
 *
 * AI 수정 토큰 20만 9,900원
 *   홈페이지 글을 AI 에게 시켜 고치는 기능. 한 번에 페이지 글 자리 전체
 *   (~6k 입력) + 답(~2k 출력) ≈ 8k 토큰 → 팩 하나로 25회 안팎.
 *   원가(Claude Sonnet 5 기준 입력 $3/M·출력 $15/M): 20만 토큰 ≈ $1.2 ≈
 *   1,700원 → 마진 80% 이상. 플랜(홈페이지) 단위로 쌓이고, 실패한 호출은
 *   차감하지 않는다.
 */
export const DOMAIN_PRODUCT_NAME = "내 도메인 연결 + 호스팅 1년";
export const DOMAIN_PRODUCT_AMOUNT = 59_000;
export const DOMAIN_PRODUCT_DAYS = 365;
/* 도메인이 없는 분 — 운영자가 사장님 명의로 사서 연결한다(첫해 등록비 포함, .com·.kr·.co.kr) */
export const DOMAIN_PURCHASE_PRODUCT_NAME = "도메인 구매 + 연결·호스팅 1년";
export const DOMAIN_PURCHASE_PRODUCT_AMOUNT = 79_000;
/** 등록한 뒤에는 돌려받을 수 없는 등록비 몫 — 나머지는 연결·호스팅 환불 기준을 따른다 */
export const DOMAIN_PURCHASE_REGISTRATION_AMOUNT = DOMAIN_PURCHASE_PRODUCT_AMOUNT - DOMAIN_PRODUCT_AMOUNT;

export const TOKEN_PACK_NAME = "홈페이지 AI 수정 토큰 20만";
export const TOKEN_PACK_AMOUNT = 9_900;
export const TOKEN_PACK_TOKENS = 200_000;
/** 충전한 토큰은 충전일부터 이 기간 동안 쓸 수 있다 (약관·환불 기준에 같은 값으로 고지) */
export const TOKEN_VALIDITY_DAYS = 365;
