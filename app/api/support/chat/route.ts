import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { getCustomerChat, sendCustomerMessage } from "../../../../lib/support-chat/repository";

const messageSchema = z.object({
  message: z.string().trim().min(1, "메시지를 입력해주세요.").max(2000, "메시지는 2,000자까지 입력할 수 있습니다."),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const markRead = new URL(request.url).searchParams.get("peek") !== "1";
    return privateJson({ chat: await getCustomerChat(identity.hash, markRead) });
  } catch (error) {
    return privateJson(
      { error: { code: "SUPPORT_CHAT_LOAD_FAILED", message: error instanceof Error ? error.message : "상담 내용을 불러오지 못했습니다." } },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const input = messageSchema.parse(await request.json());
    return privateJson({ chat: await sendCustomerMessage(identity.hash, input.message) }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error ? error.message : "메시지를 보내지 못했습니다.";
    return privateJson(
      { error: { code: "SUPPORT_MESSAGE_FAILED", message } },
      { status: 400 },
    );
  }
}
