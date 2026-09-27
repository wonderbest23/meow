import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createIntake, intakeDocumentStatus, intakeSnapshot } from "../lib/plan-builder/intake-core";
import type { CoachState } from "../lib/plan-builder/coach";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";
import { mentionedAnswer, undecidedHelp, resultUpdateNotice, resumeSummary, composerEnterSends } from "../app/plan/chat/intake-ui/guidance";
import { emptyAnswer, emptyDraft, intakeNextStep, parseDraft, previewIntakeAnswer } from "../app/plan/chat/intake-ui/model";
import { parseIntakeNote } from "../lib/plan-builder/intake-note-parser";

const at = "2026-09-26T03:00:00.000Z";
const noFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error("NO_NETWORK_IN_GUIDANCE"); };
function fixture(description = "직장인에게 온라인 강의를 제공하고 싶어요", notes: string[] = []) {
  const coach: CoachState = { version: "fixture", revision: 2, documentRevision: 2, stage: "startup", depth: "quick", fields: [{ key: "business", value: description, quote: description, messageId: "business-entry", basis: "user" }], messages: [{ id: "business-entry", role: "user", text: description, at }], ready: true, suggestions: [], business: { name: "합성 사업", description, role: "", industry: "", region: "", stage: "사업 기획" } };
  const plan: ServerPlan = { id: "plan-guidance-fixture", title: "합성 사업", planType: "일반 사업계획서", createdAt: at, updatedAt: at, sections: {}, answers: {} };
  const intake = createIntake(coach, "startup", at);
  intake.notes = notes.map((text, i) => ({ id: `note-${i}`, text, at, status: "stored", intent: "memo" }));
  return { coach, plan, intake, snapshot: intakeSnapshot(plan, coach, intake, at) };
}
let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`PASS ${name}`); };
try {
  check("explicit audience is quoted, never confirmed automatically", () => {
    const { snapshot } = fixture();
    const before = JSON.stringify(snapshot);
    const q = snapshot.questions.find(q => q.id === "customer")!;
    assert.equal(mentionedAnswer(snapshot, q)?.value, "직장인");
    assert.equal(mentionedAnswer(snapshot, q)?.quote, "직장인에게 온라인 강의를 제공하고 싶어요");
    assert.equal(JSON.stringify(snapshot), before);
    assert.equal(snapshot.intake.answers.customer, undefined);
    const accepted = previewIntakeAnswer(snapshot, { action: "answer", planId: snapshot.planId, requestId: "explicit-user-confirmation", revision: snapshot.coach.revision, questionId: "customer", value: "직장인" })!;
    assert.equal(accepted.intake.answers.customer.value, "직장인");
    assert.equal(mentionedAnswer(accepted, q), null);
  });
  check("negation, third party, past, hypothetical and conflicting sources do not suggest an answer", () => {
    for (const text of ["직장인에게 제공하는 건 아니에요", "친구가 직장인에게 강의를 팔아요", "예전에 직장인에게 강의를 팔았어요", "직장인에게 강의를 팔면 어떨까요?", "직장인에게 말고 학생에게 제공할래요"]) {
      const { snapshot } = fixture(text);
      assert.equal(mentionedAnswer(snapshot, snapshot.questions.find(q => q.id === "customer")!), null, text);
    }
    for (const notes of [["고객: 대학생"], ["직장인은 제외해 주세요"], ["고객: 미정"]]) {
      const { snapshot } = fixture(undefined, notes);
      assert.equal(mentionedAnswer(snapshot, snapshot.questions.find(q => q.id === "customer")!), null);
    }
  });
  check("shared exact-label parser preserves zero, ranges and units; unsupported periods stay unconfirmed", () => {
    for (const value of ["0원", "100~300만원", "3천만원"]) {
      const { snapshot } = fixture("교육 서비스", [`예산: ${value}`]);
      assert.equal(mentionedAnswer(snapshot, snapshot.questions.find(q => q.id === "budget")!)?.value, value);
      assert.equal(parseIntakeNote(`예산: ${value}`, "note-test").candidates[0].value, value);
    }
    for (const value of ["미정", "모름", "100달러", "월 30만원", "300~100만원"]) {
      const { snapshot } = fixture("교육 서비스", [`예산: ${value}`]);
      assert.equal(mentionedAnswer(snapshot, snapshot.questions.find(q => q.id === "budget")!), null, value);
    }
    const { snapshot } = fixture("온라인 강의를 제공해요");
    assert.equal(mentionedAnswer(snapshot, snapshot.questions.find(q => q.id === "channel")!), null, "online delivery is not a customer acquisition channel");
  });
  check("dismissed suggestions restore only inside their owner-scoped draft", () => {
    const draft = { ...emptyDraft(), ownerScope: "owner-a", answers: { customer: { ...emptyAnswer(), dismissedMention: "customer:source:직장인" } } };
    assert.equal(parseDraft(JSON.stringify(draft), "plan-guidance-fixture", "owner-a").answers.customer.dismissedMention, "customer:source:직장인");
    assert.deepEqual(parseDraft(JSON.stringify(draft), "plan-guidance-fixture", "owner-b").answers, {});
    assert.deepEqual(parseDraft(JSON.stringify({ ...draft, answers: { customer: { ...emptyAnswer(), dismissedMention: {} } } }), "plan-guidance-fixture", "owner-a").answers, {});
  });
  check("unknown help uses current catalogue examples, does not fabricate numeric evidence", () => {
    const { snapshot } = fixture();
    const q = snapshot.questions.find(q => q.id === "customer")!;
    const before = JSON.stringify(snapshot);
    const help = undecidedHelp(q);
    assert.ok(help.examples.length > 0 && help.examples.length <= 3);
    assert.ok(help.examples.every(label => q.options?.some(option => option.label === label)));
    assert.deepEqual(undecidedHelp(snapshot.questions.find(q => q.id === "budget")!).examples, []);
    assert.equal(JSON.stringify(snapshot), before);
  });
  check("document freshness follows stored source revision including mixed and locked sections", () => {
    const { plan, coach } = fixture();
    assert.equal(intakeDocumentStatus(plan, coach), "none");
    const section = { markdown: "합성 원문", html: "<p>합성 원문</p>", generatedAt: at, coachRevision: 2 };
    plan.sections.one = section;
    assert.equal(intakeDocumentStatus(plan, coach), "current");
    plan.sections.two = { ...section, coachRevision: 1, locked: true };
    const before = JSON.stringify(plan);
    assert.equal(intakeDocumentStatus(plan, coach), "stale");
    assert.equal(JSON.stringify(plan), before, "a notice never rewrites a locked section");
    delete plan.sections.two;
    delete plan.sections.one.coachRevision;
    assert.equal(intakeDocumentStatus(plan, coach), "unverified");
  });
  check("edited source does not claim old documents were updated; updating remains an explicit action", () => {
    const { snapshot } = fixture();
    snapshot.coreComplete = true;
    for (const q of snapshot.questions) snapshot.intake.answers[q.id] ??= { status: "unknown", value: null, at, messageId: `unknown-${q.id}` };
    snapshot.hasDocuments = true;
    snapshot.documentStatus = "current";
    snapshot.coach.design = { status: "proposal", sourceRevision: 2, approach: "new-concept", startingPlan: { scope: "합성 범위", connectionToVision: "관계", whyThis: "이유", notIncluded: [] }, alternatives: [], assumptions: [], nextAction: { action: "확인", doneWhen: "완료", usableText: "예시" } };
    assert.equal(resultUpdateNotice(snapshot), null);
    assert.equal(intakeNextStep(snapshot), "open");
    const changed = previewIntakeAnswer(snapshot, { action: "answer", planId: snapshot.planId, requestId: "edit-customer", revision: 2, questionId: "customer", value: "소상공인" })!;
    assert.equal(changed.documentStatus, "stale");
    assert.match(resultUpdateNotice(changed)!, /기존 계획서.*변경 전/);
    assert.equal(intakeNextStep(changed), "design");
    changed.coach.design!.sourceRevision = changed.coach.documentRevision!;
    assert.equal(intakeNextStep(changed), "prepare", "new design does not turn the previous document into a current one");
    assert.equal(changed.intake.job, null, "no automatic regeneration or provider call");
  });
  check("resume recap uses saved question labels, no speculative progress", () => {
    const { snapshot } = fixture();
    assert.match(resumeSummary(snapshot), /사업 소개까지 남겼어요/);
    assert.ok(resumeSummary(snapshot).includes(snapshot.nextQuestion!.label));
    snapshot.nextQuestion = null;
    assert.match(resumeSummary(snapshot), /마무리 단계/);
  });
  check("mobile Return, IME and Shift+Enter never submit; desktop Enter still does", () => {
    const enter = { key: "Enter", shiftKey: false };
    assert.equal(composerEnterSends(enter, true), false);
    assert.equal(composerEnterSends({ ...enter, isComposing: true }, false), false);
    assert.equal(composerEnterSends({ ...enter, keyCode: 229 }, false), false);
    assert.equal(composerEnterSends({ ...enter, shiftKey: true }, false), false);
    assert.equal(composerEnterSends(enter, false), true);
    assert.equal(composerEnterSends({ ...enter, key: "a" }, false), false);
  });
  check("client parser stays separate from provider implementation", () => {
    const parser = readFileSync(new URL("../lib/plan-builder/intake-note-parser.ts", import.meta.url), "utf8");
    assert.doesNotMatch(parser, /llm\/|completeJson|fetch\(/);
    assert.equal(fetchCalls, 0);
  });
  console.log(JSON.stringify({ suite: "business-intake-guidance", passed, failed: 0, fetchCalls }));
} finally { globalThis.fetch = noFetch; }
