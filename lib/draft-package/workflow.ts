import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import {
  type DraftPackageWorkflowParams,
} from "./domain";
import {
  type DraftPackageBuildContext,
  type GeneratedDraftStage,
  type PreparedDraftStage,
} from "./runner";
import { callDraftPackageService } from "./service";

const retryOptions = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" as const },
} as const;

const aiRetryOptions = {
  retries: {
    limit: 336,
    delay: ({ ctx }: { ctx: { attempt: number }; error: Error }) => (
      ctx.attempt <= 3 ? "5 minutes" : "30 minutes"
    ),
  },
} as const;

function errorDetail(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (parts.length) return parts.join(" · ").slice(0, 1000);
    try {
      return JSON.stringify(error).slice(0, 1000);
    } catch {
      return "알 수 없는 서버 오류";
    }
  }
  return String(error || "알 수 없는 서버 오류").slice(0, 1000);
}

function publicErrorMessage(detail: string) {
  if (detail.includes("OPENAI_429")) return "서버가 여러 차례 자동으로 다시 확인했지만 OpenAI 사용 한도가 계속 막혀 있습니다. 결제·사용 한도를 확인해주세요.";
  if (detail.includes("OPENAI_401") || detail.includes("OPENAI_403")) return "OpenAI 연결키의 권한을 확인하지 못해 제작을 멈췄습니다. 연결키를 확인한 뒤 다시 시작해주세요.";
  if (detail.includes("OPENAI_404")) return "선택한 OpenAI 모델을 사용할 수 없어 제작을 멈췄습니다. 모델 설정을 확인한 뒤 다시 시작해주세요.";
  if (detail.includes("OPENAI_")) return "인공지능 자료 생성 연결이 잠시 불안정합니다. 다시 시작하면 완료된 단계부터 이어집니다.";
  if (detail.includes("PROJECT_NOT_FOUND")) return "프로젝트를 다시 불러오지 못했습니다. 같은 계정이나 브라우저에서 다시 시도해주세요.";
  return "서버에서 자료를 저장하는 중 문제가 생겼습니다. 다시 시작하면 완료된 단계부터 이어집니다.";
}

function shouldWaitForOpenAI(detail: string) {
  return detail.includes("OPENAI_429")
    || detail.includes("OPENAI_TIMEOUT")
    || detail.includes("OPENAI_UNAVAILABLE")
    || /OPENAI_5\d\d/.test(detail);
}

export class DraftPackageWorkflow extends WorkflowEntrypoint<CloudflareEnv, DraftPackageWorkflowParams> {
  async run(event: WorkflowEvent<DraftPackageWorkflowParams>, step: WorkflowStep) {
    const params = event.payload;
    const call = <T>(operation: Parameters<typeof callDraftPackageService<T>>[2], args: unknown[]) => (
      callDraftPackageService<T>(
        this.env.WORKER_SELF_REFERENCE as Fetcher,
        this.env.SUPABASE_SERVICE_ROLE_KEY,
        operation,
        args,
      )
    );
    try {
      const shouldPrepare = await step.do(
        "01 사업 기본 조건 시작",
        retryOptions,
        async () => call<boolean>("startMilestone", [params, 0]),
      );
      const context = await step.do(
        "01 사업 기본 조건 정리",
        retryOptions,
        async () => call<DraftPackageBuildContext>("preparePackage", [params]),
      );
      if (shouldPrepare) {
        await step.do(
          "01 사업 기본 조건 완료 표시",
          retryOptions,
          async () => call("completeMilestone", [params, 0]),
        );
      }

      for (let stageIndex = 0; stageIndex < 6; stageIndex += 1) {
        const stepNumber = String(stageIndex + 2).padStart(2, "0");
        const shouldRun = await step.do(
          `${stepNumber} 결과물 ${stageIndex + 1} 시작`,
          retryOptions,
          async () => call<boolean>("startMilestone", [params, stageIndex + 1]),
        );
        if (!shouldRun) continue;

        const prepared = await step.do(
          `${stepNumber} 결과물 ${stageIndex + 1} 입력 정리`,
          retryOptions,
          async () => call<PreparedDraftStage>("prepareStage", [params, stageIndex, context]),
        );
        if (prepared.status === "ready") {
          const generation = await step.do(
            `${stepNumber} 결과물 ${stageIndex + 1} AI 작성`,
            aiRetryOptions,
            async () => {
              try {
                return {
                  status: "success" as const,
                  value: await call<GeneratedDraftStage>(
                    "generateStage",
                    [params, stageIndex, context, prepared.jobId],
                  ),
                };
              } catch (error) {
                const detail = errorDetail(error);
                if (shouldWaitForOpenAI(detail)) throw error;
                return { status: "terminal" as const, error: detail };
              }
            },
          );
          if (generation.status === "terminal") throw new Error(generation.error);
          const generated = generation.value;
          await step.do(
            `${stepNumber} 결과물 ${stageIndex + 1} 저장 및 검수`,
            retryOptions,
            async () => call("finishStage", [params, stageIndex, generated, prepared.jobId]),
          );
          if (stageIndex === 4) {
            await step.do(
              `${stepNumber} 판매 페이지 반영`,
              retryOptions,
              async () => call("syncLanding", [params]),
            );
          }
        }
        await step.do(
          `${stepNumber} 결과물 ${stageIndex + 1} 완료 표시`,
          retryOptions,
          async () => call("completeMilestone", [params, stageIndex + 1]),
        );
      }

      const documentSteps = [
        { index: 7, label: "08 사업계획서", action: () => call("generateBusinessPlan", [params, context]) },
        { index: 8, label: "09 운영 준비서", action: () => call("generateOperations", [params, context]) },
        { index: 9, label: "10 단계별 실행표", action: () => call("generateExecutionPlan", [params, context]) },
        { index: 10, label: "11 지원사업 초안", action: () => call("generateGrantPackage", [params, context]) },
      ];
      for (const documentStep of documentSteps) {
        const shouldRun = await step.do(
          `${documentStep.label} 시작`,
          retryOptions,
          async () => call<boolean>("startMilestone", [params, documentStep.index]),
        );
        if (!shouldRun) continue;
        await step.do(`${documentStep.label} 작성`, retryOptions, documentStep.action);
        await step.do(
          `${documentStep.label} 완료 표시`,
          retryOptions,
          async () => call("completeMilestone", [params, documentStep.index]),
        );
      }

      await step.do("12 전체 제작 완료", retryOptions, async () => call("completeRun", [params]));
      return { projectId: params.projectId, runId: params.runId, status: "complete" };
    } catch (error) {
      const technicalMessage = errorDetail(error);
      await step.do(
        "제작 실패 상태 저장",
        retryOptions,
        async () => call("failRun", [params, publicErrorMessage(technicalMessage)]),
      ).catch(() => undefined);
      throw error;
    }
  }
}
