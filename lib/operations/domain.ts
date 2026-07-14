import { z } from "zod";

const money = z.number().finite().min(0).max(100_000_000_000);
const evidenceUrl = z.string().url().or(z.literal(""));
const status = z.enum(["not_started", "in_progress", "verified", "blocked"]);

export const supplierQuoteSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(["inventory", "equipment", "software", "facility", "professional", "logistics"]),
  supplierName: z.string().trim().min(1).max(150),
  itemName: z.string().trim().min(1).max(200),
  unitPrice: money,
  minimumOrderQuantity: z.number().int().min(1).max(10_000_000),
  shippingCost: money,
  leadTimeDays: z.number().int().min(0).max(3650),
  sourceUrl: evidenceUrl,
  quotedAt: z.string().date().or(z.literal("")),
  status,
  note: z.string().trim().max(1000),
}).superRefine((value, context) => {
  if (value.status === "verified" && (!value.sourceUrl || !value.quotedAt)) {
    context.addIssue({
      code: "custom",
      path: ["sourceUrl"],
      message: "확인 완료 견적에는 원문 인터넷 주소와 견적일이 필요합니다.",
    });
  }
});

export type SupplierQuote = z.infer<typeof supplierQuoteSchema>;

export const operationAssetSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(["initial_inventory", "equipment", "software", "safety", "office", "packaging"]),
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(10_000_000),
  estimatedUnitCost: money,
  requiredBeforeLaunch: z.boolean(),
  supplierQuoteId: z.string().uuid().nullable(),
  status,
  evidenceUrl,
  note: z.string().trim().max(1000),
}).superRefine((value, context) => {
  if (value.status === "verified" && !value.evidenceUrl && !value.supplierQuoteId) {
    context.addIssue({
      code: "custom",
      path: ["evidenceUrl"],
      message: "구매 완료에는 영수증·계약서 또는 검증된 견적 연결이 필요합니다.",
    });
  }
});

export type OperationAsset = z.infer<typeof operationAssetSchema>;

export const operationSopSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  trigger: z.string().trim().min(2).max(300),
  ownerRole: z.string().trim().min(1).max(100),
  frequency: z.string().trim().min(1).max(100),
  steps: z.array(z.string().trim().min(2).max(500)).min(2).max(30),
  failureResponse: z.string().trim().min(2).max(500),
  status,
  evidenceUrl,
}).superRefine((value, context) => {
  if (value.status === "verified" && !value.evidenceUrl) {
    context.addIssue({
      code: "custom",
      path: ["evidenceUrl"],
      message: "업무 연습 완료에는 실행 기록이나 결과물의 인터넷 주소가 필요합니다.",
    });
  }
});

export type OperationSop = z.infer<typeof operationSopSchema>;

export const openingChecklistItemSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(["registration", "permit", "location", "finance", "supplier", "safety", "labor", "customer", "privacy", "launch"]),
  title: z.string().trim().min(2).max(200),
  reason: z.string().trim().min(2).max(500),
  required: z.boolean(),
  dueDate: z.string().date().or(z.literal("")),
  status,
  evidenceUrl,
  officialUrl: evidenceUrl,
}).superRefine((value, context) => {
  if (value.required && value.status === "verified" && !value.evidenceUrl) {
    context.addIssue({
      code: "custom",
      path: ["evidenceUrl"],
      message: "필수 항목 완료에는 증빙 문서의 인터넷 주소가 필요합니다.",
    });
  }
});

export type OpeningChecklistItem = z.infer<typeof openingChecklistItemSchema>;

export const operationsWorkspaceSchema = z.object({
  supplierQuotes: z.array(supplierQuoteSchema).max(100),
  assets: z.array(operationAssetSchema).max(200),
  sops: z.array(operationSopSchema).max(100),
  openingChecklist: z.array(openingChecklistItemSchema).max(200),
  policies: z.object({
    customerSupportChannel: z.string().trim().min(2).max(200),
    responseTimeHours: z.number().int().min(1).max(720),
    refundPolicy: z.string().trim().min(10).max(3000),
    complaintEscalation: z.string().trim().min(10).max(1000),
    privacyRequestChannel: z.string().trim().min(2).max(200),
    incidentContact: z.string().trim().min(2).max(200),
  }),
  labor: z.object({
    plannedWorkerCount: z.number().int().min(0).max(100_000),
    writtenContractPrepared: z.boolean(),
    wageAndHoursConfirmed: z.boolean(),
    insuranceReviewed: z.boolean(),
    payrollProcessTested: z.boolean(),
    evidenceUrl,
  }),
  insurance: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(200),
    reason: z.string().trim().min(2).max(500),
    required: z.boolean(),
    status,
    evidenceUrl,
    officialUrl: evidenceUrl,
  })).max(30),
});

export type OperationsWorkspace = z.infer<typeof operationsWorkspaceSchema>;

export type OperationsAssessment = {
  readinessScore: number;
  verifiedRequiredCount: number;
  requiredCount: number;
  hardBlockers: Array<{ id: string; title: string; reason: string }>;
  warnings: string[];
  estimatedProcurementCost: number;
  verifiedQuoteCost: number;
  generatedAt: string;
  rulesVersion: string;
};

export type OperationsPackage = {
  title: string;
  generatedAt: string;
  readinessScore: number;
  sections: Array<{ title: string; items: string[] }>;
  markdown: string;
};
