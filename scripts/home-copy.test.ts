import assert from "node:assert/strict";
import { fieldsForSection, sanitizeSiteCopy } from "../lib/site-copy/domain";

assert.deepEqual(fieldsForSection("chatHome").map(field => field.id), [
  "chatHome.title",
  "chatHome.subtitle",
]);
const subtitle = fieldsForSection("chatHome").find(field => field.id === "chatHome.subtitle")!.def;
assert.equal(subtitle.split("\n").length, 2, "Hero supporting copy keeps its two intentional lines");
assert.doesNotMatch(subtitle, /[,.·“”]/, "Default marketing text does not need decorative punctuation");
assert.equal(sanitizeSiteCopy({ texts: { "chatHome.subtitle": "예산 1,000만원. 내 사업을 시작해요." }, hidden: [] }).texts["chatHome.subtitle"], "예산 1,000만원. 내 사업을 시작해요.", "Do not strip punctuation from administrator-authored content");
assert.deepEqual(sanitizeSiteCopy({
  texts: {
    "chatHome.eyebrow": "대화로 만드는 내 사업계획서",
    "chatHome.title": "새로운 사업 이름",
    "chatHome.subtitle": "내 사업을 구체적으로",
  },
  hidden: ["chatHome.eyebrow"],
}), {
  texts: {
    "chatHome.title": "새로운 사업 이름",
    "chatHome.subtitle": "내 사업을 구체적으로",
  },
  hidden: [],
});
console.log("home copy: passed (removed eyebrow, editable title and subtitle)");
