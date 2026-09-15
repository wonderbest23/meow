import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { expertPatchSchema } from "../../../../lib/plan-builder/coach-expert";
import { saveBusinessConditions } from "../../../../lib/plan-builder/coach-expert-service";
import { ProposalError } from "../../../../lib/plan-builder/proposal-editor";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function PATCH(request: Request) {
  const limited = await enforceRateLimit("business-expert", request, { limit: 30, windowMs: 600000 });
  if (limited) return limited;
  const parsed = expertPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ message: "수정할 항목을 다시 확인해주세요." }, 400);
  const identity = await requireGuestIdentity();
  try {
    return json(await saveBusinessConditions(identity.hash, parsed.data));
  } catch (error) {
    if (error instanceof ProposalError) return json({ code: error.code, message: error.message }, error.status);
    return json({ message: "저장 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요" }, 503);
  }
}
