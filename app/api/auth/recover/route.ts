import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerAuthClient } from "../../../../lib/account-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { authErrorMessage } from "../../../../lib/auth-error-message";

const schema = z.object({ email: z.string().trim().email().max(200) });

export async function POST(request: Request) {
  // Throttle to curb password-reset email bombing and account enumeration.
  const limited = await enforceRateLimit("auth-recover", request, {
    limit: 5,
    windowMs: 15 * 60_000,
    message: "비밀번호 찾기 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  if (limited) return limited;
  try {
    const { email } = schema.parse(await request.json());
    const origin = new URL(request.url).origin;
    /*
     * 돌아올 주소에 ?mode=reset 같은 쿼리를 붙이지 않는다 — Supabase 가 허용 목록과 맞지 않는다고 보고 홈으로 보냈다(2026-11-25 제보).
     * 재설정인지는 Supabase 가 붙여 주는 #type=recovery 로 /account 화면이 안다.
     */
    const { error } = await createServerAuthClient().auth.resetPasswordForEmail(email, { redirectTo: `${origin}/account` });
    if (error) throw error;
    return NextResponse.json({ sent: true });
  } catch (error) {
    // Supabase 원문(영어)은 화면에 내보내지 않는다 — 고정 문구로
    const status = (error as { status?: unknown } | null)?.status === 429 ? 429 : 400;
    return NextResponse.json({ error: { code: "RECOVERY_FAILED", message: authErrorMessage(error, "recover") } }, { status });
  }
}
