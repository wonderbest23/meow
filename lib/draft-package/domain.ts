export const draftPackageStepDefinitions = [
  { key: "setup", label: "사업 기본 조건", description: "아이디어, 예산과 비용 가정을 정리해요." },
  { key: "direction", label: "사업 방향", description: "고객과 첫 검증 범위를 정해요." },
  { key: "market", label: "고객·시장 분석", description: "고객 문제와 확인할 근거를 정리해요." },
  { key: "offer", label: "상품·가격·손익", description: "상품 구성과 손익분기점을 계산해요." },
  { key: "brand", label: "이름·브랜드", description: "사업 이름과 소개 문구를 만들어요." },
  { key: "landing", label: "판매 페이지", description: "바로 수정할 수 있는 판매 원고를 만들어요." },
  { key: "launch", label: "첫 고객 실행안", description: "첫 30일 행동 순서를 정리해요." },
  { key: "business-plan", label: "사업계획서", description: "제출과 설명에 쓸 사업계획서를 만들어요." },
  { key: "operations", label: "운영 준비서", description: "신고, 비용과 운영 준비를 정리해요." },
  { key: "execution", label: "단계별 실행표", description: "오늘부터 하나씩 할 일을 정리해요." },
  { key: "grants", label: "지원사업 초안", description: "조건에 맞는 신청 준비안을 만들어요." },
] as const;

export type DraftPackageStepKey = (typeof draftPackageStepDefinitions)[number]["key"];
export type DraftPackageRunStatus = "queued" | "running" | "waiting" | "complete" | "error";
export type DraftPackageStepStatus = "waiting" | "running" | "complete" | "error";

export type DraftPackageStepState = {
  key: DraftPackageStepKey;
  label: string;
  description: string;
  status: DraftPackageStepStatus;
  startedAt: string | null;
  completedAt: string | null;
};

export type DraftPackageRun = {
  id: string;
  workflowInstanceId: string;
  mode: "initial" | "refine";
  status: DraftPackageRunStatus;
  currentStep: number;
  completedSteps: number;
  totalSteps: number;
  message: string;
  error: string;
  steps: DraftPackageStepState[];
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type DraftRefinementInput = {
  brandName: string;
  customer: string;
  oneLiner: string;
  priceWon: number;
  variableCostPerUnit: number;
  monthlyFixedCostWon: number;
  targetMonthlyUnits: number;
  region: string;
  note: string;
};

export type ProjectRefinementVersion = {
  id: string;
  version: number;
  label: string;
  input: DraftRefinementInput;
  changes: Array<{ label: string; before: string; after: string }>;
  source: "initial" | "edit" | "restore";
  runId: string;
  status: "processing" | "applied" | "failed";
  createdAt: string;
};

export type DraftPackageWorkflowParams = {
  projectId: string;
  guestTokenHash: string;
  runId: string;
  force: boolean;
  refinement?: DraftRefinementInput;
};

export function createDraftPackageRun(
  id: string,
  mode: DraftPackageRun["mode"],
  now = new Date().toISOString(),
): DraftPackageRun {
  return {
    id,
    workflowInstanceId: id,
    mode,
    status: "queued",
    currentStep: 0,
    completedSteps: 0,
    totalSteps: draftPackageStepDefinitions.length,
    message: mode === "refine" ? "바꾼 내용을 정리하고 있어요." : "제작 순서를 준비하고 있어요.",
    error: "",
    steps: draftPackageStepDefinitions.map((step) => ({
      ...step,
      status: "waiting",
      startedAt: null,
      completedAt: null,
    })),
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function startDraftPackageStep(
  run: DraftPackageRun,
  stepIndex: number,
  now = new Date().toISOString(),
): DraftPackageRun {
  const definition = draftPackageStepDefinitions[stepIndex];
  if (!definition) throw new Error("DRAFT_PACKAGE_STEP_NOT_FOUND");
  return {
    ...run,
    status: "running",
    currentStep: stepIndex,
    message: `현재 만드는 자료: ${definition.label}`,
    error: "",
    updatedAt: now,
    steps: run.steps.map((step, index) => index === stepIndex
      ? { ...step, status: "running", startedAt: step.startedAt ?? now }
      : step),
  };
}

export function waitForDraftPackageAI(
  run: DraftPackageRun,
  stepIndex: number,
  now = new Date().toISOString(),
): DraftPackageRun {
  const definition = draftPackageStepDefinitions[stepIndex];
  if (!definition) throw new Error("DRAFT_PACKAGE_STEP_NOT_FOUND");
  return {
    ...run,
    status: "waiting",
    currentStep: stepIndex,
    message: "서버가 인공지능 연결을 자동으로 다시 확인하고 있어요. 다시 누르지 않아도 제작이 이어집니다.",
    error: "",
    updatedAt: now,
    steps: run.steps.map((step, index) => index === stepIndex
      ? { ...step, status: "running", startedAt: step.startedAt ?? now }
      : step),
  };
}

export function completeDraftPackageStep(
  run: DraftPackageRun,
  stepIndex: number,
  now = new Date().toISOString(),
): DraftPackageRun {
  const steps = run.steps.map((step, index) => index === stepIndex
    ? { ...step, status: "complete" as const, startedAt: step.startedAt ?? now, completedAt: now }
    : step);
  return {
    ...run,
    status: "running",
    currentStep: Math.min(stepIndex + 1, run.totalSteps - 1),
    completedSteps: steps.filter((step) => step.status === "complete").length,
    message: `${steps[stepIndex]?.label ?? "자료"} 제작이 끝났어요.`,
    updatedAt: now,
    steps,
  };
}

export function completeDraftPackageRun(
  run: DraftPackageRun,
  now = new Date().toISOString(),
): DraftPackageRun {
  return {
    ...run,
    status: "complete",
    currentStep: Math.max(0, run.totalSteps - 1),
    completedSteps: run.totalSteps,
    message: "전체 자료가 준비되었습니다.",
    error: "",
    updatedAt: now,
    completedAt: now,
  };
}

export function failDraftPackageRun(
  run: DraftPackageRun,
  message: string,
  now = new Date().toISOString(),
): DraftPackageRun {
  return {
    ...run,
    status: "error",
    message: "제작을 이어가기 위해 확인이 필요해요.",
    error: message,
    updatedAt: now,
    steps: run.steps.map((step, index) => index === run.currentStep
      ? { ...step, status: "error" }
      : step),
  };
}

export function isDraftPackageRun(value: unknown): value is DraftPackageRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<DraftPackageRun>;
  return typeof run.id === "string"
    && typeof run.status === "string"
    && Array.isArray(run.steps)
    && typeof run.totalSteps === "number";
}
