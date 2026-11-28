import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { LLMConfig } from "../lib/llm/complete";
import { checkFacts, siteFacts, type BusinessFactInput } from "../lib/business-facts";
import { checkGroundedReply, factFallbackReply, factsFooter, GROUNDED_RULES, groundTaxQuestion, isTaxQuestion, noFactReply, NTS_HOME } from "../lib/business-facts/answer";
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
  assert.match(source, /if \(grounding\.topic && !grounding\.matches\.length\) message = noFactReply\(\);/, "자료가 없으면 AI 를 부르지 않는다");
  assert.match(source, /message = checked\.ok \? `\$\{result\.message\.trim\(\)\}\$\{factsFooter\(grounding\.matches\)\}` : factFallbackReply\(grounding\.matches\);/, "숫자가 어긋나면 항목 원문");
  assert.match(source, /if \(!grounding\.topic\) throw new IntakeError\(result\.reason/, "세금 질문은 AI 가 실패해도 항목 원문으로 답한다");
}

requestShape().then(() => console.log("business facts answer: tax-topic routing, grounded facts only, no-fact reply, number check, footer, fake-AI request shape passed"));
