import assert from "node:assert/strict";
import { classifyEditRequest } from "../lib/plan-builder/intake-edit-filter";

// Requests that must never reach the AI.
for (const text of ["그냥 카페 사업으로 할래", "다른 사업 할래", "새 사업으로 바꾸고 싶어", "업종을 바꿀래", "처음부터 다시 하자", "네일샵 말고 학원으로 할래"]) assert.equal(classifyEditRequest(text), "new_business", text);
for (const text of ["말투를 더 공손하게 해줘", "문장을 자연스럽게 다듬어줘", "좀 더 있어 보이게 써줘", "맞춤법 고쳐줘"]) assert.equal(classifyEditRequest(text), "style", text);
for (const text of ["오늘 날씨 어때", "ㅋㅋㅋ", "고마워요", "감사합니다", "너는 누구야", "안녕하세요", "?"]) assert.equal(classifyEditRequest(text), "off_topic", text);
assert.equal(classifyEditRequest("   "), "empty");
// Fact changes go to the AI.
for (const text of ["커피 말고 디저트도 팔래", "배달도 같이 할래", "점심 장사만 할래", "무료 체험 넣어줘", "타겟을 20대로 바꿔줘", "가격을 6만 5천원으로 바꿔줘", "주 고객을 1인 가구로 바꿔줘", "목표를 1년 안에 단골 100명으로", "한 달 고정비가 200만원이야", "인스타그램으로 홍보할래", "재료비 올려줘", "직원 1명 더 쓸 거야"]) assert.equal(classifyEditRequest(text), "in_scope", text);
// A style word with a number is still a fact change.
assert.equal(classifyEditRequest("가격을 공손하게 말고 9천원으로"), "in_scope");
console.log("business-intake-edit-filter tests passed");
