import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/account-auth";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { resolveRegenQuota } from "../../../../lib/plan-builder/regen-quota";
import { REGEN_PACK_AMOUNT, REGEN_PACK_COUNT } from "../../../../lib/payments/domain";

export const runtime = "nodejs";

/*
 * 이 문서의 다시 생성 잔여 횟수.
 *
 * 생성 응답에만 실어 보내면 손님은 '한 번 써 봐야' 몇 회 남았는지 안다.
 * 화면이 열릴 때 미리 보여줄 수 있도록 조회 경로를 따로 둔다.
 *
 * 남의 플랜 사용량이 새지 않게, 내가 가진 플랜인지 먼저 확인한다.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  // 로그인 전에는 보여줄 잔여 횟수가 없다 — 오류(401) 대신 빈 값으로 답해 콘솔을 조용히 둔다
  if (!user) return NextResponse.json({ quota: null }, { headers: { "Cache-Control": "private, no-store" } });

  const planId = new URL(request.url).searchParams.get("planId")?.trim() ?? "";
  if (!planId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  if (!state.plans.some((p) => p.id === planId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const quota = await resolveRegenQuota(planId);
  return NextResponse.json(
    { quota, pack: { count: REGEN_PACK_COUNT, amount: REGEN_PACK_AMOUNT } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
