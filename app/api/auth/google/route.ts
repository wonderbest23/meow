import { NextResponse } from "next/server";
import { z } from "zod";
import { claimGuestProjects, createServerAuthClient, currentGuestHash, setAccountSession } from "../../../../lib/account-auth";
import { getServerSupabase } from "../../../../lib/persistence";
import { PLATFORM_POLICY_VERSION } from "../../../../lib/platform-legal/domain";
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

  try {
    const input = schema.parse(await request.json());
    const previousGuestHash = await currentGuestHash();
    const auth = createServerAuthClient();

    const result = await auth.auth.signInWithIdToken({ provider: "google", token: input.credential });
    if (result.error || !result.data.session || !result.data.user) {
      const raw = result.error?.message ?? "";
      /* 설정이 빠진 경우는 사용자 잘못이 아니다 — 운영자가 알아볼 말로 남긴다 */
      const notConfigured = /provider is not enabled|unsupported provider|unacceptable audience|audience/i.test(raw);
      console.error("[auth-google] 실패:", raw);
      return NextResponse.json(
        {
          error: {
            code: "GOOGLE_LOGIN_FAILED",
            message: notConfigured
              ? "구글 로그인이 아직 준비되지 않았습니다. 이메일로 로그인해 주세요."
              : "구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
          },
        },
        { status: 401 },
      );
    }

    const user = result.data.user;

    /*
     * 약관 동의 기록 — 버튼 아래 고지("계속하면 …에 동의하게 됩니다")로 받는다.
     * 이미 기록이 있으면 덮지 않는다(처음 가입 시각을 남겨 두려고).
     */
    const supabase = getServerSupabase();
    if (supabase) {
      await supabase
        .from("account_consents")
        .upsert(
          {
            user_id: user.id,
            policy_version: PLATFORM_POLICY_VERSION,
            terms_agreed: true,
            privacy_agreed: true,
            ai_notice_confirmed: true,
            agreed_at: new Date().toISOString(),
          },
          { onConflict: "user_id", ignoreDuplicates: true },
        )
        .then(({ error }) => {
          if (error) console.error("[auth-google] 동의 기록 실패:", error.message);
        });
    }

    await claimGuestProjects(user.id, previousGuestHash);
    await setAccountSession(result.data.session, input.remember ?? true);
    return NextResponse.json({ authenticated: true, email: user.email ?? null });
  } catch (error) {
    console.error("[auth-google] 오류:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: { code: "GOOGLE_LOGIN_FAILED", message: "구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요." } },
      { status: 401 },
    );
  }
}
