import { NextResponse } from "next/server";
import { z } from "zod";
import { signInWithProviderIdToken } from "../../../../lib/id-token-sign-in";
import { enforceRateLimit } from "../../../../lib/rate-limit";

/*
 * 구글 로그인.
 *
 * 화면의 구글 버튼(GIS)이 받아 온 ID 토큰을 Supabase 가 검증한다
 * (signInWithIdToken). 서명·만료·수신자(client_id) 검사는 Supabase 가 하고,
 * 계정이 없으면 만들어 준다 — 비밀번호 가입과 같은 세션·쿠키 체계를 그대로 탄다.
 *
 * 쓰려면 Supabase 대시보드에서 Google 프로바이더를 켜고 '허용된 클라이언트
 * ID'에 우리 웹 클라이언트 ID 를 넣어야 한다. 안 켜져 있으면 아래에서
 * 사람이 읽을 수 있는 안내로 돌려준다.
 */

const schema = z.object({
  /** GIS 가 준 구글 ID 토큰(JWT) */
  credential: z.string().min(20).max(4096),
  remember: z.boolean().optional(),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit("auth-google", request, {
    limit: 10,
    windowMs: 5 * 60_000,
    message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: { code: "GOOGLE_LOGIN_FAILED", message: "구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요." } }, { status: 401 });
  }
  return signInWithProviderIdToken("google", input.credential, input.remember);
}
