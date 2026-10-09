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
 *   옵션: --sections market/personas,financials/expenses,summary/executive  --no-ai-grade  --key-from <.env 파일>  --out <폴더>
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : undefined; };
const spend = flag("spend");
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

const { EVAL_CASES } = await import("./cases");
const { gradeByCode, MUST_PASS } = await import("./grade-code");
const { gradeByAi, AI_ITEMS, RUBRIC } = await import("./grade-ai");
const { saveIntakeCommand, executeIntakeJob } = await import("../../lib/plan-builder/intake-service");
const { loadPlanState, savePlanState } = await import("../../lib/plan-builder/plan-server-store");
const { generatePlanOutline, generateAndSaveSection, intakeFinancialTable } = await import("../../lib/plan-builder/section-service");
const { chaptersForType, financialTableOwner } = await import("../../lib/plan-builder/blueprint");
const { readCoach, coachContext } = await import("../../lib/plan-builder/coach");
const { planFinancialReference } = await import("../../lib/plan-builder/intake-core");

const SECTIONS = (option("sections") ?? "market/personas,financials/expenses,summary/executive").split(",");
const only = option("cases")?.split(",");
const cases = EVAL_CASES.filter(item => !only || only.includes(item.id));
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = option("out") ?? join(".tmp-e2e", "plan-eval", `${runId}${spend ? "" : "-fake"}`);
mkdirSync(join(outDir, "expert"), { recursive: true });

if (spend) console.log(`[plan-eval] 실제 AI: 사업 ${cases.length}개 × (사업 방향 1 + 설계도 1 + 장 ${SECTIONS.length}개 + 채점 1). 장 1개 약 430원 기준 예상 약 ${Math.round(cases.length * (SECTIONS.length * 430 + 300) / 1000)}천 원`);

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
  const keys = SECTIONS.filter(key => allKeys.some(item => `${item.chapterId}/${item.sectionId}` === key));
  await Promise.all(keys.map(key => { const [chapterId, sectionId] = key.split("/"); return generateAndSaveSection({ ownerHash: owner, planId, chapterId, sectionId, ...(outline.ok && outline.outline ? { outline: outline.outline } : {}) }).catch(error => { log.push(`장 ${key} 실패: ${error instanceof Error ? error.message : error}`); }); }));
  // 결과 모으기
  const final = (await loadPlanState(owner)).plans.find(item => item.id === planId)!, coach = readCoach(final.answers)!;
  const sections = Object.fromEntries(keys.map(key => [key, final.sections[key]?.markdown ?? ""]));
  const tableKey = financialTableOwner(final.planType);
  const source = [coachContext(coach, planFinancialReference(coach, final.answers)), tableKey ? intakeFinancialTable(final, coach, tableKey) ?? "" : ""].join("\n");
  const num = (key: string) => typeof c.answers[key] === "number" ? c.answers[key] as number : undefined;
  const facts = { price: num("price"), unitCost: num("structure.unitCost"), fixedCost: num("structure.cost"), budget: num("budget"), hoursPerWeek: num("hoursPerWeek") };
  const code = gradeByCode({ caseId: c.id, sections, source, facts });
  const factsText = Object.entries(c.answers).map(([key, value]) => `${key}: ${value}`).join("\n");
  const ai = flag("no-ai-grade") || !spend ? null : await gradeByAi({ provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY!, model: "claude-sonnet-5-5" }, { caseLabel: c.label, facts: factsText, sections });
  return { id: c.id, label: c.label, tags: c.tags, design: !!coach.design, title: final.title, sections, code, ai, log };
}

const results = [];
for (const c of cases) {
  const started = Date.now();
  try { results.push(await runCase(c)); }
  catch (error) { results.push({ id: c.id, label: c.label, tags: c.tags, error: error instanceof Error ? error.message : String(error) }); }
  console.log(`[plan-eval] ${c.id} ${Math.round((Date.now() - started) / 1000)}초`);
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 1));
}

// ---- 보고서: 사업 × 항목 표, 반드시 통과 항목, AI 점수 평균 -----------------------------------------
const mark = (pass: boolean | null) => pass === null ? "–" : pass ? "○" : "×";
const ok = results.filter((item): item is Extract<typeof item, { code: unknown }> => "code" in item);
const codeItems = ok[0]?.code.map(item => item.item) ?? [];
const lines = [
  `# 사업계획서 품질 시험 결과 (${spend ? "실제 AI" : "가짜 AI — 배선 확인용, 점수 의미 없음"})`,
  "", `- 실행: ${runId} · 사업 ${results.length}개 · 장: ${SECTIONS.join(", ")}`, `- 기준: docs/사업계획서-품질기준-최종본-2026-10-09.md`, "",
  "## 코드 채점(○ 통과 · × 실패 · – 입력 부족)", "",
  `| 사업 | ${codeItems.map(item => `${item}${MUST_PASS.includes(item) ? "*" : ""}`).join(" | ")} | 반드시 통과 |`,
  `| --- | ${codeItems.map(() => "---").join(" | ")} | --- |`,
  ...ok.map(item => `| ${item.label} | ${item.code.map(result => mark(result.pass)).join(" | ")} | ${item.code.filter(result => MUST_PASS.includes(result.item)).every(result => result.pass !== false) ? "통과" : "실패"} |`),
  "", "\\* 반드시 통과 항목", "",
  "## 항목별 통과율", "",
  ...codeItems.map(item => { const rows = ok.map(entry => entry.code.find(result => result.item === item)!).filter(result => result.pass !== null); return `- ${item}. ${rows[0]?.name ?? ""}: ${rows.filter(result => result.pass).length}/${rows.length}`; }),
  "", "## AI 채점 평균(1~5)", "",
  ...(ok.some(item => item.ai) ? AI_ITEMS.map(item => { const scores = ok.map(entry => entry.ai?.[item]).filter((score): score is number => typeof score === "number"); return `- ${item}. ${RUBRIC[item].name}: ${scores.length ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2) : "–"}`; }) : ["- (가짜 AI 실행이라 채점하지 않음)"]),
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
