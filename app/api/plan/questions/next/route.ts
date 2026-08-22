import { NextResponse } from "next/server";
import { resolveLLMConfig } from "../../../../../lib/llm/config";
import { requireAuthenticatedIdentity } from "../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { normalizeAnalysis, type AnalysisStatus, type SlotAnswer } from "../../../../../lib/plan-builder/analyzer/domain";
import { analyzeGaps, pickRoundSlots, MAX_ROUNDS } from "../../../../../lib/plan-builder/analyzer/gap";
import { generateQuestions } from "../../../../../lib/plan-builder/analyzer/question-generator";

export const runtime = "nodejs";

/*
 * POST /api/plan/questions/next — 다음 라운드 질문.
 *
 * 무엇을 물을지는 서버의 Gap Analyzer(규칙)가 정하고, AI는 문장만 만든다.
 * AI가 실패해도 팩 기본 문장으로 질문은 항상 돌아온다.
 */
export async function POST(req: Request) {
  const limited = await enforceRateLimit("plan-questions", req, { limit: 40, windowMs: 10 * 60_000 });
  if (limited) return limited;

  let identity: { hash: string };
  try {
    identity = await requireAuthenticatedIdentity();
  } catch {
    return NextResponse.json({ ok: false, reason: "login_required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    analysis?: unknown;
    slots?: Record<string, Partial<SlotAnswer>>;
    answers?: Record<string, Record<string, unknown>>;
    round?: number;
  };
  const analysis = normalizeAnalysis(body.analysis);
  if (!analysis) return NextResponse.json({ ok: false, reason: "bad_analysis" }, { status: 400 });

  const slots: Record<string, SlotAnswer> = {};
  for (const [k, v] of Object.entries(body.slots ?? {})) {
    if (!v || typeof v !== "object") continue;
    const st: AnalysisStatus = v.status === "confirmed" ? "confirmed" : v.status === "inferred" ? "inferred" : "unknown";
    slots[k.slice(0, 60)] = { value: typeof v.value === "string" ? v.value.slice(0, 300) : null, status: st };
  }
  const round = Math.max(1, Math.min(MAX_ROUNDS, Number(body.round) || 1));
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};

  const report = analyzeGaps({ analysis, slots }, answers);
  const picked = pickRoundSlots(report);
  const config = resolveLLMConfig(identity.hash, "anthropic");
  const generated = await generateQuestions(config, analysis, picked, round);

  return NextResponse.json({
    ok: true,
    round,
    intro: generated.intro,
    questions: generated.questions,
    source: generated.source,
    completeness: Math.round(report.completeness * 100),
    canFinish: report.canFinish,
    pack: report.pack.id,
    remaining: report.gaps.length,
  });
}
