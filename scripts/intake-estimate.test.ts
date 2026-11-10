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
  const { BUSINESS_KINDS } = await import("../lib/plan-builder/business-kinds");
  const { monthlyVolumeFromCapacity } = await import("../lib/plan-builder/coach-feasibility");
  const off = { aiAvailable: false, aiAllowed: false };

  for (const [sector, base] of Object.entries(SECTOR_BASELINES)) {
    const volume = monthlyVolumeFromCapacity(base.capacity)?.volume ?? 0;
    assert.ok(volume * (base.price - base.unitCost) > base.cost, `${sector}: 감당하는 양으로 월 고정비를 넘긴다`);
  }
  for (const [test, kind] of BUSINESS_KINDS) {
    const volume = monthlyVolumeFromCapacity(kind.capacity)?.volume ?? 0;
    assert.ok(volume * (kind.price - kind.unitCost) > kind.cost, `${test}: 감당하는 양으로 월 고정비를 넘긴다`);
  }
  assert.deepEqual(estimateIntake("동네 네일샵을 열려고 해요"), estimateIntake("동네 네일샵을 열려고 해요"), "같은 문장이면 같은 짐작");

  // 세부 업종 사전: 흔한 창업 문장이 '범용'으로 떨어지지 않고 그 종류의 답을 받는다
  const kinds: [string, string, RegExp][] = [
    ["배달 전문 치킨집을 하려고 해요", "food_beverage", /치킨/], ["필라테스 스튜디오를 열고 싶어요", "local_service", /필라테스 수업/], ["꽃집을 열고 싶어요", "local_service", /꽃다발/],
    ["동네 빵집을 하고 싶어요", "food_beverage", /베이커리/], ["수제 캔들을 만들어 온라인으로 팔고 싶어요", "retail_commerce", /캔들/], ["요리 유튜브 채널을 키워서 수익을 내고 싶어요", "content_media", /채널/],
    ["키즈카페를 하고 싶어요", "space_hospitality", /키즈카페/], ["해외 구매대행을 하려고 해요", "retail_commerce", /구매대행/], ["한복 대여점을 하고 싶어요", "general", /한복 대여/],
    ["제주에서 게스트하우스를 운영하고 싶어요", "space_hospitality", /숙박/], ["코딩 학원을 열고 싶어요", "education", /그룹 수업/], ["수제 맥주 양조장을 만들고 싶어요", "manufacturing", /주류/],
  ];
  for (const [text, sector, offer] of kinds) {
    const guess = estimateIntake(text);
    assert.equal(guess.sector, sector, `${text}: 업종`);
    assert.match(guess.answers.offer, offer, `${text}: 파는 것`);
  }
  // 업종 규칙이 이미 가른 것은 뒤집지 않는다(카페용 앱은 카페가 아니다), 가게라고 적으면 온라인 장터에 올리지 않는다
  const cafeApp = estimateIntake("카페 사장님을 위한 예약 관리 앱을 만들고 있어요");
  assert.equal(cafeApp.sector, "software");
  assert.doesNotMatch(`${cafeApp.answers.customer} ${cafeApp.answers.offer} ${cafeApp.answers.channel}`, /커피|손님|네이버 예약/);
  assert.equal(estimateIntake("옷가게를 하고 싶어요").answers.channel, "매장 방문");

  for (const text of ["동네 네일샵을 열려고 해요", "반찬가게를 열고 싶어요", "굿즈 스마트스토어를 운영하려고 해요", "소규모 팀용 예약 관리 SaaS를 만들고 있어요", "무언가 새로 해 보려고 해요", "배달 전문 치킨집을 하려고 해요", "한복 대여점을 하고 싶어요", "요리 유튜브 채널을 키워서 수익을 내고 싶어요"]) {
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
  console.log("intake-estimate: 8 businesses drafted from one sentence (AI 0회)");
}

main().catch(error => { console.error(error); process.exit(1); });
