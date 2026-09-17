// 구조 브리프가 실제 문서 생성에 반영되는지 확인하는 최소 실행기.
// 기본은 드라이런: 네트워크·키·장부 쓰기 없이 실제 요청 본문을 만들어 크기와 보수적 예약액을 계산한다.
// 실행: node --import tsx scripts/structure-brief-live.mts [--live --approved-total-usd=30]
// 유료 실행은 가상 사업 1건·문서 항목 1개·최대 2회 호출(생성 + 검토)로 고정하고 기존 누적 장부(artifacts/synthetic-ai-launch)를 그대로 쓴다.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { INDUSTRY_APPROVAL_ID, SyntheticAiBudget } from "./synthetic-ai-budget";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LEDGER = join(ROOT, "artifacts/synthetic-ai-launch");
const MODEL = "gpt-6-astra";
const RATE = { input: 25, output: 75 }; // synthetic-ai-budget.ts와 같은 보수적 단가(마이크로달러)
const NOTICE = "가상 검증 자료이며 실제 사업이나 계약이 아닙니다";
const SECTION = { chapterId: "funding", sectionId: "requirements" };
const MAX_CALLS = 2;
const args = process.argv.slice(2), live = args.includes("--live");
assert(args.every(arg => ["--live", "--approved-total-usd=30"].includes(arg)), "Unknown option");
assert(!live || args.includes("--approved-total-usd=30"), "Live requires explicit --approved-total-usd=30");

Object.assign(process.env, {
  NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  RATE_LIMIT_BACKEND: "memory", PLAN_ACCOUNT_LINKING_ENABLED: "false", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "1", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
});
const transport = globalThis.fetch;
globalThis.fetch = async url => { throw new Error(`network blocked while building the synthetic plan: ${String(url)}`); };

async function main() {
  const { saveIntakeCommand } = await import("../lib/plan-builder/intake-service");
  const { readCoach, coachContext } = await import("../lib/plan-builder/coach");
  const { loadPlanState } = await import("../lib/plan-builder/plan-server-store");
  const { withConfirmedIntakeContext } = await import("../lib/plan-builder/intake-context");
  const { PLAN_BLUEPRINT } = await import("../lib/plan-builder/blueprint");
  const { generateSection } = await import("../lib/plan-builder/section-generator");

  // 1) 가상 사업을 진단으로 만든다(AI 0회): 월 구독 카페, KSIC 56221, 구조 수정 1건, 손익 입력 완료
  const ownerHash = `structure-brief-${randomUUID()}`;
  const started = await saveIntakeCommand(ownerHash, { action: "start", mode: "startup", questionId: "business", value: "동네 원두 정기 구독 카페(가상 검증용)", revision: 0, requestId: randomUUID() }, { aiAvailable: false, aiAllowed: false });
  const planId = started.plan.id;
  const load = async () => (await loadPlanState(ownerHash)).plans.find(item => item.id === planId)!;
  const send = async (command: Record<string, unknown>) => saveIntakeCommand(ownerHash, { ...command, planId, revision: readCoach((await load()).answers)!.revision, requestId: randomUUID() } as never, { aiAvailable: false, aiAllowed: false });
  await send({ action: "answer", questionId: "industry", value: "food_beverage", ksic: "56221" });
  await send({ action: "structure", structure: { revenue: "subscription" } });
  for (const [questionId, value] of [["customer", "30대 직장인"], ["problem", "매일 커피 사는 비용이 부담"], ["offer", "월 구독 커피 패스"], ["channel", "매장 방문, 인스타그램"], ["price", "30000원"], ["budget", "1000만원"], ["hoursPerWeek", "40시간"], ["capacity", "대표자 혼자 / 한 달 100명"], ["goal", "6개월 안에 구독자 100명"]]) await send({ action: "answer", questionId, value });
  await send({ action: "details" });
  for (const [questionId, value] of [["structure.retentionMonths", "12개월"], ["structure.unitCost", "9000원"], ["structure.cost", "150만원"]]) await send({ action: "answer", questionId, value });
  const plan = await load(), coach = readCoach(plan.answers)!;

  // 2) 운영 경로(app/api/plan/generate)와 같은 방식으로 생성 입력을 만든다
  const chapter = PLAN_BLUEPRINT.find(item => item.id === SECTION.chapterId)!, section = chapter.sections.find(item => item.id === SECTION.sectionId)!;
  const input = withConfirmedIntakeContext({
    chapter, section, planTitle: coach.business.name, planType: plan.planType,
    business: { ...coach.business, description: `${NOTICE}. ${coach.business.description}` },
    answers: { supplied_conditions: `${NOTICE}. 준비 예산 1,000만원으로 월 구독형 매장 카페를 시작하려는 구상. 자금 사용처와 시작 전 확인할 일을 정리한다.`, editorial_scope: "결론과 근거 및 다음 행동을 짧게 정리하는 검증용 문서 항목. 전체 상세 계획서가 아니며 600자 이내를 목표로 합니다." },
    coachContext: coachContext(coach),
  }, plan.answers);
  const context = JSON.parse(String(input.intakeContext ?? "{}")) as { structure?: { source: string; revenueModel: unknown; licenseChecklist: unknown; capitalPlan: unknown } | null };
  assert(context.structure, "the structure brief must be in the generation input");

  // 3) 드라이런: 실제 요청 본문을 가로채 크기와 예약 상한을 계산한다(전송 없음)
  const captured: Array<{ bytes: number; maxOutput: number }> = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body)) as { max_output_tokens: number; input: Array<{ content: string }> };
    assert(body.input.some(item => item.content.includes("licenseChecklist") && item.content.includes("capitalPlan") && item.content.includes("revenueModel")), "the request must carry the three structure sections");
    captured.push({ bytes: Buffer.byteLength(JSON.stringify({ ...body, store: false, service_tier: "default" })), maxOutput: body.max_output_tokens });
    throw new Error("DRY_RUN_REQUEST_CAPTURED_NOT_SENT");
  };
  const config = { provider: "openai" as const, model: MODEL, apiKey: "dry-run-no-key" };
  const dry = await generateSection(config, input);
  assert.equal(dry.source, "failed"); assert(captured.length >= 1, "production generator built no request");
  const first = captured[0];
  // 검토 호출은 생성 결과가 더해져 더 크다: 생성 요청 크기 + 출력 상한(바이트 환산 4배) 으로 잡는다.
  const perCall = (bytes: number, maxOutput: number) => Math.ceil((bytes + 16384) * RATE.input + maxOutput * RATE.output);
  const boundMicros = perCall(first.bytes, first.maxOutput) + perCall(first.bytes + first.maxOutput * 4, Math.max(first.maxOutput, 2400));
  const ledger = JSON.parse(await readFile(join(LEDGER, "budget.json"), "utf8")) as { limitMicros: number; calls: Array<{ reservedMicros: number }> };
  const reserved = ledger.calls.reduce((sum, call) => sum + call.reservedMicros, 0), remaining = Math.min(30_000_000, ledger.limitMicros) - reserved;
  const report = { mode: live ? "live" : "dry-run", section: `${SECTION.chapterId}/${SECTION.sectionId}`, model: MODEL, structureSource: context.structure.source, requestBytes: first.bytes, maxOutputTokens: first.maxOutput,
    reserveUpperBoundUsd: boundMicros / 1e6, ledgerCalls: ledger.calls.length, ledgerReservedUsd: reserved / 1e6, remainingUsd: remaining / 1e6, fits: boundMicros <= remaining };
  console.log(JSON.stringify(report, null, 2));
  if (!live) return;
  assert(report.fits, "reservation does not fit the approved cumulative budget; stop and ask for approval");

  // 4) 유료 실행: 키는 .env.local의 OPENAI_API_KEY 하나만 읽고, 장부가 모든 호출을 선예약한다. 최대 2회.
  config.apiKey = parseEnv(await readFile(join(ROOT, ".env.local"), "utf8")).OPENAI_API_KEY ?? "";
  assert(config.apiKey && config.apiKey !== "dry-run-no-key", "local OpenAI key required");
  const budget = new SyntheticAiBudget(LEDGER, 30, { id: INDUSTRY_APPROVAL_ID, additionalUsd: 20 });
  const before = budget.summary();
  let sent = 0;
  const guarded = budget.wrap(transport);
  globalThis.fetch = async (url, init) => { if (++sent > MAX_CALLS) throw new Error("call cap reached"); return guarded(url, init); };
  try {
    const result = await generateSection(config, input);
    const after = budget.summary();
    const markdown = result.markdown;
    const checks = {
      capitalItems: ["보증금", "임차", "인테리어", "설비", "재고", "재료", "운전자금", "홍보"].filter(word => markdown.includes(word)),
      licensing: ["신고", "등록", "확인 필요", "인허가", "구청", "위생"].filter(word => markdown.includes(word)),
      revenueModel: ["구독", "월 30,000원", "30,000원", "손익분기", "유지"].filter(word => markdown.includes(word)),
      suppliedNumbers: ["1,000만원", "10,000,000", "150만원", "1,500,000", "4,500,000"].filter(word => markdown.includes(word)),
    };
    const directory = join(ROOT, "artifacts/structure-brief-live", new Date().toISOString().replace(/[:.]/g, "-"));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({ notice: NOTICE, report, source: result.source, calls: sent, reservedUsdThisRun: after.reservedUpperBoundUsd - before.reservedUpperBoundUsd, checks, structure: context.structure, markdown }, null, 2));
    console.log(JSON.stringify({ source: result.source, calls: sent, reservedUsdThisRun: after.reservedUpperBoundUsd - before.reservedUpperBoundUsd, checks, directory }, null, 2));
    console.log("----- markdown -----\n" + markdown);
  } finally { budget.close(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
