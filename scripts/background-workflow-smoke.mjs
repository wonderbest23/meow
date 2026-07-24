const base = process.env.TEST_BASE_URL ?? "https://today-startup.rena35200.workers.dev";
let cookie = "";

function absorbCookies(response) {
  const values = response.headers.getSetCookie?.()
    ?? (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : []);
  for (const value of values) {
    const pair = value.split(";", 1)[0];
    const name = pair.split("=", 1)[0];
    const parts = cookie
      ? cookie.split("; ").filter((item) => !item.startsWith(`${name}=`))
      : [];
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
  return { response, body };
}

const payload = {
  opportunity: {
    id: "background-workflow-test-20260715",
    title: "동네 소상공인 예약 알림 도우미",
    oneLiner: "예약을 전화와 수기로 관리하는 1인 매장에 예약 확인과 방문 전 알림을 간단히 제공하는 월 구독 서비스입니다.",
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
    feasibility: 75,
    evidenceStatus: "hypothesis",
    evidenceSources: [],
    regulation: 25,
    skills: ["고객 인터뷰", "노코드 자동화", "문서 작성"],
    risk: "고객 연락처 처리 동의와 문자 발송 비용을 실제 운영 전에 확인해야 합니다.",
    firstTest: "1인 매장 5곳에 현재 예약 누락과 노쇼 경험을 묻고 수동 알림 서비스를 2주간 유료로 제안합니다.",
    color: "mint",
    match: 84,
    reasons: ["작게 시험할 수 있습니다.", "반복 업무를 줄이는 강점을 활용할 수 있습니다."],
    caution: "시장 규모와 지불 의사는 실제 매장 인터뷰와 유료 시험으로 검증해야 합니다.",
  },
  founderProfile: {
    topRiasec: ["C", "E", "I"],
    topFounder: ["execution", "customer", "analysis"],
    confidence: 78,
    answered: 8,
    careerSummary: "소규모 매장의 예약 문의와 고객 응대 업무를 경험했고 노코드 자동화 도구를 사용할 수 있습니다.",
  },
  paymentStatus: "test_paid",
  initialStageInputs: {
    goal: "예약 누락을 줄이는 첫 유료 시험 서비스 만들기",
    availableHoursPerWeek: 10,
    budgetWon: 1_000_000,
    mustAvoid: ["성과 보장 표현"],
    existingAssets: ["고객 인터뷰", "노코드 자동화"],
    referenceUrls: [],
    notes: "온라인 서비스라 상권이나 매장 집기 분석은 제외합니다.",
  },
};

const created = await call("/api/projects", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
const projectId = created.body.project.id;
const startedAt = Date.now();
const started = await call(`/api/projects/${projectId}/draft-package`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ force: false }),
});
console.log(JSON.stringify({
  event: "started",
  projectId,
  runId: started.body.run?.id,
  status: started.response.status,
  startMs: Date.now() - startedAt,
  url: `${base}/?release=20260715-background3&view=project&project=${projectId}`,
}));

const disconnectedSeconds = Number(process.env.DISCONNECTED_SECONDS ?? 75);
await new Promise((resolve) => setTimeout(resolve, disconnectedSeconds * 1000));
console.log(JSON.stringify({ event: "reentered", secondsWithoutStatusRequest: disconnectedSeconds }));

for (let attempt = 0; attempt < 90; attempt += 1) {
  const status = await call(`/api/projects/${projectId}/draft-package`, { cache: "no-store" });
  const run = status.body.run;
  console.log(JSON.stringify({
    event: "progress",
    seconds: Math.round((Date.now() - startedAt) / 1000),
    status: run?.status,
    completed: run?.completedSteps,
    current: run?.currentStep,
    message: run?.message,
    error: run?.error ?? "",
    workflow: status.body.workflowStatus,
    ready: status.body.packageReady,
  }));
  if (process.env.EXPECT_WAITING === "1" && run?.status === "waiting") {
    process.exit(0);
  }
  if (run?.status === "complete" || run?.status === "error") {
    if (run.status === "complete") {
      const [{ body: projectBody }, { body: landingBody }, ...jobResponses] = await Promise.all([
        call(`/api/projects/${projectId}`, { cache: "no-store" }),
        call(`/api/projects/${projectId}/landing`, { cache: "no-store" }),
        ...Array.from({ length: 6 }, (_, stageIndex) => (
          call(`/api/projects/${projectId}/stages/${stageIndex}/jobs`, { cache: "no-store" })
        )),
      ]);
      const project = projectBody.project;
      const approvedArtifacts = project.stages.map((stage) => (
        stage.artifacts.find((artifact) => artifact.id === stage.approvedArtifactId)
      ));
      const landingArtifact = approvedArtifacts[4];
      const landingHero = Array.isArray(landingArtifact?.content?.blocks)
        ? landingArtifact.content.blocks.find((block) => block?.type === "hero")
        : null;
      console.log(JSON.stringify({
        event: "verified",
        approvedStages: approvedArtifacts.filter(Boolean).length,
        models: jobResponses.map(({ body }) => body.job?.model ?? "missing"),
        region: project.businessSetup?.region,
        projectStatus: project.status,
        activeStage: project.activeStage,
        landing: {
          status: landingBody.site?.status,
          version: landingBody.site?.publishedVersion,
          slug: landingBody.site?.slug,
          headline: landingBody.site?.draft?.headline,
          matchesArtifact: Boolean(
            landingHero?.headline
            && landingBody.site?.draft?.headline === landingHero.headline,
          ),
        },
      }));
    }
    process.exit(run.status === "complete" ? 0 : 2);
  }
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}

process.exit(3);
