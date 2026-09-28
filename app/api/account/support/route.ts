import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { notifyOwnerByEmail } from "../../../../lib/notify/owner-email";
import { notifyOwnerBySms } from "../../../../lib/notify/owner-sms";
import { inquiryBody, inquiryMessageId, inquirySchema } from "../../../../lib/support-chat/inquiry";
import { getCustomerChat, sendCustomerMessageOnce } from "../../../../lib/support-chat/repository";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
}

function failed(error: unknown) {
  if (error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED") {
    return json({ error: { code: "ACCOUNT_LOGIN_REQUIRED", message: "로그인 후 문의를 확인해주세요." } }, 401);
  }
  if (error instanceof Error && error.message === "SUPPORT_REQUEST_CONFLICT") {
    return json({ error: { code: "SUPPORT_REQUEST_CONFLICT", message: "이미 접수된 요청과 내용이 달라요. 문의 내역을 확인해주세요." } }, 409);
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return json({ error: { code: "INVALID_INQUIRY", message: error instanceof z.ZodError ? error.issues[0]?.message : "문의 내용을 확인해주세요." } }, 400);
  }
  return json({ error: { code: "SUPPORT_UNAVAILABLE", message: "고객센터에 연결하지 못했어요. 잠시 후 다시 시도해주세요." } }, 503);
}

export async function GET() {
  try {
    const identity = await requireAuthenticatedIdentity();
    return json({ ownerScope: identity.hash, chat: await getCustomerChat(identity.hash) });
  } catch (error) {
    // 로그인 전 조회는 오류가 아니라 정상 상태다 — 401 로 답하면 브라우저 콘솔에 오류가 찍힌다
    if (error instanceof Error && error.message === "ACCOUNT_LOGIN_REQUIRED") return json({ loggedIn: false });
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireAuthenticatedIdentity();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: { code: "INVALID_ORIGIN", message: "고객센터를 다시 열어주세요." } }, 403);
    if (request.headers.get("x-support-owner") !== identity.hash) {
      return json({ error: { code: "ACCOUNT_CHANGED", message: "로그인 계정이 바뀌었어요. 고객센터를 다시 열어주세요." } }, 409);
    }
    const limited = await enforceRateLimit("support-chat", request, {
      limit: 20, windowMs: 10 * 60_000, message: "문의를 너무 자주 보내고 있어요. 잠시 후 다시 접수해주세요.",
    });
    if (limited) return limited;
    const text = await request.text();
    if (text.length > 10000) return json({ error: { code: "INVALID_INQUIRY", message: "문의 내용이 너무 길어요." } }, 400);
    const input = inquirySchema.parse(JSON.parse(text));
    const messageId = await inquiryMessageId(identity.hash, input.requestId);
    const result = await sendCustomerMessageOnce(identity.hash, inquiryBody(input), messageId);
    if (result.created) {
      await Promise.allSettled([
        notifyOwnerBySms(messageId),
        ...(result.chat.conversation?.unreadByAdmin === 1
          ? [notifyOwnerByEmail("[오늘창업] 고객센터 문의가 접수됐습니다", "새 문의가 도착했습니다.\n답변하기: https://oneulstart.com/admin/support")]
          : []),
      ]);
    }
    return json({ ownerScope: identity.hash, chat: result.chat, receivedMessageId: messageId, requestId: input.requestId }, result.created ? 201 : 200);
  } catch (error) { return failed(error); }
}
