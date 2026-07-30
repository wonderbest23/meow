import { NextResponse } from "next/server";
import { z } from "zod";
import { claimGuestProjects, createServerAuthClient, currentGuestHash, setAccountSession } from "../../../../lib/account-auth";
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

/** Supabase가 돌려주는 '이미 등록된 이메일' 오류를 알아본다. */
function isDuplicateEmail(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("already registered") || m.includes("already been registered") || m.includes("already exists") || m.includes("duplicate");
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
    const previousGuestHash = await currentGuestHash();
    const auth = createServerAuthClient();

    /*
     * 이메일 인증을 요구하지 않는다 — 결제가 실제 관문이고, 확인 메일을 기다리는
     * 단계에서 이탈이 크다. admin.createUser + email_confirm으로 바로 확정 계정을
     * 만들고 곧바로 로그인시킨다(프로젝트의 'Confirm email' 설정과 무관하게 동작).
     */
    const created = await auth.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });

    if (created.error || !created.data.user) {
      const message = created.error?.message ?? "계정을 만들지 못했습니다.";
      if (isDuplicateEmail(message)) {
        return NextResponse.json(
          { error: { code: "EMAIL_TAKEN", message: "이미 가입된 이메일입니다. 로그인해 주세요." } },
          { status: 409 },
        );
      }
      throw new Error(message);
    }

    const user = created.data.user;

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

    // 가입 즉시 로그인 — 확인 메일을 기다리게 하지 않는다
    const signedIn = await auth.auth.signInWithPassword({ email: input.email, password: input.password });
    if (signedIn.error || !signedIn.data.session) {
      // 계정은 만들어졌으니 로그인 화면으로 안내한다(계정을 지우지는 않는다)
      return NextResponse.json(
        { authenticated: false, confirmationRequired: false, email: user.email, message: "계정을 만들었습니다. 로그인해 주세요." },
        { status: 200 },
      );
    }

    await claimGuestProjects(user.id, previousGuestHash);
    await setAccountSession(signedIn.data.session);

    return NextResponse.json({ authenticated: true, confirmationRequired: false, email: user.email });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    if (raw && isDuplicateEmail(raw)) {
      return NextResponse.json(
        { error: { code: "EMAIL_TAKEN", message: "이미 가입된 이메일입니다. 로그인해 주세요." } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: "REGISTER_FAILED", message: raw || "가입 정보를 확인해주세요." } },
      { status: 400 },
    );
  }
}
