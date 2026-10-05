import { NextResponse } from "next/server";
import { nicepayClientKey, verifyAuthSignature } from "../../../../../lib/payments/nicepay-client";
import { getPlanOrder } from "../../../../../lib/payments/plan-orders";
import { reconcileNicepayOrder } from "../../../../../lib/payments/nicepay-reconciliation";
import { paymentRequestOrigin } from "../../../../../lib/payments/request-origin";
import { notifyDomainPurchasePaid } from "../../../../../lib/ops-alerts";

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
  if (get("authResultCode") !== "0000") {
    /*
     * 취소·인증 실패에도 어느 사업의 어떤 상품이었는지 넘긴다 — 예전엔 빠져서 결과 화면에 '내 사업으로 가기'만 남고
     * 다시 시도하거나 그 사업으로 돌아갈 길이 없었다. 주문을 못 찾으면 예전처럼 사유만 넘긴다.
     */
    const cancelled = get("orderId") ? await getPlanOrder(get("orderId")).catch(() => null) : null;
    return redirect(request, {
      status: "fail", reason: "결제가 취소되었거나 인증되지 않았습니다.",
      ...(cancelled?.planId ? { planId: cancelled.planId } : {}), ...(cancelled?.planType ? { planType: cancelled.planType } : {}),
      ...(cancelled?.product ? { product: cancelled.product } : {}), ...(cancelled?.domain ? { domain: cancelled.domain } : {}),
    });
  }
  const orderId = get("orderId"), tid = get("tid"), clientId = get("clientId"), amount = get("amount");
  if (!tid || tid.length > 128 || !orderId || orderId.length > 128 || !get("authToken")
    || clientId !== nicepayClientKey()
    || !verifyAuthSignature({ authToken: get("authToken"), clientId, amount, signature: get("signature") })) {
    return redirect(request, { status: "fail", reason: "결제 정보를 확인하지 못했습니다." });
  }
  const order = await getPlanOrder(orderId).catch(() => null);
  if (!order || !/^\d+$/.test(amount) || Number(amount) !== order.amount) return redirect(request, { status: "fail", reason: "주문 정보를 확인하지 못했습니다." });
  const context = { orderId, ...(order.planId ? { planId: order.planId } : {}), ...(order.planType ? { planType: order.planType } : {}), product: order.product, ...(order.domain ? { domain: order.domain } : {}) };
  const result = await reconcileNicepayOrder({ orderId, tid, allowApproval: true }).catch(() => ({ status: "pending" as const }));
  /*
   * 도메인 구매는 운영자가 등록기관에서 손으로 사서 연결해야 끝난다 — 결제됐다고 바로 알린다.
   * 이번 요청에서 처음 완료된 경우만(들어올 때 done 이 아니었던 주문) 보내 같은 복귀가 다시 와도 메일이 겹치지 않는다.
   * notifyOperator 는 던지지 않고 짧게 끊으므로 결제 결과 화면 이동은 알림 성패와 무관하다.
   */
  if (result.status === "ok" && order.status !== "done" && order.product === "domain-purchase") {
    await notifyDomainPurchasePaid(order);
  }
  return redirect(request, { ...context, ...result });
}
