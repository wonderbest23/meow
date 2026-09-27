import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import {
  directPlanInputSchema,
  generateDirectIdeaPlan,
} from "../direct-idea-planner";
import type { DirectPlanInput } from "../planning-inputs";
import type { LLMConfig } from "../llm/complete";
import { textLLMConfigFromEnv } from "../llm/config";

export type DirectPlanWorkflowParams = {
  input: DirectPlanInput;
};

const retryOptions = {
  retries: { limit: 2, delay: "5 seconds", backoff: "exponential" as const },
} as const;

function environmentLLMConfig(env: CloudflareEnv): LLMConfig {
  const config = textLLMConfigFromEnv(env as unknown as Record<string, string | undefined>);
  if (!config) throw new Error("OPENAI_NOT_CONNECTED");
  return config;
}

export class DirectPlanWorkflow extends WorkflowEntrypoint<CloudflareEnv, DirectPlanWorkflowParams> {
  async run(event: WorkflowEvent<DirectPlanWorkflowParams>, step: WorkflowStep) {
    const input = await step.do(
      "01 아이디어와 시작 조건 확인",
      retryOptions,
      async () => directPlanInputSchema.parse(event.payload.input),
    );
    const result = await step.do(
      "02 고객·상품·실행 범위 생성",
      retryOptions,
      async () => generateDirectIdeaPlan(input, environmentLLMConfig(this.env)),
    );
    return step.do(
      "03 생성 결과 저장",
      retryOptions,
      async () => structuredClone(result),
    );
  }
}
