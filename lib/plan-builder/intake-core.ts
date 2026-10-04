import { COACH_FIELD_LABELS } from "./coach-presentation";
import { coachAmount, monthlyVolumeFromCapacity } from "./coach-feasibility";
import { coachDocumentRevision, coachFinancialReference, type CoachField, type CoachState } from "./coach";
import { calculateFinancials, financialsToReference } from "./financials";
import { coreQuestions, detailQuestions, getIntakeQuestion, intakeCandidates, intakeSectorOptions, pricePrompt, structureQuestions, structureUnitCostQuestion, type IntakeMode, type IntakeQuestion } from "./intake-questions";
import { INDUSTRY_HINTS, PRICE_BASIS, periodMonths, sectorChipOptions } from "./intake-options";
import { descriptionSector } from "./intake-sector";
import { KSIC_SYNONYMS, ksicAncestors, ksicByCode, ksicEntries, ksicPath, ksicStructure, normalize as normalizeKsic, searchKsic, sectorForKsic } from "./ksic";
import { START_CONDITIONS } from "./intake-questions";
import { candidateTemplateFacts, filterCandidateConditions, selectedStartConditions } from "./intake-candidate-constraints";
import { capacityUnitOrder, licenseHint, revenueBasis, SECTOR_DEFAULT_STRUCTURE, STRUCTURE_AXES, STRUCTURE_LABELS, structureFieldLabels, structureSummary, type BusinessStructure, type StructureAxis } from "./business-structure";
import { PROPOSAL_SECTORS, type ProposalSector } from "./proposal-blueprint";
import { INTAKE_KEY, INTAKE_VERSION, type IntakeCandidate, type IntakeCommand, type IntakeJob, type IntakeSnapshot, type IntakeState, type IntakeValue } from "./intake-types";
import type { ServerPlan } from "./plan-server-store";
import { loadResourceRecords, RESOURCE_DATA_VERSION, RESOURCE_ANSWER_IDS, resourceBusinessAssumptions, type ResourceRecord } from "./intake-candidate-resources";
import { evaluateCandidateResources, parseResourceLimit } from "./intake-candidate-fit";
import { generatedIdeaStructure } from "./intake-ideas";
import { INTAKE_JOB_TIMING } from "./intake-timing";
export { INTAKE_JOB_TIMING } from "./intake-timing";
import { intakeResourceSource } from "./intake-resource-context";

export class IntakeError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function readIntake(answers: ServerPlan["answers"]): IntakeState | null {
  const value = answers[INTAKE_KEY]?.state as IntakeState | undefined;
  return value?.version === INTAKE_VERSION && value.answers && Array.isArray(value.notes) && Array.isArray(value.candidates) ? value : null;
}

export function createIntake(coach: CoachState, mode: IntakeMode, at: string): IntakeState {
  const sector = PROPOSAL_SECTORS.find(value => value === coach.business.industry || intakeSectorOptions.find(option => option.value === value)?.label === coach.business.industry) ?? "general";
  const state: IntakeState = { version: INTAKE_VERSION, packVersion: "2026-09-16.1", mode: coach.stage === "operating" ? "operating" : mode, sector, answers: {}, detailsRequested: false, notes: [], candidates: [], job: null, receipts: [], legacyImported: coach.messages.length > 0 };
  for (const question of coreQuestions(state.mode)) {
    const field = coach.fields.find(value => value.key === question.fieldKey && value.basis === "user");
    if (field) state.answers[question.id] = { status: "answered", value: field.value, messageId: field.messageId, at, quote: field.quote };
  }
  if (coach.business.industry) state.answers.industry = { status: "answered", value: sector, messageId: "legacy-industry", at };
  return state;
}

function candidateAnswers(intake: IntakeState, coach: CoachState) {
  const selectedBusiness = coach.fields.find(field => field.key === "business" && field.basis === "user")?.messageId === intake.answers.candidate?.messageId;
  return Object.fromEntries(Object.entries(intake.answers).filter(([key]) => key !== "business" || !selectedBusiness).map(([key, answer]) => [key, coach.fields.find(field => field.key === key && field.basis === "user")?.value ?? answer.value]));
}

/** Sector for chip sets: the confirmed intake sector, else a rule-based guess from the business text, else general. No AI. */
export function intakeChipSector(intake: Pick<IntakeState, "sector" | "answers">, coach: Pick<CoachState, "fields">): ProposalSector {
  if (intake.sector !== "general") return intake.sector;
  const business = coach.fields.find(field => field.key === "business" && field.basis === "user")?.value
    ?? (typeof intake.answers.business?.value === "string" ? intake.answers.business.value : "");
  return business.trim() ? descriptionSector(business) : "general";
}

type CandidateIdea = IntakeSnapshot["candidateIdeas"][number];
const KSIC_CANDIDATE_LIMIT = 5;
/** 시작 조건(칩 라벨) → 구조 축 판정. 모든 조건을 동시에 만족하는 세세분류만 후보가 된다. */
const CONDITION_MATCH: Record<typeof START_CONDITIONS[number], (structure: BusinessStructure) => boolean> = {
  "무점포로 시작": structure => structure.capital === "remote",
  "혼자 시작할 수 있는 일": structure => structure.smallBusiness,
  "인허가 없이 시작": structure => structure.license === "none",
  "온라인으로 제공": structure => structure.delivery === "online" || structure.delivery === "mixed",
  "방문·출장으로 제공": structure => structure.delivery === "visit" || structure.delivery === "mixed",
  "매장·공간에서 제공": structure => structure.delivery === "store" || structure.offering === "space",
  "개인 고객": structure => structure.payer === "b2c" || structure.payer === "mixed",
  "기업·사업자 고객": structure => structure.payer === "b2b" || structure.payer === "b2g" || structure.payer === "mixed",
  "월 구독·정기 수익": structure => structure.revenue === "subscription",
};
const isCondition = (value: unknown): value is typeof START_CONDITIONS[number] => typeof value === "string" && value in CONDITION_MATCH;
let synonymIndex: Map<string, string[]> | null = null;
/** 코드 → 그 업종을 부르는 구어 표현들. 표현이 많을수록 흔한 창업 업종으로 보고(임의의 코드 순 대신) 채움 후보의 순서로 쓴다. */
function synonymsByCode(): Map<string, string[]> {
  if (synonymIndex) return synonymIndex;
  synonymIndex = new Map();
  for (const [term, codes] of Object.entries(KSIC_SYNONYMS)) for (const code of codes) synonymIndex.set(code, [...(synonymIndex.get(code) ?? []), term]);
  return synonymIndex;
}
const KSIC_FILLER_LIMIT_WITH_MATCHES = 2;
/** 경험 문장 안에서 이 코드를 가리킨 구어 표현(있으면). 근거 문장에만 쓴다. */
function matchedSynonym(code: string, text: string): string | undefined {
  const q = normalizeKsic(text);
  return Object.keys(KSIC_SYNONYMS).filter(key => KSIC_SYNONYMS[key].includes(code) && normalizeKsic(key).length >= 2 && q.includes(normalizeKsic(key))).sort((a, b) => b.length - a.length)[0];
}

/**
 * 표준산업분류 지도에서 고른 사업 후보(탐색 모드). 관심 업종의 중분류 안에서, 시작 조건을 전부 만족하는 세세분류를
 * 경험 문장 일치 → 구어 표현이 있는 흔한 창업 업종 → 코드 순으로 고른다. 관심·경험·조건 중 하나도 없으면 비어 있다(추측하지 않는다).
 * 소상공인 창업 후보가 아닌 분류(smallBusiness=false)는 제외한다.
 */
export function ksicCandidateIdeas(intake: IntakeState, coach: CoachState, entirePool = false): CandidateIdea[] {
  const interest = intake.answers.interest?.value, conditionValues = intake.answers.conditions?.value;
  const sectors = (Array.isArray(interest) ? interest : []).filter((value): value is ProposalSector => PROPOSAL_SECTORS.includes(value as ProposalSector) && value !== "general");
  const chosen = (Array.isArray(conditionValues) ? conditionValues : []).filter(isCondition);
  const experienceValue = coach.fields.find(field => field.key === "experience" && field.basis === "user")?.value ?? intake.answers.experience?.value;
  const experience = (Array.isArray(experienceValue) ? experienceValue.join(" ") : typeof experienceValue === "string" ? experienceValue : "").trim();
  if (!sectors.length && !chosen.length && !experience) return [];
  const matches = new Map(experience ? searchKsic(experience, { limit: entirePool ? Infinity : 30, minLevel: 5 }).map(match => [match.entry.code, match]) : []);
  // 관심·조건이 없고 경험만 있으면 경험과 이어진 분류만 본다. 전체 1,205개를 임의로 늘어놓지 않는다.
  const pool = ksicEntries(5).filter(entry => sectors.length || chosen.length || matches.has(entry.code));
  const ranked = pool.flatMap(entry => {
    const structure = ksicStructure(entry.code);
    // 업종은 분류의 구조값(sector)으로 본다. 중분류가 소프트웨어 쪽이어도 예외표가 콘텐츠로 옮긴 분류는 콘텐츠 관심에만 나온다.
    if (!structure || !structure.smallBusiness || (sectors.length && !sectors.includes(structure.sector)) || !chosen.every(value => CONDITION_MATCH[value](structure))) return [];
    const match = matches.get(entry.code), terms = synonymsByCode().get(entry.code) ?? [];
    const score = (match ? 1000 + match.score : 0) + Math.min(terms.length, 9) * 10;
    return [{ entry, structure, match, terms, score }];
  }).sort((a, b) => b.score - a.score || a.entry.code.localeCompare(b.entry.code));
  // 경험과 이어진 분류가 있으면 그것이 목록의 중심이고 채움 후보는 2개까지만. 채움은 부르는 말이 있는 흔한 업종을 먼저 쓰고, 하나도 없을 때만 나머지 분류로 채운다.
  const matched = ranked.filter(item => item.match), common = ranked.filter(item => !item.match && item.terms.length), rest = ranked.filter(item => !item.match && !item.terms.length);
  const fillers = (common.length ? common : rest).slice(0, matched.length ? KSIC_FILLER_LIMIT_WITH_MATCHES : KSIC_CANDIDATE_LIMIT);
  const scored = entirePool ? [...matched, ...common, ...rest] : [...matched, ...fillers].slice(0, KSIC_CANDIDATE_LIMIT);
  return scored.map(({ entry, structure, match, terms }) => {
    const group = ksicAncestors(entry.code).find(ancestor => ancestor.level === 3)?.name ?? ksicPath(entry.code);
    const sector = sectorForKsic(entry.code) ?? "general";
    const term = match ? matchedSynonym(entry.code, experience) : undefined;
    const reasons = [
      ...(match ? [term ? `경험 입력의 "${term}"과 이어지는 분류` : "경험 입력과 이름이 맞는 분류"] : []),
      ...(sectors.includes(sector) ? [`관심 분야: ${intakeSectorOptions.find(option => option.value === sector)?.label ?? sector}`] : []),
      ...(chosen.length ? [`조건 일치: ${chosen.join(", ")}`] : []),
      // 공식 이름이 낯설어서 흔히 부르는 말을 함께 보여 준다(예: 기타 미용업 ← 네일, 왁싱).
      ...(terms.length ? [`흔히 부르는 말: ${terms.slice(0, 3).join(", ")}`] : []),
    ];
    return { id: `ksic:${entry.code}`, title: entry.name, sector, description: `표준산업분류 ${entry.code} · ${group} · ${structureSummary(structure).join(" · ")}`, reasons,
      cautions: [licenseHint(structure, entry.code) ?? "인허가는 관할 기관 기준으로 확인이 필요합니다.", "표준산업분류 세세분류 기준 후보이며 수요·수익성을 검증한 결과가 아닙니다."] };
  });
}

/** 후보 목록: 고정 템플릿(관심·경험 태그 순) 뒤에 표준산업분류 지도 후보. 후보 선택·옵션·요약이 모두 같은 목록을 본다. */
export function resourceLimitsFor(intake: Pick<IntakeState, "answers">, coach: CoachState) {
  return Object.fromEntries(Object.entries(RESOURCE_ANSWER_IDS).map(([metric, id]) => {
    const answer = intake.answers[id];
    return [metric, answer ? answer.status === "unknown" ? answer.quote || null : answer.quote || answer.value : coach.fields.find(f => f.key === id && f.basis === "user")?.value ?? null];
  }));
}

export function evaluateIntakeCandidates(intake: IntakeState, coach: CoachState, asOf: string, records: readonly ResourceRecord[] = loadResourceRecords()) {
  const conditions = selectedStartConditions(intake.answers.conditions?.value);
  const templates = intakeCandidates(candidateAnswers(intake, coach), Infinity);
  const generated = (intake.generatedIdeas ?? []).filter(idea => !idea.rejected && idea.baseInputRevision === (intake.ideaInputRevision ?? 0));
  const collected: CandidateIdea[] = [...templates, ...ksicCandidateIdeas(intake, coach, true), ...generated];
  const pool = collected.flatMap(idea =>
    filterCandidateConditions(idea, idea.source === "ai-generated" ? idea.proposedStructure ?? {} : idea.id.startsWith("ksic:") ? ksicStructure(idea.id.slice(5)) ?? {} : candidateTemplateFacts(idea.id), conditions));
  const limits = resourceLimitsFor(intake, coach);
  const data = loadResourceRecords([...records, ...intake.resourceQuotes ?? []]).filter(r => r.candidateId !== "custom-business" || r.businessDescription === coach.business.description);
  const structure = effectiveStructure(intake).values, business = resourceBusinessAssumptions(coach);
  const assess = (idea: CandidateIdea): CandidateIdea => {
    const proposal = intake.generatedIdeas?.find(item => item.id === idea.id);
    const unselected = proposal && intake.selectedCandidate?.id !== idea.id;
    return { ...idea, resourceFit: evaluateCandidateResources(idea.id, limits, intake.resourceContext, asOf, data, unselected ? generatedIdeaStructure(proposal) : structure, unselected ? { description: proposal.description, customer: proposal.customer, offer: proposal.offering, channel: proposal.delivery } : business) };
  };
  const evaluated = pool.map(assess);
  const available = evaluated.filter(i => i.resourceFit?.status !== "exceeded");
  // Preserve interest/experience order within each source; unknown data is not a ranking bonus or penalty.
  const mapIdeas = available.filter(i => i.id.startsWith("ksic:"));
  const matched = mapIdeas.filter(i => i.reasons.some(reason => reason.includes("경험")));
  const fillers = mapIdeas.filter(i => !matched.includes(i)).slice(0, matched.length ? KSIC_FILLER_LIMIT_WITH_MATCHES : KSIC_CANDIDATE_LIMIT);
  const ideas = [...available.filter(i => !i.id.startsWith("ksic:") && i.source !== "ai-generated").slice(0, 3), ...[...matched, ...fillers].slice(0, KSIC_CANDIDATE_LIMIT), ...available.filter(i => i.source === "ai-generated")];
  const custom = templates.find(i => i.id === "custom-business");
  const selectedId = custom ? null : intake.answers.candidate?.value;
  const selectedBase = custom ?? intake.selectedCandidate ?? evaluated.find(i => i.id === selectedId) ?? (typeof selectedId === "string" ? { id: selectedId, title: coach.business.name, description: coach.business.description, sector: intake.sector, reasons: [], cautions: [] } : undefined);
  const selected = selectedBase ? { ...assess(selectedBase), retained: !available.some(i => i.id === selectedBase.id) } : undefined;
  if (selected && !ideas.some(i => i.id === selected.id)) ideas.push(selected);
  const excluded = evaluated.filter(i => i.resourceFit?.status === "exceeded");
  return { ideas, assessment: { version: RESOURCE_DATA_VERSION, asOf, total: evaluated.length, excluded: excluded.slice(0, 8), excludedCount: excluded.length, selected, allUnknown: available.length > 0 && available.every(i => i.resourceFit?.checked === 0) } };
}
export function allCandidateIdeas(intake: IntakeState, coach: CoachState): CandidateIdea[] {
  return evaluateIntakeCandidates(intake, coach, new Date().toISOString()).ideas;
}

/** Catalogue questions with the runtime options the client needs: candidate ideas, industry hints and sector chip sets (spec §6 Phase 1). Options are never persisted. */
export function intakeQuestions(intake: IntakeState, coach: CoachState, ideas = allCandidateIdeas(intake, coach)): IntakeQuestion[] {
  const sector = intakeChipSector(intake, coach);
  // 적용 중인 사업 구조(KSIC/업종 기본값 + 사용자 수정)가 가격 기준과 처리량 단위 순서를 정한다(질문 수·저장 형식은 그대로).
  const structure = effectiveStructure(intake).values;
  // 상세 팩 = 구조(수익 방식) 질문 → 업종 질문. 구조 질문이 손익 계산 입력(변동비·고정비·모델별 지표)을 채운다.
  return [...coreQuestions(intake.mode), ...(intake.detailsRequested ? [...structureQuestions(intake.mode, structure), ...detailQuestions(intake.sector)] : [])]
    .filter(question => question.id !== "candidate" || !coach.fields.some(field => field.key === "business" && field.basis === "user") || !!intake.answers.candidate)
    .map(question => {
      if (question.id === "candidate") {
        // Empty means no candidate survived the same conditions, not an AI success fallback.
        const chosenConditions = intake.answers.conditions?.value;
        const mapEmpty = Array.isArray(chosenConditions) && chosenConditions.length > 0 && !ideas.some(idea => idea.id.startsWith("ksic:"));
        return { ...question, options: ideas.map(idea => ({ value: idea.id, label: idea.title })), ...(!ideas.length ? { hint: "현재 조건에 맞는 후보가 없어요. 시작 조건에서 선택을 다시 확인하거나 생각한 사업을 직접 입력해 주세요." } : mapEmpty ? { hint: "분류 검색에서 조건을 모두 만족하는 후보를 찾지 못했어요. 아래 예시의 확인 필요 조건을 검토해 주세요." } : {}) };
      }
      if (question.id === "industry") return { ...question, options: question.options?.map(option => ({ ...option, hint: INDUSTRY_HINTS[option.value as ProposalSector] ?? option.hint })) };
      if (question.id === "price") {
        // The pricing basis is wording only (spec §4-1): storage stays a coachAmount string under coach.fields.price.
        const period = (structure ? revenueBasis(structure) : null) ?? PRICE_BASIS[sector], options = sectorChipOptions(sector, "price", intake.mode);
        const hint = sector === "software" ? "무료 모델이면 아직 미정을 누르고 과금 기준에서 설명해요." : question.hint;
        return { ...question, period, prompt: pricePrompt(period, intake.mode), ...(hint ? { hint } : {}), ...(options.length ? { options } : {}) };
      }
      // 변동비 문구·단위는 수익 방식(판매 1건·1시간·구독자 1명…)을 따른다. 저장 위치(coach.fields.unitCost)는 같다.
      if (question.id === "structure.unitCost") {
        const base = structureUnitCostQuestion(structure?.revenue);
        // 건당 판매 모델은 바로 앞 가격 질문과 같은 기준(대표 메뉴 1개·상품 1개…)으로 묻는다. 구독·시간제 등은 수익 방식 단위를 따른다.
        const basis = !structure || structure.revenue === "per_unit" || structure.revenue === "mixed" ? (structure ? revenueBasis(structure) : null) ?? PRICE_BASIS[sector] : null;
        return { ...base, ...(basis ? { period: basis, prompt: `${basis}에 들어가는 변동비는 얼마쯤인가요?` } : {}), ...(question.options ? { options: question.options } : {}) };
      }
      if (question.kind !== "text" || question.options?.length) return question;
      const options = sectorChipOptions(sector, question.id, intake.mode);
      if (question.id === "capacity" && structure && options.length) {
        const order = capacityUnitOrder(structure);
        if (order) {
          const rank = (label: string) => { const index = order.indexOf(label); return index < 0 ? order.length : index; };
          return { ...question, options: [...options.filter(option => option.group !== "unit"), ...options.filter(option => option.group === "unit").sort((a, b) => rank(a.label) - rank(b.label))] };
        }
      }
      return options.length ? { ...question, options } : question;
    });
}

export function answeredIntakeQuestion(intake: IntakeState, coach: CoachState, question: IntakeQuestion) {
  if (intake.answers[question.id]) return true;
  return !!question.fieldKey && coach.fields.some(field => field.key === question.fieldKey && field.basis === "user");
}

/**
 * 바뀐 사업 조건을 계획서에 반영할 때 AI 가 다시 쓰는 항목 수 — 다시 쓰기 횟수가 이만큼 차감된다.
 * 직접 고친 항목·잠근 항목·이미 최신인 항목은 다시 쓰지 않는다(제작 접수 화면과 서버 판정이 같은 기준).
 */
export function staleRewriteCount(sections: ServerPlan["sections"], revision: number, keys?: readonly string[]): number {
  return (keys ?? Object.keys(sections)).filter(key => { const value = sections[key]; return !!value && !value.edited && !value.locked && value.coachRevision !== revision; }).length;
}

export function intakeDocumentStatus(plan: Pick<ServerPlan, "sections">, coach: CoachState): NonNullable<IntakeSnapshot["documentStatus"]> {
  const sections = Object.values(plan.sections);
  if (!sections.length) return "none";
  const revision = coachDocumentRevision(coach);
  if (sections.some(section => typeof section.coachRevision === "number" && section.coachRevision !== revision)) return "stale";
  return sections.every(section => section.coachRevision === revision) ? "current" : "unverified";
}

export function intakeSnapshot(plan: ServerPlan, coach: CoachState, intake: IntakeState, resourceAsOf = new Date(Math.max(Date.now(), Date.parse(plan.updatedAt) || 0)).toISOString()): IntakeSnapshot {
  const resources = evaluateIntakeCandidates(intake, coach, resourceAsOf);
  const questions = intakeQuestions(intake, coach, resources.ideas);
  const coreIds = new Set(coreQuestions(intake.mode).map(question => question.id));
  const core = questions.filter(question => coreIds.has(question.id));
  const answered = core.filter(question => answeredIntakeQuestion(intake, coach, question)).length;
  const { receipts: _receipts, ...publicIntake } = intake;
  publicIntake.answers = structuredClone(intake.answers);
  for (const field of coach.fields.filter(item => item.basis === "user")) {
    const id = questions.find(question => question.fieldKey === field.key)?.id ?? (publicIntake.answers[field.key] ? field.key : null);
    if (id) publicIntake.answers[id] = { status: "answered", value: field.value, messageId: field.messageId, at: plan.updatedAt, quote: field.quote };
  }
  const fieldLabels: Partial<Record<string, string>> = structureFieldLabels(effectiveStructure(intake).values);
  const summary: IntakeSnapshot["summary"] = coach.fields.map(field => ({ id: field.key, label: fieldLabels[field.key] ?? COACH_FIELD_LABELS[field.key], value: field.value, basis: field.basis }));
  for (const question of questions) {
    if (question.fieldKey || !intake.answers[question.id] || question.id === "candidate") continue;
    const answer = intake.answers[question.id];
    const value = answer.status === "unknown" ? "아직 미정" : intakeValueLabel(question, answer.value);
    summary.push({ id: question.id, label: question.label, value, basis: "user" });
  }
  return { planId: plan.id, title: plan.title, planType: plan.planType, updatedAt: plan.updatedAt, coach,
    intake: publicIntake, nextQuestion: questions.find(question => !answeredIntakeQuestion(intake, coach, question)) ?? null,
    questions, coreComplete: answered === core.length, coreAnswered: answered, coreTotal: core.length,
    summary, financialSummary: intakeFinancialReference(coach, intake), financialWarning: intakeFinancialWarning(coach, intake), hasDocuments: Object.keys(plan.sections).length > 0, documentStatus: intakeDocumentStatus(plan, coach), rewriteCount: staleRewriteCount(plan.sections, coachDocumentRevision(coach)),
    ksic: intakeKsic(intake), ksicCandidates: intakeKsicCandidates(coach, intake), structure: intakeStructureSnapshot(coach, intake),
    candidateIdeas: resources.ideas,
    resourceAssessment: resources.assessment,
    pendingExtraction: intake.notes.some(note => ["queued", "processing"].includes(note.status)) || intake.candidates.some(candidate => candidate.status === "pending"),
  };
}

/** KSIC 기본값 → 없으면 11업종 기본값 → 사용자 수정을 얹는다. 축별로 어디서 왔는지 함께 돌려준다. */
export function effectiveStructure(intake: Pick<IntakeState, "ksic" | "sector" | "structure">): { values: BusinessStructure; basis: Record<StructureAxis, "user" | "ksic" | "sector"> } {
  const fromKsic = intake.ksic ? ksicStructure(intake.ksic) : undefined;
  const base = fromKsic ?? SECTOR_DEFAULT_STRUCTURE[intake.sector] ?? SECTOR_DEFAULT_STRUCTURE.general;
  // 시장 구조(sides)는 분류 기본값에 거의 없다 — 없으면 한쪽 고객으로 본다
  const values: BusinessStructure = { ...base, sides: base.sides ?? "one" };
  const basis = Object.fromEntries(STRUCTURE_AXES.map(axis => [axis, fromKsic ? "ksic" : "sector"])) as Record<StructureAxis, "user" | "ksic" | "sector">;
  for (const axis of STRUCTURE_AXES) {
    const override = intake.structure?.[axis];
    if (override && override in STRUCTURE_LABELS[axis]) { (values as Record<string, unknown>)[axis] = override; basis[axis] = "user"; }
  }
  return { values, basis };
}

function intakeStructureSnapshot(coach: CoachState, intake: IntakeState): IntakeSnapshot["structure"] {
  const { values, basis } = effectiveStructure(intake);
  return { values, basis, summary: structureSummary(values), licenseHint: licenseHint(values, intake.ksic), fallback: intakeStructureFallback(coach, intake) };
}

/** 사용자가 고른 구조 축을 저장하고 대화 기록에 남긴다. 값은 스키마가 검증했고 여기서는 라벨 존재만 다시 확인한다. */
/** 문서 원천(intake/details)에 들어가는 상세 질문: 구조 팩 + 업종 팩 중 coach 필드가 아닌 것(필드 질문은 coach.fields가 원천). */
function activeDetailQuestions(intake: IntakeState): IntakeQuestion[] {
  return [...structureQuestions(intake.mode, effectiveStructure(intake).values), ...detailQuestions(intake.sector)].filter(question => !question.fieldKey);
}

/** 활성 상세 질문의 답만 문서 원천에 남긴다. 업종·구조가 바뀌어 비활성이 된 답은 질문 기록(intake.answers)에만 남는다. */
function syncIntakeDetails(plan: ServerPlan, intake: IntakeState) {
  plan.answers["intake/details"] = Object.fromEntries(activeDetailQuestions(intake).flatMap(detail => {
    const answer = intake.answers[detail.id];
    if (!answer) return [];
    return [[detail.id, plan.answers["intake/details"]?.[detail.id] ?? { value: answer.value, unit: detail.unit ?? null, period: detail.period ?? null, messageId: answer.messageId, quote: answer.quote ?? displayIntakeValue(answer.value) }]];
  }));
}

/** 진행 중인 작업의 서버 기준 경과 시간. 끝났거나 없으면 null. */
export function intakeJobClock(job: IntakeJob | null | undefined, nowMs: number): IntakeSnapshot["jobClock"] {
  if (!job || !["queued", "running"].includes(job.status)) return null;
  const started = Date.parse(job.createdAt ?? job.updatedAt);
  return { elapsedMs: Number.isFinite(started) ? Math.max(0, nowMs - started) : 0, ...INTAKE_JOB_TIMING[job.kind] };
}

// 처리량 → 월 판매량 환산은 실행 가능성 점검과 함께 쓰므로 coach-feasibility에 둔다.
export { monthlyVolumeFromCapacity };

function validStructureNumber(id: string, value: number): boolean {
  if (!Number.isFinite(value) || value < 0 || value > 1e14) return false;
  if (id === "structure.retentionMonths") return value > 0;
  if (id === "structure.occupancy" || id === "structure.takeRate") return value <= 100;
  if (id === "structure.billableHours") return value <= 168;
  return true;
}

function structureNumber(intake: IntakeState, id: string): number | null {
  const answer = intake.answers[id];
  return answer?.status === "answered" && typeof answer.value === "number" && validStructureNumber(id, answer.value) ? answer.value : null;
}

/**
 * 손익 시나리오 문장. 가격·변동비·고정비(coach 필드)가 모두 있어야 계산하고, 월 판매량은 volume 필드 → 처리량 환산 → 주당 청구 시간 순으로 잡는다.
 * 수익 방식이 라벨·판매량 환산·추가 지표(구독 유지, 이용률, 수수료율, 수주 기간)를 정한다. 추정치는 만들지 않는다.
 */
export type IntakeScenarioInputs = {
  structure: ReturnType<typeof effectiveStructure>["values"]; labels: Record<string, string>;
  unitPrice: number; unitVariableCost: number; monthlyFixedCost: number; volume: number | undefined; notes: string[];
};
/**
 * 손익 계산 입력(가격·변동비·고정비·월 판매량)을 한 곳에서 정한다. 문서 요약·AI 사업안·질문 화면이 같은 숫자를 쓰게 하는 단일 원천.
 * 판매량 우선순위: volume 필드 → (운영 중) 실적 매출 ÷ 기간 ÷ 가격 → (시간제) 주당 청구 시간 → 처리량(최대치, 대여는 이용률 반영).
 * 세 값 중 하나라도 없으면 { missing }을 돌려준다.
 */
export function intakeScenarioInputs(coach: CoachState, intake: IntakeState): IntakeScenarioInputs | { missing: string[]; labels: Record<string, string> } {
  const structure = effectiveStructure(intake).values;
  const labels = { ...COACH_FIELD_LABELS, ...structureFieldLabels(structure) };
  const fields = new Map(coach.fields.map(field => [field.key, field.value]));
  const amount = (key: CoachField["key"]) => coachAmount(fields.get(key));
  const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
  const unitPrice = amount("price"), unitVariableCost = amount("unitCost"), monthlyFixedCost = amount("cost");
  const missing = ([["price", unitPrice], ["unitCost", unitVariableCost], ["cost", monthlyFixedCost]] as const).filter(([, value]) => value == null).map(([key]) => labels[key]);
  if (unitPrice == null || unitVariableCost == null || monthlyFixedCost == null) return { missing, labels };
  const notes: string[] = [];
  let volume: number | undefined;
  const rawVolume = fields.get("volume") ?? "";
  if (/^[\d,]+$/.test(rawVolume)) volume = Number(rawVolume.replace(/,/g, ""));
  // 운영 중 사업: 실적 매출 ÷ 기간(개월) ÷ 가격으로 실제 월 판매량을 잡는다. 처리량(감당 가능한 최대치)을 판매량으로 쓰지 않는다.
  if (volume === undefined && intake.mode === "operating") {
    const sales = amount("sales"), periodValue = intake.answers.period?.value, months = periodMonths(typeof periodValue === "string" ? periodValue : null);
    if (sales != null && months && unitPrice > 0) {
      const perMonth = sales / months;
      volume = Math.round(perMonth / unitPrice);
      notes.push(`실적 기준 판매량: 매출 ${won(sales)} ÷ ${Math.round(months * 10) / 10}개월 ÷ ${labels.price} ${won(unitPrice)} = 월 약 ${volume.toLocaleString("ko-KR")}건`);
      const capacity = monthlyVolumeFromCapacity(fields.get("capacity"));
      if (capacity && capacity.volume > 0) notes.push(volume > capacity.volume
        ? `실적 판매량이 처리량(월 ${capacity.volume.toLocaleString("ko-KR")}${capacity.unit})보다 많습니다. 가격(평균 결제액)이나 처리량 답을 확인해 주세요.`
        : `처리량 월 ${capacity.volume.toLocaleString("ko-KR")}${capacity.unit} 중 약 ${Math.round(volume / capacity.volume * 100)}%를 쓰고 있습니다.`);
    }
  }
  const billable = structure.revenue === "per_hour" ? structureNumber(intake, "structure.billableHours") : null;
  if (volume === undefined && billable != null) { volume = Math.round(billable * 4.3); notes.push(`주 ${billable}시간 청구 × 4.3주 = 월 ${volume}시간`); }
  const occupancy = structure.revenue === "rental" ? structureNumber(intake, "structure.occupancy") : null;
  if (volume === undefined) {
    const capacity = monthlyVolumeFromCapacity(fields.get("capacity"));
    if (capacity) {
      notes.push(capacity.note);
      if (structure.revenue === "rental") {
        if (occupancy == null) notes.push("이용률 미정: 최대 수용량을 예상 판매량으로 확정하지 않습니다. 이용률 또는 월 예상 판매량을 확인해 주세요.");
        else {
          volume = Math.round(capacity.volume * occupancy / 100);
          notes.push(`이용률 ${occupancy}% 반영: 월 ${capacity.volume.toLocaleString("ko-KR")}${capacity.unit} 감당 중 ${volume.toLocaleString("ko-KR")}${capacity.unit} 판매 가정`);
        }
      } else {
        volume = capacity.volume;
        notes.push("판매량은 감당할 수 있는 최대치로 잡았습니다. 실제 판매가 이보다 적으면 이익도 줄어듭니다.");
      }
    }
  } else if (structure.revenue === "rental") notes.push(`입력한 월 예상 판매량 ${volume.toLocaleString("ko-KR")}건 사용: 이용률은 다시 곱하지 않습니다.`);
  return { structure, labels, unitPrice, unitVariableCost, monthlyFixedCost, volume, notes };
}

/**
 * 업종 상세 질문의 숫자를 계산에 쓴다(예전엔 AI 프롬프트에 글로만 전달됐다). 필요한 값이 모두 있을 때만 한 줄씩 만들고, 추정치는 만들지 않는다.
 * 판매량은 손익 계산의 판매량(실적·처리량 기준)을 쓰고, 없으면 처리량(감당 가능한 최대치)으로만 계산한다.
 */
export function intakeDetailChecks(coach: CoachState, intake: IntakeState, scenario: { volume: number; actual: boolean } | null): string[] {
  const detail = (id: string) => { const answer = intake.answers[id]; return answer?.status === "answered" && typeof answer.value === "number" && Number.isFinite(answer.value) && answer.value >= 0 ? answer.value : null; };
  const field = (key: CoachField["key"]) => coach.fields.find(item => item.key === key)?.value;
  const capacity = monthlyVolumeFromCapacity(field("capacity"));
  const volume = scenario?.volume ?? capacity?.volume ?? null;
  const basis = scenario ? (scenario.actual ? "실적 기준" : "계획 판매량 기준") : "처리량 최대치 기준";
  const volumeLabel = scenario ? "판매량" : "처리량";
  const hoursMatch = field("hoursPerWeek")?.replace(/\s|,/g, "").match(/^(?:주)?(\d+(?:\.\d+)?)(?:시간)?$/);
  const monthlyHours = hoursMatch ? Number(hoursMatch[1]) * 52 / 12 : null;
  const budget = coachAmount(field("budget")), unitCost = coachAmount(field("unitCost"));
  const n = (value: number) => Math.round(value).toLocaleString("ko-KR");
  const won = (value: number) => `${n(value)}원`;
  const share = (part: number, whole: number) => `${Math.round(part / whole * 100)}%`;
  const lines: string[] = [];
  const timeLine = (id: string, what: string) => {
    const minutes = detail(id);
    if (minutes == null || !volume) return;
    const hours = volume * minutes / 60;
    const tail = monthlyHours ? `으로, 주당 가능 시간(월 ${n(monthlyHours)}시간)의 ${share(hours, monthlyHours)}입니다${hours > monthlyHours ? `. 가능 시간을 넘으므로 ${volumeLabel}이나 시간을 다시 잡아야 합니다` : ""}` : "입니다";
    lines.push(`- 업종 점검(${basis}): ${what} 월 ${n(volume)}건 × ${n(minutes)}분 = 월 ${n(hours)}시간${tail}.`);
  };
  timeLine("education.sessionMinutes", "수업 시간은");
  timeLine("local_service.travelMinutes", "왕복 이동 시간은");
  timeLine("space_hospitality.turnoverMinutes", "예약 사이 정비 시간은");
  const ceiling = (id: string, perMonth: (value: number) => number, what: string) => {
    const value = detail(id);
    if (value == null || value <= 0 || !volume) return;
    const max = perMonth(value);
    lines.push(`- 업종 점검(${basis}): ${what} 월 최대 약 ${n(max)}건이고, ${volumeLabel} 월 ${n(volume)}건은 그 ${share(volume, max)}입니다${volume > max ? `. 처리 가능한 양을 넘으므로 인력·기간을 다시 잡아야 합니다` : ""}.`);
  };
  ceiling("logistics.dailyShipments", value => value * 26, "배송 가능량(하루 × 월 26일)은");
  ceiling("b2b_service.deliveryDays", value => Math.max(1, Math.floor(30 / value)), "한 번에 한 건씩 진행하면 처리 가능한 프로젝트는");
  ceiling("content_media.productionDays", value => Math.max(1, Math.floor(30 / value)), "한 번에 하나씩 만들면 완성 가능한 납품물은");
  const peak = detail("food_beverage.peakOrders");
  if (peak != null && peak > 0 && volume) lines.push(`- 업종 점검(${basis}): 하루 평균 약 ${n(volume / 26)}건(월 26일 영업), 가장 바쁜 1시간 처리 가능 ${n(peak)}건.`);
  const cashLine = (id: string, what: string) => {
    const quantity = detail(id);
    if (quantity == null || quantity <= 0 || unitCost == null) return;
    const cost = quantity * unitCost;
    lines.push(`- 업종 점검: ${what} ${n(quantity)}개 × 변동비 ${won(unitCost)} = ${won(cost)}${budget ? `, 준비 예산의 ${share(cost, budget)}${cost > budget ? ". 예산보다 많으므로 소량 거래처나 분할 발주를 찾아야 합니다" : ""}` : ""}.`);
  };
  cashLine("retail_commerce.minimumOrder", "최소 발주 금액");
  cashLine("manufacturing.minimumBatch", "1회 최소 생산비");
  const lead = detail("manufacturing.leadDays"), batch = detail("manufacturing.minimumBatch");
  if (lead != null && lead > 0 && batch != null && batch > 0 && unitCost != null) lines.push(`- 업종 점검: 발주 후 납품까지 ${n(lead)}일 동안 1회 생산비 ${won(batch * unitCost)}이 묶입니다. 대금을 받는 시점까지의 운전자금을 따로 확인해야 합니다.`);
  return lines;
}

/** 계획 하나의 손익 참고 문장. 진단 계획이면 실적·처리량을 반영한 intake 계산, 아니면 대화 필드 계산. 모든 소비처가 이 함수를 거친다. */
export function planFinancialReference(coach: CoachState, answers: ServerPlan["answers"]): string {
  const intake = readIntake(answers);
  return intake ? intakeFinancialReference(coach, intake) : coachFinancialReference(coach);
}

/*
 * 계획서를 만들기 전에 숫자부터 바로잡는다. 예전엔 치과를 '건당 15,000원'으로 넣어도 그대로 문서를 만들어,
 * 9개 섹션 내내 "숫자가 안 맞는다"는 말만 반복하는 계획서가 나왔다(운영 2026-09-30).
 * 시작 전 계획(운영 실적이 아닌 값)에서 팔수록 손해이거나, 감당할 수 있는 양을 다 팔아도 본전이 안 되면 한 줄로 알려 준다.
 * 판단만 하고 숫자를 바꾸지는 않는다 — 고칠지는 사용자가 정한다.
 */
export function intakeFinancialWarning(coach: CoachState, intake: IntakeState): { message: string; fields: Array<"price" | "unitCost" | "cost"> } | null {
  if (intake.mode === "operating") return null;
  const inputs = intakeScenarioInputs(coach, intake);
  if ("missing" in inputs) return null;
  const { labels, unitPrice, unitVariableCost, monthlyFixedCost, volume } = inputs;
  const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
  const contribution = unitPrice - unitVariableCost;
  if (unitPrice > 0 && contribution <= 0) return { message: `${labels.price} ${won(unitPrice)}이 ${labels.unitCost} ${won(unitVariableCost)}보다 낮거나 같아서 팔수록 손해예요. 계획서를 만들기 전에 두 값을 다시 확인해 주세요.`, fields: ["price", "unitCost"] };
  if (!volume || contribution <= 0 || monthlyFixedCost <= 0) return null;
  const breakEven = Math.ceil(monthlyFixedCost / contribution);
  if (breakEven <= volume) return null;
  return { message: `지금 ${labels.price} ${won(unitPrice)}와 월 고정비 ${won(monthlyFixedCost)}로는 한 달에 ${breakEven.toLocaleString("ko-KR")}건을 팔아야 본전인데, 감당할 수 있는 양(월 ${volume.toLocaleString("ko-KR")}건)을 넘어요. 가격이 평균 결제액보다 낮게 들어갔거나 고정비가 크게 잡히지 않았는지 확인해 주세요. 맞다면 그대로 진행해도 돼요.`, fields: ["price", "cost"] };
}

export function intakeFinancialReference(coach: CoachState, intake: IntakeState): string {
  const inputs = intakeScenarioInputs(coach, intake);
  if ("missing" in inputs) return [`세 값(${inputs.labels.price}, ${inputs.labels.unitCost}, ${inputs.labels.cost})이 모두 정해진 뒤 손익을 계산합니다. 아직 없는 값: ${inputs.missing.join(", ")}. 미입력 비용은 0원이 아닙니다.`, ...intakeDetailChecks(coach, intake, null)].join("\n");
  const { structure, labels, unitPrice, unitVariableCost, monthlyFixedCost, volume, notes } = inputs;
  const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
  const result = calculateFinancials({ unitPrice, unitVariableCost, monthlyFixedCost, startingVolume: volume, monthlyGrowthPct: 0 });
  const lines = [
    `계획 시나리오 계산(실적 아님). ${STRUCTURE_LABELS.revenue[structure.revenue]} 기준으로 판매량은 매월 동일하다고 가정합니다. 세금·운전자금은 별도 확인 대상이며 아래 영업손익을 현금잔액으로 표현하지 않습니다.`,
    financialsToReference(result),
  ];
  if (volume === undefined) lines.push(`- 월 판매량: 처리량에서 하루·일주일·한 달을 고르면 ${labels.volume}으로 환산해 12개월 손익을 계산합니다.`);
  const retention = structure.revenue === "subscription" ? structureNumber(intake, "structure.retentionMonths") : null;
  if (retention) lines.push(`- 구독 유지 평균 ${retention}개월 → 구독자 1명 생애 매출 ${won(unitPrice * retention)}, 월 이탈률 약 ${Math.round(100 / retention)}%${volume ? `, 구독자 ${volume.toLocaleString("ko-KR")}명 유지에 매달 신규 약 ${Math.ceil(volume / retention).toLocaleString("ko-KR")}명 필요` : ""}`);
  const takeRate = structure.revenue === "commission" ? structureNumber(intake, "structure.takeRate") : null;
  if (takeRate) lines.push(`- 수수료율 ${takeRate}% → 거래 1건 평균 거래액 약 ${won(unitPrice / takeRate * 100)}`);
  if (takeRate === 0) lines.push("- 수수료율 0%: 거래액을 역산하지 않습니다. 입력한 건당 수수료와의 일치 여부를 확인해 주세요.");
  const conversion = structure.revenue === "freemium" ? structureNumber(intake, "structure.conversionRate") : null;
  if (conversion && volume) lines.push(`- 무료→유료 전환율 ${conversion}% → 유료 이용자 ${volume.toLocaleString("ko-KR")}명이 되려면 무료 이용자 약 ${Math.ceil(volume / conversion * 100).toLocaleString("ko-KR")}명이 필요합니다(가정).`);
  const paidShare = structure.revenue === "advertising" ? structureNumber(intake, "structure.paidShare") : null;
  if (paidShare === 0) lines.push("- 광고 외 유료 매출 없음: 이용자가 모이기 전까지 매출이 거의 없습니다. 이용자 확보 기간의 고정비를 준비 예산으로 버틸 수 있는지 먼저 봅니다.");
  const perProvider = structure.revenue === "lead_fee" ? structureNumber(intake, "structure.leadsPerProvider") : null;
  if (perProvider && volume) lines.push(`- 업체 1곳당 월 문의 ${perProvider}건 기준 → 월 문의 ${volume.toLocaleString("ko-KR")}건을 받아 줄 업체 약 ${Math.ceil(volume / perProvider).toLocaleString("ko-KR")}곳이 필요합니다.`);
  const providerMonths = structure.revenue === "listing_fee" ? structureNumber(intake, "structure.providerMonths") : null;
  if (providerMonths && volume) lines.push(`- 업체 평균 유지 ${providerMonths}개월 → 입점 ${volume.toLocaleString("ko-KR")}곳을 유지하려면 매달 새 업체 약 ${Math.ceil(volume / providerMonths).toLocaleString("ko-KR")}곳을 모아야 합니다.`);
  const supply = structure.sides === "two" ? structureNumber(intake, "structure.supplyTarget") : null;
  if (supply && volume) lines.push(`- 양면 시장: 첫 3개월 공급자 ${supply.toLocaleString("ko-KR")}곳 목표 → 공급자 1곳당 월 약 ${Math.round(volume / supply).toLocaleString("ko-KR")}건의 거래가 있어야 이 판매량이 나옵니다.`);
  else if (structure.sides === "two") lines.push("- 양면 시장: 공급자 목표가 정해지지 않았습니다. 공급자 1곳당 거래 수를 확인하기 전까지 판매량은 공급 측이 받쳐 준다는 가정입니다.");
  const cycle = structure.revenue === "project" ? structureNumber(intake, "structure.salesCycleDays") : null;
  if (cycle != null) lines.push(`- 문의→계약 ${cycle}일: 첫 입금은 영업 시작 후 약 ${cycle}일 뒤부터 잡습니다.`);
  return [...lines, ...notes.map(note => `- ${note}`), ...intakeDetailChecks(coach, intake, volume === undefined ? null : { volume, actual: notes.some(note => note.startsWith("실적 기준 판매량")) })].filter(Boolean).join("\n");
}

export function applyIntakeStructure(plan: ServerPlan, coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  const patch = command.structure ?? {};
  const entries = STRUCTURE_AXES.flatMap(axis => { const value = patch[axis]; return value && value in STRUCTURE_LABELS[axis] ? [[axis, value] as const] : []; });
  if (!entries.length) throw new IntakeError("structure_required", "바꿀 사업 구조 항목을 골라 주세요");
  const before = effectiveStructure(intake).values;
  intake.structure = { ...(intake.structure ?? {}), ...Object.fromEntries(entries) };
  const axisLabel: Record<StructureAxis, string> = { payer: "고객·지불자", offering: "제공하는 것", delivery: "전달 방식", revenue: "수익 방식", sides: "시장 구조", license: "인허가" };
  const changes = entries.map(([axis, value]) => `${axisLabel[axis]}: ${(STRUCTURE_LABELS[axis] as Record<string, string>)[before[axis] ?? "one"]} → ${(STRUCTURE_LABELS[axis] as Record<string, string>)[value]}`);
  coach.messages.push({ id: command.requestId, role: "user", text: `사업 구조 수정: ${changes.join(", ")}`, at });
  // 수익 방식이 바뀌면 구조 팩 구성도 바뀌므로 문서 원천의 상세 답을 다시 맞춘다.
  syncIntakeDetails(plan, intake);
}

function intakeKsic(intake: Pick<IntakeState, "ksic">): IntakeSnapshot["ksic"] {
  const entry = intake.ksic ? ksicByCode(intake.ksic) : undefined;
  if (!entry) return null;
  const structure = ksicStructure(entry.code) ?? null;
  return { code: entry.code, name: entry.name, path: ksicPath(entry.code), structure, summary: structure ? structureSummary(structure) : [], licenseHint: structure ? licenseHint(structure, entry.code) : null };
}

/** 확인된 사업 소개·상품 텍스트에서만 KSIC 후보를 찾는다(미확정 제안·메모 제외). 규칙 기반, 최대 4개. */
function intakeKsicCandidates(coach: CoachState, intake: Pick<IntakeState, "answers">): IntakeSnapshot["ksicCandidates"] {
  const texts = ["business", "offer"].flatMap(key => {
    const field = coach.fields.find(item => item.key === key && item.basis === "user");
    if (field?.value.trim()) return [field.value.trim()];
    const answer = intake.answers[key];
    return answer?.status === "answered" && typeof answer.value === "string" && answer.value.trim() ? [answer.value.trim()] : [];
  });
  if (!texts.length) return [];
  return searchKsic(texts.join(" "), { limit: 4, minLevel: 5 }).map(match => ({ code: match.entry.code, name: match.entry.name, path: ksicPath(match.entry.code), sector: sectorForKsic(match.entry.code) ?? "general" }));
}

const COMPOUND_MARKER = /(와|과|랑|및|겸|하면서|하며|같이|함께|동시에|\+|&)/;
/**
 * 구조 기본값을 그대로 믿기 어려운 두 경우. 복합: 사업 소개에 이음말이 있고 분류 검색의 강한 일치(구어 표현 또는 이름 2토큰 이상)가 두 업종 이상에 걸친다.
 * 미분류: 업종을 '새로운 사업·미분류'로 두었고 분류 코드도 없다. 화면은 구조 다섯 축을 직접 고르도록 안내하고, 기본값은 바꾸지 않는다.
 */
export function intakeStructureFallback(coach: CoachState, intake: IntakeState): "unclassified" | "compound" | null {
  const business = coach.fields.find(field => field.key === "business" && field.basis === "user")?.value.trim() ?? "";
  if (!business) return null;
  if (COMPOUND_MARKER.test(business)) {
    const sectors = new Set(searchKsic(business, { limit: 6, minLevel: 5 }).filter(match => match.via === "synonym" || match.score >= 24).map(match => sectorForKsic(match.entry.code)).filter(sector => sector && sector !== "general"));
    if (sectors.size >= 2) return "compound";
  }
  return !intake.ksic && intake.sector === "general" && (intake.mode === "exploring" || !!intake.answers.industry) ? "unclassified" : null;
}

export function displayIntakeValue(value: IntakeValue): string {
  return Array.isArray(value) ? value.join(", ") : value === null ? "" : String(value);
}

/** Option labels for choice answers; multi answers map each selected value. Falls back to the raw value. */
export function intakeValueLabel(question: Pick<IntakeQuestion, "options">, value: IntakeValue): string {
  const label = (item: string) => question.options?.find(option => option.value === item)?.label ?? item;
  return Array.isArray(value) ? value.map(label).join(", ") : value === null ? "" : label(String(value));
}

export function intakeFieldRevision(coach: CoachState, intake: Pick<IntakeState, "mode" | "answers">, key: CoachField["key"]): string | null {
  const field = coach.fields.find(item => item.key === key);
  if (field) return field.messageId || null;
  const question = coreQuestions(intake.mode).find(item => item.fieldKey === key);
  return intake.answers[question?.id ?? key]?.messageId ?? null;
}

function validatedAnswer(question: IntakeQuestion, value: IntakeValue | undefined): IntakeValue {
  if (value === undefined || value === null || !displayIntakeValue(value).trim()) throw new IntakeError("answer_required", "답을 입력하거나 아직 미정을 선택해 주세요");
  if (displayIntakeValue(value).length > 1200) throw new IntakeError("answer_too_long", "답변은 1,200자 이내로 입력해 주세요. 긴 내용은 자유 메모에 보관할 수 있어요");
  if (question.kind !== "multi" && Array.isArray(value)) throw new IntakeError(question.kind === "number" ? "invalid_number" : "invalid_answer", "이 질문에는 하나의 답변을 입력해 주세요");
  if (question.id === "budget" || question.id === "hoursPerWeek") {
    const parsed = parseResourceLimit(value, question.id === "budget" ? "initialCost" : "weeklyOperatingHours");
    if (parsed.status === "invalid" || parsed.status === "missing") throw new IntakeError("invalid_number", "단위와 기간에 맞는 값을 입력해 주세요");
    // Ranges remain ranges; rejected units remain in the recoverable client draft.
    if (parsed.status !== "known" || parsed.lower !== parsed.upper) return String(value).trim();
    return parsed.lower;
  }
  if (question.id === "period") {
    const dates = String(value).match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    const valid = dates.length === 2 && dates.every(date => {
      const time = Date.parse(`${date}T00:00:00Z`);
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
    });
    if (!valid || dates[0] > dates[1]) throw new IntakeError("invalid_period", "실적 기간의 시작일과 종료일을 YYYY-MM-DD / YYYY-MM-DD 형식으로 확인해 주세요");
    return `${dates[0]} / ${dates[1]}`;
  }
  if (question.kind === "single") {
    if (!question.options?.some(option => option.value === value)) throw new IntakeError("invalid_option", "현재 질문의 선택지를 골라 주세요");
    return value;
  }
  if (question.kind === "multi") {
    if (!Array.isArray(value) || !value.length || value.some(item => !question.options?.some(option => option.value === item))) throw new IntakeError("invalid_option", "현재 질문의 선택지를 골라 주세요");
    return [...new Set(value)];
  }
  if (question.kind === "number") {
    const raw = String(value).trim();
    const number = question.unit === "원" ? coachAmount(raw) : new RegExp(`^\\d+(?:\\.\\d+)?(?:\\s*${question.unit ?? ""})?$`).test(raw) ? Number.parseFloat(raw) : undefined;
    if (number === undefined || !Number.isFinite(number) || number < 0 || number > 1e14 || question.unit === "%" && number > 100 || question.fieldKey === "hoursPerWeek" && number > 168) throw new IntakeError("invalid_number", "단위에 맞는 0 이상의 숫자를 입력해 주세요. 모르는 값은 미정으로 남겨 주세요");
    if (question.id.startsWith("structure.") && !validStructureNumber(question.id, number)) throw new IntakeError("invalid_number", question.id === "structure.retentionMonths" ? "평균 구독 유지 기간은 0보다 큰 개월 수로 입력해 주세요" : "해당 지표의 범위에 맞는 숫자를 입력해 주세요");
    return number;
  }
  return String(value).trim();
}

function setField(coach: CoachState, key: CoachField["key"], value: string | null, messageId: string, quote: string) {
  const fields = coach.fields.filter(field => field.key !== key);
  if (value !== null) fields.push({ key, value, basis: "user", messageId, quote });
  coach.fields = fields;
  if (key === "business") {
    coach.business.description = value ?? "";
    if (value && (!coach.business.name || ["새 사업 구상", "새 사업 진단"].includes(coach.business.name))) coach.business.name = value.slice(0, 60);
    if (value && !coach.ideaOrigin) coach.ideaOrigin = { text: value, messageId };
  }
}

export function intakeBusinessFingerprint(coach: CoachState, answers: ServerPlan["answers"], intake = readIntake(answers)) {
  const valueOnly = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const record = input as Record<string, unknown>;
    return { value: record.value ?? null, unit: record.unit ?? null, period: record.period ?? null, basis: record.basis ?? "user", quote: record.quote ?? "" };
  };
  return JSON.stringify({ stage: coach.stage, depth: coach.depth, business: coach.business,
    resources: intakeResourceSource(coach, intake, intake ? effectiveStructure(intake).values : undefined),
    fields: [...coach.fields].sort((a, b) => a.key.localeCompare(b.key)).map(({ key, value, basis, quote }) => ({ key, value, basis, quote })),
    details: Object.fromEntries(Object.entries(answers["intake/details"] ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, valueOnly(value)])), period: valueOnly(answers["intake/period"]) });
}

export function storeIntakeNote(coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  if (!command.message) throw new IntakeError("message_required", "남길 내용을 입력해 주세요");
  const chunks = command.message.match(/[\s\S]{1,4000}/g) ?? [];
  if (intake.notes.length + chunks.length > 64 || intake.notes.reduce((sum, note) => sum + note.text.length, 0) + command.message.length > 100_000) throw new IntakeError("notes_limit", "메모가 많아요. 저장된 내용을 정리한 뒤 이어가 주세요", 413);
  intake.notes.push(...chunks.map((text, index) => ({ id: `${command.requestId}:${index}`, text, at, status: "stored" as const, intent: command.noteIntent ?? "memo" as const })));
  coach.messages.push({ id: command.requestId, role: "user", text: command.message, at });
}

export function applyIntakeAnswer(plan: ServerPlan, coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  const id = command.questionId;
  if (id === "candidate" && typeof command.value === "string" && command.value.includes(":idea:")) {
    const proposal = intake.generatedIdeas?.find(idea => idea.id === command.value && idea.planId === plan.id);
    if (!proposal) throw new IntakeError("candidate_unknown", "이 사업에서 생성한 후보를 다시 확인해 주세요", 404);
    if (proposal.rejected || proposal.baseInputRevision !== (intake.ideaInputRevision ?? 0)) throw new IntakeError("candidate_stale", "후보 생성 후 입력 조건이 바뀌었어요. 최신 조건으로 제안을 다시 요청해 주세요", 409);
  }
  const questions = intakeQuestions(intake, coach);
  const question = questions.find(item => item.id === id)
    ?? (id === "business" || id === "industry" || id === "budget" || id === "hoursPerWeek" ? getIntakeQuestion("startup", intake.sector, id) : undefined);
  if (!question) throw new IntakeError("question_unknown", "이 사업의 질문을 다시 불러와 주세요");
  const previousAnswer = intake.answers[question.id];
  const value = command.unknown ? null : validatedAnswer(question, command.value);
  const quote = displayIntakeValue(command.value ?? null);
  intake.answers[question.id] = { status: command.unknown ? "unknown" : "answered", value, messageId: command.requestId, at, quote };
  if (question.fieldKey) setField(coach, question.fieldKey, value === null ? null : `${displayIntakeValue(value)}${question.kind === "number" && typeof value === "number" ? question.unit ?? "" : ""}`, command.requestId, quote);
  if (question.id === "industry") {
    // KSIC 세세분류가 함께 오면 그것이 업종의 근거다. 11업종 값은 코드에서 확인하고 어긋나면 코드 쪽을 따른다.
    const ksic = command.ksic ? ksicByCode(command.ksic) : undefined;
    if (command.ksic && (!ksic || ksic.level !== 5)) throw new IntakeError("invalid_ksic", "표준산업분류 코드를 다시 확인해 주세요");
    const ksicSector = ksic ? sectorForKsic(ksic.code) : undefined;
    const sector = value === null ? "general" : (ksicSector ?? value) as ProposalSector;
    intake.sector = sector;
    intake.ksic = ksic && value !== null ? ksic.code : null;
    coach.business.industry = value === null ? "" : intakeSectorOptions.find(option => option.value === sector)?.label ?? String(sector);
    if (ksic && value !== null) intake.answers[question.id] = { ...intake.answers[question.id], value: sector, quote: `${ksic.name} (KSIC ${ksic.code})` };
  }
  if (question.id === "candidate" && value !== null) {
    const idea = allCandidateIdeas(intake, coach).find(item => item.id === value);
    if (!idea) throw new IntakeError("candidate_unknown", "현재 사업 후보를 다시 확인해 주세요");
    // 지도 후보는 공식 이름이 사업 소개가 되고 코드가 업종·구조의 근거가 된다. 템플릿 후보는 설명 문장이 사업 소개다.
    const ksicCode = idea.id.startsWith("ksic:") ? idea.id.slice(5) : null;
    setField(coach, "business", ksicCode ? idea.title : idea.description, command.requestId, `선택한 구상: ${idea.title}`);
    coach.business.name = idea.title; coach.business.nameConfirmed = false; intake.sector = idea.sector; intake.ksic = ksicCode;
    const { resourceFit: _fit, retained: _retained, ...selected } = idea;
    intake.selectedCandidate = selected;
    coach.business.industry = intakeSectorOptions.find(option => option.value === idea.sector)?.label ?? idea.sector;
    if (idea.source === "ai-generated") {
      const proposal = intake.generatedIdeas!.find(item => item.id === idea.id)!;
      intake.structure = { ...proposal.proposedStructure };
      // Selection confirms the displayed proposal, not invented budgets or an industry code.
      for (const [key, text] of [["customer",proposal.customer],["problem",proposal.problem],["offer",proposal.offering],["channel",proposal.delivery]] as const) setField(coach,key,text,command.requestId,`사용자가 선택한 AI 후보: ${proposal.title}`);
      coach.business.industry = "";
      delete intake.answers.industry;
    }
  }
  if (question.id === "candidate" && value === null && coach.fields.some(field => field.key === "business" && field.messageId === previousAnswer?.messageId)) {
    delete intake.selectedCandidate;
    setField(coach, "business", null, command.requestId, "");
    coach.business.name = "새 사업 구상"; coach.business.nameConfirmed = false;
    intake.sector = "general"; intake.ksic = null; coach.business.industry = "";
  }
  if (question.id === "industry" || question.id === "candidate") syncIntakeDetails(plan, intake);
  if (question.id === "period") plan.answers["intake/period"] = { value, basis: "user", messageId: command.requestId };
  if (activeDetailQuestions(intake).some(item => item.id === question.id)) plan.answers["intake/details"] = { ...(plan.answers["intake/details"] ?? {}), [question.id]: { value, unit: question.unit ?? null, period: question.period ?? null, messageId: command.requestId, quote } };
  coach.stage = intake.mode === "operating" ? "operating" : coach.fields.some(field => field.key === "business" && field.basis === "user") ? "startup" : "exploring";
  coach.business.stage = coach.stage === "operating" ? "운영 중" : "사업 기획";
  coach.ready = coach.stage !== "exploring" && !!coach.fields.find(field => field.key === "business" && field.basis === "user")?.value;
  const shown = question.id === "industry" && intake.answers[question.id]?.status === "answered" ? intake.answers[question.id].value : value;
  const selected = question.options && shown !== null ? intakeValueLabel(question, shown) : undefined;
  const ksicName = question.id === "industry" && intake.ksic ? ksicByCode(intake.ksic)?.name : undefined;
  coach.messages.push({ id: command.requestId, role: "user", text: `${question.label}: ${command.unknown ? "아직 미정" : ksicName ? `${ksicName} (${selected ?? quote})` : selected ?? quote}`, at });
  // Supplementary prose stays an unconfirmed note, in the same atomic answer save.
  if (command.message?.trim()) storeIntakeNote(coach, intake, { ...command, requestId: `${command.requestId}:context`, noteIntent: "memo" }, at);
}

export function applyIntakeCandidates(coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  const accept = new Set(command.candidateIds ?? []), reject = new Set(command.rejectIds ?? []), overwrite = new Set(command.overwriteIds ?? []);
  if ([...accept].some(id => reject.has(id))) throw new IntakeError("candidate_choice", "같은 내용은 반영과 제외 중 하나만 선택해 주세요");
  const selected: IntakeCandidate[] = [...accept, ...reject].map(id => {
    const candidate = intake.candidates.find(item => item.id === id && item.status === "pending");
    if (!candidate) throw new IntakeError("candidate_unknown", "이미 처리한 정리 결과예요. 최신 내용을 확인해 주세요", 409);
    return candidate;
  });
  const keys = selected.filter(candidate => accept.has(candidate.id)).map(candidate => candidate.fieldKey);
  if (new Set(keys).size !== keys.length) throw new IntakeError("ambiguous_candidate", "같은 항목에는 하나의 값만 선택해 주세요");
  for (const candidate of selected) {
    if (!accept.has(candidate.id)) continue;
    const current = coach.fields.find(field => field.key === candidate.fieldKey)?.value ?? null;
    const edited = candidate.baseFieldRevision !== undefined && intakeFieldRevision(coach, intake, candidate.fieldKey) !== candidate.baseFieldRevision;
    if ((current !== candidate.baseValue || edited) && current !== candidate.value && !overwrite.has(candidate.id)) throw new IntakeError("candidate_conflict", "정리하는 동안 직접 바꾼 항목이 있어요. 현재 값과 비교한 뒤 반영해 주세요", 409);
  }
  for (const candidate of selected) {
    if (!accept.has(candidate.id)) { candidate.status = "rejected"; continue; }
    setField(coach, candidate.fieldKey, candidate.value, candidate.noteId, candidate.quote);
    const question = coreQuestions(intake.mode).find(item => item.fieldKey === candidate.fieldKey);
    if (question) intake.answers[question.id] = { value: candidate.value, status: "answered", messageId: candidate.noteId, at, quote: candidate.quote };
    candidate.status = "applied";
  }
  coach.stage = intake.mode === "operating" ? "operating" : coach.fields.some(field => field.key === "business" && field.basis === "user") ? "startup" : "exploring";
  coach.business.stage = coach.stage === "operating" ? "운영 중" : "사업 기획";
  coach.ready = coach.stage !== "exploring" && !!coach.fields.find(field => field.key === "business" && field.basis === "user")?.value;
}

export function finishIntakeMutation(coach: CoachState, before: string, answers: ServerPlan["answers"], intake = readIntake(answers)) {
  const changed = before !== intakeBusinessFingerprint(coach, answers, intake);
  const documentRevision = coachDocumentRevision(coach);
  coach.revision += 1;
  coach.documentRevision = documentRevision + Number(changed);
  if (changed) {
    if (coach.directAction) coach.directAction = { ...coach.directAction, needsReview: true };
  }
  return changed;
}
