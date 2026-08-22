import { NextResponse } from "next/server";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { analyzeBusiness } from "../../../../lib/plan-builder/analyzer/business-analyzer";

export const runtime = "nodejs";

/*
 * POST /api/plan/analyze — 사업 설명 → BusinessAnalysis. LLM 1회.
 *
 * 저장은 하지 않는다. 화면이 plan.answers["__analysis"] 에 넣고 기존 동기화
 * (plan-store → /api/plan/state)로 올린다 — 저장 경로를 하나로 유지하기 위해서다.
 * 실패(키 없음·타임아웃·JSON·검증)는 전부 {ok:false} — 화면은 기존 위저드로 안내한다.
 */
export async function POST(req: Request) {
  const limited = await enforceRateLimit("plan-analyze", req, { limit: 20, windowMs: 10 * 60_000, message: "분석 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;

  let identity: { hash: string };
  try {
    identity = await requireAuthenticatedIdentity();
  } catch {
    return NextResponse.json({ ok: false, reason: "login_required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    description?: string;
    name?: string;
    industry?: string;
    region?: string;
    stage?: string;
  };
  const description = (body.description ?? "").trim();
  if (description.length < 5) return NextResponse.json({ ok: false, reason: "too_short" }, { status: 400 });

  const config = resolveLLMConfig(identity.hash, "anthropic");
  if (!config) return NextResponse.json({ ok: false, reason: "no_llm" });

  const analysis = await analyzeBusiness(config, {
    description,
    name: (body.name ?? "").slice(0, 120),
    industry: (body.industry ?? "").slice(0, 60),
    region: (body.region ?? "").slice(0, 80),
    stage: (body.stage ?? "").slice(0, 60),
  });
  if (!analysis) return NextResponse.json({ ok: false, reason: "analysis_failed" });
  return NextResponse.json({ ok: true, analysis });
}
