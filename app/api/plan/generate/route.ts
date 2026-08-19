import { NextResponse } from "next/server";
import { renderPlanMarkdown } from "../../../../lib/plan-builder/markdown";
import { PLAN_BLUEPRINT, financialTableOwner, needsMultiYear } from "../../../../lib/plan-builder/blueprint";
import { generateSection, streamSection } from "../../../../lib/plan-builder/section-generator";
import { resolveLLMConfig } from "../../../../lib/llm/config";
import { collectFinancialInputs, calculateFinancials, financialsToMarkdown, financialsToReference, projectYears, yearsToMarkdown } from "../../../../lib/plan-builder/financials";
import { findConsistencyIssues, issuesForSection } from "../../../../lib/plan-builder/consistency";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { resolvePlanAccess, checkSectionAccess, FREE_SECTION_COUNT, FREE_PLAN_LIMIT, freePlanLimitReached } from "../../../../lib/plan-builder/access";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { resolveRegenQuota, recordRegen } from "../../../../lib/plan-builder/regen-quota";
import { REGEN_PACK_AMOUNT, REGEN_PACK_COUNT } from "../../../../lib/payments/domain";

export const runtime = "nodejs";

// 섹션 생성 — 답변을 프롬프트로 만들어 Claude/OpenAI가 그 섹션 본문(마크다운) 생성 → HTML까지 렌더.

export async function POST(req: Request) {
  // AI·렌더 비용이 드는 호출 — 화면 제어와 별개로 서버에서 빈도를 제한한다
  const limited = await enforceRateLimit("generate-section", req, { limit: 40, windowMs: 10 * 60_000, message: "본문 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." });
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as {
    chapterId?: string;
    sectionId?: string;
    answers?: Record<string, unknown>;
    planTitle?: string;
    planType?: string;
    /** 문서 단위 결제 판정에 필요 */
    planId?: string;
    /** 켜면 본문을 조각 단위로 흘려준다(NDJSON) */
    stream?: boolean;
    priorSummary?: string;
    /** 플랜 전체 답변 — 재무 계산에 필요(입력이 여러 섹션에 흩어져 있음) */
    allAnswers?: Record<string, Record<string, unknown>>;
    business?: {
      name?: string;
      description?: string;
      role?: string;
      industry?: string;
      region?: string;
      stage?: string;
    };
  };

  const chapter = PLAN_BLUEPRINT.find((c) => c.id === body.chapterId);
  const section = chapter?.sections.find((s) => s.id === body.sectionId);
  if (!chapter || !section) {
    return NextResponse.json({ error: "unknown section" }, { status: 400 });
  }

  /*
   * 재무 수치는 여러 섹션이 참고하지만, 표와 차트를 본문에 싣는 곳은 한 섹션뿐이다.
   * 나머지 섹션에는 핵심 수치 요약만 넘겨 같은 표가 문서에 반복되지 않게 한다.
   */
  const FINANCIAL_SECTIONS = new Set([
    "financials/revenue",
    "financials/expenses",
    "financials/financing",
    "financials/staffing",
    "financials/assets",
    "market/products", // 가격·손익 언급
    "summary/executive",
  ]);
  let financialsMarkdown: string | undefined;
  let financialsReference: string | undefined;
  const sectionKey = `${chapter.id}/${section.id}`;
  if (body.allAnswers && FINANCIAL_SECTIONS.has(sectionKey)) {
    const { inputs, growthLabel, staffIncluded } = collectFinancialInputs(body.allAnswers);
    const result = calculateFinancials(inputs);
    if (result.unit || result.monthly.length) {
      if (sectionKey === financialTableOwner(body.planType)) {
        financialsMarkdown = financialsToMarkdown(result, {
          growthLabel,
          growthPct: inputs.monthlyGrowthPct,
          staffIncluded,
          monthlyCapacity: inputs.monthlyCapacity,
        });
        // '정밀 재무 모델'은 카드에서 다년 예측을 약속한다 — 실제로 3년을 계산해 붙인다
        if (needsMultiYear(body.planType)) {
          const years = yearsToMarkdown(projectYears(inputs), { growthPct: inputs.monthlyGrowthPct, monthlyCapacity: inputs.monthlyCapacity });
          if (years) financialsMarkdown = `${financialsMarkdown}\n\n${years}`;
        }
      } else {
        financialsReference = financialsToReference(result);
      }
    }
  }

  // 미해결 충돌을 프롬프트에 함께 넘긴다 — AI가 한쪽을 골라 단정하지 않도록.
  // 총평(요약) 섹션은 플랜 전체를 요약하므로 모든 충돌을 넘긴다.
  let conflicts: Array<{ title: string; detail: string }> | undefined;
  if (body.allAnswers) {
    const all = findConsistencyIssues(body.allAnswers, body.business);
    const relevant = sectionKey === "summary/executive" ? all : issuesForSection(all, sectionKey);
    if (relevant.length) conflicts = relevant.map(({ title, detail }) => ({ title, detail }));
  }

  // 화면만 가려서는 우회할 수 있으므로 생성 자체를 서버에서 막는다.
  const access = await resolvePlanAccess(body.planType, body.planId);
  const reason = checkSectionAccess(access, sectionKey);
  if (reason !== "ok") {
    return NextResponse.json(
      {
        error: reason,
        message:
          reason === "login_required"
            ? "로그인 후 이용할 수 있습니다."
            : `무료로는 앞 ${FREE_SECTION_COUNT}개 섹션까지 작성할 수 있습니다. 이어서 쓰려면 결제가 필요합니다.`,
      },
      { status: reason === "login_required" ? 401 : 402 },
    );
  }

  const identity = await requireGuestIdentity();
  const savedState = await loadPlanState(identity.hash);

  /*
   * 무료로 본문을 써 본 문서 수 제한.
   *
   * 무료 2개 섹션이 문서마다 열리는데 문서 개수에는 제한이 없었다. 문서를
   * 열 개 만들면 결제 없이 본문 스무 개가 나간다 — 그게 그대로 실비다.
   * 결제한 문서는 세지 않고, 이미 무료로 쓰기 시작한 문서도 막지 않는다.
   */
  if (!access.paid && !access.allAccess) {
    if (freePlanLimitReached(body.planId, savedState.plans, access.paidPlanIds)) {
      return NextResponse.json(
        {
          error: "free_plan_limit",
          message: `결제 없이 본문을 써 볼 수 있는 문서는 ${FREE_PLAN_LIMIT}개까지입니다. 기존 문서를 결제하거나 지운 뒤 이어서 만들 수 있습니다.`,
        },
        { status: 402 },
      );
    }
  }

  /*
   * 다시 생성 횟수.
   *
   * 이미 본문이 있는 섹션을 AI 로 또 만드는 것만 센다. 첫 생성은 문서값에
   * 포함되고, 손님이 직접 글을 고쳐 쓰는 것은 비용이 들지 않는다.
   *
   * 화면이 보낸 값을 믿지 않는다 — 서버가 저장해 둔 본문이 있는지로 판정한다.
   * 그래야 요청을 손으로 만들어 우회할 수 없다.
   */
  let regenPlanId = "";
  if (body.planId) {
    const plan = savedState.plans.find((p) => p.id === body.planId);
    const existing = plan?.sections?.[sectionKey];
    if (existing?.markdown) {
      const quota = await resolveRegenQuota(body.planId);
      if (quota.remaining <= 0) {
        return NextResponse.json(
          {
            error: "regen_quota_exceeded",
            message: `이 문서에 포함된 다시 생성 ${quota.allowed}회를 모두 썼습니다. ${REGEN_PACK_COUNT}회를 ${REGEN_PACK_AMOUNT.toLocaleString("ko-KR")}원에 추가할 수 있습니다.`,
            quota,
          },
          { status: 402 },
        );
      }
      regenPlanId = body.planId;
    }
  }

  const config = resolveLLMConfig(identity.hash, "anthropic");
  const genInput = {
    chapter,
    section,
    answers: body.answers ?? {},
    planTitle: body.planTitle,
    planType: body.planType,
    business: body.business,
    priorSummary: body.priorSummary,
    financialsMarkdown,
    financialsReference,
    conflicts,
  };

  // 실시간 생성 — 한 줄에 JSON 하나씩 흘려보낸다.
  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        try {
          const { markdown, source } = await streamSection(config, genInput, (chunk) => send({ t: "delta", v: chunk }));
          if (source === "failed") {
            /* 스트리밍도 같은 규칙 — 여기가 빠지면 stream:true 로 횟수를 우회할 수 있다 */
            if (regenPlanId) await recordRegen(regenPlanId, identity.hash, sectionKey, false);
            send({ t: "error" });
            return;
          }
          let html = "";
          try {
            html = await renderPlanMarkdown(markdown);
          } catch {
            html = markdown.replace(/\n/g, "<br>");
          }
          let quota = null;
          if (regenPlanId) {
            /* 여기도 같다 — AI 가 쓴 글(ai)일 때만 깎는다 */
            await recordRegen(regenPlanId, identity.hash, sectionKey, source === "ai");
            quota = await resolveRegenQuota(regenPlanId);
          }
          send({ t: "done", markdown, html, source, ...(quota ? { quota } : {}) });
        } catch {
          if (regenPlanId) await recordRegen(regenPlanId, identity.hash, sectionKey, false);
          send({ t: "error" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const { markdown, source } = await generateSection(config, {
    chapter,
    section,
    answers: body.answers ?? {},
    planTitle: body.planTitle,
    planType: body.planType,
    business: body.business,
    priorSummary: body.priorSummary,
    financialsMarkdown,
    financialsReference,
    conflicts,
  });

  /*
   * AI 호출이 실패했으면 본문을 만들지 않는다.
   *
   * 예전에는 실패해도 '답변 표'를 200으로 돌려줬고, 화면은 그것을 저장해
   * 섹션을 '완료'로 표시했다. 결제한 사람이 AI가 쓴 글 대신 표를 받고도
   * 알 수 없었고, 운영자도 사고를 눈치채지 못했다.
   */
  if (source === "failed") {
    /* 실패는 ok=false 로 남긴다 — 기록은 하되 잔여 횟수에서 빼지 않는다 */
    if (regenPlanId) await recordRegen(regenPlanId, identity.hash, sectionKey, false);
    return NextResponse.json(
      {
        error: "generation_failed",
        message: "본문을 만들지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 502 },
    );
  }

  /*
   * AI 가 실제로 쓴 글일 때만 1회를 깎는다.
   *
   * source 가 fallback 이면 키가 없어 AI 를 아예 부르지 않고 답변을 표로
   * 정리해 돌려준 것이다. 실비가 0인데 횟수를 깎으면 손님이 받지도 않은
   * 것에 값을 치르게 된다.
   */
  let quota: Awaited<ReturnType<typeof resolveRegenQuota>> | null = null;
  if (regenPlanId) {
    await recordRegen(regenPlanId, identity.hash, sectionKey, source === "ai");
    /* 방금 깎인 값을 다시 읽어 화면이 '남은 N회'를 바로 보여줄 수 있게 한다 */
    quota = await resolveRegenQuota(regenPlanId);
  }

  let html = "";
  try {
    html = await renderPlanMarkdown(markdown);
  } catch {
    html = markdown.replace(/\n/g, "<br>");
  }

  return NextResponse.json({ markdown, html, source, ...(quota ? { quota } : {}) });
}
