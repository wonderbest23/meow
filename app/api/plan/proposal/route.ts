import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { loadPlanState } from "../../../../lib/plan-builder/plan-server-store";
import { ProposalError, proposalCommandSchema } from "../../../../lib/plan-builder/proposal-editor";
import { loadProposalEditor, saveProposalEditor } from "../../../../lib/plan-builder/proposal-editor-service";
import { renderableProposal } from "../../../../lib/plan-builder/proposal-revision";
import { renderDeckPptx } from "../../../../lib/plan-builder/deck-render";
import { pickDeckTheme } from "../../../../lib/plan-builder/deck-themes";
import { previewProposalRewrite, runProposalRewrite, proposalRewriteRuntime } from "../../../../lib/plan-builder/proposal-rewrite-service";
import { rewriteCommandSchema } from "../../../../lib/plan-builder/proposal-rewrite";
import { documentRefreshCommandSchema } from "../../../../lib/plan-builder/document-refresh";
import { previewDocumentRefresh, runDocumentRefresh, documentRefreshRuntime } from "../../../../lib/plan-builder/document-refresh-service";
import { queueProposalUpdate, type ProposalBackgroundJob } from "../../../../lib/plan-builder/proposal-background";
import { readBoundedJson, RequestBodyError } from "../../../../lib/http/bounded-json";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const idSchema = z.string().min(1).max(60);
const MAX_BODY_BYTES = 10_000_000;
async function workflow(): Promise<Workflow<ProposalBackgroundJob> | null> {
  if (process.env.PROPOSAL_AI_ENABLED !== "true") return null;
  try { return (await getCloudflareContext({ async: true })).env.PLAN_SECTIONS_WORKFLOW ?? null; } catch { return null; }
}
async function owner(planId: string) {
  const identity = await requireGuestIdentity();
  const plan = (await loadPlanState(identity.hash)).plans.find(item => item.id === planId);
  if (!plan) throw new ProposalError("not_found", "이 사업을 찾을 수 없어요", 404);
  const access = await resolvePlanAccess(plan.planType, planId);
  if (!access.authenticated) throw new ProposalError("login_required", "로그인 후 제안서를 편집할 수 있어요", 401);
  if (!access.paid) throw new ProposalError("payment_required", "이 사업의 문서 이용 권한이 필요해요", 402);
  return identity.hash;
}
function failure(error: unknown) {
  if (error instanceof RequestBodyError) return json({ code: error.code, message: error.message }, error.status);
  if (error instanceof ProposalError) return json({ code: error.code, message: error.message }, error.status);
  if (error instanceof Error && error.message === "PLAN_OWNER_CHANGED") return json({ code: "owner_changed", message: "로그인 상태가 바뀌었어요. 현재 계정에서 다시 열어 주세요" }, 409);
  if (error instanceof Error && (error.message === "proposal_layout_review_required" || error.message.startsWith("proposal_layout_review_required:"))) return json({ code: "proposal_layout_review_required", message: "슬라이드의 글자 넘침이나 요소 겹침, 차트 입력을 확인해 주세요. 편집기에서 표시된 항목의 문구·판형·배치를 수정한 뒤 다시 내려받을 수 있어요. 저장된 편집본은 그대로 유지됩니다" }, 422);
  return json({ code: "unavailable", message: "서버에 연결하지 못했어요. 편집 내용은 화면에 남아 있으니 다시 시도해 주세요" }, 503);
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const id = idSchema.safeParse(query.get("planId"));
    if (!id.success) return json({ message: "사업을 선택해 주세요" }, 400);
    const hash = await owner(id.data);
    if (query.get("preview") === "document") return json(await previewDocumentRefresh(hash, id.data, query.getAll("section"), await workflow() ? documentRefreshRuntime(hash) : null));
    if (query.get("preview") === "source") return json(await previewProposalRewrite(hash, id.data, await workflow() ? proposalRewriteRuntime(hash) : null));
    const data = await loadProposalEditor(hash, id.data);
    if (query.get("download") !== "1") return json(data);
    if (!data.saved) throw new ProposalError("not_saved", "편집본을 먼저 저장해 주세요");
    if (query.get("revision") !== String(data.saved.revision)) throw new ProposalError("revision_conflict", "새 버전이 저장됐어요. 최신 편집본을 확인한 뒤 내려받아 주세요");
    const limited = await enforceRateLimit("proposal-download", request, { limit: 12, windowMs: 600000 });
    if (limited) return limited;
    const deck = renderableProposal(data.saved.document);
    const buffer = await renderDeckPptx(deck, pickDeckTheme("", deck.brandName, ""));
    return new Response(new Uint8Array(buffer), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "Content-Disposition": `attachment; filename="proposal-v${data.saved.revision}.pptx"; filename*=UTF-8''${encodeURIComponent(`${deck.brandName} 제안서 v${data.saved.revision}.pptx`)}` } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const limited = await enforceRateLimit("proposal-save", request, { limit: 60, windowMs: 60000 });
  if (limited) return limited;
  try {
    const body = await readBoundedJson(request, MAX_BODY_BYTES);
    const parsed = z.object({ planId: idSchema, command: z.union([proposalCommandSchema, rewriteCommandSchema, documentRefreshCommandSchema]) }).strict().safeParse(body);
    if (!parsed.success) return json({ message: "수정 값과 배치 범위를 확인해 주세요" }, 400);
    const hash = await owner(parsed.data.planId), command = parsed.data.command;
    if (command.type === "document_generate" || command.type === "generate") {
      await queueProposalUpdate(hash, parsed.data.planId, command, await workflow(), command.type === "document_generate" ? documentRefreshRuntime(hash) : proposalRewriteRuntime(hash));
      return json(await loadProposalEditor(hash, parsed.data.planId), 202);
    }
    if (command.type === "document_apply" || command.type === "document_dismiss") {
      await runDocumentRefresh(hash, parsed.data.planId, command, null);
      return json(await loadProposalEditor(hash, parsed.data.planId));
    }
    if (command.type === "apply" || command.type === "dismiss") {
      await runProposalRewrite(hash, parsed.data.planId, command, null);
      return json(await loadProposalEditor(hash, parsed.data.planId));
    }
    return json(await saveProposalEditor(hash, parsed.data.planId, command));
  }
  catch (error) { return failure(error); }
}
