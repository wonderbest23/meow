import { NextResponse } from "next/server";
import { z } from "zod";
import { clearAccountSession, getAuthenticatedUser } from "../../../../lib/account-auth";
import { deleteAccount } from "../../../../lib/account-delete";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

// 회원 탈퇴 — 본인 확인(이메일 재입력) 후 계정과 개인 데이터를 지운다.

const schema = z.object({
  /** 오조작 방지 — 화면에 보이는 본인 이메일을 그대로 입력해야 한다 */
  email: z.string().trim().email().max(200),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit("account-delete", request, {
    limit: 5,
    windowMs: 60 * 60_000,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "로그인이 필요합니다." } }, { status: 401 });
  }

  try {
    const input = schema.parse(await request.json());
    if (input.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
      return NextResponse.json(
        { error: { code: "EMAIL_MISMATCH", message: "로그인한 계정의 이메일과 다릅니다." } },
        { status: 400 },
      );
    }

    const result = await deleteAccount(user.id);
    await clearAccountSession();
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "ACCOUNT_DELETE_FAILED",
          message: error instanceof Error && error.message.includes("email")
            ? "이메일을 다시 확인해주세요."
            : "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도하거나 1:1 문의로 알려주세요.",
        },
      },
      { status: 400 },
    );
  }
}
