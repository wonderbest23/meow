import { createHash } from "node:crypto";
import { readCoach } from "./coach";
import { deckFingerprint, deckSource } from "./deck-job";
import { readDeckJob } from "./deck-job-types";
import { loadPlanState, savePlanState, type ServerPlan, type ServerPlanState } from "./plan-server-store";
import { PROPOSAL_KEY, ProposalError, readSavedProposal, proposalCommandSchema, proposalHistory, type ProposalCommand, type SavedProposal } from "./proposal-editor";
import { previewProposalSourceChange, renderableProposal, setProposalSlideEdits } from "./proposal-revision";
import { PPT_GENERATION_VERIFIED } from "./deck-availability";
import { coachDocumentSnapshot } from "./coach-document";
import { chaptersForType } from "./blueprint";
import type { BusinessConditionsView } from "./proposal-business";

function view(state: ServerPlanState, planId: string) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) throw new ProposalError("not_found", "이 사업을 찾을 수 없어요", 404);
  const saved = readSavedProposal(plan.answers);
  const job = readDeckJob(plan.answers);
  const coach = readCoach(plan.answers), snapshot = coachDocumentSnapshot(plan);
  const items = chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => {
    const key = `${chapter.id}/${section.id}`, content = plan.sections[key];
    return { key, title: `${chapter.title} · ${section.title}`, current: !!content?.markdown && content.coachRevision === snapshot?.revision, manual: !!content?.edited, locked: !!content?.locked };
  }));
  const total = items.length;
  const business: BusinessConditionsView | null = coach && snapshot ? { revision: coach.revision, fields: coach.fields,
    documents: { total, current: items.filter(item => item.current).length,
      missing: snapshot.missing, stale: snapshot.stale, manualReview: snapshot.manualReview, items } } : null;
  let sourceChanged = false;
  let affectedSlides: string[] = [];
  try {
    const source = deckSource(plan, state.business);
    const fingerprint = deckFingerprint({ ...source, ...(saved?.presentation ? { presentation: saved.presentation } : {}) });
    sourceChanged = !!saved && saved.fingerprint !== fingerprint;
    if (saved && sourceChanged) affectedSlides = previewProposalSourceChange(saved.document, source).affected.map(slide => slide.title);
  } catch { sourceChanged = !!saved; }
  return {
    title: plan.title, saved: saved ? { ...saved, receipts: undefined } : null, sourceChanged, affectedSlides, business,
    generationEnabled: PPT_GENERATION_VERIFIED,
    generation: job ? { token: job.token, status: job.status, editable: job.status === "complete" && job.result?.blueprint?.version === 2 } : null,
  };
}
export async function loadProposalEditor(ownerHash: string, planId: string) { return view(await loadPlanState(ownerHash), planId); }

export async function updateSavedProposal(ownerHash: string, planId: string, change: (saved: SavedProposal, state: ServerPlanState, plan: ServerPlan) => SavedProposal | null) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await loadPlanState(ownerHash), plan = state.plans.find(item => item.id === planId);
    if (!plan) throw new ProposalError("not_found", "이 사업을 찾을 수 없어요", 404);
    const saved = readSavedProposal(plan.answers);
    if (!saved) throw new ProposalError("not_initialized", "저장된 제안서를 먼저 열어 주세요");
    const next = change(structuredClone(saved), state, plan);
    if (!next) return saved;
    const before = plan.updatedAt;
    next.revision = saved.revision + 1; next.document.revision = next.revision;
    next.savedAt = new Date(Math.max(Date.now(), (Date.parse(before) || 0) + 1)).toISOString();
    plan.answers[PROPOSAL_KEY] = { ...next }; plan.updatedAt = next.savedAt;
    try { await savePlanState(ownerHash, state, { planId, coachRevision: readCoach(plan.answers)?.revision ?? 0, planUpdatedAt: before }); return next; }
    catch (error) { if (!(error instanceof Error) || error.message !== "PLAN_VERSION_CONFLICT") throw error; }
  }
  throw new ProposalError("revision_conflict", "다른 작업이 저장 중이에요. 최신 버전을 확인해 주세요");
}

export async function saveProposalEditor(ownerHash: string, planId: string, input: ProposalCommand) {
  const parsed = proposalCommandSchema.safeParse(input);
  if (!parsed.success) throw new ProposalError("invalid_command", "수정 값과 배치 범위를 확인해 주세요", 400);
  const command = parsed.data;
  const signature = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await loadPlanState(ownerHash);
    const plan = state.plans.find(item => item.id === planId);
    if (!plan) throw new ProposalError("not_found", "이 사업을 찾을 수 없어요", 404);
    const old = readSavedProposal(plan.answers);
    const receipt = old?.receipts.find(item => item.requestId === command.requestId);
    if (receipt) {
      if (receipt.signature !== signature) throw new ProposalError("request_reused", "저장 요청이 달라졌어요. 최신 내용을 불러와 주세요");
      if (receipt.revision !== old!.revision) throw new ProposalError("revision_conflict", "저장 후 다른 버전이 생겼어요. 최신 버전을 확인해 주세요");
      return view(state, planId);
    }
    if ((old?.revision ?? 0) !== command.expectedRevision) throw new ProposalError("revision_conflict", "다른 탭에서 먼저 저장했어요. 내 수정 내용을 보관한 뒤 최신 버전을 불러와 주세요");
    const at = new Date(Math.max(Date.now(), Date.parse(plan.updatedAt) + 1 || 0)).toISOString();
    let next: SavedProposal;
    if (command.type === "initialize") {
      if (old) throw new ProposalError("already_initialized", "이미 편집본이 있어요. 저장된 편집본을 열어 주세요");
      const job = readDeckJob(plan.answers);
      if (job?.status !== "complete" || job.token !== command.generationToken || job.result?.blueprint?.version !== 2) throw new ProposalError("generation_required", "새 형식으로 생성이 완료된 제안서가 필요해요");
      let source;
      try { source = deckSource(plan, state.business); } catch { throw new ProposalError("source_changed", "최신 사업계획서를 먼저 완성해 주세요"); }
      if (deckFingerprint({ ...source, ...(job.presentation ? { presentation: job.presentation } : {}) }) !== job.fingerprint) throw new ProposalError("source_changed", "생성 후 원문이 바뀌었어요. 최신 원문으로 다시 생성해 주세요");
      next = { version: 1, revision: 1, savedAt: at, generationToken: job.token, fingerprint: job.fingerprint,
        ...(job.presentation ? { presentation: job.presentation } : {}),
        document: { revision: 1, source: { businessName: source.businessName, businessDescription: source.businessDescription, sections: source.sections }, deck: structuredClone(job.result), edits: {} }, history: [], receipts: [] };
    } else {
      if (!old) throw new ProposalError("not_initialized", "먼저 생성 결과를 편집본으로 열어 주세요");
      const restored = command.type === "restore" ? old.history.find(version => version.revision === command.revision) : undefined;
      const baseDocument = restored?.document ?? old.document;
      const edits = command.type === "restore" ? restored?.edits : command.edits;
      if (!edits) throw new ProposalError("version_not_found", "보관 기간이 지난 버전이에요. 최근 버전을 선택해 주세요");
      const ids = new Set(baseDocument.deck.slides.map(slide => slide.id));
      for (const [id, edit] of Object.entries(edits)) {
        if (!ids.has(id)) throw new ProposalError("invalid_slide", "존재하지 않는 슬라이드예요", 400);
        const original = baseDocument.deck.slides.find(slide => slide.id === id)!;
        if (edit.layout?.image && !original.image) throw new ProposalError("invalid_image", "이미지가 없는 슬라이드예요", 400);
        if (edit.content?.table && !original.table) throw new ProposalError("invalid_table", "표가 없는 슬라이드예요", 400);
        if (edit.content?.points && !original.points?.length) throw new ProposalError("invalid_points", "본문 항목이 없는 슬라이드예요", 400);
        const pointLimit = original.composition?.layout === "summary" ? 40 : edit.content?.points?.length === 4 ? 60 : 90;
        if (edit.content?.points?.some(point => point.detail.length > pointLimit)) throw new ProposalError("content_too_long", `이 슬라이드의 본문은 항목당 ${pointLimit}자까지 저장할 수 있어요`, 400);
        setProposalSlideEdits(baseDocument, id, edit, baseDocument.revision);
      }
      next = { ...structuredClone(old), revision: old.revision + 1, savedAt: at,
        fingerprint: restored?.fingerprint ?? old.fingerprint,
        document: { ...structuredClone(baseDocument), revision: old.revision + 1, edits: structuredClone(edits) },
        history: proposalHistory(old, command.type === "restore" ? "restore" : "edit") };
    }
    renderableProposal(next.document);
    next.receipts = [...next.receipts, { requestId: command.requestId, signature, revision: next.revision }].slice(-64);
    const before = plan.updatedAt;
    plan.answers[PROPOSAL_KEY] = { ...next }; plan.updatedAt = at;
    try {
      await savePlanState(ownerHash, state, { planId, coachRevision: readCoach(plan.answers)?.revision ?? 0, planUpdatedAt: before });
      return view(state, planId);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "PLAN_VERSION_CONFLICT") throw error;
    }
  }
  throw new ProposalError("revision_conflict", "동시에 저장 중인 내용이 있어요. 최신 버전을 확인해 주세요");
}
