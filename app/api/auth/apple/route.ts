import { NextResponse } from "next/server";
import { z } from "zod";
import { signInWithProviderIdToken } from "../../../../lib/id-token-sign-in";
import { enforceRateLimit } from "../../../../lib/rate-limit";

/*
 * 애플 로그인(아이폰 앱).
 *
 * 앱스토어 규칙(4.8): 구글·카카오 같은 외부 계정 로그인을 둔 앱은 애플 로그인도 함께 둬야 한다.
 * 앱의 휴대폰 로그인 창이 받아 온 애플 ID 토큰을 Supabase 가 검증한다 — 구글과 같은 길(lib/id-token-sign-in.ts).
 *
 * 쓰려면 Supabase 대시보드에서 Apple 프로바이더를 켜고 '클라이언트 ID'에 앱의 번들 ID(com.oneulstart.app)를 넣어야 한다.
 */

const schema = z.object({
  /** 애플이 준 ID 토큰(JWT) */
  credential: z.string().min(20).max(4096),
  remember: z.boolean().optional(),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit("auth-apple", request, {
    limit: 10,
    windowMs: 5 * 60_000,
    message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: { code: "APPLE_LOGIN_FAILED", message: "애플 로그인에 실패했습니다. 잠시 후 다시 시도해주세요." } }, { status: 401 });
  }
  return signInWithProviderIdToken("apple", input.credential, input.remember);
}
