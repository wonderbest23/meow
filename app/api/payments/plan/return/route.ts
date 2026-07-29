import { NextResponse } from "next/server";
import {
  approveNicepayPayment,
  cancelNicepayPayment,
  nicepayClientKey,
  verifyAuthSignature,
} from "../../../../../lib/payments/nicepay-client";
import { getPlanOrder, markPlanOrderFailed, markPlanOrderPaid } from "../../../../../lib/payments/plan-orders";

export const runtime = "nodejs";

// 나이스페이 결제창이 인증 결과를 POST로 보내는 곳(returnUrl).
// 여기서 위조 검증 → 주문 대조 → 서버 승인까지 마치고 결과 화면으로 보낸다.
//
// 브라우저가 보낸 금액은 믿지 않는다. 승인에 쓰는 금액은 DB에 저장된 주문 금액이다.

function redirect(request: Request, params: Record<string, string>) {
  const url = new URL("/plan/pay/result", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(request, { status: "fail", reason: "잘못된 응답을 받았습니다." });
  }

  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };

  const authResultCode = get("authResultCode");
  const authResultMsg = get("authResultMsg");
  const orderId = get("orderId");
  const tid = get("tid");
  const authToken = get("authToken");
  const signature = get("signature");
  const clientId = get("clientId");
  const amountRaw = get("amount");

  // 1) 결제창 인증 자체가 실패한 경우
  if (authResultCode !== "0000") {
    if (orderId) {
      await markPlanOrderFailed({ orderId, code: authResultCode || "AUTH_FAILED", message: authResultMsg || "인증 실패" }).catch(() => {});
    }
    return redirect(request, { status: "fail", reason: authResultMsg || "결제가 취소되었습니다." });
  }

  // 2) 위조 검증 — 우리 시크릿으로 다시 계산해 대조한다
  if (!signature || !verifyAuthSignature({ authToken, clientId, amount: amountRaw, signature })) {
    await markPlanOrderFailed({ orderId, code: "SIGNATURE_MISMATCH", message: "위조된 결제 응답" }).catch(() => {});
    return redirect(request, { status: "fail", reason: "결제 정보를 확인하지 못했습니다." });
  }

  // 3) 우리 쪽 주문과 대조
  const order = await getPlanOrder(orderId).catch(() => null);
  if (!order) {
    return redirect(request, { status: "fail", reason: "주문을 찾을 수 없습니다." });
  }
  if (order.status === "done") {
    // 같은 결과가 두 번 들어와도 중복 승인하지 않는다
    return redirect(request, { status: "ok" });
  }
  if (clientId !== nicepayClientKey()) {
    await markPlanOrderFailed({ orderId, code: "CLIENT_MISMATCH", message: "가맹점 정보 불일치" }).catch(() => {});
    return redirect(request, { status: "fail", reason: "결제 정보를 확인하지 못했습니다." });
  }
  if (Date.parse(order.expiresAt) <= Date.now()) {
    await markPlanOrderFailed({ orderId, code: "ORDER_EXPIRED", message: "주문 유효시간 초과" }).catch(() => {});
    return redirect(request, { status: "fail", reason: "결제 시간이 만료되었습니다. 다시 시도해주세요." });
  }

  // 4) 서버 승인 — 금액은 DB에 있는 값으로만 보낸다
  const result = await approveNicepayPayment(tid, order.amount).catch(() => null);
  if (!result || !result.ok) {
    await markPlanOrderFailed({
      orderId,
      code: result?.resultCode || "APPROVE_FAILED",
      message: result?.resultMsg || "승인 실패",
      raw: result?.raw,
    }).catch(() => {});
    // 승인은 됐는데 금액이 어긋난 경우라면 되돌린다
    if (result && result.status === "paid" && result.amount !== order.amount) {
      await cancelNicepayPayment(tid, "금액 불일치").catch(() => {});
    }
    return redirect(request, { status: "fail", reason: result?.resultMsg || "결제 승인에 실패했습니다." });
  }

  await markPlanOrderPaid({ orderId, tid, raw: result.raw });
  return redirect(request, { status: "ok" });
}
