import assert from "node:assert/strict";
import { amountForms, amountOwner, factNeedles, findFactRanges, parseWon } from "../lib/plan-builder/fact-highlight";

assert.deepEqual(amountForms("7500원"), ["7,500원", "7500원"]);
assert.deepEqual(amountForms("120만원"), ["1,200,000원", "1200000원", "120만원", "120만 원"]);
assert.deepEqual(amountForms("맞벌이 부부"), [], "words are not amounts");

const customer = factNeedles("맞벌이 30대 부부, 1인 가구");
assert.ok(customer.includes("맞벌이 30대 부부") && customer.includes("1인 가구"), "a two-pick answer is searched piece by piece");
const capacity = factNeedles("대표자 혼자 / 하루 20건");
assert.ok(capacity.includes("대표자 혼자") && capacity.includes("하루 20건"));
assert.ok(factNeedles("10,000원~30,000원 (예상)").includes("10,000원~30,000원"), "the (예상) tag is not part of what appears in prose");
assert.ok(!factNeedles("기타").length, "too generic to highlight");

const text = "이 사업은 맞벌이 30대 부부를 위해 1회 7,500원에 반찬을 배송합니다. 목표는 6개월 안에 단골 50가구입니다.";
const ranges = findFactRanges(text, [
  { questionId: "customer", needles: factNeedles("맞벌이 30대 부부") },
  { questionId: "price", needles: factNeedles("7500원") },
  { questionId: "goal", needles: factNeedles("6개월 안에 단골 50가구") },
  { questionId: "other", needles: ["50가구"] },
]);
assert.deepEqual(ranges.map(([start, end, id]) => [text.slice(start, end), id]), [["맞벌이 30대 부부", "customer"], ["7,500원", "price"], ["6개월 안에 단골 50가구", "goal"]], "longest match wins and ranges never overlap");
assert.deepEqual(findFactRanges("공헌이익 -2,950,000원, 판매가 50,000원", [{ questionId: "price", needles: ["50,000원"] }]), [[22, 29, "price"]], "an amount inside a longer number is not marked");
// Amounts are marked only where the words before them name the fact, never in tables or charts (audit 2026-10-21).
assert.deepEqual(findFactRanges("통장 누적 4,500원", [{ questionId: "price", needles: ["4,500원"] }]), [], "a computed value equal to the price is not the price");
assert.deepEqual(findFactRanges("4,500원", [{ questionId: "price", needles: ["4,500원"] }], null), [], "amounts in a table cell are not marked");
assert.deepEqual(findFactRanges("4,500원", [{ questionId: "price", needles: ["4,500원"] }], "판매 가격은 "), [[0, 6, "price"]], "the paragraph text before the run counts");
assert.deepEqual(findFactRanges("고객 맞벌이 부부", [{ questionId: "customer", needles: ["맞벌이 부부"] }], null), [[3, 9, "customer"]], "word facts are still marked anywhere");
assert.equal(amountOwner("판매가 7,500원에서 비용을 빼면 "), "", "a closer computed word wins");
assert.equal(amountOwner("월 고정비 "), "structure.cost");
assert.equal(amountOwner("빵 값은 "), "price", "'값' names the price");
assert.equal(amountOwner("재료값 "), "structure.unitCost", "a longer word ending at the same place wins");
assert.equal(amountOwner("빵 값은 사용자가 정한 "), "*", "'사용자가 정한' defers to whichever fact has this amount");
assert.deepEqual(findFactRanges("4,500원입니다.", [{ questionId: "price", needles: ["4,500원"] }], "빵 값은 사용자가 정한 "), [[0, 6, "price"]], "a value the owner set is marked");
assert.equal(amountOwner("가격을 정했습니다. 그리고 "), null, "only the same sentence counts");
for (const [text, value] of [["60000", 60000], ["60,000원", 60000], ["6만", 60000], ["6만 5천", 65000], ["6만5천원", 65000], ["1.5만", 15000], ["300만", 3_000_000], ["1억 2000만", 120_000_000], ["", null], ["abc", null], ["0", null], ["만", null], ["2만5천원", 25000], ["1억5천만원", 150_000_000], ["4.500", 4500], ["20~30만원", null]] as const) assert.equal(parseWon(text), value, text);
console.log("fact-highlight tests passed");
