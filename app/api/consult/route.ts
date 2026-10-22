import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../lib/api-auth";
import { checkRateLimit, enforceRateLimit } from "../../../lib/rate-limit";
import { resolveLLMConfig } from "../../../lib/llm/config";
import { streamText, type LLMFailure } from "../../../lib/llm/complete";
import { consultRefersToPlan, parseConsultText } from "../../../lib/consult/reply";
import { loadPlanState } from "../../../lib/plan-builder/plan-server-store";
import { planDigest } from "../../../lib/consult/plan-digest";
import { loadPlanEvidence } from "../../../lib/plan-builder/market-research";
import { pickConsultEvidence, evidenceBlock, applyCitations } from "../../../lib/consult/evidence";
import type { MarketEvidence } from "../../../lib/market/domain";
import { loadConsultSession, saveConsultTurn, resetConsultSession, consultLimitFor, CONSULT_FREE_TURNS_GUEST } from "../../../lib/consult/repository";
import {
  CONSULT_SYSTEM,
  CONSULT_META_SEP,
  CONSULT_FAILED_REPLY,
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
      "지금은 상담을 이어가지 못했어요. 잠시 후 다시 말씀해 주세요.\n급하시면 아래 '담당자에게 남기기'를 누르면 사람이 확인해요.",
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
  // 못 읽었으면 '빈 상담'이라고 답하지 않는다 — 화면은 다음에 다시 불러온다
  if (!session) return NextResponse.json({ error: "consult_unavailable", message: "지난 상담을 불러오지 못했어요." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
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
  try { await resetConsultSession(identity.hash); }
  catch { return NextResponse.json({ ok: false, error: "consult_unavailable", message: "지난 상담을 지우지 못했어요." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("consult", request, {
    limit: 40,
    windowMs: 10 * 60_000,
    message: "상담 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
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
    message: "오늘 상담 요청이 많았어요. 내일 다시 이용해 주세요.",
  });
  if (dayLimited) return dayLimited;
  // 서비스 전체 하루 상한 — 쿠키·IP 를 바꿔 가며 부르면 위 한도로는 비용이 끝없이 나간다
  const allLimited = await enforceRateLimit("consult-all-day", request, {
    key: "all",
    limit: 1500,
    windowMs: 24 * 60 * 60_000,
    message: "오늘 상담 요청이 많아 잠시 쉬어요. 내일 다시 이용해 주세요.",
  });
  if (allLimited) return allLimited;

  const identity = await requireGuestIdentity();

  /*
   * 하루 사용량.
   *
   * 위의 IP 제한은 순간 폭주만 막는다(10분에 40번). 한 사람이 하루 종일 쓰는 것은
   * 그걸로 막히지 않으므로 계정 기준으로 따로 센다.
   */
  const session = await loadConsultSession(identity.hash).catch((error: unknown) => {
    console.warn("[consult]", JSON.stringify({ event: "session_unavailable", code: (error as { code?: string } | null)?.code ?? null, message: String((error as { message?: string } | null)?.message ?? error).slice(0, 160) }));
    return null;
  });
  const limit = consultLimitFor(identity.userId);
  /*
   * 상담 저장소를 못 읽어도 하루 한도를 건너뛰지 않는다 — 예전엔 운영 DB에 consult_sessions(0024)가 없어
   * 손님 하루 3번 제한이 한 번도 걸리지 않았다. 그때는 저장된 횟수 대신 요청 수를 같은 한도로 센다.
   */
  const ownerDay = session ? null : await checkRateLimit("consult-owner-day", identity.hash, { limit, windowMs: 24 * 60 * 60_000 });
  const overLimit = session ? session.turnsToday >= limit : !ownerDay!.ok;
  if (overLimit) {
    return NextResponse.json(
      {
        error: "consult_limit",
        needsLogin: !identity.userId,
        message: identity.userId
          ? `오늘 상담을 ${limit}번 하셨어요. 내일 다시 이어서 하실 수 있고, 지금까지 정리된 내용으로 바로 사업계획서를 만들어 보셔도 좋아요.`
          : `상담을 ${CONSULT_FREE_TURNS_GUEST}번 해 보셨어요. 로그인하시면 이어서 상담하고, 지금까지 정리된 내용도 그대로 보관돼요.`,
      },
      { status: 429, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", message: "요청을 읽지 못했어요." }, { status: 400 });
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
  /* 답을 받지 못한 차례(손님 질문 + 실패 표시)는 모델에게 싣지 않는다 — 손님이 '다시 보내기'로 같은 말을 다시 보낸다 */
  const storedTurns = session?.messages ?? [];
  const serverTurns = storedTurns
    .filter((turn, index) => !(turn.text === CONSULT_FAILED_REPLY || (turn.role === "user" && storedTurns[index + 1]?.text === CONSULT_FAILED_REPLY)))
    .map((turn) => ({ role: turn.role, text: turn.text }));
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
    /*
     * 손님이 이번에 그 계획서(그 사업)를 가리켰을 때만 통째로 싣는다. 아니면 '참고' 한 줄만 —
     * 예전엔 늘 실어서 "주말 부업 창업이 있을까요?"에 "계획서 속 빵집은…"으로 답하고, 검토 메모까지 상담 카드에 옮겼다.
     */
    const recentUser = sourceTurns.filter((turn) => turn.role === "user").map((turn) => turn.text);
    if (plan && consultRefersToPlan(input.message, recentUser, { title: plan.title, industry: state!.business.industry, name: state!.business.name })) {
      planBlock = `손님의 사업계획서\n${planDigest(plan, state!.business)}`;
      const saved = await loadPlanEvidence(plan.id, identity.hash).catch(() => [] as MarketEvidence[]);
      evidence = pickConsultEvidence(saved, input.profile);
    } else if (plan) {
      planBlock = `참고: 손님은 '${plan.title.slice(0, 60)}' 사업계획서도 쓰고 있습니다. 이번 말은 그 계획서 이야기가 아닐 수 있습니다 — 손님이 계획서를 말하지 않으면 꺼내지 말고, 마지막 말에만 답하세요.`;
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
          st.mode = head.startsWith("{") || head.startsWith("```") ? "json" : "text";
        }
        if (st.mode === "json" || sepAt >= 0) return;
        const idx = full.indexOf(`\n${CONSULT_META_SEP}`);
        const idx0 = full.startsWith(CONSULT_META_SEP) ? 0 : -1;
        const found = idx0 >= 0 ? 0 : idx;
        if (found >= 0) { sepAt = found; flushText(found); return; }
        flushText(Math.max(sentLen, full.length - HOLD));
      };
      const llm = { failure: null as LLMFailure["code"] | null };
      const text = await streamText(config, {
        system: CONSULT_SYSTEM,
        user,
        maxOutputTokens: 1200,
        kind: "consult",
        cache: true,
        timeoutMs: 60_000,
        signal: request.signal,
        onFailure: (event) => { llm.failure = event.code; },
      }, onDelta);

      /*
       * 답 읽기 — 손님에게 보일 말이 있으면 살린다(넘친 칸은 자르고, 못 고칠 칸만 버린다 · lib/consult/reply.ts).
       * 예전엔 끝 JSON 의 한 칸만 형식을 넘어도 답 전체를 버리고 '이어가지 못했어요'를 보였다.
       */
      let reply: ConsultReply | null = null;
      /* 길이 한도에서 끊긴 답은 거기까지 받은 글로 — 손님 말은 대개 앞에 다 있고, 잘린 것은 끝의 JSON 이다 */
      const received = text ?? (llm.failure === "output_limit" ? full : null);
      const result = parseConsultText(received);
      if (result.ok) {
        /* [E#] → (출처 #), 실제로 쓰인 근거만 sources 로 */
        const cited = applyCitations(result.reply.message, evidence);
        const parsed = consultReplySchema.safeParse({ ...result.reply, message: cited.message || result.reply.message, sources: cited.sources });
        if (parsed.success) reply = parsed.data;
        else reply = { ...result.reply, sources: [] };
      }
      // 실패·살린 칸은 이유 코드만 남긴다(대화 내용·개인정보는 남기지 않는다)
      if (!reply) {
        console.error("[consult]", JSON.stringify({ event: "reply_failed", reason: result.ok ? "schema" : result.reason, llm: llm.failure, aborted: request.signal.aborted, textLength: received?.length ?? 0, dropped: result.dropped.slice(0, 12) }));
      } else if (result.dropped.length) {
        console.error("[consult]", JSON.stringify({ event: "reply_salvaged", dropped: result.dropped.slice(0, 12), textLength: received?.length ?? 0 }));
      }
      if (!reply) {
        const fb = fallback();
        /*
         * 손님 질문은 남긴다 — 실패 표시와 함께 저장해, 새로고침하거나 창을 닫았다 와도 질문이 사라지지 않고
         * '다시 보내기'가 붙는다(예전엔 저장하지 않아 질문이 통째로 사라졌다). 하루 횟수는 세지 않는다.
         */
        const at = new Date().toISOString();
        await saveConsultTurn(identity.hash, {
          profile: input.profile,
          appended: [{ role: "user", text: input.message, at }, { role: "assistant", text: CONSULT_FAILED_REPLY, at }],
          turnsToday: session?.turnsToday ?? 0,
          /* 같은 질문이 또 실패하면 실패 차례를 하나만 남긴다 */
          replaceFailed: input.message,
        }).catch(() => { /* 저장소가 없으면 화면이 질문을 들고 있다 */ });
        if (sentLen === 0) send({ t: "delta", v: fb.message });
        send({ t: "done", ...fb, failed: true, profile: input.profile, remainingToday: ownerDay ? ownerDay.remaining : Math.max(0, limit - (session?.turnsToday ?? 0)), isGuest: !identity.userId });
        try { controller.close(); } catch { /* 손님이 창을 닫아 이미 끊긴 흐름 */ }
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
        /* 답을 못 받은 같은 질문을 다시 보낸 것이면 그 실패 차례는 지운다 — 같은 질문이 두 번 남지 않게 */
        replaceFailed: input.message,
      }).catch((error: unknown) => {
        // 상담은 이어 가되 저장 실패는 남긴다(대화 기록·하루 횟수가 안 남는다)
        console.warn("[consult]", JSON.stringify({ event: "save_failed", code: (error as { code?: string } | null)?.code ?? null, message: String((error as { message?: string } | null)?.message ?? error).slice(0, 160) }));
      });

      send({
        t: "done",
        ...reply,
        /* 화면에도 저장본과 같은 '합쳐진' 카드를 준다 — 모델이 한 항목을 빠뜨려도 조건이 사라지지 않게 */
        profile: merged,
        remainingToday: ownerDay ? ownerDay.remaining : Math.max(0, limit - ((session?.turnsToday ?? 0) + 1)),
        isGuest: !identity.userId,
      });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" },
  });
}

