import { z } from "zod";
import { opportunitySnapshotSchema } from "../service-domain";

export const PACKAGE_AMOUNT = 149_000;
export const PACKAGE_LIST_AMOUNT = 199_000;
export const CUSTOM_HOMEPAGE_FROM_AMOUNT = 490_000;
export const PACKAGE_NAME = "맞춤 사업 실행 파일";
export const PACKAGE_SUPPLY_AMOUNT = Math.round(PACKAGE_AMOUNT / 1.1);
export const PACKAGE_VAT_AMOUNT = PACKAGE_AMOUNT - PACKAGE_SUPPLY_AMOUNT;
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
