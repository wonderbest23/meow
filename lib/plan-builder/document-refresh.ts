import { z } from "zod";
import type { CoachField } from "./coach";
import type { RewriteTarget } from "./proposal-rewrite";

export const DOCUMENT_REFRESH_TIMEOUT_MS = 120000;
export type DocumentRefreshPayload = {
  businessName: string; businessDescription: string; stage: string;
  sector?: string; purpose?: string;
  fields: Array<Pick<CoachField, "key" | "value" | "basis">>;
  financialReference: string;
  sections: Array<{ key: string; chapterTitle: string; sectionTitle: string; markdown: string }>;
};
export type DocumentRefreshPreview = {
  hash: string; sourceRevision: number; target: RewriteTarget | null; payload: DocumentRefreshPayload;
  sections: Array<{ key: string; generatedAt: string; manual: boolean }>;
};
export type DocumentRefreshJob = {
  id: string; preview: DocumentRefreshPreview;
  status: "running" | "ready" | "failed" | "applied" | "dismissed";
  startedAt: string; claimedAt?: string; finishedAt?: string; error?: string;
  drafts?: Array<{ key: string; markdown: string; html: string; summary: string }>;
  decisions?: Record<string, "replace" | "keep">; appliedRevision?: number;
  usage?: Array<{ model: string; inputTokens?: number; outputTokens?: number }>;
};
export const documentRefreshCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("document_generate"), id: z.string().uuid(), hash: z.string().length(64), sections: z.array(z.string().min(1).max(100)).min(1).max(3), consent: z.literal(true) }).strict(),
  z.object({ type: z.literal("document_apply"), id: z.string().uuid(), expectedRevision: z.number().int().positive(), decisions: z.record(z.string().max(100), z.enum(["replace", "keep"])) }).strict(),
  z.object({ type: z.literal("document_dismiss"), id: z.string().uuid() }).strict(),
]);
export type DocumentRefreshCommand = z.infer<typeof documentRefreshCommandSchema>;
export const documentRefreshResultSchema = z.object({ sections: z.array(z.object({
  key: z.string().min(1).max(100), markdown: z.string().trim().min(1).max(8000), summary: z.string().trim().min(1).max(200),
}).strict()).min(1).max(3) }).strict();
export function documentRefreshExpired(job: DocumentRefreshJob) {
  return job.status === "running" && Date.now() - Date.parse(job.startedAt) > DOCUMENT_REFRESH_TIMEOUT_MS;
}
export function documentRefreshError(code?: string) {
  return ({ timeout: "문서 갱신 시간이 초과됐어요. 기존 본문은 그대로 보관되어 있어요", source_changed: "작성 중 사업 조건이나 본문이 바뀌었어요. 최신 내용을 다시 확인해 주세요", target_changed: "전송 대상이 바뀌어 작성을 중단했어요", invalid_response: "새 본문이 검토 형식을 통과하지 못했어요. 기존 문서는 유지됩니다", review_failed: "새 본문이 원문 검토를 통과하지 못했어요. 기존 문서는 유지됩니다", quota_exhausted: "AI 사용 한도로 작성을 마치지 못했어요. 기존 문서는 그대로 남아 있어요", rate_limited: "AI 요청이 많아 작성을 마치지 못했어요. 잠시 후 새 요청을 검토해 주세요", output_limit: "작성 분량이 제한을 넘었어요. 선택 항목 수를 줄여 주세요" } as Record<string, string>)[code ?? ""] ?? "새 본문을 만들지 못했어요. 기존 문서는 그대로 남아 있어요";
}
