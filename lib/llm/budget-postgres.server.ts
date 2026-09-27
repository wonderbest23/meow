import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetAttempt, BudgetLease, ProviderUsage, ReserveCost } from "./budget";

export class BudgetLedgerError extends Error {
  constructor(readonly code: string) { super(code); }
}
const allowedCodes = new Set(["budget_not_configured", "budget_period_mismatch", "service_halted", "invalid_budget_request", "reservation_conflict", "reservation_already_used", "budget_deadline", "model_price_unverified", "model_input_limit", "budget_exhausted", "dispatch_required", "reservation_not_found", "reservation_not_sent", "invalid_usage", "settlement_conflict", "cost_integer_overflow", "invalid_operation"]);
type Receipt = { ok?: boolean; code?: string; id?: string; state?: string };

/** HTTP/RPC only: no Node SQLite dependency and no fallback to memory. */
export class PostgresAiBudget {
  constructor(private client: Pick<SupabaseClient, "rpc">, private config: { service: string; period: string; catalog: string }) {}
  private async rpc(name: string, args: Record<string, unknown>): Promise<Receipt> {
    try {
      const { data, error } = await this.client.rpc(name, args);
      if (error) throw new BudgetLedgerError("ledger_unavailable");
      if (!data || typeof data !== "object") throw new BudgetLedgerError("ledger_invalid_response");
      return data as Receipt;
    } catch (error) { throw error instanceof BudgetLedgerError ? error : new BudgetLedgerError("ledger_unavailable"); }
  }
  private require(receipt: Receipt) {
    if (receipt.ok !== true) throw new BudgetLedgerError(allowedCodes.has(receipt.code ?? "") ? receipt.code! : "ledger_invalid_response");
  }
  async lookup(job: string, attempt: number) {
    return this.rpc("ai_budget_lookup", { p_service: this.config.service, p_job: job, p_attempt: attempt });
  }
  forJob(job: string): ReserveCost {
    return async (attempt: BudgetAttempt) => {
      const receipt = await this.rpc("ai_budget_reserve", { p_service: this.config.service, p_period: this.config.period, p_catalog: this.config.catalog, p_job: job, p_attempt: attempt.attempt, p_request: attempt });
      this.require(receipt);
      if (!receipt.id || !/^[0-9a-f-]{36}$/i.test(receipt.id)) throw new BudgetLedgerError("ledger_invalid_response");
      const id = receipt.id, dispatch = crypto.randomUUID();
      const transition = async (operation: string, usage: ProviderUsage | null = null) => {
        const result = await this.rpc("ai_budget_transition", { p_service: this.config.service, p_id: id, p_operation: operation, p_dispatch: dispatch, p_usage: usage });
        this.require(result); return result;
      };
      return { id, begin: async () => { await transition("begin"); return true; }, cancel: async () => { await transition("cancel"); }, settle: async usage => { await transition("settle", usage); } } satisfies BudgetLease;
    };
  }
}
