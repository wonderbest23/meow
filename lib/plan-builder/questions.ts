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

// 1.2 문제와 해결 — 문제 정의(AI추천 다중선택) → 각 문제의 해결 방식
const PROBLEM_GROUPS: QuestionGroup[] = [
  {
    id: "problem",
    label: "고객이 겪는 문제",
    questions: [
      { id: "problems", q: "목표 고객이 겪는 대표적인 문제는 무엇인가요?", help: "가장 자주 마주치는 어려움을 고르거나 'AI 추천'으로 후보를 받아보세요.", input: { kind: "multi", options: [], max: 4 }, aiSuggest: true },
      { id: "problem_freq", q: "이 문제는 얼마나 자주 발생하나요?", help: "반복성이 높을수록 사업 기회가 큽니다.", input: { kind: "single", options: ["매일·매주 반복", "월 1~2회", "가끔·비정기", "아직 확인 못함"] } },
      { id: "current_alt", q: "고객은 지금 이 문제를 어떻게 해결하고 있나요?", help: "현재 대안(경쟁 상대)을 적어주세요. 사람·도구·직접 해결 모두 포함.", input: { kind: "text", placeholder: "예: 지인 부탁, 검색 후 개별 문의", long: true }, aiSuggest: true },
    ],
  },
  {
    id: "solution",
    label: "우리의 해결 방식",
    questions: [
      { id: "solutions", q: "우리는 이 문제를 어떤 방식으로 해결하나요?", help: "핵심 해결책을 고르거나 AI 추천을 받아 다듬어보세요.", input: { kind: "multi", options: [], max: 4 }, aiSuggest: true },
      { id: "why_better", q: "기존 대안보다 나은 점은 무엇인가요?", help: "속도·가격·신뢰·편의 등 구체적으로.", input: { kind: "text", placeholder: "예: 당일 연결과 완료 기록 제공", long: true } },
    ],
  },
];

// 1.3 미션·비전·가치 — 창업 스토리 분기 + 가치 다중선택 + 비전 AI추천
const MISSION_GROUPS: QuestionGroup[] = [
  {
    id: "purpose",
    label: "존재 이유",
    questions: [
      { id: "has_story", q: "창업하게 된 특별한 계기나 스토리가 있나요?", help: "개인적 경험에서 출발했다면 '예'.", input: { kind: "yesno" } },
      { id: "story", q: "그 계기를 간단히 들려주세요.", help: "실제 경험은 계획서에 설득력을 더합니다.", input: { kind: "text", placeholder: "예: 반려동물을 맡길 곳이 없어 곤란했던 경험에서 시작", long: true }, showWhen: { qid: "has_story", equals: "yes" } },
      { id: "purpose", q: "이 사업이 존재하는 이유를 한 문장으로 적는다면?", help: "'AI 추천'으로 후보 문장을 받아 다듬어보세요.", input: { kind: "text", placeholder: "예: 급할 때도 믿을 수 있는 돌봄을 연결합니다", long: true }, aiSuggest: true },
    ],
  },
  {
    id: "values",
    label: "핵심 가치",
    questions: [
      { id: "values", q: "우리가 지키려는 핵심 가치는 무엇인가요?", help: "3~5개를 고르세요.", input: { kind: "multi", options: ["신뢰", "정확", "품질", "존중", "도전", "책임", "투명", "속도", "지속가능"], max: 5 } },
    ],
  },
  {
    id: "vision",
    label: "비전",
    questions: [
      { id: "vision", q: "3~5년 뒤 어떤 모습이 되길 바라나요?", help: "장기 목표. 'AI 추천'으로 후보를 받아보세요.", input: { kind: "text", placeholder: "예: 우리 지역에서 가장 신뢰받는 돌봄 연결 서비스", long: true }, aiSuggest: true },
    ],
  },
];

// 1.4 지식재산 — 보유 여부 분기 → 유형별 상세
const IP_GROUPS: QuestionGroup[] = [
  {
    id: "ip",
    label: "지식재산 보유",
    questions: [
      { id: "has_ip", q: "보호하고 싶은 기술·브랜드·데이터가 있나요?", help: "특허·상표·노하우·데이터베이스 등 무형 자산 포함.", input: { kind: "yesno" } },
      { id: "ip_types", q: "어떤 유형인가요?", help: "해당하는 것을 모두 고르세요.", input: { kind: "multi", options: ["상표(브랜드명·로고)", "특허·실용신안", "영업비밀·노하우", "데이터베이스", "디자인권", "저작물(콘텐츠·소프트웨어)"] }, showWhen: { qid: "has_ip", equals: "yes" } },
      { id: "ip_status", q: "현재 권리 상태는?", help: "출원·등록 여부를 알려주세요.", input: { kind: "single", options: ["아직 준비 전", "출원 준비 중", "출원 완료", "등록 완료"] }, showWhen: { qid: "has_ip", equals: "yes" } },
      { id: "ip_moat", q: "이 자산이 경쟁 우위에 어떻게 기여하나요?", help: "모방이 어려운 이유를 적어주세요.", input: { kind: "text", placeholder: "예: 축적된 검증 데이터로 매칭 정확도가 높아짐", long: true }, showWhen: { qid: "has_ip", equals: "yes" }, aiSuggest: true },
      { id: "ip_plan", q: "앞으로 어떤 보호 조치를 계획하고 있나요?", help: "지금 없더라도 계획을 적으면 됩니다.", input: { kind: "text", placeholder: "예: 상표 출원 후 계약서에 비밀유지 조항 추가", long: true }, showWhen: { qid: "has_ip", equals: "no" }, optional: true },
    ],
  },
];

// 1.5 주요 성과 — 운영 여부 분기(성과 vs 준비 단계)
const ACHIEVEMENT_GROUPS: QuestionGroup[] = [
  {
    id: "traction",
    label: "지금까지의 성과",
    questions: [
      { id: "has_traction", q: "지금까지 이룬 성과가 있나요?", help: "매출·고객·시제품·제휴·수상 등 무엇이든.", input: { kind: "yesno" } },
      { id: "traction_types", q: "어떤 성과인가요?", help: "해당하는 것을 모두 고르세요.", input: { kind: "multi", options: ["실제 판매·매출 발생", "고객 확보", "시제품·MVP 완성", "제휴·협약 체결", "수상·선정 이력", "투자 유치"] }, showWhen: { qid: "has_traction", equals: "yes" } },
      { id: "traction_detail", q: "가장 의미 있는 성과를 구체적으로 알려주세요.", help: "숫자가 있으면 함께 적어주세요(검증 가능한 값만).", input: { kind: "text", placeholder: "예: 시범 운영으로 유료 고객 8명 확보", long: true }, showWhen: { qid: "has_traction", equals: "yes" } },
      { id: "prep_progress", q: "현재까지 준비한 것들을 알려주세요.", help: "시장 조사, 인터뷰, 공간 계약 등 준비 단계도 성과입니다.", input: { kind: "text", placeholder: "예: 고객 인터뷰 12건 완료, 입지 후보 3곳 조사", long: true }, showWhen: { qid: "has_traction", equals: "no" }, aiSuggest: true },
    ],
  },
];

// 1.6 조직·지분 — 형태·구성원·지분
const STRUCTURE_GROUPS: QuestionGroup[] = [
  {
    id: "team",
    label: "구성원",
    questions: [
      { id: "team_size", q: "현재 함께하는 사람은 몇 명인가요?", help: "대표자 포함.", input: { kind: "single", options: ["1인(대표자만)", "2~3명", "4~9명", "10명 이상"] } },
      { id: "has_cofounder", q: "공동 창업자가 있나요?", help: "지분을 나누는 동업자가 있으면 '예'.", input: { kind: "yesno" } },
      { id: "equity_split", q: "지분은 어떻게 나눌 계획인가요?", help: "정해지지 않았다면 방향만 적어도 됩니다.", input: { kind: "text", placeholder: "예: 대표 70% / 공동창업자 30%", long: false }, showWhen: { qid: "has_cofounder", equals: "yes" } },
      { id: "roles", q: "핵심 역할은 어떻게 나뉘나요?", help: "누가 무엇을 맡는지 적어주세요.", input: { kind: "text", placeholder: "예: 대표-운영·고객, 파트너-제작", long: true }, aiSuggest: true },
    ],
  },
  {
    id: "hiring",
    label: "인력 계획",
    questions: [
      { id: "will_hire", q: "1년 안에 채용 계획이 있나요?", input: { kind: "yesno" } },
      { id: "hire_roles", q: "어떤 역할을 채용할 예정인가요?", help: "우선순위가 높은 역할부터.", input: { kind: "text", placeholder: "예: 매장 운영 파트타임 2명", long: false }, showWhen: { qid: "will_hire", equals: "yes" } },
    ],
  },
];

// ───────── 챕터 2: 고객과 시장 ─────────

// 2.1 상품·서비스 — 상품/서비스 분기 → 각 구성·가격
const PRODUCTS_GROUPS: QuestionGroup[] = [
  {
    id: "lineup",
    label: "제공 구성",
    questions: [
      { id: "offer_type", q: "무엇을 제공하나요?", help: "해당하는 것을 모두 고르세요.", input: { kind: "multi", options: ["상품(물건)", "서비스(무형)", "구독·멤버십", "디지털 콘텐츠"] } },
      { id: "main_offer", q: "가장 대표적인 상품·서비스는 무엇인가요?", help: "첫 판매로 밀 하나를 적어주세요.", input: { kind: "text", placeholder: "예: 당일 60분 방문 돌봄", long: false }, aiSuggest: true },
      { id: "offer_detail", q: "그 구성에 무엇이 포함되나요?", help: "포함/제외를 명확히 하면 계획서 설득력이 올라갑니다.", input: { kind: "text", placeholder: "예: 급여·물·배변정리·사진3장 포함 / 투약 제외", long: true } },
    ],
  },
  {
    id: "price",
    label: "가격",
    questions: [
      { id: "has_price", q: "가격을 정하셨나요?", input: { kind: "yesno" } },
      { id: "price_value", q: "대표 상품의 가격은 얼마인가요?", help: "숫자만 적어도 됩니다.", input: { kind: "text", placeholder: "예: 49,000원", long: false }, showWhen: { qid: "has_price", equals: "yes" } },
      { id: "price_basis", q: "그 가격의 근거는 무엇인가요?", help: "원가·경쟁가·고객 지불의사 등.", input: { kind: "single", options: ["원가 기반", "경쟁 가격 참고", "고객 지불의사 조사", "아직 근거 미확보"] }, showWhen: { qid: "has_price", equals: "yes" } },
      { id: "price_plan", q: "가격은 어떻게 정할 계획인가요?", help: "정하지 않았다면 방향만 적어주세요.", input: { kind: "text", placeholder: "예: 원가 계산 후 경쟁가와 비교해 시험", long: true }, showWhen: { qid: "has_price", equals: "no" }, aiSuggest: true },
    ],
  },
];

// 2.2 시장 세그먼트 — 세분화 기준(지리·행동) + 우선순위
const SEGMENTS_GROUPS: QuestionGroup[] = [
  {
    id: "basis",
    label: "세분화 기준",
    questions: [
      { id: "seg_basis", q: "고객을 어떤 기준으로 나눌 수 있나요?", help: "해당하는 기준을 모두 고르세요.", input: { kind: "multi", options: ["지역(생활권·도시)", "연령·성별", "소득 수준", "이용 목적·상황", "구매 빈도", "사업자/개인"] } },
      { id: "segments", q: "구체적인 고객 그룹을 적어주세요.", help: "2~4개 그룹. 'AI 추천'으로 후보를 받아보세요.", input: { kind: "multi", options: [], max: 4 }, aiSuggest: true },
    ],
  },
  {
    id: "priority",
    label: "우선순위",
    questions: [
      { id: "first_target", q: "가장 먼저 공략할 그룹은 어디인가요?", help: "초기 자원은 한 곳에 집중해야 합니다.", input: { kind: "text", placeholder: "예: 마포·서대문 1인 반려가구", long: false } },
      { id: "why_first", q: "그 그룹을 먼저 선택한 이유는?", help: "접근성·문제 강도·지불의사 등.", input: { kind: "text", placeholder: "예: 문제 빈도가 높고 직접 만날 경로가 있음", long: true }, aiSuggest: true },
      { id: "market_size_known", q: "이 그룹의 규모를 파악하셨나요?", help: "조사한 수치가 있으면 '예'.", input: { kind: "yesno" } },
      { id: "market_size", q: "파악한 규모와 출처를 적어주세요.", help: "근거가 없는 수치는 계획서에서 '검증 필요'로 표기됩니다.", input: { kind: "text", placeholder: "예: 통계청 2025 기준 마포구 1인가구 약 O만 세대", long: true }, showWhen: { qid: "market_size_known", equals: "yes" } },
    ],
  },
];

// 2.3 핵심 고객(페르소나) — 인구통계·동기·두려움
const PERSONAS_GROUPS: QuestionGroup[] = [
  {
    id: "who",
    label: "대표 고객 프로필",
    questions: [
      { id: "age", q: "주 고객의 연령대는?", input: { kind: "multi", options: ["10~20대", "30대", "40대", "50대", "60대 이상"] } },
      { id: "situation", q: "어떤 상황에 있는 사람인가요?", help: "직업·가구형태·생활패턴 등.", input: { kind: "text", placeholder: "예: 야근이 잦은 1인 가구 직장인", long: false }, aiSuggest: true },
      { id: "budget", q: "이 고객의 예산 수준은?", input: { kind: "single", options: ["가격 민감(저예산)", "보통", "품질 우선(고예산)", "상황에 따라 다름"] } },
    ],
  },
  {
    id: "motive",
    label: "구매 동기와 장벽",
    questions: [
      { id: "motivation", q: "이 고객이 우리를 찾는 결정적 이유는?", help: "'AI 추천'으로 후보를 받아 다듬어보세요.", input: { kind: "text", placeholder: "예: 급할 때 당장 맡길 곳이 필요해서", long: true }, aiSuggest: true },
      { id: "fear", q: "구매를 망설이게 하는 걱정은 무엇인가요?", help: "신뢰·가격·품질·사고 등.", input: { kind: "multi", options: [], max: 4 }, aiSuggest: true },
      { id: "channel", q: "이 고객은 주로 어디서 정보를 얻나요?", help: "마케팅 채널 선택의 근거가 됩니다.", input: { kind: "multi", options: ["검색(네이버·구글)", "인스타그램", "유튜브", "지역 커뮤니티·맘카페", "지인 추천", "오프라인 간판·전단"] } },
    ],
  },
];

// 2.4 경쟁 분석 — 직접·간접 경쟁 + 차별점
const COMPETITORS_GROUPS: QuestionGroup[] = [
  {
    id: "landscape",
    label: "경쟁 구도",
    questions: [
      { id: "comp_types", q: "고객이 우리 대신 선택할 수 있는 대안은?", help: "유형으로 골라주세요(실명은 근거 확인 후 본문에 반영).", input: { kind: "multi", options: [], max: 5 }, aiSuggest: true },
      { id: "knows_competitors", q: "구체적인 경쟁 업체를 조사하셨나요?", help: "직접 확인한 곳이 있으면 '예'.", input: { kind: "yesno" } },
      { id: "competitor_notes", q: "조사한 내용을 적어주세요.", help: "가격·서비스 범위·강점 등 확인한 사실만.", input: { kind: "text", placeholder: "예: 인근 A업체 시간당 O원, 예약제만 운영", long: true }, showWhen: { qid: "knows_competitors", equals: "yes" } },
    ],
  },
  {
    id: "position",
    label: "우리의 위치",
    questions: [
      { id: "differentiator", q: "경쟁 대비 우리만의 차별점은?", help: "고객이 체감할 수 있는 것으로.", input: { kind: "text", placeholder: "예: 당일 연결 + 완료 기록 제공", long: true }, aiSuggest: true },
      { id: "gap", q: "경쟁자들이 못 채우는 빈틈은 무엇인가요?", help: "시장 기회 포인트.", input: { kind: "text", placeholder: "예: 긴급 상황 대응이 되는 곳이 없음", long: true }, aiSuggest: true },
    ],
  },
];

// 2.5 SWOT — 4분면 각각 다중선택(AI 추천)
const SWOT_GROUPS: QuestionGroup[] = [
  {
    id: "internal",
    label: "내부 요인",
    questions: [
      { id: "strengths", q: "우리의 강점은 무엇인가요?", help: "경험·네트워크·기술·입지 등. AI 추천 가능.", input: { kind: "multi", options: [], max: 5 }, aiSuggest: true },
      { id: "weaknesses", q: "솔직한 약점은 무엇인가요?", help: "자금·인력·인지도 등. 정직하게 적을수록 계획이 튼튼해집니다.", input: { kind: "multi", options: [], max: 5 }, aiSuggest: true },
    ],
  },
  {
    id: "external",
    label: "외부 요인",
    questions: [
      { id: "opportunities", q: "우리에게 유리한 시장 변화·기회는?", input: { kind: "multi", options: [], max: 5 }, aiSuggest: true },
      { id: "threats", q: "위협이 될 수 있는 요인은?", help: "경쟁 심화·규제·경기 등.", input: { kind: "multi", options: [], max: 5 }, aiSuggest: true },
    ],
  },
  {
    id: "action",
    label: "대응 방향",
    questions: [
      { id: "swot_action", q: "약점·위협에 어떻게 대응할 계획인가요?", help: "한두 가지 구체적 대응책.", input: { kind: "text", placeholder: "예: 초기엔 지역 한정 운영으로 인력 부담 최소화", long: true }, aiSuggest: true },
    ],
  },
];

const SECTION_QUESTIONS: Record<string, QuestionGroup[]> = {
  "overview/summary": SUMMARY_GROUPS,
  "overview/problem": PROBLEM_GROUPS,
  "overview/mission": MISSION_GROUPS,
  "overview/ip": IP_GROUPS,
  "overview/achievements": ACHIEVEMENT_GROUPS,
  "overview/structure": STRUCTURE_GROUPS,
  "market/products": PRODUCTS_GROUPS,
  "market/segments": SEGMENTS_GROUPS,
  "market/personas": PERSONAS_GROUPS,
  "market/competitors": COMPETITORS_GROUPS,
  "market/swot": SWOT_GROUPS,
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
