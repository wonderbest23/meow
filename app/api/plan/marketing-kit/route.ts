import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { completeJson } from "../../../../lib/llm/complete";
import { withUsageContext } from "../../../../lib/llm/usage-context";
import { MARKETING_KIT_OUTPUT_SCHEMA, marketingKitPrompt, normalizeMarketingKit } from "../../../../lib/marketing/kit";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const bodySchema = z.object({ planId: z.string().min(1).max(60) }).strict();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

/*
 * 홍보 키트 + SNS 4주 운영표 만들기. 결제한 사업만 쓸 수 있고, AI 비용을 지키려고 사람마다 하루 5번까지만 만든다.
 * 결과는 돌려주기만 하고, 저장은 화면이 사업 기록(__marketing_kit)에 한다 — 사람이 고친 글을 서버가 덮지 않게.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit("marketing-kit", request, { limit: 5, windowMs: 24 * 60 * 60_000, message: "홍보 키트는 하루 5번까지 만들 수 있어요. 내일 다시 시도해 주세요." });
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: { code: "BAD_REQUEST", message: "요청을 확인해 주세요." } }, 400);
  try {
    const identity = await requireAuthenticatedIdentity();
    const plan = (await loadPlanState(identity.hash)).plans.find(item => item.id === parsed.data.planId);
    if (!plan) return json({ error: { code: "PLAN_NOT_FOUND", message: "사업을 찾을 수 없어요." } }, 404);
    const access = await resolvePlanAccess(plan.planType, plan.id);
    if (!access.paid) return json({ error: { code: "PAYMENT_REQUIRED", message: "홍보 키트는 결제한 사업에서 만들 수 있어요." } }, 402);
    const config = resolveLLMConfig(identity.hash, "anthropic");
    if (!config) return json({ error: { code: "AI_UNAVAILABLE", message: "지금은 홍보 키트를 만들 수 없어요. 잠시 후 다시 시도해 주세요." } }, 503);
    const prompt = marketingKitPrompt(plan);
    const raw = await withUsageContext({ planId: plan.id, ownerHash: identity.hash }, () => completeJson(config, {
      kind: "marketing-kit", system: prompt.system, user: prompt.user, effort: "medium", maxOutputTokens: 8000, timeoutMs: 150_000,
      jsonSchema: MARKETING_KIT_OUTPUT_SCHEMA, anthropicJsonSchema: true,
    }));
    const kit = normalizeMarketingKit(raw);
    if (!kit) return json({ error: { code: "AI_FAILED", message: "홍보 글을 만들지 못했어요. 잠시 후 다시 시도해 주세요." } }, 502);
    return json({ kit, generatedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED") return json({ error: { code: "ACCOUNT_LOGIN_REQUIRED", message: "로그인 후 이용해 주세요." } }, 401);
    return json({ error: { code: "MARKETING_KIT_FAILED", message: "홍보 키트를 만들지 못했어요." } }, 500);
  }
}
