import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { completeJson } from "../../../../lib/llm/complete";
import { withUsageContext } from "../../../../lib/llm/usage-context";
import { MARKETING_KIT_OUTPUT_SCHEMA, marketingKitPrompt, marketingKitResult } from "../../../../lib/marketing/kit";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const bodySchema = z.object({ planId: z.string().min(1).max(60) }).strict();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

/*
 * 홍보 키트 + SNS 4주 운영표 만들기. 결제한 사업만 쓸 수 있고, AI 비용을 지키려고 사람마다 하루 5번까지만 만든다.
 * 결과는 돌려주기만 하고, 저장은 화면이 사업 기록(__marketing_kit)에 한다 — 사람이 고친 글을 서버가 덮지 않게.
 */
export async function POST(request: Request) {
  /* 주소(IP)별로는 짧은 폭주만 막는다 — 카페·회사처럼 같은 인터넷을 쓰는 여러 사장님이 하루 횟수를 나눠 쓰지 않게 */
  const burst = await enforceRateLimit("marketing-kit-burst", request, { limit: 30, windowMs: 10 * 60_000, message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." });
  if (burst) return burst;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: { code: "BAD_REQUEST", message: "요청을 확인해 주세요." } }, 400);
  try {
    const identity = await requireAuthenticatedIdentity();
    const plan = (await loadPlanState(identity.hash)).plans.find(item => item.id === parsed.data.planId);
    if (!plan) return json({ error: { code: "PLAN_NOT_FOUND", message: "사업을 찾을 수 없어요." } }, 404);
    const access = await resolvePlanAccess(plan.planType, plan.id);
    if (!access.paid) return json({ error: { code: "PAYMENT_REQUIRED", message: "홍보 키트는 결제한 사업에서 만들 수 있어요." } }, 402);
    /* 하루 5번은 계정마다 — 결제·사업 확인을 통과한 실제 생성 요청만 센다 */
    const limited = await enforceRateLimit("marketing-kit", request, { key: identity.hash, limit: 5, windowMs: 24 * 60 * 60_000, message: "홍보 키트는 하루 5번까지 만들 수 있어요. 내일 다시 시도해 주세요." });
    if (limited) return limited;
    const config = resolveLLMConfig(identity.hash, "anthropic");
    if (!config) return json({ error: { code: "AI_UNAVAILABLE", message: "지금은 홍보 키트를 만들 수 없어요. 잠시 후 다시 시도해 주세요." } }, 503);
    const prompt = marketingKitPrompt(plan);
    /*
     * 형식이 깨진 답(JSON이 아니거나 칸이 모자람)이면 한 번만 다시 부른다. 금지 표현은 걸린 말만 고쳐 쓰고(kit.ts), 고쳐도 못 쓰면 실패로 둔다.
     * 버린 까닭은 내용 없이 코드·칸 이름만 남긴다(2026-10-22: 모델은 답했는데 첫 시도가 502로 끝나 까닭을 알 수 없었다).
     */
    for (let attempt = 1; attempt <= 2; attempt++) {
      let failure: string | undefined;
      const raw = await withUsageContext({ planId: plan.id, ownerHash: identity.hash }, () => completeJson(config, {
        kind: "marketing-kit", system: prompt.system, user: prompt.user, effort: "medium", maxOutputTokens: 8000, timeoutMs: 150_000,
        jsonSchema: MARKETING_KIT_OUTPUT_SCHEMA, anthropicJsonSchema: true, onFailure: event => { failure = event.code; },
      }));
      /* 사장님이 정한 가격이 하나뿐이면 [가격] 자리를 채운다(상품이 여럿이면 'N원부터') */
      const result = raw ? marketingKitResult(raw, prompt.facts, { online: prompt.shape === "online" }) : { kit: null, reason: !failure || failure === "invalid_json" || failure === "invalid_response" ? "format" as const : `provider:${failure}`, issues: [] };
      if (result.kit) {
        if (result.fixed) console.info("[marketing-kit]", JSON.stringify({ event: "phrases-fixed", attempt, fields: result.fixed }));
        return json({ kit: result.kit, generatedAt: new Date().toISOString() });
      }
      console.warn("[marketing-kit]", JSON.stringify({ event: "rejected", attempt, reason: result.reason, issues: result.issues }));
      // 다시 부르는 건 형식이 깨졌을 때뿐 — 한도·장애·시간 초과는 다시 불러도 같다
      if (result.reason !== "format") break;
    }
    return json({ error: { code: "AI_FAILED", message: "홍보 글을 만들지 못했어요. 잠시 후 다시 시도해 주세요." } }, 502);
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED") return json({ error: { code: "ACCOUNT_LOGIN_REQUIRED", message: "로그인 후 이용해 주세요." } }, 401);
    return json({ error: { code: "MARKETING_KIT_FAILED", message: "홍보 키트를 만들지 못했어요." } }, 500);
  }
}
