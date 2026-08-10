import { NextResponse } from "next/server";
import { z } from "zod";
import { ensurePaidStarterLanding } from "../../../../../lib/landing/auto-publish";
import {
  cancelManualTransferOrder,
  completeManualTransferOrder,
  getPaymentOrder,
  listManualTransferOrders,
  markManualCashReceiptIssued,
  recordPaymentEvent,
  refundManualTransferOrder,
} from "../../../../../lib/payments/repository";
import { recordServiceAudit } from "../../../../../lib/service-audit/repository";
import { hasAdminSession } from "../../../../../lib/support-chat/admin-auth";

const actionSchema = z.object({
  orderId: z.string().trim().min(6).max(64),
  action: z.enum(["confirm", "cancel", "refund", "cash_receipt_issued"]),
  note: z.string().trim().max(500).default(""),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function authorize() {
  // Resolves to a dedicated payments session when ADMIN_PAYMENTS_PASSWORD is set, otherwise
  // falls back to the shared support session (backward compatible).
  if (await hasAdminSession("payments")) return null;
  return privateJson({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } }, { status: 401 });
}

function adminOrder(order: Awaited<ReturnType<typeof getPaymentOrder>>) {
  if (!order) return null;
  return {
    orderId: order.orderId,
    amount: order.amount,
    orderName: order.orderName,
    status: order.status,
    customerEmail: order.customerEmail,
    depositorName: order.depositorName,
    customerPhone: order.customerPhone,
    cashReceiptType: order.cashReceiptType,
    cashReceiptIdentifier: order.cashReceiptIdentifier,
    cashReceiptStatus: order.cashReceiptStatus,
    cashReceiptIssuedAt: order.cashReceiptIssuedAt,
    depositReportedAt: order.depositReportedAt,
    expiresAt: order.expiresAt,
    confirmedAt: order.confirmedAt,
    projectId: order.projectId,
    adminNote: order.adminNote,
    opportunityTitle: String(order.opportunity.title ?? "선택한 사업"),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function GET() {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  try {
    const orders = await listManualTransferOrders();
    return privateJson({ orders: orders.map(adminOrder) });
  } catch (error) {
    return privateJson({ error: { code: "MANUAL_ORDERS_LOAD_FAILED", message: error instanceof Error ? error.message : "입금 주문을 불러오지 못했습니다." } }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  try {
    const input = actionSchema.parse(await request.json());
    const original = await getPaymentOrder(input.orderId);
    if (!original) throw new Error("PAYMENT_ORDER_NOT_FOUND");

    if (input.action === "confirm") {
      const result = await completeManualTransferOrder(original, input.note);
      const starterLanding = await ensurePaidStarterLanding(result.project, original.guestTokenHash).catch(() => null);
      await recordPaymentEvent(`manual-confirm:${input.orderId}`, "MANUAL_TRANSFER_CONFIRMED", { orderId: input.orderId, amount: original.amount });
      await recordServiceAudit({
        projectId: result.project.id,
        guestTokenHash: original.guestTokenHash,
        action: "payment.confirmed",
        resourceType: "payment_order",
        resourceId: input.orderId,
        status: "success",
        detail: `${original.amount.toLocaleString("ko-KR")}원 계좌 입금을 관리자가 확인했습니다.`,
        metadata: { method: "manual_transfer", starterLanding: starterLanding?.publicPath ?? null },
      });
      return privateJson({ order: adminOrder(result.order), projectId: result.project.id, starterLanding });
    }

    const order = input.action === "cancel"
      ? await cancelManualTransferOrder(input.orderId, input.note)
      : input.action === "refund"
        ? await refundManualTransferOrder(input.orderId, input.note)
        : await markManualCashReceiptIssued(input.orderId, input.note);
    await recordPaymentEvent(`manual-${input.action}:${input.orderId}`, `MANUAL_TRANSFER_${input.action.toUpperCase()}`, { orderId: input.orderId, note: input.note });
    return privateJson({ order: adminOrder(order) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MANUAL_ORDER_UPDATE_FAILED";
    const messages: Record<string, string> = {
      PAYMENT_ORDER_NOT_FOUND: "주문을 찾을 수 없습니다.",
      PAYMENT_ORDER_EXPIRED: "입금 기한이 지난 주문입니다.",
      PAYMENT_ORDER_NOT_CONFIRMABLE: "입금 확인할 수 없는 주문 상태입니다.",
      PAID_ORDER_CANNOT_BE_CANCELED: "제작이 시작된 주문은 취소할 수 없습니다. 하자·미제공 등 법정 예외가 확인된 경우에만 예외 환급으로 처리해주세요.",
      PAYMENT_ORDER_NOT_REFUNDABLE: "입금 완료되고 제작이 시작된 주문만 예외 환급 상태로 처리할 수 있습니다.",
      REFUND_EXCEPTION_REASON_REQUIRED: "결과물 미제공·계약 불일치·중대한 하자 등 예외 환급 사유를 처리 메모에 구체적으로 적어주세요.",
      CASH_RECEIPT_NOT_REQUESTED: "현금영수증을 신청하지 않은 주문입니다.",
      CASH_RECEIPT_PAYMENT_NOT_CONFIRMED: "입금 확인을 완료한 뒤 현금영수증을 발급해주세요.",
    };
    return privateJson({ error: { code, message: messages[code] ?? "입금 주문을 처리하지 못했습니다." } }, { status: code === "PAYMENT_ORDER_NOT_FOUND" ? 404 : 400 });
  }
}
