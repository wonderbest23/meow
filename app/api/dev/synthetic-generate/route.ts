// 합성 미리보기 전용(lib/synthetic-preview.ts) — Cloudflare Workflow 대신 같은 섹션 생성 함수를 차례로 부른다(가짜 AI). 운영에서는 404.
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { loadPlanState, savePlanState } from "../../../../lib/plan-builder/plan-server-store";
import { chaptersForType } from "../../../../lib/plan-builder/blueprint";
import { generateAndSaveSection, generatePlanOutline } from "../../../../lib/plan-builder/section-service";
import { coachDocumentRevision, readCoach } from "../../../../lib/plan-builder/coach";
import { syntheticPreviewEnabled, syntheticPreviewNotFound } from "../../../../lib/synthetic-preview";

export async function POST(request: Request) {
  if (!syntheticPreviewEnabled()) return syntheticPreviewNotFound();
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
  // ?limit=1 — 실제 AI 시험에서 '채팅으로 고치기'처럼 계획서가 있기만 하면 되는 경우 앞 몇 장만 만들어 비용을 줄인다
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 0);
  for (const s of limit > 0 ? sections.slice(0, limit) : sections) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    try { results.push({ key: `${s.chapterId}/${s.sectionId}`, ...(await generateAndSaveSection({ ownerHash: identity.hash, planId, ...s, outline: outline.outline })) }); }
    catch (error) { results.push({ key: `${s.chapterId}/${s.sectionId}`, ok: false, error: error instanceof Error ? error.message : String(error) }); }
  }
  return Response.json({ outline: outline.ok, results });
}
