import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:8083").replace(/\/$/, "");
const executablePath = process.env.CHROME_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const expectCheckout = process.env.EXPECT_CHECKOUT === "true";

async function setInputValue(page, selector, value) {
  await page.$eval(selector, (element, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(value));
}

async function recommendationState(page) {
  return page.evaluate(() => ({
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    cards: [...document.querySelectorAll(".opportunity-card")].map((card) => {
      const title = card.querySelector("h3");
      const description = card.querySelector(".op-line");
      return {
        title: title?.textContent?.trim() ?? "",
        description: description?.textContent?.trim() ?? "",
        primaryAction: card.querySelector(".op-start-preview")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        titleOverflow: title ? Math.max(0, title.scrollWidth - title.clientWidth) : 0,
        descriptionOverflow: description ? Math.max(0, description.scrollWidth - description.clientWidth) : 0,
        descriptionClamp: description ? getComputedStyle(description).webkitLineClamp : "",
        cardOverflow: Math.max(0, card.scrollWidth - card.clientWidth),
      };
    }),
  }));
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    const source = message.location().url;
    consoleErrors.push(source ? `${message.text()} (${source})` : message.text());
  }
});

try {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".home-hero-actions .conversation-choice");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".home-hero-actions .conversation-choice");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const homeMobile = await page.evaluate(() => {
    const title = document.querySelector(".home-hero-copy h1");
    const action = document.querySelector(".home-hero-actions .conversation-choice");
    const titleStyle = title ? getComputedStyle(title) : null;
    const lineHeight = titleStyle ? Number.parseFloat(titleStyle.lineHeight) : 0;
    return {
      titleLines: title && lineHeight ? Math.round(title.getBoundingClientRect().height / lineHeight) : 0,
      titleOverflow: title ? Math.max(0, title.scrollWidth - title.clientWidth) : 0,
      actionBackground: action ? getComputedStyle(action).backgroundColor : "",
    };
  });
  await page.screenshot({ path: "/tmp/today-startup-home-typography-mobile.png", fullPage: false });
  await page.click(".home-hero-actions .conversation-choice");
  await page.waitForSelector(".start-mode-cards");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.screenshot({ path: "/tmp/today-startup-start-choice-mobile.png", fullPage: false });
  await page.click(".start-mode-cards > button:first-child");

  for (let index = 0; index < 8; index += 1) {
    await page.waitForSelector(".choice-pair > button:first-child");
    await page.click(".choice-pair > button:first-child");
    await page.click(".guided-next");
  }

  await page.waitForSelector('[aria-label="질문 시작 예산"]');
  await setInputValue(page, '[aria-label="질문 시작 예산"]', 100);
  await page.click(".guided-next");
  await page.waitForSelector('[aria-label="질문 주당 사용할 시간"]');
  await setInputValue(page, '[aria-label="질문 주당 사용할 시간"]', 10);
  await page.click(".guided-next");
  await page.waitForSelector(".profile-page");
  const profileMobileAction = await page.evaluate(() => {
    const action = document.querySelector(".mobile-confirm-action");
    const primary = document.querySelector(".mobile-confirm-action .primary-cta");
    const rect = action?.getBoundingClientRect();
    return {
      position: action ? getComputedStyle(action).position : "",
      bottomGap: rect ? Math.round(window.innerHeight - rect.bottom) : -1,
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      label: action?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      background: primary ? getComputedStyle(primary).backgroundColor : "",
    };
  });
  await page.screenshot({ path: "/tmp/today-startup-profile-fixed-action-mobile.png", fullPage: false });
  await page.click(".profile-page .primary-cta");
  await page.waitForSelector(".opportunity-card");

  const mobile = await recommendationState(page);
  await page.click(".explore-condition-button");
  await page.waitForSelector(".manual-finder-actions");
  const conditionMobileAction = await page.evaluate(() => {
    const action = document.querySelector(".manual-finder-actions");
    const rect = action?.getBoundingClientRect();
    return {
      position: action ? getComputedStyle(action).position : "",
      bottomGap: rect ? Math.round(window.innerHeight - rect.bottom) : -1,
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      label: action?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });
  await page.screenshot({ path: "/tmp/today-startup-condition-fixed-action-mobile.png", fullPage: false });
  await page.click(".manual-finder-actions button:first-child");
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.screenshot({ path: "/tmp/today-startup-easy-names-mobile.png", fullPage: true });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".opportunity-card");
  const desktop = await recommendationState(page);
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.screenshot({ path: "/tmp/today-startup-easy-names-desktop.png", fullPage: false });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.click(".opportunity-card .op-start-preview");
  await page.waitForSelector(".op-detail");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const detailMobile = await page.evaluate(() => {
    const modalRect = document.querySelector(".op-detail")?.getBoundingClientRect();
    const actionRect = document.querySelector(".start-opportunity")?.getBoundingClientRect();
    return {
      heading: document.querySelector(".op-detail h2")?.textContent?.trim(),
      nameLabel: document.querySelector(".op-detail-name-section .op-detail-field-label")?.textContent?.trim(),
      context: document.querySelector(".detail-sector")?.textContent?.replace(/\s+/g, " ").trim(),
      description: document.querySelector(".op-detail-hero .detail-lead")?.textContent?.replace(/\s+/g, " ").trim(),
      descriptionLabel: document.querySelector(".op-detail-description-section .op-detail-field-label")?.textContent?.trim(),
      decision: document.querySelector(".detail-decision")?.textContent?.replace(/\s+/g, " ").trim(),
      startAction: document.querySelector(".start-opportunity")?.textContent?.replace(/\s+/g, " ").trim(),
      secondaryActions: [...document.querySelectorAll(".detail-actions-stacked > button:not(.start-opportunity)")].map((button) => button.textContent?.replace(/\s+/g, " ").trim()),
      moreInfoLabel: document.querySelector(".detail-more-info summary")?.textContent?.replace(/\s+/g, " ").trim(),
      moreInfoOpen: document.querySelector(".detail-more-info")?.hasAttribute("open"),
      modalBottom: Math.round(modalRect?.bottom ?? 0),
      actionBottom: Math.round(actionRect?.bottom ?? 0),
      viewportHeight: window.innerHeight,
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    };
  });
  await page.screenshot({ path: "/tmp/today-startup-opportunity-detail-mobile.png", fullPage: false });
  await page.click(".detail-more-info summary");
  await page.waitForFunction(() => document.querySelector(".detail-more-info")?.hasAttribute("open"));
  detailMobile.moreInfoExpanded = await page.evaluate(() => ({
    open: document.querySelector(".detail-more-info")?.hasAttribute("open"),
    riskVisible: Boolean(document.querySelector(".detail-more-info .risk-box")),
    actionBottom: Math.round(document.querySelector(".start-opportunity")?.getBoundingClientRect().bottom ?? 0),
    viewportHeight: window.innerHeight,
  }));
  await page.click(".detail-more-info summary");
  await page.click(".start-opportunity");
  await page.waitForSelector(".purchase-preview-page");
  const previewMobile = await page.evaluate(() => ({
    view: new URL(location.href).searchParams.get("view"),
    pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    tabCount: document.querySelectorAll(".purchase-preview-tabs button").length,
    tabLabels: [...document.querySelectorAll(".purchase-preview-tabs button")].map((button) => button.textContent?.replace(/\s+/g, " ").trim()),
    checkoutHidden: !document.querySelector(".checkout-page"),
    title: document.querySelector(".purchase-plan-paper > h2")?.textContent?.trim(),
    paymentAction: document.querySelector(".purchase-plan-paper > footer button")?.textContent?.replace(/\s+/g, " ").trim(),
    mobilePaymentAction: document.querySelector(".purchase-preview-mobile-action button")?.textContent?.replace(/\s+/g, " ").trim(),
    mobilePaymentPosition: getComputedStyle(document.querySelector(".purchase-preview-mobile-action")).position,
    mobilePaymentBottomGap: Math.round(window.innerHeight - document.querySelector(".purchase-preview-mobile-action").getBoundingClientRect().bottom),
  }));
  await page.click('.purchase-preview-tabs button:nth-child(2)');
  await page.waitForSelector(".sample-delivery .presentation-preview");
  previewMobile.presentationSampleView = await page.evaluate(() => new URL(location.href).searchParams.get("view"));
  previewMobile.presentationReturnTo = await page.evaluate(() => new URL(location.href).searchParams.get("returnTo"));
  previewMobile.slideCount = await page.$$eval(".presentation-thumbnail-rail button", (items) => items.length);
  await page.click('[aria-label="발표자료 미리보기 닫기"]');
  await page.waitForSelector(".purchase-preview-page");
  previewMobile.presentationClosedTo = await page.evaluate(() => new URL(location.href).searchParams.get("view"));
  await page.click('.purchase-preview-tabs button:nth-child(3)');
  await page.waitForSelector(".sample-delivery .landing-fullscreen-preview");
  previewMobile.landingSampleView = await page.evaluate(() => new URL(location.href).searchParams.get("view"));
  previewMobile.landingReturnTo = await page.evaluate(() => new URL(location.href).searchParams.get("returnTo"));
  previewMobile.fullscreenLanding = true;
  await page.click('[aria-label="미리보기 닫기"]');
  await page.waitForSelector(".purchase-preview-page");
  previewMobile.landingClosedTo = await page.evaluate(() => new URL(location.href).searchParams.get("view"));
  await page.screenshot({ path: "/tmp/today-startup-free-preview-mobile.png", fullPage: true });

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".purchase-preview-page");
  const previewDesktop = await page.evaluate(() => ({
    view: new URL(location.href).searchParams.get("view"),
    pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    stageOverflow: Math.max(0, document.querySelector(".purchase-preview-stage")?.scrollWidth - document.querySelector(".purchase-preview-stage")?.clientWidth),
    checkoutHidden: !document.querySelector(".checkout-page"),
  }));
  await page.screenshot({ path: "/tmp/today-startup-free-preview-desktop.png", fullPage: false });
  await page.click(".purchase-sample-button");
  await page.waitForSelector(".sample-delivery");
  const sampleFromPreview = await page.evaluate(() => ({
    view: new URL(location.href).searchParams.get("view"),
    returnLabel: document.querySelector(".sample-return-button")?.textContent?.replace(/\s+/g, " ").trim(),
    resultTabs: document.querySelectorAll(".final-report-sidebar nav button").length,
  }));
  await page.click(".sample-return-button");
  await page.waitForSelector(".purchase-preview-page");
  sampleFromPreview.returnedView = await page.evaluate(() => new URL(location.href).searchParams.get("view"));
  sampleFromPreview.returnedTitle = await page.$eval(".purchase-plan-paper > h2", (element) => element.textContent?.trim());
  let checkout = null;
  let sampleFromCheckout = null;
  if (expectCheckout) {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.click(".purchase-preview-mobile-action button");
    await page.waitForSelector(".checkout-page");
    checkout = await page.evaluate(() => ({
      view: new URL(location.href).searchParams.get("view"),
      selectedTitle: document.querySelector(".chosen-opportunity h3")?.textContent?.trim(),
      projectCreatedBeforePayment: Boolean(localStorage.getItem("venture-project-id")),
      backLabel: document.querySelector(".checkout-page .start-back")?.textContent?.replace(/\s+/g, " ").trim(),
    }));
    await page.click(".checkout-sample-button");
    await page.waitForSelector(".sample-delivery");
    sampleFromCheckout = await page.evaluate(() => ({
      view: new URL(location.href).searchParams.get("view"),
      returnLabel: document.querySelector(".sample-return-button")?.textContent?.replace(/\s+/g, " ").trim(),
    }));
    await page.click(".sample-return-button");
    await page.waitForSelector(".checkout-page");
    sampleFromCheckout.returnedView = await page.evaluate(() => new URL(location.href).searchParams.get("view"));
    await page.waitForSelector('[data-checkout-step="1"]');
    await new Promise((resolve) => setTimeout(resolve, 500));
    sampleFromCheckout.stepOne = await page.evaluate(() => ({
      step: document.querySelector(".checkout-wizard-card")?.getAttribute("data-checkout-step"),
      heading: document.querySelector(".checkout-wizard-card h2")?.textContent?.trim(),
      nextAction: document.querySelector(".checkout-next")?.textContent?.replace(/\s+/g, " ").trim(),
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    }));
    await page.screenshot({ path: "/tmp/today-startup-checkout-step-1-mobile.png", fullPage: false });
    await page.click(".checkout-next");
    await page.waitForSelector('[data-checkout-step="2"]');
    await setInputValue(page, '[aria-label="입금자명"]', "김테스트");
    await setInputValue(page, '[aria-label="연락받을 휴대전화"]', "01012345678");
    await page.click(".manual-transfer-form fieldset button:nth-child(3)");
    await page.waitForFunction(() => !document.querySelector(".checkout-next")?.hasAttribute("disabled"));
    await new Promise((resolve) => setTimeout(resolve, 350));
    sampleFromCheckout.stepTwo = await page.evaluate(() => ({
      step: document.querySelector(".checkout-wizard-card")?.getAttribute("data-checkout-step"),
      nextAction: document.querySelector(".checkout-next")?.textContent?.replace(/\s+/g, " ").trim(),
      receiptChoice: document.querySelector(".manual-transfer-form fieldset button.active")?.textContent?.trim(),
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    }));
    await page.screenshot({ path: "/tmp/today-startup-checkout-step-2-mobile.png", fullPage: false });
    await page.click(".checkout-next");
    await page.waitForSelector('[data-checkout-step="3"]');
    await page.click(".agreement-all input");
    await page.waitForFunction(() => document.querySelector(".agreement-all input")?.checked === true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    sampleFromCheckout.stepThree = await page.evaluate(() => ({
      step: document.querySelector(".checkout-wizard-card")?.getAttribute("data-checkout-step"),
      payAction: document.querySelector(".pay-button")?.textContent?.replace(/\s+/g, " ").trim(),
      allAgreed: document.querySelector(".agreement-all input")?.checked,
      loginRequired: Boolean(document.querySelector(".checkout-blocked")),
      disclaimer: document.querySelector(".checkout-final-disclaimer")?.textContent?.replace(/\s+/g, " ").trim(),
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    }));
    await page.screenshot({ path: "/tmp/today-startup-checkout-step-3-mobile.png", fullPage: false });
    await page.click(".checkout-previous");
    await page.waitForSelector('[data-checkout-step="2"]');
    sampleFromCheckout.previousReturnedStep = await page.$eval(".checkout-wizard-card", (element) => element.getAttribute("data-checkout-step"));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('[data-checkout-step="1"]');
    checkout.refreshRestored = true;
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    sampleFromCheckout.desktop = await page.evaluate(() => ({
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      shellWidth: Math.round(document.querySelector(".checkout-wizard-shell")?.getBoundingClientRect().width ?? 0),
      actionWidth: Math.round(document.querySelector(".checkout-wizard-actions")?.getBoundingClientRect().width ?? 0),
    }));
    await page.screenshot({ path: "/tmp/today-startup-checkout-step-1-desktop.png", fullPage: false });
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const conversationUrl = new URL(baseUrl);
  conversationUrl.searchParams.set("view", "conversation");
  await page.goto(conversationUrl.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  for (let index = 0; index < 4; index += 1) {
    await page.waitForSelector(".narrative-input textarea");
    await page.type(".narrative-input textarea", "실제 경험을 바탕으로 차분하게 정리하고 운영하는 일을 좋아합니다.");
    await page.click(".guided-next");
  }
  await page.waitForSelector('[aria-label="대화 시작 예산"]');
  await setInputValue(page, '[aria-label="대화 시작 예산"]', 100);
  await page.click(".guided-next");
  await page.waitForSelector('[aria-label="대화 주당 사용할 시간"]');
  await setInputValue(page, '[aria-label="대화 주당 사용할 시간"]', 10);
  await page.click(".guided-next");
  await page.waitForSelector(".understanding-review .mobile-confirm-action");
  const reviewMobileAction = await page.evaluate(() => {
    const action = document.querySelector(".understanding-review .mobile-confirm-action");
    const rect = action?.getBoundingClientRect();
    return {
      position: action ? getComputedStyle(action).position : "",
      bottomGap: rect ? Math.round(window.innerHeight - rect.bottom) : -1,
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      label: action?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });
  await page.screenshot({ path: "/tmp/today-startup-review-fixed-action-mobile.png", fullPage: false });

  for (const state of [mobile, desktop]) {
    assert.equal(state.pageOverflow, 0, `${state.viewport} 추천 화면에 가로 넘침이 있습니다.`);
    assert.ok(state.cards.length >= 4, `${state.viewport} 추천 카드가 부족합니다.`);
    assert.ok(state.cards.every((card) => card.title.length <= 18));
    assert.ok(state.cards.every((card) => card.titleOverflow === 0 && card.cardOverflow === 0));
    assert.ok(state.cards.every((card) => /[.!?]$/.test(card.description)));
    assert.ok(state.cards.every((card) => card.primaryAction === "선택하기"));
    assert.ok(state.cards.every((card) => !/(연결망|실험실|가맹모델|코파일럿|큐레이션|내비게이터|리디자인)/.test(card.title)));
  }
  assert.ok(mobile.cards.every((card) => card.descriptionOverflow === 0));
  assert.ok(
    mobile.cards.every((card) => card.descriptionClamp === "none" || card.descriptionClamp === "unset"),
    `모바일 설명 줄임 설정이 남아 있습니다: ${mobile.cards.map((card) => card.descriptionClamp).join(", ")}`,
  );
  assert.equal(homeMobile.titleLines, 2);
  assert.equal(homeMobile.titleOverflow, 0);
  assert.notEqual(homeMobile.actionBackground, "rgb(216, 255, 98)");
  assert.equal(previewMobile.view, "preview");
  assert.equal(profileMobileAction.position, "fixed");
  assert.equal(profileMobileAction.bottomGap, 0);
  assert.equal(profileMobileAction.pageOverflow, 0);
  assert.notEqual(profileMobileAction.background, "rgb(216, 255, 98)");
  assert.match(profileMobileAction.label, /내 사업 찾기 시작/);
  assert.equal(conditionMobileAction.position, "fixed");
  assert.equal(conditionMobileAction.bottomGap, 0);
  assert.equal(conditionMobileAction.pageOverflow, 0);
  assert.match(conditionMobileAction.label, /이 조건으로 추천 보기/);
  assert.equal(reviewMobileAction.position, "fixed");
  assert.equal(reviewMobileAction.bottomGap, 0);
  assert.equal(reviewMobileAction.pageOverflow, 0);
  assert.match(reviewMobileAction.label, /추천 결과 보기/);
  assert.ok((detailMobile.context ?? "").length > 2);
  assert.equal(detailMobile.nameLabel, "사업명");
  assert.ok((detailMobile.description ?? "").length > 10);
  assert.equal(detailMobile.descriptionLabel, "사업 설명");
  assert.match(detailMobile.decision ?? "", /무료 초안/);
  assert.equal(detailMobile.startAction, "시작하기");
  assert.deepEqual(detailMobile.secondaryActions, []);
  assert.match(detailMobile.moreInfoLabel ?? "", /더 자세히 보기/);
  assert.equal(detailMobile.moreInfoOpen, false);
  assert.ok(detailMobile.actionBottom <= detailMobile.viewportHeight, "상세 화면 시작 버튼이 모바일 화면 아래로 잘렸습니다.");
  assert.equal(detailMobile.moreInfoExpanded?.open, true);
  assert.equal(detailMobile.moreInfoExpanded?.riskVisible, true);
  assert.ok((detailMobile.moreInfoExpanded?.actionBottom ?? 0) <= (detailMobile.moreInfoExpanded?.viewportHeight ?? 0));
  assert.equal(detailMobile.pageOverflow, 0);
  assert.equal(previewMobile.pageOverflow, 0);
  assert.equal(previewMobile.tabCount, 3);
  assert.deepEqual(previewMobile.tabLabels, ["초안", "PPT", "판매페이지"]);
  assert.equal(previewMobile.checkoutHidden, true);
  assert.equal(previewMobile.presentationSampleView, "sample");
  assert.equal(previewMobile.presentationReturnTo, "preview");
  assert.equal(previewMobile.presentationClosedTo, "preview");
  assert.equal(previewMobile.slideCount, 12);
  assert.equal(previewMobile.landingSampleView, "sample");
  assert.equal(previewMobile.landingReturnTo, "preview");
  assert.equal(previewMobile.landingClosedTo, "preview");
  assert.equal(previewMobile.fullscreenLanding, true);
  assert.equal(previewMobile.paymentAction, "결제하기");
  assert.match(previewMobile.mobilePaymentAction ?? "", /결제하기/);
  assert.equal(previewMobile.mobilePaymentPosition, "fixed");
  assert.equal(previewMobile.mobilePaymentBottomGap, 0);
  assert.equal(previewDesktop.view, "preview");
  assert.equal(previewDesktop.pageOverflow, 0);
  assert.equal(previewDesktop.stageOverflow, 0);
  assert.equal(previewDesktop.checkoutHidden, true);
  assert.equal(sampleFromPreview.view, "sample");
  assert.match(sampleFromPreview.returnLabel ?? "", /내 초안으로 돌아가기/);
  assert.ok(sampleFromPreview.resultTabs >= 6);
  assert.equal(sampleFromPreview.returnedView, "preview");
  assert.equal(sampleFromPreview.returnedTitle, previewMobile.title);
  if (expectCheckout) {
    assert.equal(checkout?.view, "checkout");
    assert.equal(checkout?.selectedTitle, previewMobile.title);
    assert.equal(checkout?.projectCreatedBeforePayment, false);
    assert.match(checkout?.backLabel ?? "", /초안 미리보기로 돌아가기/);
    assert.equal(checkout?.refreshRestored, true);
    assert.equal(sampleFromCheckout?.view, "sample");
    assert.match(sampleFromCheckout?.returnLabel ?? "", /결제 화면으로 돌아가기/);
    assert.equal(sampleFromCheckout?.returnedView, "checkout");
    assert.equal(sampleFromCheckout?.stepOne?.step, "1");
    assert.match(sampleFromCheckout?.stepOne?.nextAction ?? "", /다음: 입금 정보/);
    assert.equal(sampleFromCheckout?.stepTwo?.step, "2");
    assert.match(sampleFromCheckout?.stepTwo?.nextAction ?? "", /다음: 필수 확인/);
    assert.equal(sampleFromCheckout?.stepTwo?.receiptChoice, "번호 없이 발급");
    assert.equal(sampleFromCheckout?.stepThree?.step, "3");
    assert.match(sampleFromCheckout?.stepThree?.payAction ?? "", /계좌이체 신청하기/);
    assert.equal(sampleFromCheckout?.stepThree?.allAgreed, true);
    assert.match(sampleFromCheckout?.stepThree?.disclaimer ?? "", /사업 성공/);
    assert.match(sampleFromCheckout?.stepThree?.disclaimer ?? "", /보장하지 않습니다/);
    assert.equal(sampleFromCheckout?.previousReturnedStep, "2");
    assert.equal(sampleFromCheckout?.stepOne?.pageOverflow, 0);
    assert.equal(sampleFromCheckout?.stepTwo?.pageOverflow, 0);
    assert.equal(sampleFromCheckout?.stepThree?.pageOverflow, 0);
    assert.equal(sampleFromCheckout?.desktop?.pageOverflow, 0);
    assert.ok((sampleFromCheckout?.desktop?.shellWidth ?? 0) <= 760);
    assert.ok((sampleFromCheckout?.desktop?.actionWidth ?? 0) <= (sampleFromCheckout?.desktop?.shellWidth ?? 0));
    assert.ok((sampleFromCheckout?.desktop?.actionWidth ?? 0) >= 680);
  }
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({ homeMobile, profileMobileAction, conditionMobileAction, reviewMobileAction, mobile, desktop, detailMobile, previewMobile, previewDesktop, sampleFromPreview, checkout, sampleFromCheckout, consoleErrors }, null, 2));
} finally {
  await browser.close();
}
