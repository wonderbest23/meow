import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { callPlanSectionService, callPlanOutlineService, callCoachService, callDeckService, callProposalUpdateService, callArtifactChunkService, callIntakeService, type PlanSectionJob } from "./section-transport";
import type { IntakeJobRequest } from "./intake-types";
import { ARTIFACT_MAX_CHUNKS, type ArtifactJobRequest } from "./artifact-updates";
import type { ProposalBackgroundJob } from "./proposal-background";
import type { CoachJobRequest } from "./coach-job-types";
import type { DeckJobRequest } from "./deck-job-types";
import { SECTION_CONCURRENCY, sectionWaves } from "./section-waves";

/*
 * 본문 생성을 브라우저 밖에서 끝까지 돌리는 워크플로.
 *
 * 예전에는 생성이 브라우저 메모리 큐에 있어서 창을 닫으면 대기 중이던
 * 섹션이 사라졌다. 이제 '다음 단계'를 누르면 서버가 이어서 만든다 —
 * 사용자가 창을 닫아도, 휴대폰을 꺼도 계속된다.
 *
 * 먼저 문서 설계도(섹션별로 맡을 범위)를 만들고, 섹션은 최대 SECTION_CONCURRENCY개씩 동시에 만든다.
 * 예전엔 앞 섹션 본문을 뒤 섹션이 참고하느라 하나씩 만들어 한 부에 약 20분 걸렸다(운영 2026-09-29~30).
 * 전체를 정리하는 요약(summary/executive)은 다른 섹션이 끝난 뒤 마지막에 만든다.
 * 설계도를 못 만들면 예전처럼 하나씩 차례로 만든다.
 */


export type PlanSectionsWorkflowParams = ArtifactJobRequest | ProposalBackgroundJob | ({ operation: "intake" } & IntakeJobRequest) | ({ operation: "coach" } & CoachJobRequest) | ({ operation: "deck" } & DeckJobRequest) | {
  operation?: "sections";
  ownerHash: string;
  planId: string;
  sections: Array<{ chapterId: string; sectionId: string }>;
  reviewedBusiness?: boolean;
};

/*
 * AI 호출은 한도 초과·일시적 오류로 실패할 수 있다. 짧게 여러 번 다시 시도하되,
 * 계속 막히면 그 섹션만 포기하고 다음으로 넘어간다 — 한 섹션 때문에
 * 나머지 24개가 멈추면 안 된다.
 */
const retryOptions = {
  timeout: "15 minutes",
  retries: { limit: 3, delay: "30 seconds", backoff: "exponential" as const },
} as const;

export class PlanSectionsWorkflow extends WorkflowEntrypoint<CloudflareEnv, PlanSectionsWorkflowParams> {
  async run(event: WorkflowEvent<PlanSectionsWorkflowParams>, step: WorkflowStep) {
    if (event.payload.operation === "intake") {
      const { operation: _operation, ...job } = event.payload;
      return step.do("요청한 사업정보 정리", { timeout: "2 minutes", retries: { limit: 0, delay: "5 seconds" } }, async () => {
        const service = this.env.WORKER_SELF_REFERENCE;
        if (!service) throw new Error("SELF_REFERENCE_MISSING");
        return callIntakeService(service, this.env.SUPABASE_SERVICE_ROLE_KEY, job);
      });
    }
    if (event.payload.operation === "artifact_update") {
      const job = event.payload;
      for (let index = 0; index < ARTIFACT_MAX_CHUNKS; index++) {
        const result = await step.do(`artifact-${job.attempt}-${index}`, { timeout: "3 minutes", retries: { limit: 0, delay: "5 seconds" } }, async () => {
          const service = this.env.WORKER_SELF_REFERENCE;
          if (!service) throw new Error("SELF_REFERENCE_MISSING");
          return callArtifactChunkService(service, this.env.SUPABASE_SERVICE_ROLE_KEY, { ...job, index });
        });
        if (!result.ok || result.done) return result;
      }
      throw new Error("ARTIFACT_CHUNK_LIMIT");
    }
    if (event.payload.operation === "document_refresh" || event.payload.operation === "proposal_rewrite") {
      const job = event.payload;
      return step.do("승인된 문서 변경안 작성과 검토", { timeout: "30 minutes", retries: { limit: 0, delay: "5 seconds" } }, async () => {
        const service = this.env.WORKER_SELF_REFERENCE;
        if (!service) throw new Error("SELF_REFERENCE_MISSING");
        return callProposalUpdateService(service, this.env.SUPABASE_SERVICE_ROLE_KEY, job);
      });
    }
    if (event.payload.operation === "deck") {
      const job = event.payload;
      return step.do("발표자료 생성과 검수", { timeout: "20 minutes", retries: { limit: 0, delay: "5 seconds" } }, async () => {
        const service = this.env.WORKER_SELF_REFERENCE;
        if (!service) throw new Error("SELF_REFERENCE_MISSING");
        return callDeckService(service, this.env.SUPABASE_SERVICE_ROLE_KEY, job);
      });
    }
    if (event.payload.operation === "coach") {
      const job = event.payload;
      return step.do("사업안 생성과 저장", { timeout: "8 minutes", retries: { limit: 0, delay: "5 seconds" } }, async () => {
        const service = this.env.WORKER_SELF_REFERENCE;
        if (!service) throw new Error("SELF_REFERENCE_MISSING");
        return callCoachService(service, this.env.SUPABASE_SERVICE_ROLE_KEY, job);
      });
    }
    if (!("sections" in event.payload)) throw new Error("UNSUPPORTED_PLAN_OPERATION");
    const { ownerHash, planId, sections, reviewedBusiness } = event.payload;
    const done: string[] = [];
    const failed: string[] = [];

    let outline: string | undefined;
    if (sections.length >= 3) {
      try {
        const result = await step.do("00 문서 설계도", { timeout: "3 minutes", retries: { limit: 1, delay: "10 seconds" } }, async () => {
          const service = this.env.WORKER_SELF_REFERENCE;
          if (!service) throw new Error("SELF_REFERENCE_MISSING");
          return callPlanOutlineService(service, this.env.SUPABASE_SERVICE_ROLE_KEY, { ownerHash, planId, sections });
        });
        outline = result.ok ? result.outline : undefined;
      } catch {
        outline = undefined;
      }
    }

    const order = sections.map(target => `${target.chapterId}/${target.sectionId}`);
    const runSection = async (key: string) => {
      const index = order.indexOf(key);
      const [chapterId, sectionId] = key.split("/");
      const job: PlanSectionJob = { ownerHash, planId, chapterId, sectionId, ...(outline ? { outline } : {}) };
      try {
        await step.do(`${String(index + 1).padStart(2, "0")} ${key}`, reviewedBusiness ? { timeout: "30 minutes", retries: { limit: 1, delay: "30 seconds", backoff: "exponential" } } : retryOptions, async () => {
          const service = this.env.WORKER_SELF_REFERENCE;
          if (!service) throw new Error("SELF_REFERENCE_MISSING");
          return callPlanSectionService(service, this.env.SUPABASE_SERVICE_ROLE_KEY, job);
        });
        done.push(key);
      } catch {
        // 이 섹션은 포기하고 다음으로 — 개요 화면에서 다시 시도할 수 있다
        failed.push(key);
      }
    };

    // 설계도가 없으면 앞 섹션 본문이 겹침을 막아 주도록 예전처럼 하나씩 만든다
    for (const wave of sectionWaves(order, outline ? SECTION_CONCURRENCY : 1)) {
      await Promise.all(wave.map(runSection));
    }

    return { done, failed, parallel: !!outline };
  }
}
