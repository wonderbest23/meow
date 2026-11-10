import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * 한 문장 → 바로 초안: 사업 문장 하나로 창업 핵심 질문이 모두 채워지는지 본다(AI·네트워크 0).
 * 기준표는 업종마다 '감당하는 양으로 본전을 넘길 수 있는' 숫자여야 한다 — 첫 초안이 적자 계획으로 시작하지 않게.
 */
async function main() {
  Object.assign(process.env, {
    NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", RATE_LIMIT_BACKEND: "memory",
    PLAN_ACCOUNT_LINKING_ENABLED: "false", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "1", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", INTAKE_ESTIMATE: "1",
  });
  const network: string[] = [];
  globalThis.fetch = async url => { network.push(String(url)); throw new Error(`network blocked: ${String(url)}`); };
  const { saveIntakeCommand } = await import("../lib/plan-builder/intake-service");
  const { readCoach } = await import("../lib/plan-builder/coach");
  const { loadPlanState } = await import("../lib/plan-builder/plan-server-store");
  const { SECTOR_BASELINES, estimateIntake } = await import("../lib/plan-builder/intake-estimate");
  const { monthlyVolumeFromCapacity } = await import("../lib/plan-builder/coach-feasibility");
  const off = { aiAvailable: false, aiAllowed: false };

  for (const [sector, base] of Object.entries(SECTOR_BASELINES)) {
    const volume = monthlyVolumeFromCapacity(base.capacity)?.volume ?? 0;
    assert.ok(volume * (base.price - base.unitCost) > base.cost, `${sector}: 감당하는 양으로 월 고정비를 넘긴다`);
  }
  assert.deepEqual(estimateIntake("동네 네일샵을 열려고 해요"), estimateIntake("동네 네일샵을 열려고 해요"), "같은 문장이면 같은 짐작");

  for (const text of ["동네 네일샵을 열려고 해요", "반찬가게를 열고 싶어요", "굿즈 스마트스토어를 운영하려고 해요", "소규모 팀용 예약 관리 SaaS를 만들고 있어요", "무언가 새로 해 보려고 해요"]) {
    const ownerHash = `intake-estimate-${randomUUID()}`;
    const { plan, snapshot } = await saveIntakeCommand(ownerHash, { action: "start", mode: "startup", questionId: "business", value: text, revision: 0, requestId: randomUUID() }, off);
    assert.equal(snapshot.coreComplete, true, `${text}: 한 문장으로 핵심 질문이 모두 채워진다`);
    const coach = readCoach(plan.answers)!;
    assert.equal(coach.fields.find(field => field.key === "business")?.basis, "user");
    for (const key of ["customer", "problem", "offer", "channel", "price", "unitCost", "cost", "capacity", "goal"]) assert.equal(coach.fields.find(field => field.key === key)?.basis, "proposal", `${text}: ${key} 는 제안으로 표시된다`);
    assert.ok(!coach.fields.some(field => field.key === "budget" || field.key === "hoursPerWeek"), "예산·시간은 짐작하지 않는다");
    assert.equal(coach.messages.filter(message => message.role === "user").length, 1, "짐작을 사용자가 말한 것처럼 대화에 넣지 않는다");

    // 사용자가 답하면 그 답이 짐작을 이긴다
    const send = async (command: Record<string, unknown>) => {
      const current = (await loadPlanState(ownerHash)).plans.find(item => item.id === plan.id)!;
      return saveIntakeCommand(ownerHash, { ...command, planId: plan.id, revision: readCoach(current.answers)!.revision, requestId: randomUUID() } as never, off);
    };
    const priced = await send({ action: "answer", questionId: "price", value: "9,900원" });
    const price = readCoach(priced.plan.answers)!.fields.find(field => field.key === "price")!;
    assert.deepEqual([price.basis, price.value], ["user", "9900원"]);
  }
  assert.deepEqual(network, [], "네트워크 호출 0");
  console.log("intake-estimate: 5 businesses drafted from one sentence (AI 0회)");
}

main().catch(error => { console.error(error); process.exit(1); });
