import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearAdminSession,
  createAdminSession,
  hasAdminSession,
  isAdminChatConfigured,
  verifyAdminPassword,
} from "../../../../../lib/support-chat/admin-auth";

const loginSchema = z.object({ password: z.string().min(1).max(200) });

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET() {
  return privateJson({ authenticated: await hasAdminSession(), configured: isAdminChatConfigured() });
}

export async function POST(request: Request) {
  if (!isAdminChatConfigured()) {
    return privateJson(
      { error: { code: "ADMIN_CHAT_NOT_CONFIGURED", message: "관리자 상담 비밀번호가 설정되지 않았습니다." } },
      { status: 503 },
    );
  }
  try {
    const input = loginSchema.parse(await request.json());
    if (!verifyAdminPassword(input.password)) {
      return privateJson(
        { error: { code: "ADMIN_LOGIN_FAILED", message: "비밀번호가 올바르지 않습니다." } },
        { status: 401 },
      );
    }
    await createAdminSession();
    return privateJson({ authenticated: true });
  } catch {
    return privateJson(
      { error: { code: "ADMIN_LOGIN_FAILED", message: "로그인 정보를 확인해주세요." } },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  await clearAdminSession();
  return privateJson({ authenticated: false });
}
