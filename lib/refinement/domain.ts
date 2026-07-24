import type { BusinessSetup } from "../business/domain";
import type { DraftRefinementInput, ProjectRefinementVersion } from "../draft-package/domain";
import type { ProjectRecord } from "../service-domain";

export type RefinementChange = {
  key: keyof DraftRefinementInput;
  label: string;
  before: string;
  after: string;
};

const fieldLabels: Record<keyof DraftRefinementInput, string> = {
  brandName: "사업 이름",
  customer: "주요 고객",
  oneLiner: "한 줄 소개",
  priceWon: "첫 상품 가격",
  variableCostPerUnit: "한 건당 변동비",
  monthlyFixedCostWon: "월 고정비",
  targetMonthlyUnits: "월 목표 판매량",
  region: "사업 지역",
  note: "추가 요청",
};

const moneyFields = new Set<keyof DraftRefinementInput>([
  "priceWon",
  "variableCostPerUnit",
  "monthlyFixedCostWon",
]);

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function brandName(project: ProjectRecord) {
  const selectedName = project.stages[3]?.inputs.selectedName;
  if (typeof selectedName === "string" && selectedName.trim()) return selectedName.trim();
  const approvedId = project.stages[3]?.approvedArtifactId;
  const artifact = project.stages[3]?.artifacts.find((item) => item.id === approvedId);
  const recommended = artifact?.content.recommendedDirection;
  if (recommended && typeof recommended === "object") {
    const name = (recommended as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return text(project.opportunity.title, project.title);
}

export function refinementInputFromProject(project: ProjectRecord): DraftRefinementInput {
  const financial = project.businessAssessment?.financial;
  const setup = project.businessSetup;
  return {
    brandName: brandName(project),
    customer: text(project.opportunity.customer, "처음 구매할 고객"),
    oneLiner: text(project.opportunity.oneLiner, text(project.opportunity.title, project.title)),
    priceWon: finite(setup?.financial.sellingPrice ?? financial?.grossPrice, 290_000),
    variableCostPerUnit: finite(financial?.variableCostPerUnit, 0),
    monthlyFixedCostWon: finite(financial?.monthlyFixedCost, 0),
    targetMonthlyUnits: finite(setup?.financial.targetMonthlyUnits, 10),
    region: text(setup?.region, "지역 미정"),
    note: "",
  };
}

export function normalizeRefinementInput(
  project: ProjectRecord,
  input: Partial<DraftRefinementInput>,
): DraftRefinementInput {
  const current = refinementInputFromProject(project);
  return {
    brandName: text(input.brandName, current.brandName).slice(0, 100),
    customer: text(input.customer, current.customer).slice(0, 300),
    oneLiner: text(input.oneLiner, current.oneLiner).slice(0, 1_000),
    priceWon: Math.max(1_000, finite(input.priceWon, current.priceWon)),
    variableCostPerUnit: finite(input.variableCostPerUnit, current.variableCostPerUnit),
    monthlyFixedCostWon: finite(input.monthlyFixedCostWon, current.monthlyFixedCostWon),
    targetMonthlyUnits: Math.max(0, finite(input.targetMonthlyUnits, current.targetMonthlyUnits)),
    region: text(input.region, current.region).slice(0, 100),
    note: typeof input.note === "string" ? input.note.trim().slice(0, 1_000) : "",
  };
}

function displayValue(key: keyof DraftRefinementInput, value: string | number) {
  if (typeof value === "number") {
    if (moneyFields.has(key)) return `${value.toLocaleString("ko-KR")}원`;
    if (key === "targetMonthlyUnits") return `${value.toLocaleString("ko-KR")}건`;
  }
  return String(value || "입력 없음");
}

export function refinementChanges(
  before: DraftRefinementInput,
  after: DraftRefinementInput,
): RefinementChange[] {
  return (Object.keys(fieldLabels) as Array<keyof DraftRefinementInput>)
    .filter((key) => before[key] !== after[key])
    .map((key) => ({
      key,
      label: fieldLabels[key],
      before: displayValue(key, before[key]),
      after: displayValue(key, after[key]),
    }));
}

function roundCosts<T extends Record<string, number>>(value: T, factor: number): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, amount]) => [key, Math.max(0, Math.round(amount * factor))]),
  ) as T;
}

export function applyRefinementToBusinessSetup(
  setup: BusinessSetup,
  input: DraftRefinementInput,
): BusinessSetup {
  const next = structuredClone(setup);
  next.region = input.region;
  next.financial.sellingPrice = input.priceWon;
  next.financial.targetMonthlyUnits = input.targetMonthlyUnits;

  const variable = next.financial.unitVariable;
  const percentageCost = input.priceWon * (
    variable.pgFeeRate + variable.platformFeeRate + variable.returnAndWasteRate
  ) / 100;
  const direct = {
    materialsOrPurchase: variable.materialsOrPurchase,
    packaging: variable.packaging,
    shipping: variable.shipping,
    laborPerUnit: variable.laborPerUnit,
    otherPerUnit: variable.otherPerUnit,
  };
  const directTotal = Object.values(direct).reduce((total, amount) => total + amount, 0);
  const targetDirect = Math.max(0, input.variableCostPerUnit - percentageCost);
  if (directTotal > 0) {
    Object.assign(variable, roundCosts(direct, targetDirect / directTotal));
  } else {
    variable.otherPerUnit = Math.round(targetDirect);
  }

  const fixed = next.financial.monthlyFixed;
  const fixedAmounts = {
    rent: fixed.rent,
    maintenance: fixed.maintenance,
    payrollGross: fixed.payrollGross,
    accounting: fixed.accounting,
    software: fixed.software,
    utilitiesAndTelecom: fixed.utilitiesAndTelecom,
    businessInsurance: fixed.businessInsurance,
    fixedMarketing: fixed.fixedMarketing,
    loanInterest: fixed.loanInterest,
    depreciation: fixed.depreciation,
    other: fixed.other,
  };
  const currentFixedTotal = Object.values(fixedAmounts).reduce((total, amount) => total + amount, 0)
    + fixed.payrollGross * fixed.employerInsuranceRate / 100;
  if (currentFixedTotal > 0) {
    Object.assign(fixed, roundCosts(fixedAmounts, input.monthlyFixedCostWon / currentFixedTotal));
  } else {
    fixed.other = input.monthlyFixedCostWon;
  }
  return next;
}

export function appendRefinementVersion(
  history: ProjectRefinementVersion[],
  current: DraftRefinementInput,
  next: DraftRefinementInput,
  runId: string,
  source: ProjectRefinementVersion["source"],
  now = new Date().toISOString(),
) {
  const versions = [...history];
  let nextVersion = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1;
  if (versions.length === 0) {
    versions.push({
      id: crypto.randomUUID(),
      version: nextVersion,
      label: "처음 완성본",
      input: current,
      changes: [],
      source: "initial",
      runId: "",
      status: "applied",
      createdAt: now,
    });
    nextVersion += 1;
  }
  const changes = refinementChanges(current, next);
  versions.push({
    id: crypto.randomUUID(),
    version: nextVersion,
    label: source === "restore" ? `${nextVersion}판 · 이전 판 복원` : `${nextVersion}판 · 전체 수정`,
    input: next,
    changes: changes.map(({ label, before, after }) => ({ label, before, after })),
    source,
    runId,
    status: "processing",
    createdAt: now,
  });
  return versions.slice(-10);
}
