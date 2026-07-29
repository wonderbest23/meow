// 플랜 빌더 청사진 — 챕터 / 섹션 구조 정의 (오늘창업)
//
// 레퍼런스(VenturePlanner)의 7챕터·26섹션 구조를 학습해 오늘창업 오리지널 명칭으로 재구성.
// 이 config가 플랜 개요 화면, 섹션 질문 위저드, 섹션 생성의 단일 소스입니다.
// 6-stage 엔진(project_stages / stage_artifacts)을 이 트리로 일반화합니다.

export type PlanSectionStatus =
  | "empty" // 아직 답변/생성 없음
  | "in_progress" // 질문 일부 답변
  | "answered" // 질문 완료, 생성 대기
  | "generating" // 생성 중
  | "done"; // 생성 완료

export interface PlanSectionDef {
  /** 안정적 식별자 (저장 키 / 라우트 세그먼트) */
  id: string;
  /** 사용자에게 보이는 섹션명 */
  title: string;
  /** 한 줄 설명 (개요/툴팁) */
  summary: string;
  /** 예상 소요(분) */
  estMinutes: number;
}

export interface PlanChapterDef {
  id: string;
  /** 챕터명 (2줄 표기용으로 lead/rest 분리) */
  title: string;
  lead: string;
  rest: string;
  /** 개요 화면 밴드 색조 인덱스 (1~6) */
  tone: number;
  sections: PlanSectionDef[];
}

export const PLAN_BLUEPRINT: PlanChapterDef[] = [
  {
    id: "overview",
    title: "사업 개요",
    lead: "사업",
    rest: "개요",
    tone: 1,
    sections: [
      { id: "summary", title: "한눈에 보기", summary: "사업 모델·핵심 제공가치·경쟁우위를 한 번에 정리", estMinutes: 5 },
      { id: "problem", title: "문제와 해결", summary: "고객이 겪는 문제와 우리의 해결 방식", estMinutes: 5 },
      { id: "mission", title: "미션·비전·가치", summary: "존재 이유, 장기 비전, 핵심 가치", estMinutes: 5 },
      { id: "ip", title: "지식재산", summary: "기술·데이터·프로세스 등 보호 자산", estMinutes: 5 },
      { id: "achievements", title: "주요 성과", summary: "지금까지의 성과·마일스톤(초기엔 준비 단계)", estMinutes: 5 },
      { id: "structure", title: "조직·지분", summary: "사업자 형태, 지분 구조, 이해관계자", estMinutes: 3 },
    ],
  },
  {
    id: "market",
    title: "고객과 시장",
    lead: "고객과",
    rest: "시장",
    tone: 2,
    sections: [
      { id: "products", title: "상품·서비스", summary: "제공하는 상품과 서비스 구성", estMinutes: 5 },
      { id: "segments", title: "시장 세그먼트", summary: "목표 시장을 세분화하고 우선순위 결정", estMinutes: 5 },
      { id: "personas", title: "핵심 고객", summary: "대표 고객 페르소나와 구매 여정", estMinutes: 5 },
      { id: "competitors", title: "경쟁 분석", summary: "현재 대안·경쟁 구도와 우리의 차별점", estMinutes: 10 },
      { id: "swot", title: "SWOT", summary: "강점·약점·기회·위협 분석", estMinutes: 5 },
    ],
  },
  {
    id: "objectives",
    title: "목표",
    lead: "핵심",
    rest: "목표",
    tone: 3,
    sections: [
      { id: "corporate", title: "핵심 목표", summary: "측정 가능한 주요·부차 목표", estMinutes: 10 },
    ],
  },
  {
    id: "strategy",
    title: "사업 전략",
    lead: "사업",
    rest: "전략",
    tone: 4,
    sections: [
      { id: "product", title: "상품 전략", summary: "핵심 가치 제안과 상품 방향", estMinutes: 8 },
      { id: "distribution", title: "유통 전략", summary: "판매·전달 채널과 시장 커버리지", estMinutes: 8 },
      { id: "price", title: "가격 전략", summary: "가격 책정 방식과 전술", estMinutes: 8 },
      { id: "promotion", title: "홍보 전략", summary: "홍보 활동·채널·메시지·예산", estMinutes: 8 },
      { id: "people", title: "인력 전략", summary: "조직 구성·채용·보상·문화", estMinutes: 8 },
      { id: "exit", title: "출구 전략", summary: "투자 회수·매각 등 장기 시나리오", estMinutes: 6 },
    ],
  },
  {
    id: "funding",
    title: "자금",
    lead: "자금",
    rest: "소요",
    tone: 5,
    sections: [
      { id: "requirements", title: "자금 소요", summary: "필요 자금 규모와 사용처", estMinutes: 5 },
    ],
  },
  {
    id: "financials",
    title: "재무 계획",
    lead: "재무",
    rest: "계획",
    tone: 6,
    sections: [
      { id: "revenue", title: "매출", summary: "매출원과 12개월 예측", estMinutes: 6 },
      { id: "staffing", title: "인건비", summary: "인력 계획과 인건비 추정", estMinutes: 5 },
      { id: "expenses", title: "비용", summary: "고정비·변동비 구조", estMinutes: 5 },
      { id: "assets", title: "자산", summary: "고정·유동 자산 구성", estMinutes: 5 },
      { id: "financing", title: "자금 조달", summary: "조달 방식·시점·손익/재무상태 요약", estMinutes: 6 },
    ],
  },
  {
    id: "summary",
    title: "요약·다음 단계",
    lead: "요약·",
    rest: "다음 단계",
    tone: 1,
    sections: [
      { id: "executive", title: "실행 요약", summary: "계획 전체를 한 장으로 압축", estMinutes: 5 },
    ],
  },
];

/** 섹션 전역 식별자: `${chapterId}/${sectionId}` (라우트/저장 키) */
export function sectionKey(chapterId: string, sectionId: string): string {
  return `${chapterId}/${sectionId}`;
}

/** 전체 섹션 수 */
export function totalSections(): number {
  return PLAN_BLUEPRINT.reduce((n, ch) => n + ch.sections.length, 0);
}

/** 순번(1부터) 매기기 위한 평탄화 목록 */
export function flatSections(): Array<{
  chapter: PlanChapterDef;
  section: PlanSectionDef;
  index: number; // 1-based 전역 순번
  key: string;
}> {
  const out: Array<{ chapter: PlanChapterDef; section: PlanSectionDef; index: number; key: string }> = [];
  let i = 1;
  for (const chapter of PLAN_BLUEPRINT) {
    for (const section of chapter.sections) {
      out.push({ chapter, section, index: i, key: sectionKey(chapter.id, section.id) });
      i += 1;
    }
  }
  return out;
}

/**
 * 플랜 유형별 섹션 구성.
 * 값이 없는 유형(또는 예전 플랜)은 전체 25개를 쓴다.
 * 키는 플랜에 저장되는 planType 문자열과 같아야 한다.
 */
export const PLAN_TYPE_SECTIONS: Record<string, string[]> = {
  // 창업 초기·성장 확장 사업계획서는 전체 구성을 쓴다(목록에 넣지 않음).
  "간단 · 사업계획서": [
    "overview/summary",
    "overview/problem",
    "market/products",
    "market/personas",
    "market/competitors",
    "objectives/corporate",
    "strategy/promotion",
    "financials/revenue",
    "financials/expenses",
    "summary/executive",
  ],
  "내부용 · 사업계획서": [
    "overview/summary",
    "overview/mission",
    "overview/structure",
    "market/segments",
    "market/competitors",
    "market/swot",
    "objectives/corporate",
    "strategy/product",
    "strategy/distribution",
    "strategy/promotion",
    "strategy/people",
    "summary/executive",
  ],
  "창업 초기 · 재무 예측": [
    "overview/summary",
    "market/products",
    "market/segments",
    "objectives/corporate",
    "strategy/price",
    "funding/requirements",
    "financials/revenue",
    "financials/staffing",
    "financials/expenses",
    "financials/assets",
    "financials/financing",
    "summary/executive",
  ],
  "정밀 · 재무 모델": [
    "overview/summary",
    "market/products",
    "market/segments",
    "market/competitors",
    "objectives/corporate",
    "strategy/price",
    "strategy/distribution",
    "strategy/exit",
    "funding/requirements",
    "financials/revenue",
    "financials/staffing",
    "financials/expenses",
    "financials/assets",
    "financials/financing",
    "summary/executive",
  ],
};

/** 이 유형이 포함하는 섹션 키 집합. 정의가 없으면 전체. */
export function sectionKeysForType(planType?: string): Set<string> | null {
  const list = planType ? PLAN_TYPE_SECTIONS[planType] : undefined;
  return list ? new Set(list) : null;
}

/**
 * 유형에 맞게 걸러낸 챕터 목록.
 * 섹션이 하나도 없는 챕터는 빠지고, 챕터·섹션 순서는 원래 청사진을 따른다.
 */
export function chaptersForType(planType?: string): PlanChapterDef[] {
  const keys = sectionKeysForType(planType);
  if (!keys) return PLAN_BLUEPRINT;
  const out: PlanChapterDef[] = [];
  for (const ch of PLAN_BLUEPRINT) {
    const sections = ch.sections.filter((s) => keys.has(sectionKey(ch.id, s.id)));
    if (sections.length) out.push({ ...ch, sections });
  }
  return out;
}

/** 유형별 섹션 개수 */
export function sectionCountForType(planType?: string): number {
  return chaptersForType(planType).reduce((n, ch) => n + ch.sections.length, 0);
}
