import assert from "node:assert/strict";
import { sectionSystemPrompt } from "../lib/plan-builder/section-generator";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";

const chapter = PLAN_BLUEPRINT[0], section = chapter.sections[0];
// 상세 계획서가 논문처럼 어렵다는 피드백(2026-10) — 모든 섹션이 쉬운 문장 규칙을 받는다
for (const planType of ["일반 사업계획서", "예비창업패키지 (PSST)"]) {
  const prompt = sectionSystemPrompt({ chapter, section, answers: {}, planType });
  assert.match(prompt, /\[읽기 쉬운 문장\]/, planType);
  assert.match(prompt, /중학생도 한 번 읽고 이해할 수 있는 말/);
  assert.match(prompt, /'타깃 세그먼트'→'주요 고객'/);
  assert.match(prompt, /처음 나올 때 괄호로 쉽게 풀어/);
}
console.log("plain-language prompt: passed");
