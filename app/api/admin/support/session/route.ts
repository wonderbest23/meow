import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearAdminSession,
  createAdminSession,
  hasAdminSession,
  verifyAdminPassword,
} from "../../../../../lib/support-chat/admin-auth";
import { isScopeConfigured, resolveScope, type AdminScope } from "../../../../../lib/support-chat/admin-session";

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
