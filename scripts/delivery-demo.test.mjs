import puppeteer from "puppeteer-core";
import JSZip from "jszip";

const baseUrl = process.env.BASE_URL ?? "http://localhost:8083";
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
  await page.goto(`${baseUrl}/?view=sample`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    localStorage.removeItem("venture-paid-report-landing-demo");
    localStorage.removeItem("venture-beginner-missions-demo");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".final-report-viewer");

  const tabs = [
    ["상품·손익", "첫 상품과 손익 기준", ".report-sheet"],
    ["시장 확인", "확인된 수요와 아직 모르는 점", ".report-sheet"],
    ["판매 페이지", "내 사업 홈페이지", ".landing-quick-editor"],
    ["실행 도우미", "필요할 때 한 가지씩 진행하세요", ".report-sheet"],
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
    paymentAmount: document.querySelector(".delivery-receipt-row strong")?.textContent?.trim(),
    receiptButton: [...document.querySelectorAll(".delivery-receipt-row button")]
      .some((button) => button.textContent?.includes("영수증(PDF)")),
    documentActionCount: document.querySelectorAll(".delivery-document-actions button").length,
  }));
  await page.evaluate(() => document.querySelector(".deliverable-list")?.scrollIntoView());
  await page.evaluate(() => {
    const article = [...document.querySelectorAll(".deliverable-list article")]
      .find((node) => node.querySelector("strong")?.textContent?.includes("근거 기반 사업계획서"));
    article?.querySelector(".delivery-document-actions button")?.click();
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
    hasWhy: document.querySelector(".mission-why")?.textContent?.includes("왜 최근 해결 방법을 보나요") ?? false,
    canSkip: [...document.querySelectorAll(".mission-evidence-options button")].some((button) => button.textContent?.includes("지금은 건너뛰기")),
  }));
  const firstMissionId = await page.$eval(".mission-guided-card", (card) => card.getAttribute("data-mission-id"));
  await page.click(".mission-complete");
  await page.waitForFunction(() => document.querySelector(".mission-message")?.textContent?.includes("확인 자료"));
  const missionEvidence = "공개후기-3건-20260714.pdf";
  const missionNote = "가격 질문을 추가했고 응답 원문을 정리했습니다.";
  await page.type(".mission-evidence input", missionEvidence);
  await page.type(".mission-evidence textarea", missionNote);
  await page.waitForFunction(() => document.querySelector(".mission-guided-card footer span")?.textContent?.includes("저장 가능"));
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
    domainShopCount: document.querySelectorAll(".landing-domain-shop a").length,
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
  if (!documentPanel.paymentAmount?.includes("990,000원")) throw new Error("결제 금액이 표시되지 않았습니다.");
  if (documentPanel.deliverableCount !== 10 || documentPanel.documentActionCount !== 30) throw new Error(`결과물 구성이 올바르지 않습니다. ${JSON.stringify(documentPanel)}`);
  if (!result.demoDisclosure || !documentPanel.receiptButton) throw new Error("예시 고지 또는 영수증 버튼이 없습니다.");
  if (!result.sampleStartButton) throw new Error("샘플 시작 버튼이 없습니다.");
  if (documentPreview.textLength < 1_000 || documentPreview.tableCount < 2 || !documentPreview.hasSampleNotice || documentPreview.overflow > 1) {
    throw new Error(`상세 문서 미리보기 검증 실패 ${JSON.stringify(documentPreview)}`);
  }
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
  if (
    spaceQuoteCount !== 3 ||
    guidedMissionCount !== 1 ||
    customerGuide.optionCount !== 3 ||
    !customerGuide.hasWhy ||
    !customerGuide.canSkip ||
    !result.missionSaved ||
    !brandStudio ||
    savedMission?.status !== "done" ||
    savedMission?.evidence !== missionEvidence ||
    savedMission?.note !== missionNote ||
    secondMissionId !== recoveredMissionId
  ) throw new Error(`초보자 미션 저장·다음 단계·복구 흐름이 정상 작동하지 않습니다. ${JSON.stringify({ guidedMissionCount, firstMissionId, secondMissionId, recoveredMissionId, savedMission })}`);

  const deckResponse = await fetch(`${baseUrl}/api/delivery/deck`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });
  const deckBytes = new Uint8Array(await deckResponse.arrayBuffer());
  if (!deckResponse.ok || deckBytes[0] !== 0x50 || deckBytes[1] !== 0x4b || deckBytes.length < 20_000) {
    throw new Error(`PPTX 생성 실패 status=${deckResponse.status} bytes=${deckBytes.length}`);
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
    const response = await fetch(`${baseUrl}/api/delivery/document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...documentPayload, format }),
    });
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
  if (packageFiles.length !== 6 || packageFiles.some((name) => name.endsWith(".md"))) throw new Error(`ZIP 구성 오류 ${packageFiles.join(", ")}`);

  console.log(JSON.stringify({ passed: true, ...result, documentPanel, documentPreview, desktopLayout, expertConsultation, customerGuide, guidedMissionCount, firstMissionId, secondMissionId, recoveredMissionId, spaceQuoteCount, brandStudio, deckBytes: deckBytes.length, pdfPageCount, documentBytes: Object.fromEntries(Object.entries(generated).map(([key, value]) => [key, value.length])) }, null, 2));
} finally {
  await browser.close();
}
