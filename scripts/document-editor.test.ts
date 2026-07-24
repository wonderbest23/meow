import assert from "node:assert/strict";
import {
  appendDocumentDraftVersion,
  inspectDocumentDraft,
  replaceDocumentSection,
  splitDocumentSections,
} from "../lib/delivery/document-drafts";
import { localizeDeliveryText } from "../lib/delivery/package-assembler";

const original = [
  "> 문서 안내",
  "",
  "# 사업 요약",
  "",
  "처음 만든 설명입니다.",
  "",
  "## 고객 문제",
  "",
  "고객이 오래 기다립니다.",
  "",
  "## 가격",
  "",
  "| 항목 | 금액 |",
  "| --- | ---: |",
  "| 첫 상품 | 100,000원 |",
].join("\n");

const sections = splitDocumentSections(original);
assert.deepEqual(sections.map((section) => section.title), ["문서 안내", "사업 요약", "고객 문제", "가격"]);

const customerSection = sections.find((section) => section.title === "고객 문제");
assert(customerSection);
const revised = replaceDocumentSection(original, customerSection, "고객은 신청 결과를 확인하기 위해 평균 시간을 직접 기록해야 합니다.");
assert.match(revised, /평균 시간을 직접 기록해야 합니다/);
assert.match(revised, /\| 첫 상품 \| 100,000원 \|/);

const first = appendDocumentDraftVersion(undefined, revised, "고객 문제 수정", "2026-07-15T01:00:00.000Z");
const second = appendDocumentDraftVersion(first, `${revised}\n\n실행 기준을 추가했습니다.`, "실행 기준 추가", "2026-07-15T02:00:00.000Z");
assert.equal(second.versions.length, 2);
assert.equal(second.versions.at(-1)?.version, 2);
assert.equal(second.markdown, second.versions.at(-1)?.markdown);

const audit = inspectDocumentDraft(second.markdown);
assert.equal(audit.suspicious, 0);
assert.equal(audit.emptySections, 0);

const unsafe = inspectDocumentDraft(`${second.markdown}\n\n업계 1위 100% 보장 example.com`);
assert(unsafe.suspicious >= 3);

const localized = localizeDeliveryText("sole_proprietor · validated · CAC · [verify]");
assert.equal(localized, "개인사업자 · 근거 충분 · 고객 1명 확보비용 · [확인 필요]");

console.log("document editor domain tests passed");
