import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer, { type Page } from "puppeteer-core";
import { applyCoachReply, COACH_KEY, COACH_TYPES, readCoach } from "../lib/plan-builder/coach";
import { applyExpertPatch, expertPatchSchema, EXPERT_HISTORY_KEY } from "../lib/plan-builder/coach-expert";
import { LAUNCH_KEY, launchSchema, launchSteps, launchStatus, quoteTotals } from "../lib/plan-builder/business-launch";
import type { Plan, PlanState } from "../lib/plan-builder/plan-store";

const EMPTY_BUSINESS = { name: "", description: "", role: "", industry: "", region: "", stage: "" };

const at = new Date().toISOString();
const coach = applyCoachReply(null, { title: "동네 가게 메뉴 사진 제작", message: "첫 사업안을 준비했어요.", stage: "startup", depth: "quick", ready: true, suggestions: [], fields: [
  { key: "business", value: "가게 메뉴 사진을 만들고 싶어요", basis: "user", quote: "가게 메뉴 사진을 만들고 싶어요", messageId: "first" },
  { key: "offer", value: "메뉴 사진 5장 촬영과 편집", basis: "proposal", quote: "", messageId: "" },
  { key: "customer", value: "동네 음식점", basis: "proposal", quote: "", messageId: "" },
  { key: "price", value: "99,000원", basis: "proposal", quote: "", messageId: "" },
] }, { id: "first", role: "user", at, text: "가게 메뉴 사진을 만들고 싶어요" });
const plan: Plan = { id: "launch-test", title: coach.business.name, createdAt: at, updatedAt: at, planType: COACH_TYPES.startup, answers: { [COACH_KEY]: { state: coach } }, sections: { "overview/summary": { markdown: "기존에 직접 수정한 본문", html: "<p>기존에 직접 수정한 본문</p>", generatedAt: at, edited: true, coachRevision: coach.documentRevision } } };
const patch = expertPatchSchema.parse({ planId: plan.id, revision: coach.revision, requestId: "64eb3322-3614-4ddd-a43c-a87c69d84a30", fields: [{ key: "price", value: "120,000원" }] });
const updated = applyExpertPatch(plan.answers, patch, at);
assert.equal(updated.coach.documentRevision, coach.documentRevision! + 1);
assert.equal(updated.coach.fields.find(f => f.key === "price")?.basis, "user");
assert.equal(updated.coach.fields.find(f => f.key === "offer")?.basis, "proposal", "수정하지 않은 제안은 사실로 승격하지 않음");
assert.equal((updated.answers[EXPERT_HISTORY_KEY].entries as unknown[]).length, 1);
assert.equal(applyExpertPatch(updated.answers, { ...patch, revision: updated.coach.revision }, at).changes.length, 0, "같은 값은 문서 버전을 올리지 않음");
assert.throws(() => applyExpertPatch(updated.answers, patch, at), /REVISION_CONFLICT/);
assert.equal(expertPatchSchema.safeParse({ ...patch, fields: [patch.fields[0], patch.fields[0]] }).success, false);
const ideas = launchSchema.parse({ purpose: "ideas" });
assert.deepEqual(launchSteps(plan, ideas).map(s => s.id), ["offer"], "아이디어 검토는 등록 요구 없음");
const remote = launchSchema.parse({ workplace: "remote", registered: "yes" });
assert.ok(!launchSteps(plan, remote).some(s => ["registration", "workplace"].includes(s.id)));
const shared = launchSchema.parse({ workplace: "shared", registered: "no" });
assert.ok(launchSteps(plan, shared).some(s => s.id === "workplace"));
const step = launchSteps(plan, remote)[0];
remote.records[step.id] = { status: "done", signature: step.signature, material: step.material, note: "메모 유지", at };
assert.equal(launchStatus(remote, step), "done");
assert.equal(launchStatus(remote, launchSteps({ ...plan, answers: updated.answers }, remote)[0]), "review");
assert.equal(remote.records[step.id].note, "메모 유지");
assert.equal(quoteTotals({ name: "견적", monthly: "50,000", deposit: "100,000", initial: "0" })?.outflow, 700000);
assert.equal(quoteTotals({ name: "견적", monthly: "", deposit: "0", initial: "0" }), null);
assert.equal(quoteTotals({ name: "견적", monthly: "1,,2", deposit: "0", initial: "0" }), null);
console.log("expert changes, versioning, launch branching and quotation unit tests: passed");

async function click(page: Page, label: string) {
  for (const el of await page.$$("button")) if (await el.evaluate((e, text) => e.textContent?.trim() === text && e.getBoundingClientRect().width > 0, label)) { await el.click(); return; }
  throw new Error(`Missing button ${label}`);
}
async function type(page: Page, selector: string, text: string) {
  await page.$eval(selector, (el, value) => { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }, text);
}
async function main() {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("artifacts/business-launch", { recursive: true });
  try { for (const width of [320, 390, 1440]) {
    const context = await browser.createBrowserContext(); const page = await context.newPage();
    await page.setViewport({ width, height: 900 });
    let server: PlanState = { business: EMPTY_BUSINESS, plans: [structuredClone(plan)], activePlanId: plan.id };
    let posts = 0; const errors: string[] = [];
    page.on("pageerror", e => errors.push(String(e)));
    await page.setRequestInterception(true);
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      const respond = (body: unknown, status = 200) => void request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (path === "/api/plan/state") { if (request.method() === "PUT") { server = { ...server, ...JSON.parse(request.postData() || "{}") }; respond({ ok: true }); } else respond({ ...server, authenticated: false }); return; }
      if (path === "/api/plan/access") { respond({ paid: false }); return; }
      if (path === "/api/plan/chat") { if (request.method() === "POST") posts++; respond({ plan: null, runStatus: null }); return; }
      if (path === "/api/plan/expert") {
        const input = expertPatchSchema.parse(JSON.parse(request.postData()!));
        const p = server.plans[0];
        if (readCoach(p.answers)!.revision !== input.revision) { respond({ message: "다른 화면에서 바뀌었어요." }, 409); return; }
        const result = applyExpertPatch(p.answers, input, new Date().toISOString());
        server.plans[0] = { ...p, answers: result.answers, title: result.coach.business.name, updatedAt: new Date().toISOString() };
        respond({ plan: server.plans[0] }); return;
      }
      void request.continue();
    });
    await page.goto(`http://localhost:8083/plan/workspace?planId=${plan.id}`, { waitUntil: "networkidle0", timeout: 90000 });
    await page.waitForSelector('[aria-label="사업 편집 모드"]');
    await click(page, "전문가");
    const priceGroup = await page.$$("summary"); for (const el of priceGroup) if (await el.evaluate(e => e.textContent === "가격과 비용")) await el.click();
    await type(page, 'textarea[aria-label="판매 가격"]', "120,000원");
    await click(page, "변경 내용 확인");
    assert.ok(await page.$eval('[aria-label="사업 요약"]', el => el.textContent?.includes("99,000원") && el.textContent.includes("120,000원")));
    await click(page, "변경 내용 저장");
    await page.waitForFunction(() => document.body.textContent?.includes("사업 정보를 저장했어요"));
    assert.equal(server.plans[0].sections["overview/summary"].markdown, "기존에 직접 수정한 본문");
    assert.equal(readCoach(server.plans[0].answers)!.fields.find(f => f.key === "price")!.value, "120,000원");
    await page.screenshot({ path: `artifacts/business-launch/expert-${width}.png` });
    await click(page, "사업 시작하기");
    await click(page, "새 사업을 시작할게요"); await click(page, "다음");
    await click(page, "별도 사무실은 필요 없어요"); await click(page, "다음");
    await click(page, "이미 등록했어요"); await click(page, "내 과정 보기");
    await page.waitForSelector('textarea[aria-label="실행 메모"]');
    await type(page, 'textarea[aria-label="실행 메모"]', "사진 5장 상품으로 시작");
    await click(page, "준비했어요 · 다음");
    await page.waitForFunction(() => document.body.textContent?.includes("작게 시작할 범위를 정해요"));
    assert.equal((server.plans[0].answers[LAUNCH_KEY].records as Record<string, { note: string }>).offer.note, "사진 5장 상품으로 시작");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.textContent?.includes("작게 시작할 범위를 정해요"));
    await click(page, "나중에 할게요");
    await page.waitForFunction(() => document.body.textContent?.includes("세금 관리 방법을 정해요"));
    await page.screenshot({ path: `artifacts/business-launch/step-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(posts, 0, "준비 완료/건너뛰기로 AI 호출·문서 생성하지 않음");
    const launch = launchSchema.parse(server.plans[0].answers[LAUNCH_KEY]);
    assert.equal(launch.records.operations.status, "skipped");
    assert.equal(Object.keys(server.plans[0].sections).length, 1);
    assert.deepEqual(errors, []);
    console.log(`launch and expert UI ${width}: passed (mock APIs)`);
    await context.close();
  } } finally { await browser.close(); }
}
if (process.env.UNIT_ONLY !== "1") main().catch(error => { console.error(error); process.exitCode = 1; });
