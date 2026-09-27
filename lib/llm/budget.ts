import type { LLMProvider } from "./complete";

export type ProviderUsage = { inputTokens: number; outputTokens: number; model: string; provider: LLMProvider };
export type BudgetAttempt = { provider: LLMProvider; model: string; attempt: number; inputBytes: number; maxOutputTokens: number; deadline: number; requestFingerprint: string };
export type BudgetLease = {
  id: string;
  /** Durable compare-and-set before fetch. False means do not send (duplicate/expired). */
  begin: () => Promise<boolean>;
  /** Caller attests fetch has not started; releases its own unsubmitted dispatch claim only. */
  cancel: () => Promise<void>;
  /** Unknown usage retains the full reservation. */
  settle: (usage: ProviderUsage | null) => Promise<void>;
};
export type ReserveCost = (attempt: BudgetAttempt) => Promise<BudgetLease | boolean>;
