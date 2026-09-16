import { z } from "zod";
import type { DeckSlide } from "./deck-plan";
import type { ProposalChangePreview, ProposalSource } from "./proposal-revision";

export const REWRITE_TIMEOUT_MS = 120000;
export type RewriteTarget = { provider: string; model: string };
export type RewritePayload = {
  businessName: string; businessDescription?: string;
  sector?: string; purpose?: string;
  sourceIds?: Record<string, string>;
  sources: ProposalSource["sections"];
  changes: Array<{ section: string; before: string; after: string }>;
  slides: Array<Omit<DeckSlide, "image" | "placement">>;
};
export type RewritePreview = {
  hash: string; baseContentHash: string; sourceFingerprint: string;
  impact: ProposalChangePreview; payload: RewritePayload; target: RewriteTarget | null;
};
export type ProposalRewrite = {
  id: string; preview: RewritePreview; status: "running" | "ready" | "failed" | "applied" | "dismissed";
  startedAt: string; claimedAt?: string; finishedAt?: string; error?: string; slides?: DeckSlide[];
  usage?: Array<{ model: string; inputTokens: number; outputTokens: number }>;
  appliedRevision?: number;
  choices?: Record<string, "keep_manual" | "use_revised">;
};
export const rewriteCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("generate"), id: z.string().uuid(), hash: z.string().length(64), consent: z.literal(true) }).strict(),
  z.object({ type: z.literal("apply"), id: z.string().uuid(), expectedRevision: z.number().int().positive(), choices: z.record(z.string().max(80), z.enum(["keep_manual", "use_revised"])) }).strict(),
  z.object({ type: z.literal("dismiss"), id: z.string().uuid() }).strict(),
]);
export type RewriteCommand = z.infer<typeof rewriteCommandSchema>;
export const rewriteResultSchema = z.object({ slides: z.array(z.object({
  id: z.string().min(1).max(80), eyebrow: z.string().min(1).max(24), title: z.string().min(1).max(50),
  lead: z.string().max(100).nullable(), note: z.string().max(160).nullable(),
  points: z.array(z.object({ id: z.string().max(80).optional(), label: z.string().min(1).max(20), detail: z.string().min(1).max(90) }).strict()).min(1).max(4).nullable(),
  metrics: z.array(z.object({ label: z.string().min(1).max(24), value: z.string().min(1).max(30), note: z.string().max(40).nullable() }).strict()).min(1).max(4).nullable(),
  table: z.object({ headers: z.array(z.string().min(1).max(12)).min(2).max(4), rows: z.array(z.array(z.string().max(25))).min(1).max(5) }).strict().nullable(),
  sourceSections: z.array(z.string().min(1).max(200)).min(1).max(4),
}).strict()).min(1).max(4) }).strict();

// Editable point IDs are local identity, not text the model should regenerate.
// Strict provider schemas cannot contain optional object properties.
export const rewriteProviderResultSchema = rewriteResultSchema.extend({
  slides: z.array(rewriteResultSchema.shape.slides.element.extend({
    points: z.array(rewriteResultSchema.shape.slides.element.shape.points.unwrap().element.omit({ id: true })).min(1).max(4).nullable(),
  })).min(1).max(4),
});

export function rewriteErrorMessage(code?: string) {
  if (code === "target_changed") return "AI 전송 대상이 바뀌어 중단했어요. 변경분과 전송 대상을 다시 확인해 주세요";
  return ({ timeout: "처리 시간이 초과됐어요. 기존 제안서는 그대로 보관되어 있어요", quota_exhausted: "AI 이용 한도를 확인해 주세요. 기존 제안서는 바뀌지 않았어요", rate_limited: "AI 요청이 몰렸어요. 잠시 뒤 다시 확인해 주세요", review_failed: "원문과 새 문안이 일치하는지 확인하지 못했어요. 자동 반영하지 않았어요", source_changed: "작성 중 원문이나 편집본이 바뀌어 반영을 중단했어요", invalid_response: "새 문안이 편집 규격을 통과하지 못했어요. 기존 내용은 유지됩니다", output_limit: "문안 분량이 처리 한도를 넘었어요. 원문을 간결하게 정리해 주세요" } as Record<string, string>)[code ?? ""] ?? "새 문안을 만들지 못했어요. 기존 제안서는 그대로 보관되어 있어요";
}

export function rewriteExpired(job: ProposalRewrite) {
  return job.status === "running" && Date.now() - Date.parse(job.startedAt) > REWRITE_TIMEOUT_MS * Math.max(1, Math.ceil(job.preview.payload.slides.length / 4));
}
