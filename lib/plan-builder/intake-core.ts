import { freeReflectsLeft } from "./free-reflect";
import { monthDaysFromFields, operatingDaysValue } from "./operating-days";
import { chaptersForType, sectionKey } from "./blueprint";
import { cashflowFromFields, cashflowReference, cashflowScenariosEnabled, cashflowShapeFor, type CashflowShape, fixedCostAssumptionReference, fixedCostAssumptionsFromFields, implausibleMoneyFromFields, implausibleMoneyReference } from "./cashflow-scenarios";
import { COACH_FIELD_LABELS } from "./coach-presentation";
import { coachAmount, coachAmountLower, monthlyVolumeFromCapacity } from "./coach-feasibility";
import { coachDocumentRevision, coachFinancialReference, type CoachField, type CoachState } from "./coach";
import { calculateFinancials, financialsToReference } from "./financials";
import { acceptsFreeChoice, FREE_CHOICE_MAX_CHARS, amountCheckPrompt, coreQuestions, detailQuestions, getIntakeQuestion, intakeCandidates, intakeSectorOptions, pricePrompt, structureQuestions, structureUnitCostQuestion, type IntakeMode, type IntakeQuestion } from "./intake-questions";
import { INDUSTRY_HINTS, PRICE_BASIS, amountRanges, periodMonths, rangeMidpoint, scaledAmountRanges, sectorChipOptions } from "./intake-options";
import { descriptionSector } from "./intake-sector";
import { estimateIntake, type KindRules } from "./intake-estimate";
import { playbookForKsic, playbookForText, salesRoute } from "./industry-playbooks";
import { businessTypeFor } from "./business-types";
import { KSIC_SYNONYMS, ksicByCode, ksicEntries, ksicPath, ksicStructure, normalize as normalizeKsic, searchKsic, sectorForKsic } from "./ksic";
import { ksicSectorLabel } from "./ksic-hints";
import { START_CONDITIONS, operatingBudget } from "./intake-questions";
import { CONDITION_DIFFERS_NOTE, candidateTemplateFacts, filterCandidateConditions, selectedStartConditions } from "./intake-candidate-constraints";
import { capacityUnitOrder, licenseHint, revenueBasis, SECTOR_DEFAULT_STRUCTURE, STRUCTURE_AXES, STRUCTURE_LABELS, structureFieldLabels, structureSummary, type BusinessStructure, type StructureAxis } from "./business-structure";
import { PROPOSAL_SECTORS, type ProposalSector } from "./proposal-blueprint";
import { INTAKE_KEY, INTAKE_VERSION, type IntakeCandidate, type IntakeCommand, type IntakeJob, type IntakeSnapshot, type IntakeState, type IntakeValue } from "./intake-types";
import type { ServerPlan } from "./plan-server-store";
import { loadResourceRecords, RESOURCE_DATA_VERSION, RESOURCE_ANSWER_IDS, resourceBusinessAssumptions, type ResourceRecord } from "./intake-candidate-resources";
import { evaluateCandidateResources, parseResourceLimit } from "./intake-candidate-fit";
import { rangeLowerText, stripAnswerPeriod } from "./answer-number";
import { generatedIdeaStructure } from "./intake-ideas";
import { INTAKE_JOB_TIMING } from "./intake-timing";
export { INTAKE_JOB_TIMING } from "./intake-timing";
import { intakeResourceSource } from "./intake-resource-context";
import { withRo } from "../josa";

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

/** 같은 세분류(코드 앞 4자리) 안에서 이름의 앞이나 뒤 두 낱말 이상이 같으면 거의 같은 업종으로 보고 앞(순위가 높은) 것만 남긴다. */
function nearDuplicateKsic(a: string, b: string): boolean {
  const left = a.split(/[\s,]+/).filter(Boolean), right = b.split(/[\s,]+/).filter(Boolean);
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(left.length, right.length) && left[prefix] === right[prefix]) prefix++;
  while (suffix < Math.min(left.length, right.length) && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix++;
  return prefix >= 2 || suffix >= 2;
}
function distinctKsic<T extends { entry: { code: string; name: string } }>(items: T[]): T[] {
  const kept: T[] = [];
  for (const item of items) if (!kept.some(other => other.entry.code.slice(0, 4) === item.entry.code.slice(0, 4) && nearDuplicateKsic(other.entry.name, item.entry.name))) kept.push(item);
  return kept;
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
  // 이름만 조금 다른 같은 업종(유선·모바일·기타 게임 소프트웨어 개발 및 공급업)은 하나만 보인다 — 비슷한 카드가 줄지어 있으면 고를 게 없어 보인다.
  const scored = entirePool ? distinctKsic([...matched, ...common, ...rest]) : distinctKsic([...matched, ...distinctKsic(common.length ? common : rest).slice(0, matched.length ? KSIC_FILLER_LIMIT_WITH_MATCHES : KSIC_CANDIDATE_LIMIT)]).slice(0, KSIC_CANDIDATE_LIMIT);
  return scored.map(({ entry, structure, match, terms }) => {
    const sector = sectorForKsic(entry.code) ?? "general";
    const term = match ? matchedSynonym(entry.code, experience) : undefined;
    const reasons = [
      ...(match ? [term ? `적어 주신 경험의 "${term}"과 이어지는 업종이에요` : "적어 주신 경험과 이름이 비슷한 업종이에요"] : []),
      ...(sectors.includes(sector) ? [`고르신 관심 분야: ${intakeSectorOptions.find(option => option.value === sector)?.label ?? sector}`] : []),
      ...(chosen.length ? [`고르신 조건에 맞아요: ${chosen.join(", ")}`] : []),
      // 공식 이름이 낯설어서 흔히 부르는 말을 함께 보여 준다(예: 기타 미용업 ← 네일, 왁싱).
      ...(terms.length ? [`흔히 부르는 말: ${terms.slice(0, 3).join(", ")}`] : []),
    ];
    return { id: `ksic:${entry.code}`, title: entry.name, sector, description: structureSummary(structure).join(" · "), reasons,
      cautions: [licenseHint(structure, entry.code) ?? "필요한 신고·허가는 구청 등 담당 기관에 확인해 보세요.", "업종 목록에서 고른 예시예요. 실제로 찾는 사람이 있는지, 돈이 되는지는 아직 알 수 없어요."] };
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
  const pool = collected.flatMap(idea => {
    const kept = filterCandidateConditions(idea, idea.source === "ai-generated" ? idea.proposedStructure ?? {} : idea.id.startsWith("ksic:") ? ksicStructure(idea.id.slice(5)) ?? {} : candidateTemplateFacts(idea.id), conditions);
    // 이 사업을 위해 AI가 만든 제안은 화면에 보이는 한 고를 수 있어야 한다(예전엔 시작 조건과 다르면 보기에서 빠져 '저장 실패'만 떴다). 다르다는 것만 알린다.
    return kept.length || idea.source !== "ai-generated" ? kept : [{ ...idea, cautions: [...idea.cautions, CONDITION_DIFFERS_NOTE] }];
  });
  const limits = resourceLimitsFor(intake, coach);
  const data = loadResourceRecords([...records, ...intake.resourceQuotes ?? []]).filter(r => r.candidateId !== "custom-business" || r.businessDescription === coach.business.description);
  const structure = effectiveStructure(intake).values, business = resourceBusinessAssumptions(coach);
  const assess = (idea: CandidateIdea): CandidateIdea => {
    const proposal = intake.generatedIdeas?.find(item => item.id === idea.id);
    const unselected = proposal && intake.selectedCandidate?.id !== idea.id;
    return { ...idea, resourceFit: evaluateCandidateResources(idea.id, limits, intake.resourceContext, asOf, data, unselected ? generatedIdeaStructure(proposal) : structure, unselected ? { description: proposal.description, customer: proposal.customer, offer: proposal.offering, channel: proposal.delivery } : business) };
  };
  const evaluated = pool.map(assess);
  // AI 제안은 예산·시간을 넘어도 목록에서 빼지 않는다 — 카드가 보이는데 고를 수 없으면 안 된다. 넘는다는 안내는 카드에 그대로 보인다.
  const available = evaluated.filter(i => i.resourceFit?.status !== "exceeded" || i.source === "ai-generated");
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
  const excluded = evaluated.filter(i => !available.includes(i));
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
        return { ...question, options: ideas.map(idea => ({ value: idea.id, label: idea.title })), ...(!ideas.length ? { hint: "고르신 조건에 맞는 사업을 찾지 못했어요. 시작 조건을 바꾸거나 생각한 사업을 직접 적어 주세요." } : mapEmpty ? { hint: "고르신 조건에 딱 맞는 업종은 찾지 못했어요. 아래 예시 중 가까운 걸 고르거나 생각한 사업을 직접 적어 주세요." } : {}) };
      }
      // 이미 운영 중인 가게로 읽혔으면 준비 예산을 창업 준비금이 아니라 '이번에 새로 해 볼 일에 쓸 돈'으로 묻는다
      if (question.id === "budget" && intake.running && intake.mode === "startup") return { ...question, prompt: operatingBudget.prompt, hint: operatingBudget.hint };
      if (question.id === "industry") return { ...question, options: question.options?.map(option => ({ ...option, hint: INDUSTRY_HINTS[option.value as ProposalSector] ?? option.hint })) };
      if (question.id === "price") {
        // The pricing basis is wording only (spec §4-1): storage stays a coachAmount string under coach.fields.price.
        const period = (structure ? revenueBasis(structure) : null) ?? PRICE_BASIS[sector], options = sectorChipOptions(sector, "price", intake.mode);
        const hint = sector === "software" ? "무료 모델이면 ‘아직 정하지 않았어요’를 누르고 과금 기준에서 설명해요." : question.hint;
        return { ...question, period, prompt: pricePrompt(period, intake.mode), ...(hint ? { hint } : {}), ...(options.length ? { options } : {}) };
      }
      // 변동비 문구·단위는 수익 방식(판매 1건·1시간·이용자 1명…)을 따른다. 저장 위치(coach.fields.unitCost)는 같다.
      if (question.id === "structure.unitCost") {
        const base = structureUnitCostQuestion(structure?.revenue);
        // 건당 판매 모델은 바로 앞 가격 질문과 같은 기준(대표 메뉴 1개·상품 1개…)으로 묻는다. 구독·시간제 등은 수익 방식 단위를 따른다.
        const basis = !structure || structure.revenue === "per_unit" || structure.revenue === "mixed" ? (structure ? revenueBasis(structure) : null) ?? PRICE_BASIS[sector] : null;
        // 화면 질문은 '변동비' 대신 쉬운 말로 — 메뉴·상품을 파는 업종은 재료비·포장비, 그 밖은 재료비·외주비(여정 점검 2026-10-23)
        const costWords = ["food_beverage", "retail_commerce", "manufacturing"].includes(sector) ? "재료비·포장비" : "재료비·외주비";
        return { ...base, ...(basis ? { period: basis, prompt: `${basis}에 드는 ${costWords} 같은 비용은 얼마쯤인가요?` } : {}), ...(question.options ? { options: question.options } : {}) };
      }
      if (question.kind !== "text" || question.options?.length) return question;
      // 세부 업종을 이미 골랐으면 업종 전체 보기는 맞지 않는다(요양 시설을 골랐는데 네일·꽃집) — 보기 없이 적게 둔다
      if (question.id === "business" && intake.ksic) { const { hint: _hint, ...plain } = question; return plain; }
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

/** 이 계획서 유형의 항목 중 아직 본문이 없는 항목 수 */
function missingSectionCount(plan: ServerPlan): number {
  return chaptersForType(plan.planType).reduce((total, chapter) => total + chapter.sections.filter(section => !plan.sections[sectionKey(chapter.id, section.id)]).length, 0);
}

/*
 * 아직 정한 사업이 없으면(탐색 · '살펴볼 사업'을 '잘 모르겠어요'로 넘김) 그 사업의 고객·가격·월세 질문은 뒤로 미룬다 — 사업 정하기가 먼저다
 * (2026-11-16 점검: 정해지지 않은 사업의 질문 8개를 다 답한 뒤에야 '사업 하나만 정하면 시작할 수 있어요'가 나왔다).
 * 다음 질문 · 진행 수에서만 뺀다(답은 그대로 받는다). 사업을 고르거나 직접 적으면 다시 이어서 묻는다.
 */
export function deferredIntakeQuestionIds(intake: Pick<IntakeState, "mode">, coach: Pick<CoachState, "fields">, questions: readonly IntakeQuestion[]): Set<string> {
  if (intake.mode !== "exploring" || coach.fields.some(field => field.key === "business" && field.basis === "user")) return new Set();
  const cut = questions.findIndex(question => question.id === "candidate");
  return new Set(cut < 0 ? [] : questions.slice(cut + 1).map(question => question.id));
}

export function intakeSnapshot(plan: ServerPlan, coach: CoachState, intake: IntakeState, resourceAsOf = new Date(Math.max(Date.now(), Date.parse(plan.updatedAt) || 0)).toISOString()): IntakeSnapshot {
  const resources = evaluateIntakeCandidates(intake, coach, resourceAsOf);
  const questions = intakeQuestions(intake, coach, resources.ideas);
  const deferred = deferredIntakeQuestionIds(intake, coach, questions);
  const coreIds = new Set(coreQuestions(intake.mode).map(question => question.id));
  const core = questions.filter(question => coreIds.has(question.id) && !deferred.has(question.id));
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
    intake: publicIntake, nextQuestion: questions.find(question => !deferred.has(question.id) && !answeredIntakeQuestion(intake, coach, question)) ?? null,
    questions, coreComplete: answered === core.length, coreAnswered: answered, coreTotal: core.length,
    summary, financialSummary: intakeFinancialReference(coach, intake), financialWarning: intakeFinancialWarning(coach, intake), hasDocuments: Object.keys(plan.sections).length > 0, documentStatus: intakeDocumentStatus(plan, coach), rewriteCount: staleRewriteCount(plan.sections, coachDocumentRevision(coach)), freeReflects: freeReflectsLeft(plan.answers.__coach_generation), missingSections: missingSectionCount(plan),
    ksic: intakeKsic(intake), ksicCandidates: intakeKsicCandidates(coach, intake), structure: intakeStructureSnapshot(coach, intake),
    sectorSuggestion: intakeSectorSuggestion(plan, coach, intake),
    candidateIdeas: resources.ideas,
    resourceAssessment: resources.assessment,
    pendingExtraction: intake.notes.some(note => ["queued", "processing"].includes(note.status)) || intake.candidates.some(candidate => candidate.status === "pending"),
  };
}

/*
 * 대표가 상품·가격을 말한 방식이 업종 기본 청구 방식과 다르면 대표 말을 따른다(대표가 구조를 직접 고르면 그것이 더 앞선다).
 * 2026-11-25 0원 점검: 과외(교육 기본값 '월 정기 결제')에 '1:1 회화 60분 / 40,000원'이라고 답했는데 월 이용료 4만원으로 계산돼 매출이 약 4배 작게 잡혔다.
 * 콘텐츠 대행(기본값 '프로젝트')에 '월 12회 게시물 / 30만원'이라고 답했는데 건당 판매처럼 계산됐다.
 * - 한 번(회 · 분 · 시간) 단위로 말했으면 월 정기 결제 대신 건당 결제
 * - 한 달 단위(월 ○회 · 매달 · 월 계약 · 구독)로 말했으면 건당 · 프로젝트 대신 월 정기 결제
 * 플랫폼 · 앱 청구 방식(수수료 · 광고 등)은 건드리지 않는다.
 */
export function revenueFromFounderWords(base: BusinessStructure["revenue"], answers: IntakeState["answers"] | undefined): BusinessStructure["revenue"] {
  const text = (["offer", "price"] as const).map(id => { const answer = answers?.[id]; return answer?.status === "answered" ? `${answer.quote ?? ""} ${typeof answer.value === "string" ? answer.value : ""}` : ""; }).join(" ");
  if (!text.trim()) return base;
  const monthly = /(?:월|매달|한\s*달)\s*\d+\s*(?:회|번|건|개)|월\s*(?:정기|계약|구독|관리)|매달|구독|정기\s*(?:결제|관리|계약)/.test(text);
  const perSession = /\d+\s*분(?!기)|회당|1\s*회\b|시간당|\d+\s*시간\s*(?:수업|레슨|강의|상담|촬영)|1\s*:\s*1\s*[가-힣]*\s*\d+\s*분/.test(text);
  if (base === "subscription" && perSession && !monthly) return "per_unit";
  if ((base === "project" || base === "per_unit") && monthly && !perSession) return "subscription";
  return base;
}

/** KSIC 기본값 → 없으면 11업종 기본값 → 사용자 수정을 얹는다. 축별로 어디서 왔는지 함께 돌려준다. */
export function effectiveStructure(intake: Pick<IntakeState, "ksic" | "sector" | "structure"> & { answers?: IntakeState["answers"] }): { values: BusinessStructure; basis: Record<StructureAxis, "user" | "ksic" | "sector"> } {
  const fromKsic = intake.ksic ? ksicStructure(intake.ksic) : undefined;
  const base = fromKsic ?? SECTOR_DEFAULT_STRUCTURE[intake.sector] ?? SECTOR_DEFAULT_STRUCTURE.general;
  // 시장 구조(sides)는 분류 기본값에 거의 없다 — 없으면 한쪽 고객으로 본다
  const values: BusinessStructure = { ...base, sides: base.sides ?? "one", revenue: revenueFromFounderWords(base.revenue, intake.answers) };
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
  /**
   * 판매량이 어디서 왔는지. "capacity"는 감당할 수 있는 최대치라 판매 예상이 아니다 —
   * 새로 시작하는 사업의 요약·첫 달 문장에 판매량으로 쓰지 않는다(2026-10-22 캔들 스토어: 하루 20개 × 26일 = 520건을 첫 달 판매로 적음).
   */
  volumeSource?: "volume" | "actual" | "hours" | "capacity" | "occupancy";
  /** 온라인으로 파는 사업인지 — 돈 장이 '스토어 공개 전/후'로 쓴다 */
  online: boolean;
  /** 돈 장의 사업 모양(매장을 빌리는지·구매 주기·부가세 면세 가능성) — 업종에 맞지 않는 매장 문장을 끈다(계획서 품질 Q7) */
  shape: CashflowShape;
};

/**
 * 온라인으로 파는 사업인지(택배 판매·앱·중개). business-launch.ts의 businessProfile과 같은 규칙:
 * 업종 코드 또는 사업 설명으로 업종 가이드를 찾고, 직접 고른 구조 → 설명 → 가이드 → 기본 구조 순으로 사업 유형을 정한다.
 * 만들어 보내는 형(ship)은 판매 채널을 답했으면 온라인 스토어·택배로 팔 때만 온라인으로 본다(2026-11-17: 맘카페·당근마켓으로 주문받아
 * 동네에 직접 배달하는 반찬 정기배송에 '스토어 공개'·'스토어 판매·결제 수수료'가 나왔다). 채널을 답하지 않았으면 예전처럼 온라인으로 본다.
 */
export function intakeSellsOnline(coach: Pick<CoachState, "business" | "fields">, intake: Pick<IntakeState, "ksic" | "sector" | "structure">): boolean {
  const { typeId, described } = intakeBusinessType(coach, intake);
  if (typeId !== "ship") return !!typeId && ["app", "platform"].includes(typeId);
  const route = salesRoute({ channel: coach.fields.find(field => field.key === "channel")?.value, description: described });
  return route === "online-store" || route === "unknown";
}

/** 사업 유형(business-types.ts)과 그 판정에 쓴 사업 설명 — 온라인 여부와 돈 장의 사업 모양이 같은 판정을 쓴다 */
function intakeBusinessType(coach: Pick<CoachState, "business" | "fields">, intake: Pick<IntakeState, "ksic" | "sector" | "structure">) {
  const value = (key: string) => coach.fields.find(field => field.key === key)?.value ?? "";
  const described = [coach.business.description, value("business"), value("offer")].filter(Boolean).join(" ");
  const customer = value("customer") || null;
  const playbook = intake.ksic ? playbookForKsic(intake.ksic) : playbookForText(described, { customer });
  const effective = effectiveStructure(intake);
  const chosen = Object.fromEntries(STRUCTURE_AXES.flatMap(axis => effective.basis[axis] === "user" && effective.values[axis] ? [[axis, effective.values[axis]]] : [])) as Partial<BusinessStructure>;
  const typed = businessTypeFor({ chosen, description: described, customer: customer ?? undefined, playbookId: playbook?.id, structure: effective.values });
  return { typeId: typed?.type.id ?? null, described, structure: effective.values };
}

/** 돈 장의 사업 모양 — 구조 값·사업 유형·사업 설명(집에서·과외 등)으로 정한다(cashflow-scenarios.ts cashflowShapeFor) */
export function intakeCashflowShape(coach: Pick<CoachState, "business" | "fields">, intake: Pick<IntakeState, "ksic" | "sector" | "structure">): CashflowShape {
  const { typeId, described, structure } = intakeBusinessType(coach, intake);
  return cashflowShapeFor({ typeId, structure, description: described, online: !!typeId && ["ship", "app", "platform"].includes(typeId) });
}
/**
 * 손익 계산 입력(가격·변동비·고정비·월 판매량)을 한 곳에서 정한다. 문서 요약·AI 사업안·질문 화면이 같은 숫자를 쓰게 하는 단일 원천.
 * 판매량 우선순위: volume 필드 → (운영 중) 실적 매출 ÷ 기간 ÷ 가격 → (시간제) 주당 청구 시간 → 처리량(최대치, 대여는 이용률 반영).
 * 세 값 중 하나라도 없으면 { missing }을 돌려준다.
 */
export function intakeScenarioInputs(coach: CoachState, intake: IntakeState): IntakeScenarioInputs | { missing: string[]; labels: Record<string, string> } {
  const structure = effectiveStructure(intake).values;
  const labels = { ...COACH_FIELD_LABELS, ...structureFieldLabels(structure) };
  const fields = new Map(coach.fields.map(field => [field.key, field.value]));
  const monthDays = monthDaysFromFields(coach.fields);
  const amount = (key: CoachField["key"]) => coachAmount(fields.get(key));
  const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
  const unitPrice = amount("price"), unitVariableCost = amount("unitCost"), monthlyFixedCost = amount("cost");
  const missing = ([["price", unitPrice], ["unitCost", unitVariableCost], ["cost", monthlyFixedCost]] as const).filter(([, value]) => value == null).map(([key]) => labels[key]);
  if (unitPrice == null || unitVariableCost == null || monthlyFixedCost == null) return { missing, labels };
  const notes: string[] = [];
  let volume: number | undefined;
  let volumeSource: IntakeScenarioInputs["volumeSource"];
  const rawVolume = fields.get("volume") ?? "";
  if (/^[\d,]+$/.test(rawVolume)) { volume = Number(rawVolume.replace(/,/g, "")); volumeSource = "volume"; }
  // 운영 중 사업: 실적 매출 ÷ 기간(개월) ÷ 가격으로 실제 월 판매량을 잡는다. 처리량(감당 가능한 최대치)을 판매량으로 쓰지 않는다.
  if (volume === undefined && intake.mode === "operating") {
    const sales = amount("sales"), periodValue = intake.answers.period?.value, months = periodMonths(typeof periodValue === "string" ? periodValue : null);
    if (sales != null && months && unitPrice > 0) {
      const perMonth = sales / months;
      volume = Math.round(perMonth / unitPrice); volumeSource = "actual";
      notes.push(`실적 기준 판매량: 매출 ${won(sales)} ÷ ${Math.round(months * 10) / 10}개월 ÷ ${labels.price} ${won(unitPrice)} = 월 약 ${volume.toLocaleString("ko-KR")}건`);
      const capacity = monthlyVolumeFromCapacity(fields.get("capacity"), monthDays);
      if (capacity && capacity.volume > 0) notes.push(volume > capacity.volume
        ? `실적 판매량이 처리량(월 ${capacity.volume.toLocaleString("ko-KR")}${capacity.unit})보다 많습니다. 가격(평균 결제액)이나 처리량 답을 확인해 주세요.`
        : `처리량 월 ${capacity.volume.toLocaleString("ko-KR")}${capacity.unit} 중 약 ${Math.round(volume / capacity.volume * 100)}%를 쓰고 있습니다.`);
    }
  }
  const billable = structure.revenue === "per_hour" ? structureNumber(intake, "structure.billableHours") : null;
  if (volume === undefined && billable != null) { volume = Math.round(billable * 4.3); volumeSource = "hours"; notes.push(`주 ${billable}시간 청구 × 4.3주 = 월 ${volume}시간`); }
  const occupancy = structure.revenue === "rental" ? structureNumber(intake, "structure.occupancy") : null;
  if (volume === undefined) {
    const capacity = monthlyVolumeFromCapacity(fields.get("capacity"), monthDays);
    if (capacity) {
      notes.push(capacity.note);
      if (structure.revenue === "rental") {
        if (occupancy == null) notes.push("이용률 미정: 최대 수용량을 예상 판매량으로 확정하지 않습니다. 이용률 또는 월 예상 판매량을 확인해 주세요.");
        else {
          volume = Math.round(capacity.volume * occupancy / 100); volumeSource = "occupancy";
          notes.push(`이용률 ${occupancy}% 반영: 월 ${capacity.volume.toLocaleString("ko-KR")}${capacity.unit} 감당 중 ${volume.toLocaleString("ko-KR")}${capacity.unit} 판매 가정`);
        }
      } else {
        volume = capacity.volume; volumeSource = "capacity";
        notes.push("판매량은 감당할 수 있는 최대치로 잡았습니다. 실제 판매가 이보다 적으면 이익도 줄어듭니다.");
      }
    }
  } else if (structure.revenue === "rental") notes.push(`입력한 월 예상 판매량 ${volume.toLocaleString("ko-KR")}건 사용: 이용률은 다시 곱하지 않습니다.`);
  return { structure, labels, unitPrice, unitVariableCost, monthlyFixedCost, volume, notes, volumeSource, online: intakeSellsOnline(coach, intake), shape: intakeCashflowShape(coach, intake) };
}

/**
 * 돈 장 계산(cashflow-scenarios.ts)에 넘길 값 — 운영 중인 사업이면 지금 실적의 한 달 판매량을 함께 넘긴다(2026-11-16: 운영 중 사업도 새 돈 흐름 표).
 * 실적 판매량은 '실적 매출 ÷ 기간 ÷ 가격'(actual)이나 직접 적은 월 판매량(volume)일 때만 — 처리량(최대치)은 실적이 아니다.
 */
export function intakeCashflowMoney(intake: Pick<IntakeState, "mode">, inputs: IntakeScenarioInputs) {
  const { unitPrice, unitVariableCost, monthlyFixedCost, online, shape } = inputs;
  const actual = inputs.volumeSource === "actual" || inputs.volumeSource === "volume" ? inputs.volume : undefined;
  return { unitPrice, unitVariableCost, monthlyFixedCost, online, shape, ...(intake.mode === "operating" ? { operating: { actualVolume: actual } } : {}) };
}

/**
 * 업종 상세 질문의 숫자를 계산에 쓴다(예전엔 AI 프롬프트에 글로만 전달됐다). 필요한 값이 모두 있을 때만 한 줄씩 만들고, 추정치는 만들지 않는다.
 * 판매량은 손익 계산의 판매량(실적·처리량 기준)을 쓰고, 없으면 처리량(감당 가능한 최대치)으로만 계산한다.
 */
export function intakeDetailChecks(coach: CoachState, intake: IntakeState, scenario: { volume: number; actual: boolean } | null): string[] {
  const detail = (id: string) => { const answer = intake.answers[id]; return answer?.status === "answered" && typeof answer.value === "number" && Number.isFinite(answer.value) && answer.value >= 0 ? answer.value : null; };
  const field = (key: CoachField["key"]) => coach.fields.find(item => item.key === key)?.value;
  const monthDays = monthDaysFromFields(coach.fields);
  const capacity = monthlyVolumeFromCapacity(field("capacity"), monthDays);
  const volume = scenario?.volume ?? capacity?.volume ?? null;
  // 예약·수업처럼 물건을 팔지 않는 사업은 '판매량·처리량' 대신 건수로 쓴다(계획서 품질 Q9 — 네일·과외 계산 자료에 물건 판매 말)
  const service = ["visits", "enroll"].includes(intakeCashflowShape(coach, intake).cycle);
  const basis = scenario ? (scenario.actual ? "실적 기준" : service ? "계획 건수 기준" : "계획 판매량 기준") : service ? "받을 수 있는 최대 건수 기준" : "처리량 최대치 기준";
  const volumeLabel = scenario ? (service ? "계획 건수" : "판매량") : service ? "받을 수 있는 건수" : "처리량";
  // 예산·시간을 범위로 남겼으면 적은 쪽으로 계산한다(보수적)
  const hoursText = field("hoursPerWeek");
  const hoursMatch = (rangeLowerText(hoursText) ?? hoursText)?.replace(/\s|,/g, "").match(/^(?:주)?(\d+(?:\.\d+)?)(?:시간)?$/);
  const monthlyHours = hoursMatch ? Number(hoursMatch[1]) * 52 / 12 : null;
  const budget = coachAmountLower(field("budget")), unitCost = coachAmount(field("unitCost"));
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
  ceiling("logistics.dailyShipments", value => value * monthDays, `배송 가능량(하루 × 월 ${monthDays}일)은`);
  ceiling("b2b_service.deliveryDays", value => Math.max(1, Math.floor(30 / value)), "한 번에 한 건씩 진행하면 처리 가능한 프로젝트는");
  ceiling("content_media.productionDays", value => Math.max(1, Math.floor(30 / value)), "한 번에 하나씩 만들면 완성 가능한 납품물은");
  const peak = detail("food_beverage.peakOrders");
  if (peak != null && peak > 0 && volume) lines.push(`- 업종 점검(${basis}): 하루 평균 약 ${n(volume / monthDays)}건(월 ${monthDays}일 영업), 가장 바쁜 1시간 처리 가능 ${n(peak)}건.`);
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
  if ("missing" in inputs) {
    // 월 고정비만 모르면 세 가지 고정비 가정으로 본전 판매량을 보여 준다(가정 표시, cashflow-scenarios.ts)
    const assumed = intake.mode !== "operating" ? fixedCostAssumptionsFromFields(coach.fields) : null;
    return [`세 값(${inputs.labels.price}, ${inputs.labels.unitCost}, ${inputs.labels.cost})이 모두 정해진 뒤 손익을 계산합니다. 아직 없는 값: ${inputs.missing.join(", ")}. 미입력 비용은 0원이 아닙니다.`, ...(assumed ? [fixedCostAssumptionReference(assumed)] : []), ...intakeDetailChecks(coach, intake, null)].join("\n");
  }
  const { structure, labels, unitPrice, unitVariableCost, monthlyFixedCost, volume, notes, online, shape } = inputs;
  const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
  // 돈 입력이 실제 금액으로 보기 어려우면 그 금액으로 만든 숫자(본전·통장 흐름·업종 점검의 예산 비율)를 넘기지 않는다 — 돈 장의 빈 틀과 같은 판정
  const implausible = implausibleMoneyFromFields(coach.fields);
  if (implausible.length) return implausibleMoneyReference(implausible, { unitPrice, unitVariableCost });
  // 돈 장(cashflow-scenarios.ts): 최대치 판매량 대신 세 경우의 결론 숫자를 넘긴다 — 운영 중인 사업은 지금 실적에서 시작한다(2026-11-16)
  const flow = cashflowScenariosEnabled() ? cashflowFromFields(coach.fields, intakeCashflowMoney(intake, inputs)) : null;
  const result = calculateFinancials({ unitPrice, unitVariableCost, monthlyFixedCost, startingVolume: volume, monthlyGrowthPct: 0 });
  const lines = flow ? [cashflowReference(flow, { basis: `${STRUCTURE_LABELS.revenue[structure.revenue]} 기준` })] : [
    `계획 시나리오 계산(실적 아님). ${STRUCTURE_LABELS.revenue[structure.revenue]} 기준으로 판매량은 매월 동일하다고 가정합니다. 세금·운전자금은 별도 확인 대상이며 아래 영업손익을 현금잔액으로 표현하지 않습니다.`,
    financialsToReference(result),
  ];
  if (volume === undefined && !flow) lines.push(`- 월 판매량: 처리량에서 하루·일주일·한 달을 고르면 ${labels.volume}으로 환산해 12개월 손익을 계산합니다.`);
  const retention = structure.revenue === "subscription" ? structureNumber(intake, "structure.retentionMonths") : null;
  if (retention) lines.push(`- 이용 기간 평균 ${retention}개월 → 이용자 1명 생애 매출 ${won(unitPrice * retention)}, 월 이탈률 약 ${Math.round(100 / retention)}%${volume ? `, 이용자 ${volume.toLocaleString("ko-KR")}명 유지에 매달 신규 약 ${Math.ceil(volume / retention).toLocaleString("ko-KR")}명 필요` : ""}`);
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
  // 온라인 판매는 '영업일'이 아니라 만드는·보내는 날 — 처리량 환산 문구를 맞춘다(2026-10-22 캔들 스토어 '월 26일 영업')
  // 월 등록 사업은 '일주일 6명 × 4.3주'가 등록 인원이 아니다 — 돈 계산이 동시에 맡는 인원으로 따로 쓴다(계획서 품질 Q7)
  const shownNotes = (flow ? notes.filter(note => !note.startsWith("판매량은 감당할 수 있는 최대치") && !(flow.shape.cycle === "enroll" && /× 월 (?:4\.3주|\d+일)/.test(note))) : notes).map(note => online ? note.replace(/월 (\d+)일 영업/g, "월 $1일 작업") : note);
  return [...lines, ...shownNotes.map(note => `- ${note}`), ...intakeDetailChecks(coach, intake, volume === undefined || inputs.volumeSource === "capacity" ? null : { volume, actual: inputs.volumeSource === "actual" })].filter(Boolean).join("\n");
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

/**
 * 고른 업종과 사업 설명이 어긋나는지(규칙, AI 0회). 설명이 다른 업종 말(스마트스토어·쇼핑몰, 카페, 학원 …)을 분명히 담고 있고,
 * 사용자가 표준산업분류를 직접 고르지 않았고, 이 설명으로 아직 확인하지 않았을 때만 제안한다. 계획서를 만든 뒤에는 묻지 않는다.
 * 낱말 규칙이 업종을 못 찾으면 사업 설명으로 찾은 분류 후보(구어 표현 일치)가 가리키는 업종을 쓴다(후보끼리 업종이 갈리면 묻지 않는다).
 */
export function intakeSectorSuggestion(plan: Pick<ServerPlan, "sections">, coach: CoachState, intake: IntakeState): IntakeSnapshot["sectorSuggestion"] {
  const business = coach.fields.find(field => field.key === "business" && field.basis === "user")?.value.trim() ?? "";
  const industry = intake.answers.industry;
  if (!business || industry?.status !== "answered" || intake.ksic || intake.sector === "general" || Object.keys(plan.sections).length) return null;
  if (intake.sectorCheck?.business === business) return null;
  // 업종을 사용자가 고른 게 아니라 기준표가 채운 것이면 묻지 않는다 — 자기가 짐작한 업종을 다시 바꾸자고 하게 된다(과외 매칭 → 소프트웨어로 채우고 '교육으로 정리할까요?')
  if (industry.messageId.endsWith(ESTIMATE_SUFFIX)) return null;
  let suggested = descriptionSector(business);
  if (suggested === "general") {
    // 구어 표현으로 찾은 분류 후보가 모두 한 업종일 때만(필라테스 → 체육시설·사진 촬영처럼 갈리면 묻지 않는다)
    const sectors = new Set(searchKsic(business, { limit: 4, minLevel: 5 }).filter(match => match.via === "synonym").map(match => sectorForKsic(match.entry.code) ?? "general"));
    if (sectors.size === 1) suggested = [...sectors][0];
  }
  if (suggested === "general" || suggested === intake.sector) return null;
  const label = (sector: ProposalSector) => intakeSectorOptions.find(option => option.value === sector)?.label ?? sector;
  return { sector: suggested, label: label(suggested), current: label(intake.sector) };
}

/** 업종 확인 질문 — 화면의 확인 카드와 서버가 멈춰 세울 때(sector_check) 같은 문장을 쓴다 */
export function sectorCheckPrompt(suggestion: NonNullable<IntakeSnapshot["sectorSuggestion"]>): string {
  return `업종을 ${withRo(suggestion.label)} 바꿀까요?`;
}

/*
 * 업종 확인이 남아 있으면 다음 질문의 답을 받지 않는다(2026-10-28 재측정: '기업 서비스'를 고른 뒤 '수제 도시락 가게'를 적었는데
 * 확인 없이 다음 질문으로 넘어가 손님 불편 선택지가 기업 서비스용으로 나오고 계획서까지 갔다). 화면은 다음 질문 전에 [바꾸기]/[그대로 둘게요]를
 * 먼저 보여 주므로 보통은 여기까지 오지 않는다 — 예전 화면·직접 호출도 같은 규칙으로 멈춘다. 업종·사업 설명 고치기와 이미 답한 질문 고치기는 막지 않는다.
 */
export function assertSectorChecked(plan: Pick<ServerPlan, "sections">, coach: CoachState, intake: IntakeState, command: IntakeCommand) {
  const id = command.questionId;
  if (!id || id === "industry" || id === "business" || intake.answers[id]) return;
  const suggestion = intakeSectorSuggestion(plan, coach, intake);
  if (suggestion) throw new IntakeError("sector_check", sectorCheckPrompt(suggestion), 422);
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
    // 무엇이 틀렸는지 알 수 있게 질문마다 예시를 든다(2026-11-16 점검: '단위와 기간에 맞는 값'만으로는 고칠 곳을 몰랐다)
    if (parsed.status === "invalid" || parsed.status === "missing") throw new IntakeError("invalid_number", question.id === "budget" ? "준비 예산은 '300만원'이나 '100만원~300만원'처럼 금액 하나나 범위 하나로 적어 주세요" : "일주일에 쓸 시간은 '20시간'처럼 168시간 안에서 적어 주세요");
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
    if (!valid || dates[0] > dates[1]) throw new IntakeError("invalid_period", "기간은 위 단추(지난달 · 최근 3개월 등)에서 고르거나 2026-01-01 / 2026-03-31처럼 적어 주세요");
    return `${dates[0]} / ${dates[1]}`;
  }
  const allowed = (item: unknown) => question.options?.some(option => option.value === item)
    || acceptsFreeChoice(question) && typeof item === "string" && !!item.trim() && item.trim().length <= FREE_CHOICE_MAX_CHARS;
  if (question.kind === "single") {
    if (!allowed(value)) throw new IntakeError("invalid_option", "보기에 있는 것 중에서 다시 골라 주세요");
    return String(value).trim();
  }
  if (question.kind === "multi") {
    if (!Array.isArray(value) || !value.length || value.length > 8 || value.some(item => !allowed(item))) throw new IntakeError("invalid_option", "보기에 있는 것 중에서 다시 골라 주세요");
    return [...new Set(value.map(item => String(item).trim()))];
  }
  if (question.kind === "number") {
    // 질문 기간과 같은 말('월 30만', '30만원/월')은 떼고 읽는다
    const raw = stripAnswerPeriod(String(value).trim(), question.period);
    const number = question.unit === "원" ? coachAmount(raw) : new RegExp(`^\\d+(?:\\.\\d+)?(?:\\s*${question.unit ?? ""})?$`).test(raw) ? Number.parseFloat(raw) : undefined;
    if (number === undefined || !Number.isFinite(number) || number < 0 || number > 1e14 || question.unit === "%" && number > 100 || question.fieldKey === "hoursPerWeek" && number > 168) throw new IntakeError("invalid_number", "단위에 맞는 0 이상의 숫자를 입력해 주세요. 모르는 값은 미정으로 남겨 주세요");
    if (question.id.startsWith("structure.") && !validStructureNumber(question.id, number)) throw new IntakeError("invalid_number", question.id === "structure.retentionMonths" ? "평균 이용 기간은 0보다 큰 개월 수로 입력해 주세요" : "해당 지표의 범위에 맞는 숫자를 입력해 주세요");
    return number;
  }
  // 사업 소개는 글자가 있어야 한다 — 이모지·기호만 적어도 사업으로 저장되던 문제(2026-11-16 점검)
  if (question.id === "business" && !/[\p{L}\p{N}]/u.test(String(value))) throw new IntakeError("answer_letters", "어떤 사업인지 글로 적어 주세요. 예: 퇴근 후 동네에서 수제 쿠키 팔기");
  return String(value).trim();
}

/*
 * 금액 범위 칩('100만원 미만')을 누르거나 그대로 적은 답 — 계산에는 범위 가운데 값을 쓰고, 대화에는 고른 범위 그대로 보인다
 * (2026-11-16 점검: 운영 중 사업에서 '100만원 미만'을 고르면 '50만원'으로 정한 것처럼 보였다). 화면과 같은 범위 표(intake-options)를 본다. 범위가 아니면 undefined.
 */
export function amountRangeAnswer(intake: Pick<IntakeState, "sector" | "answers" | "mode">, coach: Pick<CoachState, "fields">, question: Pick<IntakeQuestion, "id" | "kind" | "unit" | "options">, value: IntakeValue | undefined): number | undefined {
  // 준비 예산은 범위를 범위대로 남긴다(적은 쪽으로 계산 — validatedAnswer)
  if (question.kind !== "number" || question.unit !== "원" || question.id === "budget" || typeof value !== "string") return undefined;
  const label = value.replace(/\s+/g, "");
  if (!/[~～〜–]|미만$|이상$/.test(label)) return undefined;
  const period = intake.answers.period?.value, months = question.id === "sales" ? periodMonths(typeof period === "string" ? period : null) : null;
  const sector = intakeChipSector(intake, coach);
  // 가격 기준(시간당 · 1박 …)마다 범위 표가 다르다 — 기준 칩이 있는 질문은 모든 기준의 표에서 찾는다
  const bases = [undefined, ...(question.options ?? []).map(option => option.label)];
  for (const basis of bases) {
    const ladder = amountRanges(sector, question.id, intake.mode, basis);
    const range = (months && months > 1 ? scaledAmountRanges(ladder, months) : ladder).find(item => item.label.replace(/\s+/g, "") === label);
    if (range) return range.max === 0 ? 0 : rangeMidpoint(range);
  }
  return undefined;
}

/** 사업 설명으로 만든 임시 이름은 60자 안에서 낱말 경계로 자르고 '…'을 붙인다 — 글자 가운데(이모지 반쪽)에서 끊기지 않게 글자 단위로 센다 */
export function autoBusinessName(value: string, limit = 60): string {
  const chars = Array.from(value.trim());
  if (chars.length <= limit) return chars.join("");
  const head = chars.slice(0, limit - 1).join("");
  const space = head.search(/\s\S*$/);
  return `${(space > limit / 2 ? head.slice(0, space) : head).replace(/[\s,·]+$/, "")}…`;
}

/** 길게 적은 사업 문장으로 붙이는 임시 제목 — 첫 구절만, 24자까지(문장 전체가 제목 칸을 덮던 문제 2026-11-14). 적은 문장 자체는 대화와 사업 설명에 그대로 남는다 */
export const draftNameFromIdea = (value: string) => autoBusinessName(value.trim().split(/[.!?\n]/)[0] || value, 24);

function setField(coach: CoachState, key: CoachField["key"], value: string | null, messageId: string, quote: string, basis: CoachField["basis"] = "user") {
  const fields = coach.fields.filter(field => field.key !== key);
  if (value !== null) fields.push({ key, value, basis, messageId, quote });
  coach.fields = fields;
  if (key === "business") {
    coach.business.description = value ?? "";
    if (value && (!coach.business.name || ["새 사업 구상", "새 사업 진단", "새 사업"].includes(coach.business.name))) coach.business.name = draftNameFromIdea(value);
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

function answerQuestionFor(intake: IntakeState, coach: CoachState, id: string | undefined) {
  return intakeQuestions(intake, coach).find(item => item.id === id)
    ?? (id === "business" || id === "industry" || id === "budget" || id === "hoursPerWeek" ? getIntakeQuestion("startup", intake.sector, id) : undefined);
}

/*
 * 사용자가 직접 적은 금액이 현실 범위 밖이면(생활비 3,000원 등) 확인 없이 저장하지 않는다 — 화면은 같은 질문을 한 번 더 묻고
 * [맞아요]를 누르면 confirmed로 다시 보낸다. 화면이 먼저 묻지 못한 경우(예전 화면·직접 호출)에도 서버가 같은 규칙으로 멈춘다.
 * 자원 조건 입력·AI 제안 반영은 이 길을 거치지 않는다(사용자가 직접 고른 값의 확인이라 answer에만 건다).
 */
export function assertAmountConfirmed(intake: IntakeState, coach: CoachState, command: IntakeCommand) {
  if (command.unknown || command.confirmed) return;
  const question = answerQuestionFor(intake, coach, command.questionId);
  const value = question ? amountRangeAnswer(intake, coach, question, command.value) ?? command.value : command.value;
  const prompt = amountCheckPrompt(question, value) ?? marginCheckPrompt(question, value, coach);
  if (prompt) throw new IntakeError("amount_check", prompt, 422);
}

/**
 * 한 개에 드는 비용이 가격과 같거나 크면 한 번 묻는다(2026-11-14 전문가 방식 점검: 가격 15,000원 · 비용 30,000원이 그대로 통과해 팔수록 손해인 계획서가 만들어졌다).
 * 금액 확인과 같은 길([맞아요]로 확인하면 그대로 받는다)이라 막지는 않는다.
 */
function marginCheckPrompt(question: ReturnType<typeof answerQuestionFor>, value: IntakeCommand["value"], coach: CoachState): string | null {
  if (!question || question.fieldKey !== "price" && question.fieldKey !== "unitCost" || value === null || value === undefined || Array.isArray(value)) return null;
  const amount = typeof value === "number" ? value : coachAmount(value);
  // 상대 값이 업종 기준값(제안)이면 묻지 않는다 — 사용자가 적지 않은 숫자를 근거로 되물으면 헷갈린다. 둘 다 직접 적었을 때만
  const other = coachAmount(coach.fields.find(field => field.key === (question.fieldKey === "price" ? "unitCost" : "price") && field.basis === "user")?.value);
  if (!amount || !other) return null;
  const price = question.fieldKey === "price" ? amount : other, unitCost = question.fieldKey === "price" ? other : amount;
  return unitCost >= price ? `한 개에 드는 비용(${unitCost.toLocaleString("ko-KR")}원)이 가격(${price.toLocaleString("ko-KR")}원)보다 ${unitCost === price ? "같아요" : "커요"}. 이대로면 팔수록 손해예요. 맞나요?`.replace("보다 같아요", "과 같아요") : null;
}

export function applyIntakeAnswer(plan: ServerPlan, coach: CoachState, intake: IntakeState, command: IntakeCommand, at: string) {
  const id = command.questionId;
  if (id === "candidate" && typeof command.value === "string" && command.value.includes(":idea:")) {
    const proposal = intake.generatedIdeas?.find(idea => idea.id === command.value && idea.planId === plan.id);
    if (!proposal) throw new IntakeError("candidate_unknown", "이 사업에서 받은 제안이 맞는지 다시 확인해 주세요", 404);
    if (proposal.rejected || proposal.baseInputRevision !== (intake.ideaInputRevision ?? 0)) throw new IntakeError("candidate_stale", "제안을 받은 뒤 조건이 바뀌었어요. 바뀐 조건으로 다시 제안받아 주세요", 409);
  }
  const question = answerQuestionFor(intake, coach, id);
  if (!question) throw new IntakeError("question_unknown", "이 사업의 질문을 다시 불러와 주세요");
  const previousAnswer = intake.answers[question.id];
  const ranged = command.unknown ? undefined : amountRangeAnswer(intake, coach, question, command.value);
  const value = command.unknown ? null : validatedAnswer(question, ranged ?? command.value);
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
    // 사업 설명을 안 뒤에 업종을 다시 고르면 그것이 확인이다 — 같은 설명으로 다시 묻지 않는다
    const business = coach.fields.find(field => field.key === "business" && field.basis === "user")?.value.trim();
    if (business) intake.sectorCheck = { business, decision: "changed" };
  }
  if (question.id === "candidate" && value !== null) {
    const idea = allCandidateIdeas(intake, coach).find(item => item.id === value);
    if (!idea) throw new IntakeError("candidate_unknown", "고른 사업을 다시 확인해 주세요");
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
  const selected = question.options && shown !== null && ranged === undefined ? intakeValueLabel(question, shown) : undefined;
  const ksicName = question.id === "industry" && intake.ksic ? ksicByCode(intake.ksic)?.name : undefined;
  coach.messages.push({ id: command.requestId, role: "user", text: `${question.label}: ${command.unknown ? "아직 미정" : ksicName ? `${ksicName} (${ksicSectorLabel(intake.ksic, intake.sector, selected ?? quote)})` : selected ?? quote}`, at });
  // Supplementary prose stays an unconfirmed note, in the same atomic answer save.
  if (command.message?.trim()) storeIntakeNote(coach, intake, { ...command, requestId: `${command.requestId}:context`, noteIntent: "memo" }, at);
}

const ESTIMATE_SUFFIX = ":estimate";
/*
 * 첫 문장 읽기의 짐작(applyGuessed)은 '요청번호:guess:estimate' — 끝이 :estimate 라 화면 · 다른 규칙에는 채운 값(제안)으로 보이고,
 * 낱말 기준표는 이 칸을 다시 채우지 않는다(업종을 고를 때 이 사업에 맞춘 짐작이 업종 고정값으로 덮이지 않게, 2026-11-17).
 */
const GUESS_ESTIMATE = `:guess${ESTIMATE_SUFFIX}`;

/**
 * 제목이 아직 문장 앞부분(임시 제목)이면 기준표가 찾은 이름으로 바꾼다 — 사용자가 적은 띄어쓰기대로('강아지 수제 간식').
 * 두 글자 이름('과외' · '캔들')은 제목으로 너무 짧고, 'X에서 팔아요'의 X(플리마켓 · 인스타)는 파는 곳이지 사업 이름이 아니다 — 그때는 문장 앞부분을 둔다.
 */
export function nameFromKind(coach: CoachState, business: string, word: string | null, offer = "") {
  if (!word || coach.business.nameConfirmed || coach.business.name !== draftNameFromIdea(business)) return;
  const pattern = Array.from(word.replace(/\s/g, "")).map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
  // 문장에 그대로 없으면 그 줄의 파는 것에서 띄어쓰기를 가져온다('원두판매' → '커피 원두 판매'의 '원두 판매')
  const spaced = business.match(new RegExp(pattern, "i"))?.[0] ?? offer.match(new RegExp(pattern, "i"))?.[0] ?? word;
  const place = new RegExp(`${pattern}(?:(?:\\s*[,·/]\\s*|(?:와|과|랑|이랑)\\s*)[가-힣a-z0-9]+?)*에서(?:\\s|$)`, "i").test(business);
  if (!place && Array.from(spaced.replace(/\s/g, "")).length >= 3) coach.business.name = spaced;
}

/**
 * 한 문장만 받은 새 사업의 나머지 핵심 질문을 자체 기준표(intake-estimate)로 채운다 — 묻지 않고 바로 초안으로 간다.
 * 채운 값은 '제안'이라 사용자가 답하면 그 답이 이긴다. 예산·주당 시간은 개인 사정이라 짐작하지 않는다 — 문장에 적혀 있을 때만 쓰고 아니면 '미정'으로 둔다.
 * 문서를 쓰기 전에는 사업 문장이 바뀌면 지난 짐작도 새 문장을 따라 바뀐다. 쓴 뒤에는 건드리지 않는다.
 */
export function applyIntakeEstimates(plan: ServerPlan, coach: CoachState, intake: IntakeState, requestId: string, at: string, rules?: KindRules) {
  const business = coach.fields.find(field => field.key === "business" && field.basis === "user")?.value.trim();
  // '아이디어를 찾고 있어요'로 들어와 사업 후보를 고른 뒤도 같다(2026-11-14) — 고른 후보의 업종을 그대로 쓰고 문장에서 다시 짐작하지 않는다. 일반 방식이 이 경로에서도 전문가와 똑같이 13개를 묻던 문제
  const picked = intake.mode === "exploring" && !!intake.selectedCandidate;
  if (intake.mode !== "startup" && !picked || !business) return;
  const messageId = `${requestId}${ESTIMATE_SUFFIX}`, drafted = Object.keys(plan.sections).length > 0;
  const open = (id: string) => { const answer = intake.answers[id]; return !answer || !drafted && answer.messageId.endsWith(ESTIMATE_SUFFIX) && !answer.messageId.endsWith(GUESS_ESTIMATE); };
  // 업종을 '잘 모르겠어요'로 넘겼으면 고른 것이 없다 — 문장에서 찾은 종류를 그대로 쓴다(넓은 업종으로 걸러 '승마 체험장'을 못 찾던 문제)
  const free = !picked && (open("industry") || intake.answers.industry?.status === "unknown");
  const { sector, ksic, matched, word, answers } = free ? estimateIntake(business, undefined, rules) : estimateIntake(business, intake.sector, rules, intake.ksic);
  // 업종도 모르고 종류도 못 찾았으면 아무것도 채우지 않는다 — 업종 질문을 먼저 묻고, 고르면 그 업종으로 다시 채운다
  if (!picked && open("industry") && !matched) return;
  // AI가 잡아 준 사업 한 줄(intake.shaped)은 그 줄이 제목이다 — 낱말 기준표의 짧은 이름으로 바꾸지 않는다
  if (!picked && intake.shaped?.to !== business) nameFromKind(coach, business, word, answers.offer);
  if (!picked && (open("industry") || free && matched)) {
    // 낱말 규칙으로 찾은 분류도 짐작이다 — 값·수량 이름(월 회비·프로젝트 1건)이 그 분류를 따르게 넣어 두고, 사용자가 업종을 고르면 그것으로 바뀐다
    intake.sector = sector; intake.ksic = ksic;
    coach.business.industry = intakeSectorOptions.find(option => option.value === sector)?.label ?? sector;
    intake.answers.industry = { status: "answered", value: sector, messageId, at };
    syncIntakeDetails(plan, intake);
  }
  let filled = 0;
  for (const question of intakeQuestions(intake, coach)) {
    if (question.id === "industry" || question.id === "business" || !open(question.id)) continue;
    // 이미 운영 중인 가게에 '6개월 안에 손익분기'를 목표로 채우지 않는다 — 묻는다
    if (question.id === "goal" && intake.running) continue;
    const guess = answers[question.id];
    // 준비 예산·일할 시간은 짐작하지도, '모름'으로 넘기지도 않는다 — 그대로 묻는다(안 물으면 계획서가 '감당할 수 있는지 알 수 없다'로만 채워진다)
    if (!guess) continue;
    /*
     * 준비 예산·주당 시간은 문장에 적혀 있을 때만 들어온다(intake-estimate) — 짐작이 아니라 사용자가 한 말이다. '이렇게 알아들었어요'(:said)로 보이고
     * 다시 묻지 않는다(2026-11-16 점검: '쿠키 팔고 싶어요, 예산 300'이라고 적어도 예산 질문이 다시 나왔다). 다르면 눌러서 고친다.
     */
    const said = question.id === "budget" || question.id === "hoursPerWeek";
    const id = said ? `${requestId}${SAID_SUFFIX}` : messageId;
    try {
      const value = validatedAnswer(question, guess);
      intake.answers[question.id] = { status: "answered", value, messageId: id, at, quote: guess };
      if (question.fieldKey) setField(coach, question.fieldKey, `${displayIntakeValue(value)}${question.kind === "number" && typeof value === "number" ? question.unit ?? "" : ""}`, id, said ? guess : "", said ? "user" : "proposal");
      if (!said) filled += 1;
    } catch { /* 형식이 안 맞는 짐작은 버린다 — 그 질문은 평소처럼 묻는다 */ }
  }
  if (!filled) return;
  /*
   * 기준값 안내는 대화에 한 번만 — 업종을 바꿔 다시 채우면 같은 말을 또 넣지 않고 처음 안내를 지금 업종에 맞게 고친다
   * (2026-11-16 점검: 업종을 바꿀 때마다 '나머지는 같은 업종 기준값으로 먼저 채웠어요'가 쌓여 대화가 고장 난 것처럼 보였다).
   */
  const label = intakeSectorOptions.find(option => option.value === intake.sector)?.label;
  const notice = coach.messages.find(message => message.role === "assistant" && message.id.endsWith(ESTIMATE_SUFFIX));
  if (!notice) coach.messages.push({ id: messageId, role: "assistant", text: ESTIMATE_NOTICE, at });
  else if (notice.id !== messageId) notice.text = label && intake.sector !== "general" ? `나머지는 고른 업종(${label}) 기준값으로 다시 채웠어요. 다르면 눌러서 고칠 수 있어요.` : ESTIMATE_NOTICE;
}
export const ESTIMATE_NOTICE = "나머지는 같은 업종 기준값으로 먼저 채웠어요. 다르면 눌러서 고칠 수 있어요.";

export const SAID_SUFFIX = ":said";
/**
 * 사용자가 적은 문장에서 읽은 답을 넣는다(idea-understanding.ts) — 업종 기준값으로 채운 답만 바꾸고, 사용자가 이미 직접 답한 것은 건드리지 않는다.
 * 말한 것이므로 근거는 '사용자'(계획서에서 '대표님이 정한 값'). 형식이 안 맞는 값은 버린다. 넣은 수를 돌려준다.
 */
export function applyUnderstood(coach: CoachState, intake: IntakeState, items: NonNullable<IntakeCommand["understood"]>, requestId: string, at: string): number {
  const messageId = `${requestId}${SAID_SUFFIX}`, questions = intakeQuestions(intake, coach);
  let applied = 0;
  for (const item of items) {
    const question = questions.find(candidate => candidate.id === item.questionId), now = intake.answers[item.questionId];
    if (!question || question.id === "business" || question.id === "industry" || now && !now.messageId.endsWith(ESTIMATE_SUFFIX)) continue;
    try {
      const value = validatedAnswer(question, item.value);
      intake.answers[question.id] = { status: "answered", value, messageId, at, quote: displayIntakeValue(item.value) };
      if (question.fieldKey) setField(coach, question.fieldKey, `${displayIntakeValue(value)}${question.kind === "number" && typeof value === "number" ? question.unit ?? "" : ""}`, messageId, displayIntakeValue(item.value), "user");
      applied += 1;
    } catch { /* 형식이 안 맞으면 버린다 — 기준값이 그대로 남는다 */ }
  }
  return applied;
}

/**
 * 첫 문장 읽기가 '이미 운영 중인 가게'라고 읽었다(2026-11-18) — '생각한 사업' 흐름일 때만 표시하고, 기준표가 채운 목표('6개월 안에 손익분기 도달')를 걷어 내 묻게 한다.
 * 손님이 말했거나 직접 답한 목표는 그대로 둔다.
 */
export function applyRunning(plan: Pick<ServerPlan, "sections">, coach: CoachState, intake: IntakeState): boolean {
  if (intake.mode !== "startup" || intake.running || Object.keys(plan.sections).length) return false;
  intake.running = true;
  const goal = intakeQuestions(intake, coach).find(question => question.fieldKey === "goal"), now = goal ? intake.answers[goal.id] : undefined;
  if (goal && now?.status === "answered" && now.messageId.endsWith(ESTIMATE_SUFFIX)) {
    delete intake.answers[goal.id];
    coach.fields = coach.fields.filter(field => !(field.key === "goal" && field.basis === "proposal"));
  }
  return true;
}

/**
 * 첫 문장 읽기가 짐작한 업종을 넣는다(2026-11-18) — 업종을 낱말 기준표가 채웠거나(:estimate) 아직 비어 있을 때만. 사용자가 고른 업종은 건드리지 않는다.
 * 업종이 바뀌면 그 업종 기준으로 채운 값(운영 범위 '한 달 10대' 같은 단위 포함)이 틀린 것이 되므로, 기준표 값을 지우고 새 업종으로 다시 채운다.
 * 말한 값(:said) · 직접 답한 값은 그대로 남는다. 바꿨으면 true.
 */
export function applyGuessedSector(plan: ServerPlan, coach: CoachState, intake: IntakeState, value: IntakeValue | undefined, requestId: string, at: string, rules?: KindRules): boolean {
  const option = intakeSectorOptions.find(item => item.value === value);
  const now = intake.answers.industry;
  if (!option || option.value === "general" || intake.mode !== "startup" || Object.keys(plan.sections).length) return false;
  if (now && !(now.status === "answered" && now.messageId.endsWith(ESTIMATE_SUFFIX))) return false;
  if (now && intake.sector === option.value) return false;
  clearIntakeEstimates(coach, intake);
  intake.sector = option.value; intake.ksic = null;
  coach.business.industry = option.label;
  intake.answers.industry = { status: "answered", value: option.value, messageId: `${requestId}${GUESS_ESTIMATE}`, at };
  syncIntakeDetails(plan, intake);
  if (process.env.INTAKE_ESTIMATE === "1") applyIntakeEstimates(plan, coach, intake, requestId, at, rules);
  return true;
}

export const SHAPED_SUFFIX = ":shaped";
export const shapedNotice = (business: string) => `적어 주신 말로 이런 사업을 잡아 봤어요: ${business}. 다르면 눌러서 고칠 수 있어요.`;
/**
 * 처음 적은 말이 사업 설명이 아닐 때(바람 · 푸념 · 취미 · 장난) 첫 문장 읽기가 그 말의 실마리로 잡은 사업 한 줄을 사업 설명으로 넣는다(2026-11-19).
 * 예전엔 "돈 벌고 싶다"가 그대로 사업 설명 · 제목이 되고 칸은 빈 채 질문만 이어졌다. 처음 적은 말은 지우지 않는다 — ideaOrigin('처음 이야기한 아이디어')과
 * 대화에 그대로 남고, 무엇으로 잡았는지 대화에 한 줄로 알린다. 사업마다 한 번만, '생각한 사업' 흐름에서 계획서를 쓰기 전에만 한다.
 * 기준표로 채운 값은 지우고 새 사업 설명으로 다시 채운다(그 위에 업종 · 다른 짐작이 얹힌다). 바꿨으면 true.
 */
export function applyShapedBusiness(plan: ServerPlan, coach: CoachState, intake: IntakeState, value: IntakeValue | undefined, requestId: string, at: string, rules?: KindRules): boolean {
  const shaped = typeof value === "string" ? value.trim() : "", now = intake.answers.business;
  const field = coach.fields.find(item => item.key === "business" && item.basis === "user");
  if (shaped.length < 2 || shaped.length > 60 || /[\n\r]/.test(shaped) || intake.mode !== "startup" || intake.depth === "expert" || Object.keys(plan.sections).length) return false;
  if (!field || now?.status !== "answered" || typeof now.value !== "string" || intake.shaped) return false;
  const original = field.value.trim();
  if (!original || original === shaped) return false;
  const messageId = `${requestId}${SHAPED_SUFFIX}`;
  // 답의 번호는 처음 적은 말풍선 그대로 둔다 — 번호를 바꾸면 화면이 그 말풍선을 '고친 예전 답'으로 보고 숨긴다(미리보기 확인 2026-11-19)
  intake.answers.business = { ...now, value: shaped, quote: original };
  setField(coach, "business", shaped, field.messageId, original, "user");
  intake.shaped = { from: original, to: shaped };
  clearIntakeEstimates(coach, intake);
  if (process.env.INTAKE_ESTIMATE === "1") applyIntakeEstimates(plan, coach, intake, requestId, at, rules);
  // 제목은 잡은 사업 한 줄로 — 기준표를 다시 채운 뒤에 넣는다(낱말 기준표가 '집에서 하는 문서 정리'를 '집 정리'로 줄여 붙이지 않게). 직접 지은 이름은 그대로
  if (!coach.business.nameConfirmed) coach.business.name = draftNameFromIdea(shaped);
  // 안내 순서: '이런 사업으로 잡았어요' 다음에 '나머지는 이 사업에 맞춰 채웠어요' — 채움 안내가 이미 있으면 그 앞에 넣는다
  const notice = { id: messageId, role: "assistant" as const, text: shapedNotice(shaped), at };
  const filled = coach.messages.findIndex(message => message.role === "assistant" && message.id.endsWith(ESTIMATE_SUFFIX));
  if (filled >= 0) coach.messages.splice(filled, 0, notice); else coach.messages.push(notice);
  return true;
}

/**
 * 첫 문장 읽기의 짐작(idea-understanding guess)을 넣는다 — 낱말 기준표가 채운 칸(:estimate)만 바꾸고, 말한 값 · 직접 답한 값은 건드리지 않는다.
 * 사용자가 한 말이 아니므로 근거는 '제안'이고 '말하지 않은 것은 이렇게 채웠어요'에 그대로 보인다. 형식이 안 맞는 값은 버린다(기준표 값이 남는다).
 * 마지막에 검사 하나: 한 번에 드는 비용이 짐작으로 채운 값인데 가격 이상이면 가격의 40%로 낮춘다 — 팔수록 손해인 초안을 만들지 않게(2026-11-17).
 */
export function applyGuessed(coach: CoachState, intake: IntakeState, items: NonNullable<IntakeCommand["guessed"]>, requestId: string, at: string): number {
  const messageId = `${requestId}${GUESS_ESTIMATE}`, questions = intakeQuestions(intake, coach);
  const guessed = (id: string) => { const now = intake.answers[id]; return !now || now.messageId.endsWith(ESTIMATE_SUFFIX); };
  const put = (question: IntakeQuestion, raw: IntakeValue) => {
    const value = validatedAnswer(question, raw);
    intake.answers[question.id] = { status: "answered", value, messageId, at, quote: "" };
    if (question.fieldKey) setField(coach, question.fieldKey, `${displayIntakeValue(value)}${question.kind === "number" && typeof value === "number" ? question.unit ?? "" : ""}`, messageId, "", "proposal");
  };
  let applied = 0;
  for (const item of items) {
    const question = questions.find(candidate => candidate.id === item.questionId);
    if (!question || question.id === "business" || question.id === "industry" || question.id === "budget" || question.id === "hoursPerWeek" || !guessed(question.id)) continue;
    try { put(question, item.value); applied += 1; } catch { /* 형식이 안 맞으면 버린다 — 기준표 값이 그대로 남는다 */ }
  }
  keepFilledCostBelowPrice(coach, intake, messageId, at);
  // 안내도 사실대로 — 업종 고정값이 아니라 이 사업에 맞춰 채웠다(예전 안내 '같은 업종 기준값으로' 그대로면 틀린 말이 된다)
  const notice = coach.messages.find(message => message.role === "assistant" && message.id.endsWith(ESTIMATE_SUFFIX));
  if (applied && notice) notice.text = GUESS_NOTICE;
  else if (applied) coach.messages.push({ id: messageId, role: "assistant", text: GUESS_NOTICE, at });
  return applied;
}
export const GUESS_NOTICE = "나머지는 이 사업에 맞춰 먼저 채웠어요. 다르면 눌러서 고칠 수 있어요.";

/**
 * 검사: 짐작으로 채운 '한 번에 드는 비용'이 가격 이상이면 가격의 40%로 낮춘다 — 사용자가 직접 답한 비용은 건드리지 않는다.
 * 첫 짐작 때뿐 아니라 가격을 바꾼 뒤에도 본다(2026-11-17: 가격을 3,000원으로 바꾸자 기준표의 한 장 비용 10,000원이 남아 '팔수록 손해' 계획이 됐다).
 */
export function keepFilledCostBelowPrice(coach: CoachState, intake: IntakeState, messageId: string, at: string) {
  const questions = intakeQuestions(intake, coach);
  const price = questions.find(question => question.fieldKey === "price"), unit = questions.find(question => question.fieldKey === "unitCost");
  if (!price || !unit) return;
  const priceValue = intake.answers[price.id]?.value, now = intake.answers[unit.id];
  if (!now || !now.messageId.endsWith(ESTIMATE_SUFFIX) || typeof priceValue !== "number" || typeof now.value !== "number" || priceValue <= 0 || now.value < priceValue) return;
  try {
    const value = validatedAnswer(unit, Math.max(1, Math.round(priceValue * 0.4 / 10) * 10));
    intake.answers[unit.id] = { status: "answered", value, messageId: messageId.endsWith(ESTIMATE_SUFFIX) ? messageId : `${messageId}${ESTIMATE_SUFFIX}`, at, quote: "" };
    if (unit.fieldKey) setField(coach, unit.fieldKey, `${displayIntakeValue(value)}${unit.unit ?? ""}`, intake.answers[unit.id].messageId, "", "proposal");
  } catch { /* 형식 검사에 막히면 그대로 둔다 */ }
}

/*
 * 대화 중 적은 말에서 AI가 읽은 것을 넣는다(intake-reader, 2026-11-16). applyUnderstood(첫 문장)와 달리 사용자가 방금 한 말이므로
 * 직접 답한 칸도 새 값으로 바꾼다("아니 아까 말한 건 취소, 예산 천만원"). 형식이 안 맞는 값은 버린다 — 지금 값이 그대로 남는다.
 *  - 주당 영업일은 질문이 없는 칸이라 사업 정보 표에 바로 적는다(계산표가 읽는다 — operating-days.ts)
 *  - 모른다고 한 질문은 아직 답이 없거나 기준값일 때만 '모름'으로 넘긴다(직접 답한 것을 지우지 않는다)
 * 넣은 칸 수를 돌려준다.
 */
export const READ_SUFFIX = ":read";
export function applyRead(coach: CoachState, intake: IntakeState, items: NonNullable<IntakeCommand["read"]>, requestId: string, at: string): number {
  const messageId = `${requestId}${READ_SUFFIX}`, questions = intakeQuestions(intake, coach);
  let applied = 0;
  for (const item of items.answers) {
    const question = questions.find(candidate => candidate.id === item.questionId);
    if (!question || question.id === "industry") continue;
    try {
      const value = validatedAnswer(question, item.value);
      // 서비스가 먼저 채운 값과 같은 값이면 넣지 않는다 — "하루 50건은 좀 많은 것 같아요"처럼 거절한 기본값을 손님이 말한 답으로 바꿔 버렸다(AI 손님 점검 2026-11-17)
      const now = intake.answers[question.id];
      if (now?.status === "answered" && now.messageId.endsWith(ESTIMATE_SUFFIX) && JSON.stringify(now.value) === JSON.stringify(value)) continue;
      intake.answers[question.id] = { status: "answered", value, messageId, at, quote: item.quote };
      if (question.fieldKey) setField(coach, question.fieldKey, `${displayIntakeValue(value)}${question.kind === "number" && typeof value === "number" ? question.unit ?? "" : ""}`, messageId, item.quote, "user");
      applied += 1;
    } catch { /* 형식이 안 맞으면 버린다 */ }
  }
  if (items.operatingDays && Number.isInteger(items.operatingDays.days) && items.operatingDays.days >= 1 && items.operatingDays.days <= 7) {
    setField(coach, "operatingDays", operatingDaysValue(items.operatingDays.days), messageId, items.operatingDays.quote, "user");
    applied += 1;
  }
  // 손님이 아니라고 한 칸 — 서비스가 먼저 채운 값(:estimate · 짐작 포함)일 때만 걷어 낸다. 질문이 다시 열려 차례에 묻는다. 손님이 말했거나 직접 답한 값은 그대로 둔다
  for (const id of items.doubted ?? []) {
    const question = questions.find(candidate => candidate.id === id), now = intake.answers[id];
    if (!question || question.id === "business" || question.id === "industry" || now?.status !== "answered" || !now.messageId.endsWith(ESTIMATE_SUFFIX)) continue;
    delete intake.answers[id];
    if (question.fieldKey) coach.fields = coach.fields.filter(field => !(field.key === question.fieldKey && field.basis === "proposal"));
    applied += 1;
  }
  for (const id of items.unknown) {
    const question = questions.find(candidate => candidate.id === id), now = intake.answers[id];
    if (!question || question.id === "business" || question.id === "industry" || now && now.status === "answered" && !now.messageId.endsWith(ESTIMATE_SUFFIX)) continue;
    if (now?.status === "answered") continue; // 기준값이 채워져 있으면 그대로 쓴다('알아서 해줘' = 기준값대로)
    intake.answers[id] = { status: "unknown", value: null, messageId, at };
    applied += 1;
  }
  return applied;
}

/** 전문가 방식으로 바꿀 때 — 기준값으로 채운 답(제안)을 걷어 하나씩 다시 묻게 한다. 업종은 질문 묶음을 정하므로 그대로 두고, 사용자가 직접 답한 것은 건드리지 않는다 */
export function clearIntakeEstimates(coach: CoachState, intake: IntakeState) {
  for (const question of intakeQuestions(intake, coach)) {
    if (question.id === "industry" || question.id === "business" || !intake.answers[question.id]?.messageId.endsWith(ESTIMATE_SUFFIX)) continue;
    delete intake.answers[question.id];
    if (question.fieldKey) coach.fields = coach.fields.filter(field => !(field.key === question.fieldKey && field.basis === "proposal"));
  }
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
  // 가격이 바뀌었으면 짐작으로 채운 한 번 비용이 가격을 넘지 않게(직접 답한 비용은 그대로)
  if (intake) keepFilledCostBelowPrice(coach, intake, `cost-check-${coach.revision + 1}`, new Date().toISOString());
  const changed = before !== intakeBusinessFingerprint(coach, answers, intake);
  const documentRevision = coachDocumentRevision(coach);
  coach.revision += 1;
  coach.documentRevision = documentRevision + Number(changed);
  if (changed) {
    if (coach.directAction) coach.directAction = { ...coach.directAction, needsReview: true };
  }
  return changed;
}
