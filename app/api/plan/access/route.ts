import { NextResponse } from "next/server";
import { resolvePlanAccess, FREE_SECTION_COUNT, freeSectionLabels } from "../../../../lib/plan-builder/access";
import { PLAN_PRODUCT_AMOUNT, PLAN_PRODUCT_NAME } from "../../../../lib/payments/plan-orders";
import { nicepayConfigured } from "../../../../lib/payments/nicepay-client";
import { getAuthenticatedUser } from "../../../../lib/account-auth";

export const runtime = "nodejs";

// 플랜 빌더 접근 권한 조회 — 로그인·결제 여부와 무료 구간을 알려준다.
// 판정은 서버(lib/plan-builder/access.ts)에서만 하고 화면은 결과만 받는다.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const planType = url.searchParams.get("planType") ?? undefined;
  const planId = url.searchParams.get("planId") ?? undefined;
  try {
    const access = await resolvePlanAccess(planType, planId);
    return NextResponse.json(
      {
        authenticated: access.authenticated,
        email: access.email,
        paid: access.paid,
        allAccess: access.allAccess,
        hasAnyPaid: access.hasAnyPaid,
        freeKeys: access.freeKeys,
        freeCount: FREE_SECTION_COUNT,
        freeLabels: freeSectionLabels(planType),
        price: access.price,
        productName: PLAN_PRODUCT_NAME,
        payable: nicepayConfigured(),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    /*
     * 권한을 확인하지 못하면 잠근 쪽으로 답한다(열어주는 실수를 하지 않는다).
     * 단, 로그인 여부는 따로 다시 본다 — 예전엔 결제 기록 조회가 한 번 실패해도 '로그인 안 됨'으로 답해
     * 로그인한 사람에게 결제·마이페이지 화면이 "로그인이 필요합니다"를 띄웠다.
     * unavailable 로 '확인 실패'를 알려, 화면이 결제를 권하지 않고 다시 확인하게 한다.
     */
    const user = await getAuthenticatedUser().catch(() => null);
    return NextResponse.json(
      { unavailable: true, authenticated: !!user, email: user?.email ?? null, paid: false, allAccess: false, hasAnyPaid: false, freeKeys: [], freeCount: FREE_SECTION_COUNT, freeLabels: [], price: PLAN_PRODUCT_AMOUNT, productName: PLAN_PRODUCT_NAME, payable: false },
      { status: 200, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
