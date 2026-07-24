import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerAuthClient } from "../../../../lib/account-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";

const schema = z.object({ email: z.string().trim().email().max(200) });

export async function POST(request: Request) {
  // Throttle to curb password-reset email bombing and account enumeration.
  const limited = await enforceRateLimit("auth-recover", request, {
    limit: 5,
    windowMs: 15 * 60_000,
    message: "복구 메일 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;
  try {
    const { email } = schema.parse(await request.json());
    const origin = new URL(request.url).origin;
    const { error } = await createServerAuthClient().auth.resetPasswordForEmail(email, { redirectTo: `${origin}/account?mode=reset` });
    if (error) throw error;
    return NextResponse.json({ sent: true });
  } catch (error) {
    return NextResponse.json({ error: { code: "RECOVERY_FAILED", message: error instanceof Error ? error.message : "복구 메일을 보내지 못했습니다." } }, { status: 400 });
  }
}
