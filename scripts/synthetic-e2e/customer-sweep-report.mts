// AI 손님 전수 점검 정리 — customer-sweep.mts 결과 폴더를 읽어 기계 점검을 세고, 심사 결과를 AI 한 번으로 같은 원인끼리 묶어 심각한 순서로 정리한다.
//   LLM_TEXT_PROVIDER=anthropic LLM_MAX_KRW=25000 LLM_USAGE_LOG=tmp/sweep-harness.jsonl NODE_OPTIONS="--import ./scripts/synthetic-e2e/llm-usage-logger.mjs" \
//   node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/synthetic-e2e/customer-sweep-report.mts <결과 폴더>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const root = process.cwd();
const { completeJson } = await import(root + "/lib/llm/complete.ts");
const { resolveTextLLMConfig } = await import(root + "/lib/llm/config.ts");
const llm = resolveTextLLMConfig("customer-sweep-report");
if (!llm) throw new Error("no AI config");
const dir = process.argv[2];
if (!dir) throw new Error("result folder required");

const runs = readdirSync(dir).filter(f => /^[soe]\d\d-.*\.json$/.test(f)).map(f => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
const n = runs.length;
const count = (pred: (r: any) => boolean) => runs.filter(pred).map(r => r.id);
const avg = (key: string) => { const v = runs.map(r => r.judge?.scores?.[key]).filter((x: unknown) => typeof x === "number"); return v.length ? Math.round(v.reduce((a: number, b: number) => a + b, 0) / v.length * 10) / 10 : null; };
const understandMs = runs.map(r => r.mech?.understand?.ms).filter((x: unknown) => typeof x === "number").sort((a: number, b: number) => a - b);
const mech = {
  personas: n,
  reachedDirection: count(r => r.mech?.reachedDirection).length,
  noDirection: count(r => !r.mech?.reachedDirection),
  httpErrors: runs.filter(r => r.mech?.httpErrors?.length).map(r => ({ id: r.id, errors: r.mech.httpErrors })),
  jobFailures: runs.filter(r => r.mech?.jobFailures?.length).map(r => ({ id: r.id, failures: r.mech.jobFailures })),
  understandNot200: runs.filter(r => r.mech?.understand && r.mech.understand.status !== 200).map(r => ({ id: r.id, ...r.mech.understand })),
  understandMs: understandMs.length ? { min: understandMs[0], median: understandMs[Math.floor(understandMs.length / 2)], max: understandMs[understandMs.length - 1] } : null,
  repeatedQuestions: runs.filter(r => r.mech?.repeatedQuestions?.length).map(r => ({ id: r.id, q: r.mech.repeatedQuestions })),
  hints: runs.filter(r => r.mech?.hints?.length).map(r => ({ id: r.id, hints: r.mech.hints })),
  costAbovePrice: runs.filter(r => r.mech?.costAbovePrice).map(r => ({ id: r.id, ...r.mech.costAbovePrice })),
  guestLimit: count(r => r.mech?.guestLimit),
  conflicts: runs.reduce((a, r) => a + (r.mech?.conflicts ?? 0), 0),
  ended: Object.entries(runs.reduce((a: Record<string, number>, r) => { const k = r.mech?.ended ?? "?"; a[k] = (a[k] ?? 0) + 1; return a; }, {})),
  avgSeconds: Math.round(runs.reduce((a, r) => a + (r.mech?.ms ?? 0), 0) / Math.max(1, n) / 1000),
  scores: { values: avg("values"), listening: avg("listening"), hope: avg("hope"), clarity: avg("clarity"), flow: avg("flow") },
  findings: runs.reduce((a, r) => a + (r.judge?.findings?.length ?? 0), 0),
};
const flat = runs.flatMap(r => (r.judge?.findings ?? []).map((f: any) => ({ persona: r.id, ...f })));
writeFileSync(`${dir}/_mech.json`, JSON.stringify(mech, null, 1));

const RULES = `너는 '오늘창업' 품질 책임자다. AI 손님 ${n}명이 실제 화면 흐름대로 대화했고, 심사 AI가 대화마다 문제를 적었다. 이 문제들을 같은 원인끼리 묶어 손님에게 미치는 영향이 큰 순서로 정리하라.
- 같은 원인(같은 기능·같은 규칙에서 나오는 것)은 하나로 묶는다. 묶음마다 몇 명의 손님에게서 나왔는지 센다.
- 한 명에게만 나온 것도 심각하면(틀린 법 정보, 돈 계산 오류, 막힘) 남긴다. 사소하고 한 번뿐인 것은 '기타'로 모은다.
- 심사 AI가 잘못 본 것(기록과 맞지 않거나 서비스 탓이 아닌 것)으로 보이면 doubt 에 적는다.
- cause 는 어느 기능에서 생기는지(첫 문장 읽기·채운 값, 질문 입력 해석, 방향 뒤 대화창, AI 답, 사업 방향 글, 계산, 화면 안내 등)와 짐작되는 이유.
- fix 는 규칙을 하나씩 덧대는 땜질이 아니라 구조적으로 고치는 방향(AI가 읽고 판단하게 하기 등)을 한두 문장으로.
- 묶음은 많아야 15개. examples 는 묶음마다 2개까지. what·cause·fix 는 각각 한 문장으로 짧게.
- 쉬운 한국어로 쓴다. 영어·전문 용어를 쓰지 않는다.
출력은 JSON 객체 하나만: {"groups": [{"title": "...", "severity": "high|medium|low", "personas": ["id", ...], "what": "손님이 겪은 일", "examples": [{"persona": "id", "quote": "기록 그대로"}], "cause": "...", "fix": "...", "doubt": ""}], "strengths": ["잘된 점"], "overall": "전체 한두 문장"}`;
const user = `[기계 점검]\n${JSON.stringify(mech)}\n\n[심사 결과 ${flat.length}개]\n${flat.map(f => JSON.stringify({ p: f.persona, c: f.category, s: f.severity, w: f.where, q: String(f.quote ?? "").slice(0, 220), problem: f.problem })).join("\n")}\n\n[잘한 점]\n${runs.flatMap(r => (r.judge?.good ?? []).map((g: string) => `${r.id}: ${g}`)).join("\n")}`;
const grouped = await completeJson(llm, { system: RULES, user, maxOutputTokens: 16000, effort: "medium", kind: "sweep-report", timeoutMs: 600_000 });
writeFileSync(`${dir}/_groups.json`, JSON.stringify(grouped, null, 1));
console.log(JSON.stringify({ mech: { ...mech, httpErrors: mech.httpErrors.length, jobFailures: mech.jobFailures.length, hints: mech.hints.length }, groups: (grouped as any)?.groups?.map((g: any) => `${g.severity} ${g.personas?.length} ${g.title}`) }, null, 1));
