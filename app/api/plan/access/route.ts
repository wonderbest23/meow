import { NextResponse } from "next/server";
import { resolvePlanAccess, FREE_SECTION_COUNT, freeSectionLabels } from "../../../../lib/plan-builder/access";
import { PLAN_PRODUCT_AMOUNT, PLAN_PRODUCT_NAME } from "../../../../lib/payments/plan-orders";
import { nicepayConfigured } from "../../../../lib/payments/nicepay-client";

export const runtime = "nodejs";

// 플랜 빌더 접근 권한 조회 — 로그인·결제 여부와 무료 구간을 알려준다.
// 판정은 서버(lib/plan-builder/access.ts)에서만 하고 화면은 결과만 받는다.

export async function GET(request: Request) {
  const planType = new URL(request.url).searchParams.get("planType") ?? undefined;
  try {
    const access = await resolvePlanAccess(planType);
    return NextResponse.json(
      {
        authenticated: access.authenticated,
        email: access.email,
        paid: access.paid,
        freeKeys: access.freeKeys,
        freeCount: FREE_SECTION_COUNT,
        freeLabels: freeSectionLabels(planType),
        price: PLAN_PRODUCT_AMOUNT,
        productName: PLAN_PRODUCT_NAME,
        payable: nicepayConfigured(),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    // 권한을 확인하지 못하면 잠근 쪽으로 답한다(열어주는 실수를 하지 않는다).
    return NextResponse.json(
      { authenticated: false, email: null, paid: false, freeKeys: [], freeCount: FREE_SECTION_COUNT, freeLabels: [], price: PLAN_PRODUCT_AMOUNT, productName: PLAN_PRODUCT_NAME, payable: false },
      { status: 200, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
