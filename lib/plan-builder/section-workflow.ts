import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { callPlanSectionService, type PlanSectionJob } from "./section-service";

/*
 * 본문 생성을 브라우저 밖에서 끝까지 돌리는 워크플로.
 *
 * 예전에는 생성이 브라우저 메모리 큐에 있어서 창을 닫으면 대기 중이던
 * 섹션이 사라졌다. 이제 '다음 단계'를 누르면 서버가 이어서 만든다 —
 * 사용자가 창을 닫아도, 휴대폰을 꺼도 계속된다.
 *
 * 앞 섹션 결과를 뒤 섹션이 참고하므로 한 번에 하나씩 순서대로 만든다.
 */

export type PlanSectionsWorkflowParams = {
  ownerHash: string;
  planId: string;
  sections: Array<{ chapterId: string; sectionId: string }>;
};

/*
 * AI 호출은 한도 초과·일시적 오류로 실패할 수 있다. 짧게 여러 번 다시 시도하되,
 * 계속 막히면 그 섹션만 포기하고 다음으로 넘어간다 — 한 섹션 때문에
 * 나머지 24개가 멈추면 안 된다.
 */
const retryOptions = {
  retries: { limit: 3, delay: "30 seconds", backoff: "exponential" as const },
} as const;

export class PlanSectionsWorkflow extends WorkflowEntrypoint<CloudflareEnv, PlanSectionsWorkflowParams> {
  async run(event: WorkflowEvent<PlanSectionsWorkflowParams>, step: WorkflowStep) {
    const { ownerHash, planId, sections } = event.payload;
    const done: string[] = [];
    const failed: string[] = [];

    for (const [index, target] of sections.entries()) {
      const key = `${target.chapterId}/${target.sectionId}`;
      const job: PlanSectionJob = { ownerHash, planId, ...target };
      try {
        await step.do(`${String(index + 1).padStart(2, "0")} ${key}`, retryOptions, async () => {
          const service = this.env.WORKER_SELF_REFERENCE;
          if (!service) throw new Error("SELF_REFERENCE_MISSING");
          return callPlanSectionService(service, this.env.SUPABASE_SERVICE_ROLE_KEY, job);
        });
        done.push(key);
      } catch {
        // 이 섹션은 포기하고 다음으로 — 개요 화면에서 다시 시도할 수 있다
        failed.push(key);
      }
    }

    return { done, failed };
  }
}
