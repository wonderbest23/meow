import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { createPaymentOrderSchema } from "../../../../lib/payments/domain";
import {
  createPaymentOrder,
  paymentPersistenceMode,
} from "../../../../lib/payments/repository";
import { tossConfigured } from "../../../../lib/payments/toss-client";
import { paymentsEnabled } from "../../../../lib/payments/config";

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
    const input = createPaymentOrderSchema.parse(await request.json());
    const identity = await requireGuestIdentity();
    const tossReady = tossConfigured();
    const persistence = paymentPersistenceMode();
    if (process.env.NODE_ENV === "production" && (!tossReady || persistence !== "supabase")) {
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
      opportunity: input.opportunity,
      founderProfile: input.founderProfile,
      method: input.method,
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
        paymentMode: tossReady ? "toss" : "development_test",
        clientKey: tossReady ? process.env.TOSS_CLIENT_KEY : null,
      },
      { status: 201 },
    );
  } catch (error) {
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
