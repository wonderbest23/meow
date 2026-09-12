import assert from "node:assert/strict";
import { htmlToMarkdown } from "../lib/plan-builder/html-to-markdown";
import { renderPlanMarkdown } from "../lib/plan-builder/markdown";

async function main() {
  const html = '<table><thead><tr><th><p>항목</p></th><th><p>내용</p></th></tr></thead><tbody><tr><td><p>상품</p></td><td><p>소개글 3개</p><p>수정 1회 | 전달</p></td></tr><tr><td><p>가격</p></td><td><p>5만원</p></td></tr></tbody></table>';
  const markdown = htmlToMarkdown(html);
  assert.ok(markdown.includes('소개글 3개<br>수정 1회 \\| 전달'));
  assert.equal(markdown.split('\n').filter(line => line.startsWith('|')).length, 4);
  const rendered = await renderPlanMarkdown(markdown);
  assert.equal((rendered.match(/<table\b/g) ?? []).length, 1);
  assert.equal((rendered.match(/<tr\b/g) ?? []).length, 3);
  assert.ok(rendered.includes('소개글 3개<br>수정 1회 | 전달'));
  console.log('document table roundtrip: multiple paragraphs, escaped pipes and row structure passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
