/*
 * 사업계획서 품질 시험 실행기 — 운영과 같은 경로(상담 답변 → 사업 방향 정리 → 문서 설계도 → 장 작성)를 그대로 밟고 채점한다.
 * 기준: docs/사업계획서-품질기준-최종본-2026-10-09.md
 *
 * 기본은 가짜 AI(0원) — 배선 확인용. 실제 AI는 --spend --yes 를 함께 줘야만 쓴다(Opus로 작성, Sonnet으로 채점).
 * 운영 DB는 절대 쓰지 않는다(PERSISTENCE_MODE=demo-memory, Supabase 환경값 제거).
 *
 *   node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/plan-eval/run.mts                # 가짜 AI, 20개 전부
 *   node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/plan-eval/run.mts --cases bakery,senior-match
 *   ANTHROPIC_API_KEY=… node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/plan-eval/run.mts --spend --yes
 *   옵션: --sections market/personas,financials/expenses,summary/roadmap,summary/executive  --legacy  --no-ai-grade  --dump-prompts  --key-from <.env 파일>  --out <폴더>
 *         --max-krw 30000  실제 원가 누적이 이 금액에 닿으면 다음 사업을 시작하지 않는다(기본 3만 원)
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : undefined; };
const spend = flag("spend");
/*
 * 기본은 지금 운영 방식(v3 지시문 + 돈 장 + 실행 장, 2026-10-10 채택. 생활비 질문은 2026-10-28 계획서 품질 Q3로 뺐다).
 * --legacy: 예전 지시문(PLAN_SECTION_PROMPT=v1)과 예전 손익표(PLAN_CASHFLOW_SCENARIOS=0)로 — 바꾸기 전과 비교하는 용도.
 * 실행 장은 장 목록에 들어가 있어 legacy 에서도 남는다. 시험 사업의 livingCost 답은 묻는 질문이 없어 쓰이지 않는다.
 */
const legacy = flag("legacy");
const variant = legacy ? "legacy" : "current";
if (legacy) Object.assign(process.env, { PLAN_SECTION_PROMPT: "v1", PLAN_CASHFLOW_SCENARIOS: "0" });
if (spend && !flag("yes")) throw new Error("실제 AI 비용이 듭니다. --spend --yes 를 함께 주세요.");

// ---- 환경: 운영 DB 차단, AI 제공자 고정 ------------------------------------------------------------
for (const key of Object.keys(process.env)) if (/^SUPABASE|DATABASE_URL/.test(key)) delete process.env[key];
process.env.PERSISTENCE_MODE = "demo-memory";
process.env.LLM_TEXT_PROVIDER = "anthropic";
if (spend) {
  const file = option("key-from");
  if (!process.env.ANTHROPIC_API_KEY && file) {
    const line = readFileSync(file, "utf8").split("\n").find(item => item.startsWith("ANTHROPIC_API_KEY="));
    if (line) process.env.ANTHROPIC_API_KEY = line.slice("ANTHROPIC_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY 가 없습니다(--key-from 으로 .env 파일을 지정할 수 있어요).");
} else {
  process.env.ANTHROPIC_API_KEY = "synthetic-not-a-real-key";
  await import("../synthetic-e2e/fake-anthropic.mjs");
}

/*
 * --capture-prompts: 사업 방향 정리·설계도만 실제 AI로 돌리고, 장 작성·검토는 가짜로 넘기면서 장마다 보낼 지시문을 모은다.
 * 모은 지시문으로 세션 안의 Claude가 장을 써서 API 비용 없이 지시문을 비교한다(compose-prompts.mts, grade-files.mts).
 * 장 작성 요청(시스템 지시문에 <role>·<sources>)과 검토·고치기 요청(사용자 쪽이 {"source"…})만 가짜로 보낸다.
 */
const capture = flag("capture-prompts");
const captured: Record<string, { system: string; user: string }> = {};
/*
 * --offline <폴더>: 사업 방향 정리·설계도(사업마다 두 번)도 실제 AI 대신 파일 답을 쓴다(0원).
 * 답 파일이 없는 요청은 '<폴더>/<사업>/call-N.request.json'으로 남기고 가짜 답으로 넘어간다.
 * 세션 안의 Claude가 그 요청에 답해 'call-N.response.txt'를 쓰고 다시 돌리면 다음 요청(설계 답을 받은 설계도)으로 넘어간다.
 */
const offlineDir = option("offline");
const offlineMissing: string[] = [];
let offlineCase = "", offlineCall = 0;
if (capture) {
  if (!spend && !offlineDir) throw new Error("--capture-prompts 는 사업 방향 정리·설계도에 실제 AI가 필요합니다(--spend --yes, 또는 --offline <폴더>).");
  const real = globalThis.fetch;
  await import("../synthetic-e2e/fake-anthropic.mjs");
  const fake = globalThis.fetch;
  const text = (value: unknown) => (typeof value === "string" ? value : Array.isArray(value) ? value.map(block => (block as { text?: string }).text ?? "").join("\n") : "");
  globalThis.fetch = async (input, init) => {
    if (String(input instanceof Request ? input.url : input).includes("api.anthropic.com") && typeof init?.body === "string") {
      const body = JSON.parse(init.body) as { system?: unknown; messages?: Array<{ content: unknown }> };
      const system = text(body.system), user = text(body.messages?.[0]?.content);
      const key = user.match(/작성할 장: [^\n]*\(([a-z]+\/[a-z]+)\)/)?.[1];
      if (key && system.includes("<role>") && system.includes("<sources>")) {
        captured[key] = { system, user };
        // 다음 묶음의 지시문도 모으려면 이 장이 저장돼야 한다 — 품질 검사를 통과하는 자리 글을 돌려준다
        const placeholder = `## ${key} 자리\n\n[[CHAPTER:${key}]] 세션에서 쓸 본문 자리입니다. 근거는 입력 자료이고, 다음 행동은 확인입니다.`;
        return new Response(JSON.stringify({ id: "capture", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: placeholder }], stop_reason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (user.trimStart().startsWith('{"source"')) return fake(input, init);
      if (offlineDir) {
        const base = join(offlineDir, offlineCase, `call-${++offlineCall}`);
        if (existsSync(`${base}.response.txt`)) {
          const answer = readFileSync(`${base}.response.txt`, "utf8").trim();
          return new Response(JSON.stringify({ id: "offline", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: answer }], stop_reason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
        }
        const { messages: _messages, system: _system, ...rest } = body as Record<string, unknown>;
        mkdirSync(join(offlineDir, offlineCase), { recursive: true });
        writeFileSync(`${base}.request.json`, JSON.stringify({ settings: rest, system, user }, null, 1));
        offlineMissing.push(`${base}.request.json`);
        return fake(input, init);
      }
    }
    return real(input, init);
  };
}

// --dump-prompts: AI에 실제로 보낸 지시문을 파일로 남긴다(프롬프트를 고치기 전후 비교용, 키 값은 남기지 않음)
const promptDumps: Array<{ model?: string; system?: unknown; messages?: unknown }> = [];
if (flag("dump-prompts")) {
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input instanceof Request ? input.url : input).includes("api.anthropic.com") && typeof init?.body === "string") {
      try { const body = JSON.parse(init.body); promptDumps.push({ model: body.model, system: body.system, messages: body.messages }); } catch { /* 본문이 JSON이 아니면 건너뜀 */ }
    }
    return inner(input, init);
  };
}

const { EVAL_CASES } = await import("./cases");
const { gradeByCode, MUST_PASS } = await import("./grade-code");
const { gradeByAi, AI_ITEMS, RUBRIC } = await import("./grade-ai");
const { saveIntakeCommand, executeIntakeJob } = await import("../../lib/plan-builder/intake-service");
const { loadPlanState, savePlanState } = await import("../../lib/plan-builder/plan-server-store");
const { generatePlanOutline, generateAndSaveSection, intakeFinancialTable } = await import("../../lib/plan-builder/section-service");
const { chaptersForType, financialTableOwner } = await import("../../lib/plan-builder/blueprint");
const { readCoach, coachContext } = await import("../../lib/plan-builder/coach");
const { planFinancialReference } = await import("../../lib/plan-builder/intake-core");
const { sectionWaves, SECTION_CONCURRENCY } = await import("../../lib/plan-builder/section-waves");
const { setLlmUsageListener } = await import("../../lib/llm/usage");
const { rowCostUsd, krwPerUsd } = await import("../../lib/llm/cost");

// ---- 실제 원가: 호출마다 토큰(캐시 포함)을 요금표로 원화 환산해 모은다 ----------------------------------
const MAX_KRW = Number(option("max-krw") ?? 30000);
const KRW_PER_USD = krwPerUsd();
type Call = { kind: string; model: string | null; ok: boolean; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; krw: number | null };
const calls: Call[] = [];
setLlmUsageListener(entry => {
  const usd = spend ? rowCostUsd({ kind: entry.kind, model: entry.model, ok: entry.ok, input_tokens: entry.inputTokens, output_tokens: entry.outputTokens, cache_read_tokens: entry.cacheReadTokens, cache_write_tokens: entry.cacheWriteTokens, created_at: "" }) : 0;
  calls.push({ ...entry, krw: usd === null ? null : usd * KRW_PER_USD });
});
function costOf(list: Call[]) {
  return {
    krw: Math.round(list.reduce((sum, call) => sum + (call.krw ?? 0), 0)),
    calls: list.length, failed: list.filter(call => !call.ok).length,
    unpriced: list.filter(call => call.krw === null && call.inputTokens + call.outputTokens > 0).length,
    inputTokens: list.reduce((sum, call) => sum + call.inputTokens, 0), outputTokens: list.reduce((sum, call) => sum + call.outputTokens, 0),
    cacheReadTokens: list.reduce((sum, call) => sum + call.cacheReadTokens, 0),
  };
}

const SECTIONS = (option("sections") ?? "market/personas,financials/expenses,summary/roadmap,summary/executive").split(",");
const only = option("cases")?.split(",");
const cases = EVAL_CASES.filter(item => !only || only.includes(item.id));
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = option("out") ?? join(".tmp-e2e", "plan-eval", `${runId}-${variant}${spend ? "" : "-fake"}`);
mkdirSync(join(outDir, "expert"), { recursive: true });

const sectionCount = SECTIONS[0] === "all" ? 10 : SECTIONS.length;
if (spend) console.log(`[plan-eval] 실제 AI: 사업 ${cases.length}개 × (사업 방향 1 + 설계도 1 + 장 ${sectionCount}개 + 채점 1). 장 1개 약 430원 기준 예상 약 ${Math.round(cases.length * (sectionCount * 430 + 300) / 1000)}천 원 · 상한 ${MAX_KRW.toLocaleString()}원`);

type Case = typeof EVAL_CASES[number];
async function runCase(c: Case) {
  const owner = `plan-eval-${c.id}-${runId}`, log: string[] = [];
  const save = (command: Record<string, unknown>, options?: { aiAvailable?: boolean; aiAllowed?: boolean }) => saveIntakeCommand(owner, { requestId: randomUUID(), ...command } as never, options);
  let result = await save({ action: "start", mode: c.mode, revision: 0 });
  let snapshot = result.snapshot;
  const planId = snapshot.planId;
  // 상담: 질문마다 사업의 답을 넣고, 없는 답은 '잘 모르겠어요'
  for (let turn = 0; turn < 40 && snapshot.nextQuestion; turn++) {
    const question = snapshot.nextQuestion;
    const base = { action: "answer", planId, revision: snapshot.coach.revision, questionId: question.id };
    let command: Record<string, unknown>;
    // 업종 확인(사업 설명이 고른 업종과 다를 때, sector_check) — 업종을 정해 둔 사업은 [그대로], 아니면 [바꾸기]
    if (snapshot.sectorSuggestion && question.id !== "industry" && question.id !== "business") {
      result = await save(c.sector ? { action: "sector-keep", planId, revision: snapshot.coach.revision } : { ...base, questionId: "industry", value: snapshot.sectorSuggestion.sector });
      log.push(`업종 확인: ${c.sector ? "그대로" : `${snapshot.sectorSuggestion.label}(으)로 바꿈`}`);
      snapshot = result.snapshot; continue;
    }
    if (question.id === "industry") {
      const sector = c.sector ?? snapshot.ksicCandidates?.[0]?.sector ?? "general";
      const ksic = snapshot.ksicCandidates?.find(item => item.sector === sector)?.code;
      command = { ...base, value: sector, ...(ksic ? { ksic } : {}) };
    } else if (c.answers[question.id] !== undefined) command = { ...base, value: c.answers[question.id] };
    else command = { ...base, unknown: true };
    try { result = await save(command); }
    catch (error) {
      log.push(`answer ${question.id} 실패(${error instanceof Error ? error.message : error}) → 잘 모르겠어요`);
      result = await save({ ...base, unknown: true });
    }
    snapshot = result.snapshot;
  }
  log.push(`상담 ${snapshot.coreAnswered}/${snapshot.coreTotal}`);
  // 사업 방향 정리(1단계 결과)
  result = await save({ action: "design", planId, revision: snapshot.coach.revision }, { aiAvailable: true, aiAllowed: true });
  if (result.job) await executeIntakeJob({ ownerHash: owner, planId, jobId: result.job.id });
  // 사업계획서: 화면의 '사업계획서 만들기'와 같은 준비(장마다 답 자리) 뒤 설계도 → 장 작성
  const state = await loadPlanState(owner), plan = state.plans.find(item => item.id === planId)!;
  const allKeys = chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => ({ chapterId: chapter.id, sectionId: section.id })));
  for (const { chapterId, sectionId } of allKeys) plan.answers[`${chapterId}/${sectionId}`] ??= { planning_source: "사업 기획 대화의 공통 정보" };
  await savePlanState(owner, state);
  const outline = await generatePlanOutline({ ownerHash: owner, planId, sections: allKeys });
  // --sections all: 계획서 전체(장 순서대로). 실제 서비스처럼 4개씩 묶어 쓰고 실행 요약은 마지막 묶음(section-workflow.ts)
  const keys = SECTIONS[0] === "all" ? allKeys.map(item => `${item.chapterId}/${item.sectionId}`) : SECTIONS.filter(key => allKeys.some(item => `${item.chapterId}/${item.sectionId}` === key));
  for (const wave of sectionWaves(keys, outline.ok && outline.outline ? SECTION_CONCURRENCY : 1)) {
    await Promise.all(wave.map(key => { const [chapterId, sectionId] = key.split("/"); return generateAndSaveSection({ ownerHash: owner, planId, chapterId, sectionId, ...(outline.ok && outline.outline ? { outline: outline.outline } : {}) }).catch(error => { log.push(`장 ${key} 실패: ${error instanceof Error ? error.message : error}`); }); }));
  }
  // 결과 모으기
  const final = (await loadPlanState(owner)).plans.find(item => item.id === planId)!, coach = readCoach(final.answers)!;
  const sections = Object.fromEntries(keys.map(key => [key, final.sections[key]?.markdown ?? ""]));
  const tableKey = financialTableOwner(final.planType);
  const source = [coachContext(coach, planFinancialReference(coach, final.answers)), tableKey ? intakeFinancialTable(final, coach, tableKey) ?? "" : ""].join("\n");
  const num = (key: string) => typeof c.answers[key] === "number" ? c.answers[key] as number : undefined;
  const facts = { price: num("price"), unitCost: num("structure.unitCost"), fixedCost: num("structure.cost"), budget: num("budget"), hoursPerWeek: num("hoursPerWeek") };
  const code = gradeByCode({ caseId: c.id, sections, source, facts });
  const factsText = Object.entries(c.answers).map(([key, value]) => `${key}: ${value}`).join("\n");
  const graded = flag("no-ai-grade") || !spend || capture ? null : await gradeByAi({ provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY!, model: "claude-sonnet-5-5" }, { caseLabel: c.label, facts: factsText, sections });
  if (capture) {
    const dir = join(outDir, "capture", c.id);
    mkdirSync(dir, { recursive: true });
    const waves = sectionWaves(keys, outline.ok && outline.outline ? SECTION_CONCURRENCY : 1);
    writeFileSync(join(dir, "capture.json"), JSON.stringify({ caseId: c.id, label: c.label, waves, prompts: captured, financials: tableKey ? { key: tableKey, markdown: intakeFinancialTable(final, coach, tableKey) ?? "" } : null, facts, source }, null, 1));
  }
  return { id: c.id, label: c.label, tags: c.tags, design: !!coach.design, title: final.title, sections, code, ai: graded?.scores ?? null, aiReasons: graded?.reasons ?? null, log };
}

const results = [];
let stoppedAt: string | null = null;
for (const c of cases) {
  // 상한: 사업 하나가 끝날 때마다 누적 원가를 보고, 닿았으면 다음 사업을 시작하지 않는다
  if (spend && costOf(calls).krw >= MAX_KRW) { stoppedAt = c.id; console.log(`[plan-eval] 상한 ${MAX_KRW.toLocaleString()}원에 닿아 ${c.id}부터 멈춤`); break; }
  const started = Date.now(), before = calls.length;
  offlineCase = c.id; offlineCall = 0;
  let entry;
  try { entry = await runCase(c); }
  catch (error) { entry = { id: c.id, label: c.label, tags: c.tags, error: error instanceof Error ? error.message : String(error) }; }
  // 실패한 사업도 그때까지 쓴 원가를 남긴다
  const cost = costOf(calls.slice(before));
  results.push({ ...entry, cost });
  console.log(`[plan-eval] ${c.id} ${Math.round((Date.now() - started) / 1000)}초 · ${cost.krw.toLocaleString()}원(호출 ${cost.calls}${cost.unpriced ? `, 요금 미확인 ${cost.unpriced}` : ""}) · 누적 ${costOf(calls).krw.toLocaleString()}원 / 상한 ${MAX_KRW.toLocaleString()}원`);
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 1));
}
writeFileSync(join(outDir, "calls.json"), JSON.stringify(calls, null, 1));
if (promptDumps.length) writeFileSync(join(outDir, "prompts.json"), JSON.stringify(promptDumps, null, 1));

// ---- 보고서: 사업 × 항목 표, 반드시 통과 항목, AI 점수 평균 -----------------------------------------
const mark = (pass: boolean | null) => pass === null ? "–" : pass ? "○" : "×";
const ok = results.filter((item): item is Extract<typeof item, { code: unknown }> => "code" in item);
const codeItems = ok[0]?.code.map(item => item.item) ?? [];
const lines = [
  `# 사업계획서 품질 시험 결과 (${spend ? "실제 AI" : "가짜 AI — 배선 확인용, 점수 의미 없음"})`,
  "", `- 실행: ${runId} · ${legacy ? "예전 방식(비교용)" : "지금 방식"} · 사업 ${results.length}개 · 장: ${SECTIONS.join(", ")}`, `- 기준: docs/사업계획서-품질기준-최종본-2026-10-09.md`, "",
  "## 코드 채점(○ 통과 · × 실패 · – 입력 부족)", "",
  `| 사업 | ${codeItems.map(item => `${item}${MUST_PASS.includes(item) ? "*" : ""}`).join(" | ")} | 반드시 통과 |`,
  `| --- | ${codeItems.map(() => "---").join(" | ")} | --- |`,
  ...ok.map(item => `| ${item.label} | ${item.code.map(result => mark(result.pass)).join(" | ")} | ${item.code.filter(result => MUST_PASS.includes(result.item)).every(result => result.pass !== false) ? "통과" : "실패"} |`),
  "", "\\* 반드시 통과 항목", "",
  "## 항목별 통과율", "",
  ...codeItems.map(item => { const rows = ok.map(entry => entry.code.find(result => result.item === item)!).filter(result => result.pass !== null); return `- ${item}. ${rows[0]?.name ?? ""}: ${rows.filter(result => result.pass).length}/${rows.length}`; }),
  "", "## AI 채점 평균(1~5)", "",
  ...(ok.some(item => item.ai) ? AI_ITEMS.map(item => { const scores = ok.map(entry => entry.ai?.[item]).filter((score): score is number => typeof score === "number"); return `- ${item}. ${RUBRIC[item].name}: ${scores.length ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2) : "–"}`; }) : ["- (가짜 AI 실행이라 채점하지 않음)"]),
  "", "## 실제 원가(요금표 × 토큰, 1달러 " + KRW_PER_USD.toLocaleString() + "원)", "",
  ...(spend ? [
    `- 합계 ${costOf(calls).krw.toLocaleString()}원 · 호출 ${calls.length}건${stoppedAt ? ` · 상한에 닿아 ${stoppedAt}부터 실행 안 함` : ""}`, "",
    "| 사업 | 원 | 호출 | 입력 토큰 | 출력 토큰 |", "| --- | --- | --- | --- | --- |",
    ...results.map(item => `| ${item.label} | ${item.cost.krw.toLocaleString()} | ${item.cost.calls} | ${item.cost.inputTokens.toLocaleString()} | ${item.cost.outputTokens.toLocaleString()} |`),
    "", "| 단계(kind) | 원 | 호출 |", "| --- | --- | --- |",
    ...[...new Set(calls.map(call => call.kind))].map(kind => { const cost = costOf(calls.filter(call => call.kind === kind)); return `| ${kind} | ${cost.krw.toLocaleString()} | ${cost.calls} |`; }),
  ] : ["- (가짜 AI 실행이라 0원)"]),
  "", "## 세부", "",
  ...ok.flatMap(item => [`### ${item.label}`, ...item.code.map(result => `- ${result.item}. ${result.name}: ${mark(result.pass)} — ${result.detail}`), ...(item.log.length ? [`- 기록: ${item.log.join(" / ")}`] : []), ""]),
  ...results.filter(item => "error" in item).map(item => `- 실패: ${item.label} — ${(item as { error: string }).error}`),
];
writeFileSync(join(outDir, "report.md"), lines.join("\n"));

// ---- 전문가 검토지: AI 채점이 전문가 판단과 맞는지 확인하는 용도(최종본 3장 5번) ----------------------
for (const item of ok) {
  const sheet = [
    `# 전문가 검토지 — ${item.label}`, "",
    "이 계획서는 정부 지원사업 제출용이 아니라, 창업자 본인이 보고 바로 실행하려고 산 문서입니다. 각 항목을 1~5점으로 매겨 주세요(1·3·5점 설명 참고).", "",
    "| 항목 | 1점 | 3점 | 5점 | 점수 |", "| --- | --- | --- | --- | --- |",
    ...AI_ITEMS.map(id => `| ${id}. ${RUBRIC[id].name} | ${RUBRIC[id].anchors[0]} | ${RUBRIC[id].anchors[1]} | ${RUBRIC[id].anchors[2]} |  |`),
    "", "## 창업자 답변", "", ...Object.entries(EVAL_CASES.find(entry => entry.id === item.id)!.answers).map(([key, value]) => `- ${key}: ${value}`),
    "", "## 계획서", "", ...Object.entries(item.sections).flatMap(([key, markdown]) => [`### [${key}]`, "", markdown || "(작성 실패)", ""]),
  ];
  writeFileSync(join(outDir, "expert", `${item.id}.md`), sheet.join("\n"));
}
console.log(`[plan-eval] 완료 → ${join(outDir, "report.md")}`);
if (offlineMissing.length) console.log(`[plan-eval] 파일 답이 없는 요청 ${offlineMissing.length}개 — 각 사업의 가장 앞 번호부터 답을 쓰고 다시 돌리세요:\n${offlineMissing.join("\n")}`);
