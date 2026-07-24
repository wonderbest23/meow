import { NextResponse } from "next/server";
import { z } from "zod";
import { claimGuestProjects, createServerAuthClient, currentGuestHash, setAccountSession } from "../../../../lib/account-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";

const schema = z.object({ accessToken: z.string().min(20), refreshToken: z.string().min(20), password: z.string().min(8).max(200) });

export async function POST(request: Request) {
  const limited = await enforceRateLimit("auth-reset", request, {
    limit: 10,
    windowMs: 15 * 60_000,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;
  try {
    const input = schema.parse(await request.json());
    const previousGuestHash = await currentGuestHash();
    const auth = createServerAuthClient();
    const sessionResult = await auth.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken });
    if (!sessionResult.data.session || !sessionResult.data.user || sessionResult.error) throw sessionResult.error ?? new Error("복구 링크가 만료되었습니다.");
    const update = await auth.auth.updateUser({ password: input.password });
    if (update.error) throw update.error;
    await claimGuestProjects(sessionResult.data.user.id, previousGuestHash);
    await setAccountSession(sessionResult.data.session);
    return NextResponse.json({ reset: true });
  } catch (error) {
    return NextResponse.json({ error: { code: "PASSWORD_RESET_FAILED", message: error instanceof Error ? error.message : "비밀번호를 바꾸지 못했습니다." } }, { status: 400 });
  }
}
