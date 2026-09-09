import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { resolveLLMConfig, resolvePlanningLLMConfig } from "../../../../lib/llm/config";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { coachDocumentSnapshot } from "../../../../lib/plan-builder/coach-document";
import { coachContext, readCoach } from "../../../../lib/plan-builder/coach";
import { buildDeckPlan } from "../../../../lib/plan-builder/deck-plan";
import { renderDeckPptx } from "../../../../lib/plan-builder/deck-render";
import { pickDeckTheme } from "../../../../lib/plan-builder/deck-themes";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

// 완성한 계획서로 발표용 PPT를 만든다.
// 유료 결과물이므로 결제 여부를 먼저 확인한다.

export async function POST(req: Request) {
  // AI·렌더 비용이 드는 호출 — 화면 제어와 별개로 서버에서 빈도를 제한한다
  const limited = await enforceRateLimit("deck-build", req, { limit: 12, windowMs: 10 * 60_000, message: "발표자료 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as {
    /** true면 PPTX 대신 슬라이드 구성(JSON)을 돌려준다 — 품질 검수·테스트용 */
    planOnly?: boolean;
    businessName?: string;
    businessDescription?: string;
    planType?: string;
    planId?: string;
    sections?: Array<{ chapterTitle?: string; sectionTitle?: string; markdown?: string }>;
    allAnswers?: Record<string, Record<string, unknown>>;
  };

  const access = await resolvePlanAccess(body.planType, typeof body.planId === "string" ? body.planId : undefined);
  if (!access.authenticated) {
    return NextResponse.json({ error: "login_required", message: "로그인 후 이용할 수 있습니다." }, { status: 401 });
  }
  if (!access.paid) {
    return NextResponse.json(
      { error: "payment_required", message: "발표자료는 결제 후 만들 수 있습니다." },
      { status: 402 },
    );
  }

  const identity = await requireGuestIdentity();
  let businessContext: string | undefined;
  if (body.planId) {
    const saved = (await loadPlanState(identity.hash)).plans.find(p => p.id === body.planId);
    if (!saved) return NextResponse.json({ message: "문서를 찾을 수 없습니다." }, { status: 404 });
    const snapshot = coachDocumentSnapshot(saved);
    const coach = readCoach(saved.answers);
    if (snapshot && coach) {
      if (snapshot.stale.length || snapshot.missing.length) {
        return NextResponse.json({ message: "대화에서 최신 내용을 문서에 반영한 뒤 발표자료를 만들어주세요. 기존 내용은 유지되어 있습니다." }, { status: 409 });
      }
      body.businessName = snapshot.business.name;
      body.businessDescription = snapshot.business.description;
      body.planType = saved.planType;
      body.sections = snapshot.sections;
      body.allAnswers = saved.answers;
      businessContext = coachContext(coach);
    }
  }

  const sections = (Array.isArray(body.sections) ? body.sections : [])
    .map((s) => ({
      chapterTitle: String(s.chapterTitle ?? "").slice(0, 60),
      sectionTitle: String(s.sectionTitle ?? "").slice(0, 60),
      markdown: String(s.markdown ?? ""),
    }))
    .filter((s) => s.markdown.trim().length > 0);

  if (sections.length < 3) {
    return NextResponse.json(
      { error: "not_enough_content", message: "섹션을 3개 이상 작성한 뒤 만들 수 있습니다." },
      { status: 400 },
    );
  }

  const config = businessContext ? resolvePlanningLLMConfig(identity.hash) : resolveLLMConfig(identity.hash, "anthropic");

  const plan = await buildDeckPlan(config, {
    businessName: String(body.businessName ?? "").slice(0, 60) || "사업 제안서",
    businessDescription: body.businessDescription ? String(body.businessDescription).slice(0, 500) : undefined,
    planType: body.planType,
    sections,
    allAnswers: body.allAnswers ?? {},
    businessContext,
  });

  if (!plan) {
    return NextResponse.json(
      { error: "deck_failed", message: "발표자료를 만들지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

  if (body.planOnly) {
    return NextResponse.json({ plan }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }

  const theme = pickDeckTheme(body.planType, String(body.businessName ?? ""), String(body.businessDescription ?? ""));
  const buffer = await renderDeckPptx(plan, theme);
  const safe = `${plan.brandName} 사업 제안서`.replace(/[\\/:*?"<>|]/g, "").trim() || "사업 제안서";
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${ascii}.pptx"; filename*=UTF-8''${encodeURIComponent(safe)}.pptx`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
