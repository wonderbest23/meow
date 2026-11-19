/*
 * 로컬 모델(LM Studio)로 일반 모드 AI 읽기 시험 100문제를 푼다. 사이트 코드는 읽기만 한다.
 *  - 지시문: 사이트의 READER_RULES 그대로
 *  - 입력: 사이트와 같은 모양 JSON.stringify({ asking, table, message }) (message 는 1200자까지)
 *  - 답 모양: 사이트와 같은 JSON 스키마(facts_update)로 강제
 *  - 검사: 사이트의 checkReaderResult 그대로
 * 사용: tsx run-local.mts <LM Studio 모델 키> <이름> [--no-think]
 * 결과: out-<이름>.json(시간 제한 없음), out-<이름>-5s.json(사이트처럼 5초 넘으면 빈 결과), times-<이름>.json
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = process.env.MEOW_REPO || `${process.env.HOME}/Developer/meow-main`;
const { READER_RULES, READER_FIELDS, READER_MAX_INPUT, checkReaderResult } = await import(`${REPO}/lib/plan-builder/intake-reader.ts`);
const { z } = createRequire(`${REPO}/package.json`)("zod");

const here = dirname(fileURLToPath(import.meta.url));
const [model, name] = process.argv.slice(2);
const noThink = process.argv.includes("--no-think");
if (!model || !name) { console.error("사용: tsx run-local.mts <모델 키> <이름> [--no-think]"); process.exit(1); }
const BASE = process.env.LMSTUDIO_URL || "http://localhost:1234/v1";
const SITE_TIMEOUT_MS = 5_000;

/* 사이트 intake-reader.ts 의 readerSchema 와 같은 모양(그 파일은 스키마를 내보내지 않아 같은 정의로 만든다) */
const fieldEnum = z.enum(READER_FIELDS);
const readerSchema = z.object({
  intent: z.enum(["answer", "question", "none"]),
  updates: z.array(z.object({ field: fieldEnum, value: z.union([z.string(), z.number()]), quote: z.string() })),
  unknown: z.array(fieldEnum), ask: z.array(fieldEnum),
});
const schema = z.toJSONSchema(readerSchema);

type Case = { id: number; asking: string | null; table: Record<string, string>; message: string };
const cases: Case[] = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));

async function ask(c: Case): Promise<{ raw: unknown; ms: number; error?: string; tokens?: number }> {
  const started = performance.now();
  const body: Record<string, unknown> = {
    model, temperature: 0, max_tokens: 800, stream: false,
    messages: [
      { role: "system", content: READER_RULES },
      { role: "user", content: JSON.stringify({ asking: c.asking, table: c.table, message: c.message.slice(0, READER_MAX_INPUT) }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "facts_update", strict: true, schema } },
    ...(noThink ? { reasoning_effort: "none", chat_template_kwargs: { enable_thinking: false } } : {}),
  };
  try {
    const res = await fetch(`${BASE}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    const json: any = await res.json();
    const ms = performance.now() - started;
    if (!res.ok) return { raw: null, ms, error: `HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}` };
    /* LM Studio 가 Qwen 의 JSON 답을 reasoning_content 칸에 넣고 content 를 비우는 경우가 있어, 비었으면 그 칸을 읽는다 */
    const message = json.choices?.[0]?.message ?? {};
    const text: string = (message.content || "").trim() ? message.content : (message.reasoning_content ?? "");
    const cleaned = text.replace(/^[\s\S]*<\/think>/, "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try { return { raw: JSON.parse(cleaned), ms, tokens: json.usage?.completion_tokens }; }
    catch { return { raw: null, ms, error: `JSON 아님: ${text.slice(0, 120)}`, tokens: json.usage?.completion_tokens }; }
  } catch (e) { return { raw: null, ms: performance.now() - started, error: String(e) }; }
}

await ask(cases[0]); // 데우기(첫 호출은 시간에 넣지 않음)
const out: unknown[] = [], out5: unknown[] = [], times: unknown[] = [], raws: unknown[] = [], outFix: unknown[] = [];
const EMPTY = { intent: "none", updates: [], unknown: [], ask: [] };
for (const c of cases) {
  const r = await ask(c);
  const checked = r.raw ? checkReaderResult(r.raw, c.message.slice(0, READER_MAX_INPUT)) : EMPTY;
  raws.push({ id: c.id, raw: r.raw });
  /* 참고용(공식 점수 아님): 고친 칸·모름·되물음이 있는데 intent 를 "none" 으로 붙인 실수만 "answer" 로 바꿔서 검사 */
  const raw: any = r.raw;
  const fixable = raw && raw.intent === "none" && ((raw.updates?.length ?? 0) + (raw.unknown?.length ?? 0) + (raw.ask?.length ?? 0)) > 0;
  outFix.push({ id: c.id, ...(fixable ? checkReaderResult({ ...raw, intent: "answer" }, c.message.slice(0, READER_MAX_INPUT)) : checked) });
  out.push({ id: c.id, ...checked });
  out5.push({ id: c.id, ...(r.ms <= SITE_TIMEOUT_MS ? checked : EMPTY) });
  times.push({ id: c.id, ms: Math.round(r.ms), tokens: r.tokens, ...(r.error ? { error: r.error } : {}) });
  process.stdout.write(`${c.id}:${(r.ms / 1000).toFixed(1)}s${r.error ? "!" : ""} `);
}
writeFileSync(join(here, `out-${name}.json`), JSON.stringify(out, null, 1));
writeFileSync(join(here, `out-${name}-5s.json`), JSON.stringify(out5, null, 1));
writeFileSync(join(here, `times-${name}.json`), JSON.stringify(times, null, 1));
writeFileSync(join(here, `raw-${name}.json`), JSON.stringify(raws, null, 1));
writeFileSync(join(here, `out-${name}-intentfix.json`), JSON.stringify(outFix, null, 1));
const ms = (times as { ms: number }[]).map(t => t.ms).sort((a, b) => a - b);
const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
const p95 = ms[Math.ceil(ms.length * 0.95) - 1];
console.log(`\n${name}: 평균 ${(avg / 1000).toFixed(2)}초, p95 ${(p95 / 1000).toFixed(2)}초, 가장 느림 ${(ms[ms.length - 1] / 1000).toFixed(2)}초, 5초 넘음 ${ms.filter(x => x > SITE_TIMEOUT_MS).length}개, 오류 ${(times as { error?: string }[]).filter(t => t.error).length}개`);
