import { NextResponse } from "next/server";
import {
  completePaymentOrder,
  getPaymentOrder,
  getPaymentOrderByKey,
  recordPaymentEvent,
  syncPaymentFromProvider,
} from "../../../../lib/payments/repository";
import { queryTossPayment } from "../../../../lib/payments/toss-client";

type TossWebhook = {
  eventType?: string;
  data?: {
    paymentKey?: string;
    orderId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export async function POST(request: Request) {
  try {
    const payload = await request.json() as TossWebhook;
    const paymentKey = payload.data?.paymentKey;
    if (!paymentKey) {
      return NextResponse.json(
        { error: { code: "PAYMENT_KEY_REQUIRED", message: "결제 식별자가 없습니다." } },
        { status: 400 },
      );
    }
    const order =
      await getPaymentOrderByKey(paymentKey) ??
      (payload.data?.orderId ? await getPaymentOrder(payload.data.orderId) : null);
    if (!order) {
      return NextResponse.json(
        { error: { code: "PAYMENT_ORDER_NOT_FOUND", message: "연결된 주문을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    // 일반 결제 웹훅에는 서명이 없으므로 토스 조회 API 응답만 신뢰합니다.
    const provider = await queryTossPayment(paymentKey);
    if (
      provider.paymentKey !== paymentKey ||
      provider.orderId !== order.orderId ||
      provider.totalAmount !== order.amount
    ) {
      return NextResponse.json(
        { error: { code: "PAYMENT_PROVIDER_MISMATCH", message: "결제사 조회 결과가 서버 주문과 다릅니다." } },
        { status: 409 },
      );
    }

    const synced = await syncPaymentFromProvider(order, provider);
    if (provider.status === "DONE" && !synced.projectId) {
      await completePaymentOrder({ order: synced, provider, testPaid: false });
    }
    const transmissionId = request.headers.get("tosspayments-webhook-transmission-id");
    const accepted = await recordPaymentEvent(
      transmissionId,
      payload.eventType ?? "UNKNOWN",
      payload as Record<string, unknown>,
    );
    return NextResponse.json({ accepted, status: provider.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "PAYMENT_WEBHOOK_FAILED",
          message: error instanceof Error ? error.message : "결제 상태를 동기화하지 못했습니다.",
          retryable: true,
        },
      },
      { status: 500 },
    );
  }
}
