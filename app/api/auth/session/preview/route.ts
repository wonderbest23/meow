import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerAuthClient } from "../../../../../lib/account-auth";
import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { isSameOriginRequest } from "../../../../../lib/http/same-origin";

const input = z.object({ accessToken: z.string().trim().min(1).max(16_384) });

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

/*
 * 링크(이메일 인증·카카오)로 돌아온 로그인 정보가 어느 계정인지만 알려 준다.
 * 세션을 만들지 않고 게스트 기획도 옮기지 않는다. 화면은 이 이메일을 보여 주고 사용자가 확인해야 로그인한다.
 * (남이 만든 로그인 링크로 그 사람 계정에 억지로 로그인되는 것을 막기 위한 확인 단계)
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return privateJson({ error: { code: "CROSS_ORIGIN", message: "허용되지 않은 요청입니다." } }, { status: 403 });
  const limited = await enforceRateLimit("auth-session-preview", request, { limit: 30, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: { code: "INVALID_INPUT", message: "로그인 정보를 확인하지 못했습니다." } }, { status: 400 });
  try {
    const { data, error } = await createServerAuthClient().auth.getUser(parsed.data.accessToken);
    if (error || !data.user) throw error ?? new Error("no user");
    const provider = typeof data.user.app_metadata?.provider === "string" ? data.user.app_metadata.provider : null;
    return privateJson({ email: data.user.email ?? null, provider });
  } catch {
    return privateJson({ error: { code: "LINK_INVALID", message: "로그인 링크가 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요." } }, { status: 400 });
  }
}
