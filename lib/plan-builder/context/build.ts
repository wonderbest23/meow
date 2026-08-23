/*
 * PlanBusinessContext — Business Analyzer 가 이해한 사업 구조를 섹션 작성 AI가 읽는 형태로.
 *
 * 한 필드에 출처가 여럿이면 이 순서로 고른다(위가 이김):
 *   1. 사용자가 위저드에서 직접 적은 값      (user_answer · confirmed)
 *   2. 동적 질문에 직접 답한 값              (user_answer · confirmed)
 *   3. VERIFY 로 사용자가 확인한 Analyzer 값  (user_answer · confirmed)
 *   4. 시스템 계산값                          (calculation · confirmed)
 *   5. 공식 MarketEvidence                    (official_evidence — 여기서는 쓰지 않는다. 근거 블록이 따로 간다)
 *   6. 사용자가 확인하지 않은 Analyzer 추론    (ai_inference · inferred)
 *   7. unknown
 *
 * AI 추론이 사용자 직접 입력을 덮는 일은 구조적으로 없다 — pick() 이 순서대로 첫 값을 고른다.
 * 위저드 값과 VERIFY 확정값이 서로 다르면 위저드 값을 쓰고, 둘 다 Writer 에게 주지 않는다.
 * 대신 conflicts 로 내보내 기존 [해결되지 않은 답변 충돌] 블록에 합쳐진다.
 *
 * 순수 함수. 서버·클라이언트·테스트 어디서나 같은 결과.
 */
import { readAnalysisRecord, MODEL_TAGS, OPERATION_TAGS, type AnalysisRecord, type AnalysisStatus } from "../analyzer/domain";
import { packForAnalysis, slotsForPack, type MetricCategory } from "../analyzer/packs";
import { numericSlots } from "../analyzer/gap";
import { collectFinancialInputs, calculateFinancials, financialsToReference, parseAmount, type FinancialResult } from "../financials";

export type ContextSource = "user_input" | "user_answer" | "ai_inference" | "official_evidence" | "calculation";

export interface ContextField<T> {
  value: T | null;
  status: AnalysisStatus;
  source: ContextSource;
}

/**
 * 사용자가 확정한 사업 고유 지표.
 *
 * 질문팩의 contextMetric 선언이 화이트리스트다 — 팩에 없는 슬롯 id 는 어디서 와도 실리지 않는다.
 * inferred 는 절대 들어오지 않는다: 사용자가 직접 답한 값(user_answer)과
 * 사용자가 화면에서 확인한 계산값(calculation)만이다.
 */
export interface BusinessMetric {
  id: string;
  label: string;
  value: string;
  unit?: string;
  status: "confirmed";
  source: "user_answer" | "calculation";
  category: MetricCategory;
}

export interface PlanBusinessContext {
  identity: { name?: ContextField<string>; industry?: ContextField<string>; stage?: ContextField<string>; region?: ContextField<string>; description?: ContextField<string> };
  classification: { primary?: ContextField<string>; modelTags?: ContextField<string[]>; operationTags?: ContextField<string[]> };
  customer: { target?: ContextField<string>; persona?: ContextField<string>; budget?: ContextField<string>; channels?: ContextField<string[]> };
  problem: { statement?: ContextField<string>; frequency?: ContextField<string>; currentAlternative?: ContextField<string> };
  solution: { mainOffer?: ContextField<string>; description?: ContextField<string>; differentiator?: ContextField<string> };
  revenue: { model?: ContextField<string>; streams?: ContextField<string[]>; unitPrice?: ContextField<string>; volume?: ContextField<string> };
  operations: { delivery?: ContextField<string>; coverage?: ContextField<string>; venueType?: ContextField<string>; capacity?: ContextField<string>; who?: ContextField<string[]> };
  marketing: { channels?: ContextField<string[]>; acquisitionModel?: ContextField<string[]>; message?: ContextField<string>; budget?: ContextField<string> };
  competition: { alternatives?: ContextField<string[]>; knownCompetitors?: ContextField<string>; differentiator?: ContextField<string> };
  traction: { established?: ContextField<string>; hasRevenue?: ContextField<string>; items?: ContextField<string[]> };
  team: { size?: ContextField<string>; ownerExperience?: ContextField<string> };
  funding: { needs?: ContextField<string>; amount?: ContextField<string>; use?: ContextField<string> };
  goals: { horizon?: ContextField<string>; main?: ContextField<string[]>; constraint?: ContextField<string> };
  finance: { summary?: string };
  /** 팩이 전달하겠다고 선언한 확정 지표 (방문자 수·전환율·정원 등) */
  metrics: BusinessMetric[];
  unknowns: Array<{ field: string; label: string }>;
  /** 위저드 답과 VERIFY 확정값이 다른 경우 — 기존 충돌 블록으로 간다 */
  conflicts: Array<{ title: string; detail: string }>;
}

type Answers = Record<string, Record<string, unknown>>;
type Business = { name?: string; description?: string; industry?: string; region?: string; stage?: string };

function text(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(", ");
  if (v == null) return "";
  const s = String(v).trim();
  return s === "yes" ? "예" : s === "no" ? "아니오" : s;
}
function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const t = text(v);
  return t ? [t] : [];
}

type Cand<T> = { value: T | null | undefined; status: AnalysisStatus; source: ContextSource } | undefined;

function empty(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** 순서대로 첫 번째 값 있는 후보. 없으면 unknown */
function pick<T>(...cands: Cand<T>[]): ContextField<T> {
  for (const c of cands) {
    if (c && !empty(c.value)) return { value: c.value as T, status: c.status, source: c.source };
  }
  return { value: null, status: "unknown", source: "user_answer" };
}

function fromAnswer(v: unknown, asList?: false): Cand<string>;
function fromAnswer(v: unknown, asList: true): Cand<string[]>;
function fromAnswer(v: unknown, asList?: boolean): Cand<string> | Cand<string[]> {
  if (empty(v)) return undefined;
  return asList ? { value: list(v), status: "confirmed", source: "user_answer" } : { value: text(v), status: "confirmed", source: "user_answer" };
}

function fromBusiness(v: string | undefined): Cand<string> {
  return v?.trim() ? { value: v.trim(), status: "confirmed", source: "user_input" } : undefined;
}

/** Analyzer 필드 — confirmed 면 user_answer(VERIFY), inferred 면 ai_inference */
function fromAnalysis<T>(f: { value: T | null; status: AnalysisStatus } | undefined): Cand<T> {
  if (!f || empty(f.value)) return undefined;
  if (f.status === "confirmed") return { value: f.value, status: "confirmed", source: "user_answer" };
  if (f.status === "inferred") return { value: f.value, status: "inferred", source: "ai_inference" };
  return undefined;
}

function fromSlot(rec: AnalysisRecord | null, id: string): Cand<string> {
  const s = rec?.slots[id];
  if (!s || s.status !== "confirmed" || !s.value) return undefined;
  return { value: s.value, status: "confirmed", source: "user_answer" };
}

function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

export interface BuildContextInput {
  business: Business;
  answers: Answers;
  /** 이미 계산한 재무가 있으면 넘긴다. 없으면 여기서 계산한다(순수·저렴) */
  financials?: FinancialResult | null;
}

export function buildPlanBusinessContext(input: BuildContextInput): PlanBusinessContext {
  const a = input.answers ?? {};
  const b = input.business ?? {};
  const rec = readAnalysisRecord(a);
  const an = rec?.analysis;
  const get = (sec: string, qid: string) => a[sec]?.[qid];

  const conflicts: PlanBusinessContext["conflicts"] = [];
  /** 위저드 값과 VERIFY 확정값이 다르면 충돌로 기록 (둘 다 Writer 에게 주지 않는다 — 위저드 값만 간다) */
  const checkConflict = (label: string, wizard: unknown, verified: { value: unknown; status: AnalysisStatus } | undefined) => {
    if (empty(wizard) || !verified || verified.status !== "confirmed" || empty(verified.value)) return;
    const w = text(wizard);
    const v = text(verified.value);
    if (w && v && norm(w) !== norm(v) && !norm(w).includes(norm(v)) && !norm(v).includes(norm(w))) {
      conflicts.push({ title: `${label}이(가) 두 곳에서 다릅니다`, detail: `질문 답변 "${w}" · AI 분석에서 확인한 값 "${v}" — 질문 답변을 기준으로 작성하되 확정 필요로 표기` });
    }
  };
  checkConflict("핵심 고객", get("market/segments", "first_target"), an?.customer);
  checkConflict("대표 상품", get("market/products", "main_offer"), an?.solution);
  checkConflict("전달 방식", get("strategy/distribution", "delivery"), an?.deliveryModel);

  const ctx: PlanBusinessContext = {
    identity: {
      name: pick(fromBusiness(b.name)),
      industry: pick(fromBusiness(b.industry), fromAnalysis(an?.primary)),
      stage: pick(fromBusiness(b.stage), fromAnalysis(an?.stage)),
      region: pick(fromBusiness(b.region), fromAnswer(get("overview/summary", "city")), fromAnalysis(an?.region)),
      description: pick(fromBusiness(b.description)),
    },
    classification: {
      primary: pick(fromBusiness(b.industry), fromAnalysis(an?.primary)),
      modelTags: pick(fromAnalysis(an?.modelTags)),
      operationTags: pick(fromAnalysis(an?.operationTags)),
    },
    customer: {
      target: pick(fromAnswer(get("market/segments", "first_target")), fromSlot(rec, "customer"), fromAnalysis(an?.customer)),
      persona: pick(fromAnswer(get("market/personas", "situation"))),
      budget: pick(fromAnswer(get("market/personas", "budget"))),
      channels: pick(fromAnswer(get("market/personas", "channel"), true)),
    },
    problem: {
      statement: pick(fromAnswer(get("overview/problem", "problems")), fromSlot(rec, "problem"), fromAnalysis(an?.problem)),
      frequency: pick(fromAnswer(get("overview/problem", "problem_freq"))),
      currentAlternative: pick(fromAnswer(get("overview/problem", "current_alt")), fromAnswer(get("market/competitors", "comp_types"))),
    },
    solution: {
      mainOffer: pick(fromAnswer(get("market/products", "main_offer")), fromSlot(rec, "solution"), fromAnalysis(an?.solution)),
      description: pick(fromAnswer(get("market/products", "offer_detail")), fromAnswer(get("overview/problem", "solutions"))),
      differentiator: pick(fromAnswer(get("market/competitors", "differentiator")), fromSlot(rec, "differentiator"), fromAnswer(get("overview/problem", "why_better")), fromAnswer(get("overview/summary", "value_prop"))),
    },
    revenue: {
      model: pick(fromAnalysis(an?.revenueModel)),
      streams: pick(fromAnswer(get("financials/revenue", "revenue_streams"), true)),
      unitPrice: pick(fromAnswer(get("financials/revenue", "unit_price")), fromAnswer(get("market/products", "price_value"))),
      volume: pick(fromAnswer(get("financials/revenue", "monthly_volume"))),
    },
    operations: {
      delivery: pick(fromAnswer(get("strategy/distribution", "delivery")), fromAnalysis(an?.deliveryModel)),
      coverage: pick(fromAnswer(get("strategy/distribution", "coverage")), fromAnswer(get("overview/summary", "reach"))),
      venueType: pick(fromSlot(rec, "venueType")),
      capacity: pick(
        fromSlot(rec, "seatsPerClass") && fromSlot(rec, "classesPerMonth")
          ? { value: `회당 ${fromSlot(rec, "seatsPerClass")!.value} × 월 ${fromSlot(rec, "classesPerMonth")!.value}`, status: "confirmed", source: "user_answer" }
          : undefined,
        fromAnswer(get("financials/revenue", "growth_ceiling")),
      ),
      who: pick(fromAnswer(get("strategy/people", "who_works"), true)),
    },
    marketing: {
      channels: pick(fromAnswer(get("strategy/promotion", "promo_channels"), true), fromAnalysis(an?.acquisitionChannels)),
      acquisitionModel: pick(fromAnalysis(an?.acquisitionChannels)),
      message: pick(fromAnswer(get("strategy/promotion", "message"))),
      budget: pick(fromAnswer(get("strategy/promotion", "promo_budget")), fromSlot(rec, "adBudget")),
    },
    competition: {
      alternatives: pick(fromAnswer(get("market/competitors", "comp_types"), true), fromAnswer(get("overview/problem", "current_alt"), true)),
      knownCompetitors: pick(fromAnswer(get("market/competitors", "competitor_notes"))),
      differentiator: pick(fromAnswer(get("market/competitors", "differentiator")), fromSlot(rec, "differentiator")),
    },
    traction: {
      established: pick(fromAnswer(get("overview/summary", "established"))),
      hasRevenue: pick(fromAnswer(get("overview/summary", "revenue"))),
      items: pick(fromAnswer(get("overview/achievements", "traction_types"), true), fromAnswer(get("overview/achievements", "traction_detail"), true)),
    },
    team: {
      size: pick(fromAnswer(get("overview/structure", "team_size"))),
      ownerExperience: pick(fromAnswer(get("summary/executive", "why_us")), fromSlot(rec, "ownerExperience")),
    },
    funding: {
      needs: pick(fromAnswer(get("funding/requirements", "needs_funding"))),
      amount: pick(fromAnswer(get("funding/requirements", "amount"))),
      use: pick(fromAnswer(get("funding/requirements", "use_of_funds"))),
    },
    goals: {
      horizon: pick(fromAnswer(get("objectives/corporate", "horizon"))),
      main: pick(fromAnswer(get("objectives/corporate", "main_goals"), true)),
      constraint: pick(fromAnswer(get("objectives/corporate", "constraint"))),
    },
    finance: {},
    metrics: [],
    unknowns: [],
    conflicts,
  };

  // 재무 — 기존 계산기 결과를 최우선. Writer 가 다시 곱하지 않도록 요약 문장만
  const fin = input.financials ?? safeFinancials(a);
  if (fin) {
    const ref = financialsToReference(fin);
    if (ref) ctx.finance.summary = ref;
  }

  /*
   * 사업 고유 지표 — 팩이 contextMetric 을 선언한 슬롯 중 confirmed 인 것만.
   *
   * 2026-08-23 운영검증에서 쇼핑몰의 방문자 3,000명·전환율 2%가 confirmed 인데도
   * 맥락에 실리지 않아 본문이 "사용자가 확인한 값이 아니다"라고 잘못 쓴 일이 있었다.
   * 팩마다 빌더를 고치지 않도록, 무엇을 넘길지는 팩 선언이 정한다.
   */
  if (rec) {
    for (const slot of slotsForPack(packForAnalysis(rec.analysis))) {
      const m = slot.contextMetric;
      if (!m) continue;
      const answered = rec.slots[slot.id];
      if (!answered || answered.status !== "confirmed") continue;
      const value = (answered.value ?? "").trim();
      if (!value) continue;
      ctx.metrics.push({ id: slot.id, label: m.label, value, ...(m.unit ? { unit: m.unit } : {}), status: "confirmed", source: "user_answer", category: m.category });
    }
    /*
     * 사용자가 확인한 파생값의 산출 근거.
     * 숫자 확인 화면에서 그대로 승인했을 때만 넣는다 — 사용자가 값을 고쳤다면
     * 그 산식은 더 이상 그 숫자의 근거가 아니므로 넣지 않는다(확인하지 않은 파생값 금지).
     */
    const pack = packForAnalysis(rec.analysis);
    const derived = pack.deriveVolume?.(numericSlots(rec.slots)) ?? null;
    const savedVolume = parseAmount(get("financials/revenue", "monthly_volume"));
    if (derived && savedVolume != null && savedVolume === derived.value) {
      ctx.metrics.push({ id: "derivedVolume", label: "월 판매량 산출 근거", value: derived.formula, status: "confirmed", source: "calculation", category: "capacity" });
    }
  }

  // unknown — 동적 질문에 "아직 모르겠어요"로 답한 것 + 핵심 축 중 비어 있는 것
  if (rec) {
    const labels = new Map(slotsForPack(packForAnalysis(rec.analysis)).map((s) => [s.id, s.label.replace(/\s*\(.*\)$/, "")]));
    for (const [id, s] of Object.entries(rec.slots)) {
      if (s.status === "unknown") ctx.unknowns.push({ field: id, label: labels.get(id) ?? id });
    }
  }
  const core: Array<[ContextField<unknown> | undefined, string, string]> = [
    [ctx.customer.target, "customer.target", "핵심 고객"],
    [ctx.problem.statement, "problem.statement", "고객의 문제"],
    [ctx.solution.mainOffer, "solution.mainOffer", "대표 상품·서비스"],
    [ctx.revenue.unitPrice, "revenue.unitPrice", "판매 가격"],
  ];
  for (const [f, field, label] of core) {
    if (f && f.status === "unknown" && !ctx.unknowns.some((u) => u.field === field)) ctx.unknowns.push({ field, label });
  }
  return ctx;
}

function safeFinancials(a: Answers): FinancialResult | null {
  try {
    const { inputs } = collectFinancialInputs(a);
    const r = calculateFinancials(inputs);
    return r.unit || r.breakEven || r.monthly.length ? r : null;
  } catch {
    return null;
  }
}

/** 태그 키 → 한국어 라벨 */
export function tagLabel(tag: string): string {
  return (MODEL_TAGS as Record<string, string>)[tag] ?? (OPERATION_TAGS as Record<string, string>)[tag] ?? tag;
}
