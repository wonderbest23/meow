import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ANALYSIS_VERSION, analysisIsRunning, analysisResultSchema, validateAnalysisResult, type AnalysisPayload, type AnalysisResult } from "../lib/plan-builder/operating-analysis-contract";
import { analysisPayload, analysisRuntime, generateOperatingAnalysis, previewOperatingAnalysis, type AnalysisRequest, type AnalysisRuntime } from "../lib/plan-builder/operating-analysis-service";
import { OperatingError, oldInput, previousPeriod, referenceFor, reportMarkdown, type PeriodInput } from "../lib/plan-builder/operating-records";
import { loadOperatingRecords, saveOperatingRecords, updateOperatingRecords } from "../lib/plan-builder/operating-records-service";
import { normalizeState, savePlanState } from "../lib/plan-builder/plan-server-store";
import { COACH_KEY } from "../lib/plan-builder/coach";
import { emptyCoach } from "../lib/plan-builder/coach-job";

const input: PeriodInput = { start: "2026-08-01", end: "2026-08-07", metrics: { inquiries: null, orders: 0, revenue: 100000, expenses: 50000 }, feedback: "SECRET_FEEDBACK", keep: "SECRET_NOTE", change: "응대", nextAction: "원래 기록한 행동", successCriterion: "원래 확인 기준" };
function output(payload: AnalysisPayload): AnalysisResult { return { summary: "가상의 분석 요약", hypotheses: [{ title: "확인할 가설", explanation: "관찰만으로 원인을 단정할 수 없어요", uncertainty: "추가 확인 필요", evidenceIds: [payload.evidence[0].id] }], actions: [{ title: "다음 실험", hypothesisIndex: 0, action: "문의 응답 시간을 기록", successCriterion: "기간 종료 후 누락 확인" }], limitations: ["미검증 사용자 입력"] }; }
const mock: AnalysisRuntime = { target: { provider: "mock", model: "test-only" }, generate: async payload => ({ result: output(payload) }) };
async function seed() {
  const owner = randomUUID(), planId = randomUUID(), at = "2026-01-01T00:00:00.000Z";
  await savePlanState(owner, normalizeState({ plans: [{ id: planId, title: "가상 테스트 사업", planType: "일반 사업계획서", createdAt: at, updatedAt: at, answers: { [COACH_KEY]: { state: emptyCoach() }, secret: { value: "OTHER_PLAN_CONTENT" } }, sections: {} }] }));
  await saveOperatingRecords(owner, planId, { action: "save", id: randomUUID(), expectedRevision: null, input });
  const saved = await saveOperatingRecords(owner, planId, { action: "save", id: randomUUID(), expectedRevision: null, input: { ...input, start: "2026-08-08", end: "2026-08-21", metrics: { inquiries: 3, orders: 2, revenue: 150000, expenses: null } } });
  const period = saved.records.periods[0], baseline = previousPeriod(saved.records.periods, period);
  return { owner, planId, period, baseline, reference: referenceFor(period, baseline) };
}
async function prepare(f: Awaited<ReturnType<typeof seed>>, runtime = mock): Promise<AnalysisRequest> {
  const selection = { feedback: false, notes: false };
  const preview = await previewOperatingAnalysis(f.owner, f.planId, f.reference, selection, runtime);
  return { id: randomUUID(), reference: f.reference, selection, consent: { accepted: true, version: ANALYSIS_VERSION, hash: preview.hash, target: preview.target } };
}
async function rejectsCode(p: Promise<unknown>, code: string) { await assert.rejects(p, e => e instanceof OperatingError && e.code === code); }
async function main() {
  Object.assign(process.env, { PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPERATING_AI_ENABLED: "false" });
  assert.equal(analysisRuntime("test"), null, "real calls are disabled by default");
  const f = await seed();
  let calls = 0;
  const counted = { ...mock, generate: async (payload: AnalysisPayload) => { calls++; return mock.generate(payload); } };
  const request = await prepare(f, counted);
  assert.equal(calls, 0, "preview never calls AI");
  const minimal = analysisPayload("사업", f.period, f.baseline, request.selection);
  assert.ok(!JSON.stringify(minimal).includes("SECRET"));
  assert.ok(!JSON.stringify(minimal).includes("OTHER_PLAN_CONTENT"));
  assert.equal(minimal.evidence.find(e => e.id === "previous.orders")?.value, "0건");
  assert.equal(minimal.evidence.find(e => e.id === "previous.inquiries"), undefined);
  assert.equal(minimal.evidence.find(e => e.id === "comparison.revenue")?.value, "+50,000원");
  assert.ok(minimal.warnings.some(w => w.includes("길이")));
  assert.ok(JSON.stringify(analysisPayload("사업", f.period, f.baseline, { feedback: true, notes: false })).includes("SECRET_FEEDBACK"));
  assert.ok(!JSON.stringify(analysisPayload("사업", f.period, f.baseline, { feedback: true, notes: false })).includes("SECRET_NOTE"));
  assert.equal((z.toJSONSchema(analysisResultSchema).properties?.hypotheses as { maxItems: number }).maxItems, 3);
  const bad = output(minimal); bad.hypotheses[0].evidenceIds = ["invented.source"];
  assert.throws(() => validateAnalysisResult(bad, minimal), /ANALYSIS_EVIDENCE_INVALID/);
  const badIndex = output(minimal); badIndex.actions[0].hypothesisIndex = 2;
  assert.throws(() => validateAnalysisResult(badIndex, minimal), /ANALYSIS_EVIDENCE_INVALID/);
  assert.throws(() => validateAnalysisResult({ ...output(minimal), summary: "https://fake.example" }, minimal));
  await rejectsCode(generateOperatingAnalysis(f.owner, f.planId, { ...request, consent: { ...request.consent, accepted: false as true } }, counted), "ANALYSIS_CONSENT_REQUIRED");
  await rejectsCode(generateOperatingAnalysis(f.owner, f.planId, { ...request, selection: { feedback: true, notes: false } }, counted), "ANALYSIS_CONSENT_CHANGED");
  await rejectsCode(generateOperatingAnalysis(f.owner, f.planId, request, { ...counted, target: { provider: "mock", model: "changed-model" } }), "ANALYSIS_CONSENT_CHANGED");
  await rejectsCode(generateOperatingAnalysis("different-owner", f.planId, request, counted), "PLAN_NOT_FOUND");
  assert.equal(calls, 0);
  const completed = await generateOperatingAnalysis(f.owner, f.planId, request, counted);
  assert.equal(completed.records.analyses[0].status, "ready");
  await generateOperatingAnalysis(f.owner, f.planId, request, counted);
  assert.equal(calls, 1, "retry returns saved result without AI charge");
  await rejectsCode(generateOperatingAnalysis(f.owner, f.planId, { ...request, consent: { ...request.consent, hash: "a".repeat(64) } }, counted), "ANALYSIS_ID_REUSED");
  const archive = { action: "analysis-report" as const, id: randomUUID(), analysisId: request.id, chosenAction: { index: 0, action: "직접 수정한 다음 행동", successCriterion: "직접 수정한 확인 기준" } };
  const saved = await saveOperatingRecords(f.owner, f.planId, archive);
  assert.equal(saved.records.reports[0].source, "ai-assisted");
  assert.equal(saved.records.reports[0].analysis?.result?.actions[0].action, "문의 응답 시간을 기록");
  assert.equal(saved.records.reports[0].chosenAction?.action, archive.chosenAction.action);
  assert.equal(saved.records.periods[0].nextAction, input.nextAction, "selection does not mutate original notes");
  await saveOperatingRecords(f.owner, f.planId, archive);
  await rejectsCode(saveOperatingRecords(f.owner, f.planId, { ...archive, id: randomUUID() }), "REPORT_EXISTS");
  const updated = await saveOperatingRecords(f.owner, f.planId, { action: "save", id: f.period.id, expectedRevision: 1, input: { ...oldInput(f.period), feedback: "changed later" } });
  assert.deepEqual(updated.records.reports[0], saved.records.reports[0]);
  assert.match(reportMarkdown(updated.records.reports[0]), /로컬 모의 AI/);
  assert.match(reportMarkdown(updated.records.reports[0]), /직접 수정한 다음 행동/);
  await rejectsCode(saveOperatingRecords(f.owner, f.planId, { ...archive, id: randomUUID(), chosenAction: { ...archive.chosenAction, action: "another" } }), "PERIOD_CHANGED");
  await rejectsCode(generateOperatingAnalysis(f.owner, f.planId, { ...request, id: randomUUID() }, counted), "PERIOD_CHANGED");

  const race = await seed();
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let raceCalls = 0;
  const slow: AnalysisRuntime = { ...mock, generate: async payload => { raceCalls++; entered(); await gate; return { result: output(payload) }; } };
  const raceRequest = await prepare(race, slow);
  const first = generateOperatingAnalysis(race.owner, race.planId, raceRequest, slow);
  await enteredPromise;
  const replay = await generateOperatingAnalysis(race.owner, race.planId, raceRequest, slow);
  assert.equal(replay.records.analyses[0].status, "running");
  await rejectsCode(generateOperatingAnalysis(race.owner, race.planId, { ...raceRequest, id: randomUUID() }, slow), "ANALYSIS_BUSY");
  await saveOperatingRecords(race.owner, race.planId, { action: "save", id: race.period.id, expectedRevision: 1, input: { ...oldInput(race.period), change: "다른 탭 수정" } });
  release();
  const raced = await first;
  assert.equal(raceCalls, 1);
  assert.equal(raced.records.analyses[0].error, "source_changed");
  assert.equal(raced.records.periods[0].change, "다른 탭 수정");

  const failures = await seed();
  const failure: AnalysisRuntime = { ...mock, generate: async () => { throw new Error("quota_exhausted"); } };
  for (let i = 0; i < 3; i++) {
    const r = await prepare(failures, failure);
    const res = await generateOperatingAnalysis(failures.owner, failures.planId, r, failure);
    assert.equal(res.records.analyses[0].error, "quota_exhausted");
    assert.equal(res.records.reports.length, 0);
  }
  await rejectsCode(generateOperatingAnalysis(failures.owner, failures.planId, await prepare(failures, failure), failure), "ANALYSIS_DAILY_LIMIT");
  const invalid = await seed();
  const invalidRuntime: AnalysisRuntime = { ...mock, generate: async () => ({ result: { malformed: true } }) };
  const invalidResult = await generateOperatingAnalysis(invalid.owner, invalid.planId, await prepare(invalid, invalidRuntime), invalidRuntime);
  assert.equal(invalidResult.records.analyses[0].error, "invalid_response");
  assert.equal(invalidResult.records.periods.length, 2);
  await updateOperatingRecords(invalid.owner, invalid.planId, records => ({ ...records, revision: records.revision + 1, analyses: records.analyses.map(a => ({ ...a, status: "running", startedAt: new Date(Date.now() - 100000).toISOString() })) }));
  assert.equal(analysisIsRunning((await loadOperatingRecords(invalid.owner, invalid.planId)).records.analyses[0]), false);
  const recovered = await generateOperatingAnalysis(invalid.owner, invalid.planId, await prepare(invalid), mock);
  assert.equal(recovered.records.analyses[0].status, "ready", "expired job does not block explicit fresh consent");
  const originalFetch = globalThis.fetch;
  const envKeys = ["OPERATING_AI_ENABLED", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "PLANNING_MODEL"] as const;
  const before = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  let adapterCalls = 0;
  try {
    Object.assign(process.env, { OPERATING_AI_ENABLED: "true", OPENAI_API_KEY: "test-only-not-a-real-key", ANTHROPIC_API_KEY: "test-only-no-fallback", PLANNING_MODEL: "fixture-model" });
    // The real adapter is exercised behind an in-process fake fetch, never the network.
    globalThis.fetch = async (url, init) => {
      adapterCalls++;
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 4000);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.doesNotMatch(body.input[1].content, /SECRET|OTHER_PLAN_CONTENT/);
      assert.ok(init?.signal);
      return Response.json({ status: "completed", model: "fixture-model", output_text: JSON.stringify(output(JSON.parse(body.input[1].content))), usage: { input_tokens: 100, output_tokens: 80 } });
    };
    const liveAdapter = analysisRuntime("adapter-test")!;
    assert.equal(liveAdapter.target.provider, "openai");
    const response = await liveAdapter.generate(minimal);
    validateAnalysisResult(response.result, minimal);
    assert.equal(response.usage?.inputTokens, 100);
    globalThis.fetch = async url => { adapterCalls++; assert.equal(String(url), "https://api.openai.com/v1/responses"); return Response.json({ error: { code: "insufficient_quota" } }, { status: 429 }); };
    await assert.rejects(liveAdapter.generate(minimal), /quota_exhausted/);
    assert.equal(adapterCalls, 2, "quota failure does not retry or switch to an unconsented provider");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
  console.log("operating analysis: consent, minimization, provenance, idempotency, concurrency, source changes, immutable chosen-action reports, failures and limits passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
