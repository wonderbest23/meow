import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState, savePlanState, normalizeState, type ServerPlanState } from "../../../../lib/plan-builder/plan-server-store";

export const runtime = "nodejs";

// 플랜 빌더 상태 저장/조회 — 소유권은 guest identity(owner_hash).
// 구조: 사업 1개 + 플랜 여러 개.

export async function GET() {
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  return NextResponse.json(state);
}

export async function PUT(request: Request) {
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
