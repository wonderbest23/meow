import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dropMissingReferences } from "../lib/plan-builder/missing-chapter";

const missing = ["12주 할 일과 매달 볼 숫자"];
const md = [
  "## 가격",
  "두 가지를 함께 확인합니다. 구체적인 확인 방법은 '12주 할 일과 매달 볼 숫자' 장에 있습니다. 원가는 따로 잽니다.",
  "",
  "관심 조사를 하는 방법은 ‘12주 할 일과 매달 볼 숫자’ 장에 있습니다.",
  "",
  "- 소량 출시 주차는 '12주 할 일과 매달 볼 숫자' 장의 순서로 정합니다(확인 필요).",
  "- 12주 할 일은 대표가 정합니다.",
  "| 할 일 | '12주 할 일과 매달 볼 숫자' 장 |",
].join("\n");
const cleaned = dropMissingReferences(md, missing, "markdown");
assert.equal(cleaned, ["## 가격", "두 가지를 함께 확인합니다. 원가는 따로 잽니다.", "", "- 12주 할 일은 대표가 정합니다.", "| 할 일 | '12주 할 일과 매달 볼 숫자' 장 |"].join("\n"));
// 있는 장을 가리키는 문장 · 빠진 장이 없을 때는 그대로
assert.equal(dropMissingReferences(md, ["가격 전략"], "markdown"), md);
assert.equal(dropMissingReferences(md, [], "markdown"), md);

const html = "<h3>가격</h3><p>함께 확인합니다. 방법은 '12주 할 일과 매달 볼 숫자' 장에 있습니다.</p><p>방법은 <strong>'12주 할 일과 매달 볼 숫자'</strong> 장에 있습니다.</p><ul><li>순서는 '12주 할 일과 매달 볼 숫자' 장에서 정합니다.</li><li>남는 항목</li></ul>";
assert.equal(dropMissingReferences(html, missing, "html"), "<h3>가격</h3><p>함께 확인합니다.</p><ul><li>남는 항목</li></ul>");

assert.equal(dropMissingReferences("<p>남는 문장. 방법은 &#39;12주 할 일과 매달 볼 숫자&#39; 장에 있습니다. 이것도 남는다.</p>", missing, "html"), "<p>남는 문장. 이것도 남는다.</p>");
// 화면에 이어져 있다 — 문서 위 알림과 '다시 만들기' 명령
const body = readFileSync(new URL("../app/plan/document/PlanDocumentBody.tsx", import.meta.url), "utf8");
assert.match(body, /dropMissingReferences\(/);
assert.match(readFileSync(new URL("../app/plan/document/DocumentWorkspace.tsx", import.meta.url), "utf8"), /sendStudioCommand\("plan-retry"\)/);
assert.match(readFileSync(new URL("../app/plan/chat/BusinessIntake.tsx", import.meta.url), "utf8"), /useStudioCommand\("plan-retry", startPrepare/);
console.log("missing-chapter ok");
