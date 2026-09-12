import { NextResponse } from "next/server";
import { authSessionInput } from "../../../../lib/auth-session-input";
import { claimGuestProjects, createServerAuthClient, currentGuestHash, getAuthenticatedUser, listAccountProjects, setAccountSession } from "../../../../lib/account-auth";
import { accountLinkError } from "../../../../lib/plan-builder/account-linking";

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return privateJson({ authenticated: false, email: null, projects: [] });
  return privateJson({ authenticated: true, email: user.email ?? null, projects: await listAccountProjects(user.id) });
}

export async function POST(request: Request) {
  try {
    const input = authSessionInput.parse(await request.json());
    const previousGuestHash = await currentGuestHash();
    const auth = createServerAuthClient();
    const result = await auth.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken });
    if (!result.data.session || !result.data.user || result.error) throw result.error ?? new Error("이메일 인증 정보를 확인하지 못했습니다.");
    await claimGuestProjects(result.data.user.id, previousGuestHash);
    await setAccountSession(result.data.session);
    return privateJson({ authenticated: true, email: result.data.user.email ?? null });
  } catch (error) {
    const linking = accountLinkError(error);
    if (linking) return privateJson({ error: { code: linking.code, message: linking.message } }, { status: linking.status });
    return privateJson({ error: { code: "AUTH_SESSION_FAILED", message: error instanceof Error ? error.message : "로그인을 완료하지 못했습니다." } }, { status: 400 });
  }
}
