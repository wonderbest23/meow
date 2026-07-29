import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { createPlanOrder, hasPaidPlanOrder, PLAN_PRODUCT_NAME } from "../../../../../lib/payments/plan-orders";
import { nicepayClientKey, nicepayConfigured } from "../../../../../lib/payments/nicepay-client";

export const runtime = "nodejs";

// 결제창을 띄우기 전 단계.
// 주문번호와 금액을 서버가 먼저 정해 두고, 클라이언트에는 그것만 넘긴다.
// (금액을 브라우저에서 만들지 않게 하려는 것)

export async function POST() {
  let identity: Awaited<ReturnType<typeof requireAuthenticatedIdentity>>;
  try {
    identity = await requireAuthenticatedIdentity();
  } catch {
    return NextResponse.json({ error: "login_required", message: "로그인 후 결제할 수 있습니다." }, { status: 401 });
  }

  if (!nicepayConfigured()) {
    return NextResponse.json(
      { error: "payments_unavailable", message: "결제 준비가 아직 완료되지 않았습니다. 잠시 후 다시 시도해주세요." },
      { status: 503 },
    );
  }

  if (!identity.userId) {
    return NextResponse.json({ error: "login_required", message: "로그인 후 결제할 수 있습니다." }, { status: 401 });
  }

  // 이미 결제한 사람에게 또 받지 않는다
  if (await hasPaidPlanOrder(identity.userId)) {
    return NextResponse.json({ error: "already_paid", message: "이미 결제가 완료된 계정입니다." }, { status: 409 });
  }

  try {
    const order = await createPlanOrder({
      ownerId: identity.userId,
      guestTokenHash: identity.hash,
      customerEmail: identity.email,
    });
    return NextResponse.json(
      {
        clientId: nicepayClientKey(),
        orderId: order.orderId,
        amount: order.amount,
        goodsName: PLAN_PRODUCT_NAME,
        buyerEmail: identity.email,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ error: "order_failed", message: "결제를 시작하지 못했습니다." }, { status: 500 });
  }
}
