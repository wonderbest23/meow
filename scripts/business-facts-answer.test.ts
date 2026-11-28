import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { LLMConfig } from "../lib/llm/complete";
import { checkFacts, siteFacts, type BusinessFactInput } from "../lib/business-facts";
import { checkGroundedReply, factFallbackReply, factsFooter, GOV24_HOME, GROUNDED_RULES, groundTaxQuestion, isPermitQuestion, isTaxQuestion, noFactReply, NTS_HOME } from "../lib/business-facts/answer";
import { helpIntake } from "../lib/plan-builder/intake-extraction";

/*
 * 3단계 — 세금·등록 질문은 사이트 자료(국세청 원문 대조)만 근거로. 가짜 AI 로만 시험한다(바깥 네트워크 없음).
 */
const TODAY = "2026-12-01";

// 1) 세금·등록 '절차' 질문만 가른다 — 계산 질문은 일반 답변으로
for (const q of ["사업자등록 언제까지 해요?", "사업자 등록 어떻게 해요", "간이 과세로 해도 돼요?", "부가세는 언제 내요?", "종합소득세 신고 기간이요", "알바 주면 원천세 내요?", "세금계산서 끊어야 해요?", "홈택스에서 신청해요?"]) assert.equal(isTaxQuestion(q), true, q);
for (const q of ["세금 빼고 순이익이 얼마 남아요?", "가격은 얼마로 할까요?", "월세가 너무 비싼가요?", "반찬가게 영업신고는 어디서 해요?"]) assert.equal(isTaxQuestion(q), false, q);

// 2) 사이트 자료(확인됨 12개)에서 찾기
{
  const facts = siteFacts(TODAY);
  assert.ok(facts.length >= 12, "사이트 자료가 불러와진다");
  const when = groundTaxQuestion("사업자등록 언제까지 해야 해요?", {}, TODAY, facts);
  assert.ok(when.topic && when.matches[0]?.fact.id === "registration.when", "등록 기한 질문 → 등록 기한 항목");
  const wh = groundTaxQuestion("알바생 월급 주면 원천세 신고해야 해요?", { sector: "food_beverage" }, TODAY, facts);
  assert.ok(wh.topic && wh.matches[0]?.fact.id === "tax-calendar.withholding");
  assert.deepEqual(groundTaxQuestion("가격은 얼마로 할까요?", {}, TODAY, facts), { topic: false }, "세금 질문이 아니면 손대지 않는다");
  // 음식 업종 영업신고(확인됨 7개) — 실제 자료에서
  for (const [q, business, id] of [
    ["카페 차리려면 무슨 신고를 해요?", { sector: "food_beverage", ksic: "56221" }, "permit.food.cafe"],
    ["빵집 영업신고 어디서 해요?", { sector: "food_beverage", ksic: "56150" }, "permit.food.bakery"],
    ["떡집 하려면 무슨 신고를 해요?", { sector: "food_beverage", ksic: "10601" }, "permit.food.bakery"],
    ["반찬가게 영업신고는 어떻게 해요?", { sector: "food_beverage", ksic: "47223" }, "permit.food.banchan"],
    ["도시락 가게는 무슨 신고를 해요?", { sector: "food_beverage", ksic: "10701" }, "permit.food.lunchbox"],
    ["식당 하려면 어떤 신고를 해야 해요?", { sector: "food_beverage", ksic: "56111" }, "permit.food.restaurant"],
    ["위생교육은 언제 받아요?", { sector: "food_beverage" }, "permit.food.hygiene-education"],
  ] as const) {
    const g = groundTaxQuestion(q, business, TODAY, facts);
    assert.ok(g.topic && g.kind === "permit" && g.matches[0]?.fact.id === id, `${q} → ${id} (${g.topic ? g.matches.map(m => m.fact.id).join() : "-"})`);
  }
  // 음식 밖 업종(확인됨 8개) — 미용 · 학원 · 통신판매
  for (const [q, business, id] of [
    ["미용실 차리려면 무슨 신고를 해요?", { sector: "local_service", ksic: "96112" }, "permit.beauty.hair"],
    ["네일숍은 무슨 신고를 해요?", { sector: "local_service", ksic: "96119" }, "permit.beauty.nail"],
    ["미용사 면허는 어디서 받아요?", { sector: "local_service" }, "permit.beauty.license"],
    ["미용실 위생교육은 몇 시간이에요?", { sector: "local_service", ksic: "96112" }, "permit.beauty.education"],
    ["학원 차리려면 어떻게 해요?", { sector: "education", ksic: "85501" }, "permit.edu.hakwon"],
    ["교습소는 어떻게 신고해요?", { sector: "education", ksic: "85501" }, "permit.edu.gyoseup"],
    ["집에서 공부방 하려면 신고해야 해요?", { sector: "education", ksic: "85501" }, "permit.edu.private-tutor"],
    ["스마트스토어 하려면 통신판매업 신고해야 해요?", { sector: "retail_commerce", ksic: "47912" }, "permit.commerce.mail-order"],
  ] as const) {
    const g = groundTaxQuestion(q, business, TODAY, facts);
    assert.ok(g.topic && g.kind === "permit" && g.matches[0]?.fact.id === id, `${q} → ${id} (${g.topic ? g.matches.map(m => m.fact.id).join() : "-"})`);
  }
  // 엉뚱한 업종에 나가지 않는다
  const ids = (q: string, business: { sector?: string; ksic?: string }) => { const g = groundTaxQuestion(q, business, TODAY, facts); return g.topic ? g.matches.map(m => m.fact.id) : []; };
  assert.deepEqual(ids("태권도장 하려면 신고해야 해요?", { sector: "education", ksic: "85611" }), [], "태권도장에 학원·과외 답 X");
  assert.ok(!ids("속눈썹 연장샵 하려면 무슨 신고해요?", { sector: "local_service", ksic: "96119" }).includes("permit.beauty.nail"), "속눈썹 가게에 네일 답 X");
  assert.ok(!ids("이발소 하려면 무슨 신고해요?", { sector: "local_service", ksic: "96111" }).some(id => id === "permit.beauty.hair" || id === "permit.beauty.nail"), "이발소에 미용실·네일 답 X");
  assert.ok(!ids("대학원 다니면서 무슨 신고해야 해요?", {}).includes("permit.edu.hakwon"), "'대학원'에 학원 답 X");
  assert.ok(!ids("위생교육 몇 시간이에요?", { sector: "local_service", ksic: "96112" }).includes("permit.food.hygiene-education"), "미용실에 식품 위생교육 답 X");
  // 추가 업종(확인됨 7개) — 피부 · 속눈썹 · 반영구/타투 · 반려동물 미용 · 숙박 3갈래
  for (const [q, business, id] of [
    ["피부관리실 차리려면 무슨 신고를 해요?", { sector: "local_service", ksic: "96113" }, "permit.beauty.skin"],
    ["속눈썹 연장샵 하려면 무슨 신고를 해요?", { sector: "local_service", ksic: "96119" }, "permit.beauty.eyelash"],
    ["반영구 화장샵 하려면 무슨 신고를 해요?", { sector: "local_service", ksic: "96119" }, "permit.beauty.tattoo"],
    ["타투샵 하려면 무슨 신고를 해요?", { sector: "local_service", ksic: "96119" }, "permit.beauty.tattoo"],
    ["애견미용실 하려면 무슨 신고를 해요?", { sector: "local_service", ksic: "96995" }, "permit.pet.grooming"],
    ["모텔 하려면 무슨 신고를 해요?", { sector: "space_hospitality", ksic: "55102" }, "permit.stay.lodging"],
    ["시골에서 민박 하려면 무슨 신고를 해요?", { sector: "space_hospitality", ksic: "55104" }, "permit.stay.farmstay"],
    ["에어비앤비 하려면 신고해야 해요?", { sector: "space_hospitality" }, "permit.stay.city-guesthouse"],
  ] as const) {
    const g = groundTaxQuestion(q, business, TODAY, facts);
    assert.ok(g.topic && g.kind === "permit" && g.matches[0]?.fact.id === id, `${q} → ${id} (${g.topic ? g.matches.map(m => m.fact.id).join() : "-"})`);
  }
  assert.ok(!ids("강아지 미용실 하려면 무슨 신고해요?", { sector: "local_service" }).includes("permit.beauty.hair"), "강아지 미용실에 사람 미용실 답 X");
  assert.ok(!ids("반찬가게 하려면 무슨 신고해요?", {}).some(id => id.startsWith("permit.stay.")), "'반찬가게 하려면'에 게스트하우스 답 X");
  assert.deepEqual([...ids("게스트하우스 하려면 무슨 신고해요?", { sector: "space_hospitality", ksic: "55104" })].sort(), ["permit.stay.city-guesthouse", "permit.stay.farmstay", "permit.stay.lodging"], "게스트하우스는 숙박 세 갈래를 함께");
  const pc = groundTaxQuestion("피시방 하려면 무슨 신고를 해요?", { sector: "local_service", ksic: "91223" }, TODAY, facts);
  assert.ok(pc.topic && pc.kind === "permit" && pc.matches.length === 0, "자료 없는 업종은 '아직 확인된 자료가 없어요'");
  const none = groundTaxQuestion("부가세 신고할 때 카드매출은 어떻게 적어요?", {}, TODAY, []);
  assert.ok(none.topic && none.matches.length === 0, "자료가 없으면 빈 목록");
}

// 3) 자료가 없을 때의 답 — 국세청 안내, 지어내지 않음
assert.match(noFactReply(), /^아직 확인된 자료가 없어요\./);
assert.ok(noFactReply().includes(NTS_HOME) && noFactReply().includes("126"));

// 4) 숫자 검사 — 항목 · 질문 · 사업 정보에 없는 숫자가 하나라도 있으면 그 답은 쓰지 않는다
const fixture: BusinessFactInput = {
  id: "test.registration.when", group: "registration", sectors: [], ksic: [], keywords: ["사업자등록"], questions: ["사업자등록 언제까지 해요?"],
  answer: "사업장마다 사업을 시작한 날부터 20일 안에 신청해요.", agency: "관할 세무서", basis: [{ law: "부가가치세법", article: "제8조" }],
  sources: [{ url: "https://www.nts.go.kr/test", title: "국세청 · 사업자등록 안내" }], checkedAt: "2026-11-28", checkedBy: "시험", validFrom: "2026-11-28", recheckBy: "2027-01-31", status: "verified",
};
{
  const facts = checkFacts({ registration: [fixture] }, TODAY).facts;
  const g = groundTaxQuestion("사업자등록 언제까지 해요?", {}, TODAY, facts);
  assert.ok(g.topic && g.matches.length === 1);
  const matches = g.topic ? g.matches : [];
  assert.deepEqual(checkGroundedReply("가게를 열면 20일 안에 세무서에 신청하세요.", matches), { ok: true, stray: [] });
  assert.deepEqual(checkGroundedReply("30일 안에 신청하면 돼요.", matches), { ok: false, stray: ["30"] }, "항목에 없는 숫자");
  assert.equal(checkGroundedReply("3월에 열면 20일 안에 하세요.", matches, ["3월에 문 열 예정이에요"]).ok, true, "질문·사업 정보의 숫자는 써도 된다");
  assert.equal(checkGroundedReply("기한은 2주 정도예요.", matches).ok, false, "다른 꼴로 바꾼 숫자도 걸린다");
  // 출처 줄 · 대신 보일 답
  const footer = factsFooter(matches);
  assert.match(footer, /출처: 국세청 · 사업자등록 안내\(2026-11-28 확인\) https:\/\/www\.nts\.go\.kr\/test/);
  assert.match(footer, /최종 확인은 국세청\(126\)이나 관할 세무서/);
  assert.ok(factFallbackReply(matches).startsWith(fixture.answer));
  assert.equal(factFallbackReply([]), noFactReply());
  const stale = checkFacts({ registration: [{ ...fixture, checkedAt: "2025-01-01", recheckBy: "2025-06-01" }] }, TODAY).facts;
  const sg = groundTaxQuestion("사업자등록 언제까지 해요?", {}, TODAY, stale);
  assert.match(factsFooter(sg.topic ? sg.matches : []), /다시 확인 필요/);
}

// 4-2) 영업신고·위생교육 질문 — 세금과 따로 가르고, 없을 때 · 마지막 확인처가 시·군·구청
for (const q of ["카페 차리려면 무슨 신고를 해요?", "반찬가게 영업신고는 어디서 해요?", "위생교육 몇 시간 받아요?", "일반음식점이랑 휴게음식점 차이가 뭐예요?", "보건증 있어야 해요?"]) assert.equal(isPermitQuestion(q), true, q);
for (const q of ["미용사 면허는 어디서 받아요?", "교습소는 어떻게 신고해요?", "집에서 공부방 하려면 신고해야 해요?", "통신판매업 신고 안 해도 되는 경우가 있어요?", "학원 등록해야 해요?"]) assert.equal(isPermitQuestion(q), true, q);
for (const q of ["부가세 신고해야 해요?", "사업자 신고해야 해요?", "가격은 얼마로 할까요?", "세금 빼고 순이익이 얼마예요?"]) assert.equal(isPermitQuestion(q), false, q);
{
  const permitFixture: BusinessFactInput = { ...fixture, id: "test.permit.cafe", group: "permit", sectors: ["food_beverage"], ksic: ["5622"], keywords: ["카페", "휴게음식점"], questions: ["카페 차리려면 무슨 신고를 해요?"],
    answer: "술을 팔지 않는 카페는 휴게음식점영업이에요. 수수료는 방문·우편 28,000원이에요.", agency: "시·군·구청", sources: [{ url: "https://www.gov.kr/test", title: "정부24 · 식품관련영업신고" }] };
  const facts = checkFacts({ registration: [fixture], permit: [permitFixture] }, TODAY).facts;
  const g = groundTaxQuestion("카페 차리려면 무슨 신고를 해요?", { sector: "food_beverage", ksic: "56221" }, TODAY, facts);
  assert.ok(g.topic && g.kind === "permit" && g.matches.map(m => m.fact.id).join() === "test.permit.cafe", "영업신고 질문은 영업신고 묶음에서만 찾는다");
  assert.match(factsFooter(g.topic ? g.matches : []), /최종 확인은 시·군·구청에서 해 주세요\./, "마지막 확인처는 그 항목의 담당 기관");
  assert.equal(checkGroundedReply("수수료는 28,000원이에요.", g.topic ? g.matches : []).ok, true);
  assert.equal(checkGroundedReply("수수료는 3만 원쯤이에요.", g.topic ? g.matches : []).ok, false);
  const none = groundTaxQuestion("네일숍은 무슨 신고를 해요?", { sector: "beauty" }, TODAY, facts);
  assert.ok(none.topic && none.kind === "permit" && none.matches.length === 0, "다른 업종 영업신고는 자료 없음");
  assert.ok(noFactReply("permit").startsWith("아직 확인된 자료가 없어요.") && noFactReply("permit").includes(GOV24_HOME) && !noFactReply("permit").includes("126"));
  assert.equal(factFallbackReply([], "permit"), noFactReply("permit"));
  // 영업신고는 업종이 맞아야 — 큰 분류만 같거나(교육) 낱말만 맞고 분류가 다르면(미용실 사장님의 '위생교육') 빼기
  const foodEdu = { ...permitFixture, id: "test.permit.food-edu", ksic: [], keywords: ["위생교육"], questions: ["위생교육 몇 시간이에요?"], answer: "식품 위생교육은 6시간이에요." };
  const tutor = { ...permitFixture, id: "test.permit.tutor", sectors: ["education" as const], ksic: ["85501"], keywords: ["공부방"], questions: ["공부방 하려면 신고해야 해요?"], answer: "공부방은 교육감에게 신고해요." };
  const mixed = checkFacts({ permit: [foodEdu, tutor] }, TODAY).facts;
  const beautyEdu = groundTaxQuestion("위생교육 몇 시간이에요?", { sector: "local_service", ksic: "96112" }, TODAY, mixed);
  assert.ok(beautyEdu.topic && beautyEdu.matches.length === 0, "미용실 사장님에게 식품 위생교육 답이 나가지 않는다");
  const foodOwner = groundTaxQuestion("위생교육 몇 시간이에요?", { sector: "food_beverage" }, TODAY, mixed);
  assert.ok(foodOwner.topic && foodOwner.matches[0]?.fact.id === "test.permit.food-edu", "음식 사장님은 업종 코드가 없어도 낱말로 찾는다");
  const taekwondo = groundTaxQuestion("태권도장 하려면 신고해야 해요?", { sector: "education", ksic: "85611" }, TODAY, mixed);
  assert.ok(taekwondo.topic && taekwondo.matches.length === 0, "큰 분류(교육)만 같아서는 과외 답이 나가지 않는다");

  // 긴 낱말 안에 든 짧은 낱말은 무시 — '애견미용실'의 '미용실'로 미용실 항목이 끌려오지 않는다
  const salon = { ...permitFixture, id: "test.permit.salon", sectors: ["local_service" as const], ksic: ["96112"], keywords: ["미용실"], questions: ["미용실 차리려면 무슨 신고를 해요?"], answer: "미용실은 신고해요." };
  const pet = { ...permitFixture, id: "test.permit.pet", sectors: ["local_service" as const], ksic: [], keywords: ["애견미용실"], questions: ["애견미용실 하려면 무슨 신고를 해요?"], answer: "애견미용실은 등록해요." };
  const shadow = groundTaxQuestion("애견미용실 하려면 무슨 신고를 해요?", { sector: "local_service" }, TODAY, checkFacts({ permit: [salon, pet] }, TODAY).facts);
  assert.deepEqual(shadow.topic ? shadow.matches.map(m => m.fact.id) : [], ["test.permit.pet"]);

  // 마지막 확인처는 항목마다 — 학원은 교육지원청
  const academy = checkFacts({ permit: [{ ...permitFixture, id: "test.permit.academy", sectors: ["education"], ksic: ["855"], keywords: ["학원"], questions: ["학원 차리려면 어떻게 해요?"], answer: "학원은 교육감에게 등록해요.", agency: "교육지원청(교육감)" }] }, TODAY).facts;
  const ag = groundTaxQuestion("학원 등록해야 해요?", { sector: "education", ksic: "85501" }, TODAY, academy);
  assert.match(factsFooter(ag.topic ? ag.matches : []), /최종 확인은 교육지원청\(교육감\)에서 해 주세요\./);
  const tax = groundTaxQuestion("사업자등록 언제까지 해요?", {}, TODAY, facts);
  assert.ok(tax.topic && tax.kind === "tax" && tax.matches.every(m => m.fact.group !== "permit"), "세금 질문에는 영업신고 항목이 섞이지 않는다");
}

// 5) AI 에게 건네는 모양(가짜 AI) — 근거가 있으면 규칙과 facts 가 붙고, 없으면 예전 그대로
async function requestShape() {
  const config: LLMConfig = { provider: "anthropic", apiKey: "facts-answer-fixture", model: "fixture-anthropic" };
  const original = globalThis.fetch;
  const bodies: Array<{ system: string; messages: Array<{ content: string }> }> = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ message: "20일 안에 신청하세요." }) }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.deepEqual(await helpIntake(config, "{}", "사업자등록 언제까지 해요?", "[test] 20일 안에 신청"), { ok: true, message: "20일 안에 신청하세요." });
    assert.ok(bodies[0].system.includes(GROUNDED_RULES), "근거가 있으면 '항목 밖 사실 금지' 규칙");
    assert.deepEqual(JSON.parse(bodies[0].messages[0].content), { context: "{}", question: "사업자등록 언제까지 해요?", facts: "[test] 20일 안에 신청" });
    await helpIntake(config, "{}", "가격은 얼마로 할까요?");
    assert.ok(!bodies[1].system.includes(GROUNDED_RULES), "일반 질문은 예전 그대로");
    assert.deepEqual(JSON.parse(bodies[1].messages[0].content), { context: "{}", question: "가격은 얼마로 할까요?" });
  } finally {
    globalThis.fetch = original;
  }
}


// 6) 대화 답 처리에 연결돼 있다 — 자료 없으면 AI 를 부르지 않고, 숫자가 어긋나면 항목 원문으로
{
  const source = readFileSync(new URL("../lib/plan-builder/intake-service.ts", import.meta.url), "utf8");
  assert.match(source, /const grounding = groundTaxQuestion\(job\.request \?\? "", \{ sector: claimed\.intake\.sector, ksic: claimed\.intake\.ksic \?\? null \}\);/);
  assert.match(source, /if \(grounding\.topic && !grounding\.matches\.length\) message = noFactReply\(grounding\.kind\);/, "자료가 없으면 AI 를 부르지 않는다");
  assert.match(source, /message = checked\.ok \? `\$\{result\.message\.trim\(\)\}\$\{factsFooter\(grounding\.matches\)\}` : factFallbackReply\(grounding\.matches, grounding\.kind\);/, "숫자가 어긋나면 항목 원문");
  assert.match(source, /if \(!grounding\.topic\) throw new IntakeError\(result\.reason/, "세금 질문은 AI 가 실패해도 항목 원문으로 답한다");
}

requestShape().then(() => console.log("business facts answer: tax-topic routing, grounded facts only, no-fact reply, number check, footer, fake-AI request shape passed"));
