/*
 * 질문팩 — "무엇을 물을지"는 코드가 정한다. AI는 "어떻게 쉽게 물을지"만 맡는다.
 *
 * 1차는 세 팩만: class(수업·클래스) · commerce(온라인 판매) · unit_sale(그 외 전부).
 * 나머지 사업모델은 unit_sale 로 떨어진다 — 단가 × 수량은 어디에나 통한다.
 *
 * 모든 슬롯은 화이트리스트다. 여기 없는 id 는 어디서 와도 저장하지 않는다.
 * mapsTo 가 있으면 답이 기존 plan.answers[sectionKey][qid] 에도 그대로 기록된다 —
 * 그래야 financials.ts · consistency.ts · section-generator 가 새 시스템을
 * 몰라도 그대로 돌아간다.
 */
import type { BusinessAnalysis, ModelTag } from "./domain";

export type SlotGrade = "blocking" | "important" | "optional";

export type SlotInput =
  | { kind: "number"; unit: string; hint?: string }
  | { kind: "single"; options: string[] }
  | { kind: "text"; placeholder?: string };

export interface PackSlot {
  id: string;
  label: string;
  /** LLM 이 실패했을 때 그대로 쓰는 기본 질문 — 쉬운 한국어 */
  ask: string;
  /** 왜 묻는지 한 줄 */
  why: string;
  grade: SlotGrade;
  input: SlotInput;
  /** 답을 기존 질문 슬롯에도 기록 (하위 호환의 핵심) */
  mapsTo?: { sectionKey: string; qid: string };
  /**
   * 기존 위저드의 분기 게이트(yesno)도 함께 맞춘다.
   * 예: asset_cost 는 needs_assets=yes 뒤에만 보인다 — 게이트를 안 켜면 위저드에서 답이 숨는다.
   */
  alsoSet?: Array<{ sectionKey: string; qid: string; value: unknown }>;
  /**
   * 합계의 "구성 항목"인 슬롯. 직접 mapsTo 하지 않는다 — 공간비는 고정비 전체가 아니고
   * 재료비는 1건당 변동비 전체가 아니다(결제수수료·포장·배송이 더 붙는다).
   * 화면(숫자 확인)이 이 값을 초기값으로 보여주고, 사용자가 합계를 확인한 뒤에야
   * financials/expenses.fixed_total · variable_per_unit 에 들어간다.
   */
  contributesTo?: "fixed" | "variable";
}

export type PackId = "class" | "commerce" | "unit_sale";

export interface QuestionPack {
  id: PackId;
  label: string;
  slots: PackSlot[];
  /**
   * 파생 판매량 — 팩 슬롯으로 월 판매 건수를 계산하는 산식.
   * 결과는 확정 사실로 저장하지 않는다. 화면에서 산식과 함께 보여주고
   * 사용자가 확인한 뒤에야 financials/revenue.monthly_volume 에 들어간다.
   */
  deriveVolume?: (slots: Record<string, number | undefined>) => { value: number; formula: string } | null;
}

/* ───────── 공통 슬롯 — 분석이 못 채우면 묻는 5대 축 ───────── */

export const CORE_SLOTS: PackSlot[] = [
  {
    id: "customer",
    label: "주요 고객",
    ask: "주로 어떤 분들이 고객이 될까요?",
    why: "누구에게 파는지가 정해져야 시장과 홍보를 쓸 수 있어요",
    grade: "blocking",
    input: { kind: "text", placeholder: "예: 반려견을 키우는 30대 직장인" },
    mapsTo: { sectionKey: "market/segments", qid: "first_target" },
  },
  {
    id: "problem",
    label: "고객의 문제",
    ask: "고객이 지금 겪는 불편이나 아쉬움은 무엇인가요?",
    why: "문제가 있어야 왜 이 사업이 필요한지 설명할 수 있어요",
    grade: "blocking",
    input: { kind: "text", placeholder: "예: 직접 만들고 싶지만 방법을 몰라요" },
    mapsTo: { sectionKey: "overview/problem", qid: "problems" },
  },
  {
    id: "solution",
    label: "제공하는 것",
    ask: "그 문제를 어떻게 해결해 주나요?",
    why: "무엇을 파는지가 문서의 중심이에요",
    grade: "blocking",
    input: { kind: "text", placeholder: "예: 재료가 준비된 2시간 원데이 클래스" },
    mapsTo: { sectionKey: "overview/problem", qid: "solutions" },
  },
  {
    id: "differentiator",
    label: "우리만의 강점",
    ask: "비슷한 곳 대신 여기를 고를 이유는 무엇일까요?",
    why: "경쟁 부분에 꼭 들어가는 내용이에요",
    grade: "important",
    input: { kind: "text", placeholder: "예: 반려견 영양을 아는 수의테크니션이 진행" },
    mapsTo: { sectionKey: "market/competitors", qid: "differentiator" },
  },
  {
    id: "ownerExperience",
    label: "대표자의 관련 경험",
    ask: "이 분야와 관련된 경험이나 경력이 있으신가요?",
    why: "왜 우리가 할 수 있는지를 보여주는 부분이에요",
    grade: "important",
    input: { kind: "text", placeholder: "예: 반려동물 베이커리 3년 근무" },
    mapsTo: { sectionKey: "summary/executive", qid: "why_us" },
  },
];

/* ───────── 팩 1. 교육·클래스 ───────── */

const CLASS_PACK: QuestionPack = {
  id: "class",
  label: "교육·클래스",
  slots: [
    {
      id: "classPrice",
      label: "1인 수강료",
      ask: "1인 수강료는 얼마 정도로 생각하고 계세요?",
      why: "수강료가 있어야 매출과 손익분기를 계산할 수 있어요",
      grade: "blocking",
      input: { kind: "number", unit: "원", hint: "예: 5만원" },
      mapsTo: { sectionKey: "financials/revenue", qid: "unit_price" },
      alsoSet: [{ sectionKey: "market/products", qid: "has_price", value: "yes" }],
    },
    {
      id: "seatsPerClass",
      label: "회당 정원",
      ask: "한 번 수업할 때 최대 몇 명까지 받을 생각인가요?",
      why: "정원이 한 달에 벌 수 있는 최대 매출을 정해요",
      grade: "blocking",
      input: { kind: "number", unit: "명", hint: "예: 6명" },
    },
    {
      id: "classesPerMonth",
      label: "월 수업 횟수",
      ask: "한 달에 수업을 몇 번 정도 열 계획인가요?",
      why: "횟수 × 정원이 월 수강생 수가 돼요",
      grade: "blocking",
      input: { kind: "number", unit: "회", hint: "예: 8회" },
    },
    {
      id: "venueType",
      label: "수업 공간",
      ask: "수업 공간은 어떻게 마련할 계획인가요?",
      why: "공간 방식에 따라 고정비가 크게 달라져요",
      grade: "blocking",
      input: { kind: "single", options: ["직접 임대", "필요할 때 시간제로 빌림", "자택·이미 있는 공간", "아직 미정"] },
      /* delivery(전달 방식)·자산 항목과는 뜻이 달라 mapsTo 를 두지 않는다 — __analysis 에만 남긴다 */
    },
    {
      id: "materialCost",
      label: "1인당 재료비 (구성 변동비)",
      ask: "수강생 한 명당 재료비가 대략 얼마나 들 것 같나요?",
      why: "한 명 받을 때마다 나가는 돈이에요 — 남는 돈을 계산하는 데 써요",
      grade: "blocking",
      input: { kind: "number", unit: "원", hint: "예: 1만5천원" },
      contributesTo: "variable",
      alsoSet: [{ sectionKey: "financials/expenses", qid: "variable_items", value: ["재료·원가"] }],
    },
    {
      id: "occupancyRate",
      label: "평균 참석률",
      ask: "정원이 다 차지 않는 날도 있죠. 평균적으로 정원의 몇 % 정도 올 것 같나요?",
      why: "너무 낙관적인 매출을 막아 줘요",
      grade: "important",
      input: { kind: "single", options: ["50%", "70%", "80%", "100%"] },
    },
    {
      id: "venueCost",
      label: "월 공간 비용 (고정비 구성 항목)",
      ask: "공간에 드는 돈은 한 달에 얼마쯤일까요? (임대료·대관료)",
      why: "고정비에서 가장 큰 항목이에요",
      grade: "important",
      input: { kind: "number", unit: "원", hint: "예: 월 60만원" },
      contributesTo: "fixed",
      alsoSet: [{ sectionKey: "financials/expenses", qid: "fixed_items", value: ["임대료"] }],
    },
  ],
  deriveVolume: (s) => {
    const seats = s.seatsPerClass;
    const classes = s.classesPerMonth;
    if (!seats || !classes) return null;
    const occ = s.occupancyRate != null && s.occupancyRate > 0 ? Math.min(100, s.occupancyRate) / 100 : 1;
    const value = Math.round(seats * classes * occ);
    const formula = `정원 ${seats}명 × 월 ${classes}회${occ < 1 ? ` × 참석률 ${Math.round(occ * 100)}%` : ""} = 약 ${value}명`;
    return { value, formula };
  },
};

/* ───────── 팩 2. 온라인 판매 ───────── */

const COMMERCE_PACK: QuestionPack = {
  id: "commerce",
  label: "온라인 판매",
  slots: [
    {
      id: "aov",
      label: "1회 평균 구매 금액",
      ask: "고객이 한 번 살 때 평균 얼마쯤 살 것 같나요?",
      why: "객단가가 있어야 매출을 계산할 수 있어요",
      grade: "blocking",
      input: { kind: "number", unit: "원", hint: "예: 3만원" },
      mapsTo: { sectionKey: "financials/revenue", qid: "unit_price" },
      alsoSet: [{ sectionKey: "market/products", qid: "has_price", value: "yes" }],
    },
    {
      id: "monthlyVisitors",
      label: "월 방문자 수",
      ask: "첫 몇 달 동안 한 달에 몇 명쯤 쇼핑몰에 들어올 것 같나요?",
      why: "방문자 × 구매 비율이 판매 건수가 돼요",
      grade: "blocking",
      input: { kind: "number", unit: "명", hint: "예: 2,000명" },
    },
    {
      id: "conversionRate",
      label: "구매 전환율",
      ask: "들어온 사람 100명 중 몇 명이 실제로 살 것 같나요?",
      why: "온라인 쇼핑몰은 보통 1~3명 정도예요",
      grade: "blocking",
      input: { kind: "single", options: ["1명 (1%)", "2명 (2%)", "3명 (3%)", "5명 (5%)"] },
    },
    {
      id: "cogs",
      label: "상품 원가+포장·배송 (구성 변동비)",
      ask: "한 번 팔 때 상품 원가와 포장·배송비는 얼마쯤 드나요?",
      why: "한 건 팔 때 남는 돈을 계산해요 — 결제·플랫폼 수수료는 따로 더해요",
      grade: "blocking",
      input: { kind: "number", unit: "원", hint: "예: 1만2천원" },
      contributesTo: "variable",
      alsoSet: [{ sectionKey: "financials/expenses", qid: "variable_items", value: ["재료·원가", "포장·배송비"] }],
    },
    {
      id: "adBudget",
      label: "월 광고비",
      ask: "한 달 광고비는 얼마쯤 쓸 계획인가요?",
      why: "온라인 판매는 광고비가 곧 방문자예요",
      grade: "important",
      input: { kind: "number", unit: "원", hint: "예: 월 30만원" },
      mapsTo: { sectionKey: "strategy/promotion", qid: "promo_budget" },
      alsoSet: [{ sectionKey: "strategy/promotion", qid: "has_promo_budget", value: "yes" }],
    },
    {
      id: "fixedOps",
      label: "월 고정비",
      ask: "팔지 않아도 매달 나가는 돈(쇼핑몰 이용료·창고·구독 도구)은 얼마쯤일까요?",
      why: "손익분기를 계산하는 데 꼭 필요해요",
      grade: "important",
      input: { kind: "number", unit: "원", hint: "예: 월 20만원" },
      mapsTo: { sectionKey: "financials/expenses", qid: "fixed_total" },
    },
  ],
  deriveVolume: (s) => {
    const visitors = s.monthlyVisitors;
    const conv = s.conversionRate;
    if (!visitors || !conv) return null;
    const value = Math.round((visitors * conv) / 100);
    return { value, formula: `방문자 ${visitors.toLocaleString("ko-KR")}명 × 구매율 ${conv}% = 약 ${value}건` };
  },
};

/* ───────── 팩 3. 일반 판매 (기본 폴백) ───────── */

const UNIT_SALE_PACK: QuestionPack = {
  id: "unit_sale",
  label: "일반 판매",
  slots: [
    {
      id: "unitPrice",
      label: "1건 평균 판매 금액",
      ask: "한 번 팔 때(1건·1인) 평균 얼마를 받을 생각인가요?",
      why: "판매 금액이 있어야 매출을 계산할 수 있어요",
      grade: "blocking",
      input: { kind: "number", unit: "원", hint: "예: 4만9천원" },
      mapsTo: { sectionKey: "financials/revenue", qid: "unit_price" },
      alsoSet: [{ sectionKey: "market/products", qid: "has_price", value: "yes" }],
    },
    {
      id: "monthlyVolume",
      label: "월 판매 건수",
      ask: "첫 몇 달 동안 한 달에 몇 건 정도 팔릴 것 같나요?",
      why: "보수적으로 잡을수록 계획서가 믿음직해요",
      grade: "blocking",
      input: { kind: "number", unit: "건", hint: "예: 월 40건" },
      mapsTo: { sectionKey: "financials/revenue", qid: "monthly_volume" },
    },
    {
      id: "unitCost",
      label: "1건당 원가",
      ask: "한 건 팔 때마다 나가는 돈(재료·원가·수수료)은 얼마쯤인가요?",
      why: "한 건 팔 때 얼마가 남는지 계산해요",
      grade: "blocking",
      input: { kind: "number", unit: "원", hint: "예: 2만원" },
      mapsTo: { sectionKey: "financials/expenses", qid: "variable_per_unit" },
    },
    {
      id: "fixedTotal",
      label: "월 고정비",
      ask: "팔지 않아도 매달 나가는 돈(임대료·공과금 등)은 얼마쯤일까요?",
      why: "손익분기를 계산하는 데 꼭 필요해요",
      grade: "blocking",
      input: { kind: "number", unit: "원", hint: "예: 월 80만원" },
      mapsTo: { sectionKey: "financials/expenses", qid: "fixed_total" },
    },
    {
      id: "initialInvestment",
      label: "초기 투자 금액",
      ask: "시작할 때 한 번에 드는 돈(장비·인테리어·보증금)은 얼마쯤일까요?",
      why: "얼마를 준비해야 하는지가 자금 계획의 출발이에요",
      grade: "important",
      input: { kind: "number", unit: "원", hint: "예: 1,500만원" },
      mapsTo: { sectionKey: "financials/assets", qid: "asset_cost" },
      alsoSet: [{ sectionKey: "financials/assets", qid: "needs_assets", value: "yes" }],
    },
    {
      id: "salesChannel",
      label: "판매 경로",
      ask: "주로 어디에서 팔 계획인가요?",
      why: "판매 경로에 따라 비용과 홍보 방법이 달라져요",
      grade: "important",
      input: { kind: "single", options: ["오프라인 매장", "자체 웹사이트·앱", "오픈마켓·플랫폼", "전화·메신저 주문", "방문·출장", "제휴처 통한 판매"] },
      mapsTo: { sectionKey: "strategy/distribution", qid: "channels" },
    },
  ],
};

export const PACKS: Record<PackId, QuestionPack> = {
  class: CLASS_PACK,
  commerce: COMMERCE_PACK,
  unit_sale: UNIT_SALE_PACK,
};

/** 분석 결과 → 팩. 1차는 class · commerce 만 구분하고 나머지는 unit_sale */
export function packForAnalysis(analysis: Pick<BusinessAnalysis, "modelTags" | "primary">): QuestionPack {
  const tags = new Set<ModelTag>(analysis.modelTags.value ?? []);
  if (tags.has("class")) return CLASS_PACK;
  if (tags.has("commerce")) return COMMERCE_PACK;
  if (analysis.primary.value === "교육·강의" && tags.size === 0) return CLASS_PACK;
  if (analysis.primary.value === "온라인 쇼핑몰" && tags.size === 0) return COMMERCE_PACK;
  return UNIT_SALE_PACK;
}

/** 이 팩에서 물을 수 있는 슬롯 전부 (공통 + 팩) */
export function slotsForPack(pack: QuestionPack): PackSlot[] {
  return [...CORE_SLOTS, ...pack.slots];
}

export function findSlot(pack: QuestionPack, id: string): PackSlot | undefined {
  return slotsForPack(pack).find((s) => s.id === id);
}

/*
 * 로드 시 무결성 검증 — 슬롯 id 가 겹치면 답이 엉뚱한 칸에 들어간다.
 * questions.ts 의 분기 무결성 검증과 같은 태도: 조용히 넘어가지 않고 바로 던진다.
 */
(function verifyPacks() {
  for (const pack of Object.values(PACKS)) {
    const seen = new Set<string>();
    for (const s of slotsForPack(pack)) {
      if (seen.has(s.id)) throw new Error(`[analyzer/packs] 슬롯 id 중복: ${pack.id}.${s.id}`);
      seen.add(s.id);
    }
  }
})();
