import { createHash } from "node:crypto";
import { applyExpertPatch, expertPatchSchema, type ExpertPatch } from "./coach-expert";
import { readCoach } from "./coach";
import { isCoachJobActive, readCoachJob } from "./coach-job-types";
import { loadPlanState, savePlanState } from "./plan-server-store";
import { ProposalError } from "./proposal-editor";

const RECEIPTS_KEY = "__business_edit_receipts";
type Receipt = { id: string; signature: string; revision: number };

export async function saveBusinessConditions(ownerHash: string, input: ExpertPatch) {
  const parsed = expertPatchSchema.safeParse(input);
  if (!parsed.success) throw new ProposalError("invalid_command", "수정할 항목을 다시 확인해 주세요", 400);
  const patch = parsed.data;
  const signature = createHash("sha256").update(JSON.stringify({ ...patch, fields: [...patch.fields].sort((a, b) => a.key.localeCompare(b.key)) })).digest("hex");
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await loadPlanState(ownerHash), plan = state.plans.find(item => item.id === patch.planId);
    const coach = plan && readCoach(plan.answers);
    if (!plan || !coach) throw new ProposalError("not_found", "수정할 사업을 찾을 수 없어요", 404);
    const raw = plan.answers[RECEIPTS_KEY]?.items;
    const receipts: Receipt[] = Array.isArray(raw) ? raw.filter((item): item is Receipt => !!item && typeof item.id === "string" && typeof item.signature === "string" && Number.isInteger(item.revision)) : [];
    const receipt = receipts.find(item => item.id === patch.requestId);
    if (receipt) {
      if (receipt.signature !== signature) throw new ProposalError("request_reused", "같은 요청 번호로 다른 사업 정보를 저장할 수 없어요");
      return { plan, duplicate: true };
    }
    if (coach.messages.some(message => message.id === patch.requestId)) throw new ProposalError("request_reused", "이미 사용한 요청 번호예요. 최신 정보를 확인해 주세요");
    if (coach.revision !== patch.revision) throw new ProposalError("revision_conflict", "다른 화면에서 사업 정보가 바뀌었어요. 작성한 내용을 보관한 뒤 최신 정보를 확인해 주세요");
    const job = readCoachJob(plan.answers);
    if (isCoachJobActive(job)) throw new ProposalError("business_busy", "AI가 사업 정보를 정리 중이에요. 완료 후 수정해 주세요");
    const before = plan.updatedAt;
    const at = new Date(Math.max(Date.now(), (Date.parse(before) || 0) + 1)).toISOString();
    const result = applyExpertPatch(plan.answers, patch, at);
    plan.answers = { ...result.answers, [RECEIPTS_KEY]: { items: [...receipts, { id: patch.requestId, signature, revision: result.coach.revision }].slice(-64) } };
    plan.title = result.coach.business.name; plan.updatedAt = at;
    try {
      await savePlanState(ownerHash, state, { planId: plan.id, coachRevision: coach.revision, planUpdatedAt: before, jobToken: job?.token ?? null });
      return { plan, duplicate: false };
    } catch (error) { if (!(error instanceof Error) || error.message !== "PLAN_VERSION_CONFLICT") throw error; }
  }
  throw new ProposalError("revision_conflict", "다른 변경이 저장 중이에요. 최신 정보를 확인해 주세요");
}
