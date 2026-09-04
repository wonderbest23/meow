import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { getCustomerChat, sendCustomerMessage } from "../../../../lib/support-chat/repository";
import { notifyOwnerByEmail } from "../../../../lib/notify/owner-email";

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
  /* 저장·이메일 알림이 붙은 쓰기다 — 제한이 없으면 수신함과 표가 스팸으로 찬다 */
  const limited = await enforceRateLimit("support-chat", request, {
    limit: 20,
    windowMs: 10 * 60_000,
    message: "메시지를 너무 자주 보내고 있습니다. 잠시 후 다시 보내주세요.",
  });
  if (limited) return limited;

  try {
    const identity = await requireGuestIdentity();
    const input = messageSchema.parse(await request.json());
    const chat = await sendCustomerMessage(identity.hash, input.message);
    /*
     * 사장님 이메일 알림 — 제작 상담은 매번, 일반 문의는 '관리자가 마지막으로 읽은
     * 뒤 첫 메시지'만(unreadByAdmin===1). 대화가 길어질 때 메시지마다 메일이
     * 쏟아지지 않게 하려는 것이다. 실패해도 접수는 그대로 성공한다.
     */
    const isConsult = input.message.startsWith("[맞춤 홈페이지 제작");
    /* 자동 상담이 못 푼 질문 — 손님이 이미 한 번 막힌 뒤라 매번 바로 알린다 */
    const isHandoff = input.message.startsWith("[상담에서 넘어온 문의]");
    if (isConsult || isHandoff || chat.conversation?.unreadByAdmin === 1) {
      await notifyOwnerByEmail(
        isConsult ? "[오늘창업] 맞춤 홈페이지 제작 상담이 접수됐습니다" : isHandoff ? "[오늘창업] 챗봇이 못 푼 문의 — 담당자 답변 필요" : "[오늘창업] 새 1:1 문의가 도착했습니다",
        [
          input.message.slice(0, 800),
          "",
          `접수 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
          "답변하기: https://oneulstart.com/admin/support",
        ].join("\n"),
      );
    }
    return privateJson({ chat }, { status: 201 });
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
