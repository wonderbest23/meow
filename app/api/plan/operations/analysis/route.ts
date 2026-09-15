import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { ANALYSIS_VERSION, analysisSelectionSchema, analysisTargetSchema } from "../../../../../lib/plan-builder/operating-analysis-contract";
import { OperatingError, periodReferenceSchema } from "../../../../../lib/plan-builder/operating-records";
import { analysisRuntime, generateOperatingAnalysis, previewOperatingAnalysis } from "../../../../../lib/plan-builder/operating-analysis-service";

export const runtime = "nodejs";
export const maxDuration = 90;
const base = { planId: z.string().min(1).max(60), reference: periodReferenceSchema, selection: analysisSelectionSchema };
const schema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("preview") }).strict(),
  z.object({ ...base, action: z.literal("generate"), id: z.string().uuid(), consent: z.object({ accepted: z.literal(true), version: z.literal(ANALYSIS_VERSION), hash: z.string().regex(/^[a-f0-9]{64}$/), target: analysisTargetSchema }).strict() }).strict(),
]);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  const limited = await enforceRateLimit("operating-analysis", request, { limit: 20, windowMs: 60000 });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "기간과 전송 동의를 다시 확인해 주세요." }, 400);
  try {
    const identity = await requireGuestIdentity();
    const config = analysisRuntime(identity.hash);
    if (config && config.target.provider !== "mock" && !identity.userId) return json({ message: "AI 분석은 로그인한 뒤 이용할 수 있어요." }, 401);
    const input = parsed.data;
    if (input.action === "preview") return json({ preview: await previewOperatingAnalysis(identity.hash, input.planId, input.reference, input.selection, config) });
    const result = await generateOperatingAnalysis(identity.hash, input.planId, input, config);
    return json(result, result.records.analyses.find(a => a.id === result.analysisId)?.status === "running" ? 202 : 200);
  } catch (error) {
    if (error instanceof OperatingError) return json({ message: error.message, code: error.code }, error.status);
    return json({ message: "분석 상태를 확인하지 못했어요. 기존 기록은 유지됩니다. 저장 상태를 확인한 뒤 다시 시도해 주세요." }, 503);
  }
}
