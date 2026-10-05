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
    /*
     * 빈 목록(200)으로 답하면 마이페이지가 '아직 결제 내역이 없습니다'라고 보여 결제한 사람을 놀라게 한다.
     * 실패는 실패로 알린다 — 마이페이지는 이 내역 칸만 '불러오지 못했어요'로 바꾸고 나머지는 그대로 쓴다.
     */
    return NextResponse.json(
      { error: { code: "PAYMENTS_UNAVAILABLE", message: "결제 내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." } },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
