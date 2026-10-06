import { NextResponse } from "next/server";
import { z } from "zod";
import { listDomainPurchaseOrders, markDomainRegistered } from "../../../../../lib/payments/plan-orders";
import { hasAdminSession } from "../../../../../lib/support-chat/admin-auth";
import { RefundError, refundOrderByAdmin } from "../../../../../lib/payments/refund-execution";
import { startRegisteredDomainConnection } from "../../../../../lib/landing/domain-auto-connect";

export const runtime = "nodejs";

// 어드민 도메인 구매 대행 — 결제된 주문 목록과 '등록 완료' 표시.

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function authorize() {
  if (await hasAdminSession("payments")) return null;
  return privateJson({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } }, { status: 401 });
}

export async function GET() {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  try {
    return privateJson({ orders: await listDomainPurchaseOrders(), cnameTarget: process.env.CLOUDFLARE_SAAS_CNAME_TARGET?.trim() || "connect.oneulstart.com" });
  } catch {
    return privateJson({ error: { code: "DOMAIN_ORDERS_FAILED", message: "도메인 주문을 불러오지 못했습니다." } }, { status: 503 });
  }
}

const patchSchema = z.object({
  orderId: z.string().min(1).max(128),
  /* 등록할 수 없는 주소 등 — 고객 요청 없이 관리자가 먼저 카드 취소한다 */
  action: z.enum(["registered", "refund"]).default("registered"),
  note: z.string().trim().max(500).default(""),
});

export async function PATCH(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: { code: "BAD_REQUEST", message: "주문번호를 확인해 주세요." } }, { status: 400 });
  if (parsed.data.action === "refund") {
    try {
      const orders = await listDomainPurchaseOrders();
      const order = orders.find((item) => item.orderId === parsed.data.orderId);
      if (!order) return privateJson({ error: { code: "NOT_FOUND", message: "결제된 도메인 구매 주문을 찾을 수 없습니다." } }, { status: 404 });
      await refundOrderByAdmin(order.orderId, { amount: order.amount, note: parsed.data.note });
      return privateJson({ orders: await listDomainPurchaseOrders() });
    } catch (error) {
      if (error instanceof RefundError) return privateJson({ error: { code: "DOMAIN_REFUND_FAILED", message: error.message } }, { status: error.status });
      console.error("[admin/domain-orders] refund failed", error);
      return privateJson({ error: { code: "DOMAIN_REFUND_FAILED", message: "환불을 처리하지 못했습니다. 환불 접수함에서 상태를 확인해 주세요." } }, { status: 500 });
    }
  }
  try {
    if (!(await markDomainRegistered(parsed.data.orderId))) return privateJson({ error: { code: "NOT_FOUND", message: "결제된 도메인 구매 주문을 찾을 수 없습니다." } }, { status: 404 });
    // 등록 완료와 함께 연결도 시작하고 사장님께 알린다 — 실패해도 등록 완료는 그대로, 경고만 보인다
    const connection = await startRegisteredDomainConnection(parsed.data.orderId);
    return privateJson({ orders: await listDomainPurchaseOrders(), connection: { connected: connection.connected, hostname: connection.hostname, notified: connection.notified }, warning: connection.warning });
  } catch {
    return privateJson({ error: { code: "DOMAIN_ORDER_UPDATE_FAILED", message: "등록 완료로 바꾸지 못했습니다." } }, { status: 503 });
  }
}
