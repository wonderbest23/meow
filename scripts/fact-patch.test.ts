import assert from "node:assert/strict";
import { amountReplacements, patchDocumentAmounts } from "../lib/plan-builder/fact-patch";
import { FREE_REFLECTS_TOTAL, LEGACY_FREE_REFLECTS_TOTAL, freeReflectsLeft, isFreeReflect, usedFreeReflects } from "../lib/plan-builder/free-reflect";

// Each written style keeps its style.
assert.deepEqual(new Map(amountReplacements(7500, 9000)), new Map([["7,500원", "9,000원"], ["7500원", "9000원"]]));
assert.deepEqual(new Map(amountReplacements(1_200_000, 1_500_000)), new Map([["1,200,000원", "1,500,000원"], ["1200000원", "1500000원"], ["120만원", "150만원"], ["120만 원", "150만 원"]]));
assert.equal(new Map(amountReplacements(1_200_000, 1_234_567)).get("120만원"), "1,234,567원", "a value that is not whole 만원 falls back to 원");
assert.deepEqual(amountReplacements(5000, 5000), []);

const at = "2026-10-07T03:00:00.000Z";
const section = (markdown: string, extra: Record<string, unknown> = {}) => ({ markdown, html: `<p>${markdown}</p>`, generatedAt: "2026-10-07T01:00:00.000Z", ...extra });
const plan = { sections: {
  "a/price": section("한 잔 7,500원, 하루 매출 17,500원 예상. 월 고정비 120만원."),
  "b/edited": section("가격 7,500원", { edited: true }),
  "c/none": section("가격 이야기 없음"),
} } as never as Parameters<typeof patchDocumentAmounts>[0];
const changed = patchDocumentAmounts(plan, { price: { value: 7500 }, "structure.cost": { value: 1_200_000 } }, { price: { value: 9000 }, "structure.cost": { value: 1_500_000 } }, at);
assert.equal(changed, 1);
assert.equal(plan.sections["a/price"].markdown, "한 잔 9,000원, 하루 매출 17,500원 예상. 월 고정비 150만원.", "only whole amounts are swapped; 17,500원 is left alone");
assert.equal(plan.sections["a/price"].html, "<p>한 잔 9,000원, 하루 매출 17,500원 예상. 월 고정비 150만원.</p>");
assert.equal(plan.sections["a/price"].generatedAt, at, "a swapped section gets a newer stamp");
assert.equal(plan.sections["b/edited"].markdown, "가격 7,500원", "hand-edited sections are never touched");
assert.equal(plan.sections["c/none"].generatedAt, "2026-10-07T01:00:00.000Z");

// The same amount on two facts is ambiguous: skip it.
const shared = { sections: { s: section("가격 10,000원, 변동비 10,000원") } } as never as Parameters<typeof patchDocumentAmounts>[0];
assert.equal(patchDocumentAmounts(shared, { price: { value: 10000 }, "structure.unitCost": { value: 10000 } }, { price: { value: 12000 }, "structure.unitCost": { value: 10000 } }, at), 0);
// Ranges or unknowns are not plain amounts.
assert.equal(patchDocumentAmounts(shared, { price: { value: "8000~12000" } }, { price: { value: 9000 } }, at), 0);

// Only amounts in prose that name the fact are swapped (audit 2026-10-21: a 4,500원 price change also rewrote a
// 12-month cumulative table cell that happened to be 4,500원). Tables, chart fences and computed values are left alone.
const mixedMarkdown = [
  "판매가 4,500원에서 한 건당 비용 1,000원을 빼면 한 건에 3,500원이 남습니다.",
  "첫 달 통장 누적은 4,500원이고, 하루 매출은 4,500원 안팎입니다.",
  "",
  "| 월 | 통장 누적 |",
  "| --- | ---: |",
  "| 1개월차 | 4,050원 |",
  "| 2개월차 | 4,500원 |",
  "",
  "```plan-chart",
  "{\"title\":\"4,500원\"}",
  "```",
  "가격은 **4,500원**으로 정했습니다.",
].join("\n");
const mixedHtml = "<p>판매가 <strong>4,500원</strong>에서 시작합니다. 누적 4,500원.</p><table><tbody><tr><td>판매가</td><td>4,500원</td></tr></tbody></table><figure class=\"plan-chart-figure\" data-chart-spec=\"{}\"><svg><text>4,500원</text></svg></figure><p>하루 매출 4,500원</p>";
const mixed = { sections: { m: { markdown: mixedMarkdown, html: mixedHtml, generatedAt: "2026-10-07T01:00:00.000Z" } } } as never as Parameters<typeof patchDocumentAmounts>[0];
assert.equal(patchDocumentAmounts(mixed, { price: { value: 4500 } }, { price: { value: 4000 } }, at), 1);
const patched = mixed.sections.m as { markdown: string; html: string };
assert.equal(patched.markdown.split("\n")[0], "판매가 4,000원에서 한 건당 비용 1,000원을 빼면 한 건에 3,500원이 남습니다.", "the price named in prose is swapped");
assert.equal(patched.markdown.split("\n")[1], "첫 달 통장 누적은 4,500원이고, 하루 매출은 4,500원 안팎입니다.", "computed values equal to the old price stay");
assert.ok(patched.markdown.includes("| 2개월차 | 4,500원 |"), "table cells are never patched");
assert.ok(patched.markdown.includes("{\"title\":\"4,500원\"}"), "chart fences are never patched");
assert.ok(patched.markdown.endsWith("가격은 **4,000원**으로 정했습니다."), "bold amounts after the fact word are swapped");
assert.equal(patched.html, "<p>판매가 <strong>4,000원</strong>에서 시작합니다. 누적 4,500원.</p><table><tbody><tr><td>판매가</td><td>4,500원</td></tr></tbody></table><figure class=\"plan-chart-figure\" data-chart-spec=\"{}\"><svg><text>4,500원</text></svg></figure><p>하루 매출 4,500원</p>", "html: prose only, tables and charts untouched");
// An amount with no word naming the fact is not guessed at.
const bare = { sections: { b: section("4,500원짜리 메뉴를 팝니다.") } } as never as Parameters<typeof patchDocumentAmounts>[0];
assert.equal(patchDocumentAmounts(bare, { price: { value: 4500 } }, { price: { value: 4000 } }, at), 0);

// Free reflects: two per plan for plans paid under the 2026-10-09 terms, five for older plans, kept inside the protected generation record.
assert.equal(FREE_REFLECTS_TOTAL, 2);
assert.equal(LEGACY_FREE_REFLECTS_TOTAL, 5);
assert.equal(freeReflectsLeft(undefined), FREE_REFLECTS_TOTAL, "a plan with no generation record yet follows the current terms");
const used = { freeReflects: ["2026-10-07T02:00:00.000Z", "2026-10-06T01:00:00.000Z", 5] };
assert.deepEqual(usedFreeReflects(used), ["2026-10-07T02:00:00.000Z", "2026-10-06T01:00:00.000Z"], "old uses still count (no daily reset); malformed entries do not");
assert.equal(freeReflectsLeft(used), 3, "a record made before the 2026-10-09 terms keeps five");
assert.equal(freeReflectsLeft({ ...used, freeReflectsTotal: 2 }), 0, "a stored total from the plan's payment terms wins");
assert.equal(freeReflectsLeft({ ...used, freeReflectsTotal: 5 }), 3);
assert.equal(freeReflectsLeft(used, 2), 0, "the route can pass the verified total");
assert.equal(freeReflectsLeft({ freeReflects: Array(5).fill("2026-10-01T02:00:00.000Z") }), 0, "five uses, even on earlier days, use up the free reflects");
assert.equal(isFreeReflect({ free: true, revision: 4 }, 4), true);
assert.equal(isFreeReflect({ free: true, revision: 3 }, 4), false, "a free flag only covers its own revision");
assert.equal(isFreeReflect({ revision: 4 }, 4), false);
console.log("fact-patch tests passed");
