import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { chaptersForType, financialTableOwner } from "../../../../lib/plan-builder/blueprint";
import { readCoach } from "../../../../lib/plan-builder/coach";
import { readIntake } from "../../../../lib/plan-builder/intake-core";
import { narrationFacts } from "../../../../lib/plan-builder/work-narration-facts";
import type { NarrationFacts } from "../../../../lib/plan-builder/work-narration";
import { generationProgress } from "../../../../lib/plan-builder/generation-progress";

export const dynamic = "force-dynamic";

type RunHandle = { status(): Promise<{ status?: string }> };
async function runStatus(runId: string | undefined): Promise<string | null> {
  if (!runId) return null;
  try {
    const workflow = (await getCloudflareContext({ async: true })).env.PLAN_SECTIONS_WORKFLOW as { get(id: string): Promise<RunHandle> } | undefined;
    if (!workflow) return null;
    return (await (await workflow.get(runId)).status()).status ?? null;
  } catch { return null; }
}

/*
 * 사업계획서 제작 진행 — 화면이 몇 초마다 묻는다(만드는 중 팝업·문서 화면 실시간 반영).
 * 본문은 보내지 않고 장 이름·완성 여부·작업 상태만 준다.
 */
export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });
  const identity = await requireGuestIdentity();
  const plan = (await loadPlanState(identity.hash)).plans.find(item => item.id === planId);
  if (!plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });
  const generation = plan.answers.__coach_generation as { keys?: string[]; revision?: number; runId?: string; dispatchAt?: string } | undefined;
  const titles = Object.fromEntries(chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => [`${chapter.id}/${section.id}`, section.title])));
  const progress = generationProgress(generation, plan.sections, titles);
  const status = progress.total && progress.done < progress.total ? await runStatus(generation?.runId) : null;
  /*
   * 대기 문구(work-narration.ts)에 쓰는 것 — 돈 장 열쇠와 코드가 계산한 숫자(직접 답한 값만), 장마다 검토를 거치는지(상담으로 만든 계획서).
   * 쓰는 중일 때만 계산한다. 못 만들면 문구에서 빠질 뿐이다.
   */
  let narration: { facts: NarrationFacts | null; moneyKey: string | null; reviewed: boolean } | null = null;
  if (progress.active) {
    const coach = readCoach(plan.answers), intake = readIntake(plan.answers);
    let facts: NarrationFacts | null = null;
    try { facts = coach && intake ? narrationFacts(coach, intake) : null; } catch { facts = null; }
    narration = { facts, moneyKey: financialTableOwner(plan.planType), reviewed: !!coach };
  }
  return NextResponse.json({ ...progress, runStatus: status, narration }, { headers: { "Cache-Control": "private, no-store" } });
}
