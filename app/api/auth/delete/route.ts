import { NextResponse } from "next/server";
import { z } from "zod";
import { clearAccountSession, getAuthenticatedUser } from "../../../../lib/account-auth";
import { deleteAccount } from "../../../../lib/account-delete";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

// 회원 탈퇴 — 본인 확인(이메일 재입력) 후 계정과 개인 데이터를 지운다.
// 이메일이 없는 계정(이메일 제공에 동의하지 않은 카카오 등)은 다시 적을 이메일이 없어 탈퇴할 수 없었다 —
// 그런 계정만 '탈퇴' 두 글자를 적게 한다. 이메일이 있는 계정은 예전처럼 이메일이 맞아야 한다(감사 2026-10-23).

/** 이메일 없는 계정이 적는 확인 문구 — 화면(app/plan/me)과 같은 값 */
const NO_EMAIL_CONFIRM = "탈퇴";

const schema = z.object({
  /** 오조작 방지 — 화면에 보이는 본인 이메일을 그대로 입력해야 한다 */
  email: z.string().trim().email().max(200).optional(),
  /** 이메일 없는 계정만 — '탈퇴'를 그대로 적어야 한다 */
  confirm: z.string().trim().max(20).optional(),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit("account-delete", request, {
    limit: 5,
    windowMs: 60 * 60_000,
    message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  });
  if (limited) return limited;

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "로그인이 필요해요." } }, { status: 401 });
  }

  try {
    const input = schema.parse(await request.json());
    const accountEmail = (user.email ?? "").trim().toLowerCase();
    if (accountEmail) {
      if (!input.email || input.email.toLowerCase() !== accountEmail) {
        return NextResponse.json(
          { error: { code: "EMAIL_MISMATCH", message: "로그인한 계정의 이메일과 달라요." } },
          { status: 400 },
        );
      }
    } else if (input.confirm !== NO_EMAIL_CONFIRM) {
      return NextResponse.json(
        { error: { code: "EMAIL_MISMATCH", message: "확인 칸에 '탈퇴'를 그대로 적어 주세요." } },
        { status: 400 },
      );
    }

    const result = await deleteAccount(user.id);
    await clearAccountSession();
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const badInput = error instanceof z.ZodError;
    // 지우다 실패한 것은 서버 오류다 — 무엇이 남았는지 운영 기록에 남긴다
    if (!badInput) console.error("[account-delete]", JSON.stringify({ userId: user.id, message: error instanceof Error ? error.message : String(error), cause: String((error as { cause?: { code?: string; message?: string } } | null)?.cause?.code ?? (error as { cause?: { message?: string } } | null)?.cause?.message ?? "") }));
    return NextResponse.json(
      {
        error: {
          code: "ACCOUNT_DELETE_FAILED",
          message: badInput
            ? "이메일을 다시 확인해 주세요."
            : "탈퇴를 마치지 못했어요. 잠시 후 다시 시도하거나 고객센터로 알려 주세요.",
        },
      },
      { status: badInput ? 400 : 500 },
    );
  }
}
