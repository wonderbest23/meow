import assert from "node:assert/strict";
import { answersFromConsult, businessFromConsult } from "../lib/consult/domain";

/*
 * 상담에서 받은 답이 사업계획서까지 살아남는가.
 *
 * 예전에는 업종·지역·설명 세 칸만 채우고 나머지는 화면에 보여 주기만 하고 버렸다.
 * 손님은 20분 답하고 와서 같은 것을 또 물어보는 화면을 봤다.
 */

const profile = {
  region: "우장산역",
  budget: "3000만원",
  loanIncluded: "포함",
  runsSelf: "직접 운영",
  interest: "베이커리(소형 매장)",
  experience: "제빵 경력 있음(자격증 없음)",
};

function main() {
  const biz = businessFromConsult(profile);
  assert.equal(biz.industry, "베이커리(소형 매장)", "업종");
  assert.equal(biz.region, "우장산역", "지역");
  assert.ok(biz.description.includes("우장산역") && biz.description.includes("3000만원"), "설명에 손님 말이 들어가야 한다");

  const carried = answersFromConsult(profile);
  assert.equal(carried["funding/requirements"]?.needs_funding, "yes", "대출 포함이면 외부 자금 필요");
  assert.equal(carried["funding/requirements"]?.self_fund, "3000만원", "예산이 자기자본 칸으로");
  assert.equal(carried["financials/assets"]?.asset_cost, "3000만원", "예산이 초기 투자 칸으로 — 재무 계산이 읽는다");
  assert.equal(carried["strategy/people"]?.who_works, "대표자 직접", "직접 운영");
  assert.equal(carried["summary/executive"]?.why_us, "제빵 경력 있음(자격증 없음)", "경력");

  /* 없는 답을 지어내지 않는다 */
  const thin = answersFromConsult({ region: "서울" });
  assert.deepEqual(thin, {}, "지역만 있으면 옮길 답변이 없어야 한다");
  assert.deepEqual(answersFromConsult(null), {}, "상담이 없으면 빈 객체");

  /* 대출을 안 낀 예산은 자기자본으로만 — 외부 자금이 필요하다고 단정하지 않는다 */
  const noLoan = answersFromConsult({ budget: "1000만원", loanIncluded: "미포함" });
  assert.equal(noLoan["funding/requirements"]?.needs_funding, undefined, "대출 미포함이면 외부 자금 필요로 단정하지 않는다");
  assert.equal(noLoan["funding/requirements"]?.self_fund, "1000만원");

  /* 뜻이 맞지 않는 칸에는 넣지 않는다 */
  const hours = answersFromConsult({ hoursPerDay: "하루 3시간" });
  assert.deepEqual(hours, {}, "하루 투입 시간은 맞는 칸이 없어 옮기지 않는다");

  console.log("consult-carry: 상담 답변 6개 중 옮길 수 있는 것이 전부 질문 칸으로 이어짐");
}

main();
