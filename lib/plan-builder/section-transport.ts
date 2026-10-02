import type { IntakeJobRequest } from "./intake-types";
import type { CoachJobRequest } from "./coach-job-types";
import type { DeckJobRequest } from "./deck-job-types";
import type { ProposalBackgroundJob } from "./proposal-background";
import type { ArtifactJobRequest } from "./artifact-updates";
import { PLAN_SECTION_INTERNAL_PATH as internalPath, type PlanSectionJob, type PlanOutlineJob } from "./section-protocol";
import { signBody } from "./section-signature";
export type { PlanSectionJob, PlanOutlineJob } from "./section-protocol";
type ServiceRequest = { operation: "intake"; job: IntakeJobRequest } | { operation: "generateSection"; job: PlanSectionJob } | { operation: "planOutline"; job: PlanOutlineJob } | { operation: "completeCoach"; job: CoachJobRequest } | { operation: "completeDeck"; job: DeckJobRequest } | { operation: "completeProposalUpdate"; job: ProposalBackgroundJob } | { operation: "artifactChunk"; job: ArtifactJobRequest & { index: number } };

export async function callPlanSectionService(service: Fetcher, secret: string, job: PlanSectionJob): Promise<{ ok: boolean }> {
  return callPlanningService(service, secret, { operation: "generateSection", job });
}

export async function callPlanOutlineService(service: Fetcher, secret: string, job: PlanOutlineJob): Promise<{ ok: boolean; outline?: string }> {
  return callPlanningService(service, secret, { operation: "planOutline", job });
}

export async function callCoachService(service: Fetcher, secret: string, job: CoachJobRequest): Promise<{ ok: boolean }> {
  return callPlanningService(service, secret, { operation: "completeCoach", job });
}
export async function callIntakeService(service: Fetcher, secret: string, job: IntakeJobRequest): Promise<{ ok: boolean }> {
  return callPlanningService(service, secret, { operation: "intake", job });
}
export async function callDeckService(service: Fetcher, secret: string, job: DeckJobRequest): Promise<{ ok: boolean }> {
  return callPlanningService(service, secret, { operation: "completeDeck", job });
}
export async function callProposalUpdateService(service: Fetcher, secret: string, job: ProposalBackgroundJob): Promise<{ ok: boolean }> {
  return callPlanningService(service, secret, { operation: "completeProposalUpdate", job });
}
export async function callArtifactChunkService(service: Fetcher, secret: string, job: ArtifactJobRequest & { index: number }): Promise<{ ok: boolean; done?: boolean }> {
  return callPlanningService(service, secret, { operation: "artifactChunk", job });
}

async function callPlanningService(service: Fetcher, secret: string, input: ServiceRequest): Promise<{ ok: boolean }> {
  const body = JSON.stringify(input);
  const timestamp = Date.now().toString();
  const signature = await signBody(secret, timestamp, body);
  const response = await service.fetch(`https://plan-section.internal${internalPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-plan-timestamp": timestamp,
      "x-plan-signature": signature,
    },
    body,
  });
  const payload = (await response.json()) as { result?: { ok: boolean }; error?: string };
  if (!response.ok) throw new Error(payload.error || "PLAN_SECTION_SERVICE_FAILED");
  return payload.result ?? { ok: false };
}

/**
 * 한 섹션을 만들어 저장한다.
 *
 * 이미 만들어져 있거나 사용자가 직접 고친 섹션은 건드리지 않는다 —
 * 뒤늦게 도착한 생성이 사람이 쓴 글을 덮으면 안 된다.
 */
