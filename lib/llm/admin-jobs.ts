import { z } from "zod";

const nullableText = z.string().nullable();
export const adminJobSchema = z.object({ id: z.string(), planId: z.string(), kind: z.enum(["deck", "coach", "operating"]), status: nullableText, phase: nullableText, errorCode: nullableText, checkpoint: z.enum(["source", "draft_slides", "reviewed_slides", "analysis"]), updatedAt: nullableText, startedAt: nullableText, finishedAt: nullableText, provider: nullableText, model: nullableText, inputTokens: z.number().nullable(), outputTokens: z.number().nullable() });
export type AdminJob = z.infer<typeof adminJobSchema>;
export type AdminUsage = { id: string; kind: string; provider: string; ok: boolean; model: string | null; elapsed_ms: number | null; failure_code: string | null; input_tokens: number | null; output_tokens: number | null; created_at: string };
export function jobNextStep(job: AdminJob, now = Date.now()) {
  if (job.status === "running" || job.status === "queued") {
    const at = Date.parse(job.updatedAt ?? "");
    const timeout = job.kind === "operating" ? 90000 : job.kind === "coach" ? 600000 : 1200000;
    return !Number.isFinite(at) || now - at > timeout ? "응답 중단 여부 확인" : "처리 중";
  }
  if (job.status === "ready" || job.status === "complete") return job.kind === "deck" ? "내려받기 가능" : job.kind === "operating" ? "개선 행동 선택 가능" : "대화 계속하기";
  if (job.status !== "failed") return "상태 확인 필요";
  if (job.kind !== "deck") return job.kind === "operating" ? "기록 확인 후 새 분석 요청" : "저장된 대화에서 다시 요청";
  if (["document_changed", "document_stale"].includes(job.errorCode ?? "")) return "최신 계획서 확인 후 다시 생성";
  return job.checkpoint === "reviewed_slides" ? "파일 제작부터 재개" : job.checkpoint === "draft_slides" ? "저장된 초안 검토부터 재개" : "원본 계획서에서 슬라이드 생성";
}
export function jobDuration(job: AdminJob) {
  if (!job.startedAt || !job.finishedAt) return null;
  const value = Date.parse(job.finishedAt) - Date.parse(job.startedAt);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
