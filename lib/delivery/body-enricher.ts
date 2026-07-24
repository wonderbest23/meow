import type { ProjectRecord } from "../service-domain";

function escapeTable(value: unknown) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function won(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "추가 확인"
    : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "자료 부족"
    : `${Math.round(value * 10) / 10}%`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function approvedContent(project: ProjectRecord, stageIndex: number) {
  const stage = project.stages[stageIndex];
  return record(stage?.artifacts.find((artifact) => artifact.id === stage.approvedArtifactId)?.content);
}

function append(markdown: string, sections: string[]) {
  const body = markdown.trim();
  const appendixIndex = body.search(/^# 참고 부록/m);
  if (appendixIndex < 0) return [body, ...sections.filter(Boolean)].join("\n\n");
  return [
    body.slice(0, appendixIndex).trim(),
    ...sections.filter(Boolean),
    body.slice(appendixIndex).trim(),
  ].join("\n\n");
}

function briefBody(project: ProjectRecord, markdown: string) {
  const financial = project.businessAssessment?.financial;
  const customer = escapeTable(project.opportunity.customer || "목표 고객 확인 필요");
  return append(markdown, [
    [
      "## 실행 의사결정표",
      "",
      "| 결정 항목 | 현재 초안 | 완료 기준 | 중단·수정 기준 |",
      "| --- | --- | --- | --- |",
      `| 첫 고객 | ${customer} | 최근 행동과 현재 대안을 설명한 고객 대화 확보 | 같은 문제가 반복되지 않으면 고객 범위 수정 |`,
      `| 첫 상품 | ${escapeTable(project.opportunity.model || "핵심 결과 한 가지")} | 같은 범위와 가격으로 실제 제안 가능 | 제공 범위가 매번 달라지면 상품 축소 |`,
      `| 가격 | ${won(financial?.grossPrice)} | 결제 또는 구체적인 거절 이유 확보 | 건당 남는 금액이 0원 이하면 판매 확대 중단 |`,
      `| 운영 범위 | ${escapeTable(project.businessSetup?.region || "사업 지역 확인 필요")}에서 대표자가 직접 확인 | 완료 기준과 증빙 위치가 주문마다 같음 | 안전·개인정보 절차 누락 시 신규 판매 중단 |`,
    ].join("\n"),
    [
      "## 첫 21일 자원 배분",
      "",
      "| 기간 | 담당 | 사용할 자원 | 남겨야 할 완료 증거 |",
      "| --- | --- | --- | --- |",
      "| 1~5일 | 대표자 | 기존 연락처·고객 접점 | 최근 행동 중심 고객 기록 |",
      "| 6~10일 | 대표자 | 수동 제작·제공 도구 | 제공 범위·작업시간·누락 기록 |",
      "| 11~15일 | 대표자 | 가격 공개 제안서 | 제안·응답·거절·결제 기록 |",
      "| 16~21일 | 대표자 | 주문별 원가표 | 실제 원가·환불·다음 의사결정 |",
    ].join("\n"),
  ]);
}

function marketBody(project: ProjectRecord, markdown: string) {
  const content = approvedContent(project, 1);
  const customer = String(content.primaryCustomer ?? project.opportunity.customer ?? "목표 고객 확인 필요");
  const jobs = strings(content.jobs);
  const pains = strings(content.pains);
  const alternatives = strings(content.currentAlternatives);
  const evidence = project.marketWorkspace?.evidence ?? [];
  return append(markdown, [
    [
      "## 고객 문제 판정표",
      "",
      "| 구분 | 현재 작성 결론 | 사실 상태 | 사업에 반영한 결정 |",
      "| --- | --- | --- | --- |",
      `| 목표 고객 | ${escapeTable(customer)} | 사용자 입력 | 이 고객에게만 첫 제안을 보냄 |`,
      `| 해결하려는 일 | ${escapeTable(jobs[0] ?? project.opportunity.oneLiner)} | 검증할 가정 | 최근 행동과 실제 지출을 질문 |`,
      `| 가장 큰 불편 | ${escapeTable(pains[0] ?? project.opportunity.risk)} | 검증할 가정 | 첫 상품의 핵심 결과로 반영 |`,
      `| 구매 조건 | 가격·범위·완료 기준을 결제 전에 확인 | 검증할 가정 | 같은 조건으로 가격 제안 기록 |`,
    ].join("\n"),
    [
      "## 현재 대안 비교표",
      "",
      "| 현재 대안 | 고객이 선택하는 이유 | 확인할 불편 | 이번 상품의 대응 |",
      "| --- | --- | --- | --- |",
      ...(alternatives.length ? alternatives : ["직접 해결", "지인·커뮤니티", "기존 전문 서비스"]).slice(0, 4).map((alternative, index) =>
        `| ${escapeTable(alternative)} | ${index === 0 ? "비용을 아끼고 바로 시작할 수 있음" : index === 1 ? "이미 아는 경로라 접근이 쉬움" : "책임과 제공 범위를 확인할 수 있음"} | 시간·가격·결과 품질을 실제 고객에게 확인 | ${index === 0 ? "완료 기준과 시간을 공개" : index === 1 ? "반복 가능한 공식 절차 제공" : "작은 범위·한 가격으로 비교"} |`),
    ].join("\n"),
    [
      "## 시장 근거 적용표",
      "",
      "| 근거 | 현재 값 | 상태 | 본문 적용 범위 |",
      "| --- | --- | --- | --- |",
      ...(evidence.length ? evidence.slice(0, 6).map((item) => `| ${escapeTable(item.title)} | ${escapeTable(`${item.value}${item.unit ? ` ${item.unit}` : ""}`)} | ${item.verification === "verified" ? "공식 원문 확인" : item.verification === "user_supplied" ? "사용자 입력" : "검증할 가정"} | ${escapeTable(item.note || "시장 판단 보조 근거")} |`) : ["| 연결된 시장 근거 없음 | 수치 확정 안 함 | 추가 확인 필요 | 고객 행동과 가격 제안만으로 초기 판단 |"]),
    ].join("\n"),
  ]);
}

function pricingBody(project: ProjectRecord, markdown: string) {
  const content = approvedContent(project, 2);
  const tiers = Array.isArray(content.tiers) ? content.tiers.map(record) : [];
  const financial = project.businessAssessment?.financial;
  return append(markdown, [
    [
      "## 판매 상품 비교표",
      "",
      "| 상품 | 판매가 | 고객이 받는 결과 | 사용 시점 |",
      "| --- | ---: | --- | --- |",
      ...tiers.slice(0, 3).map((tier, index) => `| ${escapeTable(tier.name ?? `상품 ${index + 1}`)} | ${won(typeof tier.priceWon === "number" ? tier.priceWon : null)} | ${escapeTable(tier.outcome ?? "제공 결과 확인 필요")} | ${index === 1 ? "첫 유료 검증의 기준 상품" : index === 0 ? "작은 범위로 먼저 확인" : "반복 구매 뒤 제안"} |`),
    ].join("\n"),
    [
      "## 건당 손익 계산표",
      "",
      "| 항목 | 금액 | 산식 | 상태 |",
      "| --- | ---: | --- | --- |",
      `| 고객 판매가 | ${won(financial?.grossPrice)} | 저장된 기준 상품 가격 | ${financial ? "자동 계산" : "추가 확인"} |`,
      `| 부가세 제외 매출 | ${won(financial?.netPrice)} | 판매가 ÷ 세금계수 | ${financial ? "자동 계산" : "추가 확인"} |`,
      `| 건당 변동 원가 | ${won(financial?.variableCostPerUnit)} | 재료·수수료·외주·작업비 합계 | ${financial ? "자동 계산" : "추가 확인"} |`,
      `| 건당 남는 금액 | ${won(financial?.contributionPerUnit)} | 순매출 - 변동 원가 | ${financial ? "자동 계산" : "추가 확인"} |`,
      `| 월 손익분기점 | ${financial?.breakEvenUnits === null || financial?.breakEvenUnits === undefined ? "추가 확인" : `${Math.ceil(financial.breakEvenUnits)}건`} | 월 고정비 ÷ 건당 남는 금액 | ${financial ? "자동 계산" : "추가 확인"} |`,
    ].join("\n"),
    [
      "## 월 판매 시나리오",
      "",
      "| 시나리오 | 월 판매 | 순매출 | 변동비 | 세전 영업손익 |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...(financial?.scenarios.length ? financial.scenarios.map((scenario) => `| ${scenario.name} | ${scenario.monthlyUnits.toLocaleString("ko-KR")}건 | ${won(scenario.netRevenue)} | ${won(scenario.variableCosts)} | ${won(scenario.operatingProfitBeforeTax)} |`) : ["| 입력 필요 | - | - | - | 가격·원가 입력 후 자동 계산 |"]),
    ].join("\n"),
    [
      "## 준비자금 구성",
      "",
      "| 구분 | 금액 | 사용 원칙 |",
      "| --- | ---: | --- |",
      `| 초기 준비비 | ${won(financial?.initialInvestment)} | 영업 시작 전에 한 번 지출하는 비용 |`,
      `| 권장 운전자금 | ${won(financial?.recommendedWorkingCapital)} | 매출이 안정되기 전 고정비와 변동비 |`,
      `| 총 필요자금 | ${won(financial?.totalFundingNeed)} | 초기 준비비 + 권장 운전자금 |`,
    ].join("\n"),
  ]);
}

function brandBody(project: ProjectRecord, markdown: string) {
  const content = approvedContent(project, 3);
  const names = strings(content.nameCandidates);
  const slogans = strings(content.slogans);
  return append(markdown, [
    [
      "## 이름 후보 비교표",
      "",
      "| 후보 | 이해하기 쉬움 | 기억·발음 | 확장성 | 현재 판정 |",
      "| --- | --- | --- | --- | --- |",
      ...(names.length ? names : [project.opportunity.title]).slice(0, 5).map((name, index) => `| ${escapeTable(name)} | ${index === 0 ? "높음" : "확인 필요"} | 5명에게 받아쓰기 확인 | 첫 상품 밖에서도 사용 가능한지 확인 | ${index === 0 ? "우선 후보" : "보조 후보"} |`),
    ].join("\n"),
    [
      "## 채널별 확정 문구",
      "",
      "| 사용 위치 | 고객에게 보여줄 문구 | 사용 기준 |",
      "| --- | --- | --- |",
      `| 홈페이지 첫 화면 | ${escapeTable(slogans[0] ?? project.opportunity.oneLiner)} | 고객과 결과를 한 번에 설명 |`,
      `| 소개 메시지 | ${escapeTable(content.promise ?? project.opportunity.oneLiner)} | 확인되지 않은 성과 표현 제외 |`,
      `| 제안서 표지 | ${escapeTable(names[0] ?? project.opportunity.title)} · ${escapeTable(slogans[1] ?? slogans[0] ?? project.opportunity.oneLiner)} | 이름과 상품 범위를 함께 표기 |`,
      `| 검색·사회관계망 소개 | ${escapeTable(slogans[2] ?? slogans[0] ?? project.opportunity.oneLiner)} | 상표·계정 확인 뒤 사용 |`,
    ].join("\n"),
  ]);
}

function landingBody(project: ProjectRecord, markdown: string) {
  const financial = project.businessAssessment?.financial;
  return append(markdown, [[
    "## 공개할 거래 조건 요약",
    "",
    "| 고객이 확인할 항목 | 현재 원고 | 공개 전 상태 |",
    "| --- | --- | --- |",
    `| 고객과 결과 | ${escapeTable(project.opportunity.customer)}에게 ${escapeTable(project.opportunity.oneLiner)} | 원고 반영 |`,
    `| 기준 가격 | ${won(financial?.grossPrice)} | 결제 연결 전 최종 확인 |`,
    "| 포함·제외 범위 | 판매 페이지 상품 영역에 각각 공개 | 원고 반영 |",
    "| 신청 방법 | 실제 저장되는 신청폼 또는 연락 수단 | 연결 시험 필요 |",
    "| 취소·환불 | 결제 전 확인 가능한 위치에 공개 | 판매자 기준 입력 필요 |",
    "| 개인정보 | 목적·항목·보유기간·삭제·문의처 공개 | 실제 운영 정보 입력 필요 |",
  ].join("\n")]);
}

function launchBody(project: ProjectRecord, markdown: string) {
  const financial = project.businessAssessment?.financial;
  return append(markdown, [
    [
      "## 주차별 담당과 결과",
      "",
      "| 기간 | 담당 | 한 가지 결과 | 완료 증거 |",
      "| --- | --- | --- | --- |",
      "| 1주차 | 대표자 | 최근 행동이 있는 고객 문제 확정 | 고객 원문과 현재 대안 기록 |",
      "| 2주차 | 대표자 | 같은 범위의 수동 제공 완료 | 작업시간·누락·수정 기록 |",
      "| 3주차 | 대표자 | 한 상품·한 가격 유료 제안 | 제안·응답·결제·거절 기록 |",
      "| 4주차 | 대표자 | 실제 원가와 다음 결정 확정 | 주문별 손익과 계속·수정·중단 판정 |",
    ].join("\n"),
    [
      "## 주간 숫자판",
      "",
      "| 지표 | 1주차 | 2주차 | 3주차 | 4주차 판정 |",
      "| --- | ---: | ---: | ---: | --- |",
      "| 고객 접촉 | 10명 | 5명 | 10명 | 실제 접촉 수 기록 |",
      "| 고객 대화 | 5건 | 2건 | 2건 | 최근 행동 근거 확인 |",
      "| 가격 공개 제안 | 0건 | 0건 | 10건 | 결제·거절 이유 구분 |",
      "| 유료 주문 | 0건 | 시험 제공 | 1건 이상 | 누적 3건을 목표로 판정 |",
    ].join("\n"),
    [
      "## 지출 상한표",
      "",
      "| 지출 | 30일 상한 | 집행 조건 | 담당 |",
      "| --- | ---: | --- | --- |",
      `| 고객 검증 | ${won(Math.min(300_000, financial?.totalFundingNeed ?? 300_000))} | 같은 제안으로 반응을 비교할 수 있을 때 | 대표자 |`,
      "| 광고 | 200,000원 이하 | 첫 유료 구매와 건당 원가 확인 뒤 | 대표자 |",
      "| 도구·외주 | 300,000원 이하 | 수동 제공에서 반복 업무가 확인된 뒤 | 대표자 |",
      "| 장기 계약 | 0원 | 첫 30일에는 임대·채용 장기계약 제외 | 대표자 |",
    ].join("\n"),
    [
      "## 계속·수정·중단 판정",
      "",
      "| 판정 | 적용 조건 | 다음 행동 |",
      "| --- | --- | --- |",
      "| 계속 | 실제 결제와 양의 건당 이익을 함께 확인 | 같은 고객·가격으로 소규모 반복 |",
      "| 수정 | 문제는 반복되지만 결제 또는 원가가 기준 미달 | 고객·범위·가격 중 한 가지만 변경 |",
      "| 중단 | 안전·법적 위험을 통제할 수 없거나 반복 구매 이유가 없음 | 신규 판매와 광고를 중단하고 사업 가설 재선정 |",
    ].join("\n"),
  ]);
}

function planBody(project: ProjectRecord, markdown: string) {
  const evidence = project.marketWorkspace?.evidence ?? [];
  if (markdown.includes("## 제출 본문에 연결한 출처")) return markdown;
  return append(markdown, [[
    "## 제출 본문에 연결한 출처",
    "",
    "> 아래 출처는 제출용 본문의 시장·고객 판단과 연결됩니다. 원문 확인 표시가 없는 내용은 확정 수치로 사용하지 않습니다.",
    "",
    "| 근거 | 자료·기관 | 기준일 | 상태 | 본문 적용 내용 |",
    "| --- | --- | --- | --- | --- |",
    ...(evidence.length ? evidence.slice(0, 8).map((item, index) => `| E${String(index + 1).padStart(2, "0")} | ${escapeTable(`${item.title} · ${item.sourceName}`)} | ${escapeTable(item.observedAt || "확인 전")} | ${item.verification === "verified" ? "공식 원문 확인" : item.verification === "user_supplied" ? "사용자 입력" : "검증할 가정"} | ${escapeTable(item.note || `${item.metric}: ${item.value}`)} |`) : ["| E00 | 연결된 자료 없음 | 확인 전 | 추가 확인 필요 | 외부 시장 수치를 확정하지 않음 |"]),
  ].join("\n")]);
}

function operationsBody(project: ProjectRecord, markdown: string) {
  return append(markdown, [
    [
      "## 영업 시작 판정표",
      "",
      "| 판정 영역 | 현재 상태 | 영업 시작 기준 | 미충족 시 처리 |",
      "| --- | --- | --- | --- |",
      `| 사업자·사업장 | ${project.businessAssessment?.hardBlockCount ? `필수 확인 ${project.businessAssessment.hardBlockCount}건` : "저장된 조건 기준 검토"} | 실제 업종·주소·제공 방식이 등록 내용과 일치 | 유료 결제와 광고 중단 |`,
      `| 거래 조건 | 가격·범위·취소·환불 원고 생성 | 고객이 결제 전에 같은 내용을 확인 | 신청·결제 연결 보류 |`,
      `| 개인정보 | ${project.businessSetup?.handlesPersonalData ? "개인정보 처리 필요" : "기본 수집 최소화"} | 목적·항목·보유기간·삭제·문의처 공개 | 민감정보 수집 중단 |`,
      "| 제공 품질 | 업무 절차와 완료 증거 생성 | 시험 주문에서 누락 없이 재현 | 범위를 줄여 재시험 |",
      "| 사고 대응 | 사고 등급·연락·기록 절차 생성 | 담당자와 비상 연락 순서 예행연습 | 신규 판매 중단 |",
    ].join("\n"),
    [
      "## 취소·환불 판정표",
      "",
      "| 상황 | 고객 안내 | 내부 처리 | 증빙 |",
      "| --- | --- | --- | --- |",
      "| 제공 시작 전 취소 | 공제 여부와 금액을 즉시 안내 | 실제 발생 비용만 기준에 따라 계산 | 취소 시각·안내문·환불내역 |",
      "| 제공 범위 변경 | 추가 금액과 일정에 다시 동의 | 기존 주문과 추가 주문을 분리 | 변경 동의 기록 |",
      "| 결과 누락·오류 | 사실 확인 시점과 재처리 일정을 안내 | 원인·책임·재발 방지 기록 | 원본·수정본·연락 기록 |",
      "| 안전·법적 위험 | 신규 제공을 중단하고 공식 대응 경로 안내 | 관리자와 관계 기관 확인 | 사고·중단·보고 기록 |",
    ].join("\n"),
    [
      "## 개인정보 처리 기준",
      "",
      "| 처리 단계 | 최소 정보 | 접근 담당 | 삭제·보관 기준 |",
      "| --- | --- | --- | --- |",
      `| 문의 | 이름 또는 닉네임·연락 수단·요청 요약 | 대표자 | 응대 목적 종료 뒤 고지 기간에 따라 삭제 |`,
      `| 계약·결제 | 거래와 세무 처리에 필요한 정보 | 대표자·결제 제공자 | 법정 보관 의무와 고지 기간 적용 |`,
      `| 서비스 제공 | ${project.businessSetup?.handlesPersonalData ? "제공에 꼭 필요한 정보만 별도 동의 후 처리" : "민감정보를 기본 수집하지 않음"} | 지정 담당자 | 제공 종료 뒤 접근 차단 및 삭제 기록 |`,
      "| 사고 대응 | 사실 확인에 필요한 최소 기록 | 대표자·지정 대응자 | 분쟁·법적 보존 필요성을 확인해 분리 보관 |",
    ].join("\n"),
  ]);
}

function executionBody(project: ProjectRecord, markdown: string) {
  const analysis = project.executionAnalysis;
  if (!analysis) return markdown;
  return append(markdown, [
    [
      "## 실제 구매 흐름",
      "",
      "| 단계 | 실제 수 | 전환율 | 현재 판정 |",
      "| --- | ---: | ---: | --- |",
      `| 노출 | ${analysis.totals.impressions.toLocaleString("ko-KR")} | - | 연결된 실행 원본 기준 |`,
      `| 방문 | ${analysis.totals.landingVisitors.toLocaleString("ko-KR")} | ${percent(analysis.funnel.clickThroughRate)} | 노출·클릭 정의 확인 |`,
      `| 문의 | ${analysis.totals.inquiries.toLocaleString("ko-KR")} | ${percent(analysis.funnel.visitorToInquiryRate)} | 문의 품질과 응답시간 확인 |`,
      `| 제안 | ${analysis.totals.proposals.toLocaleString("ko-KR")} | ${percent(analysis.funnel.inquiryToProposalRate)} | 같은 가격·범위 여부 확인 |`,
      `| 구매 | ${analysis.totals.purchases.toLocaleString("ko-KR")} | ${percent(analysis.funnel.proposalToPurchaseRate)} | 결제 증빙 연결 시 신뢰도 상승 |`,
    ].join("\n"),
    [
      "## 실제 원가와 손익",
      "",
      "| 항목 | 관찰값 | 해석 |",
      "| --- | ---: | --- |",
      `| 환불 제외 매출 | ${won(analysis.calibratedFinancials.netRevenue)} | 실행 기록에서 계산 |`,
      `| 실제 평균 판매가 | ${won(analysis.calibratedFinancials.observedAveragePrice)} | 구매가 없으면 계산하지 않음 |`,
      `| 구매 1건당 변동 원가 | ${won(analysis.calibratedFinancials.observedVariableCostPerPurchase)} | 재료·수수료·외주비 포함 |`,
      `| 고객 1명 확보비용 | ${won(analysis.calibratedFinancials.customerAcquisitionCost)} | 광고·홍보비 ÷ 구매 수 |`,
      `| 실제 건당 남는 금액 | ${won(analysis.calibratedFinancials.observedContributionPerPurchase)} | 평균 판매가 - 변동 원가 - 확보비용 |`,
    ].join("\n"),
    [
      "## 가설 판정과 다음 행동",
      "",
      "| 가설 종류 | 판정 | 신뢰도 | 다음 행동 |",
      "| --- | --- | ---: | --- |",
      ...analysis.verdicts.map((item) => `| ${escapeTable(item.category)} | ${escapeTable(item.verdict)} | ${percent(item.confidence)} | ${escapeTable(item.nextAction)} |`),
    ].join("\n"),
    [
      "## 최종 판정 요약",
      "",
      `현재 실행자료 신뢰도는 ${Math.round(analysis.confidenceScore)}%입니다. 이 값은 계획의 완성도를 뜻하지 않고, 실제 실행 원본과 결제·환불·원가 자료가 얼마나 연결되었는지를 나타냅니다. 구매 수가 없거나 완료한 실행에 원본 증빙이 없으면 시장성과 수익성을 확정하지 않습니다.`,
      "",
      `현재 가장 성과가 확인된 고객 경로는 ${analysis.bestChannel ? `${analysis.bestChannel.channel}이며 구매 ${analysis.bestChannel.purchases.toLocaleString("ko-KR")}건, 매출 ${won(analysis.bestChannel.revenue)}` : "아직 판정할 자료가 없습니다"}. 채널을 확대하기 전 같은 고객, 가격과 제공 범위에서 다시 실행해 전환율과 고객 한 명 확보비용이 유지되는지 확인합니다.`,
      "",
      analysis.recommendedActions.length
        ? `다음 실행은 ${analysis.recommendedActions.slice(0, 3).join(" ")} 순서로 진행합니다. 한 번에 여러 조건을 바꾸지 않고 가장 큰 이탈 원인 한 가지만 수정해 전후 결과를 비교합니다.`
        : "다음 실행에서는 고객 접촉, 문의, 제안, 구매와 환불을 같은 기간과 정의로 기록합니다. 실제 원가에는 광고비뿐 아니라 외주비, 수수료, 재작업과 대표자 작업시간을 빠뜨리지 않습니다.",
      "",
      "구매가 발생해도 실제 건당 남는 금액이 0원 이하이면 판매를 늘리지 않습니다. 반대로 구매와 양의 공헌이익이 함께 확인되면 같은 고객 경로에서 소액으로 반복하고, 재구매와 추천이 이어질 때만 자동화·채용·광고 예산을 확대합니다.",
    ].join("\n"),
  ]);
}

export function enrichDeliveryMainBody(project: ProjectRecord, documentId: string, markdown: string) {
  if (documentId === "brief") return briefBody(project, markdown);
  if (documentId === "market") return marketBody(project, markdown);
  if (documentId === "pricing") return pricingBody(project, markdown);
  if (documentId === "brand") return brandBody(project, markdown);
  if (documentId === "landing") return landingBody(project, markdown);
  if (documentId === "launch") return launchBody(project, markdown);
  if (documentId === "plan") return planBody(project, markdown);
  if (documentId === "operations") return operationsBody(project, markdown);
  if (documentId === "execution") return executionBody(project, markdown);
  return markdown;
}
