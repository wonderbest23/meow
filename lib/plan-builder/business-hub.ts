import { chaptersForType } from "./blueprint";
import { coachDocumentRevision, readCoach } from "./coach";
import { isCoachJobActive, readCoachJob } from "./coach-job-types";
import type { Plan } from "./plan-store";

export const ACTION_KEY = "__business_next_action";

export function businessHubState(plan: Plan, runStatus?: string | null) {
  const coach = readCoach(plan.answers);
  const job = readCoachJob(plan.answers);
  const keys = chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => `${chapter.id}/${section.id}`));
  const documents = keys.filter(key => !!plan.sections[key]?.markdown?.trim() || !!plan.sections[key]?.html?.trim());
  const revision = coach ? coachDocumentRevision(coach) : null;
  const stale = !!coach && documents.some(key => plan.sections[key].coachRevision !== revision);
  const complete = keys.length > 0 && documents.length === keys.length;
  const generation = plan.answers.__coach_generation;
  const running = !!generation?.runId && ["queued", "running", "waiting"].includes(runStatus ?? "");
  let status = coach?.ready ? "사업안 준비됨" : coach ? "대화 중" : "작성 중";
  if (documents.length) status = complete ? "문서 완성" : "자료 일부 준비됨";
  if (stale) status = "수정 내용 반영 필요";
  if (running) status = "문서 제작 중";
  if (isCoachJobActive(job)) status = "답변 준비 중";
  if (job?.status === "failed" || ["errored", "terminated"].includes(runStatus ?? "")) status = "다시 확인 필요";
  return { coach, job, keys, documents, revision, stale, complete, status, running };
}

export function actionStatus(plan: Plan, action: string) {
  const record = plan.answers[ACTION_KEY];
  const coach = readCoach(plan.answers);
  if (!coach || record?.revision !== coachDocumentRevision(coach) || record?.action !== action) return "pending";
  return record.status === "done" || record.status === "skipped" ? record.status : "pending";
}

export function workspaceHref(id: string) { return `/plan/workspace?planId=${encodeURIComponent(id)}`; }
export function businessChatHref(id: string, prompt?: string) {
  const query = new URLSearchParams({ planId: id });
  if (prompt) query.set("prompt", prompt);
  return `/plan/chat?${query}`;
}
