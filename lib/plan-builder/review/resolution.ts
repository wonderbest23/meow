/*
 * 검토에서 찾은 문제 → 사용자가 답할 질문 연결.
 *
 * 연결은 코드의 책임이다. Reviewer LLM 은 "무엇이 문제인가"만 판단하고,
 * "그 문제를 시스템의 어느 질문과 잇는가"는 여기서 정한다 —
 * 그래야 LLM 이 내부 데이터 구조(sectionKey·qid)를 알 필요가 없고,
 * 없는 칸에 답이 저장되는 일이 생기지 않는다.
 *
 * 질문은 새로 만들지 않는 것이 원칙이다. 이미 있는 137개 질문과 질문팩 슬롯을
 * 그대로 재사용하고, 거기 없는 것만 등록된 목표에 한해 문장을 따로 둔다.
 */
import { questionsForSection, type QuestionDef, type QuestionInput } from "../questions";
import { PACKS, slotsForPack } from "../analyzer/packs";
import { packForAnalysis } from "../analyzer/packs";
import { readAnalysisRecord } from "../analyzer/domain";
import type { ReviewCategory, ReviewIssue } from "./domain";

export type ResolutionType = "answer" | "market_research" | "manual_edit" | "auto_rewrite";

/** 답을 저장할 곳 — 기존 질문 칸이거나 분석 슬롯. 이 둘 외에는 저장하지 않는다 */
export interface ResolutionSlotRef {
  id: string;
  sectionKey?: string;
  qid?: string;
  /** 분석 슬롯(__analysis.slots)에 저장하는 경우 */
  analyzerSlot?: string;
}

export interface IssueResolution {
  type: ResolutionType;
  slots?: ResolutionSlotRef[];
  /** 이 답이 바뀌면 다시 써야 하는 섹션 — 25개를 전부 다시 만들지 않기 위한 목록 */
  affectedSections?: string[];
}

/* ───────── 답을 받을 수 있는 곳의 화이트리스트 ───────── */

interface Target {
  id: string;
  label: string;
  /** 기존 질문 칸 */
  sectionKey?: string;
  qid?: string;
  /** 분석 슬롯 */
  analyzerSlot?: string;
  /** 기존 질문 목록에 실제로 존재하는가 — 로드 시 검증한다 */
  fromWizard?: boolean;
  /** 기존 질문이 없을 때 쓸 문장 */
  ask?: string;
  help?: string;
  input?: QuestionInput;
  /** 분기 질문이면 앞의 예/아니오도 함께 켜야 답이 화면에 보인다 */
  gates?: Array<{ sectionKey: string; qid: string; value: unknown }>;
  /** 이 값이 바뀌면 다시 써야 하는 섹션 */
  affected: string[];
}

const EXEC = "summary/executive";
const OVERVIEW = "overview/summary";

export const RESOLUTION_TARGETS: Record<string, Target> = {
  promo_channels: {
    id: "promo_channels", label: "홍보 채널", sectionKey: "strategy/promotion", qid: "promo_channels", fromWizard: true,
    affected: ["strategy/promotion", OVERVIEW, EXEC],
  },
  promo_budget: {
    id: "promo_budget", label: "월 홍보 예산", sectionKey: "strategy/promotion", qid: "promo_budget", fromWizard: true,
    gates: [{ sectionKey: "strategy/promotion", qid: "has_promo_budget", value: "yes" }],
    affected: ["strategy/promotion", "financials/expenses", EXEC],
  },
  message: {
    id: "message", label: "홍보 핵심 메시지", sectionKey: "strategy/promotion", qid: "message", fromWizard: true,
    affected: ["strategy/promotion", EXEC],
  },
  owner_pay: {
    id: "owner_pay", label: "대표자 급여", sectionKey: "financials/staffing", qid: "owner_pay", fromWizard: true,
    affected: ["financials/staffing", "financials/expenses", "financials/financing", EXEC],
  },
  staff_monthly: {
    id: "staff_monthly", label: "월 인건비", sectionKey: "financials/staffing", qid: "staff_monthly", fromWizard: true,
    gates: [{ sectionKey: "financials/staffing", qid: "has_staff_cost", value: "yes" }],
    affected: ["financials/staffing", "financials/expenses", EXEC],
  },
  funding_sources: {
    id: "funding_sources", label: "자금 조달 방법", sectionKey: "funding/requirements", qid: "sources", fromWizard: true,
    gates: [{ sectionKey: "funding/requirements", qid: "needs_funding", value: "yes" }],
    affected: ["funding/requirements", "financials/financing", EXEC],
  },
  use_of_funds: {
    id: "use_of_funds", label: "자금 사용처", sectionKey: "funding/requirements", qid: "use_of_funds", fromWizard: true,
    gates: [{ sectionKey: "funding/requirements", qid: "needs_funding", value: "yes" }],
    affected: ["funding/requirements", "financials/assets", EXEC],
  },
  main_offer: {
    id: "main_offer", label: "대표 상품·서비스", sectionKey: "market/products", qid: "main_offer", fromWizard: true,
    affected: ["market/products", "strategy/product", OVERVIEW, EXEC],
  },
  first_target: {
    id: "first_target", label: "가장 먼저 공략할 고객", sectionKey: "market/segments", qid: "first_target", fromWizard: true,
    affected: ["market/segments", "market/personas", "strategy/promotion", OVERVIEW, EXEC],
  },
  problems: {
    id: "problems", label: "고객이 겪는 문제", sectionKey: "overview/problem", qid: "problems", fromWizard: true,
    // 세그먼트는 고객으로 나뉘고 문제는 페르소나 서술에 쓰인다 — 값을 받는 섹션만 적는다
    affected: ["overview/problem", "market/personas", OVERVIEW, EXEC],
  },
  differentiator: {
    id: "differentiator", label: "경쟁 대비 차별점", sectionKey: "market/competitors", qid: "differentiator", fromWizard: true,
    affected: ["overview/problem", "market/competitors", "market/swot", "strategy/product", EXEC],
  },
  competitor_notes: {
    id: "competitor_notes", label: "경쟁 상대 메모", sectionKey: "market/competitors", qid: "competitor_notes", fromWizard: true,
    affected: ["market/competitors", "market/swot", EXEC],
  },
  why_us: {
    id: "why_us", label: "대표자의 관련 경험", sectionKey: EXEC, qid: "why_us", fromWizard: true,
    affected: ["overview/structure", "market/swot", EXEC],
  },
  who_works: {
    id: "who_works", label: "실제 업무 수행", sectionKey: "strategy/people", qid: "who_works", fromWizard: true,
    affected: ["strategy/people", "financials/staffing", EXEC],
  },
  unit_price: {
    id: "unit_price", label: "1건 평균 판매 금액", sectionKey: "financials/revenue", qid: "unit_price", fromWizard: true,
    affected: ["financials/revenue", "strategy/price", "market/products", EXEC],
  },
  monthly_volume: {
    id: "monthly_volume", label: "월 판매량", sectionKey: "financials/revenue", qid: "monthly_volume", fromWizard: true,
    affected: ["financials/revenue", "strategy/distribution", OVERVIEW, EXEC],
  },
  variable_per_unit: {
    id: "variable_per_unit", label: "1건당 변동비", sectionKey: "financials/expenses", qid: "variable_per_unit", fromWizard: true,
    affected: ["financials/expenses", "strategy/price", "financials/revenue", EXEC],
  },
  fixed_total: {
    id: "fixed_total", label: "월 고정비 합계", sectionKey: "financials/expenses", qid: "fixed_total", fromWizard: true,
    affected: ["financials/expenses", "financials/revenue", EXEC],
  },
  /*
   * 운영 상한. 유형에 따라 질문 목록에 없을 수 있어(TYPE_ADJUST) 문장을 따로 둔다.
   * 저장 칸은 기존 재무 엔진이 이미 읽는 growth_ceiling 그대로다 — 새 칸을 만들지 않는다.
   */
  growth_ceiling: {
    id: "growth_ceiling", label: "월 운영 한계", sectionKey: "financials/revenue", qid: "growth_ceiling",
    ask: "지금 인원과 공간으로 한 달에 최대 몇 건까지 감당할 수 있나요?",
    help: "더 늘리려면 무엇이 필요한지(사람·공간·시간)도 함께 적어주시면 좋아요.",
    input: { kind: "text", placeholder: "예: 지금 혼자로는 월 60건이 한계, 파트타임 1명 쓰면 100건", long: true },
    affected: ["financials/revenue", "strategy/distribution", "strategy/people", EXEC],
  },
  /* 1인 운영 부담 — 기존 질문에 없는 확인이라 문장을 둔다. 저장은 인력 섹션 칸 */
  owner_hours: {
    id: "owner_hours", label: "하루 운영 투입 시간", sectionKey: "strategy/people", qid: "how_manage",
    ask: "하루에 매장 관리나 준비에 몇 시간 정도 쓸 계획인가요?",
    help: "자리를 비울 때 대신 관리할 사람이나 방법이 있으면 함께 적어주세요.",
    input: { kind: "text", placeholder: "예: 하루 3시간, 주말은 가족이 대신 확인", long: true },
    affected: ["strategy/people", "strategy/distribution", EXEC],
  },
};

/** 분석 슬롯으로 받는 목표 — 질문팩이 이미 문장을 갖고 있다 */
const ANALYZER_TARGETS: Record<string, { label: string; affected: string[] }> = {
  seatsPerClass: { label: "회당 정원", affected: ["financials/revenue", "strategy/distribution", EXEC] },
  classesPerMonth: { label: "월 수업 횟수", affected: ["financials/revenue", "strategy/distribution", EXEC] },
  occupancyRate: { label: "예상 평균 참석률", affected: ["financials/revenue", EXEC] },
  monthlyVisitors: { label: "월 방문자 수", affected: ["financials/revenue", "strategy/promotion", "market/segments"] },
  conversionRate: { label: "구매 전환율", affected: ["financials/revenue", "strategy/promotion"] },
  venueType: { label: "공간 마련 방식", affected: ["strategy/distribution", "financials/expenses"] },
};

/* 로드 시 검증 — 기존 질문이라고 표시해 놓고 실제로 없으면 답이 화면에서 사라진다 */
(function verifyTargets() {
  for (const t of Object.values(RESOLUTION_TARGETS)) {
    if (!t.fromWizard) {
      if (!t.ask || !t.input) throw new Error(`[review/resolution] ${t.id}: 기존 질문이 아니면 ask·input 이 있어야 한다`);
      continue;
    }
    const found = questionsForSection(t.sectionKey!, "").some((g) => g.questions.some((q) => q.id === t.qid));
    if (!found) throw new Error(`[review/resolution] ${t.id}: ${t.sectionKey}.${t.qid} 질문이 없다`);
  }
  for (const id of Object.keys(ANALYZER_TARGETS)) {
    const known = Object.values(PACKS).some((p) => slotsForPack(p).some((s) => s.id === id));
    if (!known) throw new Error(`[review/resolution] 분석 슬롯 ${id} 이 질문팩에 없다`);
  }
})();

/* ───────── 문제 → 목표 ───────── */

/*
 * 다른 이름으로 들어오는 같은 값들.
 *
 * 미확정 항목은 분석 슬롯 id(problem·customer·classPrice…)로 들어오는데
 * 여기 목표는 질문 id(problems·first_target·unit_price…)를 쓴다.
 * 맞춰 주지 않으면 '답변 추가하기' 를 눌러도 물을 것이 없는 빈 화면이 뜬다(실측).
 */
const TARGET_ALIAS: Record<string, string> = {
  customer: "first_target",
  problem: "problems",
  solution: "main_offer",
  ownerExperience: "why_us",
  classPrice: "unit_price",
  aov: "unit_price",
  unitPrice: "unit_price",
  monthlyVolume: "monthly_volume",
  materialCost: "variable_per_unit",
  cogs: "variable_per_unit",
  unitCost: "variable_per_unit",
  venueCost: "fixed_total",
  fixedOps: "fixed_total",
  fixedTotal: "fixed_total",
  adBudget: "promo_budget",
  initialInvestment: "use_of_funds",
};

/** 코드가 만든 확정 문제는 만들 때 resolution 을 함께 붙인다(아래 헬퍼를 deterministic 에서 쓴다) */
export function answerResolution(targetIds: string[]): IssueResolution {
  const slots: ResolutionSlotRef[] = [];
  const affected = new Set<string>();
  const seen = new Set<string>();
  for (const raw of targetIds) {
    const id = TARGET_ALIAS[raw] ?? raw;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = RESOLUTION_TARGETS[id];
    if (t) {
      slots.push({ id: t.id, ...(t.sectionKey ? { sectionKey: t.sectionKey } : {}), ...(t.qid ? { qid: t.qid } : {}) });
      for (const s of t.affected) affected.add(s);
      continue;
    }
    const a = ANALYZER_TARGETS[id];
    if (a) {
      slots.push({ id, analyzerSlot: id });
      for (const s of a.affected) affected.add(s);
    }
  }
  /*
   * 물을 것이 하나도 없으면 '답변 추가하기' 를 붙이지 않는다 —
   * 눌러도 빈 화면이 뜨는 버튼은 없느니만 못하다.
   */
  if (slots.length === 0) return { type: "manual_edit" };
  return { type: "answer", slots, affectedSections: [...affected] };
}

export const MARKET_RESEARCH_RESOLUTION: IssueResolution = { type: "market_research" };

function manualEdit(sectionKey?: string): IssueResolution {
  return { type: "manual_edit", ...(sectionKey ? { affectedSections: [sectionKey] } : {}) };
}

/** 문제 문장에서 실마리를 찾는다 — 카테고리만으로는 어느 칸인지 좁혀지지 않는다 */
const KEYWORD_TARGETS: Array<{ re: RegExp; targets: string[] }> = [
  { re: /인건비|급여|대표자 (?:노동|시간|인건)|기회비용/, targets: ["owner_pay"] },
  { re: /자금\s*조달|운영자금|초기 자금|자본금/, targets: ["funding_sources", "use_of_funds"] },
  { re: /홍보\s*예산|광고비|마케팅 예산/, targets: ["promo_budget"] },
  { re: /채널|유입|모객|고객 확보/, targets: ["promo_channels", "message"] },
  { re: /차별|경쟁 우위|경쟁사|대안/, targets: ["differentiator", "competitor_notes"] },
  { re: /고객(?:이|을)? (?:불명확|미확정|정의)|타깃|타겟|고객층/, targets: ["first_target"] },
  { re: /정원|수업 횟수|가동률|참석률/, targets: ["seatsPerClass", "classesPerMonth", "occupancyRate"] },
  { re: /방문자|전환율/, targets: ["monthlyVisitors", "conversionRate"] },
  { re: /24시간|혼자|1인 운영|관리 가능|무인/, targets: ["owner_hours"] },
  { re: /capacity|생산\s*능력|운영 능력|처리 가능|감당/, targets: ["growth_ceiling"] },
  // '경험'은 흔한 낱말이라("맞춤형 경험") 대표자를 가리킬 때만 잡는다
  { re: /(대표자|창업자|본인|경영진)[^.]{0,12}(경력|경험|이력)|관련 (경력|경험|이력)|경력이 (없|부족)/, targets: ["why_us"] },
  { re: /판매가|단가|가격/, targets: ["unit_price"] },
  { re: /변동비|원가/, targets: ["variable_per_unit"] },
  { re: /고정비|임대료/, targets: ["fixed_total"] },
];

const CATEGORY_TARGETS: Partial<Record<ReviewCategory, string[]>> = {
  marketing: ["promo_channels", "promo_budget"],
  competition: ["differentiator", "competitor_notes"],
  customer: ["first_target"],
  problem_solution: ["problems"],
  business_model: ["first_target", "problems"],
  operation: ["growth_ceiling", "who_works"],
  finance: ["owner_pay", "fixed_total"],
};

/**
 * AI 가 찾은 문제를 기존 질문/슬롯에 잇는다.
 *
 * 새 자유 질문을 먼저 만들지 않는다 — 기존 칸으로 풀 수 있는지부터 본다.
 * 어디로도 이어지지 않으면 사용자가 직접 고치도록 편집기로 보낸다.
 */
export function resolveAiIssue(issue: ReviewIssue, availableAnalyzerSlots: ReadonlySet<string>): IssueResolution {
  if (issue.category === "market_evidence") return MARKET_RESEARCH_RESOLUTION;
  if (issue.category === "writing") return { type: "auto_rewrite", ...(issue.sectionKey ? { affectedSections: [issue.sectionKey] } : {}) };
  if (!issue.requiresUserInput) return manualEdit(issue.sectionKey);

  const text = `${issue.title} ${issue.problem} ${issue.recommendation}`;
  const picked: string[] = [];
  for (const rule of KEYWORD_TARGETS) {
    if (!rule.re.test(text)) continue;
    for (const t of rule.targets) if (!picked.includes(t)) picked.push(t);
    if (picked.length >= 3) break;
  }
  if (picked.length === 0) {
    for (const t of CATEGORY_TARGETS[issue.category] ?? []) if (!picked.includes(t)) picked.push(t);
  }
  // 이 사업의 질문팩에 없는 분석 슬롯은 물을 수 없다
  const usable = picked.filter((id) => RESOLUTION_TARGETS[id] || availableAnalyzerSlots.has(id)).slice(0, 3);
  if (usable.length === 0) return manualEdit(issue.sectionKey);
  return answerResolution(usable);
}

/** 이 플랜의 질문팩이 가진 분석 슬롯 — 팩에 없는 슬롯은 물어도 저장할 곳이 없다 */
export function analyzerSlotsFor(answers: Record<string, Record<string, unknown>>): Set<string> {
  const rec = readAnalysisRecord(answers);
  if (!rec) return new Set();
  const pack = packForAnalysis(rec.analysis);
  return new Set(slotsForPack(pack).map((s) => s.id).filter((id) => id in ANALYZER_TARGETS));
}

/* ───────── 질문 만들기 ───────── */

export interface FollowUpQuestion {
  /** 저장 위치 — 화이트리스트를 통과한 것만 */
  target: ResolutionSlotRef;
  label: string;
  q: string;
  help?: string;
  input: QuestionInput;
  /** 기존 답이 있으면 미리 채운다 */
  current?: string;
  allowUnknown: boolean;
}

function findQuestionDef(sectionKey: string, qid: string): QuestionDef | undefined {
  for (const g of questionsForSection(sectionKey, "")) {
    const q = g.questions.find((x) => x.id === qid);
    if (q) return q;
  }
  return undefined;
}

function currentValue(answers: Record<string, Record<string, unknown>>, ref: ResolutionSlotRef): string {
  if (ref.sectionKey && ref.qid) {
    const v = answers?.[ref.sectionKey]?.[ref.qid];
    if (v == null || v === "") return "";
    return Array.isArray(v) ? v.join(", ") : String(v);
  }
  if (ref.analyzerSlot) {
    const rec = readAnalysisRecord(answers);
    const s = rec?.slots[ref.analyzerSlot];
    return s?.status === "confirmed" && s.value ? s.value : "";
  }
  return "";
}

/**
 * 한 문제에 붙일 질문 1~3개.
 * 기존 질문이 있으면 그 문장을 그대로 쓴다 — 검토 문장을 그대로 질문으로 옮기지 않는다.
 * 이미 답이 있는 칸도 포함한다(고치라고 나온 문제일 수 있다).
 */
export function followUpQuestions(
  resolution: IssueResolution | undefined,
  answers: Record<string, Record<string, unknown>>,
): FollowUpQuestion[] {
  if (!resolution || resolution.type !== "answer" || !resolution.slots?.length) return [];
  const out: FollowUpQuestion[] = [];
  for (const ref of resolution.slots.slice(0, 3)) {
    if (ref.analyzerSlot) {
      const rec = readAnalysisRecord(answers);
      if (!rec) continue;
      const slot = slotsForPack(packForAnalysis(rec.analysis)).find((s) => s.id === ref.analyzerSlot);
      if (!slot) continue;
      out.push({
        target: ref,
        label: slot.label.replace(/\s*\(.*\)$/, ""),
        q: slot.ask,
        help: slot.why,
        input: slot.input.kind === "number" ? { kind: "text", placeholder: slot.input.hint } : slot.input.kind === "single" ? { kind: "single", options: slot.input.options } : { kind: "text", placeholder: slot.input.placeholder, long: true },
        current: currentValue(answers, ref),
        allowUnknown: true,
      });
      continue;
    }
    const t = RESOLUTION_TARGETS[ref.id];
    if (!t) continue;
    const def = t.fromWizard && t.sectionKey && t.qid ? findQuestionDef(t.sectionKey, t.qid) : undefined;
    out.push({
      target: ref,
      label: t.label,
      q: def?.q ?? t.ask ?? t.label,
      help: def?.help ?? t.help,
      input: def?.input ?? t.input ?? { kind: "text", long: true },
      current: currentValue(answers, ref),
      allowUnknown: true,
    });
  }
  return out;
}

/** 이 목표를 저장할 때 함께 켜야 하는 분기 게이트 */
export function gatesFor(ref: ResolutionSlotRef): Array<{ sectionKey: string; qid: string; value: unknown }> {
  return RESOLUTION_TARGETS[ref.id]?.gates ?? [];
}

/** 이 문제를 풀면 다시 써야 하는 섹션 (본문이 이미 있는 것만 호출부에서 걸러 쓴다) */
export function affectedOf(resolution: IssueResolution | undefined): string[] {
  return resolution?.affectedSections ?? [];
}
