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
  const planQ = {
    ...(order.planId ? { planId: order.planId } : {}),
    ...(order.planType ? { planType: order.planType } : {}),
  };
  if (order.status === "done") {
    // 같은 결과가 두 번 들어와도 중복 승인하지 않는다
    return redirect(request, { status: "ok", ...planQ });
  }
  if (clientId !== nicepayClientKey()) {
    await markPlanOrderFailed({ orderId, code: "CLIENT_MISMATCH", message: "가맹점 정보 불일치" }).catch(() => {});
    return redirect(request, { status: "fail", reason: "결제 정보를 확인하지 못했습니다.", ...planQ });
  }
  if (Date.parse(order.expiresAt) <= Date.now()) {
    await markPlanOrderFailed({ orderId, code: "ORDER_EXPIRED", message: "주문 유효시간 초과" }).catch(() => {});
    return redirect(request, { status: "fail", reason: "결제 시간이 만료되었습니다. 다시 시도해주세요.", ...planQ });
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
    return redirect(request, { status: "fail", reason: result?.resultMsg || "결제 승인에 실패했습니다.", ...planQ });
  }

  /*
   * 5) 승인 결과를 남긴다 — 여기서 실패하면 돈만 빠져나간다.
   *
   * PG 승인은 이미 끝났으므로 이 저장이 실패하면 결제는 됐는데 문서는
   * 열리지 않는 상태가 된다. 몇 번 다시 시도하고, 그래도 안 되면
   * 승인을 취소해 돈을 돌려준다(취소까지 실패하면 주문번호를 알려
   * 사람이 처리할 수 있게 한다).
   */
  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
    try {
      await markPlanOrderPaid({ orderId, tid, raw: result.raw });
      saved = true;
    } catch {
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  if (!saved) {
    const cancelled = await cancelNicepayPayment(tid, "결제 기록 저장 실패").then(() => true).catch(() => false);
    return redirect(request, {
      status: "fail",
      reason: cancelled
        ? "결제 처리 중 문제가 생겨 자동으로 취소했습니다. 다시 시도해주세요."
        : `결제는 되었으나 처리에 실패했습니다. 주문번호 ${orderId}로 문의해주세요.`,
      ...planQ,
    });
  }

  return redirect(request, { status: "ok", ...planQ });
}
