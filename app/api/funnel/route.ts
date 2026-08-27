import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../lib/api-auth";
import { enforceRateLimit } from "../../../lib/rate-limit";
import { funnelEventSchema } from "../../../lib/funnel/domain";
import { saveFunnelEvent } from "../../../lib/funnel/repository";

export const runtime = "nodejs";

/*
 * 깔때기 이벤트 수집.
 *
 * 화면(trackFunnel)이 쏘고 잊는 자리다. 무엇이 잘못돼도 200 계열로 답한다 —
 * 이 API 의 오류가 사용자 화면에 어떤 형태로든 비치면 안 된다.
 * 이벤트 이름은 정해진 목록(funnelEventSchema)만 통과시킨다.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit("funnel", request, {
    limit: 120,
    windowMs: 10 * 60_000,
    message: "요청이 너무 많습니다.",
  });
  if (limited) return limited;

  try {
    const identity = await requireGuestIdentity();
    const parsed = funnelEventSchema.safeParse(await request.json().catch(() => ({})));
    if (parsed.success) {
      await saveFunnelEvent(identity.hash, parsed.data).catch(() => {});
    }
  } catch {
    // 수집 실패는 조용히 — 아래에서 똑같이 ok 로 답한다
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
