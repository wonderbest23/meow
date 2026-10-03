// 안전 미리보기 복사본 전용 — Cloudflare Workflow 대신 같은 섹션 생성 함수를 차례로 부른다(가짜 AI)
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { loadPlanState, savePlanState } from "../../../../lib/plan-builder/plan-server-store";
import { chaptersForType } from "../../../../lib/plan-builder/blueprint";
import { generateAndSaveSection, generatePlanOutline } from "../../../../lib/plan-builder/section-service";
import { coachDocumentRevision, readCoach } from "../../../../lib/plan-builder/coach";

export async function POST(request: Request) {
  if (process.env.SYNTHETIC_AUTH !== "1" || process.env.PERSISTENCE_MODE !== "demo-memory") return new Response(null, { status: 404 });
  const { planId } = await request.json() as { planId: string };
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const plan = state.plans.find(p => p.id === planId);
  if (!plan) return Response.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
  const sections = chaptersForType(plan.planType).flatMap(c => c.sections.map(s => ({ chapterId: c.id, sectionId: s.id })));
  for (const { chapterId, sectionId } of sections) plan.answers[`${chapterId}/${sectionId}`] = { planning_source: "사업 기획 대화의 공통 정보" };
  const coach = readCoach(plan.answers);
  // 운영의 제작 접수처럼 이번 제작 기록을 남긴다(진행 표시가 읽는다)
  plan.answers.__coach_generation = { keys: sections.map(s => `${s.chapterId}/${s.sectionId}`), revision: coach ? coachDocumentRevision(coach) : undefined, dispatchAt: new Date().toISOString(), runId: "synthetic" } as never;
  await savePlanState(identity.hash, state);
  const outline = await generatePlanOutline({ ownerHash: identity.hash, planId, sections });
  const results: Array<{ key: string; ok: boolean; skipped?: string; error?: string }> = [];
  const delay = Number(new URL(request.url).searchParams.get("delayMs") ?? 0);
  for (const s of sections) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    try { results.push({ key: `${s.chapterId}/${s.sectionId}`, ...(await generateAndSaveSection({ ownerHash: identity.hash, planId, ...s, outline: outline.outline })) }); }
    catch (error) { results.push({ key: `${s.chapterId}/${s.sectionId}`, ok: false, error: error instanceof Error ? error.message : String(error) }); }
  }
  return Response.json({ outline: outline.ok, results });
}
