import "server-only";
import { getServerSupabase } from "../persistence";
import { BudgetLedgerError, PostgresAiBudget } from "../llm/budget-postgres.server";
import type { BudgetLease, ReserveCost } from "../llm/budget";
import { executeIntakeJob } from "./intake-service";
import type { IntakeJobRequest } from "./intake-types";

export type IntakeBudgetFailure = { code: string; message: string };
export function createIntakeBudgetExecution(jobId: string) {
  const service = process.env.AI_SERVICE_BUDGET_ID?.trim();
  const period = process.env.AI_BUDGET_PERIOD_ID?.trim();
  const catalog = process.env.AI_BUDGET_PRICE_CATALOG?.trim();
  let failure: IntakeBudgetFailure | null = null;
  const record = (error: unknown) => {
    const code = error instanceof BudgetLedgerError ? error.code : "ledger_unavailable";
    failure = { code, message: `AI 비용 한도를 확인하지 못했어요 (${code}). 입력과 요청은 보관되어 있으니 설정 확인 후 다시 요청해 주세요.` };
    throw error;
  };
  const protect = async <T>(run: () => Promise<T>): Promise<T> => { try { return await run(); } catch (error) { return record(error); } };
  const reserveCost: ReserveCost = attempt => protect(async () => {
    if (!service || !period || !catalog) throw new BudgetLedgerError("budget_not_configured");
    const client = getServerSupabase();
    if (!client) throw new BudgetLedgerError("ledger_unavailable");
    const value = await new PostgresAiBudget(client, { service, period, catalog }).forJob(jobId)(attempt);
    if (!value || typeof value === "boolean") throw new BudgetLedgerError("ledger_invalid_response");
    return { id: value.id, begin: () => protect(value.begin), cancel: () => protect(value.cancel), settle: usage => protect(() => value.settle(usage)) } satisfies BudgetLease;
  });
  // Lazy reservation: a feature without a failover policy never consults this ledger.
  return { reserveCost, budgetFailure: () => failure };
}
export function runIntakeJobWithBudget(request: IntakeJobRequest) {
  return executeIntakeJob(request, createIntakeBudgetExecution(request.jobId));
}
