import assert from "node:assert/strict";
import { reviewCoachSection, type CoachReviewEvent } from "../lib/plan-builder/coach-review";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const config = { provider: "anthropic" as const, model: "fixture-only", apiKey: "fixture-only" };
  const original = globalThis.fetch;
  let truncated = false; let patchReply = JSON.stringify({ edits: [{ quote: "월 300건 판매", replacement: "월 300건 판매(목표)" }] }); const kinds: string[] = [];
  const reply = (text: string, stop = "end_turn") => Response.json({ stop_reason: stop, content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 }, model: "fixture-only" });
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const required: string[] = body.output_config?.format?.schema?.required ?? [];
      const review = required.includes("issues");
      const patch = required.includes("edits");
      kinds.push(review ? "review" : patch ? "patch" : "repair");
      if (patch) return reply(patchReply);
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
    const draft = "초안: 이 사업은 월 300건 판매를 첫 달 목표로 두고 작은 매장 한 곳에서 시작합니다.";
    const kept = await reviewCoachSection(config, "원천", draft, "markdown", event => { events.push(event); }, undefined, { keepUnresolved: true });
    assert.equal(kept, "초안: 이 사업은 월 300건 판매(목표)를 첫 달 목표로 두고 작은 매장 한 곳에서 시작합니다.", "only the quoted span is replaced");
    assert.deepEqual(kinds, ["review", "patch"], "sections patch the flagged span instead of rewriting the whole section");
    assert.ok(events.includes("repair_patched"));
    // 바꿀 문구가 본문에 없으면(또는 두 번 이상 나오면) 예전처럼 섹션 전체를 다시 쓴다
    kinds.length = 0;
    patchReply = JSON.stringify({ edits: [{ quote: "본문에 없는 문구", replacement: "x" }] });
    assert.equal(await reviewCoachSection(config, "원천", draft, "markdown", event => { events.push(event); }, undefined, { keepUnresolved: true }), "고친 본문: 월 300건은 목표로 표시합니다.");
    assert.deepEqual(kinds, ["review", "patch", "repair"]);
    assert.ok(events.includes("repair_patch_fallback"));
    patchReply = "not json";
    kinds.length = 0;
    assert.equal(await reviewCoachSection(config, "원천", draft, "markdown", undefined, undefined, { keepUnresolved: true }), "고친 본문: 월 300건은 목표로 표시합니다.");
    assert.deepEqual(kinds, ["review", "patch", "repair"], "an unusable patch falls back to the full repair");
    // 검토자가 본문에 없는 문구를 인용하면 초안을 그대로 둔다
    assert.equal(await reviewCoachSection(config, "원천", "초안: 판매 목표 미정", "markdown", undefined, undefined, { keepUnresolved: true }), "초안: 판매 목표 미정");
    // 검토 자체가 실패(응답 잘림)하면 keepUnresolved 여도 통과시키지 않는다
    truncated = true;
    assert.equal(await reviewCoachSection(config, "원천", "초안: 월 300건 판매", "markdown", undefined, undefined, { keepUnresolved: true }), null);
    console.log(JSON.stringify({ passed: 12 }));
  } finally { globalThis.fetch = original; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
