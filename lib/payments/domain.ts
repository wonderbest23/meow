import { z } from "zod";
import { opportunitySnapshotSchema } from "../service-domain";

export const PACKAGE_AMOUNT = 149_000;
export const PACKAGE_LIST_AMOUNT = 199_000;
export const CUSTOM_HOMEPAGE_FROM_AMOUNT = 490_000;
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
export const REGEN_INCLUDED = 20;
export const REGEN_PACK_COUNT = 10;
export const REGEN_PACK_AMOUNT = 4_900;
export const REGEN_PACK_NAME = "다시 생성 10회";

export const TERMS_VERSION = "2026-07-23-custom-digital";

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

export const TOKEN_PACK_NAME = "홈페이지 AI 수정 토큰 20만";
export const TOKEN_PACK_AMOUNT = 9_900;
export const TOKEN_PACK_TOKENS = 200_000;
