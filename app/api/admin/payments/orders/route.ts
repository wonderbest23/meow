import { NextResponse } from "next/server";
import { z } from "zod";
import { ensurePaidStarterLanding } from "../../../../../lib/landing/auto-publish";
import {
  cancelManualTransferOrder,
  completeManualTransferOrder,
  getPaymentOrder,
  listAdminPaymentOrders,
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
  return privateJson({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요해요." } }, { status: 401 });
}

function adminOrder(order: Awaited<ReturnType<typeof getPaymentOrder>>) {
  if (!order) return null;
  return {
    orderId: order.orderId,
    amount: order.amount,
    orderName: order.orderName,
    status: order.status,
    method: order.method as string,
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
    opportunityTitle: String(order.opportunity?.title ?? order.orderName ?? "선택한 사업"),
    planId: typeof order.opportunity?.planId === "string" ? order.opportunity.planId : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function GET(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  try {
    // view=all — 카드·앱 결제·계좌이체 전체(검색 q: 주문 번호·이메일). 기본은 예전처럼 계좌이체만
    const params = new URL(request.url).searchParams;
    const orders = params.get("view") === "all"
      ? await listAdminPaymentOrders(params.get("q") ?? "")
      : await listManualTransferOrders();
    return privateJson({ orders: orders.map(adminOrder) });
  } catch (error) {
    // DB 오류 원문은 관리자 화면에 그대로 노출하지 않는다 — 로그로만 남긴다
    console.error("[admin/payments/orders] load failed", error);
    return privateJson({ error: { code: "MANUAL_ORDERS_LOAD_FAILED", message: "주문을 불러오지 못했어요. 잠시 후 다시 해 주세요." } }, { status: 503 });
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
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return privateJson({ error: { code: "INVALID_INPUT", message: "입력값을 확인해 주세요." } }, { status: 400 });
    }
    const code = error instanceof Error ? error.message : "MANUAL_ORDER_UPDATE_FAILED";
    const messages: Record<string, string> = {
      PAYMENT_ORDER_NOT_FOUND: "주문을 찾지 못했어요.",
      PAYMENT_ORDER_EXPIRED: "입금 기한이 지난 주문이에요.",
      PAYMENT_ORDER_NOT_CONFIRMABLE: "입금 확인할 수 없는 주문 상태예요.",
      PAID_ORDER_CANNOT_BE_CANCELED: "제작이 시작된 주문은 취소할 수 없어요. 하자·미제공 등 법정 예외가 확인된 경우에만 예외 환급으로 처리해 주세요.",
      PAYMENT_ORDER_NOT_REFUNDABLE: "입금 완료되고 제작이 시작된 주문만 예외 환급으로 처리할 수 있어요.",
      REFUND_EXCEPTION_REASON_REQUIRED: "결과물 미제공·계약 불일치·중대한 하자 등 예외 환급 사유를 처리 메모에 구체적으로 적어 주세요.",
      CASH_RECEIPT_NOT_REQUESTED: "현금영수증을 신청하지 않은 주문이에요.",
      CASH_RECEIPT_PAYMENT_NOT_CONFIRMED: "입금 확인을 마친 뒤 현금영수증을 발급해 주세요.",
    };
    // 알려진 코드가 아니면 DB 오류 원문일 수 있다 — code로도 내보내지 않고 로그로만 남긴다
    if (!messages[code]) {
      console.error("[admin/payments/orders] update failed", error);
      return privateJson({ error: { code: "MANUAL_ORDER_UPDATE_FAILED", message: "입금 주문을 처리하지 못했어요. 잠시 후 다시 해 주세요." } }, { status: 503 });
    }
    return privateJson({ error: { code, message: messages[code] } }, { status: code === "PAYMENT_ORDER_NOT_FOUND" ? 404 : 400 });
  }
}
