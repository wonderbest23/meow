import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFacts, factsForPrompt, factState, findFacts, FACT_FILES, isOfficialSource, normalizeFactText, questionSimilarity, seoulToday, type BusinessFactInput } from "../lib/business-facts";

/*
 * 한국 사업 정보 자료 — 모양 · 검사 · 찾기. 아래 항목은 시험용 가짜(TEST)이고 사이트 자료가 아니다.
 * 사이트 자료(data/business-facts/*.json)는 이 시험의 첫 검사를 늘 통과해야 한다(다시 확인 날이 지난 확인됨 항목이 있으면 떨어진다).
 */
const TODAY = "2026-12-01";

// 1) 사이트 자료 — 모양이 맞고, 다시 확인 날이 지난 항목이 없다
{
  for (const [file, raw] of Object.entries(FACT_FILES)) assert.ok(Array.isArray(raw), `${file}.json 은 배열`);
  const { issues } = checkFacts(FACT_FILES, seoulToday());
  assert.deepEqual(issues, [], `사이트 자료 검사: ${issues.map(issue => `${issue.file}#${issue.id ?? issue.index} ${issue.message}`).join(" / ")}`);
}

const base = (over: Partial<BusinessFactInput>): BusinessFactInput => ({
  id: "test.permit.banchan",
  group: "permit",
  sectors: ["food_beverage"],
  ksic: ["5612"],
  keywords: ["반찬가게", "반찬", "도시락"],
  questions: ["반찬 만들어서 가게에서 팔려면 뭐 해야 해요?", "반찬가게 영업신고 어디서 해요?"],
  answer: "TEST 가게에서 직접 만들어 파는 반찬은 영업신고가 필요해요. 사업장 주소지 구청에 신고해요.",
  agency: "TEST 사업장 주소지 구청 위생 담당 부서",
  basis: [{ law: "TEST 식품위생법", article: "제○조" }],
  sources: [{ url: "https://www.gov.kr/test-banchan", title: "TEST 영업신고 안내" }],
  checkedAt: "2026-11-30",
  checkedBy: "시험",
  validFrom: "2026-01-01",
  recheckBy: "2027-05-30",
  status: "verified",
  ...over,
});
const nail = base({ id: "test.permit.nail", sectors: ["local_service"], ksic: ["9611"], keywords: ["네일숍", "네일"], questions: ["네일숍 하려면 신고해야 해요?"], answer: "TEST 네일숍은 미용업 신고가 필요해요. 구청에 신고해요.", sources: [{ url: "https://www.gov.kr/test-nail", title: "TEST 미용업 안내" }] });
const registration = base({ id: "test.registration.how", group: "registration", sectors: [], ksic: [], keywords: ["사업자등록"], questions: ["사업자등록 어떻게 해요?", "집에서 해도 사업자등록 해야 해요?"], answer: "TEST 사업자등록은 홈택스나 가까운 세무서에서 신청해요. 사업을 시작한 날부터 정해진 기간 안에 해요.", agency: "TEST 홈택스 또는 세무서", basis: [{ law: "TEST 부가가치세법", article: "제○조" }], sources: [{ url: "https://www.nts.go.kr/test-registration", title: "TEST 사업자등록 안내" }] });

// 2) 공식 출처만 — https + .go.kr(또는 정한 몇 곳)
assert.equal(isOfficialSource("https://www.law.go.kr/법령/식품위생법"), true);
assert.equal(isOfficialSource("https://www.semas.or.kr/web/main"), true);
assert.equal(isOfficialSource("https://www.gov.kr/portal/main"), true, "정부24 는 gov.kr");
assert.equal(isOfficialSource("https://notgov.kr/"), false);
assert.equal(isOfficialSource("http://www.nts.go.kr/"), false, "http 는 안 된다");
assert.equal(isOfficialSource("https://blog.naver.com/x"), false, "블로그는 출처가 아니다");
assert.equal(isOfficialSource("https://go.kr.example.com/"), false, "도메인 끝이 .go.kr 이어야 한다");

// 3) 검사 — 틀린 항목은 쓰지 않고 이유를 알린다
{
  const { facts, issues } = checkFacts({ permit: [base({}), nail], registration: [registration] }, TODAY);
  assert.equal(facts.length, 3);
  assert.deepEqual(issues, []);
  const bad = checkFacts({
    permit: [
      base({ id: "test.a", sources: [{ url: "https://blog.naver.com/x", title: "블로그" }] }),
      base({ id: "test.b", sources: [] }),
      base({ id: "test.c", checkedAt: "2026-12-31" }),
      base({ id: "test.d", validFrom: "2026-06-01", validTo: "2026-01-01" }),
      base({ id: "test.e", recheckBy: "2026-11-01" }),
      base({ id: "test.f", sectors: [], ksic: [] }),
      base({ id: "test.g", group: "registration" }),
      base({ id: "test.h" }), base({ id: "test.h" }),
      base({ id: "Bad Id" }),
      base({ id: "test.i", checkedAt: "2026-02-30" }),
    ],
  }, TODAY);
  const by = (id: string) => bad.issues.filter(issue => issue.id === id).map(issue => issue.message).join(" ");
  assert.match(by("test.a"), /공식 출처가 아니에요/);
  assert.match(by("test.b"), /sources/, "출처가 없으면 안 된다");
  assert.match(by("test.c"), /확인한 날이 미래/);
  assert.match(by("test.d"), /적용 기간 끝이 시작보다 빨라요/);
  assert.match(by("test.e"), /다시 확인 날은 확인한 날보다 뒤/);
  assert.match(by("test.f"), /sectors 나 ksic/);
  assert.match(by("test.g"), /파일\(permit\)과 달라요/);
  assert.match(by("test.h"), /같은 id/);
  assert.match(by("Bad Id"), /id 는 소문자/);
  assert.match(by("test.i"), /없는 날짜/);
  assert.deepEqual(bad.facts.map(fact => fact.id), ["test.h"], "틀린 항목은 하나도 쓰지 않는다(두 번째 test.h 도)");
  assert.ok(bad.issues.every(issue => issue.level === "error"));
  assert.deepEqual(checkFacts({ permit: {} }, TODAY).issues.map(issue => issue.message), ["파일은 항목 배열이어야 해요"]);
}

// 4) 다시 확인 날이 지난 확인됨 항목 — 쓰되 stale 로 알리고, 답에는 '다시 확인 필요'
{
  const old = base({ id: "test.old", checkedAt: "2025-01-01", recheckBy: "2025-07-01" });
  const { facts, issues } = checkFacts({ permit: [old] }, TODAY);
  assert.equal(facts.length, 1);
  assert.deepEqual(issues.map(issue => issue.level), ["stale"]);
  assert.equal(factState(facts[0], TODAY), "recheck");
  const [match] = findFacts({ text: "반찬가게 영업신고 어디서 해요?" }, facts, TODAY);
  assert.equal(match.stale, true);
  assert.match(factsForPrompt([match]), /\(다시 확인 필요\)/);
}

// 5) 답에 쓰지 않는 항목 — 초안 · 아직 시작 전 · 기간 끝남
{
  const parsed = checkFacts({ permit: [base({ id: "test.draft", status: "draft" }), base({ id: "test.future", validFrom: "2027-01-01" }), base({ id: "test.ended", validTo: "2026-06-30" })] }, TODAY).facts;
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map(fact => factState(fact, TODAY)), ["unusable", "unusable", "unusable"]);
  assert.deepEqual(findFacts({ text: "반찬가게 영업신고 어디서 해요?" }, parsed, TODAY), [], "초안·기간 밖 항목은 찾지 않는다");
}

// 6) 찾기 — 업종과 말로, 다른 업종 항목은 빼고, 맞는 게 없으면 빈 목록
{
  const facts = checkFacts({ permit: [base({}), nail], registration: [registration] }, TODAY).facts;
  const banchan = findFacts({ text: "반찬 만들어서 가게에서 팔려면 뭐 해야 해요", sector: "food_beverage" }, facts, TODAY);
  assert.equal(banchan[0]?.fact.id, "test.permit.banchan");
  assert.ok(!banchan.some(match => match.fact.id === "test.permit.nail"), "반찬 질문에 네일숍 항목이 나오지 않는다");
  assert.equal(findFacts({ text: "영업신고 어디서 해요?", ksic: "56121" }, facts, TODAY)[0]?.fact.id, "test.permit.banchan", "업종 코드 앞자리가 맞으면 찾는다");
  assert.ok(!findFacts({ text: "영업신고 어디서 해요?", ksic: "56121" }, facts, TODAY).some(match => match.fact.id === "test.permit.nail"), "업종 코드가 다르면 다른 업종 항목은 뺀다");
  assert.equal(findFacts({ text: "사업자 등록은 어떻게 하나요?", sector: "food_beverage" }, facts, TODAY)[0]?.fact.id, "test.registration.how", "업종과 상관없는 항목은 어느 업종에서도 찾는다");
  assert.equal(findFacts({ text: "네일 숍 신고" }, facts, TODAY)[0]?.fact.id, "test.permit.nail", "띄어쓰기가 달라도 찾는다");
  assert.deepEqual(findFacts({ text: "오늘 날씨 어때요?" }, facts, TODAY), [], "맞는 항목이 없으면 빈 목록");
  assert.deepEqual(findFacts({ text: "사업자등록 어떻게 해요?", groups: ["permit"] }, facts, TODAY).map(match => match.fact.group), [], "묶음을 정하면 그 묶음만");
  assert.equal(findFacts({ text: "반찬가게 영업신고" }, facts, TODAY, 1).length, 1, "개수 제한");
}

// 7) 말 다루기
assert.equal(normalizeFactText("반찬 가게!"), normalizeFactText("반찬가게"));
assert.ok(questionSimilarity("반찬가게 영업신고 어디서 해요?", "반찬가게 영업신고는 어디서 하나요") > 0.5);
assert.ok(questionSimilarity("반찬가게 영업신고", "오늘 날씨") < 0.1);
assert.equal(seoulToday(new Date("2026-11-30T16:00:00Z")), "2026-12-01", "서울 날짜(UTC+9)");

// 8) AI 에게 건넬 근거 — 원문 · 신청처 · 근거 · 출처 주소 · 확인한 날
{
  const facts = checkFacts({ registration: [registration] }, TODAY).facts;
  const text = factsForPrompt(findFacts({ text: "사업자등록 어떻게 해요?" }, facts, TODAY));
  assert.match(text, /^\[test\.registration\.how\] TEST 사업자등록은/);
  assert.match(text, /신청·문의: TEST 홈택스 또는 세무서/);
  assert.match(text, /출처: TEST 사업자등록 안내 https:\/\/www\.nts\.go\.kr\/test-registration/);
  assert.match(text, /확인한 날: 2026-11-30$/);
}

// 9) 순수 함수 — AI · 서버 · DB 를 부르지 않는다
{
  const source = readFileSync(new URL("../lib/business-facts/index.ts", import.meta.url), "utf8") + readFileSync(new URL("../lib/business-facts/schema.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\(|\/api\/|supabase|completeJson|streamText/i);
}

console.log("business facts: shape, official sources, stale/recheck, draft/period exclusion, industry search, prompt block passed");
