import assert from "node:assert/strict";
import { firstSteps } from "../lib/plan-builder/first-steps";

const html = `<p>앞 글</p><table><thead><tr><th>항목</th><th>내용</th></tr></thead><tbody><tr><td>가</td><td>나</td></tr></tbody></table>
<table><thead><tr><th>주차</th><th>할 일</th><th>걸리는 시간</th><th>끝났다고 볼 기준</th></tr></thead><tbody>
<tr><td>1주</td><td>조사 글을 <strong>올립니다</strong> &amp; 묻습니다</td><td>약 4시간</td><td>글을 올림</td></tr>
<tr><td>2주</td><td>시험 조리</td><td>약 8시간</td><td>비용을 적음</td></tr><tr><td>3주</td><td>둘러보기</td><td>약 4시간</td><td>3곳 적음</td></tr><tr><td>4주</td><td>넷째</td><td></td><td></td></tr></tbody></table>`;
assert.deepEqual(firstSteps(html), [
  { week: "1주", task: "조사 글을 올립니다 & 묻습니다", time: "약 4시간", done: "글을 올림" },
  { week: "2주", task: "시험 조리", time: "약 8시간", done: "비용을 적음" },
  { week: "3주", task: "둘러보기", time: "약 4시간", done: "3곳 적음" },
], "takes the first three rows of the 12-week table, not another table");
assert.deepEqual(firstSteps("<table><tr><th>항목</th><th>내용</th></tr></table>"), [], "no 12-week table → no steps");
assert.deepEqual(firstSteps("<table><tr><th>주차</th><th>할 일</th></tr><tr><td>1주</td><td>하나</td></tr></table>"), [{ week: "1주", task: "하나", time: "", done: "" }], "missing columns stay empty");
console.log("first steps: passed");
