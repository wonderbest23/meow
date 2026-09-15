import { NextResponse } from "next/server";
import { nicepayClientKey, verifyAuthSignature } from "../../../../../lib/payments/nicepay-client";
import { getPlanOrder } from "../../../../../lib/payments/plan-orders";
import { reconcileNicepayOrder } from "../../../../../lib/payments/nicepay-reconciliation";
import { paymentRequestOrigin } from "../../../../../lib/payments/request-origin";

export const runtime = "nodejs";

function redirect(request: Request, params: Record<string, string>) {
  const url = new URL("/plan/pay/result", paymentRequestOrigin(request));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); }
  catch { return redirect(request, { status: "fail", reason: "잘못된 응답을 받았습니다." }); }
  const get = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)) : "";
  if (get("authResultCode") !== "0000") return redirect(request, { status: "fail", reason: "결제가 취소되었거나 인증되지 않았습니다." });
  const orderId = get("orderId"), tid = get("tid"), clientId = get("clientId"), amount = get("amount");
  if (!tid || tid.length > 128 || !orderId || orderId.length > 128 || !get("authToken")
    || clientId !== nicepayClientKey()
    || !verifyAuthSignature({ authToken: get("authToken"), clientId, amount, signature: get("signature") })) {
    return redirect(request, { status: "fail", reason: "결제 정보를 확인하지 못했습니다." });
  }
  const order = await getPlanOrder(orderId).catch(() => null);
  if (!order || !/^\d+$/.test(amount) || Number(amount) !== order.amount) return redirect(request, { status: "fail", reason: "주문 정보를 확인하지 못했습니다." });
  const context = { orderId, ...(order.planId ? { planId: order.planId } : {}), ...(order.planType ? { planType: order.planType } : {}), product: order.product };
  const result = await reconcileNicepayOrder({ orderId, tid, allowApproval: true }).catch(() => ({ status: "pending" as const }));
  return redirect(request, { ...context, ...result });
}
