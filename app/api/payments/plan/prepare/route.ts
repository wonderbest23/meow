import { loadPlanState } from "../../../../../lib/plan-builder/plan-server-store";
import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { createPlanOrder, paidPlanEntitlement, paidHomepagePlanIds, domainEntitlement, productName, PLAN_PRODUCT_NAME, type PlanProduct } from "../../../../../lib/payments/plan-orders";
import { nicepayClientKey, nicepayConfigured } from "../../../../../lib/payments/nicepay-client";

export const runtime = "nodejs";

// 결제창을 띄우기 전 단계.
// 주문번호와 금액을 서버가 먼저 정해 두고, 클라이언트에는 그것만 넘긴다.
// (금액을 브라우저에서 만들지 않게 하려는 것)

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { planId?: string; planType?: string; product?: string };
  // 계획서와 홈페이지는 별개 상품이다 — 어느 쪽 결제인지 여기서 갈린다
  const product: PlanProduct = (["homepage", "regen", "domain", "tokens"] as const).find((p) => p === body.product) ?? "plan";
  const planId = typeof body.planId === "string" ? body.planId.slice(0, 60) : "";
  const planType = typeof body.planType === "string" ? body.planType.slice(0, 120) : "";
  if (!planId || !planType) {
    return NextResponse.json({ error: "plan_required", message: "결제할 플랜 정보가 없습니다. 플랜 화면에서 다시 시도해주세요." }, { status: 400 });
  }

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

  /*
   * 다시 생성 묶음은 '이미 산 것'이라는 개념이 없다 — 몇 번이든 더 살 수 있다.
   * 대신 내 문서인지는 확인한다. 남의 문서에 횟수를 넣어 줄 수는 없다.
   */
  if (product === "regen" || product === "tokens") {
    const state = await loadPlanState(identity.hash);
    if (!state.plans.some((p) => p.id === planId)) {
      return NextResponse.json({ error: "not_found", message: "이 문서를 찾을 수 없습니다." }, { status: 404 });
    }
    /* 토큰은 홈페이지가 열려 있어야 쓸 데가 있다 — 홈페이지 결제 전에는 팔지 않는다 */
    if (product === "tokens" && !(await paidHomepagePlanIds(identity.userId)).has(planId)) {
      return NextResponse.json({ error: "homepage_required", message: "홈페이지를 먼저 열어야 AI 수정 토큰을 쓸 수 있습니다." }, { status: 409 });
    }
  } else if (product === "domain") {
    if (!(await paidHomepagePlanIds(identity.userId)).has(planId)) {
      return NextResponse.json({ error: "homepage_required", message: "홈페이지를 먼저 열어야 도메인을 연결할 수 있습니다." }, { status: 409 });
    }
    const ent = await domainEntitlement(identity.userId, planId);
    /* 만료 30일 전부터 갱신을 받는다 — 그 전에는 이미 산 것 */
    if (ent.active && ent.expiresAt && new Date(ent.expiresAt).getTime() - Date.now() > 30 * 86_400_000) {
      return NextResponse.json({ error: "already_paid", message: `이미 연결 중입니다 (${ent.expiresAt.slice(0, 10)}까지). 만료 30일 전부터 갱신할 수 있습니다.` }, { status: 409 });
    }
  } else if (product === "homepage") {
    const purchased = await paidHomepagePlanIds(identity.userId);
    if (purchased.has(planId)) {
      return NextResponse.json({ error: "already_paid", message: "이미 이 홈페이지는 열려 있습니다." }, { status: 409 });
    }
  } else {
    const ent = await paidPlanEntitlement(identity.userId);
    if (ent.allAccess || ent.planIds.has(planId)) {
      return NextResponse.json({ error: "already_paid", message: "이미 이 플랜은 열려 있습니다." }, { status: 409 });
    }
  }

  try {
    const order = await createPlanOrder({
      ownerId: identity.userId,
      guestTokenHash: identity.hash,
      customerEmail: identity.email,
      planId,
      planType,
      product,
    });
    return NextResponse.json(
      {
        clientId: nicepayClientKey(),
        orderId: order.orderId,
        amount: order.amount,
        goodsName: (product === "plan" ? `${PLAN_PRODUCT_NAME} · ${planType}` : productName(product)).slice(0, 40),
        buyerEmail: identity.email,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ error: "order_failed", message: "결제를 시작하지 못했습니다." }, { status: 500 });
  }
}
