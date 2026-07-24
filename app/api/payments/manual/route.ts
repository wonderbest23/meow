import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { reportManualTransferDeposit } from "../../../../lib/payments/repository";

const schema = z.object({ orderId: z.string().trim().min(6).max(64) });

export async function PATCH(request: Request) {
  try {
    const { orderId } = schema.parse(await request.json());
    const identity = await requireAuthenticatedIdentity();
    const order = await reportManualTransferDeposit(orderId, identity.hash);
    return NextResponse.json({ order: { orderId: order.orderId, status: order.status, depositReportedAt: order.depositReportedAt } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MANUAL_TRANSFER_REPORT_FAILED";
    const status = code === "ACCOUNT_LOGIN_REQUIRED" ? 401 : code === "PAYMENT_ORDER_NOT_FOUND" ? 404 : code === "PAYMENT_ORDER_EXPIRED" ? 409 : 400;
    const message = code === "ACCOUNT_LOGIN_REQUIRED" ? "입금 사실을 알리려면 로그인해주세요."
      : code === "PAYMENT_ORDER_NOT_FOUND" ? "주문을 찾을 수 없습니다."
        : code === "PAYMENT_ORDER_EXPIRED" ? "입금 기한이 지났습니다. 새 주문을 만들어주세요."
          : "입금 확인 요청을 접수하지 못했습니다.";
    return NextResponse.json({ error: { code, message } }, { status });
  }
}
