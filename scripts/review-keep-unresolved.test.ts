import assert from "node:assert/strict";
import { reviewCoachSection, type CoachReviewEvent } from "../lib/plan-builder/coach-review";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const config = { provider: "anthropic" as const, model: "fixture-only", apiKey: "fixture-only" };
  const original = globalThis.fetch;
  let truncated = false; const kinds: string[] = [];
  const reply = (text: string, stop = "end_turn") => Response.json({ stop_reason: stop, content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 }, model: "fixture-only" });
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const review = !!body.output_config?.format;
      kinds.push(review ? "review" : "repair");
      if (review) {
        if (truncated) return reply("{\"issues\":[", "max_tokens");
        // 매번 "월 300건"을 문제로 지적한다 — 수정본에도 그 문구가 남아 있어 두 번째 검토도 지적한다
        return reply(JSON.stringify({ issues: [{ quote: "월 300건", reason: "처리량 근거가 없습니다" }] }));
      }
      return reply("고친 본문: 월 300건은 목표로 표시합니다.");
    };
    const events: CoachReviewEvent[] = [];
    // 기본(발표자료 등): 두 번째 검토에서도 지적이 남으면 버린다 — 기존 동작 유지
    assert.equal(await reviewCoachSection(config, "원천", "초안: 월 300건 판매"), null);
    assert.deepEqual(kinds, ["review", "repair", "review"]);
    // 사업계획서 섹션: 고친 본문을 저장한다(섹션이 '생성 중'에서 멈추지 않는다)
    kinds.length = 0;
    const kept = await reviewCoachSection(config, "원천", "초안: 월 300건 판매", "markdown", event => { events.push(event); }, undefined, { keepUnresolved: true });
    assert.equal(kept, "고친 본문: 월 300건은 목표로 표시합니다.");
    assert.deepEqual(kinds, ["review", "repair"], "sections skip the second review — it cannot change the result");
    // 검토자가 본문에 없는 문구를 인용하면 초안을 그대로 둔다
    assert.equal(await reviewCoachSection(config, "원천", "초안: 판매 목표 미정", "markdown", undefined, undefined, { keepUnresolved: true }), "초안: 판매 목표 미정");
    // 검토 자체가 실패(응답 잘림)하면 keepUnresolved 여도 통과시키지 않는다
    truncated = true;
    assert.equal(await reviewCoachSection(config, "원천", "초안: 월 300건 판매", "markdown", undefined, undefined, { keepUnresolved: true }), null);
    console.log(JSON.stringify({ passed: 7 }));
  } finally { globalThis.fetch = original; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
