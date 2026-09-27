import assert from "node:assert/strict";
import { liveCommentConfig, streamLiveComment } from "../lib/plan-builder/live-comment";
import type { LLMConfig } from "../lib/llm/complete";

const claude: LLMConfig = { provider: "anthropic", apiKey: "test-only", model: "claude-opus-5-5" };
const originalFetch = globalThis.fetch;

function sse(events: Array<Record<string, unknown>>, delayMs = 0) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function main() {
  const previousModel = process.env.INTAKE_COMMENT_MODEL;
  try {
    // 1) 스트리밍: 추론 조각은 버리고 글자 조각만 순서대로, 첫 글자 시간 기록
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return sse([
        { type: "message_start", message: { usage: { input_tokens: 120 } } },
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "" } },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "여러 사람이 돈을 모아 부동산을 사는 구조는 " } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "금융 인허가 대상일 수 있어요." } },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 60 } },
        { type: "message_stop" },
      ], 5);
    }) as typeof fetch;
    const chunks: string[] = [];
    const timing = await streamLiveComment(claude, "사람들이 돈을 모아서 건물을 사는 사이트 만들고 싶어", chunk => chunks.push(chunk));
    assert.deepEqual(chunks, ["여러 사람이 돈을 모아 부동산을 사는 구조는 ", "금융 인허가 대상일 수 있어요."]);
    assert.equal(timing.ok, true);
    assert.equal(timing.model, "claude-opus-5-5");
    assert.ok(timing.firstTokenMs !== null && timing.firstTokenMs <= timing.totalMs, "첫 글자 시간을 전체 시간 안에서 기록");
    assert.equal(body.stream, true);
    assert.deepEqual(body.output_config, { effort: "low" }, "짧은 의견은 추론 강도 low");
    assert.ok(Number(body.max_tokens) > 300, "답변 몫(300)에 추론 여유를 더한다");
    assert.match(String(body.system), /질문으로 끝내지 마세요/);
    assert.equal(JSON.parse(String((body.messages as Array<{ content: string }>)[0].content)).idea, "사람들이 돈을 모아서 건물을 사는 사이트 만들고 싶어");

    // 2) 모델 비교: INTAKE_COMMENT_MODEL은 Claude 설정에만 적용
    process.env.INTAKE_COMMENT_MODEL = "claude-haiku-4-5";
    assert.equal(liveCommentConfig(claude)?.model, "claude-haiku-4-5");
    assert.equal(liveCommentConfig({ provider: "openai", apiKey: "k", model: "gpt-5.6-sol" })?.model, "gpt-5.6-sol");
    assert.equal(liveCommentConfig(null), null);
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return sse([{ type: "content_block_delta", delta: { type: "text_delta", text: "짧은 의견" } }, { type: "message_stop" }]);
    }) as typeof fetch;
    const haiku = await streamLiveComment(liveCommentConfig(claude)!, "반찬 가게", () => undefined);
    assert.equal(haiku.model, "claude-haiku-4-5");
    assert.equal(body.output_config, undefined, "Haiku에는 추론 강도를 보내지 않는다");

    // 3) 실패는 조용히: 서버 오류면 글자 없이 ok=false로 끝나고 예외를 던지지 않는다
    globalThis.fetch = (async () => Response.json({ error: { type: "overloaded_error", message: "busy" } }, { status: 529 })) as typeof fetch;
    const failed = await streamLiveComment(claude, "반찬 가게", () => assert.fail("실패 시 글자를 보내면 안 된다"));
    assert.equal(failed.ok, false);
    assert.equal(failed.firstTokenMs, null);

    console.log(`intake-live-comment: streaming deltas, low effort, first-token timing (${timing.firstTokenMs}ms of ${timing.totalMs}ms in fixture), model override, silent failure passed`);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousModel === undefined) delete process.env.INTAKE_COMMENT_MODEL;
    else process.env.INTAKE_COMMENT_MODEL = previousModel;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
