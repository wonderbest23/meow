import { NextResponse } from "next/server";
import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { AppleIapError, appAccountTokenFor, verifyAppleTransaction } from "../../../../../lib/payments/apple-iap";
import { GooglePlayIapError, consumeGooglePurchase, verifyGooglePurchase } from "../../../../../lib/payments/google-play-iap";
import { APP_BUNDLE_ID, IAP_PRODUCT_IDS, iapProduct } from "../../../../../lib/payments/iap-products";
import { IapOrderError, recordIapPurchase } from "../../../../../lib/payments/iap-orders";
import { notifyPaymentComplete } from "../../../../../lib/payments/paid-notifications";
import { loadPlanState } from "../../../../../lib/plan-builder/plan-server-store";
import { enforceRateLimit } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";

/*
 * 앱 인앱결제 완료 — 스토어가 준 영수증을 확인하고 결제 기록을 남긴다.
 * 아이폰: StoreKit 2 서명 거래(JWS)를 서명·인증서 사슬로 확인한다(lib/payments/apple-iap.ts).
 * 안드로이드: 구매 토큰을 구글 서버에 조회하고, 기록한 뒤 소모 처리한다(lib/payments/google-play-iap.ts).
 * 같은 영수증을 다시 보내면 이미 반영된 것으로 성공을 돌려준다 — 앱이 응답을 못 받아 다시 보내도 안전하다.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit("iap-complete", request, { limit: 20, windowMs: 5 * 60_000, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { platform?: unknown; product?: unknown; planId?: unknown; planType?: unknown; jws?: unknown; purchaseToken?: unknown };
  const platform = body.platform === "ios" || body.platform === "android" ? body.platform : null;
  const product = iapProduct(body.product);
  const planId = typeof body.planId === "string" ? body.planId.slice(0, 60) : "";
  const planType = typeof body.planType === "string" ? body.planType.slice(0, 120) : "";
  if (!platform || !product || !planId) return NextResponse.json({ error: "bad_request", message: "결제 정보가 올바르지 않습니다." }, { status: 400 });

  let identity: Awaited<ReturnType<typeof requireAuthenticatedIdentity>>;
  try {
    identity = await requireAuthenticatedIdentity();
  } catch {
    return NextResponse.json({ error: "login_required", message: "로그인 후 결제를 반영할 수 있습니다." }, { status: 401 });
  }
  // 내 사업에만 반영한다 — 남의 사업 번호로 결제를 넣을 수 없다
  const state = await loadPlanState(identity.hash);
  if (!state.plans.some((plan) => plan.id === planId)) return NextResponse.json({ error: "not_found", message: "이 사업을 찾을 수 없습니다." }, { status: 404 });

  const accountToken = appAccountTokenFor(identity.userId);
  const productId = IAP_PRODUCT_IDS[product];
  try {
    if (platform === "ios") {
      if (typeof body.jws !== "string" || body.jws.length > 20_000) return NextResponse.json({ error: "bad_request", message: "영수증이 없습니다." }, { status: 400 });
      const transaction = verifyAppleTransaction(body.jws, { bundleId: APP_BUNDLE_ID, productId, appAccountToken: accountToken });
      const recorded = await recordIapPurchase({
        platform, storeTransactionId: transaction.transactionId, product, planId, planType, userId: identity.userId, guestTokenHash: identity.hash, email: identity.email,
        environment: transaction.environment, raw: { transactionId: transaction.transactionId, originalTransactionId: transaction.originalTransactionId, productId: transaction.productId, environment: transaction.environment, purchaseDate: transaction.purchaseDate, price: transaction.price ?? null, currency: transaction.currency ?? null },
      });
      if (recorded.firstCompletion) await notifyPaymentComplete(recorded.orderId, true).catch(() => undefined);
      return NextResponse.json({ ok: true, orderId: recorded.orderId, transactionId: transaction.transactionId });
    }
    if (typeof body.purchaseToken !== "string" || body.purchaseToken.length > 4_000) return NextResponse.json({ error: "bad_request", message: "영수증이 없습니다." }, { status: 400 });
    const purchase = await verifyGooglePurchase({ packageName: APP_BUNDLE_ID, productId, purchaseToken: body.purchaseToken, accountId: accountToken });
    const recorded = await recordIapPurchase({
      platform, storeTransactionId: purchase.transactionId, product, planId, planType, userId: identity.userId, guestTokenHash: identity.hash, email: identity.email,
      environment: purchase.environment, raw: { orderId: purchase.orderId ?? null, productId, purchaseTimeMillis: purchase.purchaseTimeMillis ?? null, regionCode: purchase.regionCode ?? null },
    });
    await consumeGooglePurchase({ packageName: APP_BUNDLE_ID, productId, purchaseToken: body.purchaseToken, accessToken: purchase.token, consumptionState: purchase.consumptionState });
    if (recorded.firstCompletion) await notifyPaymentComplete(recorded.orderId, true).catch(() => undefined);
    return NextResponse.json({ ok: true, orderId: recorded.orderId });
  } catch (error) {
    if (error instanceof AppleIapError) {
      console.error("[iap-complete] 애플 영수증 거절:", error.code);
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    if (error instanceof GooglePlayIapError || error instanceof IapOrderError) {
      console.error("[iap-complete] 거절:", error.code);
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    console.error("[iap-complete] 오류:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "iap_failed", message: "결제를 반영하지 못했습니다. 앱을 다시 열면 자동으로 다시 시도합니다." }, { status: 500 });
  }
}
