import { z } from "zod";

export const businessArchetypes = [
  "digital_service",
  "ecommerce",
  "local_retail",
  "professional_service",
  "manufacturing",
  "regulated",
] as const;

export type BusinessArchetype = (typeof businessArchetypes)[number];

export const archetypeLabels: Record<BusinessArchetype, string> = {
  digital_service: "온라인 서비스·소프트웨어",
  ecommerce: "온라인 판매",
  local_retail: "오프라인 매장·소매",
  professional_service: "전문·방문 서비스",
  manufacturing: "제조·제품",
  regulated: "인허가·자격 확인 업종",
};

export const workplaceTypes = [
  "home",
  "soho",
  "shared_office",
  "commercial_lease",
  "factory",
] as const;

export type WorkplaceType = (typeof workplaceTypes)[number];

export const workplaceLabels: Record<WorkplaceType, string> = {
  home: "자택",
  soho: "소호·비상주 오피스",
  shared_office: "공유오피스",
  commercial_lease: "상가·일반 사무실 임차",
  factory: "공장·작업장",
};

export const legalForms = ["undecided", "sole_proprietor", "corporation"] as const;
export type LegalForm = (typeof legalForms)[number];

export const legalFormLabels: Record<LegalForm, string> = {
  undecided: "아직 결정하지 않음",
  sole_proprietor: "개인사업자",
  corporation: "법인사업자",
};

const won = z.number().finite().min(0).max(100_000_000_000);
const rate = z.number().finite().min(0).max(100);

export const initialCostSchema = z.object({
  deposit: won,
  keyMoney: won,
  brokerage: won,
  interior: won,
  equipment: won,
  initialInventory: won,
  licensesAndRegistration: won,
  launchMarketing: won,
  contingency: won,
  other: won,
});

export const monthlyFixedCostSchema = z.object({
  rent: won,
  maintenance: won,
  payrollGross: won,
  employerInsuranceRate: rate,
  accounting: won,
  software: won,
  utilitiesAndTelecom: won,
  businessInsurance: won,
  fixedMarketing: won,
  loanInterest: won,
  depreciation: won,
  other: won,
});

export const unitVariableCostSchema = z.object({
  materialsOrPurchase: won,
  packaging: won,
  shipping: won,
  laborPerUnit: won,
  pgFeeRate: rate,
  platformFeeRate: rate,
  returnAndWasteRate: rate,
  otherPerUnit: won,
});

export const financialInputSchema = z.object({
  sellingPrice: won.min(1),
  priceIncludesVat: z.boolean(),
  vatTaxable: z.boolean(),
  targetMonthlyUnits: z.number().int().min(0).max(10_000_000),
  availableCash: won,
  workingCapitalMonths: z.number().min(0).max(24),
  initial: initialCostSchema,
  monthlyFixed: monthlyFixedCostSchema,
  unitVariable: unitVariableCostSchema,
});

export const businessSetupSchema = z.object({
  archetype: z.enum(businessArchetypes),
  legalForm: z.enum(legalForms),
  workplaceType: z.enum(workplaceTypes),
  region: z.string().trim().min(2).max(100),
  detailedLocation: z.string().trim().max(300).default(""),
  employeeCount: z.number().int().min(0).max(10_000),
  onlineSales: z.boolean(),
  handlesPersonalData: z.boolean(),
  importsOrExports: z.boolean(),
  sectorKeywords: z.array(z.string().trim().min(1).max(50)).max(30),
  financial: financialInputSchema,
});

export type BusinessSetup = z.infer<typeof businessSetupSchema>;
export type FinancialInput = z.infer<typeof financialInputSchema>;

export type FinancialScenario = {
  name: "보수적" | "기준" | "공격적";
  volumeFactor: number;
  monthlyUnits: number;
  netRevenue: number;
  variableCosts: number;
  contribution: number;
  operatingProfitBeforeTax: number;
};

export type FinancialAnalysis = {
  grossPrice: number;
  netPrice: number;
  vatPerUnit: number;
  variableCostPerUnit: number;
  contributionPerUnit: number;
  contributionMarginRate: number;
  monthlyFixedCost: number;
  breakEvenUnits: number | null;
  breakEvenRevenue: number | null;
  initialInvestment: number;
  recommendedWorkingCapital: number;
  totalFundingNeed: number;
  targetMonthlyOperatingProfit: number;
  runwayMonths: number | null;
  scenarios: FinancialScenario[];
  warnings: string[];
  assumptions: string[];
};

export type ComplianceRequirement = {
  id: string;
  category: "registration" | "tax" | "location" | "permit" | "privacy" | "labor" | "commerce" | "operations";
  severity: "required" | "verify" | "blocked";
  title: string;
  reason: string;
  actions: string[];
  authority: string;
  sourceUrl: string;
};

export type BusinessAssessment = {
  archetype: BusinessArchetype;
  financial: FinancialAnalysis;
  requirements: ComplianceRequirement[];
  hardBlockCount: number;
  requiredCount: number;
  generatedAt: string;
  rulesVersion: string;
};

export function emptyBusinessSetup(archetype: BusinessArchetype): BusinessSetup {
  return {
    archetype,
    legalForm: "undecided",
    workplaceType: archetype === "local_retail" ? "commercial_lease" : archetype === "manufacturing" ? "factory" : "home",
    region: "서울특별시",
    detailedLocation: "",
    employeeCount: 0,
    onlineSales: archetype === "ecommerce",
    handlesPersonalData: ["digital_service", "ecommerce"].includes(archetype),
    importsOrExports: false,
    sectorKeywords: [],
    financial: {
      sellingPrice: archetype === "ecommerce" ? 39000 : 290000,
      priceIncludesVat: true,
      vatTaxable: true,
      targetMonthlyUnits: archetype === "ecommerce" ? 100 : 10,
      availableCash: 10_000_000,
      workingCapitalMonths: 3,
      initial: {
        deposit: 0,
        keyMoney: 0,
        brokerage: 0,
        interior: 0,
        equipment: 1_000_000,
        initialInventory: archetype === "ecommerce" ? 3_000_000 : 0,
        licensesAndRegistration: 200_000,
        launchMarketing: 1_000_000,
        contingency: 1_000_000,
        other: 0,
      },
      monthlyFixed: {
        rent: 0,
        maintenance: 0,
        payrollGross: 0,
        employerInsuranceRate: 11,
        accounting: 100_000,
        software: 150_000,
        utilitiesAndTelecom: 100_000,
        businessInsurance: 0,
        fixedMarketing: 500_000,
        loanInterest: 0,
        depreciation: 0,
        other: 0,
      },
      unitVariable: {
        materialsOrPurchase: archetype === "ecommerce" ? 15_000 : 0,
        packaging: archetype === "ecommerce" ? 1_000 : 0,
        shipping: archetype === "ecommerce" ? 3_500 : 0,
        laborPerUnit: 0,
        pgFeeRate: 3.3,
        platformFeeRate: 0,
        returnAndWasteRate: archetype === "ecommerce" ? 5 : 0,
        otherPerUnit: 0,
      },
    },
  };
}
