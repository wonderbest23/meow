import assert from "node:assert/strict";
import { fieldsForSection, sanitizeSiteCopy, EDIT_SECTIONS } from "../lib/site-copy/domain";

// 2026-10-23 새 첫 화면은 새 자리(promptHome.*)를 쓴다 — 예전 자리(chatHome.*)에 저장된 옛 문구가 새 제목을 덮지 않게
assert.deepEqual(EDIT_SECTIONS.map(section => section.id), ["promptHome"]);
assert.deepEqual(fieldsForSection("promptHome").map(field => field.id), [
  "promptHome.title",
  "promptHome.subtitle",
]);
const title = fieldsForSection("promptHome").find(field => field.id === "promptHome.title")!.def;
assert.equal(title, "생각이 사업이\n되는 순간", "Headline keeps its two intentional lines");
const subtitle = fieldsForSection("promptHome").find(field => field.id === "promptHome.subtitle")!.def;
assert.match(subtitle, /사업계획서와 홈페이지, 개업 준비까지/);
assert.equal(sanitizeSiteCopy({ texts: { "promptHome.subtitle": "예산 1,000만원. 내 사업을 시작해요." }, hidden: [] }).texts["promptHome.subtitle"], "예산 1,000만원. 내 사업을 시작해요.", "Do not strip punctuation from administrator-authored content");
assert.deepEqual(sanitizeSiteCopy({
  texts: {
    "chatHome.title": "오늘창업",
    "chatHome.subtitle": "가능성은 가볍게 묻고\n시작은 구체적으로",
    "promptHome.title": "새로운 사업 이름",
    "promptHome.subtitle": "내 사업을 구체적으로",
  },
  hidden: ["chatHome.title"],
}), {
  texts: {
    "promptHome.title": "새로운 사업 이름",
    "promptHome.subtitle": "내 사업을 구체적으로",
  },
  hidden: [],
});
// 기본 문구와 같은 값은 저장하지 않는다
assert.deepEqual(sanitizeSiteCopy({ texts: { "promptHome.title": title }, hidden: [] }).texts, {});
console.log("home copy: passed (new hero copy keys, old chatHome overrides ignored)");
