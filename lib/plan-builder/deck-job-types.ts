import type { DeckBuildEvent, DeckPlan } from "./deck-plan";
import type { ProposalOptions } from "./proposal-blueprint";

export const DECK_JOB_KEY = "__deck_job";
export interface DeckJobRequest { ownerHash: string; planId: string; token: string }
export interface DeckJob {
  token: string; runId: string; fingerprint: string;
  status: "queued" | "running" | "complete" | "failed";
  phase: DeckBuildEvent["stage"] | "queued";
  updatedAt: string; attempt: number; code?: string; retryWindowStartedAt?: string;
  draft?: DeckPlan; result?: DeckPlan;
  presentation?: Pick<ProposalOptions, "sector" | "purpose">;
}
export function readDeckJob(answers: Record<string, Record<string, unknown>>): DeckJob | null {
  const job = answers[DECK_JOB_KEY];
  return job && typeof job.token === "string" && typeof job.fingerprint === "string" && ["queued", "running", "complete", "failed"].includes(String(job.status)) ? job as unknown as DeckJob : null;
}
export const deckJobActive = (job: DeckJob | null) => !!job && (job.status === "queued" || job.status === "running");
export const deckJobExpired = (job: DeckJob) => !Number.isFinite(Date.parse(job.updatedAt)) || Date.now() - Date.parse(job.updatedAt) > 20 * 60_000;
export function deckRetryState(job: DeckJob | null, fingerprint: string, now = Date.now()) {
  const sameSource = job?.fingerprint === fingerprint;
  const startedAt = sameSource ? Date.parse(job.retryWindowStartedAt ?? job.updatedAt) : NaN;
  const activeWindow = Number.isFinite(startedAt) && now - startedAt < 15 * 60_000;
  return {
    attempt: activeWindow && job ? job.attempt + 1 : 1,
    retryWindowStartedAt: new Date(activeWindow ? startedAt : now).toISOString(),
    retryAfterSeconds: activeWindow && job && job.attempt >= 3 ? Math.ceil((startedAt + 15 * 60_000 - now) / 1000) : 0,
  };
}
export function publicDeckJob(job: DeckJob | null) {
  if (!job) return null;
  const { draft: _draft, result: _result, ...status } = job;
  return { ...status, resumable: !!job.draft, ready: job.status === "complete" && !!job.result };
}
export type PublicDeckJob = NonNullable<ReturnType<typeof publicDeckJob>>;
export const DECK_PHASE_LABELS: Record<DeckJob["phase"], string> = {
  queued: "발표자료 제작을 접수했어요", generating: "슬라이드를 구성하고 있어요",
  reviewing: "계획서와 내용이 맞는지 확인하고 있어요", repairing: "검토한 내용을 다듬고 있어요",
  validating: "마지막으로 형식을 확인하고 있어요", rendering: "PPT 파일을 만들고 있어요", ready: "발표자료가 준비됐어요", failed: "발표자료 제작을 완료하지 못했어요",
};
export function deckFailureMessage(code?: string, resumable = false) {
  const saved = resumable ? " 저장된 슬라이드 초안이 있어요. 다시 시도하면 검토부터 이어가요." : " 기존 계획서는 유지되어 있어요. 다시 시도하면 슬라이드 구성부터 시작해요.";
  if (code === "provider_quota_exhausted") return "지금은 AI를 쓸 수 없어 잠시 멈췄어요. 고객센터에 알려 주시면 확인해 드릴게요. " + (resumable ? "슬라이드 초안은 저장되어 있어요." : "원본 계획서는 저장되어 있어요.");
  if (code === "render_failed") return "내용 검토는 끝났지만 PPT 파일을 만들지 못했어요. 다시 시도하면 검토한 내용 그대로 파일만 다시 만들어요.";
  if (code === "provider_timeout" || code === "job_timeout") return "AI 응답이 늦어져 잠시 멈췄어요." + saved;
  if (code === "provider_rate_limited") return "AI 요청이 잠시 몰렸어요. 잠시 후 다시 시도해 주세요." + saved;
  if (code === "provider_unavailable" || code === "workflow_incomplete") return "만드는 중에 연결이 끊겨 멈췄어요." + saved;
  if (code === "review_output_limit" || code === "generation_output_limit") return "내용이 길어 작업을 끝내지 못했어요." + saved;
  if (code === "review_response_invalid" || code === "review_json_invalid") return "검토 결과를 읽지 못했어요." + saved;
  if (code === "document_changed" || code === "document_stale") return "사업 정보가 달라졌어요. 최신 계획서를 확인하고 다시 만들어 주세요.";
  if (code === "review_unresolved" || code === "source_validation_failed" || code === "review_quote_mismatch") return "원본 계획서와 맞는지 확인하지 못해 제작을 멈췄어요. 계획서 내용을 확인해 주세요.";
  return "제작을 완료하지 못했어요." + saved;
}
