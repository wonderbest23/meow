import { NextResponse } from "next/server";
import { z } from "zod";
import { claimGuestProjects, createServerAuthClient, currentGuestHash, setAccountSession } from "../../../../lib/account-auth";
import { getServerSupabase } from "../../../../lib/persistence";
import { PLATFORM_POLICY_VERSION } from "../../../../lib/platform-legal/domain";

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  terms: z.literal(true),
  privacy: z.literal(true),
  aiNotice: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const origin = new URL(request.url).origin;
    const previousGuestHash = await currentGuestHash();
    const result = await createServerAuthClient().auth.signUp({ email: input.email, password: input.password, options: { emailRedirectTo: `${origin}/account` } });
    if (result.error || !result.data.user) throw result.error ?? new Error("계정을 만들지 못했습니다.");
    const supabase = getServerSupabase();
    if (supabase) {
      const { error } = await supabase.from("account_consents").upsert({
        user_id: result.data.user.id,
        policy_version: PLATFORM_POLICY_VERSION,
        terms_agreed: input.terms,
        privacy_agreed: input.privacy,
        ai_notice_confirmed: input.aiNotice,
        agreed_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
    if (result.data.session) {
      await claimGuestProjects(result.data.user.id, previousGuestHash);
      await setAccountSession(result.data.session);
    }
    return NextResponse.json({ authenticated: Boolean(result.data.session), confirmationRequired: !result.data.session, email: result.data.user.email });
  } catch (error) {
    return NextResponse.json({ error: { code: "REGISTER_FAILED", message: error instanceof Error ? error.message : "가입 정보를 확인해주세요." } }, { status: 400 });
  }
}
