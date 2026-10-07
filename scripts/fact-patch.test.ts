import assert from "node:assert/strict";
import { amountReplacements, patchDocumentAmounts } from "../lib/plan-builder/fact-patch";
import { FREE_REFLECTS_PER_DAY, freeReflectsLeft, isFreeReflect, recentFreeReflects } from "../lib/plan-builder/free-reflect";

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

// Free reflects: a daily allowance kept inside the protected generation record.
const now = Date.parse(at);
assert.equal(freeReflectsLeft(undefined, now), FREE_REFLECTS_PER_DAY);
const used = { freeReflects: ["2026-10-07T02:00:00.000Z", "2026-10-06T01:00:00.000Z", 5] };
assert.deepEqual(recentFreeReflects(used, now), ["2026-10-07T02:00:00.000Z"], "older than 24 hours or malformed entries do not count");
assert.equal(freeReflectsLeft({ freeReflects: Array(5).fill("2026-10-07T02:00:00.000Z") }, now), 0);
assert.equal(isFreeReflect({ free: true, revision: 4 }, 4), true);
assert.equal(isFreeReflect({ free: true, revision: 3 }, 4), false, "a free flag only covers its own revision");
assert.equal(isFreeReflect({ revision: 4 }, 4), false);
console.log("fact-patch tests passed");
