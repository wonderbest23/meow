import assert from "node:assert/strict";
import { amountForms, factNeedles, findFactRanges } from "../lib/plan-builder/fact-highlight";

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
console.log("fact-highlight tests passed");
