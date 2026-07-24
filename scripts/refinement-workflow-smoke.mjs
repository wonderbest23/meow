const base = process.env.TEST_BASE_URL ?? "https://today-startup.rena35200.workers.dev";
let cookie = "";

function absorbCookies(response) {
  const values = response.headers.getSetCookie?.()
    ?? (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : []);
  for (const value of values) {
    const pair = value.split(";", 1)[0];
    const name = pair.split("=", 1)[0];
    const parts = cookie ? cookie.split("; ").filter((item) => !item.startsWith(`${name}=`)) : [];
    parts.push(pair);
    cookie = parts.join("; ");
  }
}

async function call(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${base}${path}`, { ...options, headers });
  absorbCookies(response);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function waitForRun(projectId, label) {
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await call(`/api/projects/${projectId}/draft-package`, { cache: "no-store" });
    const run = status.run;
    console.log(JSON.stringify({
      event: label,
      seconds: Math.round((Date.now() - startedAt) / 1000),
      status: run?.status,
      completed: run?.completedSteps,
      total: run?.totalSteps,
      message: run?.message,
      error: run?.error ?? "",
    }));
    if (run?.status === "complete" && status.packageReady) return run;
    if (run?.status === "error") throw new Error(`${label}: ${run.error}`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(`${label}: timed out`);
}

const payload = {
  opportunity: {
    id: `refinement-smoke-${Date.now()}`,
    title: "소규모 매장 예약 확인 도우미",
    oneLiner: "전화와 메모로 예약을 관리하는 1인 매장이 예약 누락을 줄이도록 돕는 온라인 서비스입니다.",
    sector: "소상공인 업무지원 소프트웨어",
    model: "월 구독형 온라인 서비스",
    customer: "전화 예약이 많은 1인 미용실과 소규모 공방 운영자",
    capital: "소액",
    launchTime: "4~8주",
    revenue: "매장별 월 구독료",
    stage: "기능 검증 전 아이디어 단계",
    riasec: ["C", "E", "I"],
    founder: ["execution", "customer", "analysis"],
    market: 0,
    novelty: 0,
    feasibility: 78,
    evidenceStatus: "hypothesis",
    evidenceSources: [],
    regulation: 25,
    skills: ["고객 인터뷰", "노코드 자동화", "문서 작성"],
    risk: "고객 연락처 처리 동의와 메시지 발송 비용을 확인해야 합니다.",
    firstTest: "1인 매장 5곳에 수동 예약 알림을 2주간 유료로 제안합니다.",
    color: "mint",
    match: 84,
    reasons: ["작게 시험할 수 있습니다."],
    caution: "시장 규모와 지불 의사는 실제 매장 인터뷰로 검증해야 합니다.",
  },
  founderProfile: {
    topRiasec: ["C", "E", "I"],
    topFounder: ["execution", "customer", "analysis"],
    confidence: 78,
    answered: 8,
    careerSummary: "소규모 매장의 예약 문의 업무를 경험했고 노코드 자동화 도구를 사용할 수 있습니다.",
  },
  paymentStatus: "test_paid",
  initialStageInputs: {
    goal: "예약 누락을 줄이는 첫 유료 시험 서비스 만들기",
    availableHoursPerWeek: 10,
    budgetWon: 1_000_000,
    mustAvoid: ["성과 보장 표현"],
    existingAssets: ["고객 인터뷰", "노코드 자동화"],
    referenceUrls: [],
    notes: "온라인 서비스라 상권과 매장 집기 분석은 제외합니다.",
  },
};

const created = await call("/api/projects", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
const projectId = created.project.id;
await call(`/api/projects/${projectId}/draft-package`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ force: false }),
});
await waitForRun(projectId, "initial");

const refinement = {
  brandName: "예약한눈에",
  customer: "전화 예약을 하루 5건 이상 직접 관리하는 1인 미용실 운영자",
  oneLiner: "전화 예약을 한곳에 정리하고 방문 전 확인 메시지를 준비해 예약 누락을 줄이는 매장용 온라인 서비스입니다.",
  priceWon: 39_000,
  variableCostPerUnit: 7_500,
  monthlyFixedCostWon: 780_000,
  targetMonthlyUnits: 45,
  region: "전국·온라인",
  note: "초보 운영자도 이해하는 쉬운 한국어로 작성해주세요.",
};
await call(`/api/projects/${projectId}/draft-package`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ force: true, refinement, refinementSource: "edit" }),
});
await waitForRun(projectId, "refine");

const [{ project }, landing] = await Promise.all([
  call(`/api/projects/${projectId}`, { cache: "no-store" }),
  call(`/api/projects/${projectId}/landing`, { cache: "no-store" }),
]);
const latestVersion = project.refinementHistory?.at(-1);
const checks = {
  customer: project.opportunity.customer === refinement.customer,
  oneLiner: project.opportunity.oneLiner === refinement.oneLiner,
  price: project.businessSetup?.financial.sellingPrice === refinement.priceWon,
  targetUnits: project.businessSetup?.financial.targetMonthlyUnits === refinement.targetMonthlyUnits,
  region: project.businessSetup?.region === refinement.region,
  variableCost: Math.abs((project.businessAssessment?.financial.variableCostPerUnit ?? 0) - refinement.variableCostPerUnit) <= 5,
  monthlyFixed: Math.abs((project.businessAssessment?.financial.monthlyFixedCost ?? 0) - refinement.monthlyFixedCostWon) <= 5,
  approvedStages: project.stages.filter((stage) => stage.approvedArtifactId).length === 6,
  documents: Boolean(project.businessPlan && project.operationsPackage && project.executionAnalysis && project.grantPackage),
  history: project.refinementHistory?.length >= 2 && latestVersion?.status === "applied",
  landing: landing.site?.draft?.businessName === refinement.brandName,
};
if (Object.values(checks).some((value) => !value)) throw new Error(`refinement checks failed: ${JSON.stringify(checks)}`);
console.log(JSON.stringify({
  passed: true,
  projectId,
  checks,
  version: latestVersion,
  url: `${base}/?release=20260715-refinement-studio&view=project&project=${projectId}`,
}, null, 2));
