import type { MarketEvidence } from "../market/domain";
import type { MarketResearchBusinessContext } from "../market/openai-research";
import { projectForPlan } from "./project-bridge";
import { MODEL_TAGS, OPERATION_TAGS, readAnalysisRecord } from "./analyzer/domain";

/*
 * 사업계획서 ↔ 공식 시장조사 연결.
 *
 * 조사 자체는 기존 엔진(lib/market/openai-research.ts)이 한다. 여기는
 *   1) 플랜 답변 → 조사용 사업 정보 매핑
 *   2) 조사해도 될 만큼 정보가 있는지 판정
 *   3) 저장된 근거(projects.market_workspace)를 플랜에서 읽기
 *   4) 섹션마다 관련 근거만 고르기
 * 만 맡는다. 근거 원본은 projects.market_workspace.evidence 한 곳이다 —
 * 플랜 답변 안에 복제하지 않는다(스키마·검증·중복 제거를 한 벌로 쓰기 위해).
 */

type Answers = Record<string, Record<string, unknown>>;
type Business = { name?: string; description?: string; industry?: string; region?: string };

/** 답변 값 → 문장. 배열은 쉼표로 잇는다 */
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(", ");
  if (value == null) return "";
  return String(value).trim();
}

function first(...values: unknown[]): string {
  for (const v of values) {
    const t = text(v);
    if (t) return t;
  }
  return "";
}

/** __analysis 의 confirmed 값만 — 모양이 어긋나면 전부 빈 값 */
function confirmedAnalysis(a: Answers): { customer: string; problem: string; solution: string; tags: string } {
  const rec = readAnalysisRecord(a);
  const pick = (f: { value: unknown; status: string } | undefined) => (f && f.status === "confirmed" ? text(f.value) : "");
  if (!rec) return { customer: "", problem: "", solution: "", tags: "" };
  const an = rec.analysis;
  const tagLabels = [
    ...(an.modelTags.status === "confirmed" ? (an.modelTags.value ?? []).map((t) => MODEL_TAGS[t]) : []),
    ...(an.operationTags.status === "confirmed" ? (an.operationTags.value ?? []).map((t) => OPERATION_TAGS[t]) : []),
  ].filter(Boolean);
  return { customer: pick(an.customer), problem: pick(an.problem), solution: pick(an.solution), tags: tagLabels.join(", ") };
}

/** 시작 화면의 업종 9종 → 조사 엔진의 사업 유형 */
export const INDUSTRY_ARCHETYPE: Record<string, string> = {
  "카페·음식점": "local_retail",
  "오프라인 매장": "local_retail",
  "온라인 쇼핑몰": "ecommerce",
  "IT·앱·웹": "digital_service",
  "교육·강의": "professional_service",
  "서비스·용역": "professional_service",
  "콘텐츠·크리에이터": "professional_service",
  "제조·생산": "manufacturing",
  "기타": "undecided",
};

export function archetypeForIndustry(industry: string | undefined): string {
  return (industry && INDUSTRY_ARCHETYPE[industry]) || "undecided";
}

/**
 * 플랜 → 조사용 사업 정보.
 * 답변이 있으면 답변을, 없으면 사업 정보를 쓴다. 화면이 보낸 값은 쓰지 않는다 —
 * 서버에 저장된 플랜이 진짜 근거다.
 */
export function planResearchContext(
  plan: { title: string; answers: Answers },
  business: Business,
): MarketResearchBusinessContext {
  const a = plan.answers ?? {};
  /*
   * AI 사업 분석(__analysis)이 있으면 confirmed 값을 맨 앞에 둔다.
   * inferred 는 쓰지 않는다 — 검색어의 사실로 굳히면 안 된다. 분석이 없는
   * 옛 플랜은 아래 순서가 그대로라 동작이 변하지 않는다.
   */
  const confirmed = confirmedAnalysis(a);
  return {
    title: first(business.name, plan.title),
    sector: [text(business.industry), confirmed.tags].filter(Boolean).join(" · "),
    customer: first(confirmed.customer, a["market/segments"]?.first_target, a["market/personas"]?.situation, a["overview/summary"]?.buyer_type),
    problem: first(confirmed.problem, a["overview/problem"]?.problems, business.description),
    model: first(confirmed.solution, a["market/products"]?.main_offer, business.description),
    revenue: text(a["financials/revenue"]?.revenue_streams),
    region: text(business.region) || "대한민국",
    archetype: archetypeForIndustry(business.industry),
  };
}

export interface ResearchReadiness {
  ok: boolean;
  /** 비어 있는 필수 항목 */
  missing: string[];
  /** 있으면 더 정확해지는 항목 */
  recommended: string[];
  message: string;
}

/**
 * 조사해도 될 만큼 정보가 있는가.
 * 필수: 사업 설명 또는 상품 + 업종. 권장: 고객·문제·지역.
 * 너무 비어 있으면 검색을 부르지 않는다 — 엉뚱한 업종의 통계가 붙는다.
 */
export function researchReadiness(ctx: MarketResearchBusinessContext): ResearchReadiness {
  const missing: string[] = [];
  if (!ctx.model && !ctx.problem) missing.push("사업 설명 또는 상품·서비스");
  if (!ctx.sector) missing.push("업종");
  const recommended: string[] = [];
  if (!ctx.customer) recommended.push("고객");
  if (!ctx.problem) recommended.push("해결하려는 문제");
  if (!ctx.region || ctx.region === "대한민국") recommended.push("지역");
  const ok = missing.length === 0;
  const message = !ok
    ? `시장조사를 시작하려면 먼저 ${missing.join("과 ")}을(를) 입력해주세요.`
    : recommended.length
      ? `시장조사의 정확도를 높이려면 먼저 ${recommended.join("과 ")}을(를) 입력해주세요. 지금 바로 검색할 수도 있습니다.`
      : "";
  return { ok, missing, recommended, message };
}

/** 이 플랜에 저장된 공식 근거 — 프로젝트가 없으면 빈 배열 */
export async function loadPlanEvidence(planId: string, guestHash: string): Promise<MarketEvidence[]> {
  try {
    const project = await projectForPlan(planId, guestHash);
    return project?.marketWorkspace?.evidence ?? [];
  } catch {
    /* 근거를 못 읽었다고 생성을 막지 않는다 — 근거 없이 예전처럼 쓴다 */
    return [];
  }
}

/*
 * 섹션별 근거 배분 — 규칙으로만 고른다(LLM 분류 없음).
 * 키워드는 metric·title·note 를 합친 글에서 찾는다.
 */
const SECTION_RULES: Record<string, { keywords: RegExp; sourceTypes?: MarketEvidence["sourceType"][] }> = {
  "overview/problem": {
    keywords: /소비|지출|변화|증가|감소|추이|성장|이용|수요|문제|불편|만족|트렌드|비중|비율/,
  },
  "market/segments": {
    keywords: /인구|가구|세대|연령|고객|수요|이용|규모|시장|거주|유동|방문|회원|가입|세대수|매출액/,
  },
  "market/competitors": {
    keywords: /사업체|업체|점포|매장|업소|경쟁|업종|상가|창업|폐업|개업|점유|밀집|분포|사업자/,
    sourceTypes: ["competitor_check", "official_api"],
  },
};

/** 모든 근거를 받는 섹션 — 요약은 전체 맥락이 필요하다 */
const ALL_EVIDENCE_SECTIONS = new Set(["summary/executive"]);
const MAX_PER_SECTION = 6;

export function evidenceForSection(sectionKey: string, evidence: MarketEvidence[]): MarketEvidence[] {
  if (!evidence.length) return [];
  if (ALL_EVIDENCE_SECTIONS.has(sectionKey)) return rank(evidence).slice(0, MAX_PER_SECTION);
  const rule = SECTION_RULES[sectionKey];
  if (!rule) return [];
  const picked = evidence.filter((item) => {
    if (rule.sourceTypes?.includes(item.sourceType)) return true;
    return rule.keywords.test(`${item.metric} ${item.title} ${item.note}`);
  });
  return rank(picked).slice(0, MAX_PER_SECTION);
}

/** 숫자가 있는 것, 기준일이 최근인 것을 앞에 */
function rank(list: MarketEvidence[]): MarketEvidence[] {
  return [...list].sort((a, b) => {
    const na = a.numericValue != null ? 1 : 0, nb = b.numericValue != null ? 1 : 0;
    if (na !== nb) return nb - na;
    return (b.observedAt || "").localeCompare(a.observedAt || "");
  });
}

/** 섹션 생성 입력에 넣을 모양 — 프롬프트에 필요한 값만 */
export function toPromptEvidence(list: MarketEvidence[]) {
  return list.map((e) => ({
    metric: e.metric,
    value: e.value,
    unit: e.unit,
    sourceName: e.sourceName,
    sourceUrl: e.sourceUrl,
    /*
     * 검색일이 기준일 자리에 들어가지 않게 한다.
     *
     * 원문에서 기준일을 확인하지 못하면 저장할 때 검색한 날짜를 대신 넣는다
     * (스키마가 날짜를 요구한다). 그 값을 그대로 넘겼더니 본문에
     * "기준일 2026-08-23"으로 인쇄됐다 — 2023년 통계인데 오늘 날짜가 붙는다.
     * 수집일과 같으면 기준일을 모르는 것이므로 비워서 넘기고,
     * Writer 쪽 형식이 "원문 확인 필요"로 적게 둔다.
     */
    observedAt: e.observedAt && e.observedAt === (e.retrievedAt || "").slice(0, 10) ? "" : e.observedAt,
    note: e.note,
    verification: e.verification,
  }));
}

/** 이 섹션이 근거를 받는 섹션인가 — 화면에서 단추를 보일지 정할 때 쓴다 */
export function sectionUsesEvidence(sectionKey: string): boolean {
  return ALL_EVIDENCE_SECTIONS.has(sectionKey) || sectionKey in SECTION_RULES;
}

/** 화면에서 '공식 시장자료 자동검색' 단추를 두는 섹션 */
export const RESEARCH_BUTTON_SECTIONS = ["overview/problem", "market/segments", "market/competitors"] as const;
