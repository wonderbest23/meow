import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { reconcileNicepayOrder } from "../../../../../lib/payments/nicepay-reconciliation";
import { isPaymentSameOrigin } from "../../../../../lib/payments/request-origin";
import { getPlanOrder } from "../../../../../lib/payments/plan-orders";
import { notifyDomainPurchasePaid } from "../../../../../lib/ops-alerts";
import { schedulePaymentNotice } from "../../../../../lib/payments/paid-notice-schedule";

export async function POST(request: Request) {
  if (!isPaymentSameOrigin(request)) return Response.json({ error: "ORIGIN_NOT_ALLOWED" }, { status: 403 });
  const identity = await requireAuthenticatedIdentity().catch(() => null);
  if (!identity) return Response.json({ error: "ACCOUNT_LOGIN_REQUIRED" }, { status: 401 });
  const limited = await enforceRateLimit("nicepay-reconcile", request, { limit: 6, windowMs: 60_000 });
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (typeof body?.orderId !== "string" || body.orderId.length > 128) return Response.json({ error: "ORDER_REQUIRED" }, { status: 400 });
  try {
    const before = await getPlanOrder(body.orderId).catch(() => null);
    const result = await reconcileNicepayOrder({ orderId: body.orderId, ownerId: identity.userId });
    // 결제 복귀를 놓쳐 여기서 완료된 도메인 구매도 운영자에게 알린다(return 경로와 같은 조건)
    if (result.status === "ok" && before && before.status !== "done" && before.product === "domain-purchase" && before.ownerId === identity.userId) {
      await notifyDomainPurchasePaid(before);
    }
    // 결제 복귀를 놓쳐 여기서 완료돼도 결제 완료 알림은 한 번(return 경로와 같은 함수)
    if (result.status === "ok" && before && before.ownerId === identity.userId) schedulePaymentNotice(body.orderId, before.status !== "done");
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const notFound = error instanceof Error && error.message === "PAYMENT_ORDER_NOT_FOUND";
    return Response.json({ error: notFound ? "PAYMENT_ORDER_NOT_FOUND" : "PAYMENT_CHECK_UNAVAILABLE" }, { status: notFound ? 404 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
