import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearAdminSession,
  createAdminSession,
  hasAdminSession,
  verifyAdminPassword,
} from "../../../../../lib/support-chat/admin-auth";
import { isScopeConfigured, resolveScope, type AdminScope } from "../../../../../lib/support-chat/admin-session";
import { enforceRateLimit } from "../../../../../lib/rate-limit";

const scopeSchema = z.enum(["support", "payments"]).default("support");
const loginSchema = z.object({ password: z.string().min(1).max(200), scope: scopeSchema });

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function readScope(request: Request): AdminScope {
  const requested = new URL(request.url).searchParams.get("scope");
  return requested === "payments" ? "payments" : "support";
}

export async function GET(request: Request) {
  const scope = readScope(request);
  return privateJson({
    authenticated: await hasAdminSession(scope),
    configured: isScopeConfigured(resolveScope(scope)),
  });
}

export async function POST(request: Request) {
  // 공유 관리자 비밀번호를 무차별 대입하지 못하게 IP당 시도 횟수를 제한한다(Access 밖 경로에서도 막힌다).
  const limited = await enforceRateLimit("admin-login", request, { limit: 10, windowMs: 15 * 60_000, message: "로그인 시도가 너무 많습니다. 15분 뒤 다시 시도해주세요." });
  if (limited) return limited;
  let input: z.infer<typeof loginSchema>;
  try {
    input = loginSchema.parse(await request.json());
  } catch {
    return privateJson(
      { error: { code: "ADMIN_LOGIN_FAILED", message: "로그인 정보를 확인해주세요." } },
      { status: 400 },
    );
  }
  if (!isScopeConfigured(resolveScope(input.scope))) {
    return privateJson(
      { error: { code: "ADMIN_CHAT_NOT_CONFIGURED", message: "관리자 비밀번호가 설정되지 않았습니다." } },
      { status: 503 },
    );
  }
  if (!verifyAdminPassword(input.password, input.scope)) {
    return privateJson(
      { error: { code: "ADMIN_LOGIN_FAILED", message: "비밀번호가 올바르지 않습니다." } },
      { status: 401 },
    );
  }
  await createAdminSession(input.scope);
  return privateJson({ authenticated: true });
}

export async function DELETE(request: Request) {
  // Default clears every admin scope; an explicit ?scope logs out just that console.
  const requested = new URL(request.url).searchParams.get("scope");
  await clearAdminSession(requested === "payments" || requested === "support" ? requested : undefined);
  return privateJson({ authenticated: false });
}
