import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { getPaymentOrder } from "../../../../lib/payments/repository";
import { MANUAL_TRANSFER_BANK } from "../../../../lib/payments/manual-transfer";

export async function POST(request: Request) {
  /*
   * 예전 계좌이체 신청 창구 — 결제는 이제 카드(/plan/pay)로만 받는다(약관 2026-10-05).
   * 이미 받은 계좌이체 주문의 조회(GET)·환불은 그대로 둔다.
   */
  void request;
  return NextResponse.json(
    { error: { code: "PAYMENT_METHOD_NOT_AVAILABLE", message: "계좌이체 신청은 종료됐어요. 결제는 사업계획서 화면에서 카드로 진행해 주세요.", retryable: false } },
    { status: 410 },
  );
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
