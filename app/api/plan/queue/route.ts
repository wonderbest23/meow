import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { resolvePlanAccess, checkSectionAccess } from "../../../../lib/plan-builder/access";
import { PLAN_BLUEPRINT } from "../../../../lib/plan-builder/blueprint";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

/*
 * 본문 생성을 서버에 맡긴다.
 *
 * 브라우저 큐는 창을 닫으면 대기 중이던 생성이 사라졌다. 여기 걸어 두면
 * 사용자가 창을 닫아도 서버가 끝까지 만든다.
 *
 * POST — 만들 섹션들을 걸어 둔다(순서대로).
 * GET  — 이 플랜에서 아직 본문이 없는 섹션 수를 알려준다(진행 상황 표시용).
 */

/** 워크플로 바인딩 — 로컬 개발에는 없다(그때는 브라우저가 직접 만든다) */
async function workflowBinding() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env?.PLAN_SECTIONS_WORKFLOW ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const plan = state.plans.find((item) => item.id === planId);
  if (!plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });

  // 답변은 했는데 본문이 아직 없는 섹션 = 서버가 만들고 있거나 만들 것
  const pending = Object.keys(plan.answers).filter((key) => {
    const answers = plan.answers[key];
    return answers && Object.keys(answers).length > 0 && !plan.sections[key];
  });

  return NextResponse.json(
    { pending: pending.length, pendingKeys: pending, supported: (await workflowBinding()) !== null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("plan-queue", request, {
    limit: 30,
    windowMs: 10 * 60_000,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as {
    planId?: string;
    sections?: Array<{ chapterId?: string; sectionId?: string }>;
  };
  if (!body.planId || !Array.isArray(body.sections) || body.sections.length === 0) {
    return NextResponse.json({ error: "planId and sections required" }, { status: 400 });
  }

  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const plan = state.plans.find((item) => item.id === body.planId);
  if (!plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });

  const access = await resolvePlanAccess(plan.planType, plan.id);
  if (!access.authenticated) {
    return NextResponse.json({ error: "login_required", message: "로그인 후 이용할 수 있습니다." }, { status: 401 });
  }

  /*
   * 섹션마다 권한을 따로 본다 — 무료 구간을 넘는 섹션이 섞여 있으면
   * 그것만 빼고 나머지를 만든다. 통째로 거절하면 무료 사용자는 아무것도 못 만든다.
   */
  const allowed: Array<{ chapterId: string; sectionId: string }> = [];
  let blocked = 0;
  for (const item of body.sections.slice(0, 40)) {
    const chapter = PLAN_BLUEPRINT.find((c) => c.id === item.chapterId);
    const section = chapter?.sections.find((s) => s.id === item.sectionId);
    if (!chapter || !section) continue;
    const key = `${chapter.id}/${section.id}`;
    if (checkSectionAccess(access, key) !== "ok") {
      blocked += 1;
      continue;
    }
    allowed.push({ chapterId: chapter.id, sectionId: section.id });
  }

  if (allowed.length === 0) {
    return NextResponse.json(
      { error: "payment_required", message: "이어서 쓰려면 결제가 필요합니다.", blocked },
      { status: 402 },
    );
  }

  const workflow = await workflowBinding();
  if (!workflow) {
    // 로컬 개발에는 워크플로 바인딩이 없다 — 브라우저가 직접 만들도록 알린다
    return NextResponse.json({ started: false, supported: false, queued: 0, blocked });
  }

  /*
   * 실행 아이디를 결정적으로 만든다 — 같은 플랜으로 1분 안에 다시 오면
   * (더블클릭, 화면 재시도) 같은 아이디가 되어 새 런이 만들어지지 않는다.
   * 워크플로 아이디는 재사용이 안 되므로 분 단위 버킷을 붙여 시간이 지나면
   * 자연히 새 아이디가 된다. 그 뒤의 중복은 섹션 서비스의
   * ALREADY_GENERATED 건너뛰기가 받는다.
   */
  const bucket = Math.floor(Date.now() / 60_000).toString(36);
  const instanceId = `pb-${identity.hash.slice(0, 10)}-${plan.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}-${bucket}`;
  try {
    const run = await workflow.create({
      id: instanceId,
      params: { ownerHash: identity.hash, planId: plan.id, sections: allowed },
    });
    return NextResponse.json({ started: true, supported: true, runId: run.id, queued: allowed.length, blocked });
  } catch (error) {
    /*
     * 아이디 충돌 = 방금 같은 플랜으로 이미 시작된 런이 있다 — 그 런이 일을
     * 맡고 있으니 시작된 것으로 답한다. 다른 이유의 실패를 중복으로 오해하면
     * 안 되므로, 그 아이디의 런이 실제로 있는지 확인한 뒤에만 그렇게 답한다.
     */
    const existing = await workflow.get(instanceId).catch(() => null);
    if (existing) {
      return NextResponse.json({ started: true, supported: true, runId: instanceId, deduped: true, queued: allowed.length, blocked });
    }
    console.error("[plan-queue] workflow create 실패:", error instanceof Error ? error.message : error);
    return NextResponse.json({ started: false, supported: true, queued: 0, blocked }, { status: 500 });
  }
}
