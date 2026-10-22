import assert from "node:assert/strict";
import { amountReplacements, patchDocumentAmounts } from "../lib/plan-builder/fact-patch";
import { BAKERY_EXECUTIVE_SECTION, BAKERY_PRICE_SECTION } from "./fixtures/bakery-plan-sections";
import { FREE_REFLECTS_TOTAL, LEGACY_FREE_REFLECTS_TOTAL, freeReflectsLeft, isFreeReflect, usedFreeReflects } from "../lib/plan-builder/free-reflect";

// Each written style keeps its style.
assert.deepEqual(new Map(amountReplacements(7500, 9000)), new Map([["7,500원", "9,000원"], ["7500원", "9000원"]]));
assert.deepEqual(new Map(amountReplacements(1_200_000, 1_500_000)), new Map([["1,200,000원", "1,500,000원"], ["1200000원", "1500000원"], ["120만원", "150만원"], ["120만 원", "150만 원"]]));
assert.equal(new Map(amountReplacements(1_200_000, 1_234_567)).get("120만원"), "1,234,567원", "a value that is not whole 만원 falls back to 원");
assert.deepEqual(amountReplacements(5000, 5000), []);

const at = "2026-10-07T03:00:00.000Z";
const section = (markdown: string, extra: Record<string, unknown> = {}) => ({ markdown, html: `<p>${markdown}</p>`, generatedAt: "2026-10-07T01:00:00.000Z", ...extra });
const plan = { sections: {
  "a/price": { markdown: "한 잔 7,500원으로 팝니다. 월 고정비 120만원.\n\n하루 매출 17,500원 예상.", html: "<p>한 잔 7,500원으로 팝니다. 월 고정비 120만원.</p><p>하루 매출 17,500원 예상.</p>", generatedAt: "2026-10-07T01:00:00.000Z" },
  "b/edited": section("가격 7,500원", { edited: true }),
  "c/none": section("가격 이야기 없음"),
} } as never as Parameters<typeof patchDocumentAmounts>[0];
const changed = patchDocumentAmounts(plan, { price: { value: 7500 }, "structure.cost": { value: 1_200_000 } }, { price: { value: 9000 }, "structure.cost": { value: 1_500_000 } }, at);
assert.equal(changed, 1);
assert.equal(plan.sections["a/price"].markdown, "한 잔 9,000원으로 팝니다. 월 고정비 150만원.\n\n하루 매출 17,500원 예상.", "only whole amounts are swapped; 17,500원 is left alone");
assert.equal(plan.sections["a/price"].html, "<p>한 잔 9,000원으로 팝니다. 월 고정비 150만원.</p><p>하루 매출 17,500원 예상.</p>");
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
assert.equal(patched.markdown.split("\n")[0], "판매가 4,500원에서 한 건당 비용 1,000원을 빼면 한 건에 3,500원이 남습니다.", "a sentence that computes with the price is left whole for the rewrite (2026-10-22)");
assert.equal(patched.markdown.split("\n")[1], "첫 달 통장 누적은 4,500원이고, 하루 매출은 4,500원 안팎입니다.", "computed values equal to the old price stay");
assert.ok(patched.markdown.includes("| 2개월차 | 4,500원 |"), "table cells are never patched");
assert.ok(patched.markdown.includes("{\"title\":\"4,500원\"}"), "chart fences are never patched");
assert.ok(patched.markdown.endsWith("가격은 **4,000원**으로 정했습니다."), "bold amounts after the fact word are swapped");
assert.equal(patched.html, "<p>판매가 <strong>4,000원</strong>에서 시작합니다. 누적 4,500원.</p><table><tbody><tr><td>판매가</td><td>4,500원</td></tr></tbody></table><figure class=\"plan-chart-figure\" data-chart-spec=\"{}\"><svg><text>4,500원</text></svg></figure><p>하루 매출 4,500원</p>", "html: prose only, tables and charts untouched");
// Real chat edit 2026-10-22 (bakery, price 4,500원 → 5,000원): sentences that compute with the price stayed half-patched
// ("5,000원에서 1,350원을 빼면 3,150원"), while "빵 값은 사용자가 정한 4,500원" was missed. Arithmetic sentences now stay whole
// (consistent old numbers until 계획서에 반영하기); prose that just states the price is swapped.
const bakeryMarkdown = [
  "빵 값은 4,500원으로 정했습니다. 한 줄로 줄이면 '출근길에 갓 구운 소금빵 하나 챙겨 가는 아침'입니다.",
  "",
  "비용은 메뉴별 원가표 한 장에 적습니다. 지금 들어온 가격 4,500원과 재료비 1,350원이 소금빵 1개 기준인지는 정해지지 않았습니다(확인 필요).",
  "",
  "### 빵 1개 4,500원으로 시작하면, 한 개에 3,150원이 남습니다",
  "",
  "빵 값은 사용자가 정한 4,500원입니다. 재료비 1,350원을 빼면 한 개에 3,150원이 남습니다. 판매가의 70%입니다(계산).",
  "",
  "판매가 4,500원에서 한 건당 비용 1,350원을 빼면 한 건에 3,150원이 남습니다. 매달 나가는 1,350원을 메우는 본전 판매량은 월 1건입니다.",
  "",
  "이 계획은 아파트 상가 빵집을 다룹니다. 빵 1개는 4,500원이고, 재료비 1,350원을 빼면 한 개에 3,150원이 남습니다(계산, 고정비·세금 전).",
].join("\n");
const bakeryHtml = "<p>판매가 <strong>4,500원</strong>에서 한 건당 비용 1,350원을 빼면 한 건에 3,150원이 남습니다. 가격은 <strong>4,500원</strong>입니다.</p><h3>빵 1개 4,500원으로 시작하면, 한 개에 3,150원이 남습니다</h3>";
const bakery = { sections: { b: { markdown: bakeryMarkdown, html: bakeryHtml, generatedAt: "2026-10-07T01:00:00.000Z" } } } as never as Parameters<typeof patchDocumentAmounts>[0];
assert.equal(patchDocumentAmounts(bakery, { price: { value: 4500 }, "structure.unitCost": { value: 1350 } }, { price: { value: 5000 }, "structure.unitCost": { value: 1350 } }, at), 1);
const bakeryLines = (bakery.sections.b as { markdown: string }).markdown.split("\n").filter(Boolean);
assert.equal(bakeryLines[0], "빵 값은 5,000원으로 정했습니다. 한 줄로 줄이면 '출근길에 갓 구운 소금빵 하나 챙겨 가는 아침'입니다.", "'빵 값' names the price");
assert.equal(bakeryLines[1], "비용은 메뉴별 원가표 한 장에 적습니다. 지금 들어온 가격 5,000원과 재료비 1,350원이 소금빵 1개 기준인지는 정해지지 않았습니다(확인 필요).", "two amounts without arithmetic still swap");
assert.equal(bakeryLines[2], "### 빵 1개 4,500원으로 시작하면, 한 개에 3,150원이 남습니다", "a heading that computes stays whole");
assert.equal(bakeryLines[3], "빵 값은 사용자가 정한 4,500원입니다. 재료비 1,350원을 빼면 한 개에 3,150원이 남습니다. 판매가의 70%입니다(계산).", "a paragraph with any computing sentence is left whole (2026-10-22 2nd check)");
assert.equal(bakeryLines[4], "판매가 4,500원에서 한 건당 비용 1,350원을 빼면 한 건에 3,150원이 남습니다. 매달 나가는 1,350원을 메우는 본전 판매량은 월 1건입니다.", "never '5,000원에서 1,350원을 빼면 3,150원'");
assert.equal(bakeryLines[5], "이 계획은 아파트 상가 빵집을 다룹니다. 빵 1개는 4,500원이고, 재료비 1,350원을 빼면 한 개에 3,150원이 남습니다(계산, 고정비·세금 전).");
assert.equal((bakery.sections.b as { html: string }).html, "<p>판매가 <strong>4,500원</strong>에서 한 건당 비용 1,350원을 빼면 한 건에 3,150원이 남습니다. 가격은 <strong>4,500원</strong>입니다.</p><h3>빵 1개 4,500원으로 시작하면, 한 개에 3,150원이 남습니다</h3>", "html: a paragraph split by inline tags is judged whole, and left whole when it computes");
for (const line of bakeryLines) assert.ok(!/5,000원[^.]*빼면[^.]*3,150원/.test(line), `no mixed old/new arithmetic: ${line}`);

// Real AI plan 2026-10-22 2nd check (3.2 가격 전략 + 실행 요약, price 4,500원 → 5,000원): the sentence-level skip still left
// "한 개 5,000원으로 시작합니다. … 3,150원이 남습니다. 판매가의 70%입니다(계산)." in one paragraph. Any computing sentence keeps the
// whole paragraph / list item / heading as it was.
const real = { sections: { price: { ...BAKERY_PRICE_SECTION, generatedAt: "2026-10-22T05:40:00.000Z" }, executive: { ...BAKERY_EXECUTIVE_SECTION, generatedAt: "2026-10-22T05:40:00.000Z" } } } as never as Parameters<typeof patchDocumentAmounts>[0];
patchDocumentAmounts(real, { price: { value: 4500 }, "structure.unitCost": { value: 1350 }, "structure.cost": { value: 1350 } }, { price: { value: 5000 }, "structure.unitCost": { value: 1350 }, "structure.cost": { value: 1350 } }, at);
const realPrice = real.sections.price as { markdown: string; html: string }, realExec = real.sections.executive as { markdown: string; html: string };
const blocksOf = (markdown: string) => markdown.split(/\n(?=\s*(?:#|[-*+]\s|\d+[.)]\s))|\n\s*\n/).filter(block => block.trim() && !block.trim().startsWith("|"));
const htmlBlocks = (html: string) => html.replace(/<table>[\s\S]*?<\/table>/g, "").split(/<\/?(?:p|li|h[1-6]|ul|ol)\b[^>]*>/).filter(block => block.trim());
for (const block of [...blocksOf(realPrice.markdown), ...blocksOf(realExec.markdown), ...htmlBlocks(realPrice.html), ...htmlBlocks(realExec.html)]) {
  assert.ok(!(block.includes("5,000원") && /3,150원|70%|남습니다|\(계산/.test(block)), `new price never sits next to old computed values: ${block.slice(0, 80)}`);
}
assert.ok(realPrice.markdown.startsWith("## 한 개 4,500원에 팔면 3,150원이 남습니다\n\n식빵과 소금빵은 한 개 4,500원으로 시작합니다."), "the computing heading and paragraph stay whole");
assert.ok(realPrice.html.includes("<p>식빵과 소금빵은 한 개 4,500원으로 시작합니다."), "html too");
assert.ok(realExec.markdown.includes("팔 것은 식빵과 소금빵 두 가지이고, 한 개에 4,500원입니다. 한 개를 팔면 월세와 세금을 빼기 전 3,150원이 남습니다(계산)."), "실행 요약 paragraph with (계산) stays whole");
assert.ok(realPrice.markdown.includes("소금빵 한 개, 식빵 한 덩이를 각각 5,000원에 팝니다."), "a list item that only states the price is swapped");
assert.ok(realPrice.markdown.includes("'개당 5,000원 예정'"), "a paragraph that only states the price is swapped");
assert.ok(realPrice.markdown.includes("| **4,500원 (시작 가격)** |"), "table rows are never touched");

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
