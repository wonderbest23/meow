import { loadPlanState } from "../../../../../lib/plan-builder/plan-server-store";
import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { createPlanOrder, paidPlanEntitlement, paidHomepagePlanIds, domainEntitlement, productName, PLAN_PRODUCT_NAME, type PlanProduct } from "../../../../../lib/payments/plan-orders";
import { nicepayClientKey, nicepayConfigured, nicepaySdkUrl } from "../../../../../lib/payments/nicepay-client";
import { evaluatePlatformLaunchReadiness } from "../../../../../lib/platform-legal/domain";
import { getPlatformLegalSettings } from "../../../../../lib/platform-legal/repository";
import { authConfigured } from "../../../../../lib/account-auth";
import { normalizePurchaseDomain } from "../../../../../lib/landing/domain-purchase";
import { checkDomainAvailability } from "../../../../../lib/landing/domain-availability";

export const runtime = "nodejs";

const CARD_TERMS_KEYS = ["service", "privacy", "aiLimitations", "refund", "digitalSupply", "personalizedDigitalNoRefund"] as const;

// 결제창을 띄우기 전 단계.
// 주문번호와 금액을 서버가 먼저 정해 두고, 클라이언트에는 그것만 넘긴다.
// (금액을 브라우저에서 만들지 않게 하려는 것)

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { planId?: string; planType?: string; product?: string; domain?: string; terms?: Record<string, unknown> };
  // 결제 전 필수 확인(약관·개인정보·AI 안내·환불 기준·제공 시점·청약철회 제한)은 계좌이체 주문과 같게 서버에서도 확인한다.
  if (!CARD_TERMS_KEYS.every((key) => body.terms?.[key] === true)) {
    return NextResponse.json({ error: "terms_required", message: "결제 전 필수 항목에 모두 동의해 주세요." }, { status: 400 });
  }
  // 계획서와 홈페이지는 별개 상품이다 — 어느 쪽 결제인지 여기서 갈린다
  const product: PlanProduct = (["homepage", "bundle", "regen", "domain", "domain-purchase", "tokens"] as const).find((p) => p === body.product) ?? "plan";
  const planId = typeof body.planId === "string" ? body.planId.slice(0, 60) : "";
  const planType = typeof body.planType === "string" ? body.planType.slice(0, 120) : "";
  /*
   * 문서 종류(planType)는 계획서 값(종류별 가격)을 정할 때만 쓴다.
   * 홈페이지에서 여는 도메인·토큰 결제는 종류를 모르고 오므로, 예전처럼 모든 상품에 요구하면 결제가 늘 막혔다.
   */
  if (!planId || (product === "plan" && !planType)) {
    return NextResponse.json({ error: "plan_required", message: "결제할 사업 정보가 없습니다. 사업계획서 화면에서 다시 시도해 주세요." }, { status: 400 });
  }
  /* 도메인 구매 대행은 살 주소가 있어야 한다(.com·.kr·.co.kr) */
  const purchaseDomain = product === "domain-purchase" ? normalizePurchaseDomain(typeof body.domain === "string" ? body.domain : "") : null;
  if (product === "domain-purchase" && !purchaseDomain) {
    return NextResponse.json({ error: "domain_required", message: "살 도메인 주소를 확인해 주세요. .com, .kr, .co.kr 주소만 대신 사 드릴 수 있어요." }, { status: 400 });
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

  // 카드 결제도 계좌이체 주문과 같은 출시 조건(사업자·통신판매업 표시, 인증, 결제 설정)을 통과해야 연다.
  const readiness = evaluatePlatformLaunchReadiness(await getPlatformLegalSettings(), { authConfigured: authConfigured(), paymentsConfigured: true });
  if (!readiness.paymentAllowed) {
    return NextResponse.json(
      { error: "paid_launch_blocked", message: "정식 결제 준비가 아직 완료되지 않았습니다. 잠시 후 다시 시도해주세요." },
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
  } else if (product === "domain" || product === "domain-purchase") {
    if (!(await paidHomepagePlanIds(identity.userId)).has(planId)) {
      return NextResponse.json({ error: "homepage_required", message: "홈페이지를 먼저 열어야 도메인을 연결할 수 있습니다." }, { status: 409 });
    }
    const ent = await domainEntitlement(identity.userId, planId);
    /* 만료 30일 전부터 갱신을 받는다 — 그 전에는 이미 산 것 */
    if (ent.active && ent.expiresAt && new Date(ent.expiresAt).getTime() - Date.now() > 30 * 86_400_000) {
      return NextResponse.json({ error: "already_paid", message: `이미 연결 중입니다 (${ent.expiresAt.slice(0, 10)}까지). 만료 30일 전부터 갱신할 수 있습니다.` }, { status: 409 });
    }
    /* 새로 살 주소가 이미 남의 것이면 받지 않는다(우리가 사 준 주소의 갱신은 예외) */
    if (purchaseDomain && ent.purchase?.domain !== purchaseDomain && (await checkDomainAvailability(purchaseDomain)) === "taken") {
      return NextResponse.json({ error: "domain_taken", message: `${purchaseDomain} 은(는) 이미 다른 사람이 등록한 주소예요. 다른 주소를 골라 주세요.` }, { status: 409 });
    }
  } else if (product === "bundle") {
    // 묶음은 계획서와 홈페이지를 한 번에 연다 — 둘 중 하나라도 이미 열려 있으면 남은 하나만 따로 사게 한다
    const [plans, homepages] = await Promise.all([paidPlanEntitlement(identity.userId), paidHomepagePlanIds(identity.userId)]);
    if (plans.allAccess || plans.planIds.has(planId) || homepages.has(planId)) {
      return NextResponse.json({ error: "already_paid", message: "계획서나 홈페이지 중 하나가 이미 열려 있어요. 남은 상품만 따로 결제해 주세요." }, { status: 409 });
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
      terms: Object.fromEntries(CARD_TERMS_KEYS.map((key) => [key, true])),
      ...(purchaseDomain ? { domainRequest: { domain: purchaseDomain, status: "requested" as const } } : {}),
    });
    return NextResponse.json(
      {
        clientId: nicepayClientKey(),
        sdkUrl: nicepaySdkUrl(),
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
