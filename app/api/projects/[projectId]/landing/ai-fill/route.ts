import { NextResponse } from "next/server";
import { withUsageContext } from "../../../../../../lib/llm/usage-context";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../../../lib/rate-limit";
import { getProject } from "../../../../../../lib/project-repository";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../../../lib/landing/plan-entitlement";
import { getLandingForProject, saveLandingDraft } from "../../../../../../lib/landing/repository";
import { loadPlanState } from "../../../../../../lib/plan-builder/plan-server-store";
import { readCoach } from "../../../../../../lib/plan-builder/coach";
import { resolveLLMConfig } from "../../../../../../lib/llm/config";
import { completeJson } from "../../../../../../lib/llm/complete";
import { applyHomepageCopy, homepageFillPrompt, normalizeHomepageCopy } from "../../../../../../lib/landing/ai-fill";
import { countAiFills, recordAiFill } from "../../../../../../lib/landing/ai-fill-usage";

export const runtime = "nodejs";

/*
 * 계획서로 홈페이지 채우기(AI) — 카드·이용 순서·마무리 문구와 업종 사진.
 *
 * 홈페이지를 처음 만들 때 한 번 자동으로 돌고, 결제한 사람은 '계획서로 다시 채우기'로
 * 두 번 더 쓸 수 있다(미리보기만 하는 사람은 처음 한 번). 실패한 호출은 세지 않는다.
 * 사장님이 고친 글·사진은 건드리지 않는다(applyHomepageCopy).
 */
const FILLS_FOR_EDITORS = 3;
const FILLS_FOR_PREVIEW = 1;
const bodySchema = z.object({ expectedUpdatedAt: z.string().min(1).max(60) });

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const limited = await enforceRateLimit("landing-ai-fill", request, { limit: 10, windowMs: 10 * 60_000, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const { projectId } = await context.params;
  const identity = await requireGuestIdentity();
  const reason = await checkLandingEditAccess(projectId, identity.hash, identity.userId, identity.email);
  if (reason !== "ok" && reason !== "payment_required") {
    const { status, body } = landingEditErrorResponse(reason);
    return NextResponse.json(body, { status });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "요청을 확인해 주세요." } }, { status: 400 });

  const project = await getProject(projectId, identity.hash);
  const planId = String((project?.opportunity as { planId?: string } | null)?.planId ?? "");
  if (!planId) return NextResponse.json({ error: { code: "PLAN_REQUIRED", message: "계획서에서 만든 홈페이지만 채울 수 있습니다." } }, { status: 400 });
  const site = await getLandingForProject(projectId, identity.hash);
  if (!site) return NextResponse.json({ error: { code: "LANDING_NOT_FOUND", message: "홈페이지를 찾을 수 없습니다." } }, { status: 404 });
  if (site.updatedAt !== parsed.data.expectedUpdatedAt) {
    return NextResponse.json({ error: { code: "LANDING_DRAFT_CONFLICT", message: "다른 화면에서 초안이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요." } }, { status: 409 });
  }
  const plan = (await loadPlanState(identity.hash)).plans.find((item) => item.id === planId);
  if (!plan) return NextResponse.json({ error: { code: "PLAN_NOT_FOUND", message: "계획서를 찾을 수 없습니다." } }, { status: 404 });

  const limit = reason === "ok" ? FILLS_FOR_EDITORS : FILLS_FOR_PREVIEW;
  const used = await countAiFills(planId);
  if (used === null) return NextResponse.json({ error: { code: "AI_FILL_UNAVAILABLE", message: "지금은 AI 채우기를 쓸 수 없습니다. 잠시 후 다시 시도해 주세요." } }, { status: 503 });
  if (used >= limit) {
    return NextResponse.json({ error: { code: "AI_FILL_LIMIT", message: reason === "ok" ? `AI 채우기는 홈페이지마다 ${limit}번까지 쓸 수 있어요. 글은 에디터에서 직접 고칠 수 있어요.` : "미리보기에서는 AI 채우기를 한 번만 쓸 수 있어요. 결제하면 다시 채울 수 있어요." } }, { status: 429 });
  }

  const config = resolveLLMConfig(identity.hash, "anthropic");
  if (!config) return NextResponse.json({ error: { code: "AI_UNAVAILABLE", message: "지금은 AI 채우기를 쓸 수 없습니다." } }, { status: 503 });
  const prompt = homepageFillPrompt(plan);
  const raw = await withUsageContext({ planId, ownerHash: identity.hash }, () => completeJson(config, { kind: "landing-ai-fill", system: prompt.system, user: prompt.user, maxOutputTokens: 3000, jsonObject: true, timeoutMs: 120_000 }));
  const copy = normalizeHomepageCopy(raw);
  if (!copy) return NextResponse.json({ error: { code: "AI_FAILED", message: "AI 가 홈페이지 글을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." } }, { status: 502 });

  const draft = applyHomepageCopy(site.draft, copy, { industry: readCoach(plan.answers)?.business.industry ?? "", description: readCoach(plan.answers)?.business.description ?? "" });
  try {
    const saved = await saveLandingDraft(projectId, identity.hash, draft, { expectedUpdatedAt: site.updatedAt });
    await recordAiFill(planId, identity.hash);
    return NextResponse.json({ site: saved, expectedUpdatedAt: site.updatedAt, remaining: Math.max(0, limit - used - 1) });
  } catch (error) {
    if (error instanceof Error && error.message === "LANDING_DRAFT_CONFLICT") {
      return NextResponse.json({ error: { code: "LANDING_DRAFT_CONFLICT", message: "채우는 동안 초안이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요." } }, { status: 409 });
    }
    throw error;
  }
}
