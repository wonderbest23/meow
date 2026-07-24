import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { createPaymentOrderSchema } from "../../../../lib/payments/domain";
import {
  createPaymentOrder,
  getPaymentOrder,
  paymentPersistenceMode,
} from "../../../../lib/payments/repository";
import { paymentsEnabled } from "../../../../lib/payments/config";
import { MANUAL_TRANSFER_BANK, manualTransferPaymentConfigured } from "../../../../lib/payments/manual-transfer";
import { evaluatePlatformLaunchReadiness } from "../../../../lib/platform-legal/domain";
import { getPlatformLegalSettings } from "../../../../lib/platform-legal/repository";
import { authConfigured } from "../../../../lib/account-auth";

export async function POST(request: Request) {
  try {
    if (!paymentsEnabled()) {
      return NextResponse.json(
        {
          error: {
            code: "BETA_FREE_ACCESS_ACTIVE",
            message: "현재 베타 테스트 기간에는 결제 없이 바로 이용할 수 있습니다.",
            retryable: false,
          },
        },
        { status: 409 },
      );
    }
    const persistence = paymentPersistenceMode();
    const legalSettings = await getPlatformLegalSettings();
    const readiness = evaluatePlatformLaunchReadiness(legalSettings, {
      authConfigured: authConfigured(),
      paymentsConfigured: manualTransferPaymentConfigured() && persistence === "supabase",
    });
    if (!readiness.paymentAllowed) {
      return NextResponse.json(
        { error: { code: "PAID_LAUNCH_BLOCKED", message: `정식 결제 준비가 완료되지 않았습니다: ${readiness.missing.join(", ")}`, retryable: false } },
        { status: 503 },
      );
    }
    const input = createPaymentOrderSchema.parse(await request.json());
    const identity = await requireAuthenticatedIdentity();
    if (input.method !== "TRANSFER") {
      return NextResponse.json(
        { error: { code: "PAYMENT_METHOD_NOT_AVAILABLE", message: "현재는 계좌이체로만 신청할 수 있습니다.", retryable: false } },
        { status: 400 },
      );
    }
    if (process.env.NODE_ENV === "production" && (!manualTransferPaymentConfigured() || persistence !== "supabase")) {
      return NextResponse.json(
        {
          error: {
            code: "PAYMENT_NOT_CONFIGURED",
            message: "운영 결제 또는 영구 저장소가 설정되지 않아 주문을 받을 수 없습니다.",
            retryable: false,
          },
        },
        { status: 503 },
      );
    }
    const order = await createPaymentOrder({
      guestTokenHash: identity.hash,
      ownerId: identity.userId,
      customerEmail: identity.email,
      opportunity: input.opportunity,
      founderProfile: input.founderProfile,
      method: input.method,
      customer: input.customer,
    });
    return NextResponse.json(
      {
        order: {
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          orderName: order.orderName,
          method: order.method,
          expiresAt: order.expiresAt,
        },
        paymentMode: "manual_transfer",
        bankAccount: MANUAL_TRANSFER_BANK,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED") {
      return NextResponse.json({ error: { code: "ACCOUNT_LOGIN_REQUIRED", message: "결제 전에 로그인해주세요.", retryable: false } }, { status: 401 });
    }
    return NextResponse.json(
      {
        error: {
          code: "PAYMENT_ORDER_CREATE_FAILED",
          message: error instanceof Error ? error.message : "결제 주문을 생성하지 못했습니다.",
          retryable: true,
        },
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const orderId = new URL(request.url).searchParams.get("orderId")?.trim();
    if (!orderId) throw new Error("PAYMENT_ORDER_ID_REQUIRED");
    const identity = await requireAuthenticatedIdentity();
    const order = await getPaymentOrder(orderId, identity.hash);
    if (!order) {
      return NextResponse.json({ error: { code: "PAYMENT_ORDER_NOT_FOUND", message: "주문을 찾을 수 없습니다." } }, { status: 404 });
    }
    return NextResponse.json({
      order: {
        orderId: order.orderId,
        amount: order.amount,
        orderName: order.orderName,
        status: order.status,
        projectId: order.projectId,
        depositorName: order.depositorName,
        expiresAt: order.expiresAt,
        confirmedAt: order.confirmedAt,
        depositReportedAt: order.depositReportedAt,
        cashReceiptType: order.cashReceiptType,
        cashReceiptStatus: order.cashReceiptStatus,
      },
      bankAccount: order.method === "TRANSFER" ? MANUAL_TRANSFER_BANK : null,
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED") {
      return NextResponse.json({ error: { code: "ACCOUNT_LOGIN_REQUIRED", message: "주문을 확인하려면 로그인해주세요." } }, { status: 401 });
    }
    return NextResponse.json({ error: { code: "PAYMENT_ORDER_LOAD_FAILED", message: error instanceof Error ? error.message : "주문을 불러오지 못했습니다." } }, { status: 400 });
  }
}
