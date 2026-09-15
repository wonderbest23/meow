import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { reconcileNicepayOrder } from "../../../../../lib/payments/nicepay-reconciliation";
import { isPaymentSameOrigin } from "../../../../../lib/payments/request-origin";

export async function POST(request: Request) {
  if (!isPaymentSameOrigin(request)) return Response.json({ error: "ORIGIN_NOT_ALLOWED" }, { status: 403 });
  const identity = await requireAuthenticatedIdentity().catch(() => null);
  if (!identity) return Response.json({ error: "ACCOUNT_LOGIN_REQUIRED" }, { status: 401 });
  const limited = await enforceRateLimit("nicepay-reconcile", request, { limit: 6, windowMs: 60_000 });
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (typeof body?.orderId !== "string" || body.orderId.length > 128) return Response.json({ error: "ORDER_REQUIRED" }, { status: 400 });
  try {
    const result = await reconcileNicepayOrder({ orderId: body.orderId, ownerId: identity.userId });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const notFound = error instanceof Error && error.message === "PAYMENT_ORDER_NOT_FOUND";
    return Response.json({ error: notFound ? "PAYMENT_ORDER_NOT_FOUND" : "PAYMENT_CHECK_UNAVAILABLE" }, { status: notFound ? 404 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
