import assert from "node:assert/strict";
import { completedDocumentKey } from "../lib/plan-builder/coach-document";
import { chaptersForType } from "../lib/plan-builder/blueprint";
import { COACH_KEY, COACH_TYPES } from "../lib/plan-builder/coach";
import { emptyCoach } from "../lib/plan-builder/coach-job";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

const keys = chaptersForType(COACH_TYPES.startup).flatMap(c => c.sections.map(s => `${c.id}/${s.id}`));
const plan: ServerPlan = { id: "completion-test", title: "사업안", planType: COACH_TYPES.startup, createdAt: "2026-09-09", updatedAt: "2026-09-09", answers: {}, sections: Object.fromEntries(keys.map(key => [key, { markdown: "본문", html: "<p>본문</p>", generatedAt: "2026-09-09", coachRevision: 0 }])) };
assert.ok(completedDocumentKey(plan));
const edited = structuredClone(plan); edited.sections[keys[0]].edited = true; edited.sections[keys[0]].generatedAt = "2026-09-10";
assert.equal(completedDocumentKey(edited), completedDocumentKey(plan), "자동 저장은 새 제작 완료로 표시하지 않음");
const partial = structuredClone(plan); delete partial.sections[keys[0]];
assert.equal(completedDocumentKey(partial), null, "일부 문서는 완성 아님");
const stale = structuredClone(plan); stale.answers[COACH_KEY] = { state: { ...emptyCoach(), documentRevision: 2 } };
assert.equal(completedDocumentKey(stale), null, "이전 사업안으로 작성한 문서는 완료 알림 제외");
for (const section of Object.values(stale.sections)) { section.coachRevision = 2; }
assert.ok(completedDocumentKey(stale));
stale.sections[keys[0]].edited = true; stale.sections[keys[0]].coachRevision = 1;
assert.equal(completedDocumentKey(stale), null, "수동 수정 검토가 필요한 문서도 제외");
console.log("Document completion: full, partial, stale and manual review states passed.");
