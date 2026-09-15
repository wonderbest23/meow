import { createHash } from "node:crypto";
import { chaptersForType } from "./blueprint";
import { coachDocumentRevision, coachFinancialReference, readCoach } from "./coach";
import { renderPlanMarkdown } from "./markdown";
import { loadPlanState, type ServerPlan } from "./plan-server-store";
import { ProposalError, readSavedProposal, type SavedProposal } from "./proposal-editor";
import { updateSavedProposal } from "./proposal-editor-service";
import { DOCUMENT_REFRESH_TIMEOUT_MS, documentRefreshCommandSchema, documentRefreshExpired, documentRefreshResultSchema, type DocumentRefreshCommand, type DocumentRefreshPayload, type DocumentRefreshPreview } from "./document-refresh";
import type { RewriteTarget } from "./proposal-rewrite";
import { proposalAIConfig } from "./proposal-ai-config";
import { createDocumentRefreshRuntime } from "./document-refresh-runtime";

type Usage = NonNullable<NonNullable<SavedProposal["documentRefresh"]>["usage"]>[number];
export type DocumentRefreshRuntime = { target: RewriteTarget; generate(payload: DocumentRefreshPayload, onUsage?: (usage: Usage) => void): Promise<unknown> };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)).digest("hex");

export function documentRefreshRuntime(ownerHash: string): DocumentRefreshRuntime | null {
  const config = proposalAIConfig(ownerHash);
  return config ? createDocumentRefreshRuntime(config) : null;
}

function makePreview(ownerHash: string, plan: ServerPlan, keys: string[], target: RewriteTarget | null): DocumentRefreshPreview {
  const coach = readCoach(plan.answers), saved = readSavedProposal(plan.answers);
  if (!coach || !saved) throw new ProposalError("not_initialized", "공통 사업 정보와 저장된 제안서가 필요해요");
  if (saved.document.deck.blueprint?.sector !== "b2b_service" || saved.document.deck.blueprint.purpose !== "sales") throw new ProposalError("unsupported_proposal", "현재는 B2B 고객 제안서의 원문을 갱신할 수 있어요", 400);
  if (!keys.length || keys.length > 3 || new Set(keys).size !== keys.length) throw new ProposalError("invalid_sections", "서로 다른 문서 항목을 최대 3개 선택해 주세요", 400);
  const entries = chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => ({ key: `${chapter.id}/${section.id}`, chapterTitle: chapter.title, sectionTitle: section.title })));
  if (keys.some(key => !entries.some(entry => entry.key === key))) throw new ProposalError("invalid_sections", "이 계획서에 포함된 항목만 선택해 주세요", 400);
  const sections = entries.filter(entry => keys.includes(entry.key));
  const sourceRevision = coachDocumentRevision(coach);
  if (sections.some(({ key }) => plan.sections[key]?.locked)) throw new ProposalError("section_locked", "잠긴 항목은 자동 갱신하지 않아요. 문서에서 직접 확인해 주세요");
  if (sections.some(({ key }) => plan.sections[key]?.markdown && plan.sections[key].coachRevision === sourceRevision)) throw new ProposalError("already_current", "이미 최신 조건으로 검토한 항목이 있어요. 갱신할 항목을 다시 선택해 주세요");
  const payload: DocumentRefreshPayload = { businessName: coach.business.name, businessDescription: coach.business.description, stage: coach.stage,
    fields: coach.fields.map(({ key, value, basis }) => ({ key, value, basis })), financialReference: coachFinancialReference(coach),
    sections: sections.map(entry => ({ ...entry, markdown: plan.sections[entry.key]?.markdown ?? "" })) };
  if (JSON.stringify(payload).length > 30000) throw new ProposalError("source_too_large", "전송 분량이 많아요. 문서 항목을 줄여서 선택해 주세요", 400);
  const data = { sourceRevision, target, payload, sections: sections.map(({ key }) => ({ key, generatedAt: plan.sections[key]?.generatedAt ?? "", manual: !!plan.sections[key]?.edited })) };
  return { ...data, hash: digest({ ownerHash, planId: plan.id, ...data }) };
}

export async function previewDocumentRefresh(ownerHash: string, planId: string, keys: string[], runtime = documentRefreshRuntime(ownerHash)) {
  const plan = (await loadPlanState(ownerHash)).plans.find(item => item.id === planId);
  if (!plan) throw new ProposalError("not_found", "이 사업을 찾을 수 없어요", 404);
  return makePreview(ownerHash, plan, keys, runtime?.target ?? null);
}

function assertCurrent(ownerHash: string, plan: ServerPlan, preview: DocumentRefreshPreview) {
  try {
    if (makePreview(ownerHash, plan, preview.sections.map(section => section.key), preview.target).hash !== preview.hash) throw new Error("changed");
  } catch { throw new ProposalError("source_changed", "사업 조건이나 문서가 바뀌었어요. 최신 내용을 다시 확인해 주세요"); }
}

export async function reserveDocumentRefresh(ownerHash: string, planId: string, input: Extract<DocumentRefreshCommand, { type: "document_generate" }>, runtime = documentRefreshRuntime(ownerHash)) {
  const parsed = documentRefreshCommandSchema.safeParse(input);
  if (!parsed.success || parsed.data.type !== "document_generate") throw new ProposalError("invalid_command", "전송할 자료와 동의를 다시 확인해 주세요", 400);
  const command = parsed.data;
  return updateSavedProposal(ownerHash, planId, (saved, _state, plan) => {
    const attempts = saved.documentRefreshAttempts ?? [], prior = attempts.find(item => item.id === command.id);
    if (prior) { if (prior.hash !== command.hash || digest(prior.sections) !== digest([...command.sections].sort())) throw new ProposalError("request_reused", "같은 요청 번호로 다른 내용을 보낼 수 없어요"); return null; }
    if (!runtime) throw new ProposalError("document_refresh_disabled", "실제 사업 자료의 AI 문서 갱신은 아직 열지 않았어요", 503);
    if (saved.documentRefresh?.status === "ready") throw new ProposalError("review_pending", "보관된 문서 변경안을 먼저 검토해 주세요");
    if (saved.documentRefresh?.status === "running" && !documentRefreshExpired(saved.documentRefresh)) throw new ProposalError("refresh_busy", "작성 중인 문서 변경안이 있어요");
    if (attempts.length >= 30 || attempts.filter(item => Date.now() - Date.parse(item.startedAt) < 86400000).length >= 6) throw new ProposalError("refresh_limit", "문서 갱신 요청 한도에 도달했어요. 보관된 문안을 먼저 확인해 주세요", 429);
    const preview = makePreview(ownerHash, plan, command.sections, runtime.target);
    if (preview.hash !== command.hash) throw new ProposalError("consent_changed", "자료나 전송 대상이 바뀌었어요. 다시 확인해 주세요");
    const startedAt = new Date().toISOString();
    saved.documentRefreshAttempts = [...attempts, { id: command.id, hash: command.hash, sections: [...command.sections].sort(), startedAt }];
    saved.documentRefresh = { id: command.id, preview, status: "running", startedAt };
    return saved;
  });
}

export async function executeDocumentRefresh(ownerHash: string, planId: string, id: string, runtime = documentRefreshRuntime(ownerHash)) {
  let claimed = false;
  const started = await updateSavedProposal(ownerHash, planId, (saved, _state, plan) => {
    claimed = false;
    const job = saved.documentRefresh;
    if (!job || job.id !== id || job.status !== "running" || job.claimedAt) return null;
    let error: string | undefined;
    try { assertCurrent(ownerHash, plan, job.preview); } catch { error = "source_changed"; }
    if (documentRefreshExpired(job)) error = "timeout";
    if (!runtime || digest(runtime.target) !== digest(job.preview.target)) error = "target_changed";
    if (error) { job.status = "failed"; job.error = error; job.finishedAt = new Date().toISOString(); return saved; }
    job.claimedAt = new Date().toISOString(); claimed = true; return saved;
  });
  if (!claimed) return started;
  let drafts: NonNullable<SavedProposal["documentRefresh"]>["drafts"], error: string | undefined;
  const usage: Usage[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([runtime!.generate(started.documentRefresh!.preview.payload, value => usage.push({ model: value.model, inputTokens: value.inputTokens, outputTokens: value.outputTokens })), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), DOCUMENT_REFRESH_TIMEOUT_MS - 5000); })]);
    const parsed = documentRefreshResultSchema.safeParse(result), keys = started.documentRefresh!.preview.sections.map(section => section.key);
    if (!parsed.success || parsed.data.sections.length !== keys.length || new Set(parsed.data.sections.map(section => section.key)).size !== keys.length || parsed.data.sections.some(section => !keys.includes(section.key))) throw new Error("invalid_response");
    drafts = [];
    for (const section of parsed.data.sections) drafts.push({ ...section, html: await renderPlanMarkdown(section.markdown) });
  } catch (caught) { const code = caught instanceof Error ? caught.message : "invalid_response"; error = ["timeout", "quota_exhausted", "rate_limited", "output_limit", "review_failed", "unavailable"].includes(code) ? code : "invalid_response"; }
  finally { clearTimeout(timer); }
  return updateSavedProposal(ownerHash, planId, (saved, _state, plan) => {
    const job = saved.documentRefresh;
    if (!job || job.id !== id || job.status !== "running") return null;
    try { assertCurrent(ownerHash, plan, job.preview); } catch { error = "source_changed"; }
    if (documentRefreshExpired(job)) error = "timeout";
    saved.documentRefresh = { ...job, status: error ? "failed" : "ready", finishedAt: new Date().toISOString(), error, drafts: error ? undefined : drafts, usage };
    return saved;
  });
}

export async function runDocumentRefresh(ownerHash: string, planId: string, input: DocumentRefreshCommand, runtime = documentRefreshRuntime(ownerHash)) {
  const parsed = documentRefreshCommandSchema.safeParse(input);
  if (!parsed.success) throw new ProposalError("invalid_command", "문서 변경 요청을 확인해 주세요", 400);
  const command = parsed.data;
  if (command.type === "document_generate") {
    await reserveDocumentRefresh(ownerHash, planId, command, runtime);
    return executeDocumentRefresh(ownerHash, planId, command.id, runtime);
  }
  return updateSavedProposal(ownerHash, planId, (saved, _state, plan) => {
    const job = saved.documentRefresh;
    if (!job || job.id !== command.id) throw new ProposalError("refresh_not_found", "이 문서 변경안을 찾을 수 없어요");
    if (command.type === "document_dismiss") {
      if (job.status === "applied") throw new ProposalError("already_applied", "반영한 문서는 문서 화면의 이전 내용으로 되돌릴 수 있어요");
      if (job.status === "dismissed") return null;
      job.status = "dismissed"; job.finishedAt = new Date().toISOString(); return saved;
    }
    if (job.status === "applied") {
      if (digest(job.decisions) !== digest(command.decisions) || job.appliedRevision !== saved.revision) throw new ProposalError("revision_conflict", "반영 후 새 버전이 생겼어요. 최신 내용을 확인해 주세요");
      return null;
    }
    if (saved.revision !== command.expectedRevision) throw new ProposalError("revision_conflict", "다른 화면에서 저장했어요. 최신 버전을 확인해 주세요");
    if (job.status !== "ready" || !job.drafts) throw new ProposalError("refresh_not_ready", "작성이 완료된 변경안만 반영할 수 있어요");
    assertCurrent(ownerHash, plan, job.preview);
    const keys = job.preview.sections.map(section => section.key);
    if (Object.keys(command.decisions).length !== keys.length || keys.some(key => !command.decisions[key]) || Object.keys(command.decisions).some(key => !keys.includes(key))) throw new ProposalError("decision_required", "각 문서 항목의 본문을 선택해 주세요", 400);
    if (keys.some(key => command.decisions[key] === "keep" && !plan.sections[key]?.markdown.trim())) throw new ProposalError("empty_section", "기존 본문이 없는 항목은 새 본문을 선택해 주세요", 400);
    const at = new Date(Math.max(Date.now(), (Date.parse(plan.updatedAt) || 0) + 1, ...keys.map(key => (Date.parse(plan.sections[key]?.generatedAt ?? "") || 0) + 1))).toISOString();
    for (const key of keys) {
      const old = plan.sections[key], draft = job.drafts.find(section => section.key === key)!;
      plan.sections[key] = command.decisions[key] === "keep" ? { ...old, edited: true, generatedAt: at, coachRevision: job.preview.sourceRevision }
        : { markdown: draft.markdown, html: draft.html, generatedAt: at, coachRevision: job.preview.sourceRevision, ...(old ? { edited: old.edited, locked: old.locked, previous: { markdown: old.markdown, html: old.html } } : {}) };
    }
    job.status = "applied"; job.decisions = command.decisions; job.appliedRevision = saved.revision + 1;
    return saved;
  });
}
