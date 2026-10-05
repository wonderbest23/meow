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

// zod·DB 오류 원문은 관리자 화면에 그대로 노출하지 않는다 — 원문은 로그로만 남기고 고정 문구를 돌려준다
function failure(error: unknown, code: string, message: string) {
  console.error(`[admin/support/chat] ${code}`, error);
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return privateJson({ error: { code: "INVALID_INPUT", message: "입력값을 확인해 주세요." } }, { status: 400 });
  }
  if (error instanceof Error && error.message === "SUPPORT_CONVERSATION_NOT_FOUND") {
    return privateJson({ error: { code: "CONVERSATION_NOT_FOUND", message: "상담을 찾지 못했습니다." } }, { status: 404 });
  }
  return privateJson({ error: { code, message } }, { status: 503 });
}

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
    return failure(error, "ADMIN_CHAT_LOAD_FAILED", "상담 내용을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export async function POST(request: Request) {
  const unauthorized = await authorized();
  if (unauthorized) return unauthorized;
  try {
    const input = replySchema.parse(await request.json());
    return privateJson({ chat: await sendAdminMessage(input.conversationId, input.message) }, { status: 201 });
  } catch (error) {
    return failure(error, "ADMIN_REPLY_FAILED", "답장을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await authorized();
  if (unauthorized) return unauthorized;
  try {
    const input = statusSchema.parse(await request.json());
    return privateJson({ conversation: await setConversationStatus(input.conversationId, input.status) });
  } catch (error) {
    return failure(error, "ADMIN_STATUS_FAILED", "상담 상태를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
