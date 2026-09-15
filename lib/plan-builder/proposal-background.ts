import { z } from "zod";
import { ProposalError } from "./proposal-editor";
import { executeDocumentRefresh, reserveDocumentRefresh, type DocumentRefreshRuntime } from "./document-refresh-service";
import type { DocumentRefreshCommand } from "./document-refresh";
import { executeProposalRewrite, reserveProposalRewrite, type RewriteRuntime } from "./proposal-rewrite-service";
import type { RewriteCommand } from "./proposal-rewrite";

export const proposalBackgroundJobSchema = z.object({
  ownerHash: z.string().min(1).max(128), planId: z.string().min(1).max(60), jobId: z.string().uuid(),
  operation: z.enum(["document_refresh", "proposal_rewrite"]),
}).strict();
export type ProposalBackgroundJob = z.infer<typeof proposalBackgroundJobSchema>;
type Binding = Pick<Workflow<ProposalBackgroundJob>, "create" | "get">;

export async function queueProposalUpdate(ownerHash: string, planId: string, command: Extract<DocumentRefreshCommand, { type: "document_generate" }> | Extract<RewriteCommand, { type: "generate" }>, binding: Binding | null, runtime: DocumentRefreshRuntime | RewriteRuntime | null) {
  if (!binding || !runtime) throw new ProposalError("proposal_ai_unavailable", "AI 문서 갱신은 아직 준비 중이에요. 기존 문서는 그대로 사용할 수 있어요", 503);
  const document = command.type === "document_generate";
  const saved = document ? await reserveDocumentRefresh(ownerHash, planId, command, runtime as DocumentRefreshRuntime) : await reserveProposalRewrite(ownerHash, planId, command, runtime as RewriteRuntime);
  const job = document ? saved.documentRefresh : saved.rewrite;
  if (!job || job.id !== command.id || job.status !== "running" || job.claimedAt) return saved;
  const params: ProposalBackgroundJob = { ownerHash, planId, jobId: command.id, operation: document ? "document_refresh" : "proposal_rewrite" };
  const id = `${params.operation}-${command.id}`;
  try { await binding.create({ id, params }); }
  catch {
    // A lost create response may still have started the same durable job. Never replace its ID.
    try { await (await binding.get(id)).status(); }
    catch { throw new ProposalError("dispatch_pending", "요청은 저장됐지만 실행 접수를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요", 503); }
  }
  return saved;
}

export async function executeProposalUpdate(input: unknown) {
  const job = proposalBackgroundJobSchema.parse(input);
  const saved = job.operation === "document_refresh"
    ? await executeDocumentRefresh(job.ownerHash, job.planId, job.jobId)
    : await executeProposalRewrite(job.ownerHash, job.planId, job.jobId);
  const status = job.operation === "document_refresh" ? saved.documentRefresh?.status : saved.rewrite?.status;
  return { ok: status === "ready" || status === "applied" };
}
