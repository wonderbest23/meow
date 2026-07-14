import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAdminSession } from "../../../../../lib/support-chat/admin-auth";
import {
  getAdminChat,
  listAdminConversations,
  sendAdminMessage,
  setConversationStatus,
} from "../../../../../lib/support-chat/repository";

const replySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
});
const statusSchema = z.object({
  conversationId: z.string().uuid(),
  status: z.enum(["open", "closed"]),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function authorized() {
  if (await hasAdminSession()) return null;
  return privateJson(
    { error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  const unauthorized = await authorized();
  if (unauthorized) return unauthorized;
  try {
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (!conversationId) return privateJson({ conversations: await listAdminConversations() });
    if (!z.string().uuid().safeParse(conversationId).success) {
      return privateJson({ error: { code: "INVALID_CONVERSATION", message: "상담 번호가 올바르지 않습니다." } }, { status: 400 });
    }
    const chat = await getAdminChat(conversationId);
    if (!chat.conversation) {
      return privateJson({ error: { code: "CONVERSATION_NOT_FOUND", message: "상담을 찾지 못했습니다." } }, { status: 404 });
    }
    return privateJson({ chat });
  } catch (error) {
    return privateJson(
      { error: { code: "ADMIN_CHAT_LOAD_FAILED", message: error instanceof Error ? error.message : "상담 내용을 불러오지 못했습니다." } },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await authorized();
  if (unauthorized) return unauthorized;
  try {
    const input = replySchema.parse(await request.json());
    return privateJson({ chat: await sendAdminMessage(input.conversationId, input.message) }, { status: 201 });
  } catch (error) {
    return privateJson(
      { error: { code: "ADMIN_REPLY_FAILED", message: error instanceof Error ? error.message : "답장을 보내지 못했습니다." } },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await authorized();
  if (unauthorized) return unauthorized;
  try {
    const input = statusSchema.parse(await request.json());
    return privateJson({ conversation: await setConversationStatus(input.conversationId, input.status) });
  } catch (error) {
    return privateJson(
      { error: { code: "ADMIN_STATUS_FAILED", message: error instanceof Error ? error.message : "상담 상태를 바꾸지 못했습니다." } },
      { status: 400 },
    );
  }
}
