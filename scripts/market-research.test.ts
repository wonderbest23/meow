import assert from "node:assert/strict";
import { researchOfficialMarketEvidence } from "../lib/market/openai-research";
import type { ProjectRecord } from "../lib/service-domain";

const project = {
  title: "지역 돌봄 연결",
  opportunity: {
    title: "지역 돌봄 연결",
    sector: "생활 서비스",
    customer: "맞벌이 가정",
    oneLiner: "갑작스러운 돌봄 공백을 지역 파트너와 연결합니다.",
    model: "지역 연결",
    revenue: "건별 수수료",
  },
  businessSetup: { region: "서울특별시", archetype: "digital_service" },
} as unknown as ProjectRecord;

const officialUrl = "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_TEST";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({
  output: [
    { type: "web_search_call", action: { sources: [{ url: officialUrl, title: "국가통계포털 공식 통계표" }] } },
    {
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({ evidence: [
          {
            title: "서울 맞벌이 가구 통계",
            metric: "맞벌이 가구 수",
            value: "123,456가구",
            numericValue: 123456,
            unit: "가구",
            region: "서울특별시",
            sourceName: "국가통계포털",
            sourceUrl: officialUrl,
            observedAt: "2025-12-31",
            note: "전체 가구가 실제 구매 고객은 아닙니다.",
            sourceExcerpt: "지역별 맞벌이 가구를 집계한 공식 통계표입니다.",
          },
          {
            title: "인용되지 않은 숫자",
            metric: "가상 시장 규모",
            value: "999만명",
            numericValue: 9990000,
            unit: "명",
            region: "전국",
            sourceName: "임의 자료",
            sourceUrl: "https://example.com/fake",
            observedAt: "2025-12-31",
            note: "저장되면 안 됩니다.",
            sourceExcerpt: "공식 인용이 없는 자료입니다.",
          },
        ] }),
        annotations: [{ type: "url_citation", url: officialUrl, title: "국가통계포털 공식 통계표" }],
      }],
    },
  ],
}), { status: 200, headers: { "Content-Type": "application/json" } });

const evidenceJson = (payload: string) => JSON.parse(payload);
const openaiFetch = globalThis.fetch;

async function main() {
  try {
    const result = await researchOfficialMarketEvidence(project, {
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-5.6-sol",
    });
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].sourceUrl, officialUrl);
    assert.equal(result.evidence[0].verification, "needs_review");
    assert.equal(result.evidence[0].verificationMethod, "none");
    assert.equal(result.evidence[0].numericValue, 123456);
    assert.equal(result.evidence[0].isDemo, false);
    assert.match(result.evidence[0].contentHash, /^[a-f0-9]{64}$/);

    // Claude 웹 검색: pause_turn 뒤 이어서 요청하고, 실제 검색 결과에 있는 공식 주소만 인정한다.
    const openaiBody = await (await openaiFetch("https://api.openai.com/v1/responses")).json() as { output: Array<{ content?: Array<{ text?: string }> }> };
    const answerJson = openaiBody.output[1].content![0].text!;
    const requests: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).includes("api.anthropic.com"), "Claude 설정이면 Anthropic으로 요청");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      const tools = body.tools as Array<{ type: string; allowed_domains: string[] }>;
      assert.equal(tools[0].type, "web_search_20260209");
      assert.ok(tools[0].allowed_domains.includes("kosis.kr"), "공식 도메인으로 검색 제한");
      if (requests.length === 1) {
        return Response.json({ stop_reason: "pause_turn", content: [
          { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "서울 맞벌이 가구" } },
          { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [{ type: "web_search_result", url: officialUrl, title: "국가통계포털 공식 통계표" }] },
        ] });
      }
      const messages = body.messages as Array<{ role: string }>;
      assert.deepEqual(messages.map(item => item.role), ["user", "assistant"], "pause_turn이면 받은 응답을 붙여 이어서 요청");
      return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: answerJson }] });
    };
    const claude = await researchOfficialMarketEvidence(project, { provider: "anthropic", apiKey: "test-key", model: "claude-opus-5-5" });
    assert.equal(requests.length, 2);
    assert.equal(claude.evidence.length, 1, "인용되지 않은 주소(example.com)는 버린다");
    assert.equal(claude.evidence[0].sourceUrl, officialUrl);
    assert.equal(claude.model, "claude-opus-5-5");
    assert.ok(evidenceJson(answerJson).evidence.length === 2);

    console.log(JSON.stringify({
      passed: true,
      savedEvidence: result.evidence.length,
      rejectedUncitedEvidence: true,
      claudeWebSearchWithPauseTurn: true,
      verification: result.evidence[0].verification,
    }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
