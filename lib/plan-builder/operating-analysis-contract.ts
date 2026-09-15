import { z } from "zod";

export const ANALYSIS_VERSION = "operating-review-v1";
export const ANALYSIS_LEASE_MS = 90000;
export function analysisIsRunning(analysis: { status: string; startedAt: string }, now = Date.now()) { return analysis.status === "running" && now - Date.parse(analysis.startedAt) < ANALYSIS_LEASE_MS; }
export const analysisSelectionSchema = z.object({ feedback: z.boolean(), notes: z.boolean() }).strict();
export type AnalysisSelection = z.infer<typeof analysisSelectionSchema>;
export const analysisTargetSchema = z.object({ provider: z.enum(["openai", "anthropic", "mock"]), model: z.string().min(1).max(100) }).strict();
export type AnalysisTarget = z.infer<typeof analysisTargetSchema>;
const shortText = z.string().trim().min(1).max(600);
export const analysisResultSchema = z.object({
  summary: shortText,
  hypotheses: z.array(z.object({ title: z.string().trim().min(1).max(100), explanation: shortText, evidenceIds: z.array(z.string().min(1).max(80)).min(1).max(5), uncertainty: shortText }).strict()).min(1).max(3),
  actions: z.array(z.object({ title: z.string().trim().min(1).max(100), hypothesisIndex: z.number().int().min(0).max(2), action: shortText, successCriterion: shortText }).strict()).min(1).max(3),
  limitations: z.array(shortText).min(1).max(4),
}).strict();
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export const analysisEvidenceSchema = z.object({ id: z.string(), label: z.string(), value: z.string(), basis: z.enum(["user", "calculation"]) });
export type AnalysisEvidence = z.infer<typeof analysisEvidenceSchema>;
export const analysisPayloadSchema = z.object({ businessTitle: z.string(), currentPeriod: z.string(), previousPeriod: z.string().nullable(), evidence: z.array(analysisEvidenceSchema), warnings: z.array(z.string()) });
export type AnalysisPayload = z.infer<typeof analysisPayloadSchema>;
export const chosenActionSchema = z.object({ index: z.number().int().min(0).max(2), action: z.string().trim().min(1).max(1500), successCriterion: z.string().trim().min(1).max(1000) }).strict();
export type ChosenAction = z.infer<typeof chosenActionSchema>;
export function analysisTargetLabel(target: AnalysisTarget) { return target.provider === "mock" ? "로컬 모의 AI · 외부 전송 없음" : `${target.provider === "openai" ? "OpenAI" : "Anthropic"} · ${target.model}`; }
export function validateAnalysisResult(raw: unknown, payload: AnalysisPayload): AnalysisResult {
  const result = analysisResultSchema.parse(raw);
  const evidenceIds = new Set(payload.evidence.map(item => item.id));
  if (result.hypotheses.some(h => h.evidenceIds.some(id => !evidenceIds.has(id))) || result.actions.some(a => a.hypothesisIndex >= result.hypotheses.length)) throw new Error("ANALYSIS_EVIDENCE_INVALID");
  // These reports have no browsing source; unverified links must not become citations.
  if (/https?:\/\//i.test(JSON.stringify(result))) throw new Error("ANALYSIS_EVIDENCE_INVALID");
  return result;
}
