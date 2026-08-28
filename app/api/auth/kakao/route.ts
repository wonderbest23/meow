import { NextResponse } from "next/server";
import { createServerAuthClient } from "../../../../lib/account-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";

/*
 * 카카오 로그인 — Supabase OAuth 리디렉트 방식.
 *
 * 이 주소로 오면 Supabase 가 만든 카카오 인증 URL 로 보낸다. 카카오 →
 * Supabase 콜백을 거쳐 /account#access_token=… 으로 돌아오고, 계정 화면의
 * 기존 해시 처리기가 그 토큰으로 세션을 세운다(게스트 작업 인계 포함) —
 * 이메일 인증 링크와 같은 길이라 새 코드가 필요 없다.
 *
 * 쓰려면 Supabase 에 Kakao 프로바이더(REST API 키·시크릿)를 켜고,
 * Redirect URLs 허용 목록에 우리 /account 주소를 넣어야 한다.
 */
export async function GET(request: Request) {
  const limited = await enforceRateLimit("auth-kakao", request, {
    limit: 20,
    windowMs: 5 * 60_000,
    message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;

  const url = new URL(request.url);
  /* 로그인 뒤 돌아갈 내부 경로 — 열린 리다이렉트가 되지 않게 내부 경로만 */
  const rawNext = url.searchParams.get("next") ?? "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "";
  const redirectTo = `${url.origin}/account${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  try {
    const auth = createServerAuthClient();
    const { data, error } = await auth.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      console.error("[auth-kakao] URL 생성 실패:", error?.message);
      return NextResponse.redirect(`${url.origin}/account?social_error=kakao`, { status: 303 });
    }
    return NextResponse.redirect(data.url, { status: 303 });
  } catch (error) {
    console.error("[auth-kakao] 오류:", error instanceof Error ? error.message : error);
    return NextResponse.redirect(`${url.origin}/account?social_error=kakao`, { status: 303 });
  }
}
