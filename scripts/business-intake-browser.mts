import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IntakePayload, IntakeSnapshot } from "../lib/plan-builder/intake-types";

const manifestPath = process.env.INTAKE_PREVIEW_MANIFEST;
const runtime = process.env.RUNTIME_NODE_MODULES;
assert(manifestPath && runtime, "Safe preview manifest and bundled Playwright runtime are required");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.synthetic, true); assert.equal(manifest.paidApisEnabled, false);
assert.equal(manifest.persistence, "demo-memory");
const origin = new URL(manifest.origin);
assert.equal(origin.hostname, "127.0.0.1"); assert.equal(origin.protocol, "http:");
const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "artifacts/business-intake", String(Date.now()));
await mkdir(output, { recursive: true });
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const browser = await chromium.launch({ headless: true });
const checks: string[] = [], errors: string[] = [], blockedExternal: string[] = [], timings: number[] = [], replyTimings: number[] = [];
let page: any;
const apiHeaders = { "x-business-intake": "2" };
async function snapshot(context: any, planId: string): Promise<IntakePayload> {
  const response = await context.request.get(`${origin.origin}/api/plan/chat?planId=${encodeURIComponent(planId)}`, { headers: apiHeaders });
  assert.equal(response.status(), 200); return response.json();
}
async function saved(action: () => Promise<unknown>): Promise<IntakePayload> {
  const response = page.waitForResponse((response: any) => response.url().includes("/api/plan/chat") && response.request().method() === "POST");
  response.catch(() => {});
  await action();
  const result = await response;
  const body = await result.json();
  assert.ok(result.ok(), `${result.status()} ${JSON.stringify(body)}`);
  await page.locator('[data-status="saved"], [data-status="draft"]').waitFor();
  await page.locator('[data-reply-typing]').waitFor({ state: "hidden" });
  return body;
}
/** Drive one question the way the select-first UI expects (spec §2): chips, presets, ladders and presets first; the composer only for the typing exceptions. */
async function prepareAnswer(q: IntakeSnapshot["nextQuestion"] & object, unknown: boolean): Promise<() => Promise<unknown>> {
  const button = (name: string | RegExp) => page.getByRole("button", { name, exact: typeof name === "string" });
  if (unknown) return () => button("아직 미정").click();
  const hybrid = q.kind === "text" && q.id !== "business" && q.id !== "period" && (q.options?.length ?? 0) > 0;
  if (q.kind === "multi") { await page.getByRole("checkbox").first().check(); return () => button(/^선택 완료\(\d+개\)$/).click(); }
  if (q.kind === "single") return () => page.getByRole("radio").first().locator("..").click();
  if (q.id === "period") return () => button("지난달").click();
  if (q.kind === "number" && q.unit === "원") {
    // space_hospitality price asks for a basis chip (시간당 · 1박 · 월 멤버십) before the ladder.
    if (q.options?.length) await page.locator('[data-chat-question] button[aria-pressed="false"]').first().click();
    // Range ladder → "정확히 입력" → 원-unit keypad. Only a "0원" chip would save from step 1, so skip it.
    const ranges = page.locator('[data-stage="ranges"] button').filter({ hasNot: page.getByText("0원", { exact: true }) });
    if (await ranges.count() > 0) { await ranges.first().click(); const exact = button("정확히 입력"); if (await exact.count() > 0) await exact.click(); }
    await button("원 단위").click();
    await page.locator(`#intake-exact-${q.id}`).fill(q.id === "price" ? "30000" : "0");
    return () => button("이 금액으로 저장").click();
  }
  if (q.kind === "number") {
    const presets = page.locator('[aria-label="자주 고르는 값"] button');
    if (await presets.count() > 0) return () => presets.first().click();
    await page.locator('[aria-label="값 조정"] input').fill("0");
    return () => button("이 값으로 저장").click();
  }
  if (hybrid) {
    // Tap the first available chip of each revealed step until the inline save is allowed (filter-only picks stay disabled).
    for (let step = 0; step < 4 && await button("이대로 저장").isDisabled(); step++) {
      const chip = page.locator('[data-chat-question] [role="group"]')
        .filter({ hasNot: page.locator('button[aria-pressed="true"]') })
        .locator('button[aria-pressed="false"]:enabled').first();
      if (await chip.count() === 0) break;
      await chip.click();
    }
    return () => button("이대로 저장").click();
  }
  await page.locator(`[id="intake-answer-${q.id}"]`).fill(q.id === "business" ? "지역 소상공인의 예약과 고객 문의를 정리하는 업무 지원 서비스" : "입력한 조건을 직접 확인하는 가상 사업 테스트");
  return () => button("보내기").click();
}
async function answer(plan: IntakeSnapshot, unknown = false): Promise<IntakeSnapshot> {
  const q = plan.nextQuestion!; assert(q);
  console.log(`Answering ${plan.intake.mode}:${q.id}`);
  const commit = await prepareAnswer(q, unknown);
  await page.evaluate(() => {
    const w = window as any;
    const initial = document.querySelector("#intake-question-heading")?.textContent;
    const count = document.querySelectorAll('[data-coach-message="user"]').length;
    w.__intakeRenderMs = null;
    w.__intakeReplyMs = null;
    w.__intakeTypingSeen = false;
    document.querySelector("#intake-input-panel")?.addEventListener("click", () => {
      const start = performance.now();
      const observer = new MutationObserver(() => {
        if (w.__intakeRenderMs === null && document.querySelectorAll('[data-coach-message="user"]').length > count) w.__intakeRenderMs = performance.now() - start;
        if (document.querySelector('[data-reply-typing]')) w.__intakeTypingSeen = true;
        const next = document.querySelector("#intake-question-heading")?.textContent;
        if (next && next !== initial || !next && !document.querySelector('[data-reply-typing]') && w.__intakeRenderMs !== null) {
          w.__intakeReplyMs = performance.now() - start; observer.disconnect();
        }
      });
      observer.observe(document.querySelector("#intake-input-panel")!, { childList: true, subtree: true, characterData: true });
      setTimeout(() => observer.disconnect(), 5000);
    }, { once: true });
  });
  const result = await saved(commit);
  const elapsed = await page.evaluate(() => (window as any).__intakeRenderMs);
  if (typeof elapsed === "number") timings.push(elapsed);
  const reply = await page.evaluate(() => ({ elapsed: (window as any).__intakeReplyMs, typing: (window as any).__intakeTypingSeen }));
  assert.equal(reply.typing, true, "A chat typing indicator precedes the next question");
  assert.ok(reply.elapsed >= 550 && reply.elapsed < 5000, `Unexpected reply pacing: ${reply.elapsed}`);
  replyTimings.push(reply.elapsed);
  return result.plan!;
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
  await context.route("**/*", (route: any) => {
    const url = new URL(route.request().url());
    if (url.hostname === "rsms.me") return route.fulfill({ contentType: "text/css", body: "/* Offline font fallback in isolated browser verification. */" });
    if (url.origin !== origin.origin) { blockedExternal.push(url.origin); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage(); page.on("pageerror", (error: Error) => errors.push(error.message));
  await page.goto(`${origin.origin}/plan/chat?new=1`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "생각한 사업이 있어요", exact: true }).waitFor();
  await page.locator('footer[aria-label="대화 입력창"]').waitFor();
  for (const width of [320, 390, 768, 1440]) {
    const height = width < 901 ? 692 : 900;
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: join(output, `welcome-${width}.png`), fullPage: true });
    const box = await page.locator("#intake-memo").boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= height, `Welcome composer not visible at ${width}`);
  }
  let result = await saved(() => page.getByRole("button", { name: "생각한 사업이 있어요", exact: true }).click());
  let plan = result.plan!;
  assert.equal(plan.intake.mode, "startup");
  for (const width of [320, 390, 768, 1440]) {
    const height = width < 901 ? 692 : 900;
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Question overflow at ${width}`);
    const composerBox = await page.locator('footer[aria-label="대화 입력창"]').boundingBox();
    const chatBox = await page.locator('[data-intake-conversation]').boundingBox();
    assert.ok(composerBox && chatBox && composerBox.y >= chatBox.y + chatBox.height - 1 && composerBox.y + composerBox.height <= height + 1, `Composer overlaps chat or falls outside viewport at ${width}`);
    await page.screenshot({ path: join(output, `question-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // PC 분할 손잡이: 실제 마우스 드래그로 대화 너비가 바뀌고 저장되며, 두 번 누르면 기본 너비로 돌아온다.
  const splitHandle = page.getByRole("separator", { name: "채팅 영역 너비 조절" });
  await splitHandle.waitFor();
  const shareBefore = Number(await splitHandle.getAttribute("aria-valuenow"));
  // hover()가 손잡이가 안정된 뒤 그 가운데로 마우스를 옮긴다(뷰포트 변경·개발 서버 재컴파일 직후의 좌표 어긋남 방지).
  await splitHandle.hover();
  const handleBox = (await splitHandle.boundingBox())!;
  const handleX = handleBox.x + handleBox.width / 2, handleY = handleBox.y + handleBox.height / 2;
  await page.mouse.down();
  await page.mouse.move(handleX - 190, handleY, { steps: 8 });
  await page.mouse.up();
  const shareAfter = Number(await splitHandle.getAttribute("aria-valuenow"));
  assert.ok(shareAfter <= shareBefore - 8, `Dragging the split handle narrows the chat (${shareBefore}% → ${shareAfter}%)`);
  assert.ok(Number(await page.evaluate(() => localStorage.getItem("oneulstart:intake-split:answering"))) > 0, "The dragged width is remembered for this phase");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Resizing causes no horizontal overflow");
  await splitHandle.dblclick();
  assert.equal(Number(await splitHandle.getAttribute("aria-valuenow")), shareBefore, "Double click restores the default width");
  let delayOnce = true;
  await page.route("**/api/plan/chat", async (route: any) => {
    if (!delayOnce || route.request().method() !== "POST") return route.continue();
    delayOnce = false;
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 450));
    return route.fulfill({ response });
  });
  plan = await answer(plan);
  assert.ok(timings[0] < 300, `Optimistic user bubble render took ${timings[0]}ms`);
  await page.unroute("**/api/plan/chat");
  plan = await answer(plan);
  assert.equal(await page.locator('[data-coach-message="user"]').count(), 3, "Mode choice and both answers remain in the chat");
  assert.equal(await page.locator('[data-chat-question="true"]').count(), 1, "Only the current question has live choices");
  const lastEdit = page.locator('[data-coach-message="user"] button').last();
  await lastEdit.click();
  assert.equal(await page.locator("#intake-answer-business").inputValue(), "지역 소상공인의 예약과 고객 문의를 정리하는 업무 지원 서비스");
  await page.getByRole("button", { name: "현재 질문으로", exact: true }).click();
  checks.push("User bubbles render under 300ms; typing precedes the next question by at least 550ms, independently of a 450ms save delay");
  assert.equal(await page.getByRole("button", { name: "이전 답변 수정", exact: true }).count(), 0);
  assert.equal(await page.locator('#intake-input-panel details').count(), 0);
  for (const width of [320, 390, 526, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 901 ? 762 : 900 });
    await page.waitForFunction(() => {
      const conversation = document.querySelector('[data-intake-conversation]')!.getBoundingClientRect();
      const messages = document.querySelectorAll('[data-coach-message="user"]');
      const answer = messages[messages.length - 1].getBoundingClientRect();
      const question = document.querySelector('#intake-question-heading')!.getBoundingClientRect();
      return answer.top >= conversation.top - 1 && answer.bottom < question.top && question.bottom <= conversation.bottom + 1;
    });
    await page.screenshot({ path: join(output, `chat-continuity-${width}.png`), fullPage: true });
  }
  checks.push("320/390/526/768/1440px keep the last user answer and next text question visible together, with no back button or history block in the thread");
  const planId = plan.planId;
  await page.locator("#intake-answer-customer").fill("첫 화면에서 고친 고객 정보");
  const second = await context.newPage();
  await second.goto(`${origin.origin}/plan/chat?planId=${planId}`, { waitUntil: "networkidle" });
  const other = await snapshot(context, planId);
  const changed = await context.request.post(`${origin.origin}/api/plan/chat`, { headers: { ...apiHeaders, "x-business-intake-owner": other.ownerScope! }, data: { action: "answer", planId, revision: other.plan!.coach.revision, requestId: crypto.randomUUID(), questionId: "customer", value: "두 번째 탭에서 저장한 고객" } });
  assert.equal(changed.status(), 200);
  const collision = page.waitForResponse((response: any) => response.url().includes("/api/plan/chat") && response.request().method() === "POST");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  assert.equal((await collision).status(), 409);
  await page.getByText("저장 충돌", { exact: true }).waitFor();
  await page.locator('[data-reply-typing]').waitFor({ state: "hidden" });
  assert.equal(await page.locator("#intake-answer-customer").inputValue(), "첫 화면에서 고친 고객 정보");
  await page.getByRole("button", { name: "최신 내용 불러오기", exact: true }).click();
  await page.getByText("입력 중 · 이 기기에 보관", { exact: true }).waitFor();
  const local = await snapshot(context, planId);
  assert.equal(local.plan!.coach.fields.find(field => field.key === "customer")?.value, "두 번째 탭에서 저장한 고객");
  checks.push("Two tabs conflict with 409; unsaved local input and the other tab's confirmed value both survive");
  await second.close();
  await page.reload({ waitUntil: "networkidle" });
  plan = (await snapshot(context, planId)).plan!;
  if (await page.getByRole("button", { name: "현재 질문으로", exact: true }).isVisible()) await page.getByRole("button", { name: "현재 질문으로", exact: true }).click();
  // The pending draft can be reviewed separately; continue the current unanswered question.
  const current = page.locator(`#intake-answer-${plan.nextQuestion!.id}`);
  await current.fill("저장 직후 연결 끊김 검증");
  let lostRequest: any;
  await page.route("**/api/plan/chat", async (route: any) => {
    if (route.request().method() !== "POST" || lostRequest) return route.continue();
    lostRequest = route.request().postDataJSON();
    await route.fetch(); return route.abort("failed");
  });
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await page.getByText("저장 실패", { exact: true }).waitFor();
  await page.locator('[data-reply-typing]').waitFor({ state: "hidden" });
  await page.unroute("**/api/plan/chat");
  await page.reload({ waitUntil: "networkidle" });
  await saved(() => page.getByRole("button", { name: "같은 요청 다시 확인", exact: true }).click());
  plan = (await snapshot(context, planId)).plan!;
  assert.equal(plan.coach.messages.filter(message => message.id === lostRequest.requestId).length, 1);
  checks.push("Lost response after a committed save survives reload and replays the exact request once");
  assert.equal(await page.getByRole("group", { name: "입력 방식" }).count(), 0);
  const composer = page.getByRole("textbox", { name: "대화 내용", exact: true });
  await composer.fill("예산: 100만원 고객: 주말 방문 서비스 이용자");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await page.getByRole("region", { name: "입력 내용 확인" }).waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 901 ? 762 : 900 });
    await page.waitForFunction(() => {
      const prompt = document.querySelector('[aria-label="입력 내용 확인"]')!.getBoundingClientRect();
      const conversation = document.querySelector('[data-intake-conversation]')!.getBoundingClientRect();
      return prompt.top >= conversation.top - 1 && prompt.bottom <= conversation.bottom + 1;
    });
    assert.equal(await page.locator('[data-chat-question]').count(), 0, "Intent confirmation replaces long question choices instead of hiding below them");
    await page.screenshot({ path: join(output, `intent-confirmation-${width}.png`), fullPage: true });
  }
  result = await saved(() => page.getByRole("button", { name: "메모로 남기기", exact: true }).click());
  assert.equal(result.plan!.intake.notes.at(-1)!.status, "stored");
  assert.match(result.plan!.intake.notes.at(-1)!.text, /주말/);
  const beforeQuestion = result.plan!.coreAnswered;
  await composer.fill("첫 고객을 만날 때 어떤 조건을 확인하면 좋을까요");
  result = await saved(() => page.getByRole("button", { name: "보내기", exact: true }).click());
  assert.equal(result.plan!.coreAnswered, beforeQuestion, "A consultation question is never the current field's confirmed answer");
  assert.equal(result.plan!.intake.notes.at(-1)!.intent, "question");
  assert.equal(result.plan!.intake.job, null);
  const unavailable = page.waitForResponse((response: any) => response.url().includes("/api/plan/chat") && response.request().method() === "POST");
  await page.getByRole("button", { name: "AI 답변 받기", exact: true }).click();
  assert.equal((await unavailable).status(), 503);
  await page.getByText(/AI 정리는 지금 연결되지 않았어요/).waitFor();
  plan = result.plan!;
  for (let count = 0; plan.nextQuestion && count < 12; count++) plan = await answer(plan);
  assert.equal(plan.coreComplete, true); assert.equal(plan.intake.job, null);
  assert.equal(plan.coach.fields.find(field => field.key === "price")?.value, "30000원", "Exact keypad entry stores a coachAmount-parsable price");
  assert.ok(!plan.coach.fields.some(field => /○○| \/ $|, $/.test(field.value)), "No placeholder or dangling separator reaches storage");
  checks.push("Missing API key retains a complex note and still permits all 11 core answers without AI, using chips, presets and ladders instead of typing");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 901 ? 692 : 900 });
    const summaryToggle = page.getByRole("button", { name: /^사업 요약/ });
    if (await summaryToggle.isVisible()) await summaryToggle.click();
    await page.locator("#intake-summary-heading").waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}`);
    await page.screenshot({ path: join(output, `summary-${width}.png`), fullPage: true });
    const backToChat = page.getByRole("button", { name: "대화로 돌아가기", exact: true });
    if (await backToChat.isVisible()) await backToChat.click();
    await page.screenshot({ path: join(output, `input-${width}.png`), fullPage: true });
  }
  checks.push("320/390/768/1440px layouts render without horizontal overflow; the mobile summary opens from the header toggle and returns to the chat");
  for (const [mode, label] of [["exploring", "아이디어를 찾고 있어요"], ["operating", "사업을 운영 중이에요"]]) {
    await page.goto(`${origin.origin}/plan/chat?new=1`, { waitUntil: "networkidle" });
    result = await saved(() => page.getByRole("button", { name: label, exact: true }).click());
    plan = result.plan!; assert.equal(plan.intake.mode, mode);
    for (let count = 0; plan.nextQuestion && count < 12; count++) plan = await answer(plan, mode === "operating" && plan.nextQuestion.id === "cost");
    assert.equal(plan.coreComplete, true);
    if (mode === "operating") assert.match(String(plan.intake.answers.period?.value), /^\d{4}-\d{2}-01 \/ \d{4}-\d{2}-\d{2}$/, "The 지난달 preset stores a whole calendar month");
    assert.equal(plan.coach.stage, mode === "operating" ? "operating" : "startup");
    assert.equal(plan.intake.job, null);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal((await snapshot(context, plan.planId)).plan!.coreComplete, true);
  }
  checks.push("Exploring and operating journeys finish and restore after reload; unknown cost is not zero");
  await page.goto(`${origin.origin}/plan/chat?new=1`, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 390, height: 692 });
  await page.locator("#intake-memo").fill("2d게임 만들어주는 웹사이트");
  await page.locator("#intake-memo").press("Shift+Enter");
  assert.ok(page.url().includes("new=1"), "Shift+Enter inserts a line break without sending");
  result = await saved(() => page.locator("#intake-memo").press("Enter"));
  const firstMessagePlan = (await snapshot(context, result.plan!.planId)).plan!;
  assert.equal(firstMessagePlan.coach.fields.find(field => field.key === "business")?.value, "2d게임 만들어주는 웹사이트");
  assert.equal(firstMessagePlan.coach.messages.length, 1);
  assert.equal(firstMessagePlan.intake.job, null);
  assert.equal(firstMessagePlan.nextQuestion?.id, "industry");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal((await snapshot(context, firstMessagePlan.planId)).plan!.coach.messages.length, firstMessagePlan.coach.messages.length);
  await page.locator("#intake-memo").fill("소프트웨어");
  result = await saved(() => page.getByRole("button", { name: "보내기", exact: true }).click());
  assert.equal(result.plan!.intake.sector, "software");
  assert.equal(result.plan!.nextQuestion?.id, "customer");
  assert.equal(result.plan!.intake.job, null);
  assert.equal(await page.locator("#intake-answer-customer").inputValue(), "");
  checks.push("At 390px, typing the first business and pressing Enter starts and stores it atomically; typed choices advance without AI, Shift+Enter stays a newline, and reload does not duplicate the message");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#intake-answer-customer").fill("모션 감소 설정 검증 고객");
  const reducedStart = Date.now();
  await saved(() => page.getByRole("button", { name: "보내기", exact: true }).click());
  assert.ok(Date.now() - reducedStart < 600, "Reduced motion skips the artificial reply delay");
  assert.equal(await page.locator('[data-chat-question]').evaluate((element: HTMLElement) => getComputedStyle(element).animationName), "none");
  checks.push("Reduced motion disables entry animation and skips the 600ms visual pacing");
  await page.goto(`${origin.origin}/plan/chat?new=1`, { waitUntil: "networkidle" });
  await page.locator("#intake-memo").fill("50만원으로 SNS컨설팅");
  result = await saved(() => page.locator("#intake-memo").press("Enter"));
  const industryPlanId = result.plan!.planId;
  assert.equal(result.plan!.intake.answers.industry, undefined, "A recommendation is not a confirmed industry");
  assert.equal(result.plan!.intake.job, null);
  await page.getByRole("group", { name: "추천 업종", exact: true }).getByText("기업 서비스", { exact: true }).waitFor();
  assert.equal(await page.getByRole("radio").count(), 0, "The full list is initially collapsed");
  for (const width of [320, 390, 526, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 901 ? 762 : 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole("button", { name: "이 업종으로 계속", exact: true }).waitFor();
    await page.screenshot({ path: join(output, `industry-recommendation-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "직접 선택하기", exact: true }).click();
  assert.equal(await page.getByRole("radio").count(), 11);
  result = await saved(() => page.getByRole("radio", { name: /^교육 · 코칭/ }).locator("..").click());
  assert.equal(result.plan!.intake.sector, "education");
  assert.equal(result.plan!.nextQuestion?.id, "customer");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal((await snapshot(context, industryPlanId)).plan!.intake.sector, "education", "Manual override survives reload instead of reverting to the inferred industry");
  await page.getByRole("button", { name: "업종 답변 수정", exact: true }).click();
  assert.equal(await page.getByRole("radio", { name: /^교육 · 코칭/ }).isChecked(), true);
  assert.equal(await page.getByRole("button", { name: "이 업종으로 계속", exact: true }).count(), 0);
  await page.getByRole("button", { name: "현재 질문으로", exact: true }).click();
  await page.goto(`${origin.origin}/plan/chat?new=1`, { waitUntil: "networkidle" });
  await page.locator("#intake-memo").fill("카페 사장님을 위한 SNS 컨설팅");
  result = await saved(() => page.locator("#intake-memo").press("Enter"));
  const beforeConfirmation = result.plan!.coach.messages.length;
  result = await saved(() => page.getByRole("button", { name: "이 업종으로 계속", exact: true }).dblclick());
  assert.equal(result.plan!.intake.sector, "b2b_service");
  assert.equal(result.plan!.nextQuestion?.id, "customer");
  assert.equal((await snapshot(context, result.plan!.planId)).plan!.coach.messages.length, beforeConfirmation + 1, "Double click confirms once");
  assert.equal(result.plan!.intake.job, null);
  await page.goto(`${origin.origin}/plan/chat?new=1`, { waitUntil: "networkidle" });
  await page.locator("#intake-memo").fill("카페와 온라인 쇼핑몰을 함께 운영");
  result = await saved(() => page.locator("#intake-memo").press("Enter"));
  assert.equal(await page.getByRole("radio").count(), 11);
  assert.equal(await page.getByRole("button", { name: "이 업종으로 계속", exact: true }).count(), 0);
  assert.equal(result.plan!.intake.answers.industry, undefined);
  checks.push("Industry recommendation uses confirmed text without AI or auto-saving; manual selection, reload, edit, ambiguity fallback and double-click confirmation are safe at 320/390/526/768/1440px");
  await page.goto(`${origin.origin}/plan/chat?new=1`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "대화 내용" }).fill("카페가 괜찮을까요?");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  assert.ok(page.url().includes("new=1"));
  await page.getByText("이 기기에 보관 중", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("카페가 괜찮을까요?", { exact: true }).waitFor();
  result = await saved(() => page.getByRole("button", { name: "아이디어를 찾고 있어요", exact: true }).click());
  assert.equal(result.plan!.coach.fields.length, 0);
  assert.equal(result.plan!.intake.notes.at(-1)!.text, "카페가 괜찮을까요?");
  assert.equal(result.plan!.intake.job, null);
  await page.getByRole("textbox", { name: "대화 내용" }).fill("아직 보내지 않은 내용");
  await page.route("**/api/plan/chat?*", (route: any) => route.fulfill({ status: 500, contentType: "text/html", body: "" }));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText(/서버가 응답을 완료하지 못했어요/).waitFor();
  assert.equal(await page.getByText(/Unexpected end of JSON/).count(), 0);
  await page.unroute("**/api/plan/chat?*");
  await page.getByRole("button", { name: "최신 내용 불러오기", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "대화 내용" }).inputValue(), "아직 보내지 않은 내용");
  checks.push("One composer preserves unclassified questions and compound notes without AI; empty 500 responses show a safe error and retry restores the unsubmitted draft");
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(blockedExternal.length, 0, `Unexpected external browser requests: ${blockedExternal.join(",")}`);
  assert.ok(timings.length > 10 && Math.max(...timings) < 300, `Client render timings: ${timings.join(",")}`);
  await context.close();
} catch (error) {
  if (page) { await page.screenshot({ path: join(output, "failure.png"), fullPage: true }).catch(() => {}); await writeFile(join(output, "failure.txt"), await page.locator("body").innerText().catch(() => "")); }
  errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await browser.close();
  const report = { checks, errors, blockedExternal, userBubbleTimingsMs: timings, replyTimingsMs: replyTimings, output, synthetic: true, paidCalls: 0 };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
assert.equal(errors.length, 0, "Browser verification failed; inspect report.json");
