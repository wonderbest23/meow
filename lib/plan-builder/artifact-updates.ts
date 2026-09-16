import { z } from "zod";
import type { ServerPlan } from "./plan-server-store";
import type { DeckSlide } from "./deck-plan";
import type { DocumentRefreshPayload } from "./document-refresh";
import type { RewriteTarget } from "./proposal-rewrite";
import type { LandingDraft } from "../landing/domain";

export const ARTIFACT_SOURCE_KEY = "__artifact_sources";
export const ARTIFACT_DOCUMENT_CHUNK = 3;
export const ARTIFACT_SLIDE_CHUNK = 4;
export const ARTIFACT_MAX_CHUNKS = 80;
export type ArtifactBase = { sourceRevision: number; sourceHash: string; documentHash: string; proposalRevision: number; proposalHash: string; homepageRevision: string | null };
export type ArtifactSource = { id: string; label: string; value: string; basis: string; unit?: string; period?: string; revision?: number; provenance?: { messageId: string; quote: string } };
export type ArtifactPreview = {
  version: 1; planId: string; hash: string; base: ArtifactBase; target: RewriteTarget | null;
  sources: ArtifactSource[];
  documents: Array<{ id: string; key: string; title: string; before: string; locked: boolean; manual: boolean; sourceIds: string[] }>;
  slides: Array<{ id: string; title: string; before: string; manual: boolean; sourceIds: string[] }>;
  homepage: null | { siteId: string; projectId: string; before: LandingDraft; after: LandingDraft; changed: string[]; manualPreserved: string[]; sourcePreview: import("../landing/source-update").LandingSourcePreview };
};
export type ArtifactChunk = {
  id: string; kind: "document" | "ppt"; keys: string[]; status: "pending" | "running" | "complete" | "failed";
  claim?: string; startedAt?: string; finishedAt?: string; error?: string;
  usage?: Array<{ model: string; inputTokens?: number; outputTokens?: number }>;
};
export type ArtifactUpdate = {
  version: 1; id: string; planId: string; ownerHash: string; revision: number;
  status: "queued" | "running" | "ready" | "failed" | "stale" | "cancelled" | "applied";
  createdAt: string; updatedAt: string; preview: ArtifactPreview; snapshot: ServerPlan;
  chunks: ArtifactChunk[]; dispatchAttempt: number; requestedHomepage: boolean; error?: string;
  budget: { maxCalls: number; reservedCalls: number; maxInputBytes: number; reservedInputBytes: number; maxOutputTokens: number; reservedOutputTokens: number; deadline: string };
  documents: Array<{ key: string; markdown: string; html: string; summary: string }>;
  slides: DeckSlide[];
  decisionHash?: string; staleItems?: string[];
};
export type ArtifactRuntime = {
  target: RewriteTarget;
  document: { generate(payload: DocumentRefreshPayload, onUsage?: (usage: NonNullable<ArtifactChunk["usage"]>[number]) => void): Promise<unknown> };
  ppt: import("./proposal-rewrite-service").RewriteRuntime;
};
const baseSchema = z.object({ sourceRevision: z.number().int().nonnegative(), sourceHash: z.string().length(64), documentHash: z.string().length(64), proposalRevision: z.number().int().nonnegative(), proposalHash: z.string().length(64), homepageRevision: z.string().max(60).nullable() }).strict();
const identity = { id: z.string().uuid() };
export const artifactCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("generate"), ...identity, hash: z.string().length(64), base: baseSchema, consent: z.literal(true), includeHomepage: z.boolean() }).strict(),
  z.object({ type: z.literal("resume"), ...identity, expectedRevision: z.number().int().positive(), consent: z.literal(true) }).strict(),
  z.object({ type: z.literal("cancel"), ...identity, expectedRevision: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("homepage_apply"), ...identity, hash: z.string().length(64), base: baseSchema, choices: z.record(z.string().max(200), z.enum(["replace", "keep"])) }).strict(),
  z.object({ type: z.literal("approve"), ...identity, expectedRevision: z.number().int().positive(), base: baseSchema,
    documents: z.record(z.string().max(100), z.enum(["replace", "keep"])), slides: z.record(z.string().max(80), z.enum(["replace", "keep"])), homepage: z.enum(["replace", "keep"]), homepageChoices: z.record(z.string().max(200), z.enum(["replace", "keep"])).default({}) }).strict(),
]);
export type ArtifactCommand = z.infer<typeof artifactCommandSchema>;
export type ArtifactJobRequest = { operation: "artifact_update"; ownerHash: string; planId: string; jobId: string; attempt: number };
export function artifactSlideText(slide?: DeckSlide): string {
  if (!slide) return "";
  return [slide.eyebrow, slide.title, slide.lead,
    ...slide.points?.map(point => `${point.label}\n${point.detail}`) ?? [],
    ...(slide.table ? [slide.table.headers.join(" | "), ...slide.table.rows.map(row => row.join(" | "))] : []),
    ...slide.metrics?.map(metric => `${metric.label}: ${metric.value}${metric.note ? ` (${metric.note})` : ""}`) ?? [],
    ...(slide.chart ? [`${slide.chart.basis === "actual" ? "실적" : "예상"} 차트 (${slide.chart.unit})`, ...slide.chart.series.map(series => `${series.name}: ${slide.chart!.categories.map((category, index) => `${category} ${series.values[index]}`).join(" / ")}`), `출처: ${slide.chart.source}`] : []),
    slide.image ? `이미지: ${slide.image.alt || "직접 선택한 이미지"}` : "", slide.note,
  ].filter(Boolean).join("\n\n");
}
export type ArtifactUpdateView = Omit<ArtifactUpdate, "ownerHash" | "snapshot">;
export function publicArtifactUpdate(job: ArtifactUpdate): ArtifactUpdateView {
  const { ownerHash: _owner, snapshot: _snapshot, ...view } = job;
  return { ...view, chunks: view.chunks.map(({ claim: _claim, ...chunk }) => chunk) };
}
export function artifactErrorMessage(code?: string) {
  const errors: Record<string, string> = {
    source_changed: "사업 정보나 결과물이 바뀌었어요. 기존 결과물은 유지되며 새 변경안을 확인해야 해요",
    revision_conflict: "다른 화면에서 먼저 저장했어요. 최신 상태를 확인해 주세요",
    outcome_unknown: "응답을 확인하지 못한 작업이 있어요. 중복 실행하지 않고 완료된 부분을 보관했어요",
    quota_exhausted: "AI 사용 한도로 중단됐어요. 완료된 변경안은 보관되어 있어요",
    review_failed: "내용 검토를 통과하지 못했어요. 기존 결과물은 바뀌지 않았어요",
    target_changed: "AI 전송 대상이 바뀌어 중단했어요. 다시 확인해 주세요",
    dispatch_pending: "요청은 저장됐어요. 같은 요청의 실행 상태를 다시 확인해 주세요",
    disabled: "AI 연동 갱신은 아직 열리지 않았어요. 변경 범위는 확인할 수 있어요",
  };
  return errors[code ?? ""] ?? "변경 작업을 마치지 못했어요. 기존 결과물과 완료된 변경안은 보관되어 있어요";
}
