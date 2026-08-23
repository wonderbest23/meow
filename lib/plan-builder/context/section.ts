/*
 * 섹션별 Context 분배 — 25개 섹션에 전체를 다 넣지 않는다.
 *
 * 전체를 넣으면 토큰이 늘고, 같은 문장이 열 번 반복되고, 섹션의 역할이 흐려진다.
 * 섹션마다 "이 섹션의 관점을 잡는 데 필요한 필드"만 고르고, 그 안에서도
 * confirmed 와 inferred 를 갈라서 준다. 어떤 섹션(성과·미션·출구)은 추론을 아예 주지 않는다 —
 * 없는 성과·철학·출구 전략을 AI가 만들어내는 입구가 되기 때문이다.
 */
import type { BusinessMetric, ContextField, PlanBusinessContext } from "./build";
import type { MetricCategory } from "../analyzer/packs";
import { tagLabel } from "./build";

/** Writer 에게 실제로 넘어가는 모양 */
export interface SectionBusinessContext {
  confirmed: Array<{ label: string; value: string }>;
  inferred: Array<{ label: string; value: string }>;
  /** 사업모델 태그에서 나온 "이 사업에서 생각할 것" 힌트 — 사실이 아니라 관점 */
  hints: string[];
  unknowns: string[];
  /** 사용자가 확정한 사업 고유 지표 — 이 섹션에 필요한 종류만, 상한만큼 */
  metrics: BusinessMetric[];
  /** 재무 요약 (재무·요약 섹션만) */
  finance?: string;
}

type Path = string; // "customer.target"

interface Rule {
  fields: Path[];
  /** 이 섹션에 넘길 지표 종류. 없으면 지표를 넘기지 않는다 */
  metrics?: MetricCategory[];
  /** 지표 상한 (기본 4) — 숫자가 한 섹션에 몰려 본문이 표 낭독이 되지 않게 */
  metricLimit?: number;
  /** 추론값을 아예 주지 않는 섹션 */
  noInferred?: boolean;
  /** 태그 힌트를 주는 섹션 */
  hints?: boolean;
  finance?: boolean;
}

const LABELS: Record<Path, string> = {
  "identity.industry": "사업 유형",
  "identity.stage": "진행 단계",
  "identity.region": "지역",
  "identity.description": "사업 설명",
  "classification.modelTags": "수익 구조 태그",
  "classification.operationTags": "운영 특성 태그",
  "customer.target": "핵심 고객",
  "customer.persona": "고객 상황",
  "customer.budget": "고객 예산",
  "customer.channels": "고객이 있는 곳",
  "problem.statement": "고객의 문제",
  "problem.frequency": "문제 빈도",
  "problem.currentAlternative": "현재 대안",
  "solution.mainOffer": "핵심 상품·서비스",
  "solution.description": "상품 구성",
  "solution.differentiator": "차별점",
  "revenue.model": "수익 구조",
  "revenue.streams": "매출 방식",
  "revenue.unitPrice": "판매 가격",
  "revenue.volume": "월 판매량(사용자 확인)",
  "operations.delivery": "전달 방식",
  "operations.coverage": "영업 범위",
  "operations.venueType": "공간 방식",
  "operations.capacity": "수용 한계",
  "operations.who": "실제 업무 수행",
  "marketing.channels": "홍보 채널",
  "marketing.acquisitionModel": "고객 유입 방식",
  "marketing.message": "핵심 메시지",
  "marketing.budget": "홍보 예산",
  "competition.alternatives": "고객의 대안",
  "competition.knownCompetitors": "경쟁 메모",
  "competition.differentiator": "차별점",
  "traction.established": "사업 시작 여부",
  "traction.hasRevenue": "매출 발생 여부",
  "traction.items": "지금까지의 성과",
  "team.size": "팀 규모",
  "team.ownerExperience": "대표자 관련 경험",
  "funding.needs": "외부 자금 필요",
  "funding.amount": "필요 자금",
  "funding.use": "자금 용도",
  "goals.horizon": "목표 기간",
  "goals.main": "주요 목표",
  "goals.constraint": "제약",
};

/** 한 섹션에 넘길 지표 기본 상한 */
export const DEFAULT_METRIC_LIMIT = 4;

const CORE: Path[] = ["identity.industry", "customer.target", "problem.statement", "solution.mainOffer", "revenue.model", "operations.delivery"];

export const SECTION_CONTEXT_RULES: Record<string, Rule> = {
  "overview/summary": { fields: [...CORE, "identity.region", "identity.stage", "marketing.acquisitionModel", "revenue.unitPrice", "revenue.volume", "classification.modelTags"], hints: true, finance: true, metrics: ["revenue", "traffic", "conversion", "capacity", "cost"], metricLimit: 6 },
  "overview/problem": { fields: ["customer.target", "problem.statement", "problem.frequency", "problem.currentAlternative", "solution.mainOffer", "solution.differentiator"] },
  "overview/mission": { fields: ["identity.description", "problem.statement", "solution.mainOffer"], noInferred: true },
  "overview/ip": { fields: ["solution.mainOffer", "solution.differentiator"], noInferred: true },
  "overview/achievements": { fields: ["identity.stage", "traction.established", "traction.hasRevenue", "traction.items"], noInferred: true },
  "overview/structure": { fields: ["team.size", "operations.who", "identity.stage"], noInferred: true },
  "market/products": { fields: ["solution.mainOffer", "solution.description", "solution.differentiator", "revenue.unitPrice", "revenue.model", "classification.modelTags"], hints: true, metrics: ["revenue", "capacity", "cost"] },
  "market/segments": { fields: ["customer.target", "customer.persona", "identity.region", "operations.coverage", "classification.operationTags"], metrics: ["traffic", "conversion", "capacity"] },
  "market/personas": { fields: ["customer.target", "customer.persona", "customer.budget", "customer.channels", "marketing.acquisitionModel", "problem.statement"], metrics: ["traffic", "conversion"] },
  "market/competitors": { fields: ["competition.alternatives", "competition.knownCompetitors", "competition.differentiator", "solution.mainOffer", "customer.target"] },
  "market/swot": { fields: ["identity.industry", "solution.mainOffer", "solution.differentiator", "operations.delivery", "operations.capacity", "team.ownerExperience", "goals.constraint"], noInferred: true },
  "objectives/corporate": { fields: ["identity.stage", "goals.horizon", "goals.main", "goals.constraint", "revenue.volume"], noInferred: true },
  "strategy/product": { fields: ["solution.mainOffer", "solution.description", "solution.differentiator", "classification.modelTags", "customer.target"], hints: true },
  "strategy/distribution": { fields: ["operations.delivery", "operations.coverage", "operations.venueType", "operations.capacity", "revenue.model", "classification.operationTags"], hints: true, metrics: ["capacity", "operation", "traffic"] },
  "strategy/price": { fields: ["revenue.unitPrice", "revenue.model", "customer.budget", "solution.mainOffer", "classification.modelTags"], hints: true, finance: true, metrics: ["revenue", "cost", "conversion"] },
  "strategy/promotion": { fields: ["customer.target", "marketing.channels", "marketing.acquisitionModel", "marketing.message", "marketing.budget", "customer.channels", "classification.operationTags"], hints: true, metrics: ["traffic", "conversion", "cost"] },
  "strategy/people": { fields: ["team.size", "operations.who", "operations.capacity", "team.ownerExperience", "classification.operationTags"], hints: true, metrics: ["capacity", "operation"] },
  "strategy/exit": { fields: ["identity.stage", "revenue.model"], noInferred: true },
  "funding/requirements": { fields: ["identity.stage", "funding.needs", "funding.amount", "funding.use", "revenue.model"], noInferred: true, finance: true },
  "financials/revenue": { fields: ["revenue.model", "revenue.streams", "revenue.unitPrice", "revenue.volume", "operations.capacity", "classification.modelTags"], hints: true, finance: true, metrics: ["revenue", "traffic", "conversion", "capacity"], metricLimit: 6 },
  "financials/staffing": { fields: ["operations.who", "team.size", "operations.capacity"], finance: true, metrics: ["capacity", "operation"] },
  "financials/expenses": { fields: ["operations.venueType", "operations.delivery", "classification.modelTags", "marketing.budget"], hints: true, finance: true, metrics: ["cost", "operation"] },
  "financials/assets": { fields: ["operations.venueType", "operations.delivery", "identity.stage"], finance: true },
  "financials/financing": { fields: ["funding.needs", "funding.amount", "identity.stage"], noInferred: true, finance: true },
  "summary/executive": { fields: [...CORE, "identity.region", "solution.differentiator", "marketing.acquisitionModel", "revenue.unitPrice", "revenue.volume", "team.ownerExperience", "funding.needs", "goals.main"], hints: true, finance: true, metrics: ["revenue", "traffic", "conversion", "capacity", "cost"], metricLimit: 6 },
};

/** 사업모델 태그 → Writer 가 그 사업답게 생각하도록 하는 관점 힌트 (사실이 아니라 체크리스트) */
const MODEL_HINTS: Record<string, string> = {
  class: "클래스 사업: 정원·수업 횟수·공간 확보·예약 방식·1인당 재료비·강사 역량이 매출과 비용을 결정한다. 값이 없으면 무엇을 정해야 하는지만 쓰고 숫자는 만들지 않는다.",
  commerce: "온라인 판매: 방문자·구매 전환·객단가·상품 원가·포장/배송·광고비가 핵심 변수다. 전환율·방문자 수는 사용자가 적지 않았다면 만들지 않는다.",
  subscription: "구독 사업: 반복 매출·유지율·이탈·무료→유료 전환이 핵심이다. 이탈률·전환율 숫자는 사용자가 적지 않았다면 만들지 않는다.",
  commission: "중개·수수료 사업: 거래액·수수료율·공급자와 수요자 양쪽 확보가 핵심이다.",
  service_hour: "시간·건당 용역: 건당 단가·월 처리 건수·1인 처리 한계·외주 여부가 핵심이다.",
  seat: "좌석·공간형 사업: 좌석 수·회전율·영업일·객단가·임대료가 핵심이다.",
  unit_sale: "1회성 판매: 판매 단가·월 판매 건수·건당 원가·고정비가 핵심이다.",
  franchise: "가맹 사업: 가맹비·로열티·점포 수·본부 지원 역량이 핵심이다.",
  ad_content: "콘텐츠·광고 수익: 조회수·단가·협찬·제작 주기가 핵심이다.",
};

function read(ctx: PlanBusinessContext, path: Path): ContextField<unknown> | undefined {
  const [g, k] = path.split(".");
  const group = (ctx as unknown as Record<string, Record<string, ContextField<unknown> | undefined>>)[g];
  return group?.[k];
}

function show(path: Path, v: unknown): string {
  if (Array.isArray(v)) {
    const arr = v.map(String);
    return path.startsWith("classification.") ? arr.map(tagLabel).join(", ") : arr.join(", ");
  }
  return String(v);
}

/** 이 섹션에 넘길 Context. 규칙이 없는 섹션은 undefined — 예전과 똑같이 생성된다 */
export function contextForSection(sectionKey: string, ctx: PlanBusinessContext | null | undefined): SectionBusinessContext | undefined {
  if (!ctx) return undefined;
  const rule = SECTION_CONTEXT_RULES[sectionKey];
  if (!rule) return undefined;

  const confirmed: SectionBusinessContext["confirmed"] = [];
  const inferred: SectionBusinessContext["inferred"] = [];
  for (const path of rule.fields) {
    const f = read(ctx, path);
    if (!f || f.value == null || f.status === "unknown") continue;
    const item = { label: LABELS[path] ?? path, value: show(path, f.value) };
    if (f.status === "confirmed") confirmed.push(item);
    else if (!rule.noInferred) inferred.push(item);
  }

  const hints: string[] = [];
  if (rule.hints) {
    const tags = ctx.classification.modelTags?.value ?? [];
    for (const t of tags) if (MODEL_HINTS[t]) hints.push(MODEL_HINTS[t]);
  }

  /*
   * 지표는 이 섹션이 요청한 종류만, 상한만큼. 상한을 두는 이유는 숫자가 몰리면
   * 본문이 값 낭독으로 변하기 때문이다. 규칙 순서대로 담아 중요한 종류가 먼저 들어간다.
   */
  const metrics: BusinessMetric[] = [];
  if (rule.metrics?.length) {
    const limit = rule.metricLimit ?? DEFAULT_METRIC_LIMIT;
    for (const category of rule.metrics) {
      for (const m of ctx.metrics) {
        if (m.category !== category || metrics.some((x) => x.id === m.id)) continue;
        if (metrics.length >= limit) break;
        metrics.push(m);
      }
    }
  }

  const unknowns = ctx.unknowns.map((u) => u.label);
  const out: SectionBusinessContext = { confirmed, inferred, hints, unknowns, metrics };
  if (rule.finance && ctx.finance.summary) out.finance = ctx.finance.summary;
  if (!confirmed.length && !inferred.length && !hints.length && !metrics.length && !out.finance) return undefined;
  return out;
}
