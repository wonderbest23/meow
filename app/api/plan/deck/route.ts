import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { buildDeckPlan } from "../../../../lib/plan-builder/deck-plan";
import { renderDeckPptx } from "../../../../lib/plan-builder/deck-render";

export const runtime = "nodejs";
export const maxDuration = 60;

// 완성한 계획서로 발표용 PPT를 만든다.
// 유료 결과물이므로 결제 여부를 먼저 확인한다.

export async function POST(req: Request) {
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

  const sections = (body.sections ?? [])
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

  const identity = await requireGuestIdentity();
  const config = resolveLLMConfig(identity.hash, "anthropic");

  const plan = await buildDeckPlan(config, {
    businessName: String(body.businessName ?? "").slice(0, 60) || "사업 제안서",
    businessDescription: body.businessDescription ? String(body.businessDescription).slice(0, 500) : undefined,
    planType: body.planType,
    sections,
    allAnswers: body.allAnswers ?? {},
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

  const buffer = await renderDeckPptx(plan);
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
