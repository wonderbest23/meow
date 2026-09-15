import { resolvePlanningLLMConfig } from "../llm/config";
import type { LLMConfig } from "../llm/complete";

export function proposalAIConfig(ownerHash: string): LLMConfig | null {
  if (process.env.PROPOSAL_AI_ENABLED !== "true") return null;
  const config = resolvePlanningLLMConfig(ownerHash);
  return config?.provider === "openai" && config.apiKey ? config : null;
}
