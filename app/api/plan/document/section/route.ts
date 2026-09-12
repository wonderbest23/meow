import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { loadPlanState } from "../../../../../lib/plan-builder/plan-server-store";
import { saveDocumentEdit } from "../../../../../lib/plan-builder/document-edit";
import { renderPlanMarkdown } from "../../../../../lib/plan-builder/markdown";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { checkSectionAccess, resolvePlanAccess } from "../../../../../lib/plan-builder/access";

export const runtime = "nodejs";
const schema = z.object({ planId: z.string().min(1).max(60), key: z.string().min(1).max(100), baseGeneratedAt: z.string().min(1).max(40), action: z.enum(["save", "restore"]).default("save"), markdown: z.string().trim().min(1).max(120000).optional() });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function PATCH(request: Request) {
  const limited = await enforceRateLimit("document-edit", request, { limit: 60, windowMs: 60000 });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.action === "save" && !parsed.data.markdown)) return json({ message: "빈 내용은 저장할 수 없습니다." }, 400);
  const input = parsed.data;
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const plan = state.plans.find(p => p.id === input.planId);
  if (!plan?.sections[input.key]) return json({ message: "이 문서를 찾을 수 없습니다." }, 404);
  const access = await resolvePlanAccess(plan.planType, plan.id);
  const permission = checkSectionAccess(access, input.key);
  if (permission !== "ok") return json({ message: "이 항목의 이용 권한을 확인해주세요." }, access.authenticated ? 402 : 401);
  try {
    const html = input.markdown ? await renderPlanMarkdown(input.markdown) : undefined;
    return json(await saveDocumentEdit(identity.hash, { ...input, html }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "DOCUMENT_SAVE_FAILED";
    if (code === "DOCUMENT_CONFLICT" || code === "PLAN_VERSION_CONFLICT") return json({ code: "DOCUMENT_CONFLICT", message: "다른 화면에서 이 항목을 수정했어요. 내 초안은 이 기기에 보관했습니다." }, 409);
    return json({ code, message: "서버에 저장하지 못했어요. 내 초안은 이 기기에 보관했습니다." }, 503);
  }
}
