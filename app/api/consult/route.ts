import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../lib/api-auth";
import { enforceRateLimit } from "../../../lib/rate-limit";
import { resolveLLMConfig } from "../../../lib/llm/config";
import { completeJson } from "../../../lib/llm/complete";
import {
  CONSULT_SYSTEM,
  consultReplySchema,
  consultProfileSchema,
  profileLines,
  type ConsultReply,
} from "../../../lib/consult/domain";

export const runtime = "nodejs";

/*
 * 무료 창업 상담.
 *
 * 문의 응답(support/assistant)과 다른 길이다. 저쪽은 한 번 묻고 한 번 답하면
 * 끝이라 대화를 기억하지 않는다. 상담은 앞에서 무엇을 물었는지 알아야 다음을
 * 물을 수 있으므로 주고받은 말을 통째로 받는다.
 *
 * 대화는 서버에 저장하지 않는다. 로그인 전에도 쓰는 미끼 상품이고, 남의 창업
 * 고민을 우리가 들고 있을 이유가 없다. 화면이 들고 있다가 매번 보낸다.
 */

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
});

const requestSchema = z.object({
  /* 마지막 사용자 발화 */
  message: z.string().min(1).max(1000),
  /* 그 앞까지의 대화 — 너무 길면 앞을 잘라 보낸다 */
  history: z.array(turnSchema).max(24).default([]),
  /* 지금까지 채워진 상담 카드 */
  profile: consultProfileSchema.default({}),
});

/** 열쇠가 없거나 호출이 실패해도 상담이 끊기지 않게 — 사람이 이어받을 자리를 알린다 */
function fallback(): ConsultReply {
  return {
    message:
      "지금은 상담을 이어가지 못했습니다. 잠시 후 다시 말씀해 주세요.\n급하시면 화면 오른쪽 아래 문의로 남겨주시면 사람이 확인합니다.",
    profile: {},
    choices: [],
    summary: [],
    picks: [],
    ready: false,
  };
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("consult", request, {
    limit: 40,
    windowMs: 10 * 60_000,
    message: "상담 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;

  const identity = await requireGuestIdentity();
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", message: "요청을 읽지 못했습니다." }, { status: 400 });
  }
  const input = parsed.data;

  const config = resolveLLMConfig(identity.hash, "anthropic");
  if (!config) return NextResponse.json(fallback(), { headers: { "Cache-Control": "private, no-store" } });

  /*
   * 지금까지 알아낸 것을 사람이 읽는 줄로 먼저 보여준다.
   * 모델이 이미 물어본 것을 다시 묻는 일이 줄어든다.
   */
  const known = profileLines(input.profile);
  const conversation = input.history
    .map((turn) => `${turn.role === "user" ? "손님" : "상담사"}: ${turn.text}`)
    .join("\n");

  const user = [
    known.length ? `지금까지 알아낸 것\n${known.join("\n")}` : "아직 알아낸 것이 없습니다.",
    "",
    conversation ? `지금까지 대화\n${conversation}` : "첫 대화입니다.",
    "",
    `손님의 마지막 말\n${input.message}`,
  ].join("\n");

  const raw = await completeJson(config, {
    system: CONSULT_SYSTEM,
    user,
    maxOutputTokens: 1200,
    kind: "consult",
    jsonObject: true,
    /* 규칙이 매번 같다 — 앞부분을 캐시에 올려 반복 비용을 줄인다 */
    cache: true,
    timeoutMs: 60_000,
  });
  if (!raw) return NextResponse.json(fallback(), { headers: { "Cache-Control": "private, no-store" } });

  const reply = consultReplySchema.safeParse(raw);
  if (!reply.success) return NextResponse.json(fallback(), { headers: { "Cache-Control": "private, no-store" } });

  return NextResponse.json(reply.data, { headers: { "Cache-Control": "private, no-store" } });
}
