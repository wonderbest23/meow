import { NextResponse } from "next/server";
import { authConfigured } from "../../../../../lib/account-auth";
import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { appAccountTokenFor } from "../../../../../lib/payments/apple-iap";
import { IAP_PRODUCT_IDS, iapProduct } from "../../../../../lib/payments/iap-products";
import { purchaseBlocked } from "../../../../../lib/payments/purchase-rules";
import { evaluatePlatformLaunchReadiness } from "../../../../../lib/platform-legal/domain";
import { getPlatformLegalSettings } from "../../../../../lib/platform-legal/repository";

export const runtime = "nodejs";

/*
 * 앱 인앱결제 시작 — 스토어 결제창을 띄우기 전에 웹 카드 결제와 같은 규칙(이미 산 것·홈페이지는 계획서 뒤)을 서버가 먼저 본다.
 * 통과하면 스토어 상품 ID와 구매자 표시(appAccountToken)를 돌려준다. 앱은 이 표시를 붙여 결제하고,
 * 완료(/api/payments/iap/complete) 때 서버는 영수증의 표시가 이 계정 것인지 확인한다.
 */
const TERMS_KEYS = ["service", "privacy", "aiLimitations", "refund", "digitalSupply", "personalizedDigitalNoRefund"] as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { planId?: unknown; product?: unknown; terms?: Record<string, unknown> };
  const product = iapProduct(body.product);
  const planId = typeof body.planId === "string" ? body.planId.slice(0, 60) : "";
  if (!product) return NextResponse.json({ error: "product_unavailable", message: "앱에서는 구매할 수 없는 상품이에요." }, { status: 400 });
  if (!planId) return NextResponse.json({ error: "plan_required", message: "결제할 사업 정보가 없어요. 사업계획서 화면에서 다시 시도해 주세요." }, { status: 400 });
  // 결제 전 필수 확인은 카드 결제와 같다(약관·개인정보·AI 안내·환불 기준·제공 시점·청약철회 제한)
  if (!TERMS_KEYS.every((key) => body.terms?.[key] === true)) {
    return NextResponse.json({ error: "terms_required", message: "결제 전 필수 항목에 모두 동의해 주세요." }, { status: 400 });
  }

  let identity: Awaited<ReturnType<typeof requireAuthenticatedIdentity>>;
  try {
    identity = await requireAuthenticatedIdentity();
  } catch {
    return NextResponse.json({ error: "login_required", message: "로그인한 뒤에 결제할 수 있어요." }, { status: 401 });
  }

  const readiness = evaluatePlatformLaunchReadiness(await getPlatformLegalSettings(), { authConfigured: authConfigured(), paymentsConfigured: true });
  if (!readiness.paymentAllowed) {
    return NextResponse.json({ error: "paid_launch_blocked", message: "아직 결제를 열기 전이에요. 결제가 열리면 바로 결제할 수 있어요. 궁금한 점은 고객센터로 남겨 주세요." }, { status: 503 });
  }

  const blocked = await purchaseBlocked(product, planId, { userId: identity.userId, hash: identity.hash });
  if (blocked) return blocked;

  return NextResponse.json({ productId: IAP_PRODUCT_IDS[product], appAccountToken: appAccountTokenFor(identity.userId) });
}
