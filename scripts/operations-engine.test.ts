import assert from "node:assert/strict";
import { emptyBusinessSetup } from "../lib/business/domain";
import { assessBusinessSetup } from "../lib/business/korea-rules";
import {
  operationsWorkspaceSchema,
  type OperationsWorkspace,
} from "../lib/operations/domain";
import {
  assessOperations,
  createOperationsWorkspace,
  generateOperationsPackage,
} from "../lib/operations/engine";
import type { ProjectRecord } from "../lib/service-domain";

function projectFor(archetype: Parameters<typeof emptyBusinessSetup>[0]): ProjectRecord {
  const setup = emptyBusinessSetup(archetype);
  setup.employeeCount = archetype === "local_retail" ? 1 : 0;
  return {
    id: crypto.randomUUID(),
    title: "운영 테스트",
    status: "active",
    paymentStatus: "test_paid",
    packagePrice: 990_000,
    activeStage: 5,
    opportunity: {
      title: "운영 테스트 사업",
      oneLiner: "테스트",
      customer: "테스트 고객",
      model: "테스트 모델",
    },
    founderProfile: {},
    businessSetup: setup,
    businessAssessment: assessBusinessSetup(setup),
    marketWorkspace: null,
    marketAnalysis: null,
    businessPlan: null,
    operationsWorkspace: null,
    operationsAssessment: null,
    operationsPackage: null,
    executionWorkspace: null,
    executionAnalysis: null,
    qualityAudit: null,
    grantWorkspace: null,
    grantAnalysis: null,
    grantPackage: null,
    stages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const ecommerceProject = projectFor("ecommerce");
const ecommerce = createOperationsWorkspace(ecommerceProject);
operationsWorkspaceSchema.parse(ecommerce);
assert.ok(ecommerce.assets.some((item) => item.category === "initial_inventory"));
assert.ok(ecommerce.sops.some((item) => item.title.includes("재고")));
assert.ok(ecommerce.openingChecklist.some((item) => item.title.includes("환불")));

const retailProject = projectFor("local_retail");
const retail = createOperationsWorkspace(retailProject);
assert.ok(retail.sops.some((item) => item.title.includes("오픈·마감")));
assert.ok(retail.insurance.some((item) => item.required));
assert.equal(retail.labor.plannedWorkerCount, 1);

const initialAssessment = assessOperations(retail);
assert.ok(initialAssessment.hardBlockers.length > 0);
assert.equal(initialAssessment.verifiedRequiredCount, 0);

const invalidVerified = structuredClone(retail);
invalidVerified.openingChecklist[0].status = "verified";
invalidVerified.openingChecklist[0].evidenceUrl = "";
assert.equal(operationsWorkspaceSchema.safeParse(invalidVerified).success, false);

const evidenceUrl = "https://example.com/evidence";
const ready: OperationsWorkspace = structuredClone(retail);
ready.openingChecklist = ready.openingChecklist.map((item) => ({
  ...item,
  status: item.required ? "verified" : item.status,
  evidenceUrl: item.required ? evidenceUrl : item.evidenceUrl,
}));
ready.insurance = ready.insurance.map((item) => ({
  ...item,
  status: item.required ? "verified" : item.status,
  evidenceUrl: item.required ? evidenceUrl : item.evidenceUrl,
}));
ready.labor = {
  ...ready.labor,
  writtenContractPrepared: true,
  wageAndHoursConfirmed: true,
  insuranceReviewed: true,
  payrollProcessTested: true,
  evidenceUrl,
};
ready.supplierQuotes.push({
  id: crypto.randomUUID(),
  category: "inventory",
  supplierName: "테스트 공급처",
  itemName: "초도 재고",
  unitPrice: 10_000,
  minimumOrderQuantity: 20,
  shippingCost: 5_000,
  leadTimeDays: 3,
  sourceUrl: evidenceUrl,
  quotedAt: new Date().toISOString().slice(0, 10),
  status: "verified",
  note: "",
});
operationsWorkspaceSchema.parse(ready);
const readyAssessment = assessOperations(ready);
assert.equal(readyAssessment.hardBlockers.length, 0);
assert.equal(readyAssessment.verifiedRequiredCount, readyAssessment.requiredCount);
assert.equal(readyAssessment.verifiedQuoteCost, 205_000);

const document = generateOperationsPackage(retailProject, ready, readyAssessment);
assert.ok(document.markdown.includes("오픈 판정"));
assert.ok(document.markdown.includes("테스트 공급처"));
assert.ok(document.sections.length >= 5);

console.log(JSON.stringify({
  passed: 14,
  sample: {
    retailAssets: retail.assets.length,
    retailSops: retail.sops.length,
    initialBlockers: initialAssessment.hardBlockers.length,
    readyBlockers: readyAssessment.hardBlockers.length,
    verifiedQuoteCost: readyAssessment.verifiedQuoteCost,
  },
}, null, 2));
