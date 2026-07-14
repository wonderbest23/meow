export type ServiceAuditAction =
  | "project.created"
  | "payment.order_created"
  | "payment.confirmed"
  | "payment.failed"
  | "stage.inputs_saved"
  | "stage.generation_started"
  | "stage.generation_succeeded"
  | "stage.generation_failed"
  | "stage.generation_retried"
  | "stage.approved"
  | "stage.revision_requested"
  | "business_setup.saved"
  | "market.saved"
  | "business_plan.generated"
  | "landing.published"
  | "operations.saved"
  | "execution_loop.saved"
  | "quality.audit_saved"
  | "grants.saved"
  | "grants.matched";

export type ServiceAuditEntry = {
  id: string;
  projectId: string;
  guestTokenHash: string;
  action: ServiceAuditAction;
  stageIndex: number | null;
  resourceType: string | null;
  resourceId: string | null;
  status: "info" | "success" | "warning" | "error";
  detail: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type GenerationJobRecord = {
  id: string;
  projectId: string;
  stageId: string;
  stageIndex: number;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  attempt: number;
  model: string | null;
  artifactId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};
