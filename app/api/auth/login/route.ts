import { NextResponse } from "next/server";
import { z } from "zod";
import { claimGuestProjects, createServerAuthClient, currentGuestHash, setAccountSession } from "../../../../lib/account-auth";

const schema = z.object({ email: z.string().trim().email().max(200), password: z.string().min(8).max(200) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const previousGuestHash = await currentGuestHash();
    const result = await createServerAuthClient().auth.signInWithPassword(input);
    if (result.error || !result.data.session || !result.data.user) throw result.error ?? new Error("로그인 정보를 확인해주세요.");
    await claimGuestProjects(result.data.user.id, previousGuestHash);
    await setAccountSession(result.data.session);
    return NextResponse.json({ authenticated: true, email: result.data.user.email });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("not configured")
      ? "로그인 서버가 아직 설정되지 않았습니다."
      : "이메일 또는 비밀번호가 올바르지 않습니다.";
    return NextResponse.json({ error: { code: "LOGIN_FAILED", message } }, { status: 401 });
  }
}
