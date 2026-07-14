import {
  emptyBusinessSetup,
  needsPhysicalLocationAnalysis,
  type BusinessArchetype,
  type BusinessSetup,
  type WorkplaceType,
} from "./domain";

export const setupQuestionLabels: Record<string, string> = {
  archetype: "사업 유형",
  legalForm: "사업자 형태",
  workplaceType: "사업장 방식",
  region: "사업 지역",
  employeeCount: "직원 수",
  deposit: "임대 보증금",
  interior: "내부 공사비",
  equipment: "새 장비 구입비",
  initialInventory: "처음 준비할 재고",
  licensesAndRegistration: "인허가·등록 준비비",
  launchMarketing: "출시 전 홍보비",
  rent: "월 사무실·임대료",
  maintenance: "월 관리비",
  payrollGross: "월 직원 급여",
  accounting: "월 세무·회계비",
  software: "월 소프트웨어·서버비",
  utilitiesAndTelecom: "월 전기·통신비",
  fixedMarketing: "월 홍보비",
  sellingPrice: "고객 판매가",
  targetMonthlyUnits: "월 목표 고객 수",
  materialsOrPurchase: "건당 상품·재료비",
  packaging: "건당 포장비",
  shipping: "건당 배송비",
  laborPerUnit: "고객 한 명당 외주·작업비",
};

export function setupQuestionIds(setup: BusinessSetup) {
  const physical = needsPhysicalLocationAnalysis(setup.archetype);
  const ecommerce = setup.archetype === "ecommerce";
  const manufacturing = setup.archetype === "manufacturing";
  const rented = setup.workplaceType !== "home";
  const questions = ["archetype", "legalForm", "workplaceType", "region", "employeeCount"];

  if (rented) questions.push("deposit", "rent");
  if (physical) questions.push("interior", "equipment", "maintenance");
  if (ecommerce || manufacturing) questions.push("initialInventory");
  if (setup.archetype === "regulated" || manufacturing) questions.push("licensesAndRegistration");
  questions.push("launchMarketing");
  if (setup.employeeCount > 0) questions.push("payrollGross");
  questions.push("accounting");
  if (["digital_service", "ecommerce", "professional_service"].includes(setup.archetype)) questions.push("software");
  if (physical) questions.push("utilitiesAndTelecom");
  questions.push("fixedMarketing", "sellingPrice", "targetMonthlyUnits");
  if (ecommerce || manufacturing) questions.push("materialsOrPurchase", "packaging", "shipping");
  if (["digital_service", "professional_service"].includes(setup.archetype)) questions.push("laborPerUnit");
  return questions;
}

export function recommendedSetupValue(setup: BusinessSetup, id: string): string | number {
  const archetype = setup.archetype;
  const recommendations: Record<string, string | number> = {
    archetype,
    legalForm: "undecided",
    workplaceType: archetype === "local_retail" ? "commercial_lease" : archetype === "manufacturing" ? "factory" : "home",
    region: setup.region || "지역 미정",
    employeeCount: 0,
    deposit: 0,
    interior: needsPhysicalLocationAnalysis(archetype) ? 1_000_000 : 0,
    equipment: ["local_retail", "manufacturing", "regulated"].includes(archetype) ? 1_000_000 : 0,
    initialInventory: archetype === "ecommerce" ? 1_000_000 : archetype === "manufacturing" ? 2_000_000 : 0,
    licensesAndRegistration: ["manufacturing", "regulated"].includes(archetype) ? 200_000 : 0,
    launchMarketing: archetype === "digital_service" ? 200_000 : archetype === "ecommerce" ? 300_000 : 500_000,
    rent: setup.workplaceType === "soho" ? 50_000 : setup.workplaceType === "shared_office" ? 300_000 : setup.workplaceType === "commercial_lease" ? 1_000_000 : setup.workplaceType === "factory" ? 1_500_000 : 0,
    maintenance: needsPhysicalLocationAnalysis(archetype) ? 100_000 : 0,
    payrollGross: setup.employeeCount * 2_500_000,
    accounting: 100_000,
    software: archetype === "digital_service" ? 150_000 : 50_000,
    utilitiesAndTelecom: needsPhysicalLocationAnalysis(archetype) ? 100_000 : 0,
    fixedMarketing: archetype === "digital_service" ? 200_000 : archetype === "ecommerce" ? 300_000 : 500_000,
    sellingPrice: archetype === "ecommerce" ? 39_000 : 290_000,
    targetMonthlyUnits: archetype === "ecommerce" ? 100 : 10,
    materialsOrPurchase: archetype === "ecommerce" ? 15_000 : archetype === "manufacturing" ? 30_000 : 0,
    packaging: archetype === "ecommerce" || archetype === "manufacturing" ? 1_000 : 0,
    shipping: archetype === "ecommerce" || archetype === "manufacturing" ? 3_500 : 0,
    laborPerUnit: 0,
  };
  return recommendations[id] ?? 0;
}

export function setupValue(setup: BusinessSetup, id: string): string | number {
  if (id === "archetype" || id === "legalForm" || id === "workplaceType" || id === "region" || id === "employeeCount") return setup[id];
  if (id === "sellingPrice" || id === "targetMonthlyUnits") return setup.financial[id];
  if (id in setup.financial.initial) return setup.financial.initial[id as keyof BusinessSetup["financial"]["initial"]];
  if (id in setup.financial.monthlyFixed) return setup.financial.monthlyFixed[id as keyof BusinessSetup["financial"]["monthlyFixed"]];
  return setup.financial.unitVariable[id as keyof BusinessSetup["financial"]["unitVariable"]] ?? 0;
}

export function withSetupValue(setup: BusinessSetup, id: string, value: string | number): BusinessSetup {
  if (id === "archetype") {
    const archetype = value as BusinessArchetype;
    const fresh = emptyBusinessSetup(archetype);
    return {
      ...fresh,
      legalForm: setup.legalForm,
      region: setup.region,
      sectorKeywords: setup.sectorKeywords,
      financial: { ...fresh.financial, availableCash: setup.financial.availableCash },
    };
  }
  if (id === "workplaceType") {
    const workplaceType = value as WorkplaceType;
    const next = structuredClone(setup);
    next.workplaceType = workplaceType;
    if (workplaceType === "home") {
      next.financial.initial.deposit = 0;
      next.financial.initial.keyMoney = 0;
      next.financial.initial.brokerage = 0;
      next.financial.initial.interior = 0;
      next.financial.monthlyFixed.rent = 0;
      next.financial.monthlyFixed.maintenance = 0;
    }
    return next;
  }
  const next = structuredClone(setup);
  if (id === "legalForm") next.legalForm = value as BusinessSetup["legalForm"];
  else if (id === "region") next.region = String(value).trim() || "지역 미정";
  else if (id === "employeeCount") next.employeeCount = Math.max(0, Math.round(Number(value) || 0));
  else if (id === "sellingPrice") next.financial.sellingPrice = Math.max(1, Number(value) || 1);
  else if (id === "targetMonthlyUnits") next.financial.targetMonthlyUnits = Math.max(0, Math.round(Number(value) || 0));
  else if (id in next.financial.initial) next.financial.initial[id as keyof BusinessSetup["financial"]["initial"]] = Math.max(0, Number(value) || 0);
  else if (id in next.financial.monthlyFixed) next.financial.monthlyFixed[id as keyof BusinessSetup["financial"]["monthlyFixed"]] = Math.max(0, Number(value) || 0);
  else if (id in next.financial.unitVariable) next.financial.unitVariable[id as keyof BusinessSetup["financial"]["unitVariable"]] = Math.max(0, Number(value) || 0);
  return next;
}

export function markSetupFieldUnknown(setup: BusinessSetup, id: string, unknown: boolean) {
  const current = new Set(setup.unknownFields);
  if (unknown) current.add(id);
  else current.delete(id);
  return { ...setup, unknownFields: [...current] };
}

export function normalizeLegacyDigitalSetup(setup: BusinessSetup) {
  const legacy = setup.archetype === "digital_service"
    && setup.financial.initial.equipment === 1_000_000
    && setup.financial.initial.licensesAndRegistration === 200_000
    && setup.financial.initial.launchMarketing === 1_000_000
    && setup.financial.initial.contingency === 1_000_000
    && setup.financial.monthlyFixed.utilitiesAndTelecom === 100_000
    && setup.financial.monthlyFixed.fixedMarketing === 500_000;
  if (!legacy) return { setup, adjusted: false };
  const next = structuredClone(setup);
  next.financial.initial.equipment = 0;
  next.financial.initial.licensesAndRegistration = 0;
  next.financial.initial.launchMarketing = 200_000;
  next.financial.initial.contingency = 0;
  next.financial.monthlyFixed.utilitiesAndTelecom = 0;
  next.financial.monthlyFixed.fixedMarketing = 200_000;
  next.unknownFields = [...new Set([...(next.unknownFields ?? []), "launchMarketing", "fixedMarketing"] )];
  return { setup: next, adjusted: true };
}
