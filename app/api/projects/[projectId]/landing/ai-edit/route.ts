import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { getProject } from "../../../../../../lib/project-repository";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../../../lib/landing/plan-entitlement";
import { resolveTokenBalance, recordAiEditUsage } from "../../../../../../lib/landing/ai-tokens";
import { resolveLLMConfig } from "../../../../../../lib/llm/config";
import { completeJson } from "../../../../../../lib/llm/complete";
import { loadBrainwavePageServer } from "../../../../../../lib/landing/brainwave/load";

export const runtime = "nodejs";

/*
 * 홈페이지 글을 AI 에게 시켜 고친다 — 토큰을 쓰는 유료 기능.
 *
 * 들어오는 것: 지시문 + 페이지 id + 지금 글 자리 값(편집 중인 것 포함).
 * 나가는 것: 바꿀 자리만 { 노드id: 새 글 }. 디자인·자리·사진은 건드리지 않는다.
 *
 * 순서: 편집 권한 → 토큰 잔액(최소 2천) → 호출 → 사용량 기록(실패하면 결과를
 * 돌려주지 않는다: 기록 없이 주면 공짜) → 잔액과 함께 응답.
 */
const bodySchema = z.object({
  instruction: z.string().trim().min(2).max(1000),
  page: z.string().regex(/^[0-9]+-[0-9]+$/),
  texts: z.record(z.string(), z.string().max(4000)).default({}),
  business: z.object({ name: z.string().max(120).default(""), summary: z.string().max(600).default("") }).default({ name: "", summary: "" }),
});

const MIN_TOKENS = 2_000;

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const identity = await requireGuestIdentity();
  const reason = await checkLandingEditAccess(projectId, identity.hash, identity.userId, identity.email);
  if (reason !== "ok") {
    const { status, body } = landingEditErrorResponse(reason);
    return NextResponse.json(body, { status });
  }
  const project = await getProject(projectId, identity.hash);
  const planId = String((project?.opportunity as { planId?: string } | null)?.planId ?? "");
  if (!planId) return NextResponse.json({ error: { code: "PLAN_REQUIRED", message: "계획서에서 만든 홈페이지만 AI 수정을 쓸 수 있습니다." } }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "지시문을 확인해 주세요." } }, { status: 400 });
  const body = parsed.data;

  const balance = await resolveTokenBalance(identity.userId, planId);
  if (balance.remaining < MIN_TOKENS) {
    return NextResponse.json({ error: { code: "TOKENS_REQUIRED", message: "AI 수정 토큰이 부족합니다. 토큰을 충전해 주세요." }, balance }, { status: 402 });
  }

  const page = await loadBrainwavePageServer(body.page);
  if (!page) return NextResponse.json({ error: { code: "PAGE_NOT_FOUND", message: "페이지를 찾을 수 없습니다." } }, { status: 404 });

  /* 글 자리 목록: id → 지금 글(고친 값이 있으면 그것, 없으면 킷 원문) */
  const slots = page.slots.text.map((t) => ({ id: t.id, text: body.texts[t.id] ?? t.text }));
  const config = resolveLLMConfig(identity.hash, "anthropic");
  if (!config) return NextResponse.json({ error: { code: "AI_UNAVAILABLE", message: "지금은 AI 수정을 쓸 수 없습니다." } }, { status: 503 });

  let usage = { inputTokens: 0, outputTokens: 0, provider: config.provider as string };
  const result = await completeJson(config, {
    kind: "landing-ai-edit",
    system: [
      "당신은 소상공인 홈페이지의 카피라이터입니다. 홈페이지는 고정된 디자인 템플릿이고, 글 자리마다 id 가 있습니다.",
      "사용자의 지시에 따라 바꿔야 할 글 자리만 골라 새 글을 씁니다. 디자인·순서·사진은 바꿀 수 없습니다.",
      "규칙:",
      "- 각 자리의 글자 수는 원래 글의 0.6~1.2배로 맞춥니다(칸 크기가 고정이라 넘치면 잘립니다).",
      "- 줄바꿈(\\n)이 있던 자리는 같은 줄 수를 지킵니다. 메뉴처럼 공백 여러 개로 띄운 글은 그 간격을 그대로 둡니다.",
      "- 없는 사실(수치·후기·수상)을 지어내지 않습니다. 사용자가 준 정보만 씁니다. 모르는 수치는 원래 자리의 수치를 그대로 둡니다.",
      "- 한국어, 손님에게 말하는 존댓말. 과장 표현 금지.",
      "- 바꾸지 않을 자리는 빼고, JSON 객체 { \"<id>\": \"<새 글>\" } 만 출력합니다. 최대 80개.",
    ].join("\n"),
    user: [
      `사업: ${body.business.name || "(이름 없음)"} — ${body.business.summary || "(설명 없음)"}`,
      `지시: ${body.instruction}`,
      "",
      "글 자리 목록(id | 지금 글):",
      ...slots.map((s) => `${s.id} | ${s.text.replace(/\n/g, "\\n")}`),
    ].join("\n"),
    maxOutputTokens: 4000,
    jsonObject: true,
    timeoutMs: 60_000,
    onUsage: (u) => { usage = { inputTokens: u.inputTokens, outputTokens: u.outputTokens, provider: u.provider }; },
  });

  const ok = Boolean(result);
  const recorded = await recordAiEditUsage({ planId, ownerHash: identity.hash, provider: usage.provider, ok, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
  if (!ok) return NextResponse.json({ error: { code: "AI_FAILED", message: "AI 가 답을 만들지 못했습니다. 토큰은 차감되지 않았습니다." } }, { status: 502 });
  if (!recorded) return NextResponse.json({ error: { code: "USAGE_NOT_RECORDED", message: "사용량을 기록하지 못해 결과를 적용하지 않았습니다. 잠시 후 다시 시도해 주세요." } }, { status: 500 });

  /* 아는 자리만, 글만 받는다 — AI 가 엉뚱한 키를 만들어도 새 자리가 생기지 않는다 */
  const known = new Set(slots.map((s) => s.id));
  const texts: Record<string, string> = {};
  for (const [id, value] of Object.entries(result ?? {})) {
    if (known.has(id) && typeof value === "string" && value.trim()) texts[id] = value.slice(0, 4000);
  }
  const after = await resolveTokenBalance(identity.userId, planId);
  return NextResponse.json({ texts, changed: Object.keys(texts).length, usage, balance: after });
}
