import assert from "node:assert/strict";
import { completeText, streamText, type LLMConfig } from "../lib/llm/complete";
import { buildUserPrompt, sectionSystemPrompt, type SectionGenInput } from "../lib/plan-builder/section-generator";
import type { PlanChapterDef, PlanSectionDef } from "../lib/plan-builder/blueprint";

/*
 * 프롬프트 캐시 회귀 테스트.
 *
 * 캐시는 깨져도 오류가 나지 않는다. 시스템 프롬프트에 섹션마다 달라지는 값이
 * 하나 섞이는 순간 25번 모두 새 요금이 되는데, 화면에는 아무 변화가 없다.
 * 그래서 '한 플랜 안에서 시스템 프롬프트가 글자까지 같다'를 못박아 둔다.
 */

const chapter = (id: string, title: string): PlanChapterDef => ({
  id,
  title,
  lead: title,
  rest: "",
  tone: 1,
  sections: [],
});

const section = (id: string, title: string): PlanSectionDef => ({
  id,
  title,
  summary: `${title} 요약`,
  estMinutes: 10,
});

const business = { name: "한빛싱크", description: "주방 싱크대 시공", industry: "인테리어", region: "서울 마포구" };

/** 같은 플랜의 서로 다른 섹션 — 섹션·답변·앞 요약·재무만 다르다 */
function inputFor(n: number): SectionGenInput {
  return {
    chapter: chapter(`ch${n}`, `${n}장 제목`),
    section: section(`sec${n}`, `${n}번 섹션`),
    answers: { [`q${n}`]: `답변 ${n}` },
    planTitle: "한빛싱크 사업계획서",
    planType: "창업 초기 · 사업계획서",
    business,
    priorSummary: n > 1 ? `앞 섹션 ${n - 1}개의 요약` : undefined,
    financialsMarkdown: n === 2 ? "| 1월 | 100 |" : undefined,
  };
}

let lastBody: Record<string, unknown> = {};
function mockOk() {
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    lastBody = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: "여기에 충분히 긴 본문이 들어간다고 가정합니다. 40자 하한을 넘겨야 합니다." }],
        usage: { input_tokens: 10, cache_creation_input_tokens: 1500, cache_read_input_tokens: 0 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

async function main() {
  const originalFetch = globalThis.fetch;
  try {
    // 1) 같은 플랜이면 섹션이 달라도 시스템 프롬프트는 글자까지 같아야 한다
    const first = sectionSystemPrompt(inputFor(1));
    const second = sectionSystemPrompt(inputFor(2));
    assert.equal(first, second, "섹션이 달라도 시스템 프롬프트가 같아야 캐시가 걸린다");

    // 2) 옮기다 만 것이 아닌지 — 안정적인 내용이 실제로 system에 있고 user에는 없다
    assert.ok(first.includes("한빛싱크"), "사업 정보는 시스템 프롬프트에 있어야 한다");
    assert.ok(first.includes("정부지원사업 심사위원"), "플랜 유형 지침도 시스템 프롬프트에 있어야 한다");
    const user = buildUserPrompt(inputFor(1));
    assert.ok(!user.includes("한빛싱크"), "사업 정보가 사용자 프롬프트에 남으면 옮긴 의미가 없다");
    assert.ok(user.includes("답변 1"), "섹션별 답변은 사용자 프롬프트에 남아야 한다");

    // 3) 플랜이 다르면(사업 정보가 다르면) 시스템 프롬프트도 달라진다 — 캐시가 섞이면 안 된다
    const other = sectionSystemPrompt({ ...inputFor(1), business: { ...business, name: "다른가게" } });
    assert.notEqual(first, other, "사업이 다르면 시스템 프롬프트도 달라야 한다");

    // 4) cache를 켜면 Anthropic 요청의 system이 cache_control 붙은 블록 배열이어야 한다
    const anthropic: LLMConfig = { provider: "anthropic", apiKey: "sk-ant", model: "claude-sonnet-5" };
    mockOk();
    await completeText(anthropic, { system: "규칙", user: "질문", maxOutputTokens: 100, cache: true });
    const blocks = lastBody.system as Array<{ type?: string; text?: string; cache_control?: { type?: string } }>;
    assert.ok(Array.isArray(blocks), "cache를 켜면 system은 블록 배열이어야 한다");
    assert.equal(blocks[0].text, "규칙");
    assert.equal(blocks[0].cache_control?.type, "ephemeral", "마지막 블록에 캐시 표시가 있어야 한다");

    // 5) cache를 끄면 예전 그대로 문자열 — 한 번만 부르는 호출부가 쓰기 요금을 물지 않게
    mockOk();
    await completeText(anthropic, { system: "규칙", user: "질문", maxOutputTokens: 100 });
    assert.equal(typeof lastBody.system, "string", "cache가 꺼져 있으면 system은 문자열 그대로");

    // 6) OpenAI는 cache 옵션과 무관하게 기존 형태를 유지한다
    const openai: LLMConfig = { provider: "openai", apiKey: "sk-openai", model: "gpt-5.6-sol" };
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      lastBody = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      return new Response(JSON.stringify({ output_text: "좋습니다" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    await completeText(openai, { system: "규칙", user: "질문", maxOutputTokens: 100, cache: true });
    const input = lastBody.input as Array<{ role?: string; content?: string }>;
    assert.equal(input[0].role, "system");
    assert.equal(input[0].content, "규칙", "OpenAI 쪽 형태는 그대로여야 한다");

    /*
     * 7) 스트리밍 사용량은 두 이벤트에 나뉘어 온다 — 입력·캐시는 message_start,
     *    출력은 message_delta. 한쪽만 읽으면 요금의 대부분(출력)을 놓친다.
     *    실제 섹션 생성이 이 경로를 타므로 여기가 측정의 근거다.
     */
    const events = [
      { type: "message_start", message: { usage: { input_tokens: 900, cache_read_input_tokens: 1400, cache_creation_input_tokens: 0, output_tokens: 1 } } },
      { type: "content_block_delta", delta: { text: "본문" } },
      { type: "message_delta", usage: { output_tokens: 2600 } },
    ];
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const e of events) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`));
            controller.close();
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const logged: string[] = [];
    const realLog = console.log;
    console.log = (...args: unknown[]) => void logged.push(args.join(" "));
    try {
      await streamText(anthropic, { kind: "generate", system: "규칙", user: "질문", maxOutputTokens: 4000, cache: true }, () => {});
    } finally {
      console.log = realLog;
    }
    const line = logged.find((l) => l.includes("[llm] usage"));
    assert.ok(line, "스트리밍에서도 사용량이 남아야 한다");
    assert.match(line, /out=2600/, "출력 토큰(message_delta)이 빠지면 요금을 잴 수 없다");
    assert.match(line, /cache_read=1400/, "캐시 적중(message_start)도 같은 줄에 있어야 한다");
    assert.match(line, /in=900/);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("llm-cache.test.ts passed");
}

void main();
