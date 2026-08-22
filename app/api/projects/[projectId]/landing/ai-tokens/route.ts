import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../../lib/api-auth";
import { getProject } from "../../../../../../lib/project-repository";
import { resolveTokenBalance } from "../../../../../../lib/landing/ai-tokens";
import { TOKEN_PACK_AMOUNT, TOKEN_PACK_TOKENS } from "../../../../../../lib/payments/domain";

export const runtime = "nodejs";

/** 이 홈페이지의 AI 수정 토큰 잔액 — 편집기가 단추 옆에 보여 준다 */
export async function GET(_: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const identity = await requireGuestIdentity();
  const project = await getProject(projectId, identity.hash);
  if (!project) return NextResponse.json({ error: { code: "PROJECT_NOT_FOUND" } }, { status: 404 });
  const planId = String((project.opportunity as { planId?: string } | null)?.planId ?? "");
  const balance = planId ? await resolveTokenBalance(identity.userId, planId) : { purchased: 0, used: 0, remaining: 0, packSize: TOKEN_PACK_TOKENS };
  return NextResponse.json({ planId, balance, pack: { amount: TOKEN_PACK_AMOUNT, tokens: TOKEN_PACK_TOKENS } });
}
