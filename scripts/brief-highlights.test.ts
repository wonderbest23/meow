import assert from "node:assert/strict";
import { briefTextParts } from "../lib/plan-builder/coach-presentation";

const text = "시험 가격은 6만원, 예산은 100만원입니다. 주 5시간 안에 사진 2장과 문구 1개를 제작해요. 기존 고객은 0명입니다.";
const parts = briefTextParts(text);
assert.equal(parts.map(part => part.text).join(""), text, "강조해도 원문을 변경하지 않음");
assert.deepEqual(parts.filter(part => part.highlight).map(part => part.text), ["6만원", "100만원", "주 5시간", "2장", "1개", "0명"]);
assert.equal(briefTextParts("99,000원 · 1.5시간").filter(part => part.highlight).length, 2);
assert.equal(briefTextParts("고객은 아직 없습니다.").some(part => part.highlight), false, "수치를 추측하지 않음");
assert.equal(briefTextParts("1원 ".repeat(12)).filter(part => part.highlight).length, 6, "과도한 강조 제한");
assert.equal(briefTextParts("1원 ".repeat(12)).map(part => part.text).join(""), "1원 ".repeat(12));
assert.deepEqual(briefTextParts(""), []);
console.log("brief highlights: passed");
