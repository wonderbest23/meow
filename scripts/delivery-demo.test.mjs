import puppeteer from "puppeteer-core";
import JSZip from "jszip";
import { writeFile } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:8083";
const sampleUrl = new URL(baseUrl);
sampleUrl.searchParams.set("view", "sample");
if (process.env.RELEASE_TAG) sampleUrl.searchParams.set("release", process.env.RELEASE_TAG);
const executablePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(sampleUrl.toString(), { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    localStorage.removeItem("venture-paid-report-landing-demo");
    localStorage.removeItem("venture-beginner-missions-demo");
    localStorage.removeItem("venture-presentation-drafts-demo-v1");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".final-report-viewer");

  await page.click(".mobile-report-menu-trigger");
  await page.waitForSelector(".final-report-sidebar.mobile-open");
  await page.waitForFunction(() => Math.round(document.querySelector(".final-report-sidebar")?.getBoundingClientRect().left ?? -999) === 0);
  const mobileReportNavigation = await page.evaluate(() => {
    const trigger = document.querySelector(".mobile-report-menu-trigger");
    const actions = document.querySelector(".mobile-report-actions");
    const sidebar = document.querySelector(".final-report-sidebar");
    const buttons = [...document.querySelectorAll(".final-report-sidebar nav button")];
    const buttonTops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
    return {
      triggerDisplay: trigger ? getComputedStyle(trigger).display : "none",
      actionsDisplay: actions ? getComputedStyle(actions).display : "none",
      sidebarOpen: sidebar?.classList.contains("mobile-open") ?? false,
      sidebarLeft: Math.round(sidebar?.getBoundingClientRect().left ?? -999),
      sidebarWidth: Math.round(sidebar?.getBoundingClientRect().width ?? 0),
      stackedSteps: new Set(buttonTops).size,
      stepCount: buttons.length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  await page.evaluate(() => document.querySelector('.final-report-sidebar nav button[aria-label="사업 요약"]')?.click());
  await page.waitForFunction(() => !document.querySelector(".final-report-sidebar")?.classList.contains("mobile-open"));

  const tabs = [
    ["상품·손익", "첫 상품과 손익 기준", ".report-sheet"],
    ["시장 확인", "확인된 수요와 아직 모르는 점", ".report-sheet"],
    ["판매 페이지", "내 사업 홈페이지", ".landing-quick-editor"],
    ["실행 도우미", "지금은 한 단계만 따라 하세요", ".report-sheet"],
    ["사업 요약", "한 지역에서 직접 운영", ".report-sheet"],
  ];

  for (const [label, expected, selector] of tabs) {
    const clicked = await page.evaluate((buttonLabel) => {
      const button = [...document.querySelectorAll(".final-report-viewer nav button")]
        .find((candidate) => candidate.getAttribute("aria-label") === buttonLabel);
      button?.click();
      return Boolean(button);
    }, label);
    if (!clicked) throw new Error(`${label} 탭을 찾지 못했습니다.`);
    await page.waitForFunction(
      (text, panelSelector) => document.querySelector(panelSelector)?.textContent?.includes(text),
      {},
      expected,
      selector,
    );
  }

  await page.evaluate(() => {
    const landingTab = [...document.querySelectorAll(".final-report-viewer nav button")]
      .find((candidate) => candidate.getAttribute("aria-label") === "판매 페이지");
    landingTab?.click();
  });
  await page.waitForSelector(".landing-quick-editor");

  await page.evaluate(() => {
    const documentsTab = [...document.querySelectorAll(".final-report-viewer nav button")]
      .find((candidate) => candidate.getAttribute("aria-label") === "최종 결과물");
    documentsTab?.click();
  });
  await page.waitForSelector(".deliverable-list");
  const documentPanel = await page.evaluate(() => ({
    deliverableCount: document.querySelectorAll(".deliverable-list > article").length,
    presentationCount: document.querySelectorAll(".presentation-deliverable-card").length,
    presentationActionCount: document.querySelectorAll(".presentation-deliverable-actions button").length,
    paymentAmount: document.querySelector(".delivery-receipt-row strong")?.textContent?.trim(),
    receiptButton: [...document.querySelectorAll(".delivery-receipt-row button")]
      .some((button) => ["영수증(PDF)", "결제 확인서(PDF)"].some((label) => button.textContent?.includes(label))),
    documentActionCount: document.querySelectorAll(".delivery-document-actions button").length,
    groupCount: document.querySelectorAll(".delivery-result-group").length,
    financialWorkbookCount: document.querySelectorAll(".financial-workbook-deliverable").length,
    factSummaryCount: document.querySelectorAll(".delivery-fact-summary > span").length,
    sampleStatusCount: [...document.querySelectorAll(".delivery-document-summary > small")]
      .filter((node) => node.textContent?.includes("예시 파일")).length,
    easyGroupTitles: [...document.querySelectorAll(".delivery-result-group > header h4")]
      .map((node) => node.textContent?.trim()),
    easyDocumentTitles: [...document.querySelectorAll(".delivery-document-summary > strong")]
      .map((node) => node.textContent?.trim()),
  }));
  const presentationPreviews = {};
  for (const [cardIndex, deckType, expectedSlides] of [[0, "intro", 12], [1, "ir", 16]]) {
    await page.evaluate((index) => {
      const card = document.querySelectorAll(".presentation-deliverable-card")[index];
      card?.querySelector(".presentation-deliverable-actions button")?.click();
    }, cardIndex);
    await page.waitForSelector(".presentation-preview");
    await page.waitForFunction((count) => document.querySelectorAll(".presentation-thumbnail-rail button").length === count, {}, expectedSlides);
    const firstSlide = await page.evaluate(() => ({
      thumbnails: document.querySelectorAll(".presentation-thumbnail-rail button").length,
      activeIndex: document.querySelector(".deck-slide-preview")?.getAttribute("data-slide-index"),
      activeKind: document.querySelector(".deck-slide-preview")?.getAttribute("data-slide-kind"),
      overflow: (document.querySelector(".presentation-preview")?.scrollWidth ?? 0) - window.innerWidth,
    }));
    await page.click(".presentation-stage-navigation button:last-child");
    await page.waitForFunction(() => document.querySelector(".deck-slide-preview")?.getAttribute("data-slide-index") === "1");
    if (deckType === "intro") {
      await page.click(".presentation-stage-toolbar nav button");
      await page.waitForSelector(".presentation-editor-panel");
      await page.evaluate(() => {
        const input = document.querySelector(".presentation-text-fields input");
        if (!(input instanceof HTMLInputElement)) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "고객이 이해하는 사업 한 문장");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const chartButton = [...document.querySelectorAll(".presentation-chart-tools button")]
          .find((button) => button.textContent?.includes("적합도 점수"));
        chartButton?.click();
      });
      await page.evaluate(() => {
        const saveButton = [...document.querySelectorAll(".presentation-editor-panel > footer button")]
          .find((button) => button.textContent?.includes("저장하기"));
        saveButton?.click();
      });
      await page.waitForFunction(() => document.querySelector(".presentation-editor-panel > footer p")?.textContent?.includes("PPTX에도 같은 내용"));
      await page.waitForFunction(() => document.querySelector(".deck-preview-heading h2")?.textContent?.includes("고객이 이해하는 사업 한 문장"));
      await page.waitForSelector(".deck-preview-chart");
    }
    const secondSlide = await page.evaluate(() => ({
      activeIndex: document.querySelector(".deck-slide-preview")?.getAttribute("data-slide-index"),
      activeKind: document.querySelector(".deck-slide-preview")?.getAttribute("data-slide-kind"),
      title: document.querySelector(".deck-preview-heading h2")?.textContent?.trim(),
      chart: Boolean(document.querySelector(".deck-preview-chart")),
    }));
    if (deckType === "ir") {
      if (secondSlide.activeKind !== "thesis") throw new Error("IR 투자 핵심 전용 슬라이드가 표시되지 않았습니다.");
      await page.evaluate(() => document.querySelectorAll(".presentation-thumbnail-rail button")[4]?.click());
      await page.waitForFunction(() => document.querySelector(".deck-slide-preview")?.getAttribute("data-slide-kind") === "market");
      await page.waitForSelector(".deck-preview-market");
      await page.evaluate(() => document.querySelectorAll(".presentation-thumbnail-rail button")[10]?.click());
      await page.waitForFunction(() => document.querySelector(".deck-slide-preview")?.getAttribute("data-slide-kind") === "financial");
      await page.waitForSelector(".deck-preview-financial-chart");
      const financialBarCount = await page.$$eval(".deck-financial-bars article", (bars) => bars.length);
      if (financialBarCount !== 12) throw new Error(`IR 월별 손익 차트 오류 bars=${financialBarCount}`);
    }
    presentationPreviews[deckType] = { firstSlide, secondSlide };
    await page.click(".presentation-preview > header button:last-child");
    await page.waitForSelector(".presentation-preview", { hidden: true });
  }
  await page.evaluate(() => document.querySelector(".deliverable-list")?.scrollIntoView());
  await page.evaluate(() => {
    const article = [...document.querySelectorAll(".deliverable-list article")]
      .find((node) => node.querySelector("strong")?.textContent?.includes("사업계획서"));
    article?.querySelector(".document-edit-primary")?.click();
  });
  await page.waitForSelector(".document-editor-studio");
  const documentEditor = await page.evaluate(() => {
    const navigationRect = document.querySelector(".document-editor-navigation")?.getBoundingClientRect();
    const chatRect = document.querySelector(".support-chat-toggle")?.getBoundingClientRect();
    const chatOverlapsNavigation = Boolean(navigationRect && chatRect && !(
      chatRect.right <= navigationRect.left ||
      chatRect.left >= navigationRect.right ||
      chatRect.bottom <= navigationRect.top ||
      chatRect.top >= navigationRect.bottom
    ));
    return {
      sectionCount: document.querySelectorAll(".document-editor-outline nav button").length,
      assistButtonCount: document.querySelectorAll(".document-editor-assist-tools button").length,
      hasSave: [...document.querySelectorAll(".document-editor-header button")].some((button) => button.textContent?.includes("저장")),
      overflow: (document.querySelector(".document-editor-studio")?.scrollWidth ?? 0) - window.innerWidth,
      chatOverlapsNavigation,
      chatBottom: chatRect ? Math.round(chatRect.bottom) : null,
      navigationTop: navigationRect ? Math.round(navigationRect.top) : null,
    };
  });
  if (documentEditor.sectionCount < 8 || documentEditor.assistButtonCount !== 4 || !documentEditor.hasSave || documentEditor.overflow > 1 || documentEditor.chatOverlapsNavigation) {
    throw new Error(`문서 편집실 구성 오류 ${JSON.stringify(documentEditor)}`);
  }
  await page.click(".document-editor-close");
  await page.waitForSelector(".document-editor-studio", { hidden: true });
  await page.evaluate(() => {
    const article = [...document.querySelectorAll(".deliverable-list article")]
      .find((node) => node.querySelector("strong")?.textContent?.includes("사업계획서"));
    const openButton = [...article?.querySelectorAll(".delivery-document-actions button") ?? []]
      .find((button) => button.textContent?.includes("열기"));
    openButton?.click();
  });
  await page.waitForSelector(".delivery-document-preview");
  const documentPreview = await page.evaluate(() => ({
    textLength: document.querySelector(".delivery-document-body")?.textContent?.replace(/\s/g, "").length ?? 0,
    tableCount: document.querySelectorAll(".delivery-document-body table").length,
    hasSampleNotice: document.querySelector(".document-preview-cover aside")?.textContent?.includes("가상 사례") ?? false,
    overflow: (document.querySelector(".delivery-document-preview")?.scrollWidth ?? 0) - window.innerWidth,
  }));
  await page.click(".document-preview-close");
  await page.waitForSelector(".delivery-document-preview", { hidden: true });
  await page.evaluate(() => {
    const article = [...document.querySelectorAll(".deliverable-list article")]
      .find((node) => node.querySelector("strong")?.textContent?.includes("정부 지원사업 신청서 초안"));
    const openButton = [...article?.querySelectorAll(".delivery-document-actions button") ?? []]
      .find((button) => button.textContent?.includes("열기"));
    openButton?.click();
  });
  await page.waitForSelector(".delivery-document-preview");
  const grantDocumentPreview = await page.evaluate(() => ({
    textLength: document.querySelector(".delivery-document-body")?.textContent?.replace(/\s/g, "").length ?? 0,
    tableCount: document.querySelectorAll(".delivery-document-body table").length,
    sectionCount: document.querySelectorAll(".delivery-document-body h2, .delivery-document-body h3").length,
    hasSubmissionBody: document.querySelector(".delivery-document-body")?.textContent?.includes("제출용 신청서 본문") ?? false,
    hasOfficialSections: ["문제 인식", "실현 가능성", "성장전략", "팀 구성", "정부지원사업비 집행 계획"]
      .every((text) => document.querySelector(".delivery-document-body")?.textContent?.includes(text)),
    hasSeparatedAppendix: document.querySelector(".delivery-document-body")?.textContent?.includes("참고 부록 · 제출본에서 분리") ?? false,
    overflow: (document.querySelector(".delivery-document-preview")?.scrollWidth ?? 0) - window.innerWidth,
  }));
  await page.click(".document-preview-close");
  await page.waitForSelector(".delivery-document-preview", { hidden: true });
  await page.evaluate(() => {
    const landingTab = [...document.querySelectorAll(".final-report-viewer nav button")]
      .find((candidate) => candidate.getAttribute("aria-label") === "판매 페이지");
    landingTab?.click();
  });
  await page.waitForSelector(".landing-quick-editor");
  await page.evaluate(() => {
    const contentStep = [...document.querySelectorAll(".landing-easy-steps button")]
      .find((button) => button.textContent?.includes("내용 확인"));
    contentStep?.click();
  });
  await page.waitForSelector(".landing-essential-form");
  await page.evaluate(() => {
    const label = [...document.querySelectorAll(".landing-essential-form label")]
      .find((candidate) => candidate.querySelector(":scope > span")?.textContent?.trim() === "첫 화면 큰 문구");
    const textarea = label?.querySelector("textarea");
    if (!textarea) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, "오늘 필요한 돌봄을 가까운 이웃과 연결하세요.");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => {
    const saveButton = [...document.querySelectorAll(".landing-quick-actions button")]
      .find((button) => button.textContent?.includes("초안 저장"));
    saveButton?.click();
  });
  await page.waitForFunction(() => document.querySelector(".landing-report-message")?.textContent?.includes("이 브라우저에 저장"));
  await page.evaluate(() => {
    const previewButton = [...document.querySelectorAll(".landing-report-actions button")]
      .find((button) => button.textContent?.includes("전체화면"));
    previewButton?.click();
  });
  await page.waitForSelector(".landing-fullscreen-preview");
  await page.waitForFunction(() => document.querySelector(".landing-fullscreen-preview")?.textContent?.includes("오늘 필요한 돌봄을 가까운 이웃과 연결하세요."));
  await page.click(".landing-preview-toolbar > button");
  await page.waitForSelector(".landing-fullscreen-preview", { hidden: true });

  await page.click(".landing-expert-build > button");
  await page.waitForSelector(".support-chat-panel");
  const expertConsultation = await page.evaluate(() => ({
    open: Boolean(document.querySelector(".support-chat-panel")),
    message: document.querySelector(".support-chat-panel textarea")?.value ?? "",
  }));
  await page.click(".support-chat-panel > header button");
  await page.waitForSelector(".support-chat-panel", { hidden: true });

  await page.evaluate(() => {
    const missionTab = [...document.querySelectorAll(".final-report-viewer nav button")]
      .find((candidate) => candidate.getAttribute("aria-label") === "실행 도우미");
    missionTab?.click();
  });
  await page.waitForSelector(".beginner-mission-cockpit");
  const guidedMissionCount = await page.$$eval(".mission-guided-card", (cards) => cards.length);
  const customerGuide = await page.evaluate(() => ({
    optionCount: document.querySelectorAll(".mission-evidence-options button").length,
    hasWhy: document.querySelector(".mission-why-more")?.textContent?.includes("왜 이 확인이 필요한가요") ?? false,
    canSkip: [...document.querySelectorAll(".mission-evidence-options button")].some((button) => button.textContent?.includes("지금은 건너뛰기")),
  }));
  const missionSimpleState = await page.evaluate(() => {
    const actionBar = document.querySelector(".mission-guided-card > footer");
    return {
      extraToolsOpen: document.querySelector(".mission-extra-tools")?.hasAttribute("open") ?? true,
      visibleActionCount: document.querySelectorAll(".mission-single-action").length,
      evidenceVisible: Boolean(document.querySelector(".mission-guided-card .mission-evidence")),
      currentStep: document.querySelector(".mission-guided-card")?.getAttribute("data-guided-step"),
      actionPosition: actionBar ? getComputedStyle(actionBar).position : "",
      actionBottomGap: actionBar ? Math.round(window.innerHeight - actionBar.getBoundingClientRect().bottom) : -1,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  await new Promise((resolve) => setTimeout(resolve, 650));
  await page.screenshot({ path: "/tmp/today-startup-execution-helper-step1-mobile.png", fullPage: false });
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const missionDesktopState = await page.evaluate(() => ({
    cardWidth: Math.round(document.querySelector(".mission-guided-card")?.getBoundingClientRect().width ?? 0),
    actionPosition: getComputedStyle(document.querySelector(".mission-guided-card > footer")).position,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  await page.screenshot({ path: "/tmp/today-startup-execution-helper-step1-desktop.png", fullPage: false });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const firstMissionId = await page.$eval(".mission-guided-card", (card) => card.getAttribute("data-mission-id"));
  for (let index = 0; index < 8 && !(await page.$(".mission-guided-card .mission-evidence")); index += 1) {
    const previousStep = await page.$eval(".mission-guided-card", (card) => card.getAttribute("data-guided-step"));
    await page.click(".mission-step-next");
    await page.waitForFunction(
      (before) => document.querySelector(".mission-guided-card")?.getAttribute("data-guided-step") !== before,
      {},
      previousStep,
    );
  }
  await page.waitForSelector(".mission-guided-card .mission-evidence");
  await page.screenshot({ path: "/tmp/today-startup-execution-helper-record-mobile.png", fullPage: false });
  const emptyEvidenceBlocked = await page.$eval(".mission-complete", (button) => button.hasAttribute("disabled"));
  const missionEvidence = "공개후기-3건-20260714.pdf";
  const missionNote = "가격 질문을 추가했고 응답 원문을 정리했습니다.";
  await page.type(".mission-evidence input", missionEvidence);
  await page.type(".mission-evidence textarea", missionNote);
  await page.waitForFunction(() => !document.querySelector(".mission-complete")?.hasAttribute("disabled"));
  await page.click(".mission-complete");
  await page.waitForFunction(() => document.querySelector(".mission-message")?.textContent?.includes("다음 단계에 반영"));
  await page.waitForFunction((previousId) => document.querySelector(".mission-guided-card")?.getAttribute("data-mission-id") !== previousId, {}, firstMissionId);
  const secondMissionId = await page.$eval(".mission-guided-card", (card) => card.getAttribute("data-mission-id"));
  const savedMission = await page.evaluate((missionId) => {
    const raw = localStorage.getItem("venture-beginner-missions-demo");
    if (!raw || !missionId) return null;
    const saved = JSON.parse(raw);
    return saved.missionProgress?.[missionId] ?? null;
  }, firstMissionId);
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const missionTab = [...document.querySelectorAll(".final-report-viewer nav button")]
      .find((candidate) => candidate.getAttribute("aria-label") === "실행 도우미");
    missionTab?.click();
  });
  await page.waitForSelector(".mission-guided-card");
  const recoveredMissionId = await page.$eval(".mission-guided-card", (card) => card.getAttribute("data-mission-id"));
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".mission-view-tabs button")]
      .find((candidate) => candidate.textContent?.includes("사업장 비교"));
    button?.click();
  });
  await page.waitForSelector(".space-quote-grid");
  const spaceQuoteCount = await page.$$eval(".space-quote-grid > article", (rows) => rows.length);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll(".mission-view-tabs button")]
      .find((candidate) => candidate.textContent?.includes("로고·홈페이지"));
    button?.click();
  });
  await page.waitForSelector(".brand-starter-studio");
  const brandStudio = Boolean(await page.$(".brand-starter-studio"));
  await page.evaluate(() => {
    const landingTab = [...document.querySelectorAll(".final-report-viewer nav button")]
      .find((candidate) => candidate.getAttribute("aria-label") === "판매 페이지");
    landingTab?.click();
  });
  await page.waitForSelector(".landing-quick-editor");

  const landingExperience = await page.evaluate(() => {
    const businessStep = [...document.querySelectorAll(".landing-easy-steps button")]
      .find((button) => button.textContent?.includes("사업자·도메인"));
    businessStep?.click();
    return {
      easyStepCount: document.querySelectorAll(".landing-easy-steps button").length,
      templateCount: document.querySelectorAll(".landing-template-grid > button").length,
      mediaCount: document.querySelectorAll(".landing-media-field").length,
    };
  });
  await page.waitForSelector(".landing-business-form");
  Object.assign(landingExperience, await page.evaluate(() => ({
    domainShopCount: document.querySelectorAll(".domain-buy-links a").length,
    businessFieldCount: document.querySelectorAll(".landing-business-form input, .landing-business-form textarea").length,
  })));

  const result = await page.evaluate(() => ({
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    demoDisclosure: document.body.innerText.includes("가상 사업 사례"),
    sampleStartButton: [...document.querySelectorAll(".sample-preview-bar button")]
      .some((button) => button.textContent?.includes("무료로 시작하기")),
    landingEditor: Boolean(document.querySelector(".landing-quick-editor")),
    fullscreenButton: [...document.querySelectorAll(".landing-report-actions button")]
      .some((button) => button.textContent?.includes("전체화면")),
    savedDemo: Boolean(localStorage.getItem("venture-paid-report-landing-demo")),
    missionSaved: Boolean(localStorage.getItem("venture-beginner-missions-demo")),
    presentationSaved: Boolean(localStorage.getItem("venture-presentation-drafts-demo-v1")),
    reportAppStructure: Boolean(
      document.querySelector(".final-report-chrome") &&
      document.querySelector(".final-report-sidebar") &&
      document.querySelector(".final-report-main")
    ),
    reportNavigationCount: document.querySelectorAll(".final-report-sidebar nav button").length,
    reportAppHeader: document.querySelector(".final-report-chrome span")?.textContent?.replace(/\s+/g, " ").trim(),
  }));

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    const designStep = [...document.querySelectorAll(".landing-easy-steps button")]
      .find((button) => button.textContent?.includes("디자인 선택"));
    designStep?.click();
  });
  await page.waitForSelector(".landing-template-grid");
  const desktopLayout = await page.evaluate(() => {
    const editor = document.querySelector(".landing-quick-editor");
    const templateCards = [...document.querySelectorAll(".landing-template-grid > button")];
    const mediaCards = [...document.querySelectorAll(".landing-media-grid > section")];
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      editorWidth: Math.round(editor?.getBoundingClientRect().width ?? 0),
      templateRows: new Set(templateCards.map((card) => Math.round(card.getBoundingClientRect().top))).size,
      mediaRows: new Set(mediaCards.map((card) => Math.round(card.getBoundingClientRect().top))).size,
      smallestTemplateWidth: Math.round(Math.min(...templateCards.map((card) => card.getBoundingClientRect().width))),
    };
  });

  if (result.overflow > 1) throw new Error(`모바일 가로 넘침 ${result.overflow}px`);
  if (
    mobileReportNavigation.triggerDisplay === "none" ||
    mobileReportNavigation.actionsDisplay === "none" ||
    !mobileReportNavigation.sidebarOpen ||
    mobileReportNavigation.sidebarLeft !== 0 ||
    mobileReportNavigation.sidebarWidth < 280 ||
    mobileReportNavigation.stepCount !== 6 ||
    mobileReportNavigation.stackedSteps !== 6 ||
    mobileReportNavigation.overflow > 1
  ) throw new Error(`모바일 결과 탐색 검증 실패 ${JSON.stringify(mobileReportNavigation)}`);
  if (!documentPanel.paymentAmount?.includes("149,000원")) throw new Error("결제 금액이 표시되지 않았습니다.");
  if (
    documentPanel.deliverableCount !== 10 ||
    documentPanel.presentationCount !== 2 ||
    documentPanel.presentationActionCount !== 4 ||
    documentPanel.documentActionCount !== 40 ||
    documentPanel.groupCount !== 3 ||
    documentPanel.financialWorkbookCount !== 1 ||
    documentPanel.factSummaryCount !== 3 ||
    documentPanel.sampleStatusCount !== 10
  ) throw new Error(`결과물 구성과 사용 상태가 올바르지 않습니다. ${JSON.stringify(documentPanel)}`);
  if (
    documentPanel.easyGroupTitles.join("|") !== "처음 바로 사용하는 파일|소개하거나 신청할 때 쓰는 파일|비용과 운영을 확인하는 파일" ||
    !["내 사업 한눈에 보기", "상품 가격과 예상 수익", "첫 고객을 찾는 30일 계획", "사업계획서", "정부 지원사업 신청서 초안"]
      .every((title) => documentPanel.easyDocumentTitles.includes(title))
  ) throw new Error(`쉬운 결과물 제목이 표시되지 않았습니다. ${JSON.stringify(documentPanel)}`);
  if (
    presentationPreviews.intro?.firstSlide.thumbnails !== 12 ||
    presentationPreviews.ir?.firstSlide.thumbnails !== 16 ||
    presentationPreviews.intro?.firstSlide.activeKind !== "cover" ||
    presentationPreviews.ir?.firstSlide.activeKind !== "cover" ||
    presentationPreviews.intro?.secondSlide.activeIndex !== "1" ||
    presentationPreviews.ir?.secondSlide.activeIndex !== "1" ||
    presentationPreviews.intro?.secondSlide.title !== "고객이 이해하는 사업 한 문장" ||
    presentationPreviews.intro?.secondSlide.chart !== true ||
    presentationPreviews.intro?.firstSlide.overflow > 1 ||
    presentationPreviews.ir?.firstSlide.overflow > 1
  ) throw new Error(`PPT 전체 미리보기 검증 실패 ${JSON.stringify(presentationPreviews)}`);
  if (!result.demoDisclosure || !documentPanel.receiptButton) throw new Error("예시 고지 또는 결제 확인서 버튼이 없습니다.");
  if (!result.sampleStartButton) throw new Error("샘플 시작 버튼이 없습니다.");
  if (documentPreview.textLength < 2_500 || documentPreview.tableCount < 8 || !documentPreview.hasSampleNotice || documentPreview.overflow > 1) {
    throw new Error(`상세 문서 미리보기 검증 실패 ${JSON.stringify(documentPreview)}`);
  }
  if (
    grantDocumentPreview.textLength < 4_000 ||
    grantDocumentPreview.tableCount < 8 ||
    grantDocumentPreview.sectionCount < 12 ||
    !grantDocumentPreview.hasSubmissionBody ||
    !grantDocumentPreview.hasOfficialSections ||
    !grantDocumentPreview.hasSeparatedAppendix ||
    grantDocumentPreview.overflow > 1
  ) throw new Error(`공공지원사업 제출 본문 검증 실패 ${JSON.stringify(grantDocumentPreview)}`);
  if (!result.landingEditor || !result.fullscreenButton) throw new Error("랜딩 편집기 또는 전체화면 버튼이 없습니다.");
  if (!expertConsultation.open || !expertConsultation.message.includes("[전문 홈페이지 제작 상담]") || !expertConsultation.message.includes("사업명: 곁봄")) {
    throw new Error(`전문 홈페이지 제작 상담 연결 실패 ${JSON.stringify(expertConsultation)}`);
  }
  if (desktopLayout.overflow > 1 || desktopLayout.editorWidth < 650 || desktopLayout.templateRows !== 1 || desktopLayout.mediaRows !== 1 || desktopLayout.smallestTemplateWidth < 120) {
    throw new Error(`PC 홈페이지 편집기 배열이 올바르지 않습니다. ${JSON.stringify(desktopLayout)}`);
  }
  if (
    landingExperience.easyStepCount !== 3 ||
    landingExperience.templateCount !== 4 ||
    landingExperience.mediaCount !== 2 ||
    landingExperience.domainShopCount !== 3 ||
    landingExperience.businessFieldCount < 7
  ) throw new Error(`쉬운 홈페이지 제작 흐름이 완성되지 않았습니다. ${JSON.stringify(landingExperience)}`);
  if (!result.reportAppStructure || result.reportNavigationCount !== 6 || !result.reportAppHeader?.includes("곁봄 맞춤 사업 실행 보고서")) {
    throw new Error(`메인 미리보기와 완료 보고서 구조가 다릅니다. ${JSON.stringify(result)}`);
  }
  if (!result.savedDemo) throw new Error("예시 랜딩 수정 내용이 저장되지 않았습니다.");
  if (!result.presentationSaved) throw new Error("예시 발표자료 수정 내용이 저장되지 않았습니다.");
  if (
    spaceQuoteCount !== 3 ||
    guidedMissionCount !== 1 ||
    missionSimpleState.extraToolsOpen ||
    missionSimpleState.visibleActionCount !== 1 ||
    missionSimpleState.evidenceVisible ||
    missionSimpleState.currentStep !== "1" ||
    missionSimpleState.actionPosition !== "fixed" ||
    missionSimpleState.actionBottomGap !== 0 ||
    missionDesktopState.cardWidth < 600 ||
    missionDesktopState.cardWidth > 760 ||
    missionDesktopState.actionPosition === "fixed" ||
    missionDesktopState.overflow > 1 ||
    missionSimpleState.overflow > 1 ||
    !emptyEvidenceBlocked ||
    customerGuide.optionCount !== 3 ||
    !customerGuide.hasWhy ||
    !customerGuide.canSkip ||
    !result.missionSaved ||
    !brandStudio ||
    savedMission?.status !== "done" ||
    savedMission?.evidence !== missionEvidence ||
    savedMission?.note !== missionNote ||
    secondMissionId !== recoveredMissionId
  ) throw new Error(`초보자 미션 저장·다음 단계·복구 흐름이 정상 작동하지 않습니다. ${JSON.stringify({ guidedMissionCount, missionSimpleState, missionDesktopState, emptyEvidenceBlocked, firstMissionId, secondMissionId, recoveredMissionId, savedMission })}`);

  const deckInput = {
      brandName: "곁봄",
      slogan: "급한 돌봄을 가까이",
      title: "반려동물 돌봄 연결",
      oneLiner: "급한 돌봄 공백을 지역 파트너와 연결합니다.",
      customer: "갑자기 자리를 비워야 하는 반려동물 보호자",
      model: "지역 수동 매칭",
      revenue: "건별 연결 수수료",
      priceWon: 59000,
      risk: "사고 대응과 개인정보",
      accentColor: "#0b7254",
      monthlyForecast: Array.from({ length: 12 }, (_, index) => ({
        monthIndex: index + 1,
        month: `2026년 ${index + 1}월`,
        rampFactor: 0.4 + index * 0.06,
        units: 10 + index * 2,
        grossUnitPriceWon: 59000,
        netUnitPriceWon: 53636,
        grossRevenueWon: (10 + index * 2) * 59000,
        netRevenueWon: (10 + index * 2) * 53636,
        variableCostsWon: (10 + index * 2) * 16000,
        contributionWon: (10 + index * 2) * 37636,
        fixedCostsWon: 700000,
        operatingProfitBeforeTaxWon: (10 + index * 2) * 37636 - 700000,
        cumulativeOperatingProfitWon: Array.from({ length: index + 1 }, (_, monthIndex) => (10 + monthIndex * 2) * 37636 - 700000).reduce((sum, value) => sum + value, 0),
        cumulativeCashAfterInitialInvestmentWon: Array.from({ length: index + 1 }, (_, monthIndex) => (10 + monthIndex * 2) * 37636 - 700000).reduce((sum, value) => sum + value, 0) - 1550000,
      })),
  };
  const deckResults = {};
  for (const [deckType, expectedSlides] of [["intro", 12], ["ir", 16]]) {
    const editedTitle = `${deckType} 내려받기 수정 제목`;
    const deckResponse = await fetch(`${baseUrl}/api/delivery/deck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...deckInput,
        deckType,
        matchScore: 84,
        marketScore: 76,
        feasibilityScore: 81,
        edits: {
          updatedAt: "2026-07-15T00:00:00.000Z",
          slides: {
            [deckType === "intro" ? "overview" : "investment-thesis"]: {
              title: editedTitle,
              chartPreset: "fit",
            },
          },
        },
      }),
    });
    const deckBytes = new Uint8Array(await deckResponse.arrayBuffer());
    if (!deckResponse.ok || deckBytes[0] !== 0x50 || deckBytes[1] !== 0x4b || deckBytes.length < 20_000) {
      throw new Error(`${deckType} PPTX 생성 실패 status=${deckResponse.status} bytes=${deckBytes.length}`);
    }
    const deckArchive = await JSZip.loadAsync(deckBytes);
    const slideCount = Object.keys(deckArchive.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
    if (slideCount !== expectedSlides) throw new Error(`${deckType} 슬라이드 수 오류 expected=${expectedSlides} actual=${slideCount}`);
    const editedSlideXml = await deckArchive.file("ppt/slides/slide2.xml")?.async("string");
    if (!editedSlideXml?.includes(editedTitle) || !editedSlideXml.includes("외부 시장 통계가 아닙니다")) {
      throw new Error(`${deckType} PPTX에 수정 문구 또는 그래프 근거가 반영되지 않았습니다.`);
    }
    if (deckType === "ir") {
      await writeFile("/tmp/today-startup-ir-test.pptx", deckBytes);
      const financialSlideXml = await deckArchive.file("ppt/slides/slide11.xml")?.async("string");
      if (!financialSlideXml?.includes("graphicFrame") || !financialSlideXml.includes("12개월 매출")) {
        throw new Error("IR PPTX에 12개월 손익 차트와 핵심 숫자가 반영되지 않았습니다.");
      }
    }
    deckResults[deckType] = { bytes: deckBytes.length, slides: slideCount };
  }

  const detailedMarkdown = [
    "# 검증용 사업계획서",
    "",
    "> 자동 문서 테스트입니다.",
    "",
    "## 사업 개요",
    "갑작스러운 돌봄 공백을 지역 파트너와 연결합니다. 실제 고객 행동과 결제 내역을 기준으로 판단합니다.",
    "",
    "## 상품과 손익분기",
    "| 항목 | 금액 | 상태 |",
    "| --- | ---: | --- |",
    "| 판매가 | 49,000원 | 검증 대상 |",
    "| 변동비 | 35,000원 | 견적 필요 |",
    "| 공헌이익 | 14,000원 | 계산값 |",
    "",
    "## 실행 절차",
    ...Array.from({ length: 20 }, (_, index) => `${index + 1}. 고객 인터뷰와 완료 증거를 기록하고 다음 행동의 통과 기준을 확인합니다.`),
  ].join("\n");
  const documentPayload = {
    project: {
      title: "곁봄",
      sector: "펫·안전",
      model: "건별 연결 수수료",
      customer: "서울 거주 1인 반려가구",
      generatedAt: "2026-07-14T09:30:00.000Z",
      sample: true,
    },
    documents: [
      { id: "plan", title: "검증용 사업계획서", type: "시장·수익·운영", versionLabel: "1판", markdown: detailedMarkdown },
      { id: "operations", title: "검증용 운영계획서", type: "업무 절차·고객 응대", versionLabel: "1판", markdown: detailedMarkdown.replace("사업계획서", "운영계획서") },
    ],
  };
  const generated = {};
  for (const format of ["pdf", "docx", "zip"]) {
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(`${baseUrl}/api/delivery/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...documentPayload, format }),
      });
      if (response.ok || ![502, 503, 504].includes(response.status) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || bytes.length < 8_000) throw new Error(`${format} 생성 실패 status=${response.status} bytes=${bytes.length}`);
    generated[format] = bytes;
  }
  if (String.fromCharCode(...generated.pdf.slice(0, 4)) !== "%PDF") throw new Error("PDF 시그니처가 올바르지 않습니다.");
  const pdfPageCount = (Buffer.from(generated.pdf).toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  if (pdfPageCount < 4 || pdfPageCount > 8) throw new Error(`PDF 페이지 구성이 비정상입니다. pages=${pdfPageCount}`);
  if (generated.docx[0] !== 0x50 || generated.docx[1] !== 0x4b) throw new Error("Word 시그니처가 올바르지 않습니다.");
  const docxZip = await JSZip.loadAsync(generated.docx);
  const documentXml = await docxZip.file("word/document.xml")?.async("text");
  if (!documentXml?.includes("손익분기") || !documentXml.includes("49,000원")) throw new Error("Word 본문에 상세 결과가 없습니다.");
  const packageZip = await JSZip.loadAsync(generated.zip);
  const packageFiles = Object.keys(packageZip.files);
  if (
    packageFiles.length !== 2 ||
    packageFiles.filter((name) => name.endsWith(".pdf")).length !== 1 ||
    packageFiles.filter((name) => name.endsWith(".docx")).length !== 1 ||
    packageFiles.some((name) => name.endsWith(".md"))
  ) throw new Error(`ZIP 구성 오류 ${packageFiles.join(", ")}`);

  console.log(JSON.stringify({ passed: true, ...result, mobileReportNavigation, documentPanel, presentationPreviews, documentEditor, documentPreview, grantDocumentPreview, desktopLayout, expertConsultation, customerGuide, guidedMissionCount, firstMissionId, secondMissionId, recoveredMissionId, spaceQuoteCount, brandStudio, deckResults, pdfPageCount, documentBytes: Object.fromEntries(Object.entries(generated).map(([key, value]) => [key, value.length])) }, null, 2));
} finally {
  await browser.close();
}
