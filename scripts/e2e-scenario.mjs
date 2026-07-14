import puppeteer from "puppeteer-core";

const baseUrl = process.env.BASE_URL ?? "http://localhost:8083";
const executablePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickButtonByText(page, text) {
  await page.waitForFunction(
    (label) =>
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent?.replace(/\s+/g, " ").includes(label),
      ),
    { timeout: 15_000 },
    text,
  );
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) =>
        candidate.textContent?.replace(/\s+/g, " ").includes(label) &&
        !candidate.disabled,
    );
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`누를 수 있는 "${text}" 버튼을 찾지 못했습니다.`);
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (label) => document.body.innerText.includes(label),
    { timeout: 60_000 },
    text,
  );
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

async function setFieldByLabel(page, label, value) {
  const changed = await page.evaluate((targetLabel, nextValue) => {
    const labelElement = [...document.querySelectorAll("label")].find(
      (candidate) =>
        candidate.querySelector(":scope > span")?.textContent?.trim() === targetLabel,
    );
    const element = labelElement?.querySelector("input, textarea, select");
    if (!element) return false;
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, label, String(value));
  if (!changed) throw new Error(`"${label}" 입력 필드를 찾지 못했습니다.`);
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

const report = {
  viewport: "390x844",
  opportunity: "",
  detailFooterVisible: false,
  horizontalOverflow: [],
  revisionVersion: null,
  reloadRecovery: false,
  businessSetup: {},
  marketPlan: {},
  regionalCoverage: {},
  landingDeployment: {},
  openAISettings: {},
  startFlow: {},
  payment: {},
  operations: {},
  executionLoop: {},
  stages: [],
  final: {},
  consoleErrors,
  pageErrors,
};

try {
  await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 30_000 });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle0" });

  await page.click(".home-hero-actions .conversation-choice");
  await page.waitForFunction(
    () => new URL(location.href).searchParams.get("view") === "start",
    { timeout: 10_000 },
  );
  report.startFlow = await page.evaluate(() => {
    const logo = document.querySelector(".brand-logo");
    const heading = document.querySelector(".start-choice-heading h1");
    return {
      path: location.search,
      heading: heading?.textContent?.replace(/\s+/g, " ").trim(),
      choiceCount: document.querySelectorAll(".start-mode-cards > button").length,
      logoLoaded: logo instanceof HTMLImageElement && logo.complete && logo.naturalWidth === 2200,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  if (
    report.startFlow.path !== "?view=start" ||
    report.startFlow.heading !== "시작 방법을 선택하세요!" ||
    report.startFlow.choiceCount !== 3 ||
    !report.startFlow.logoLoaded ||
    report.startFlow.overflow > 1
  ) {
    throw new Error(`시작 선택 화면 연결 실패: ${JSON.stringify(report.startFlow)}`);
  }
  await page.click(".start-back");
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has("view"),
    { timeout: 10_000 },
  );

  await page.click(".openai-settings-trigger");
  await page.waitForSelector(".openai-settings-dialog");
  report.openAISettings = await page.evaluate(() => ({
    dialogVisible: Boolean(document.querySelector(".openai-settings-dialog")),
    disconnectedNotice: document.querySelector(".openai-connection-status strong")?.textContent?.trim(),
    keyInputType: document.querySelector('.openai-settings-dialog input[placeholder="sk-..."]')?.getAttribute("type"),
    connectDisabled: document.querySelector(".openai-connect-button")?.hasAttribute("disabled"),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  await page.click(".openai-settings-dialog > header > button");
  await page.waitForSelector(".openai-settings-dialog", { hidden: true });

  await page.goto(`${baseUrl}/?view=assessment`, { waitUntil: "networkidle0", timeout: 30_000 });
  await page.waitForSelector(".assessment-page");

  for (let index = 0; index < 8; index += 1) {
    await page.waitForSelector(".choice-pair > button");
    const previousStep = await page.$eval(".assessment-nav > span", (node) => node.textContent);
    await page.click(".choice-pair > button:first-child");
    if (index < 7) {
      await page.waitForFunction(
        (step) => document.querySelector(".assessment-nav > span")?.textContent !== step,
        { timeout: 5_000 },
        previousStep,
      );
    }
  }

  await waitForText(page, "찾기 완료");
  await clickButtonByText(page, "추천 사업 보기");
  await page.waitForSelector(".opportunity-card");
  await page.click(".opportunity-card .op-actions button:last-child");
  await page.waitForSelector(".op-detail");

  const detailState = await page.evaluate(() => {
    const footer = document.querySelector(".op-detail-footer");
    const modal = document.querySelector(".op-detail");
    const title = document.querySelector("#opportunity-detail-title")?.textContent?.trim() ?? "";
    const footerRect = footer?.getBoundingClientRect();
    const modalRect = modal?.getBoundingClientRect();
    return {
      title,
      footerVisible: Boolean(
        footerRect &&
          modalRect &&
          footerRect.bottom <= window.innerHeight + 1 &&
          footerRect.top >= modalRect.top &&
          footerRect.height > 80,
      ),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  report.opportunity = detailState.title;
  report.detailFooterVisible = detailState.footerVisible;
  if (detailState.overflow > 1) report.horizontalOverflow.push(`상세 팝업: ${detailState.overflow}px`);

  await page.click(".start-opportunity");
  await page.waitForFunction(
    () => Boolean(document.querySelector(".project-page, .checkout-page")),
    { timeout: 20_000 },
  );
  if (await page.$(".checkout-page")) {
    await page.click(".agreement input");
    await page.click(".pay-button");
  }
  await page.waitForSelector(".project-page", { timeout: 20_000 });
  report.payment = await page.evaluate(async () => {
    const projectId = localStorage.getItem("venture-project-id");
    const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    const payload = await response.json();
    return {
      projectCreated: Boolean(projectId),
      paymentStatus: payload.project?.paymentStatus,
      serverAmount: payload.project?.packagePrice,
      pendingOrderCleared: localStorage.getItem("venture-pending-order") === null,
      sidebarLabel: document.querySelector(".payment-complete strong")?.textContent?.trim(),
    };
  });
  report.beginnerMissions = await page.evaluate(async () => {
    const projectId = localStorage.getItem("venture-project-id");
    const now = new Date().toISOString();
    const quote = (index) => ({
      id: `quote-${index}`,
      provider: "",
      optionType: "home",
      depositWon: 0,
      monthlyRentWon: 0,
      monthlyMaintenanceWon: 0,
      monthlyMailWon: 0,
      setupFeeWon: 0,
      vatIncluded: false,
      contractMonths: 12,
      registrationEligible: false,
      industryApproved: false,
      subleaseConsentVerified: false,
      cancellationChecked: false,
      evidence: "",
    });
    const workspace = {
      schemaVersion: "kr-beginner-launch-v1",
      startDate: now.slice(0, 10),
      missionProgress: {},
      spaceQuotes: [quote(1), quote(2), quote(3)],
      brand: {
        brandName: "E2E 브랜드",
        slogan: "초보자 실행 검증",
        markStyle: "wordmark",
        accentColor: "#0b7254",
      },
      selectedSupportOptions: ["brand-review"],
      updatedAt: now,
    };
    const saveResponse = await fetch(`/api/projects/${projectId}/missions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workspace),
    });
    const savePayload = await saveResponse.json();
    const readResponse = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    const readPayload = await readResponse.json();
    return {
      saveStatus: saveResponse.status,
      schemaVersion: savePayload.workspace?.schemaVersion,
      persistedBrand: readPayload.project?.launchMissionWorkspace?.brand?.brandName,
      quoteCount: readPayload.project?.launchMissionWorkspace?.spaceQuotes?.length ?? 0,
    };
  });
  if (
    report.beginnerMissions.saveStatus !== 200 ||
    report.beginnerMissions.persistedBrand !== "E2E 브랜드" ||
    report.beginnerMissions.quoteCount !== 3
  ) {
    throw new Error(`초보자 실행 미션 영구 저장 실패: ${JSON.stringify(report.beginnerMissions)}`);
  }
  report.serviceOps = await page.evaluate(async () => {
    const projectId = localStorage.getItem("venture-project-id");
    const response = await fetch(`/api/projects/${projectId}/audit`, { cache: "no-store" });
    const payload = await response.json();
    return {
      persistence: payload.persistence,
      logCount: payload.logs?.length ?? 0,
      hasPaymentAudit: payload.logs?.some((entry) => entry.action === "payment.confirmed"),
      panelVisible: Boolean(document.querySelector(".service-ops-panel")),
    };
  });

  const managerCopy = await page.evaluate(() => document.body.innerText.includes("전담 매니저"));
  if (managerCopy) throw new Error("프로젝트 화면에 전담 매니저 문구가 남아 있습니다.");

  for (let index = 0; index < 3; index += 1) {
    await page.$eval(".business-setup-panel .next-setup", (button) => button.click());
  }
  await page.$eval(".business-setup-panel .save-setup", (button) => button.click());
  await page.waitForSelector(".financial-result-hero", { timeout: 20_000 });
  report.businessSetup = await page.evaluate(() => ({
    breakEven: document.querySelector(".financial-result-hero > div:first-child strong")?.textContent?.trim(),
    fundingNeed: document.querySelector(".financial-result-hero > div:nth-child(2) strong")?.textContent?.trim(),
    requirementCount: document.querySelectorAll(".compliance-summary details").length,
  }));

  for (let stageIndex = 0; stageIndex < 6; stageIndex += 1) {
    const stageTitle = await page.$eval(".stage-heading h2", (node) => node.textContent?.trim() ?? "");
    console.error(`[E2E] ${stageIndex + 1}/6 ${stageTitle}`);
    if (stageIndex === 1) {
      await page.waitForSelector(".market-plan-panel");
      await setInputValue(page, ".market-form-grid label:nth-child(2) input", "테스트 상권 점포 현황");
      await setInputValue(page, ".market-form-grid label:nth-child(3) input", "점포 수");
      await setInputValue(page, ".market-form-grid label:nth-child(4) input", "128");
      await setInputValue(page, ".market-form-grid label:nth-child(5) input", "개");
      await setInputValue(page, ".market-form-grid label:nth-child(7) input", "서울시 상권분석서비스");
      await setInputValue(page, ".market-form-grid label:nth-child(9) input", "https://golmok.seoul.go.kr/");
      await page.select(".market-form-grid label:nth-child(10) select", "user_supplied");
      await page.$eval(".add-market-item", (button) => button.click());
      await page.waitForSelector(".market-item-list article");

      await clickButtonByText(page, "입지 비교");
      await setInputValue(page, ".location-form label:nth-child(1) input", "테스트 후보 A");
      await setInputValue(page, ".location-form label:nth-child(2) input", "서울시 성동구 테스트로 1");
      await setInputValue(page, ".location-form label:nth-child(4) input", "1200000");
      await setInputValue(page, ".location-form label:nth-child(5) input", "150000");
      await setInputValue(page, ".location-form label:nth-child(8) input", "18000000");
      await setInputValue(page, ".location-form label:nth-child(9) input", "9000");
      await setInputValue(page, ".location-form label:nth-child(10) input", "18");
      await setInputValue(page, ".location-form label:nth-child(11) input", "75");
      await setInputValue(page, ".location-form label:nth-child(12) input", "70");
      await setInputValue(page, ".location-form label:nth-child(13) input", "60");
      await setInputValue(page, ".location-form label:nth-child(16) input", "https://golmok.seoul.go.kr/");
      await setInputValue(page, ".location-form label:nth-child(17) input", new Date().toISOString().slice(0, 10));
      await page.$$eval(".location-checks label", (labels) => labels.forEach((label) => label.click()));
      await page.$eval(".location-form-actions .add-market-item", (button) => button.click());
      await page.waitForSelector(".location-score-grid article");
      await page.$eval(".location-score-grid article > div:last-child button:first-child", (button) => button.click());

      await clickButtonByText(page, "사업계획서");
      await page.$eval(".plan-empty button", (button) => button.click());
      await page.waitForSelector(".plan-readiness", { timeout: 20_000 });
      report.marketPlan = await page.evaluate(async () => {
        const projectId = localStorage.getItem("venture-project-id");
        const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        const payload = await response.json();
        return {
          evidenceCount: payload.project.marketWorkspace?.evidence.length ?? 0,
          locationCount: payload.project.marketWorkspace?.locations.length ?? 0,
          readiness: document.querySelector(".plan-readiness strong")?.textContent?.trim(),
          sectionCount: document.querySelectorAll(".plan-section-list details").length,
        };
      });
      await page.waitForSelector(".regional-coverage-panel:not(.loading)");
      report.regionalCoverage = await page.evaluate(() => ({
        title: document.querySelector(".regional-coverage-panel > header h3")?.textContent?.trim(),
        datasetCount: document.querySelectorAll(".regional-coverage-list > details").length,
        score: document.querySelector(".regional-score-ring strong")?.textContent?.trim(),
        freshLabel: document.querySelector(".regional-coverage-panel > header > em")?.textContent?.trim(),
      }));
    }
    if (stageIndex === 4) {
      await page.waitForSelector(".landing-builder-panel:not(.loading)");
      const initialLandingVersion = await page.evaluate(async () => {
        const projectId = localStorage.getItem("venture-project-id");
        const response = await fetch(`/api/projects/${projectId}/landing`, { cache: "no-store" });
        const payload = await response.json();
        return payload.site?.publishedVersion ?? 0;
      });
      if (initialLandingVersion !== 1) throw new Error(`결제 후 홈페이지 자동 공개 실패: v${initialLandingVersion}`);
      const testSlug = `e2e-launch-${Date.now()}`;
      await setInputValue(page, ".slug-input input", testSlug);
      await page.$$eval(".landing-toggle-grid label", (labels) => {
        const label = labels.find((candidate) => candidate.textContent?.includes("고객 신청폼 사용"));
        const input = label?.querySelector('input[type="checkbox"]');
        if (input && !input.checked) input.click();
      });

      const blockedPublishPromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname.endsWith("/landing/publish"),
        { timeout: 20_000 },
      );
      await page.$eval(".publish-landing", (button) => button.click());
      const blockedPublish = await blockedPublishPromise;
      const blockedPublishBody = await blockedPublish.json();
      if (blockedPublish.status() !== 400 || !blockedPublishBody.error?.message?.includes("개인정보 문의 연락처")) {
        throw new Error(`개인정보 누락 게시 차단 실패: ${blockedPublish.status()} ${JSON.stringify(blockedPublishBody)}`);
      }
      await waitForText(page, "개인정보 문의 연락처");
      await setFieldByLabel(page, "개인정보 문의 연락처", "privacy@venture-dna.kr");

      const publishResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname.endsWith("/landing/publish"),
        { timeout: 20_000 },
      );
      await page.$eval(".publish-landing", (button) => button.click());
      const publishResponse = await publishResponsePromise;
      if (!publishResponse.ok()) {
        throw new Error(`필수 개인정보 고지 입력 후 게시 실패: ${publishResponse.status()} ${await publishResponse.text()}`);
      }
      await page.waitForFunction(
        (version) => document.querySelector(".landing-builder-panel > header > em")?.textContent?.includes(`${version}판`),
        { timeout: 20_000 },
        initialLandingVersion + 1,
      );
      const publicPath = await page.$eval(".landing-builder-footer a", (anchor) => anchor.getAttribute("href"));
      const publicPage = await browser.newPage();
      await publicPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await publicPage.goto(`${baseUrl}${publicPath}`, { waitUntil: "networkidle0", timeout: 30_000 });
      await publicPage.waitForSelector(".public-landing-hero h1");
      await publicPage.type('.public-lead-section input[name="name"]', "E2E 신청자");
      await publicPage.type('.public-lead-section input[name="email"]', "e2e@example.com");
      await publicPage.click(".public-consent");
      await publicPage.click('.public-lead-section button[type="submit"]');
      await publicPage.waitForSelector(".public-lead-success", { timeout: 20_000 });
      const publicState = await publicPage.evaluate(() => ({
        title: document.querySelector(".public-landing-hero h1")?.textContent?.trim(),
        submitted: Boolean(document.querySelector(".public-lead-success")),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      await publicPage.close();
      await page.$eval(".landing-builder-tabs button:first-child", (button) => button.click());
      await setInputValue(page, ".landing-form-grid label.wide textarea", "E2E 변경 버전 랜딩페이지");
      await page.$eval(".publish-landing", (button) => button.click());
      await page.waitForFunction(
        (version) => document.querySelector(".landing-builder-panel > header > em")?.textContent?.includes(`${version}판`),
        { timeout: 20_000 },
        initialLandingVersion + 2,
      );
      await page.$eval(".landing-builder-tabs button:last-child", (button) => button.click());
      await page.waitForSelector(".landing-version-list article:last-child button");
      await page.$eval(".landing-version-list article:last-child button", (button) => button.click());
      await page.waitForFunction(
        () => document.querySelector(".landing-builder-panel > header > em")?.textContent?.includes("1판"),
        { timeout: 20_000 },
      );
      const landingState = await page.evaluate(async () => {
        const projectId = localStorage.getItem("venture-project-id");
        const response = await fetch(`/api/projects/${projectId}/landing`, { cache: "no-store" });
        return response.json();
      });
      report.landingDeployment = {
        ...publicState,
        missingPrivacyBlocked: true,
        slug: landingState.site.slug,
        status: landingState.site.status,
        publishedVersion: landingState.site.publishedVersion,
        versionCount: landingState.site.versions.length,
        leads: landingState.site.metrics.leads,
      };
      if (publicState.overflow > 1) report.horizontalOverflow.push(`공개 랜딩: ${publicState.overflow}px`);
    }
    if (stageIndex === 5) {
      await page.waitForSelector(".operations-panel:not(.loading)");
      await page.$eval(".operations-tabs button:nth-child(2)", (button) => button.click());
      await setInputValue(page, ".quote-form label:nth-child(1) input", "E2E 공급처");
      await setInputValue(page, ".quote-form label:nth-child(2) input", "테스트 핵심 품목");
      await setInputValue(page, ".quote-form label:nth-child(3) input", "12000");
      await setInputValue(page, ".quote-form label:nth-child(4) input", "10");
      await setInputValue(page, ".quote-form label:nth-child(5) input", "3");
      await setInputValue(page, ".quote-form label:nth-child(6) input", "https://example.com/quote");
      await page.waitForFunction(() => {
        const values = [...document.querySelectorAll(".quote-form input")].map((input) => input.value);
        return JSON.stringify(values) === JSON.stringify([
          "E2E 공급처",
          "테스트 핵심 품목",
          "12000",
          "10",
          "3",
          "https://example.com/quote",
        ]);
      }, { timeout: 10_000 });
      await sleep(100);
      await page.$eval(".quote-form > button", (button) => button.click());
      await page.waitForSelector(".quote-list article");
      await page.$eval(".save-operations", (button) => button.click());
      await page.waitForFunction(
        async () => {
          const projectId = localStorage.getItem("venture-project-id");
          const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
          const payload = await response.json();
          return (payload.project.operationsWorkspace?.supplierQuotes.length ?? 0) > 0;
        },
        { timeout: 30_000 },
      );
      await page.$eval(".operations-tabs button:nth-child(4)", (button) => button.click());
      const checklistCount = await page.$$eval(".opening-check-list article", (items) => items.length);
      for (let checklistIndex = 0; checklistIndex < checklistCount; checklistIndex += 1) {
        await setInputValue(
          page,
          `.opening-check-list article:nth-child(${checklistIndex + 1}) input`,
          `https://example.com/evidence/${checklistIndex + 1}`,
        );
        await page.select(
          `.opening-check-list article:nth-child(${checklistIndex + 1}) select`,
          "verified",
        );
      }
      await page.$eval(".operations-tabs button:nth-child(5)", (button) => button.click());
      const insuranceCount = await page.$$eval(".insurance-list article", (items) => items.length);
      for (let insuranceIndex = 0; insuranceIndex < insuranceCount; insuranceIndex += 1) {
        await page.select(
          `.insurance-list article:nth-child(${insuranceIndex + 1}) select`,
          "verified",
        );
        await setInputValue(
          page,
          `.insurance-list article:nth-child(${insuranceIndex + 1}) input`,
          `https://example.com/insurance-evidence/${insuranceIndex + 1}`,
        );
      }
      await page.$eval(".save-operations", (button) => button.click());
      await page.waitForFunction(
        async () => {
          const projectId = localStorage.getItem("venture-project-id");
          const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
          const payload = await response.json();
          return (payload.project.operationsAssessment?.hardBlockers.length ?? 1) === 0;
        },
        { timeout: 30_000 },
      );
      report.operations = await page.evaluate(async () => {
        const projectId = localStorage.getItem("venture-project-id");
        const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        const payload = await response.json();
        return {
          quoteCount: payload.project.operationsWorkspace?.supplierQuotes.length ?? 0,
          readiness: payload.project.operationsAssessment?.readinessScore,
          blockerCount: payload.project.operationsAssessment?.hardBlockers.length,
          packageSections: payload.project.operationsPackage?.sections.length ?? 0,
        };
      });

      await page.waitForSelector(".execution-loop-panel:not(.loading)");
      await page.$eval(".execution-tabs button:nth-child(2)", (button) => button.click());
      await setInputValue(page, ".experiment-basic label:nth-child(1) input", "E2E 실제 판매 실험");
      await page.select(".experiment-basic label:nth-child(2) select", "advertising");
      await page.select(".experiment-basic label:nth-child(3) select", "search_ad");
      await page.select(".experiment-basic label:nth-child(4) select", "completed");
      const executionValues = ["100", "500", "50", "40", "10", "10", "8", "5", "0", "500000", "0", "100000", "150000"];
      for (let metricIndex = 0; metricIndex < executionValues.length; metricIndex += 1) {
        await setInputValue(page, `.experiment-metrics label:nth-child(${metricIndex + 1}) input`, executionValues[metricIndex]);
      }
      await setInputValue(page, ".experiment-wide input", "https://example.com/e2e-sales-evidence");
      await setInputValue(page, ".experiment-wide textarea", "실제 결제 5건에서 가격과 채널 반응을 확인했습니다.");
      await page.$eval(".add-experiment", (button) => button.click());
      await page.waitForSelector(".experiment-list article");
      await page.waitForSelector(".save-execution-loop:not(:disabled)");
      await page.$eval(".save-execution-loop", (button) => button.click());
      await page.waitForFunction(
        () => document.querySelector(".execution-message")?.textContent?.includes("다시 계산"),
        { timeout: 20_000 },
      );
      report.executionLoop = await page.evaluate(async () => {
        const projectId = localStorage.getItem("venture-project-id");
        const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        const payload = await response.json();
        return {
          experimentCount: payload.project.executionWorkspace?.experiments.length ?? 0,
          confidence: payload.project.executionAnalysis?.confidenceScore,
          averagePrice: payload.project.executionAnalysis?.calibratedFinancials.observedAveragePrice,
          cac: payload.project.executionAnalysis?.calibratedFinancials.customerAcquisitionCost,
          contribution: payload.project.executionAnalysis?.calibratedFinancials.observedContributionPerPurchase,
          breakEvenUnits: payload.project.executionAnalysis?.calibratedFinancials.observedBreakEvenUnits,
          validatedHypotheses: payload.project.executionAnalysis?.verdicts.filter(
            (item) => item.verdict === "validated",
          ).length,
        };
      });

      await page.waitForSelector(".quality-assurance-panel:not(.loading)");
      await page.evaluate(async () => {
        const projectId = localStorage.getItem("venture-project-id");
        await fetch(`/api/projects/${projectId}/quality`, { method: "POST" });
      });
      await page.waitForFunction(
        async () => {
          const projectId = localStorage.getItem("venture-project-id");
          if (!projectId) return false;
          const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
          const payload = await response.json();
          return Boolean(payload.project?.qualityAudit?.generatedAt);
        },
        { timeout: 30_000 },
      );
      report.qualityAssurance = await page.evaluate(async () => {
        const projectId = localStorage.getItem("venture-project-id");
        const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
        const payload = await response.json();
        return {
          status: payload.project.qualityAudit?.status,
          score: payload.project.qualityAudit?.score,
          regressionCount: payload.project.qualityAudit?.regressionScenarios.length ?? 0,
          failedRegressions: payload.project.qualityAudit?.regressionScenarios.filter(
            (item) => item.status === "failed",
          ).length,
          blockingApprovalFindings: payload.project.qualityAudit?.findings.filter(
            (item) => item.blocksApproval,
          ).length,
          legalSourceCount: payload.project.qualityAudit?.legalSources.length ?? 0,
        };
      });

      await page.waitForSelector(".grant-matcher-panel:not(.loading)");
      await setFieldByLabel(page, "창업자 만 나이", "33");
      await setFieldByLabel(
        page,
        "지원 목표",
        "E2E 예비창업패키지로 초기 고객 검증 비용을 확보하고 싶습니다.",
      );
      await page.$eval(".grant-matcher-panel > footer button:first-of-type", (button) => button.click());
      await page.waitForFunction(
        async () => {
          const projectId = localStorage.getItem("venture-project-id");
          if (!projectId) return false;
          const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
          const payload = await response.json();
          return Boolean(payload.project?.grantAnalysis?.generatedAt);
        },
        { timeout: 30_000 },
      );
      report.grantMatcher = await page.evaluate(async () => {
        const projectId = localStorage.getItem("venture-project-id");
        const response = await fetch(`/api/projects/${projectId}/grants`, { cache: "no-store" });
        const payload = await response.json();
        return {
          readinessScore: payload.analysis?.readinessScore,
          eligibleCount: payload.analysis?.eligibleCount,
          conditionalCount: payload.analysis?.conditionalCount,
          matchCount: payload.analysis?.matches.length ?? 0,
          packageSections: payload.grantPackage?.sections.length ?? 0,
          hasMarkdown: Boolean(payload.grantPackage?.markdown),
        };
      });
    }
    await page.waitForSelector(".generate-real-artifact:not(:disabled)");
    await page.$eval(".generate-real-artifact", (button) => button.click());
    await page.waitForFunction(
      () => document.querySelector(".review-ready") || document.querySelector(".service-error"),
      { timeout: 60_000 },
    );
    const serviceError = await page.$eval(
      ".service-error",
      (node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "",
    ).catch(() => "");
    if (serviceError) throw new Error(`${stageIndex + 1}단계 생성 실패: ${serviceError}`);
    if (stageIndex === 0) {
      await page.waitForSelector(".service-ops-panel:not(.loading)", { timeout: 15_000 });
      report.serviceOpsAfterGenerate = await page.evaluate(async () => {
        const projectId = localStorage.getItem("venture-project-id");
        const response = await fetch(`/api/projects/${projectId}/audit`, { cache: "no-store" });
        const payload = await response.json();
        return {
          logCount: payload.logs?.length ?? 0,
          hasGenerationAudit: payload.logs?.some((entry) => entry.action === "stage.generation_succeeded"),
        };
      });
    }

    if (stageIndex === 0) {
      await page.type(
        ".artifact-review-actions textarea",
        "첫 검증 계획을 초보자도 바로 실행할 수 있도록 세 단계로 더 쉽게 정리해주세요.",
      );
      await page.$eval(".artifact-review-actions > div:last-child > button:first-child", (button) => button.click());
      await page.waitForFunction(
        () => document.querySelector(".service-workflow-head > em")?.textContent?.includes("2판"),
        { timeout: 60_000 },
      );
      report.revisionVersion = 2;
    }

    await page.$$eval(".stage-task-list > button", (buttons) => {
      buttons.forEach((button) => button.click());
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".stage-task-list > button")].every(
        (button) => button.getAttribute("aria-pressed") === "true",
      ),
    );
    await page.waitForSelector(".approve-real-artifact:not(:disabled)");

    const projectSnapshot = await page.evaluate(async () => {
      const projectId = localStorage.getItem("venture-project-id");
      const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      return response.json();
    });
    const stage = projectSnapshot.project.stages[stageIndex];
    report.stages.push({
      index: stageIndex + 1,
      title: stageTitle,
      version: stage.artifacts[0]?.version,
      contentKeys: Object.keys(stage.artifacts[0]?.content ?? {}),
      statusBeforeApproval: stage.status,
    });

    const approvalResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/stages/${stageIndex}/approve`),
      { timeout: 30_000 },
    );
    await page.$eval(".approve-real-artifact", (button) => button.click());
    const approvalResponse = await approvalResponsePromise;
    if (stageIndex === 5) {
      const approvalBody = await approvalResponse.json();
      if (
        approvalResponse.status() !== 409 ||
        approvalBody.error?.code !== "QUALITY_GATE_BLOCKED"
      ) {
        throw new Error(
          `근거 미검증 프로젝트의 최종 승인이 차단되지 않았습니다: ${approvalResponse.status()} ${JSON.stringify(approvalBody)}`,
        );
      }
      report.final = {
        blockedAsExpected: true,
        approvalStatus: approvalResponse.status(),
        approvalCode: approvalBody.error.code,
        blockerMessage: approvalBody.error.message,
        approvedStageCount: projectSnapshot.project.stages.filter(
          (item) => item.status === "approved",
        ).length,
        activeStage: projectSnapshot.project.activeStage,
      };
      break;
    }
    if (!approvalResponse.ok()) {
      throw new Error(
        `${stageIndex + 1}단계 승인 실패 (${approvalResponse.status()}): ${await approvalResponse.text()}`,
      );
    }
    if (stageIndex < 5) {
      await page.waitForFunction(
        (previousTitle) =>
          document.querySelector(".stage-heading h2")?.textContent?.trim() !== previousTitle,
        { timeout: 15_000 },
        stageTitle,
      );
    }
    if (stageIndex === 1) {
      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector(".project-page");
      const recoveredTitle = await page.$eval(".stage-heading h2", (node) => node.textContent?.trim() ?? "");
      report.reloadRecovery = recoveredTitle === "실제로 살 수 있는 상품으로 바꿔요";
      if (!report.reloadRecovery) throw new Error(`새로고침 복구 실패: ${recoveredTitle}`);
    }
  }

  if (!report.final.blockedAsExpected) {
    await page.waitForSelector(".delivery-page", { timeout: 30_000 });
    await page.evaluate(() => {
      const documentsTab = [...document.querySelectorAll(".final-report-sidebar nav button")]
        .find((button) => button.getAttribute("aria-label") === "최종 결과물");
      documentsTab?.click();
    });
    await page.waitForSelector(".deliverable-list");
    const finalProject = await page.evaluate(async () => {
      const projectId = localStorage.getItem("venture-project-id");
      const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      return response.json();
    });
    const finalUi = await page.evaluate(() => ({
      deliverableCount: document.querySelectorAll(".deliverable-list > article").length,
      title: document.querySelector(".final-report-chrome span")?.textContent?.replace(/\s+/g, " ").trim(),
      reportAppHeader: document.querySelector(".final-report-chrome span")?.textContent?.replace(/\s+/g, " ").trim(),
      reportNavigationCount: document.querySelectorAll(".final-report-sidebar nav button").length,
      structureMatchesPreview: Boolean(document.querySelector(".final-report-chrome") && document.querySelector(".final-report-sidebar") && document.querySelector(".final-report-main")),
      automatedReview: document.body.innerText.includes("자동 일관성 검사 통과"),
      managerCopy: document.body.innerText.includes("전담 매니저"),
      approvedVersionLabels: [...document.querySelectorAll(".deliverable-list > article > em")]
        .filter((node) => /^v\d+ 승인본$/.test(node.textContent?.trim() ?? "")).length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    report.final = {
      ...finalUi,
      projectStatus: finalProject.project.status,
      activeStage: finalProject.project.activeStage,
      approvedStageCount: finalProject.project.stages.filter(
        (stage) => stage.status === "approved",
      ).length,
      artifactVersions: finalProject.project.stages.map(
        (stage) => stage.artifacts[0]?.version ?? 0,
      ),
    };
    if (!finalUi.structureMatchesPreview || finalUi.reportNavigationCount !== 6) {
      throw new Error(`최종 완료 화면이 메인 미리보기 구조와 다릅니다: ${JSON.stringify(finalUi)}`);
    }
    if (finalUi.overflow > 1) report.horizontalOverflow.push(`최종 납품: ${finalUi.overflow}px`);
  }

  await sleep(300);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const state = await page.evaluate(() => ({
    title: document.title,
    path: location.pathname,
    screen: document.querySelector("main")?.className,
    heading: document.querySelector("h1, h2")?.textContent?.replace(/\s+/g, " ").trim(),
    serviceError: document.querySelector(".service-error")?.textContent?.replace(/\s+/g, " ").trim(),
  })).catch(() => ({}));
  console.error(JSON.stringify({ failure: error.message, state, consoleErrors, pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
