import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../lib/api-auth";
import { enforceRateLimit } from "../../../lib/rate-limit";
import { resolveLLMConfig } from "../../../lib/llm/config";
import { streamText, parseJsonObject } from "../../../lib/llm/complete";
import { loadPlanState } from "../../../lib/plan-builder/plan-server-store";
import { planDigest } from "../../../lib/consult/plan-digest";
import { loadPlanEvidence } from "../../../lib/plan-builder/market-research";
import { pickConsultEvidence, evidenceBlock, applyCitations } from "../../../lib/consult/evidence";
import type { MarketEvidence } from "../../../lib/market/domain";
import { loadConsultSession, saveConsultTurn, resetConsultSession, consultLimitFor, CONSULT_FREE_TURNS_GUEST } from "../../../lib/consult/repository";
import {
  CONSULT_SYSTEM,
  CONSULT_META_SEP,
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
 * 대화는 계정별로 서버에 남긴다.
 *
 * 예전에는 저장하지 않았다 — "남의 창업 고민을 우리가 들고 있을 이유가 없다"는
 * 판단이었다. 그 대가로 새로고침 한 번에 대화가 사라졌고, 로그인하러 다녀오는
 * 사이 20분 답한 내용이 통째로 날아갔다. 잃는 쪽이 더 나쁘다.
 *
 * 사용량도 여기서 센다. 로그인하지 않은 사람은 하루 3번까지 맛보고 그다음은
 * 로그인으로 안내한다 — 계정 없이 무한히 쓰이면 비용이 아무와도 연결되지 않는다.
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
  /* 손님이 지금 쓰는 계획서 — 있으면 그 내용을 근거로 답한다 */
  planId: z.string().max(60).optional(),
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
    sources: [],
  };
}

/*
 * 저장된 상담 되살리기.
 *
 * 대화는 계정별로 서버에 남는데(saveConsultTurn), 화면은 매번 빈 채로 시작해서
 * 새로고침 한 번에 '보이는' 대화가 사라졌다 — 저장하는 이유가 무색했다.
 * 위젯이 열릴 때 이걸 불러 이어서 보여 준다.
 */
export async function GET() {
  const identity = await requireGuestIdentity();
  const session = await loadConsultSession(identity.hash).catch(() => null);
  const limit = consultLimitFor(identity.userId);
  return NextResponse.json(
    {
      profile: session?.profile ?? {},
      /* 화면이 다 그리지도 못할 옛 대화까지 나를 이유가 없다 */
      messages: (session?.messages ?? []).slice(-30),
      remainingToday: Math.max(0, limit - (session?.turnsToday ?? 0)),
      isGuest: !identity.userId,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/* '새 상담' — 대화·카드만 지운다. 오늘 쓴 횟수는 남는다(한도 초기화 구멍 방지). */
export async function DELETE() {
  const identity = await requireGuestIdentity();
  await resetConsultSession(identity.hash).catch(() => {});
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("consult", request, {
    limit: 40,
    windowMs: 10 * 60_000,
    message: "상담 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;
  /*
   * 하루 상한(IP) — 아래의 계정별 일일 한도는 게스트 쿠키 기준이라 쿠키를
   * 지우면 초기화된다. 요청자가 고를 수 없는 IP 로 받친다. 공유 IP(사무실)를
   * 생각해 계정 한도보다 훨씬 넉넉하게 잡는다.
   */
  const dayLimited = await enforceRateLimit("consult-day", request, {
    limit: 80,
    windowMs: 24 * 60 * 60_000,
    message: "오늘 상담 요청이 많았습니다. 내일 다시 이용해주세요.",
  });
  if (dayLimited) return dayLimited;

  const identity = await requireGuestIdentity();

  /*
   * 하루 사용량.
   *
   * 위의 IP 제한은 순간 폭주만 막는다(10분에 40번). 한 사람이 하루 종일 쓰는 것은
   * 그걸로 막히지 않으므로 계정 기준으로 따로 센다.
   */
  const session = await loadConsultSession(identity.hash).catch(() => null);
  const limit = consultLimitFor(identity.userId);
  if (session && session.turnsToday >= limit) {
    return NextResponse.json(
      {
        error: "consult_limit",
        needsLogin: !identity.userId,
        message: identity.userId
          ? `오늘 상담을 ${limit}번 하셨어요. 내일 다시 이어서 하실 수 있고, 지금까지 정리된 내용으로 바로 사업계획서를 만들어 보셔도 좋아요.`
          : `상담을 ${CONSULT_FREE_TURNS_GUEST}번 해보셨어요. 로그인하시면 이어서 상담하고, 지금까지 정리된 내용도 그대로 보관됩니다.`,
      },
      { status: 429, headers: { "Cache-Control": "private, no-store" } },
    );
  }

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

  /*
   * 프롬프트에 실리는 대화는 서버 저장본을 우선한다.
   *
   * 화면이 보낸 history 는 요청자가 마음대로 만들 수 있다 — 24개 × 2,000자면
   * 임의 텍스트 4.8만 자를 상담사 프롬프트에 그대로 싣는 통로였다(역할 탈취
   * 재료이자 입력 토큰 부풀리기). 서버가 매 턴 저장하므로(saveConsultTurn)
   * 저장본이 곧 진짜 대화다. 저장본이 비어 있을 때만(새 대화·데모·저장 실패)
   * 화면 값을 쓰되, 어느 쪽이든 최근 12턴 · 총 6,000자 예산으로 자른다.
   */
  const HISTORY_TURNS = 12;
  const HISTORY_CHARS = 6_000;
  const serverTurns = (session?.messages ?? []).map((turn) => ({ role: turn.role, text: turn.text }));
  const sourceTurns = serverTurns.length ? serverTurns : input.history;
  const trimmedTurns: Array<{ role: "user" | "assistant"; text: string }> = [];
  let historyBudget = HISTORY_CHARS;
  for (const turn of sourceTurns.slice(-HISTORY_TURNS).reverse()) {
    const text = turn.text.slice(0, 1_500);
    if (historyBudget - text.length < 0) break;
    historyBudget -= text.length;
    trimmedTurns.unshift({ role: turn.role, text });
  }
  const conversation = trimmedTurns
    .map((turn) => `${turn.role === "user" ? "손님" : "상담사"}: ${turn.text}`)
    .join("\n");

  /*
   * 손님의 계획서 — 챗봇이 손님의 사업을 아는 상담이 되게 한다.
   * 계정(hash)에 묶인 플랜만 읽으므로 남의 planId 를 넣어도 아무것도 안 나온다.
   */
  let planBlock = "";
  /* 계획서에 저장된 공식 근거 — 상담사가 수치를 말할 때 이것만 쓰고 [E#] 로 표시한다 */
  let evidence: MarketEvidence[] = [];
  if (input.planId) {
    const state = await loadPlanState(identity.hash).catch(() => null);
    const plan = state?.plans.find((p) => p.id === input.planId);
    if (plan) {
      planBlock = `손님의 사업계획서\n${planDigest(plan, state!.business)}`;
      const saved = await loadPlanEvidence(plan.id, identity.hash).catch(() => [] as MarketEvidence[]);
      evidence = pickConsultEvidence(saved, input.profile);
    }
  }
  const evidenceText = evidenceBlock(evidence);

  const user = [
    known.length ? `지금까지 알아낸 것\n${known.join("\n")}` : "아직 알아낸 것이 없습니다.",
    "",
    ...(planBlock ? [planBlock, ""] : []),
    ...(evidenceText ? [evidenceText, ""] : []),
    conversation ? `지금까지 대화\n${conversation}` : "첫 대화입니다.",
    "",
    `손님의 마지막 말\n${input.message}`,
  ].join("\n");

  /*
   * 스트리밍.
   *
   * 답이 5~10초 뒤에 통째로 떨어지면 느리고 멍청해 보인다. 모델이 평문 답을
   * 먼저 쓰고 === 뒤에 JSON(카드·보기·추천)을 붙이도록 했으므로, 평문은 오는
   * 대로 흘려주고 JSON 은 끝에 모아 파싱한다. 첫 글자가 '{' 면(옛 형식으로
   * 답한 경우) 흘리지 않고 끝에서 통째로 읽는다.
   */
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); } catch { closed = true; }
      };
      let full = "";
      let sentLen = 0;
      /* 닫힘 함수 안에서 바뀌는 값 — 변수로 두면 TS 가 첫 값으로 좁혀 버린다 */
      const st = { mode: "unknown" as "unknown" | "text" | "json" };
      let sepAt = -1;
      const HOLD = CONSULT_META_SEP.length + 2; /* 구분선이 조각 사이에 걸쳐 올 수 있어 끝을 조금 남긴다 */
      const flushText = (upTo: number) => {
        if (upTo > sentLen) { send({ t: "delta", v: full.slice(sentLen, upTo) }); sentLen = upTo; }
      };
      const onDelta = (chunk: string) => {
        full += chunk;
        if (st.mode === "unknown") {
          const head = full.trimStart();
          if (!head) return;
          st.mode = head.startsWith("{") ? "json" : "text";
        }
        if (st.mode === "json" || sepAt >= 0) return;
        const idx = full.indexOf(`\n${CONSULT_META_SEP}`);
        const idx0 = full.startsWith(CONSULT_META_SEP) ? 0 : -1;
        const found = idx0 >= 0 ? 0 : idx;
        if (found >= 0) { sepAt = found; flushText(found); return; }
        flushText(Math.max(sentLen, full.length - HOLD));
      };
      const text = await streamText(config, {
        system: CONSULT_SYSTEM,
        user,
        maxOutputTokens: 1200,
        kind: "consult",
        cache: true,
        timeoutMs: 60_000,
        signal: request.signal,
      }, onDelta);

      let reply: ConsultReply | null = null;
      if (text) {
        let message = "";
        let meta: Record<string, unknown> = {};
        if (st.mode === "json") {
          const obj = parseJsonObject(text);
          if (obj) { message = String(obj.message ?? ""); meta = obj; }
          if (message) send({ t: "delta", v: message });
        } else {
          const cut = sepAt >= 0 ? sepAt : text.indexOf(`\n${CONSULT_META_SEP}`);
          message = (cut >= 0 ? text.slice(0, cut) : text).trim();
          if (cut >= 0) { flushText(cut); meta = parseJsonObject(text.slice(cut + CONSULT_META_SEP.length + 1)) ?? {}; }
          else flushText(text.length);
        }
        /* [E#] → (출처 #), 실제로 쓰인 근거만 sources 로 */
        const cited = applyCitations(message, evidence);
        const parsed = consultReplySchema.safeParse({ ...meta, message: cited.message, sources: cited.sources });
        if (parsed.success && parsed.data.message) reply = parsed.data;
      }
      if (!reply) {
        const fb = fallback();
        if (sentLen === 0) send({ t: "delta", v: fb.message });
        send({ t: "done", ...fb, profile: input.profile, remainingToday: Math.max(0, limit - (session?.turnsToday ?? 0)), isGuest: !identity.userId });
        controller.close();
        return;
      }

      /* 주고받은 말과 정리된 상담 카드를 남긴다. 저장이 실패해도 상담은 이어진다. */
      const at = new Date().toISOString();
      const merged = { ...input.profile, ...reply.profile };
      /*
       * ready 는 코드가 확정한다.
       * 규칙(업종 + 지역·예산·시간 중 하나)은 분명한데, 모델은 질문을 더 이어갈 때
       * false 로 두는 버릇이 있었다(정답 세트 c13 — 프롬프트를 강화해도 그대로).
       * 그러면 '창업계획 만들기' 문이 열리지 않는다. 판정은 모델이 아니라 여기서.
       */
      if (merged.interest && (merged.region || merged.budget || merged.hoursPerDay)) reply = { ...reply, ready: true };
      await saveConsultTurn(identity.hash, {
        profile: merged,
        appended: [
          { role: "user", text: input.message, at },
          { role: "assistant", text: reply.message, at },
        ],
        turnsToday: (session?.turnsToday ?? 0) + 1,
      }).catch(() => {});

      send({
        t: "done",
        ...reply,
        /* 화면에도 저장본과 같은 '합쳐진' 카드를 준다 — 모델이 한 항목을 빠뜨려도 조건이 사라지지 않게 */
        profile: merged,
        remainingToday: Math.max(0, limit - ((session?.turnsToday ?? 0) + 1)),
        isGuest: !identity.userId,
      });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" },
  });
}

