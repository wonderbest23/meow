import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authConfigured, clearAccountSession, createServerAuthClient } from "../../../../lib/account-auth";
import { AUTH_ACCESS_COOKIE } from "../../../../lib/identity-tokens";

export const runtime = "nodejs";

export async function POST() {
  /*
   * 쿠키만 지우면 브라우저에서는 로그아웃돼도 Supabase에 리프레시 토큰이
   * 살아 있다 — 이 브라우저 세션을 서버에서도 폐기한다(실패해도 로그아웃은 진행).
   */
  try {
    if (authConfigured()) {
      const accessToken = (await cookies()).get(AUTH_ACCESS_COOKIE)?.value;
      if (accessToken) await createServerAuthClient().auth.admin.signOut(accessToken, "local");
    }
  } catch {
    // 만료된 토큰 등 — 폐기 실패는 무시하고 쿠키 정리로 진행
  }
  await clearAccountSession();
  return NextResponse.json({ authenticated: false });
}
