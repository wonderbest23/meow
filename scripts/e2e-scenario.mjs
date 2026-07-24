import puppeteer from "puppeteer-core";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:8083").replace(/\/$/, "");
const executablePath = process.env.CHROME_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const buildTimeout = Number(process.env.E2E_BUILD_TIMEOUT_MS ?? 12 * 60_000);

async function clickButtonByText(page, text) {
  await page.waitForFunction(
    (label) => [...document.querySelectorAll("button")].some((button) => (
      !button.disabled && button.textContent?.replace(/\s+/g, " ").includes(label)
    )),
    { timeout: 20_000 },
    text,
  );
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll("button")].find((candidate) => (
      !candidate.disabled && candidate.textContent?.replace(/\s+/g, " ").includes(label)
    ));
    button?.click();
    return Boolean(button);
  }, text);
  if (!clicked) throw new Error(`누를 수 있는 '${text}' 버튼을 찾지 못했습니다.`);
}

async function setInputValue(page, selector, value) {
  await page.$eval(selector, (element, nextValue) => {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(value));
}

async function horizontalOverflow(page) {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

let projectId = "";
const report = {
  viewport: "390x844",
  start: {},
  assessment: {},
  recommendation: {},
  preview: {},
  build: {},
  project: {},
  delivery: {},
  presentation: {},
  documentEdit: {},
  desktop: {},
  consoleErrors,
  pageErrors,
};

try {
  await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 30_000 });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle0", timeout: 30_000 });

  await page.click(".home-hero-actions .conversation-choice");
  await page.waitForSelector(".start-mode-cards");
  report.start = await page.evaluate(() => ({
    view: new URL(location.href).searchParams.get("view"),
    heading: document.querySelector(".start-choice-heading h1")?.textContent?.trim(),
    choiceCount: document.querySelectorAll(".start-mode-cards > button").length,
    firstChoice: document.querySelector(".start-mode-cards > button strong")?.textContent?.trim(),
    browserApiKeyHidden: !document.querySelector('input[placeholder="sk-..."]'),
  }));
  report.start.mobileOverflow = await horizontalOverflow(page);
  if (
    report.start.view !== "start"
    || report.start.heading !== "어떻게 시작할까요?"
    || report.start.choiceCount !== 3
    || report.start.mobileOverflow > 1
  ) {
    throw new Error(`시작 화면 검증 실패: ${JSON.stringify(report.start)}`);
  }

  const questionnaireChoice = await page.evaluate(() => {
    const button = [...document.querySelectorAll(".start-mode-cards > button")]
      .find((item) => item.textContent?.includes("질문으로 찾기"));
    button?.click();
    return Boolean(button);
  });
  if (!questionnaireChoice) throw new Error("질문으로 찾기 시작 버튼이 없습니다.");
  await page.waitForSelector(".assessment-page");

  for (let index = 0; index < 8; index += 1) {
    await page.waitForSelector(".choice-pair > button:first-child");
    const before = await page.$eval(".guided-top-progress", (node) => node.textContent);
    await page.click(".choice-pair > button:first-child");
    await page.click(".guided-next");
    await page.waitForFunction(
      (value) => document.querySelector(".guided-top-progress")?.textContent !== value,
      { timeout: 10_000 },
      before,
    );
  }

  await page.waitForSelector('.questionnaire-number-fields input[aria-label="질문 시작 예산"]');
  await setInputValue(page, '.questionnaire-number-fields input[aria-label="질문 시작 예산"]', 180);
  await page.click(".guided-next");
  await page.waitForSelector('.questionnaire-number-fields input[aria-label="질문 주당 사용할 시간"]');
  await setInputValue(page, '.questionnaire-number-fields input[aria-label="질문 주당 사용할 시간"]', 9);
  await clickButtonByText(page, "결과 보기");
  await page.waitForSelector(".profile-page");
  report.assessment = await page.evaluate(() => ({
    completed: document.body.innerText.includes("성향 찾기 완료"),
    researchNoteVisible: Boolean(document.querySelector(".profile-research-note")),
  }));
  await clickButtonByText(page, "내 사업 찾기 시작");

  await page.waitForSelector(".opportunity-card");
  report.recommendation = await page.evaluate(() => ({
    count: document.querySelectorAll(".opportunity-card").length,
    saveAction: document.querySelector(".opportunity-card .op-actions button:first-child")?.textContent?.trim(),
    excludeAction: document.querySelector(".opportunity-card .op-actions button:nth-child(2)")?.textContent?.trim(),
    startAction: document.querySelector(".opportunity-card .op-start-preview")?.textContent?.trim(),
  }));
  await page.click(".opportunity-card .op-start-preview");
  await page.waitForSelector(".op-detail");
  report.recommendation.title = await page.$eval("#opportunity-detail-title", (node) => node.textContent?.trim());
  report.recommendation.detailOverflow = await horizontalOverflow(page);
  await page.click(".start-opportunity");

  await page.waitForSelector(".purchase-preview-page");
  report.preview = await page.evaluate(() => ({
    view: new URL(location.href).searchParams.get("view"),
    heading: document.querySelector(".purchase-preview-heading h1")?.textContent?.trim(),
    tabCount: document.querySelectorAll(".purchase-preview-tabs button").length,
    checkoutHidden: !document.querySelector(".checkout-page"),
    downloadLocked: Boolean(document.querySelector(".purchase-plan-paper footer button")),
    unlockLabel: document.querySelector(".preview-unlock-button")?.textContent?.replace(/\s+/g, " ").trim(),
  }));
  report.preview.mobileOverflow = await horizontalOverflow(page);
  if (
    report.preview.view !== "preview"
    || report.preview.tabCount !== 3
    || !report.preview.checkoutHidden
    || !report.preview.downloadLocked
    || report.preview.mobileOverflow > 1
  ) {
    throw new Error(`결제 전 초안 미리보기 실패: ${JSON.stringify(report.preview)}`);
  }
  await page.click(".preview-unlock-button");

  await page.waitForFunction(
    () => Boolean(document.querySelector(".instant-draft-page, .delivery-page.user-delivery, .checkout-page")),
    { timeout: 30_000 },
  );
  if (await page.$(".checkout-page")) {
    throw new Error("로컬 베타 테스트에서 결제 화면이 열렸습니다. 무료 테스트 설정을 확인해주세요.");
  }

  await page.waitForFunction(
    () => Boolean(localStorage.getItem("venture-project-id")),
    { timeout: 20_000 },
  );
  projectId = await page.evaluate(() => localStorage.getItem("venture-project-id") ?? "");
  report.build.projectId = projectId;
  report.build.progressScreenShown = Boolean(await page.$(".instant-draft-page"));

  await page.waitForFunction(
    () => {
      if (document.querySelector(".delivery-page.user-delivery")) return true;
      const paused = document.querySelector(".instant-draft-heading h1")?.textContent?.includes("잠시 멈췄어요");
      if (paused) throw new Error(document.querySelector(".instant-draft-heading p")?.textContent || "자료 제작 중단");
      return false;
    },
    { timeout: buildTimeout, polling: 2500 },
  );
  report.build.completed = true;
  report.build.finalUrl = page.url();

  const projectResult = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    return { status: response.status, payload: await response.json() };
  }, projectId);
  if (projectResult.status !== 200) throw new Error(`프로젝트 조회 실패: ${projectResult.status}`);
  const project = projectResult.payload.project;
  report.project = {
    status: project.status,
    paymentStatus: project.paymentStatus,
    approvedStages: project.stages.filter((stage) => Boolean(stage.approvedArtifactId)).length,
    stageCount: project.stages.length,
    businessSetup: Boolean(project.businessSetup),
    businessPlan: Boolean(project.businessPlan),
    operationsPackage: Boolean(project.operationsPackage),
    executionAnalysis: Boolean(project.executionAnalysis),
    grantPackage: Boolean(project.grantPackage),
    draftRunStatus: project.draftPackageRun?.status,
  };
  if (
    report.project.approvedStages !== 6
    || !report.project.businessPlan
    || !report.project.operationsPackage
    || !report.project.executionAnalysis
    || !report.project.grantPackage
  ) {
    throw new Error(`완성 프로젝트 필수 자료 누락: ${JSON.stringify(report.project)}`);
  }

  await page.click('[data-report-tab="documents"]');
  await page.waitForSelector(".delivery-result-groups");
  report.delivery = await page.evaluate(() => ({
    navigationCount: document.querySelectorAll(".final-report-sidebar [data-report-tab]").length,
    documentCount: document.querySelectorAll(".deliverable-list > article").length,
    resultGroupCount: document.querySelectorAll(".delivery-result-group").length,
    presentationCount: document.querySelectorAll(".presentation-deliverable-card").length,
    spreadsheetCount: document.querySelectorAll(".financial-workbook-deliverable").length,
    finalStepExplained: document.body.innerText.includes("이곳이 마지막 단계입니다"),
  }));
  report.delivery.mobileOverflow = await horizontalOverflow(page);
  if (
    report.delivery.navigationCount !== 6
    || report.delivery.documentCount !== 10
    || report.delivery.presentationCount !== 2
    || report.delivery.spreadsheetCount !== 1
    || report.delivery.mobileOverflow > 1
  ) {
    throw new Error(`최종 결과 화면 검증 실패: ${JSON.stringify(report.delivery)}`);
  }

  await page.click(".presentation-deliverable-card .presentation-deliverable-actions button:first-child");
  await page.waitForSelector(".presentation-preview");
  report.presentation = await page.evaluate(() => ({
    slideCount: document.querySelectorAll(".presentation-thumbnail-rail button").length,
    activeSlide: document.querySelector(".presentation-stage-toolbar nav span")?.textContent?.replace(/\s+/g, " ").trim(),
    editActionVisible: document.body.innerText.includes("문구 수정"),
  }));
  if (report.presentation.slideCount < 10 || !report.presentation.editActionVisible) {
    throw new Error(`발표자료 전체 미리보기 실패: ${JSON.stringify(report.presentation)}`);
  }
  await page.click('[aria-label="발표자료 미리보기 닫기"]');

  report.documentEdit = await page.evaluate(async (id) => {
    const markdown = "# 사용자 수정 확인\n\n이 문장은 사이트에서 수정한 결과가 저장되고 전체 파일에 반영되는지 확인하기 위한 자동 테스트입니다.";
    const save = await fetch(`/api/projects/${id}/documents`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", documentId: "brief", markdown, summary: "자동 저장 점검" }),
    });
    const saved = await save.json();
    const load = await fetch(`/api/projects/${id}/documents`, { cache: "no-store" });
    const loaded = await load.json();
    const reset = await fetch(`/api/projects/${id}/documents`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset", documentId: "brief" }),
    });
    return {
      saveStatus: save.status,
      loadStatus: load.status,
      resetStatus: reset.status,
      savedVersion: saved.draft?.versions?.at(-1)?.version,
      loadedMarkdownMatches: loaded.drafts?.brief?.markdown === markdown,
    };
  }, projectId);
  if (
    report.documentEdit.saveStatus !== 200
    || report.documentEdit.loadStatus !== 200
    || report.documentEdit.resetStatus !== 200
    || !report.documentEdit.loadedMarkdownMatches
  ) {
    throw new Error(`문서 수정 저장 검증 실패: ${JSON.stringify(report.documentEdit)}`);
  }

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0", timeout: 30_000 });
  await page.waitForSelector(".delivery-page.user-delivery");
  await page.click('[data-report-tab="documents"]');
  report.desktop = {
    overflow: await horizontalOverflow(page),
    sidebarVisible: await page.$eval(".final-report-sidebar", (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 180 && rect.left >= 0 && rect.right <= window.innerWidth;
    }),
    resultVisible: await page.$eval(".final-report-main", (node) => node.getBoundingClientRect().width > 600),
  };
  if (report.desktop.overflow > 1 || !report.desktop.sidebarVisible || !report.desktop.resultVisible) {
    throw new Error(`PC 결과 화면 배열 실패: ${JSON.stringify(report.desktop)}`);
  }

  const ignoredConsolePatterns = ["favicon.ico", "Failed to load resource"];
  const meaningfulConsoleErrors = consoleErrors.filter((message) => (
    !ignoredConsolePatterns.some((pattern) => message.includes(pattern))
  ));
  if (pageErrors.length || meaningfulConsoleErrors.length) {
    throw new Error(`브라우저 오류 발견: ${JSON.stringify({ meaningfulConsoleErrors, pageErrors })}`);
  }

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const state = await page.evaluate(() => ({
    url: location.href,
    screen: document.querySelector("main")?.className,
    heading: document.querySelector("h1, h2")?.textContent?.replace(/\s+/g, " ").trim(),
    message: document.querySelector(".instant-draft-heading p, .service-error")?.textContent?.replace(/\s+/g, " ").trim(),
  })).catch(() => ({}));
  console.error(JSON.stringify({ failure: error.message, state, report }, null, 2));
  process.exitCode = 1;
} finally {
  if (projectId) {
    await page.evaluate(async (id) => {
      await fetch(`/api/projects/${id}`, { method: "DELETE" }).catch(() => undefined);
    }, projectId).catch(() => undefined);
  }
  await browser.close();
}
