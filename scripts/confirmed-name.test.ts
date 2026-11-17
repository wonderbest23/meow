import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adoptRenamedTitle } from "../lib/plan-builder/business-name";
import { buildUserPrompt, sectionReviewSource, sectionSystemPrompt } from "../lib/plan-builder/section-generator";
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

// 섹션 검토도 확정한 이름을 원천 자료로 받는다 — 사업 정보가 시스템 지시문에만 있어 검토가 본문의 확정 상호를
// 디자인의 이름 후보 목록에 맞춰 '상호 미정, 제안 후보: …'로 고쳤다(실제 AI 점검 2026-10-23 망원 골목반찬)
const coachInput = { ...base, coachContext: JSON.stringify({ design: { identity: { label: "망원 반찬가게", names: [{ name: "망원 골목반찬", why: "동네" }, { name: "오늘반찬", why: "매일" }] } } }), business: { name: "망원 골목반찬", nameConfirmed: true } };
assert.ok(!buildUserPrompt(coachInput).includes("확정한 이름"), "the writer's user prompt carries no business block (it is in the cached system prompt)");
const reviewSource = sectionReviewSource(coachInput);
assert.match(reviewSource, /사업명: 망원 골목반찬 \(사용자가 확정한 이름입니다/);
assert.ok(reviewSource.includes(buildUserPrompt(coachInput)), "the review still sees everything the writer's user prompt had");
assert.equal(sectionReviewSource({ ...coachInput, business: undefined }), buildUserPrompt(coachInput), "no business info: same source as before");

// 머리줄에서 직접 바꾼 이름(제목)은 확정 이름으로 받는다 — 앞 답을 고치거나 사업 방향을 다시 정리해도 AI 이름으로 돌아가지 않게(점검 2026-11-16)
const renamed = { business: { name: "직접 확인 필요 기준의 합성", nameConfirmed: false } };
assert.equal(adoptRenamedTitle({ title: " 멍멍간식 " }, renamed), true);
assert.deepEqual(renamed.business, { name: "멍멍간식", nameConfirmed: true });
assert.equal(adoptRenamedTitle({ title: "멍멍간식" }, renamed), false, "같은 이름이면 그대로");
for (const placeholder of ["새 사업", "새 사업 구상", "새 플랜", "", "  "]) {
  const draft = { business: { name: "동네 반찬", nameConfirmed: false } };
  assert.equal(adoptRenamedTitle({ title: placeholder }, draft), false, `임시 이름 '${placeholder}'은 확정 이름이 아니다`);
  assert.deepEqual(draft.business, { name: "동네 반찬", nameConfirmed: false });
}
const service = readFileSync(new URL("../lib/plan-builder/intake-service.ts", import.meta.url), "utf8");
assert.match(service, /if \(plan && previous && savedIntake\) adoptRenamedTitle\(plan, coach\);[\s\S]*plan\.title = coach\.business\.name;/, "대화 저장은 제목을 덮어쓰기 전에 직접 바꾼 이름을 받는다");
assert.match(service, /adoptRenamedTitle\(_plan, coach\);\n\s*if \(!coach\.business\.nameConfirmed && design\.identity\?\.label(?: && _intake\.mode !== "operating")?\)/, "사업 방향 정리도 직접 바꾼 이름을 지킨다");
// 머리줄 '이름 바꾸기'는 열린 대화에 '이름 정하기'로 넘긴다
assert.match(readFileSync(new URL("../app/plan/studio/StudioBars.tsx", import.meta.url), "utf8"), /renamePlan\(planId, trimmed\);[\s\S]*requestPlanRename\(planId, trimmed\);/);
assert.match(readFileSync(new URL("../app/plan/chat/BusinessIntake.tsx", import.meta.url), "utf8"), /handlePlanRename\(\(planId, title\) => \{[\s\S]*void sendRef\.current\(\{ action: "name", value: name \}\);/);

console.log(JSON.stringify({ passed: 14 }));
