import assert from "node:assert/strict";
import { sectionSystemPrompt } from "../lib/plan-builder/section-generator";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";

const chapter = PLAN_BLUEPRINT[0], section = chapter.sections[0];
const base = { chapter, section, answers: {}, planType: "일반 사업계획서" };
// 사용자가 고른 이름은 문서가 '가칭·미확정'으로 쓰지 않도록 확정 사실로 전달한다(운영 테스트 2026-09-29)
const confirmed = sectionSystemPrompt({ ...base, business: { name: "카페피드", nameConfirmed: true } });
assert.match(confirmed, /사업명: 카페피드 \(사용자가 확정한 이름입니다/);
// 확정하지 않은 이름은 지금처럼 이름만 넘긴다
const working = sectionSystemPrompt({ ...base, business: { name: "동네 카페 인스타 대행" } });
assert.match(working, /사업명: 동네 카페 인스타 대행\n/);
assert.doesNotMatch(working, /확정한 이름/);

console.log(JSON.stringify({ passed: 3 }));
