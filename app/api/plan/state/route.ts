import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState, savePlanState, deletePlanById, normalizeState, type ServerPlanState } from "../../../../lib/plan-builder/plan-server-store";

export const runtime = "nodejs";

// 플랜 빌더 상태 저장/조회 — 소유권은 guest identity(owner_hash).
// 구조: 사업 1개 + 플랜 여러 개.

export async function GET() {
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  // 클라이언트가 로그아웃·세션 만료를 감지해 로컬 캐시를 비울 수 있게 인증 여부를 함께 준다
  return NextResponse.json({ ...state, authenticated: identity.userId !== null });
}

async function saveFromRequest(request: Request) {
  const limited = await enforceRateLimit("plan-state-save", request, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const identity = await requireGuestIdentity();
  const body = (await request.json().catch(() => null)) as Partial<ServerPlanState> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  await savePlanState(identity.hash, normalizeState(body));
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  return saveFromRequest(request);
}

/*
 * 화면을 떠날 때의 마지막 저장은 navigator.sendBeacon으로 온다.
 * beacon은 POST로만 보낼 수 있어서(메서드를 고를 수 없다) 같은 처리를
 * POST에도 열어 둔다. 없으면 405로 조용히 버려진다 —
 * 정작 가장 중요한 '나가기 직전 저장'이 실패한다.
 */
export async function POST(request: Request) {
  return saveFromRequest(request);
}

export async function DELETE(request: Request) {
  const limited = await enforceRateLimit("plan-state-save", request, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const identity = await requireGuestIdentity();
  const planId = new URL(request.url).searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });
  await deletePlanById(identity.hash, planId);
  return NextResponse.json({ ok: true });
}
