// 섹션별 질문 스키마 — 레퍼런스의 "분기형 질문 + 질문별 AI 추천" 구조를 오늘창업 오리지널로.
// key = `${chapterId}/${sectionId}`. 정의 없으면 defaultGroups() 사용.
//
// 핵심 매커니즘(레퍼런스 학습):
//  - showWhen: 이전 답변이 특정 값일 때만 이 질문을 노출(예: 상품 있음=예 → 상품 그룹 질문 등장).
//  - aiSuggest: 이 질문에 대해 AI가 답안 후보를 "제한된 프롬프트"로 추천(선택형/텍스트 채우기).

export type QuestionInput =
  | { kind: "yesno" }
  | { kind: "single"; options: string[] }
  | { kind: "multi"; options: string[]; max?: number }
  | { kind: "text"; placeholder?: string; long?: boolean }
  | { kind: "select"; options: string[] };

export interface QuestionDef {
  id: string;
  q: string;
  help?: string;
  input: QuestionInput;
  /** Skip 가능(불확실 항목) */
  optional?: boolean;
  /** 조건부 표시(분기): 지정한 질문의 답이 equals와 일치할 때만 노출 */
  showWhen?: { qid: string; equals: string | string[] };
  /** AI가 이 질문의 답안 후보를 추천(제한된 프롬프트). text/single/multi에 적합 */
  aiSuggest?: boolean;
}

export interface QuestionGroup {
  id: string;
  label: string;
  questions: QuestionDef[];
}

// 한눈에 보기(사업 개요) — 분기 + AI 추천을 포함한 레퍼런스 구조 재현
const SUMMARY_GROUPS: QuestionGroup[] = [
  {
    id: "status",
    label: "사업 현황",
    questions: [
      { id: "established", q: "사업체를 이미 시작하셨나요?", help: "사업자 등록·매장 계약·직원 채용 등 운영 단계에 들어섰다면 '예'.", input: { kind: "yesno" } },
      // 분기: 시작했을 때만 시점 질문
      { id: "started_when", q: "언제 시작하셨나요?", help: "직원이 처음 근무했거나 매장을 연 시점 기준.", input: { kind: "select", options: ["2026년", "2025년", "2024년", "그 이전"] }, showWhen: { qid: "established", equals: "yes" } },
      { id: "revenue", q: "매출이 발생한 적 있나요?", help: "시범 판매·선주문 등 어떤 형태로든 수익이 있었다면 '예'.", input: { kind: "yesno" } },
      // 분기: 매출 있을 때만 규모 질문
      { id: "revenue_scale", q: "지금까지의 대략적인 매출 규모는?", help: "정확하지 않아도 됩니다. 대략의 구간을 골라주세요.", input: { kind: "single", options: ["100만원 미만", "100만~1천만원", "1천만~1억원", "1억원 이상"] }, showWhen: { qid: "revenue", equals: "yes" }, optional: true },
    ],
  },
  {
    id: "customer",
    label: "핵심 고객",
    questions: [
      { id: "buyer_type", q: "주로 어떤 고객을 대상으로 하나요?", help: "해당하는 대상을 모두 선택하세요.", input: { kind: "multi", options: ["개인 소비자 (B2C)", "사업자 (B2B)"] } },
    ],
  },
  {
    id: "legal",
    label: "사업자 형태",
    questions: [
      { id: "structure", q: "사업자 형태는 무엇인가요?", help: "아직 미정이라면 계획 중인 형태를 선택하세요.", input: { kind: "single", options: ["개인사업자", "공동사업", "법인", "기타"] } },
    ],
  },
  {
    id: "location",
    label: "위치와 범위",
    questions: [
      { id: "city", q: "사업장은 어느 지역인가요?", help: "여러 곳이라면 본점 기준.", input: { kind: "text", placeholder: "예: 서울 마포구" } },
      { id: "reach", q: "주요 영업 범위는 어디까지인가요?", help: "주 고객이 오는 범위.", input: { kind: "single", options: ["동네·지역", "전국", "온라인 중심"] } },
    ],
  },
  {
    id: "offering",
    label: "상품·서비스",
    questions: [
      { id: "has_products", q: "판매하는 상품이 있나요?", help: "직접 만들거나 매입해 파는 물건이 있으면 '예'.", input: { kind: "yesno" } },
      // 분기 + AI 추천: 상품 있을 때만, 그룹 분류를 AI가 추천
      { id: "product_groups", q: "상품을 어떻게 분류하면 좋을까요?", help: "비슷한 상품끼리 묶어 그룹으로. 'AI 추천'을 눌러 후보를 받아보세요.", input: { kind: "multi", options: [] }, showWhen: { qid: "has_products", equals: "yes" }, aiSuggest: true },
      { id: "has_services", q: "제공하는 서비스가 있나요?", help: "공간·컨설팅·구독 등 무형 서비스가 있으면 '예'.", input: { kind: "yesno" } },
    ],
  },
  {
    id: "value",
    label: "가치 제안",
    questions: [
      // AI 추천: 가치 제안 후보를 AI가 추천(레퍼런스의 vision/value 추천과 동일)
      { id: "value_prop", q: "이 사업이 고객에게 주는 핵심 가치는 무엇인가요?", help: "경쟁 대비 우리를 선택할 이유. 'AI 추천'으로 후보 문장을 받아 다듬어보세요.", input: { kind: "text", placeholder: "예: 검증된 절차와 완료 기록으로 신뢰를 제공합니다.", long: true }, aiSuggest: true },
    ],
  },
];

// 정의되지 않은 섹션용 기본 질문
function defaultGroups(sectionTitle: string): QuestionGroup[] {
  return [
    {
      id: "core",
      label: "핵심 정보",
      questions: [
        { id: "focus", q: `'${sectionTitle}'에서 가장 강조하고 싶은 점은 무엇인가요?`, help: "핵심 메시지를 한두 문장으로. 'AI 추천'으로 후보를 받아볼 수 있어요.", input: { kind: "text", placeholder: "핵심 내용을 입력하세요", long: true }, aiSuggest: true },
        { id: "detail", q: "구체적인 근거나 계획이 있다면 알려주세요.", help: "숫자·일정·사례 등. 없으면 비워 두어도 됩니다.", input: { kind: "text", placeholder: "선택 입력", long: true }, optional: true },
      ],
    },
  ];
}

const SECTION_QUESTIONS: Record<string, QuestionGroup[]> = {
  "overview/summary": SUMMARY_GROUPS,
};

export function questionsForSection(key: string, sectionTitle: string): QuestionGroup[] {
  return SECTION_QUESTIONS[key] ?? defaultGroups(sectionTitle);
}

/** 조건부(showWhen) 평가: 현재 답변 기준으로 이 질문이 보여야 하는지 */
export function isVisible(q: QuestionDef, answers: Record<string, unknown>): boolean {
  if (!q.showWhen) return true;
  const v = answers[q.showWhen.qid];
  const target = q.showWhen.equals;
  if (Array.isArray(target)) return typeof v === "string" && target.includes(v);
  return v === target;
}

/** 현재 보이는 필수 질문 수 (optional·숨김 제외) */
export function visibleRequiredCount(groups: QuestionGroup[], answers: Record<string, unknown>): number {
  return groups.reduce(
    (n, g) => n + g.questions.filter((q) => !q.optional && isVisible(q, answers)).length,
    0
  );
}
