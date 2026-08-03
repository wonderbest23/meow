import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/account-auth";
import { listPaymentHistory } from "../../../../lib/payments/plan-orders";

export const runtime = "nodejs";

// 내 결제 내역 — 로그인한 본인 것만 돌려준다.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "로그인이 필요합니다." } }, { status: 401 });
  }
  try {
    return NextResponse.json(
      { payments: await listPaymentHistory(user.id) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    // 내역을 못 읽는다고 마이페이지 전체가 막히면 안 된다
    return NextResponse.json({ payments: [] }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
