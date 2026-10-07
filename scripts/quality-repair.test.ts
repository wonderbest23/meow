import assert from "node:assert/strict";
import { checkDocumentQuality, qualityRepairIssues } from "../lib/plan-builder/document-quality";
import { applySectionEdits } from "../lib/plan-builder/coach-review";

const source = "판매 가격 50,000원 / 1회 대여, 1건당 비용 3,000,000원, 매출 100만원";
const draft = [
  "## 가격 기준",
  "입력된 판매가는 50,000원이고 건당 비용은 3,000,000원입니다. 근거를 확인하고 다음 행동을 정합니다.",
  "",
  "## 제안",
  "1행사 총액을 4,500,000원으로 정하는 안을 검토합니다(제안). 다음 행동으로 견적서를 고칩니다.",
  "",
  "| 기준 | 금액 |",
  "| --- | --- |",
  "| 1인 |  |",
].join("\n");

// The rejected draft becomes repairable issues that quote exact, unique lines.
assert.equal(checkDocumentQuality(draft, source).ok, false);
const issues = qualityRepairIssues(draft, source);
assert.deepEqual(issues.map(issue => issue.quote), [
  "1행사 총액을 4,500,000원으로 정하는 안을 검토합니다(제안). 다음 행동으로 견적서를 고칩니다.",
  "| 1인 |  |",
]);
assert.ok(issues[0].reason.includes("4,500,000원") && issues[0].reason.includes("새 숫자를 만들지 마세요"));
for (const issue of issues) assert.equal(draft.indexOf(issue.quote), draft.lastIndexOf(issue.quote), "each quote appears once");

// A patch that follows the issues passes the same check; numbers from the input stay.
const patched = applySectionEdits(draft, [
  { quote: issues[0].quote, replacement: "가격 기준을 1행사 총액으로 바꾸는 안을 검토합니다(제안). 총액은 추가 정의가 필요합니다. 다음 행동으로 견적서를 고칩니다." },
  { quote: issues[1].quote, replacement: "| 1인 | 확인 필요 |" },
]);
assert.ok(patched);
assert.equal(checkDocumentQuality(patched!, source).ok, true);

// Amounts that are in the input are never flagged.
assert.deepEqual(qualityRepairIssues("판매가 50,000원과 비용 300만원을 비교합니다. 근거를 확인하고 다음 행동을 정합니다.", source), []);
// A copied paragraph from another section is flagged; URLs not in the source are flagged.
const copied = "이 사업은 캠핑 공간을 빌려주고 숙박을 제공합니다. 주요 고객은 기업 워크숍과 행사를 여는 회사이고 홍보는 인스타그램으로 합니다.";
assert.equal(qualityRepairIssues(`## 요약\n\n${copied}\n\n근거를 확인하고 다음 행동을 정합니다.`, source, [copied]).length, 1);
assert.equal(qualityRepairIssues("## 출처\n자세한 내용은 https://example.com/fake 에 있습니다. 근거를 확인하고 다음 행동을 정합니다.", source)[0].reason.includes("출처 주소"), true);
console.log("quality-repair tests passed");
