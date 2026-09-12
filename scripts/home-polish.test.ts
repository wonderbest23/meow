import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyCoachReply, COACH_KEY, type CoachField, type CoachReply } from "../lib/plan-builder/coach";
import { checkCoachFeasibility } from "../lib/plan-builder/coach-feasibility";
import { coachDocumentSnapshot } from "../lib/plan-builder/coach-document";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

const field = (key: CoachField["key"], value: string, basis: CoachField["basis"] = "user"): CoachField => ({ key, value, basis, quote: value, messageId: "user-1" });
const reply: CoachReply = { message: "예산을 기준으로 정리할게요", stage: "startup", depth: "quick", title: "사진 촬영 서비스", fields: [field("budget", "100만원"), field("offer", "메뉴 사진 촬영 서비스", "proposal")], ready: false, suggestions: [] };
const coach = applyCoachReply(null, reply, { id: "user-1", role: "user", text: "시작 예산은 100만원이에요", at: "2026-09-12T00:00:00.000Z" });
assert.equal(coach.fields.find(f => f.key === "budget")?.basis, "user");
assert.equal(coach.fields.find(f => f.key === "offer")?.basis, "proposal");
const followup = applyCoachReply(coach, { ...reply, fields: [field("budget", "500만원", "proposal"), field("sales", "1000만원")] }, { id: "user-2", role: "user", text: "작게 시작하고 싶어요", at: "2026-09-12T00:01:00.000Z" });
assert.equal(followup.fields.find(f => f.key === "budget")?.value, "100만원", "AI proposals do not replace supplied conditions");
assert.ok(!followup.fields.some(f => f.key === "sales"), "An unsupported quotation does not become user-supplied information");

const budget = checkCoachFeasibility([field("budget", "100만원"), field("setupCost", "150만원")])[0];
assert.equal(budget.status, "attention");
assert.match(budget.detail, /500,000원/);
assert.equal(checkCoachFeasibility([field("budget", "100만원")])[0].status, "unknown", "Missing costs are not zero or a positive viability judgment");

const section = { markdown: "직접 고친 문장", html: "<p>직접 고친 문장</p>", generatedAt: "2026-09-12T00:00:00.000Z", coachRevision: 0 };
const plan: ServerPlan = { id: "home-proof", title: reply.title, planType: "일반 사업계획서", createdAt: section.generatedAt, updatedAt: section.generatedAt, answers: { [COACH_KEY]: { state: coach } }, sections: { "overview/summary": { ...section, edited: true } } };
const snapshot = coachDocumentSnapshot(plan)!;
assert.ok(snapshot.manualReview.length > 0, "Edited sections with an older business revision require review");
assert.ok(!snapshot.stale.includes("overview/summary"), "User-edited sections are not automatic regeneration candidates");
assert.equal(plan.sections["overview/summary"].markdown, section.markdown);
plan.sections["overview/summary"] = { ...section, locked: true };
assert.ok(coachDocumentSnapshot(plan)!.manualReview.length > 0, "Locked sections have the same protection");

const wall = readFileSync("components/home-result-showcase.tsx", "utf8");
const wallCss = readFileSync("components/home-result-showcase.module.css", "utf8");
assert.ok(wall.includes('className={styles.portraitViewport} data-portrait-viewport'));
assert.match(wallCss, /\.portraitViewport\s*\{[^}]*overflow:\s*clip/);
assert.match(wallCss, /@media \(max-width: 700px\)[\s\S]*transform-origin: center top/);
const demoCss = readFileSync("components/home-workspace-demo.module.css", "utf8");
assert.match(demoCss, /\.demo \.scrubber\s*\{[^}]*background:\s*transparent !important/);
assert.match(demoCss, /\.demo \.scrubber:focus-visible/);
const copy = readFileSync("components/home-service-overview.tsx", "utf8");
for (const text of ["입력 근거 대조", "별도 계산 로직", "문서 버전 비교", "50만원 부족", "외부 사실 검증은 아니에요"]) assert.ok(copy.includes(text), text);
assert.match(readFileSync("public/_headers", "utf8"), /\/home-media\/\*\s+Cache-Control: public,max-age=0,must-revalidate/, "Homepage assets revalidate after a new deployment");
console.log("Home polish: mobile clipping, transparent range and code-backed product examples passed");
