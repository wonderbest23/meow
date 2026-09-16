import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { renderToStaticMarkup } from "react-dom/server";
import type { CoachState } from "../lib/plan-builder/coach";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";
import type { IntakeCandidate, IntakeCommand, IntakeSnapshot } from "../lib/plan-builder/intake-types";
import { createIntake, intakeSnapshot } from "../lib/plan-builder/intake-core";
import { coreQuestions, detailQuestions, intakeSectorOptions } from "../lib/plan-builder/intake-questions";
import { candidateConflict, draftKey, emptyAnswer, emptyDraft, entryMessage, needsPolling, parseDraft, persistDraft, plainText, previewIntakeAnswer, readIntakePayload, readableFinancialSummary, settleDraft, shouldAcceptSnapshot, suggestedIntakeIndustry, typedChoiceAnswer, typedEntryCommand } from "../app/plan/chat/intake-ui/model";

const scope = "test-owner-guest";
const id = "plan_ui-fixture";
const at = "2026-09-16T03:00:00.000Z";
const command = (overrides: Partial<IntakeCommand> = {}): IntakeCommand => ({ action: "answer", planId: id, requestId: "e72bf3c0-70de-49f3-9cb7-c322290f530a", revision: 2, questionId: "business", value: "소규모 매장의 예약 업무를 돕는 소프트웨어", ...overrides });

function fixture(mode: "exploring" | "startup" | "operating" = "startup"): IntakeSnapshot {
  const coach: CoachState = { version: "fixture", revision: 2, documentRevision: 1, stage: mode, depth: "quick", fields: [], messages: [], ready: false, suggestions: [], business: { name: "내 사업 구상", description: "", role: "", industry: "", region: "", stage: "사업 기획" } };
  const plan: ServerPlan = { id, title: "내 사업 구상", planType: "일반 사업계획서", createdAt: at, updatedAt: at, sections: {}, answers: {} };
  return intakeSnapshot(plan, coach, createIntake(coach, mode, at));
}

async function main() {
  const original = fixture();
  assert.deepEqual(typedEntryCommand(" 2d게임 만들어주는 웹사이트 "), { action: "start", mode: "startup", questionId: "business", value: "2d게임 만들어주는 웹사이트" });
  assert.deepEqual(typedEntryCommand("아이디어가 없어요"), { action: "start", mode: "exploring" });
  assert.deepEqual(typedEntryCommand("사업을 운영 중이에요"), { action: "start", mode: "operating" });
  assert.equal(typedEntryCommand("작은 카페를 운영 중이에요").mode, "operating");
  assert.equal(typedEntryCommand("카페를 운영 중인 건 아니에요").mode, "startup");
  assert.equal(entryMessage({ memo: "이미 보낸 내용", introMessage: "이미 보낸 내용" }), "이미 보낸 내용");
  assert.equal(entryMessage({ memo: "추가 내용", introMessage: "이전 내용" }), "이전 내용\n추가 내용");
  assert.equal(typedChoiceAnswer(original, original.nextQuestion!, "소프트웨어"), "software");
  assert.equal(typedChoiceAnswer(original, original.nextQuestion!, "카페"), "food_beverage");
  assert.equal(typedChoiceAnswer(original, original.nextQuestion!, "무슨 업종인지 잘 모르겠어요"), undefined);
  assert.deepEqual(typedChoiceAnswer(fixture("exploring"), fixture("exploring").nextQuestion!, "소프트웨어, 카페"), ["software", "food_beverage"]);
  const originalJson = JSON.stringify(original);
  const businessSnapshot = (text: string) => previewIntakeAnswer(original, command({ value: text }))!;
  for (const [text, expected] of [
    ["50만원으로 SNS컨설팅", "b2b_service"],
    ["2d게임 만들어주는 웹사이트", "software"],
    ["동네 커피 카페", "food_beverage"],
    ["스마트스토어에서 생활용품 온라인 판매", "retail_commerce"],
    ["맞춤 가구 제조 공장", "manufacturing"],
    ["40만원으로 SNS 강의 수업", "education"],
    ["방문 청소 서비스", "local_service"],
    ["모임 공간 대관", "space_hospitality"],
    ["지역 물류 배송 대행", "logistics"],
    ["브랜드 영상 촬영", "content_media"],
    ["아직 이름 없는 새로운 사업", null],
    ["카페 사장님을 위한 SNS 컨설팅", "b2b_service"],
    ["소프트웨어 개발 강의", "education"],
    ["홈페이지 제작 대행", "b2b_service"],
    ["카페 고객 관리 앱", "software"],
    ["카페와 온라인 쇼핑몰을 함께 운영", null],
    ["소프트웨어가 아닌 카페", null],
    ["카페 그리고 교육", null],
  ] as const) assert.equal(suggestedIntakeIndustry(businessSnapshot(text))?.value ?? null, expected, text);
  const suggestedBusiness = businessSnapshot("50만원으로 SNS컨설팅");
  const beforeSuggestion = JSON.stringify(suggestedBusiness);
  assert.equal(suggestedIntakeIndustry(suggestedBusiness)?.label, "기업 서비스");
  assert.equal(JSON.stringify(suggestedBusiness), beforeSuggestion, "A recommendation does not confirm or save an industry");
  assert.equal(suggestedBusiness.intake.answers.industry, undefined);
  assert.equal(suggestedIntakeIndustry(original), null);
  assert.equal(suggestedIntakeIndustry({ ...original, coach: { ...original.coach, fields: [{ key: "business", value: "커피 카페", basis: "proposal", quote: "", messageId: "proposal-only" }] } }), null, "Unconfirmed AI suggestions are not classification evidence");
  assert.equal(suggestedIntakeIndustry({ ...suggestedBusiness, coach: { ...suggestedBusiness.coach, fields: [...suggestedBusiness.coach.fields, { key: "offer", value: "커피 판매", basis: "user", quote: "커피 판매", messageId: "confirmed-offer" }] } }), null, "Conflicting confirmed business and offer require a manual choice");
  const preview = previewIntakeAnswer(original, command({ questionId: "industry", value: "software" }))!;
  assert.equal(preview.nextQuestion?.id, "business");
  assert.equal(preview.coreAnswered, 1);
  assert.equal(preview.coach.revision, 3);
  assert.equal(JSON.stringify(original), originalJson, "Local preview must not mutate the server snapshot");
  assert.equal(previewIntakeAnswer(original, command({ revision: 1 })), null, "Do not preview an uncertain request against a different revision");
  const skipped = previewIntakeAnswer(original, command({ questionId: "industry", value: null, unknown: true }))!;
  assert.equal(skipped.nextQuestion?.id, "business");
  assert.equal(skipped.intake.answers.industry.status, "unknown");
  assert.throws(() => previewIntakeAnswer(original, command({ questionId: "industry", value: "invented" })));
  assert.throws(() => previewIntakeAnswer(fixture("operating"), command({ questionId: "period", value: "2026-12-31 / 2026-01-01" })));
  assert.throws(() => previewIntakeAnswer(original, command({ questionId: "hoursPerWeek", value: 169 })));
  const zero = previewIntakeAnswer(original, command({ questionId: "budget", value: "0" }))!;
  assert.equal(zero.intake.answers.budget.status, "answered", "Zero is a real answer, not unknown");
  assert.equal(zero.coach.fields.find(field => field.key === "budget")?.value, "0원");

  const timings: number[] = [];
  for (let index = 0; index < 100; index++) {
    const start = performance.now();
    previewIntakeAnswer(original, command({ questionId: "industry", value: "software" }));
    timings.push(performance.now() - start);
  }
  const p95 = timings.sort((a, b) => a - b)[94];
  assert.ok(p95 < 300, `Next-question local preview p95 ${p95.toFixed(1)}ms exceeds 300ms`);

  const answer = { text: "원래 입력", selected: [], custom: false };
  const pending = { command: command(), answer };
  const draft = { ...emptyDraft(), ownerScope: scope, answers: { business: answer }, pending };
  const encoded = JSON.stringify(draft);
  assert.equal(parseDraft(encoded, id, scope).pending?.command.requestId, pending.command.requestId);
  assert.equal(parseDraft(encoded, id, "different-account").pending, null);
  assert.equal(parseDraft(encoded, "different-plan", scope).pending, null);
  assert.equal(parseDraft(encoded, id).pending, null, "Never restore unscoped pending requests");
  assert.equal(parseDraft("bad json", id, scope).pending, null);
  assert.notEqual(draftKey(id, scope), draftKey(id, "another-owner"));
  assert.notEqual(draftKey(id, scope), draftKey("another-plan", scope));
  const memory = new Map();
  assert.equal(persistDraft(draftKey(id, scope), draft, memory, () => { throw new Error("Storage blocked"); }), false);
  assert.equal(memory.get(draftKey(id, scope))?.answers.business.text, "원래 입력", "A blocked storage getter must retain the in-memory draft");
  assert.equal(persistDraft(draftKey(id, scope), draft, memory, () => ({ setItem: () => { throw new Error("Quota exceeded"); } })), false);
  assert.equal(memory.get(draftKey(id, scope))?.pending.command.requestId, pending.command.requestId);
  assert.equal(persistDraft(draftKey(id, scope), draft, memory, () => ({ setItem: () => {} })), true);
  const settled = settleDraft(draft, pending);
  assert.equal(settled.answers.business, undefined);
  assert.equal(settled.pending, null);
  const typedDuringSave = settleDraft({ ...draft, answers: { business: { ...answer, text: "전송 후 바꾼 내용" }, customer: { ...answer, text: "다음 질문 입력" } } }, pending);
  assert.equal(typedDuringSave.answers.business.text, "전송 후 바꾼 내용");
  assert.equal(typedDuringSave.answers.customer.text, "다음 질문 입력");
  assert.equal(typedDuringSave.editingId, "business");
  const nextQuestionDraft = settleDraft({ ...draft, answers: { business: answer, customer: { ...answer, text: "입력 중인 다음 답변" } } }, pending);
  assert.equal(nextQuestionDraft.answers.customer.text, "입력 중인 다음 답변");
  assert.equal(settleDraft({ ...draft, editingId: "business" }, pending).editingId, null, "A saved existing answer releases its editing question");
  assert.equal(settleDraft({ ...draft, editingId: "customer" }, pending).editingId, "customer", "Do not override a user-selected editor while saving another question");
  const custom = { text: "후보 대신 직접 구상", selected: [], custom: true };
  assert.equal(settleDraft({ ...draft, answers: { candidate: custom } }, { command: command(), answer: custom }).answers.candidate, undefined);
  assert.equal(settleDraft({ ...draft, memo: "새 메모" }, { command: command({ action: "message" }), text: "이전 메모" }).memo, "새 메모");
  const intro = { ...emptyDraft(), ownerScope: scope, introMessage: "커피 가게를 시작하고 싶어요" };
  assert.equal(parseDraft(JSON.stringify(intro), null, scope).introMessage, intro.introMessage);
  assert.equal(settleDraft(intro, { command: command({ action: "start" }) }).introMessage, intro.introMessage, "Selecting a stage must not discard the first typed message");
  assert.equal(settleDraft(intro, { command: command({ action: "message" }), text: intro.introMessage }).introMessage, null);
  assert.equal(settleDraft(intro, { command: command({ action: "message" }), text: "다른 메시지" }).introMessage, intro.introMessage);
  const typedPending = { command: command({ action: "start" }), text: intro.introMessage, intro: intro.introMessage };
  const typedSettled = settleDraft({ ...intro, memo: intro.introMessage! }, typedPending);
  assert.equal(typedSettled.memo, ""); assert.equal(typedSettled.introMessage, null);
  assert.equal(settleDraft({ ...intro, memo: "저장 중에 추가 입력" }, typedPending).memo, "저장 중에 추가 입력");
  assert.equal(settleDraft({ ...emptyDraft(), memo: "소프트웨어" }, { command: command({ questionId: "industry", value: "software" }), text: "소프트웨어" }).memo, "");

  const running = { id: "job", runId: "run", kind: "extract" as const, status: "running" as const, noteIds: [], baseValues: {}, baseDocumentRevision: 1, updatedAt: at };
  const active = { ...original, intake: { ...original.intake, job: running } };
  assert.equal(needsPolling(active), true);
  const completed = { ...active, intake: { ...active.intake, job: { ...running, status: "complete" as const } } };
  assert.equal(needsPolling(completed), false);
  assert.equal(needsPolling({ ...completed, intake: { ...completed.intake, notes: [{ id: "queued", text: "메모", at, status: "queued" }] } }), true);
  assert.equal(needsPolling({ ...completed, intake: { ...completed.intake, notes: [{ id: "failed", text: "메모", at, status: "failed" }] } }), false);
  assert.equal(needsPolling({ ...completed, pendingExtraction: true }), false, "Pending review is not an active job");

  const candidate: IntakeCandidate = { id: "candidate1", fieldKey: "business", value: "추출한 새 값", quote: "메모의 원문", noteId: "note1", baseValue: "이전 값", status: "pending" };
  const withBusiness = { ...original, coach: { ...original.coach, fields: [{ key: "business" as const, value: "직접 수정한 값", basis: "user" as const, messageId: "answer1", quote: "직접 수정한 값" }] } };
  assert.deepEqual(candidateConflict(withBusiness, candidate), { current: "직접 수정한 값", changed: true, requiresOverwrite: true });
  assert.equal(candidateConflict(withBusiness, { ...candidate, value: "직접 수정한 값" }).requiresOverwrite, false);
  assert.equal(candidateConflict(original, candidate).requiresOverwrite, true, "Deletion during extraction also requires consent");
  assert.equal(shouldAcceptSnapshot(original, { ...original, coach: { ...original.coach, revision: 1 } }), false);
  assert.equal(shouldAcceptSnapshot(original, { ...original, updatedAt: "2026-09-15T00:00:00.000Z" }), false);
  assert.equal(shouldAcceptSnapshot(original, { ...original, planId: "other" }), false);
  assert.equal(shouldAcceptSnapshot(original, { ...original, coach: { ...original.coach, revision: 3 } }), true);
  assert.equal(readIntakePayload({ flowVersion: 2, enabled: true, ownerScope: scope, code: "owner_changed" })?.code, "owner_changed");
  assert.equal(readIntakePayload({ flowVersion: 2, enabled: true, login: true })?.plan, null);
  assert.equal(readIntakePayload({ plan: original }), null);
  assert.equal(plainText("[처음 구상] 예약 관리"), "[처음 구상] 예약 관리");
  assert.equal(plainText('{"numbers":[1,2]}'), "");
  assert.ok(!readableFinancialSummary({ ...original, financialSummary: '{"internal":true}' }).includes("internal"));
  const money = { ...original, financialSummary: "", coach: { ...original.coach, fields: [{ key: "budget" as const, value: "100만원", basis: "user" as const, messageId: "budget", quote: "100만원" }] } };
  assert.match(readableFinancialSummary(money), /준비 예산: 100만원/);
  assert.match(readableFinancialSummary(money), /0원으로 계산하지/);

  const require = createRequire(import.meta.url);
  const css = readFileSync(new URL("../app/plan/chat/intake.module.css", import.meta.url), "utf8");
  const cssClasses = Object.fromEntries([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map(match => [match[1], match[1]]));
  require.extensions[".css"] = module => { module.exports = cssClasses; };
  const { EntryChoices, QuestionForm, BusinessSummary, ConversationHistory, ExtractionReview, SavedNotes, AnswerHistory, ReplyTyping } = await import("../app/plan/chat/intake-ui/IntakePanels");
  const noop = () => {};
  const entry = renderToStaticMarkup(<EntryChoices disabled={false} onStart={noop} />);
  assert.equal((entry.match(/<button/g) ?? []).length, 3);
  for (const label of ["아이디어를 찾고 있어요", "생각한 사업이 있어요", "사업을 운영 중이에요"]) assert.ok(entry.includes(label));
  assert.ok(entry.includes("data-coach-welcome"), "The original chat welcome is reused");
  const firstMessage = renderToStaticMarkup(<EntryChoices initialMessage="먼저 적은 사업 이야기" disabled={false} onStart={noop} />);
  assert.ok(firstMessage.indexOf("먼저 적은 사업 이야기") < firstMessage.indexOf("대화 시작 선택지"), "Typed introduction precedes the stage choices inside the conversation");
  const form = (snapshot: IntakeSnapshot, question = snapshot.nextQuestion!, value = emptyAnswer(), disabled = false) => renderToStaticMarkup(<QuestionForm question={question} snapshot={snapshot} draft={value} editing={false} disabled={disabled} onChange={noop} onAnswer={noop} onCancel={noop} />);
  const sectorMarkup = form(original);
  for (const sector of intakeSectorOptions) assert.ok(sectorMarkup.includes(sector.label), sector.label);
  assert.ok(sectorMarkup.includes(original.nextQuestion!.prompt));
  assert.equal((sectorMarkup.match(/type="radio"/g) ?? []).length, intakeSectorOptions.length);
  const exploring = fixture("exploring");
  assert.equal((form(exploring).match(/type="checkbox"/g) ?? []).length, intakeSectorOptions.length);
  const candidateQuestion = coreQuestions("exploring").find(question => question.id === "candidate")!;
  const candidateMarkup = form(exploring, candidateQuestion);
  for (const idea of exploring.candidateIdeas) { assert.ok(candidateMarkup.includes(idea.title)); assert.ok(candidateMarkup.includes(idea.description)); }
  assert.ok(form(exploring, candidateQuestion, { ...emptyAnswer(), custom: true }).includes("<textarea"));
  const numericMarkup = form(original, coreQuestions("startup").find(question => question.id === "budget")!, { ...emptyAnswer(), text: "0" });
  assert.ok(numericMarkup.includes('inputMode="decimal"'));
  assert.ok(numericMarkup.includes("단위: 원"));
  const activeQuestion = coreQuestions("startup").find(question => question.id === "business")!;
  assert.ok(!form(active, activeQuestion, answer).includes("disabled="), "An active extraction job does not disable answer submission");
  const savingMarkup = form(active, activeQuestion, answer, true);
  assert.ok(savingMarkup.includes("disabled="));
  assert.ok(!savingMarkup.match(/<textarea[^>]*disabled/), "Network save can block commits, never typing");
  assert.ok(form(original, detailQuestions("software")[1]).includes("출시·제공 중"));
  const chatQuestion = renderToStaticMarkup(<QuestionForm inChat question={activeQuestion} snapshot={original} draft={emptyAnswer()} editing={false} disabled={false} onChange={noop} onAnswer={noop} onCancel={noop} />);
  assert.ok(chatQuestion.includes("data-chat-question"));
  assert.ok(!chatQuestion.includes("<textarea"), "The live question uses the persistent bottom composer rather than an inline survey field");
  assert.ok(!chatQuestion.includes("답변 저장"), "Submission lives in the bottom composer");
  assert.equal((chatQuestion.match(/<button/g) ?? []).length, 1, "The text question has one clear alternate action: unknown");
  assert.ok(chatQuestion.includes('class="unknownButton"'));
  assert.ok(!chatQuestion.includes("이전 답변 수정"));
  const recommendedQuestion = renderToStaticMarkup(<QuestionForm inChat question={original.nextQuestion!} snapshot={suggestedBusiness} draft={emptyAnswer()} editing={false} disabled={false} onChange={noop} onAnswer={noop} onCancel={noop} />);
  for (const text of ["이 업종으로 정리할까요", "기업 서비스", "이 업종으로 계속", "직접 선택하기"]) assert.ok(recommendedQuestion.includes(text));
  assert.ok(!recommendedQuestion.includes('type="radio"'), "The long industry list is collapsed until explicitly opened");
  const industryEdit = renderToStaticMarkup(<QuestionForm inChat question={original.nextQuestion!} snapshot={suggestedBusiness} draft={{ ...emptyAnswer(), selected: ["education"] }} editing disabled={false} onChange={noop} onAnswer={noop} onCancel={noop} />);
  assert.ok(industryEdit.includes('type="radio"'));
  assert.ok(!industryEdit.includes("이 업종으로 계속"), "Existing industry edits are not replaced by the automatic recommendation");
  const typing = renderToStaticMarkup(<ReplyTyping />);
  assert.ok(typing.includes('role="status"'));
  assert.ok(typing.includes('aria-label="다음 질문 준비 중"'));
  assert.equal((typing.match(/<i>/g) ?? []).length, 3);
  const chatHistory = renderToStaticMarkup(<ConversationHistory snapshot={preview} onEdit={noop} />);
  assert.equal((chatHistory.match(/data-coach-message="user"/g) ?? []).length, 2);
  assert.ok(chatHistory.includes(original.nextQuestion!.prompt));
  assert.ok(chatHistory.includes("업종 답변 수정"));
  const review = renderToStaticMarkup(<ExtractionReview snapshot={{ ...withBusiness, intake: { ...withBusiness.intake, candidates: [candidate] } }} disabled={false} onCommand={noop} />);
  for (const text of ["현재 값", "직접 수정한 값", "추출한 새 값", "현재 값을 이 내용으로 바꾸기", "선택 제외", "선택 반영"]) assert.ok(review.includes(text));
  const summarized = previewIntakeAnswer(original, command())!;
  summarized.coreComplete = true; summarized.hasDocuments = true;
  summarized.coach.design = { status: "proposal", sourceRevision: 1, approach: "new-concept", startingPlan: { scope: "AI가 제안한 시작 범위", connectionToVision: "구상과의 관계", whyThis: "제안 이유", notIncluded: [] }, alternatives: [], assumptions: [], nextAction: { action: "다음 행동", doneWhen: "완료 기준", usableText: "사용할 문구" } };
  const summary = renderToStaticMarkup(<BusinessSummary snapshot={summarized} disabled aiBusy prepared={false} onEdit={noop} onDetails={noop} onDesign={noop} onPrepare={noop} />);
  for (const text of ["입력한 사업 요약", "소규모 매장의 예약 업무를 돕는 소프트웨어", "AI가 제안한 시작 범위", "상세 질문 4개 추가", "이 내용으로 사업안 만들기", "계획서 만들기"]) assert.ok(summary.includes(text));
  assert.ok(summary.includes(`/plan/document?planId=${id}`), "Existing artifacts stay navigable even during AI jobs");
  assert.ok(!summary.includes("AI 준비 완료"));
  const noteMarkup = renderToStaticMarkup(<SavedNotes snapshot={{ ...original, intake: { ...original.intake, notes: [{ id: "n", text: "사용자가 남긴 원문", at, status: "failed" }] } }} disabled={false} onExtract={noop} />);
  assert.ok(noteMarkup.includes("사용자가 남긴 원문"));
  assert.ok(noteMarkup.includes("메모 원문은 저장되어 있습니다"));
  const orphan = renderToStaticMarkup(<AnswerHistory snapshot={original} drafts={{ "food_beverage.signatureMenu": { ...emptyAnswer(), text: "업종 변경 전 입력한 대표 메뉴", label: "대표 메뉴" } }} onEdit={noop} onKeepAsMemo={noop} />);
  assert.ok(orphan.includes("업종 변경 전 입력한 대표 메뉴"));
  assert.ok(orphan.includes("자유 메모로 가져오기"));
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /minmax\(0, 1fr\)/);
  assert.ok(!/letter-spacing:\s*-/.test(css));
  const source = readFileSync(new URL("../app/plan/chat/BusinessIntake.tsx", import.meta.url), "utf8");
  assert.match(source, /"x-business-intake-owner": ownerScope.current/);
  assert.match(source, /action: "extract-pending"/);
  assert.match(source, /note.status === "queued"/);
  assert.match(source, /input && draftRef.current.pending/);
  assert.match(source, /replaceState\(null, "", target\)/, "Next's URL wrapper must receive non-internal history state");
  assert.match(source, /if \(stored && previousKey !== storageKey.current\)/, "Keep the old backup if plan-scoped storage fails");
  assert.match(source, /freezeForOwnerChange = useCallback\(\(\) => \{\s*routeEpoch.current \+= 1/);
  assert.ok(!source.includes("setInterval(() => void send"));
  assert.match(source, /enterKeyHint="send"/);
  assert.match(source, /!event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229/);
  assert.ok(!source.includes('window.matchMedia("(min-width:901px)").matches'), "Sending with Enter must not depend on the viewport width");
  const conversationMarkup = source.slice(source.indexOf('<main ref={inputPane}'), source.indexOf('</main>'));
  assert.ok(!conversationMarkup.includes("<AnswerHistory"), "Answer history belongs in the summary, not below the next chat question");
  assert.match(source, /finishReply\(pending.command.requestId, saved\)/, "Failed saves must cancel question reveal");
  assert.match(source, /box.bottom - visibleAnswer/, "Auto-scroll preserves the last user answer, not just the next question");
  const transition = readFileSync(new URL("../app/plan/chat/intake-ui/use-reply-transition.ts", import.meta.url), "utf8");
  assert.match(transition, /prefers-reduced-motion: reduce/);
  assert.match(transition, /active.current\?\.requestId !== requestId/);
  assert.match(transition, /saved \? Math.max\(0, readyAt.current - performance.now\(\)\) : 0/);
  console.log(`business-intake-ui: ownership, pending retries, optimistic rollback inputs, question controls, extraction consent, source summary, artifact links passed; local next-question p95 ${p95.toFixed(2)}ms`);
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
