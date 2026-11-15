import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { AlertContactError, loadAlertContact, registerAlertContact, removeAlertContact, setAlertContactEnabled, viewOf } from "../../../../lib/notify/account-alert-contact";

/*
 * 진행 단계 안내 알림 설정 — 계정의 받는 번호 · 수신 동의 · 켜고 끄기. 로그인한 계정만.
 * 번호는 가운데를 가려서만 돌려준다. 발송은 아직 없다.
 */
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register"), phone: z.string().max(30), agreed: z.boolean() }).strict(),
  z.object({ action: z.literal("toggle"), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("remove") }).strict(),
]);

async function owner() {
  const identity = await requireGuestIdentity();
  return identity.userId ?? null;
}
function failure(error: unknown) {
  if (error instanceof AlertContactError) return json({ error: { code: error.code, message: error.message } }, error.status);
  console.error("[account-alerts]", error instanceof Error ? error.message : error);
  return json({ error: { code: "ALERTS_FAILED", message: "알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." } }, 500);
}

export async function GET() {
  try {
    const ownerId = await owner();
    if (!ownerId) return json({ error: { code: "LOGIN_REQUIRED", message: "로그인하면 알림을 설정할 수 있어요." } }, 401);
    return json({ contact: viewOf(await loadAlertContact(ownerId)) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("account-alerts", request, { limit: 20, windowMs: 60000 });
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: { code: "INVALID_REQUEST", message: "입력 내용을 확인해 주세요." } }, 400);
  try {
    const ownerId = await owner();
    if (!ownerId) return json({ error: { code: "LOGIN_REQUIRED", message: "로그인하면 알림을 설정할 수 있어요." } }, 401);
    const command = parsed.data;
    if (command.action === "remove") { await removeAlertContact(ownerId); return json({ contact: null }); }
    const contact = command.action === "register" ? await registerAlertContact(ownerId, command) : await setAlertContactEnabled(ownerId, command.enabled);
    return json({ contact: viewOf(contact) });
  } catch (error) { return failure(error); }
}
