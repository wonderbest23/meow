import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerAuthClient, emailConfirmationEnabled } from "../../../../lib/account-auth";
import { getServerSupabase } from "../../../../lib/persistence";
import { PLATFORM_POLICY_VERSION } from "../../../../lib/platform-legal/domain";
import { enforceRateLimit } from "../../../../lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  terms: z.literal(true),
  privacy: z.literal(true),
  aiNotice: z.literal(true),
});

function confirmationPending() {
  return NextResponse.json({
    authenticated: false,
    confirmationRequired: true,
    message: "확인 메일을 확인해 주세요. 메일의 링크로 인증한 후 로그인할 수 있습니다. 이미 가입했다면 로그인해 주세요.",
  }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}

function confirmationUnavailable() {
  return NextResponse.json({ error: { code: "EMAIL_CONFIRMATION_UNAVAILABLE", message: "이메일 확인 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." } }, { status: 503 });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("auth-register", request, {
    limit: 5,
    windowMs: 60 * 60_000,
    message: "가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;

  try {
    const input = schema.parse(await request.json());
    if (!await emailConfirmationEnabled()) return confirmationUnavailable();
    const auth = createServerAuthClient();
    const created = await auth.auth.signUp({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo: new URL("/account", request.url).href },
    });

    if (created.error) {
      if (["user_already_exists", "email_exists"].includes(created.error.code ?? "")) return confirmationPending();
      if (["email_address_not_authorized", "over_email_send_rate_limit", "unexpected_failure"].includes(created.error.code ?? "")) {
        return NextResponse.json({ error: { code: "EMAIL_DELIVERY_UNAVAILABLE", message: "확인 메일을 발송하지 못했습니다. 잠시 후 다시 시도하거나 다른 로그인 방법을 이용해 주세요." } }, { status: 503 });
      }
      return NextResponse.json({ error: { code: "REGISTER_FAILED", message: "가입 정보를 확인해 주세요." } }, { status: 400 });
    }
    const user = created.data.user;
    if (!user || created.data.session) return confirmationUnavailable();
    // Confirmed duplicates can be obfuscated by Auth. Never write consent to that identity.
    if (user.identities?.length === 0) return confirmationPending();
    if (user.email_confirmed_at) return confirmationUnavailable();

    // 약관 동의 기록
    const supabase = getServerSupabase();
    if (supabase) {
      const { error } = await supabase.from("account_consents").upsert({
        user_id: user.id,
        policy_version: PLATFORM_POLICY_VERSION,
        terms_agreed: input.terms,
        privacy_agreed: input.privacy,
        ai_notice_confirmed: input.aiNotice,
        agreed_at: new Date().toISOString(),
      });
      if (error) throw error;
    }

    // Guest ownership and cookies are changed only by the verified login/callback routes.
    return confirmationPending();
  } catch {
    return NextResponse.json(
      { error: { code: "REGISTER_FAILED", message: "가입 처리를 완료하지 못했습니다. 확인 메일이 도착했다면 먼저 이메일을 인증해 주세요." } },
      { status: 400 },
    );
  }
}
