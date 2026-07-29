import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState, savePlanState, type ServerPlanState } from "../../../../lib/plan-builder/plan-server-store";

export const runtime = "nodejs";

// 플랜 빌더 상태 저장/조회 — 소유권은 guest identity(owner_hash).

export async function GET(request: Request) {
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

  const b = (body.business ?? {}) as Partial<ServerPlanState["business"]>;
  const state: ServerPlanState = {
    title: typeof body.title === "string" ? body.title : "새 플랜",
    planType: typeof body.planType === "string" ? body.planType : "창업 초기 · 사업계획서",
    business: {
      name: typeof b.name === "string" ? b.name : "",
      description: typeof b.description === "string" ? b.description : "",
      role: typeof b.role === "string" ? b.role : "",
      industry: typeof b.industry === "string" ? b.industry : "",
      region: typeof b.region === "string" ? b.region : "",
      stage: typeof b.stage === "string" ? b.stage : "",
    },
    sections: body.sections && typeof body.sections === "object" ? body.sections : {},
  };

  await savePlanState(identity.hash, state);
  return NextResponse.json({ ok: true });
}
