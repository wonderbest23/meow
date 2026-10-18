// 실제 AI 시험 전용 — api.anthropic.com 호출마다 모델·토큰·걸린 시간·원가를 줄 단위(JSONL)로 남기고, 누적 원가가 상한에 닿으면 더 부르지 않는다.
// NODE_OPTIONS="--import <이 파일>" 로 서버에 붙인다. 키 값은 읽지도 남기지도 않는다.
//   LLM_USAGE_LOG=<파일>  LLM_MAX_KRW=<상한 원>(기본 20000)  AI_COST_KRW_PER_USD(기본 1400)
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const real = globalThis.fetch;
const LOG = process.env.LLM_USAGE_LOG || "/tmp/llm-usage.jsonl";
const MAX_KRW = Number(process.env.LLM_MAX_KRW) || 20000;
const RATE = Number(process.env.AI_COST_KRW_PER_USD) || 1400;
// 100만 토큰당 달러(lib/llm/cost.ts 와 같은 값) — 입력 · 출력 · 캐시 읽기
const PRICES = [["claude-opus-5-5", 4, 20, 0.2], ["claude-opus-5", 5, 25, 0.5], ["claude-sonnet-5-5", 2, 10, 0.2], ["claude-haiku", 1, 5, 0.1]];
const priceOf = model => PRICES.find(([p]) => String(model).startsWith(p)) ?? [model, 5, 25, 0.5];

let spentKrw = 0;
if (existsSync(LOG)) for (const line of readFileSync(LOG, "utf8").split("\n")) { try { spentKrw += JSON.parse(line).krw ?? 0; } catch { /* 빈 줄 */ } }

function costKrw(model, u) {
  const [, input, output, cacheRead] = priceOf(model);
  const usd = ((u.input_tokens ?? 0) * input + (u.output_tokens ?? 0) * output + (u.cache_read_input_tokens ?? 0) * cacheRead + (u.cache_creation_input_tokens ?? 0) * input * 1.25) / 1e6;
  return Math.round(usd * RATE * 10) / 10;
}

function usageFromSse(text) {
  const usage = {};
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const event = JSON.parse(line.slice(5));
      Object.assign(usage, event.message?.usage ?? {}, event.usage ?? {});
    } catch { /* 이벤트가 아닌 줄 */ }
  }
  return usage;
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (!url.startsWith("https://api.anthropic.com/")) return real(input, init);
  let body = {}; try { body = JSON.parse(init?.body ?? "{}"); } catch { /* 본문 없음 */ }
  const system = Array.isArray(body.system) ? body.system.map(b => b.text).join("\n") : String(body.system ?? "");
  const tag = system.replace(/\s+/g, " ").slice(0, 70);
  if (spentKrw >= MAX_KRW) {
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), blocked: true, tag, spentKrw }) + "\n");
    return new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: `test budget ${MAX_KRW} KRW reached` } }), { status: 429, headers: { "content-type": "application/json" } });
  }
  const started = Date.now();
  const response = await real(input, init);
  const copy = response.clone();
  void copy.text().then(text => {
    let usage = {};
    if ((response.headers.get("content-type") ?? "").includes("event-stream")) usage = usageFromSse(text);
    else { try { usage = JSON.parse(text).usage ?? {}; } catch { /* 오류 본문 */ } }
    const krw = response.ok ? costKrw(body.model, usage) : 0;
    spentKrw += krw;
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), status: response.status, model: body.model, maxTokens: body.max_tokens, stream: !!body.stream, ms: Date.now() - started, input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0, krw, total: Math.round(spentKrw), tag, error: response.ok ? undefined : text.slice(0, 200) }) + "\n");
  }).catch(() => { /* 기록 실패는 호출에 영향 없음 */ });
  return response;
};
