import { z } from "zod";
import { opportunitySnapshotSchema } from "../service-domain";

export const PACKAGE_AMOUNT = 990_000;
export const PACKAGE_NAME = "21일 창업 실행 과정";
export const TERMS_VERSION = "2026-07-12";

export const paymentMethodSchema = z.enum(["CARD", "TOSSPAY", "TRANSFER"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const createPaymentOrderSchema = z.object({
  opportunity: opportunitySnapshotSchema,
  founderProfile: z.record(z.string(), z.unknown()).default({}),
  method: paymentMethodSchema,
  terms: z.object({
    service: z.literal(true),
    privacy: z.literal(true),
    refund: z.literal(true),
    aiLimitations: z.literal(true),
  }),
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
  | "confirming"
  | "done"
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
