import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { IntakeCommand, IntakeSnapshot } from "../lib/plan-builder/intake-types";
import type { IntakeQuestion } from "../lib/plan-builder/intake-questions";

/**
 * 표본 사업 10종이 창업 진단(기본 11개 + 상세 팩)을 칩·프리셋·금액 사다리만으로 완주하는지 본다.
 * 타이핑이 필요한 질문이 하나라도 나오면 실패한다. AI 호출과 네트워크는 0이어야 한다.
 */
type Command = Omit<IntakeCommand, "planId" | "revision" | "requestId">;
const SAMPLES: Array<{ name: string; text: string; ksic: string[] }> = [
  { name: "네일샵", text: "동네 네일샵을 열려고 해요", ksic: ["96119"] },
  { name: "이사업체", text: "1인 가구 소형 이사업체를 하려고 해요", ksic: ["49302", "49309"] },
  { name: "반찬가게", text: "반찬가게를 열고 싶어요", ksic: ["47223"] },
  { name: "온라인 영어과외", text: "온라인 영어 과외를 하려고 해요", ksic: ["85631", "85632"] },
  { name: "굿즈 스마트스토어", text: "굿즈 스마트스토어를 운영하려고 해요", ksic: ["47912"] },
  { name: "소규모 SaaS", text: "소규모 팀용 예약 관리 SaaS를 만들고 있어요", ksic: ["58222"] },
  { name: "촬영 스튜디오", text: "촬영 스튜디오를 열려고 해요", ksic: ["73301", "73302"] },
  { name: "공유오피스", text: "공유오피스를 열려고 해요", ksic: ["68112"] },
  { name: "퀵배송", text: "퀵배송 대행을 시작하려고 해요", ksic: ["49402"] },
  { name: "부품 제조", text: "산업용 부품을 소량 가공해 납품하려고 해요", ksic: ["25924", "25929"] },
];

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", RATE_LIMIT_BACKEND: "memory",
    PLAN_ACCOUNT_LINKING_ENABLED: "false", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "1", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
  });
  const network: string[] = [];
  globalThis.fetch = async url => { network.push(String(url)); throw new Error(`network blocked: ${String(url)}`); };
  const { saveIntakeCommand } = await import("../lib/plan-builder/intake-service");
  const { readCoach } = await import("../lib/plan-builder/coach");
  const { loadPlanState } = await import("../lib/plan-builder/plan-server-store");
  const { amountRanges, numberPresets, numberAnswer, CHIP_GROUPS } = await import("../lib/plan-builder/intake-options");

  const failures: string[] = [];
  let passed = 0;
  for (const sample of SAMPLES) {
    try {
      const ownerHash = `intake-coverage-${randomUUID()}`;
      const started = await saveIntakeCommand(ownerHash, { action: "start", mode: "startup", questionId: "business", value: sample.text, revision: 0, requestId: randomUUID() }, { aiAvailable: false, aiAllowed: false });
      const planId = started.plan.id;
      const send = async (command: Command): Promise<IntakeSnapshot> => {
        const plan = (await loadPlanState(ownerHash)).plans.find(item => item.id === planId)!;
        const revision = readCoach(plan.answers)!.revision;
        return (await saveIntakeCommand(ownerHash, { ...command, planId, revision, requestId: randomUUID() }, { aiAvailable: false, aiAllowed: false })).snapshot;
      };
      const typedOnly: string[] = [];
      const chipAnswer = (question: IntakeQuestion, snapshot: IntakeSnapshot): Command => {
        if (question.id === "industry") {
          const candidate = snapshot.ksicCandidates.find(item => sample.ksic.includes(item.code)) ?? snapshot.ksicCandidates[0];
          assert.ok(candidate, `${sample.name}: the business text yields a KSIC candidate`);
          assert.ok(sample.ksic.includes(candidate.code), `${sample.name}: expected ${sample.ksic.join("/")}, candidates ${snapshot.ksicCandidates.map(item => item.code).join(",")}`);
          return { action: "answer", questionId: "industry", value: candidate.sector, ksic: candidate.code };
        }
        const options = question.options ?? [];
        if (question.kind === "single") { if (!options.length) typedOnly.push(question.id); return { action: "answer", questionId: question.id, value: options[0]?.value ?? "" }; }
        if (question.kind === "multi") { if (!options.length) typedOnly.push(question.id); return { action: "answer", questionId: question.id, value: [options[0]?.value ?? ""] }; }
        if (question.kind === "number") {
          if (question.unit === "원") {
            const basis = options.find(option => option.group === CHIP_GROUPS.priceBasis)?.label;
            const ranges = amountRanges(snapshot.intake.sector, question.id, snapshot.intake.mode, basis);
            if (!ranges.length) typedOnly.push(question.id);
            // 사다리에서 양수 하한을 고른다(하한 저장). 가격·변동비가 모두 양수라 손익분기가 계산된다.
            // 변동비는 '0원' 칩(디지털·서비스처럼 거의 없음)을, 그 외 금액은 양수 하한을 고른다. 두 값이 같으면 공헌이익이 0이라 손익분기가 나오지 않는다.
            const range = question.id === "structure.unitCost" ? ranges[0] : ranges.find(item => (item.min ?? 0) > 0) ?? ranges[0];
            return { action: "answer", questionId: question.id, value: `${range?.min ?? range?.max ?? 0}원` };
          }
          const presets = numberPresets(question);
          if (!presets.length) typedOnly.push(question.id);
          return { action: "answer", questionId: question.id, value: numberAnswer(presets[Math.min(2, presets.length - 1)] ?? 1, question.unit) };
        }
        if (!options.length) { typedOnly.push(question.id); return { action: "answer", questionId: question.id, value: `입력 ${question.label}` }; }
        if (question.id === "capacity") {
          const label = (group: string) => options.find(option => option.group === group)?.label ?? "";
          return { action: "answer", questionId: "capacity", value: `${label(CHIP_GROUPS.people)} / ${label(CHIP_GROUPS.period)} ${numberPresets({ id: "capacity" })[3]}${label(CHIP_GROUPS.unit)}` };
        }
        const groups = [...new Set(options.map(option => option.group ?? ""))];
        return { action: "answer", questionId: question.id, value: groups.map(group => options.find(option => (option.group ?? "") === group)!.label).join(" / ") };
      };
      let snapshot = started.snapshot, guard = 0;
      while (snapshot.nextQuestion && guard++ < 40) snapshot = await send(chipAnswer(snapshot.nextQuestion, snapshot));
      assert.ok(snapshot.coreComplete, `${sample.name}: core complete after ${guard} answers`);
      snapshot = await send({ action: "details" });
      while (snapshot.nextQuestion && guard++ < 80) snapshot = await send(chipAnswer(snapshot.nextQuestion, snapshot));
      assert.equal(snapshot.nextQuestion, null, `${sample.name}: details complete`);
      assert.deepEqual(typedOnly, [], `${sample.name}: every question offered chips, presets or a ladder`);
      assert.ok(sample.ksic.includes(snapshot.intake.ksic ?? ""), `${sample.name}: KSIC stored ${snapshot.intake.ksic}`);
      assert.equal(snapshot.structure?.summary.length, 5, `${sample.name}: structure summary`);
      assert.ok(snapshot.financialSummary.includes("손익분기"), `${sample.name}: ${snapshot.financialSummary}`);
      assert.ok(snapshot.summary.length >= 11, `${sample.name}: summary rows ${snapshot.summary.length}`);
      passed++;
      console.log(`PASS ${sample.name}: KSIC ${snapshot.intake.ksic} · ${snapshot.structure?.summary.join(" · ")} · ${snapshot.questions.length}문항`);
    } catch (error) {
      failures.push(sample.name);
      console.error(`FAIL ${sample.name}`, error);
    }
  }
  assert.deepEqual(network, [], "no network or AI calls");
  console.log(`business-intake-coverage: ${passed}/${SAMPLES.length} sample businesses completed with chips, presets and ladders only (AI 0회)`);
  if (failures.length) process.exit(1);
}

main().catch(error => { console.error(error); process.exit(1); });
