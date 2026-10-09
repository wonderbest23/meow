import { loadPlanState } from "../../../../../lib/plan-builder/plan-server-store";
import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { createPlanOrder, paidPlanEntitlement, paidHomepagePlanIds, domainEntitlement, productName, PLAN_PRODUCT_NAME, type PlanProduct } from "../../../../../lib/payments/plan-orders";
import { BUNDLE_PRODUCT_AMOUNT, HOMEPAGE_PRODUCT_AMOUNT } from "../../../../../lib/payments/domain";
import { nicepayClientKey, nicepayConfigured, nicepaySdkUrl } from "../../../../../lib/payments/nicepay-client";
import { evaluatePlatformLaunchReadiness } from "../../../../../lib/platform-legal/domain";
import { getPlatformLegalSettings } from "../../../../../lib/platform-legal/repository";
import { authConfigured } from "../../../../../lib/account-auth";
import { normalizePurchaseDomain, validateRegistrant } from "../../../../../lib/landing/domain-purchase";
import { checkDomainAvailability } from "../../../../../lib/landing/domain-availability";
import { cloudflareSaasConfigured } from "../../../../../lib/landing/custom-domain";
import { normalizeAlertPhone } from "../../../../../lib/notify/customer-sms";

export const runtime = "nodejs";

const CARD_TERMS_KEYS = ["service", "privacy", "aiLimitations", "refund", "digitalSupply", "personalizedDigitalNoRefund"] as const;

// 결제창을 띄우기 전 단계.
// 주문번호와 금액을 서버가 먼저 정해 두고, 클라이언트에는 그것만 넘긴다.
// (금액을 브라우저에서 만들지 않게 하려는 것)

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { planId?: string; planType?: string; product?: string; domain?: string; noticePhone?: string; registrant?: unknown; terms?: Record<string, unknown> };
  /* 결제 안내 문자 받을 휴대폰(선택) — 비우면 문자 없이 메일만. 적었는데 틀리면 결제 전에 알려 고치게 한다 */
  const rawPhone = typeof body.noticePhone === "string" ? body.noticePhone.slice(0, 30) : "";
  const noticePhone = rawPhone.trim() ? normalizeAlertPhone(rawPhone) : null;
  if (rawPhone.trim() && !noticePhone) {
    return NextResponse.json({ error: "phone_invalid", message: "휴대폰 번호를 010으로 시작하는 11자리로 적어 주세요. 비워 둬도 결제할 수 있어요." }, { status: 400 });
  }
  // 결제 전 필수 확인(약관·개인정보·AI 안내·환불 기준·제공 시점·청약철회 제한)은 계좌이체 주문과 같게 서버에서도 확인한다.
  if (!CARD_TERMS_KEYS.every((key) => body.terms?.[key] === true)) {
    return NextResponse.json({ error: "terms_required", message: "결제 전 필수 항목에 모두 동의해 주세요." }, { status: 400 });
  }
  // 계획서와 홈페이지는 별개 상품이다 — 어느 쪽 결제인지 여기서 갈린다
  const product: PlanProduct = (["homepage", "bundle", "regen", "domain", "domain-purchase", "tokens"] as const).find((p) => p === body.product) ?? "plan";
  // 오픈 범위(2026-10-08): AI 수정 토큰은 팔지 않는다(AI 수정 단추가 없다). 알 수 없는 상품을 계획서 값으로 받지 않게 여기서 끊는다
  if (product === "tokens") return NextResponse.json({ error: "product_closed", message: "AI 수정 토큰은 지금 판매하지 않아요." }, { status: 410 });
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
  // 도메인 구매는 이용자 명의로 등록한다 — 결제 전에 명의자 정보를 받는다(.com 은 결제 직후 자동 등록에 그대로 쓴다)
  let renewal = false;
  const registrant = product === "domain-purchase" ? validateRegistrant(body.registrant) : null;
  if (registrant && !registrant.ok) return NextResponse.json({ error: "registrant_invalid", message: registrant.message }, { status: 400 });
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
  if (product === "regen") {
    const state = await loadPlanState(identity.hash);
    if (!state.plans.some((p) => p.id === planId)) {
      return NextResponse.json({ error: "not_found", message: "이 문서를 찾을 수 없습니다." }, { status: 404 });
    }
  } else if (product === "domain" || product === "domain-purchase") {
    if (!(await paidHomepagePlanIds(identity.userId)).has(planId)) {
      return NextResponse.json({ error: "homepage_required", message: "홈페이지를 먼저 열어야 도메인을 연결할 수 있습니다." }, { status: 409 });
    }
    const ent = await domainEntitlement(identity.userId, planId);
    // 이미 사 드린 주소를 다시 결제하면 갱신 — 새로 등록하지 않고(자동 등록·연결 알림 건너뜀) 운영자에게 '갱신'으로 알린다
    renewal = Boolean(purchaseDomain && ent.purchase?.domain === purchaseDomain);
    // 오픈 범위(2026-10-08): 새 도메인 대신 사 드리기는 받지 않는다(자동 등록 미검증·.kr 은 손으로 처리) — 이미 사 드린 주소의 갱신만
    if (product === "domain-purchase" && !renewal) {
      return NextResponse.json({ error: "product_closed", message: "도메인을 대신 사 드리는 서비스는 지금 받지 않아요. 이미 가진 도메인은 연결할 수 있어요." }, { status: 410 });
    }
    // 연결 설정(Cloudflare)이 없으면 결제만 받고 연결을 못 한다 — 결제 전에 막는다
    if (!cloudflareSaasConfigured()) {
      return NextResponse.json({ error: "domain_unavailable", message: "도메인 연결을 지금 준비하고 있어요. 잠시 후 다시 시도해 주세요." }, { status: 503 });
    }
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
    const [plans, purchased] = await Promise.all([paidPlanEntitlement(identity.userId), paidHomepagePlanIds(identity.userId)]);
    if (purchased.has(planId)) {
      return NextResponse.json({ error: "already_paid", message: "이미 이 홈페이지는 열려 있습니다." }, { status: 409 });
    }
    // 홈페이지 단독 가격은 그 사업의 계획서를 결제한 분 전용이다(2026-10-09 가격 개편) — 아직이면 묶음으로 함께 사게 한다
    if (!plans.allAccess && !plans.planIds.has(planId)) {
      return NextResponse.json({ error: "plan_required", product: "bundle", message: `홈페이지는 이 사업의 사업계획서를 결제한 뒤 ${HOMEPAGE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원에 열 수 있어요. 아직이라면 사업계획서 + 홈페이지(${BUNDLE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원)로 함께 결제해 주세요.` }, { status: 409 });
    }
  } else {
    const ent = await paidPlanEntitlement(identity.userId);
    if (ent.allAccess || ent.planIds.has(planId)) {
      return NextResponse.json({ error: "already_paid", message: "이미 이 사업계획서는 열려 있습니다." }, { status: 409 });
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
      ...(purchaseDomain ? { domainRequest: { domain: purchaseDomain, status: "requested" as const, ...(registrant?.ok ? { registrant: registrant.value } : {}), ...(renewal ? { renewal: true } : {}) } } : {}),
      ...(noticePhone ? { noticePhone } : {}),
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
