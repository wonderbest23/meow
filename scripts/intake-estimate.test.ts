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

  // 낱말 규칙(수만 개): 모든 줄이 분류에 묶여 있고, 실제 계산 함수로 감당하는 양에서 본전을 넘긴다
  const { ruleKind, KIND_RULE_ROWS } = await import("../lib/plan-builder/kind-rules");
  const { sectorForKsic } = await import("../lib/plan-builder/ksic");
  for (const [ksic, offer, , , , price, unitCost, cost, capacity] of KIND_RULE_ROWS) {
    const volume = monthlyVolumeFromCapacity(capacity)?.volume ?? 0;
    assert.ok(sectorForKsic(ksic) && volume * (price - unitCost) > cost, `${ksic} ${offer}: 감당하는 양으로 월 고정비를 넘긴다`);
  }

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

  // 낱말 규칙: 사전에 없는 업종은 규칙 줄로, 사전 낱말을 품은 더 긴 낱말(청소 → 입주청소)은 더 구체적인 규칙 줄로, 그 밖에는 사전 그대로
  const ruled = (text: string) => estimateIntake(text, undefined, ruleKind);
  assert.deepEqual([ruled("양봉 시작하려고요").ksic, ruled("동네 퀵 배송 대행").ksic, ruled("심리 카운셀러").ksic], ["01299", "49402", "86909"]);
  assert.match(ruled("입주 청소 서비스를 시작하려고 해요").answers.offer, /입주·이사 청소/);
  assert.equal(ruled("굿즈 스마트스토어를 운영하려고 해요").ksic, null);
  assert.doesNotMatch(ruled("라이프 스타일 편집숍").answers.offer, /타일 작업/);
  // 떨어진 낱말도 잇고(매트리스 … 청소), 낱말 경계를 한 글자만 걸친 것(찜닭 가게의 닭가게)은 버리고, 손님 업종 낱말은 종류로 읽지 않는다
  assert.deepEqual(["매트리스 소파 방문 청소", "찜닭 가게", "손두부 제조"].map((text) => ruleKind(text)?.word), ["매트리스청소", "찜닭", "두부제조"]);
  assert.equal(ruled("식당 사장님들에게 식자재 납품").ksic, "46329");
  // 같은 줄의 낱말이 여럿 맞으면 낱말 하나만 맞은 줄보다 먼저다(참기름·들기름 방앗간은 떡집이 아니다). 긴 낱말 하나(식자재마트)는 짧은 낱말 둘에 지지 않는다
  assert.deepEqual(["참기름 들기름 짜는 방앗간", "식자재 마트 창업"].map((text) => ruleKind(text)?.offer), ["국산 참기름 300ml 한 병", "식자재 마트"]);
  // 문장의 낱말이 파는 것에 그대로 든 줄(빙수 → 빙수 한 그릇)이 넓은 낱말의 줄(디저트가게 → 마카롱)보다 먼저다. 어절 토막('판매점'의 매점)은 치지 않는다
  assert.deepEqual(["빙수 전문 디저트 가게", "베이글 전문 베이커리 오픈 예정"].map((text) => ruled(text).answers.offer), ["빙수 한 그릇", "베이글 한 개"]);
  assert.doesNotMatch(ruled("무인 반려동물 간식 판매점").answers.offer, /매점/);
  assert.equal(ruled("학원 전용 출결 관리 앱").sector, "software");
  // 나이대 낱말 하나('유아용품'의 유아)는 종류의 고객(부모)을 덮지 않는다. 짚어 말한 고객('외국인 대상')은 그대로 둔다
  assert.doesNotMatch(ruled("유아용품 온라인몰").answers.customer, /^유아$/);
  assert.equal(ruled("외국인 대상 게스트하우스").answers.customer, "외국인");
  // 사업체를 상대로 하는 일은 앞의 업종이 고객이고, 납품은 받는 곳이 고객이다
  assert.deepEqual(["병원 마케팅 대행사", "카페 창업 컨설팅", "반찬 공장 차려서 마트에 납품"].map((text) => ruled(text).answers.customer), ["병원 운영자", "카페 창업을 준비하는 사람", "납품받는 마트"]);
  assert.notEqual(ruled("동네 카페 창업").answers.customer, "카페 운영자");
  // 소프트웨어는 적은 말이 곧 파는 것이다. 납품·주문자 상표는 받는 업체가 고객이다
  assert.equal(ruled("공유 주차장 예약 플랫폼").answers.offer, "공유 주차장 예약 플랫폼");
  assert.deepEqual(["김치 제조 공장, 식당 납품용", "향초 디퓨저 OEM 제조"].map((text) => ruled(text).answers.customer), ["납품받는 식당", "자기 상표로 팔 제품을 맡기는 판매 업체"]);
  assert.equal(ruled("포장이사 업체, 직원 4명").answers.capacity.split(" / ")[0], "직원 3명 이상");
  // 교육: 문장에 적은 나이대가 종류의 고객 문구 속 나이대를 바꾼다
  assert.match(ruled("초등 수학 학원 차리려고요").answers.customer, /초등학생/);
  // 혼자서는 못 하는 종류는 인원을 그 종류 값으로 잡는다 — 문장에 혼자 한다고 적었으면 그 말이 먼저다
  assert.deepEqual(["요양원 창업", "돼지국밥집", "동네 꽃집", "혼자 하는 1인 국밥집", "김치 제조 공장", "김치 담가서 온라인 판매"].map((text) => ruled(text).answers.capacity.split(" / ")[0]), ["직원 3명 이상", "직원·아르바이트 1~2명", "대표자 혼자", "대표자 혼자", "직원·아르바이트 1~2명", "대표자 혼자"]);

  // 문장 읽기: 사용자가 이미 적은 고객·가격·자금·시간·목표·양·인원은 짐작하지 않고 그대로 읽는다
  const { readSentence } = await import("../lib/plan-builder/intake-sentence");
  const together = "동업자·가족과 함께";
  const reads: [string, Record<string, unknown>][] = [
    ["20~30대 여성 직장인을 위한 샐러드 가게를 열고 싶어요", { customer: "20~30대 여성 직장인" }], ["초등학생 영어 과외를 하려고 해요", { customer: "초등학생" }],
    ["자본금 3천만원으로 동네 카페를 차리고 싶어요", { budget: 30_000_000 }], ["퇴직금 1억으로 편의점을 하려고 해요", { budget: 100_000_000 }],
    ["월 매출 1,000만원 목표로 네일샵을 열려고 해요", { goal: "6개월 안에 월 매출 1,000만원" }], ["1년 안에 월 500만원 버는 스마트스토어를 하고 싶어요", { goal: "1년 안에 월 순수익 500만원" }],
    ["5만원짜리 원데이 클래스를 일주일에 10명 받으려고 해요", { price: 50_000, capacity: { period: "일주일", count: 10 } }], ["회당 8만원 1:1 PT를 주 20시간만 하려고 해요", { price: 80_000, hours: 20 }],
    ["월 15만원 회원권 필라테스 스튜디오를 열고 싶어요", { price: 150_000, priceMonthly: true }], ["직원 2명 두고 미용실을 열려고 해요", { people: "직원·아르바이트 1~2명" }],
    ["부부가 함께 국밥집을 차리려고 해요", { people: together }], ["친구랑 같이 수제 버거집을 열려고 해요", { people: together }],
    // 읽으면 안 되는 것: 월세·월급·구독자 수·연 매출은 가격·자금·목표가 아니고, 창업자 자신과 함께 놀러 오는 친구는 고객·동업자가 아니다
    ["월세 200만원 상가에서 꽃집을 하려고 해요", {}], ["월급 300만원 받던 직장인인데 빵집을 하고 싶어요", {}], ["구독자 1만 명 유튜브 채널로 수익을 내고 싶어요", {}],
    ["연 매출 1억 목표로 온라인 쇼핑몰을 하려고 해요", {}], ["친구와 함께 놀러 갈 수 있는 보드게임카페를 하고 싶어요", {}], ["어린이집을 하려고 해요", {}],
  ];
  for (const [text, facts] of reads) assert.deepEqual(JSON.parse(JSON.stringify(readSentence(text))), facts, `${text}: 문장에서 읽은 것`);
  // 읽은 가격에는 건당 비용이 같은 비율로 따라가고, 한 달 값으로 적은 가격은 한 달 회원 수로 센다(건당 자리에 두면 매출이 몇십 배로 부푼다)
  const coffee = estimateIntake("한 잔 3,500원 테이크아웃 커피 전문점을 하려고 해요").answers;
  assert.deepEqual([coffee.price, coffee["structure.unitCost"]], ["3500원", "1200원"]);
  const pilates = estimateIntake("월 15만원 회원권 필라테스 스튜디오를 열고 싶어요").answers;
  assert.deepEqual([pilates.price, pilates["structure.unitCost"], pilates.capacity], ["150000원", "15000원", "대표자 혼자 / 한 달 36명"]);
  assert.equal(estimateIntake("5만원짜리 원데이 클래스를 일주일에 10명 받으려고 해요").answers.capacity, "대표자 혼자 / 일주일 10명");
  const lesson = estimateIntake("회당 4만원 초등학생 영어 과외를 하려고 해요").answers;
  assert.deepEqual([lesson.price, lesson["structure.unitCost"], lesson.capacity], ["40000원", "2000원", "대표자 혼자 / 한 달 60회"]);
  assert.equal(estimateIntake("소상공인에게 세무 기장 대행을 월 10만원에 하려고 해요").answers.customer, "소상공인");
  // 표에 없던 흔한 종류도 '범용'으로 떨어지지 않는다
  for (const [text, sector] of [["편의점을 하려고 해요", "retail_commerce"], ["태권도장을 열고 싶어요", "education"], ["스크린골프장을 하고 싶어요", "space_hospitality"], ["번역 프리랜서로 일하려고 해요", "b2b_service"], ["동네 약국을 열려고 해요", "retail_commerce"], ["신혼부부 대상 집 정리 서비스를 하려고 해요", "local_service"], ["배달 대행을 하려고 해요", "logistics"]]) {
    assert.equal(estimateIntake(text).sector, sector, `${text}: 업종`);
  }

  // 종류를 못 찾은 문장은 짐작으로 채우지 않는다 — 업종부터 묻는다
  {
    const { snapshot } = await saveIntakeCommand(`intake-estimate-${randomUUID()}`, { action: "start", mode: "startup", questionId: "business", value: "무언가 새로 해 보려고 해요", revision: 0, requestId: randomUUID() }, off);
    assert.equal(snapshot.coreComplete, false, "모르는 사업은 묻는다");
    assert.equal(estimateIntake("무언가 새로 해 보려고 해요").matched, false);
  }
  for (const text of ["동네 네일샵을 열려고 해요", "반찬가게를 열고 싶어요", "굿즈 스마트스토어를 운영하려고 해요", "소규모 팀용 예약 관리 SaaS를 만들고 있어요", "배달 전문 치킨집을 하려고 해요", "한복 대여점을 하고 싶어요", "요리 유튜브 채널을 키워서 수익을 내고 싶어요"]) {
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
  // 문장에 적은 자금·시간은 초안에 들어간다(적지 않았으면 위처럼 비워 둔다)
  const stated = await saveIntakeCommand(`intake-estimate-${randomUUID()}`, { action: "start", mode: "startup", questionId: "business", value: "자본금 3천만원으로 주 20시간만 하는 네일샵을 열려고 해요", revision: 0, requestId: randomUUID() }, off);
  const statedFields = readCoach(stated.plan.answers)!.fields;
  assert.deepEqual(["budget", "hoursPerWeek"].map(key => statedFields.find(field => field.key === key)?.value), ["30000000원", "20시간"]);
  assert.deepEqual(network, [], "네트워크 호출 0");
  console.log("intake-estimate: 8 businesses drafted from one sentence (AI 0회)");
}

main().catch(error => { console.error(error); process.exit(1); });
