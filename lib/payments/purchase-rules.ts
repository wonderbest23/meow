import { NextResponse } from "next/server";
import { loadPlanState } from "../plan-builder/plan-server-store";
import { BUNDLE_PRODUCT_AMOUNT, HOMEPAGE_PRODUCT_AMOUNT } from "./domain";
import { paidHomepagePlanIds, paidPlanEntitlement } from "./plan-orders";

/** 지금 내 목록에 있는(내 소유 · 지우지 않은) 문서가 아니면 화면에 보일 응답, 맞으면 null */
export async function planNotInMyList(planId: string, ownerHash: string): Promise<NextResponse | null> {
  const state = await loadPlanState(ownerHash);
  if (state.plans.some((p) => p.id === planId)) return null;
  return NextResponse.json({ error: "not_found", message: "이 문서를 찾을 수 없습니다. 내 사업 목록에 있는 문서만 결제할 수 있어요." }, { status: 404 });
}

/*
 * 계획서·묶음·홈페이지·다시 생성을 지금 살 수 있는지 — 웹 카드 결제(prepare)와 앱 인앱결제(iap)가 같은 규칙을 쓴다.
 * 살 수 없으면 화면에 보일 응답을, 살 수 있으면 null 을 돌려준다.
 */
export async function purchaseBlocked(product: "plan" | "bundle" | "homepage" | "regen", planId: string, identity: { userId: string; hash: string }): Promise<NextResponse | null> {
  /*
   * 먼저 지금 내 목록에 있는 문서인지 본다(내 소유 · 지우지 않은 문서) — 모든 상품 공통.
   * 예전엔 계획서·묶음·홈페이지가 '이미 산 것인지'만 봐서, 지운 문서나 남의 문서 번호로도 결제가 열렸다.
   * 앱 결제 완료(app/api/payments/iap/complete)가 하던 확인과 같다. loadPlanState 는 지운 문서를 빼고 돌려준다.
   */
  const missing = await planNotInMyList(planId, identity.hash);
  if (missing) return missing;
  /*
   * 다시 생성 묶음은 '이미 산 것'이라는 개념이 없다 — 몇 번이든 더 살 수 있다.
   * 내 문서인지는 위에서 확인했다. 남의 문서에 횟수를 넣어 줄 수는 없다.
   */
  if (product === "regen") return null;
  if (product === "bundle") {
    // 묶음은 계획서와 홈페이지를 한 번에 연다 — 둘 중 하나라도 이미 열려 있으면 남은 하나만 따로 사게 한다
    const [plans, homepages] = await Promise.all([paidPlanEntitlement(identity.userId), paidHomepagePlanIds(identity.userId)]);
    if (plans.allAccess || plans.planIds.has(planId) || homepages.has(planId)) {
      return NextResponse.json({ error: "already_paid", message: "계획서나 홈페이지 중 하나가 이미 열려 있어요. 남은 상품만 따로 결제해 주세요." }, { status: 409 });
    }
    return null;
  }
  if (product === "homepage") {
    const [plans, purchased] = await Promise.all([paidPlanEntitlement(identity.userId), paidHomepagePlanIds(identity.userId)]);
    if (purchased.has(planId)) {
      return NextResponse.json({ error: "already_paid", message: "이미 이 홈페이지는 열려 있습니다." }, { status: 409 });
    }
    // 홈페이지 단독 가격은 그 사업의 계획서를 결제한 분 전용이다(2026-10-09 가격 개편) — 아직이면 묶음으로 함께 사게 한다
    if (!plans.allAccess && !plans.planIds.has(planId)) {
      return NextResponse.json({ error: "plan_required", product: "bundle", message: `홈페이지는 이 사업의 사업계획서를 결제한 뒤 ${HOMEPAGE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원에 열 수 있어요. 아직이라면 사업계획서 + 홈페이지(${BUNDLE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원)로 함께 결제해 주세요.` }, { status: 409 });
    }
    return null;
  }
  const ent = await paidPlanEntitlement(identity.userId);
  if (ent.allAccess || ent.planIds.has(planId)) {
    return NextResponse.json({ error: "already_paid", message: "이미 이 사업계획서는 열려 있습니다." }, { status: 409 });
  }
  return null;
}
