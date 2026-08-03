// 챕터 간 답변 모순 검증.
// 한 섹션만 보면 멀쩡한데 다른 섹션과 나란히 놓으면 어긋나는 답을 찾아낸다.
// 규칙은 전부 실제 질문 ID에 근거하며, 양쪽이 모두 답변된 경우에만 지적한다.

import { PLAN_BLUEPRINT, sectionKey } from "./blueprint";
import { parseAmount, collectFinancialInputs, calculateFinancials } from "./financials";

export type IssueSeverity = "conflict" | "check";

export interface ConsistencyIssue {
  id: string;
  severity: IssueSeverity;
  /** 한 줄 요약 */
  title: string;
  /** 무엇이 어긋났는지 구체적으로 */
  detail: string;
  /** 관련 섹션 — 사용자가 바로 이동할 수 있게 */
  refs: Array<{ key: string; label: string }>;
}

type Answers = Record<string, Record<string, unknown>>;

const SECTION_LABEL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const ch of PLAN_BLUEPRINT) {
    for (const s of ch.sections) map[sectionKey(ch.id, s.id)] = `${ch.title} · ${s.title}`;
  }
  return map;
})();

function ref(key: string) {
  return { key, label: SECTION_LABEL[key] ?? key };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 마지막 글자에 받침이 있는지 — 한글이 아니면 없는 것으로 본다. */
function hasFinalConsonant(word: string): boolean {
  const ch = word.trim().slice(-1).codePointAt(0);
  if (ch == null || ch < 0xac00 || ch > 0xd7a3) return false;
  return (ch - 0xac00) % 28 !== 0;
}
/** 로 / 으로 — ㄹ 받침은 '로'를 쓴다 */
function ro(word: string): string {
  const ch = word.trim().slice(-1).codePointAt(0);
  if (ch == null || ch < 0xac00 || ch > 0xd7a3) return "로";
  const jong = (ch - 0xac00) % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}
/** 이 / 가 */
function iga(word: string): string {
  return hasFinalConsonant(word) ? "이" : "가";
}

/** 두 금액이 실질적으로 다른가 (20% 넘게 벌어지면 다른 값으로 본다) */
function differs(a: number, b: number): boolean {
  const base = Math.max(a, b);
  return base > 0 && Math.abs(a - b) / base > 0.2;
}

/** 고객이 정보를 얻는 채널 ↔ 우리가 홍보하는 채널 대응표 (문구가 달라 직접 매칭되지 않는다) */
const CHANNEL_PAIRS: Array<[persona: string, promo: string]> = [
  ["검색(네이버·구글)", "네이버 검색·블로그"],
  ["인스타그램", "인스타그램"],
  ["유튜브", "유튜브·숏폼"],
  ["지역 커뮤니티·맘카페", "지역 커뮤니티·맘카페"],
  ["지인 추천", "지인·입소문"],
  ["오프라인 간판·전단", "오프라인 전단·간판"],
];

/** 영업 범위 넓이 순위 — 숫자가 클수록 넓다 */
const REACH_RANK: Record<string, number> = { "동네·지역": 1, "전국": 3, "온라인 중심": 3 };
const COVERAGE_RANK: Record<string, number> = {
  "동네·생활권": 1,
  "시·군 단위": 2,
  "전국": 3,
  "온라인 전국·해외": 4,
};

/** 손익분기 도달 시점 선택지 → 개월 상한 */
const BREAKEVEN_MONTHS: Record<string, number> = { "3개월 내": 3, "6개월 내": 6, "1년 내": 12 };
const HORIZON_MONTHS: Record<string, number> = { "3개월": 3, "6개월": 6, "1년": 12, "3년": 36 };

/**
 * 플랜 전체 답변에서 모순을 찾는다.
 * 답이 없는 항목은 건드리지 않는다 — 아직 안 쓴 것과 어긋난 것은 다르다.
 */
export function findConsistencyIssues(
  allAnswers: Answers,
  /** 사업 정보(진행 단계 등) — 답변과 프로필이 어긋나는 것도 잡기 위해 */
  business?: { stage?: string },
): ConsistencyIssue[] {
  const get = (key: string, qid: string) => allAnswers?.[key]?.[qid];
  const issues: ConsistencyIssue[] = [];
  const add = (i: ConsistencyIssue) => issues.push(i);

  /*
   * 15. 진행 단계와 시작 여부가 어긋난다.
   * 실제 사례: 사업 정보에는 '아이디어 단계'인데 답변에서 '이미 시작했고
   * 2024년 설립'이라고 적어, AI가 어색하게 봉합한 문서가 나왔다.
   */
  const established = get("overview/summary", "established");
  if (business?.stage === "아이디어 단계" && established === "yes") {
    add({
      id: "stage-established-mismatch",
      severity: "conflict",
      title: "진행 단계와 시작 여부가 어긋납니다",
      detail: "사업 정보에는 '아이디어 단계'로 되어 있는데, 답변에서는 사업을 이미 시작했다고 하셨습니다. 사업 정보 수정에서 단계를 바꾸거나 답변을 고쳐주세요.",
      refs: [ref("overview/summary")],
    });
  }
  if ((business?.stage === "운영 중" || business?.stage === "개업 직후") && established === "no") {
    add({
      id: "stage-notstarted-mismatch",
      severity: "conflict",
      title: "진행 단계와 시작 여부가 어긋납니다",
      detail: `사업 정보에는 '${business.stage}'인데, 답변에서는 아직 시작하지 않았다고 하셨습니다.`,
      refs: [ref("overview/summary")],
    });
  }

  // 16. 시작 전이라는데 실적이 있다고 한다
  const hasTraction = get("overview/achievements", "has_traction");
  if (established === "no" && hasTraction === "yes") {
    add({
      id: "traction-before-start",
      severity: "check",
      title: "시작 전인데 성과가 있다고 되어 있습니다",
      detail: "'사업체를 이미 시작하셨나요?'에는 아니오라고 답하셨는데, 주요 성과에는 이룬 성과가 있다고 하셨습니다. 시범 판매·사전 예약이라면 그 성격을 답변에 적어주세요.",
      refs: [ref("overview/summary"), ref("overview/achievements")],
    });
  }

  // 1. 상품 가격과 재무 판매가가 다르다
  const priceValue = parseAmount(get("market/products", "price_value"));
  const unitPrice = parseAmount(get("financials/revenue", "unit_price"));
  if (priceValue != null && unitPrice != null && differs(priceValue, unitPrice)) {
    add({
      id: "price-mismatch",
      severity: "conflict",
      title: "상품 가격과 재무 판매가가 다릅니다",
      detail: `상품·서비스에는 ${won(priceValue)}, 매출 계획에는 ${won(unitPrice)}${ro(won(unitPrice))} 적으셨습니다. 손익표는 매출 계획의 금액으로 계산됩니다.`,
      refs: [ref("market/products"), ref("financials/revenue")],
    });
  }

  // 2. 가격 전략의 변동비와 재무 변동비가 다르다
  const unitCost = parseAmount(get("strategy/price", "unit_cost"));
  const variablePerUnit = parseAmount(get("financials/expenses", "variable_per_unit"));
  if (unitCost != null && variablePerUnit != null && differs(unitCost, variablePerUnit)) {
    add({
      id: "cost-mismatch",
      severity: "conflict",
      title: "1건당 변동비가 두 곳에서 다릅니다",
      detail: `가격 전략에는 ${won(unitCost)}, 비용에는 ${won(variablePerUnit)}${ro(won(variablePerUnit))} 적으셨습니다.`,
      refs: [ref("strategy/price"), ref("financials/expenses")],
    });
  }

  // 3. 팔수록 손해인 구조
  if (unitPrice != null && variablePerUnit != null && variablePerUnit >= unitPrice) {
    add({
      id: "negative-margin",
      severity: "conflict",
      title: "팔수록 손해가 나는 구조입니다",
      detail: `판매가 ${won(unitPrice)}보다 1건당 변동비 ${won(variablePerUnit)}${iga(won(variablePerUnit))} 크거나 같습니다. 고정비를 빼기 전부터 적자라 손익분기가 존재하지 않습니다.`,
      refs: [ref("financials/revenue"), ref("financials/expenses")],
    });
  }

  // 4. 직접 적은 손익분기 건수와 계산된 손익분기가 다르다
  const { inputs } = collectFinancialInputs(allAnswers);
  const calc = calculateFinancials(inputs);
  const statedBreakEven = parseAmount(get("financials/financing", "breakeven_value"));
  if (statedBreakEven != null && calc.breakEven && differs(statedBreakEven, calc.breakEven.units)) {
    add({
      id: "breakeven-units",
      severity: "check",
      title: "손익분기 건수가 계산값과 다릅니다",
      detail: `월 ${statedBreakEven.toLocaleString("ko-KR")}건으로 적으셨지만, 입력하신 판매가·변동비·고정비로 계산하면 월 ${calc.breakEven.units.toLocaleString("ko-KR")}건입니다.`,
      refs: [ref("financials/financing"), ref("financials/revenue")],
    });
  }

  // 5. 손익분기 도달 예상 시점이 계산과 어긋난다
  const whenLabel = str(get("financials/financing", "breakeven_when"));
  const whenLimit = whenLabel ? BREAKEVEN_MONTHS[whenLabel] : undefined;
  if (whenLimit != null && calc.monthly.length > 0) {
    if (calc.breakEvenMonth == null) {
      add({
        id: "breakeven-never",
        severity: "conflict",
        title: `손익분기를 ${whenLabel}로 보셨지만 계산상 12개월 안에 도달하지 못합니다`,
        detail: "입력하신 판매량·가격·고정비로는 12개월 내내 월 적자입니다. 시점을 바꾸거나 수치를 다시 보셔야 합니다.",
        refs: [ref("financials/financing"), ref("financials/revenue")],
      });
    } else if (calc.breakEvenMonth > whenLimit) {
      add({
        id: "breakeven-late",
        severity: "check",
        title: `손익분기 시점이 계산보다 낙관적입니다`,
        detail: `${whenLabel}로 보셨지만 계산상 ${calc.breakEvenMonth}개월차에 월 흑자로 전환됩니다.`,
        refs: [ref("financials/financing"), ref("financials/revenue")],
      });
    }
  }

  // 6. 사람을 쓰는데 인건비가 없다
  const workers = list(get("strategy/people", "who_works"));
  const paidWorkers = workers.filter((w) => w !== "대표자 직접");
  const hasStaffCost = str(get("financials/staffing", "has_staff_cost"));
  if (paidWorkers.length > 0 && hasStaffCost === "no") {
    add({
      id: "staff-cost-missing",
      severity: "conflict",
      title: "인력을 쓰는데 인건비가 0으로 잡혀 있습니다",
      detail: `인력 전략에 '${paidWorkers.join("·")}' 항목이 있는데 인건비는 발생하지 않는다고 답하셨습니다. 손익표에 인건비가 빠집니다.`,
      refs: [ref("strategy/people"), ref("financials/staffing")],
    });
  }

  // 7. 1인 사업인데 정규 직원이 일한다
  const teamSize = str(get("overview/structure", "team_size"));
  if (teamSize === "1인(대표자만)" && workers.includes("직원(정규)")) {
    add({
      id: "team-size-conflict",
      severity: "conflict",
      title: "조직 규모와 실제 인력이 어긋납니다",
      detail: "조직에는 '1인(대표자만)'으로, 인력 전략에는 '직원(정규)'이 일한다고 적으셨습니다.",
      refs: [ref("overview/structure"), ref("strategy/people")],
    });
  }

  // 8. 매출이 없었다는데 매출 성과가 있다
  const hadRevenue = str(get("overview/summary", "revenue"));
  const traction = list(get("overview/achievements", "traction_types"));
  if (hadRevenue === "no" && traction.includes("실제 판매·매출 발생")) {
    add({
      id: "revenue-history-conflict",
      severity: "conflict",
      title: "매출 이력이 서로 다릅니다",
      detail: "개요에는 매출이 발생한 적 없다고, 주요 성과에는 '실제 판매·매출 발생'을 이뤘다고 적으셨습니다.",
      refs: [ref("overview/summary"), ref("overview/achievements")],
    });
  }

  // 9. 구독 상품인데 매출 방식에 구독이 없다
  const offerTypes = list(get("market/products", "offer_type"));
  const streams = list(get("financials/revenue", "revenue_streams"));
  if (offerTypes.includes("구독·멤버십") && streams.length > 0 && !streams.includes("정기 구독·회원")) {
    add({
      id: "subscription-missing",
      severity: "check",
      title: "구독 상품인데 매출 방식에 구독이 없습니다",
      detail: `상품 구성은 '구독·멤버십'인데 매출 발생 방식은 ${streams.join("·")}만 선택하셨습니다.`,
      refs: [ref("market/products"), ref("financials/revenue")],
    });
  }

  // 10. 고객이 있는 채널과 홍보 채널이 겹치지 않는다
  const personaChannels = list(get("market/personas", "channel"));
  const promoChannels = list(get("strategy/promotion", "promo_channels"));
  if (personaChannels.length > 0 && promoChannels.length > 0) {
    const overlap = CHANNEL_PAIRS.some(([p, m]) => personaChannels.includes(p) && promoChannels.includes(m));
    if (!overlap) {
      add({
        id: "channel-gap",
        severity: "check",
        title: "고객이 있는 곳과 홍보하는 곳이 겹치지 않습니다",
        detail: `고객은 ${personaChannels.join("·")}에서 정보를 얻는다고 하셨는데, 홍보는 ${promoChannels.join("·")}${ro(promoChannels[promoChannels.length - 1])} 계획하셨습니다.`,
        refs: [ref("market/personas"), ref("strategy/promotion")],
      });
    }
  }

  // 11. 영업 범위가 두 곳에서 다르다
  const reach = str(get("overview/summary", "reach"));
  const coverage = str(get("strategy/distribution", "coverage"));
  const reachRank = reach ? REACH_RANK[reach] : undefined;
  const coverageRank = coverage ? COVERAGE_RANK[coverage] : undefined;
  if (reachRank != null && coverageRank != null && Math.abs(reachRank - coverageRank) >= 2) {
    add({
      id: "reach-conflict",
      severity: "check",
      title: "영업 범위가 두 곳에서 다릅니다",
      detail: `개요에는 '${reach}', 유통 전략에는 '${coverage}'로 적으셨습니다.`,
      refs: [ref("overview/summary"), ref("strategy/distribution")],
    });
  }

  // 12. 필요 자금보다 초기 투자가 크다
  const amountLabel = str(get("funding/requirements", "amount"));
  const AMOUNT_MAX: Record<string, number> = {
    "1천만원 미만": 10_000_000,
    "1천만~3천만원": 30_000_000,
    "3천만~1억원": 100_000_000,
  };
  const amountMax = amountLabel ? AMOUNT_MAX[amountLabel] : undefined;
  const assetCost = parseAmount(get("financials/assets", "asset_cost"));
  if (amountLabel && amountMax != null && assetCost != null && assetCost > amountMax) {
    add({
      id: "funding-short",
      severity: "conflict",
      title: "초기 투자가 조달 계획보다 큽니다",
      detail: `초기 투자는 ${won(assetCost)}인데 필요 자금은 '${amountLabel}'${ro(amountLabel)} 잡으셨습니다. 시설·장비 비용만으로 이미 넘어섭니다.`,
      refs: [ref("funding/requirements"), ref("financials/assets")],
    });
  }

  // 13. 목표 기간 안에 손익분기 도달이 불가능하다
  const horizon = str(get("objectives/corporate", "horizon"));
  const horizonMonths = horizon ? HORIZON_MONTHS[horizon] : undefined;
  const measures = list(get("objectives/corporate", "measure"));
  if (horizonMonths != null && measures.includes("손익분기 도달") && calc.monthly.length > 0) {
    if (calc.breakEvenMonth == null || calc.breakEvenMonth > horizonMonths) {
      add({
        id: "goal-breakeven-conflict",
        severity: "check",
        title: `${horizon} 안에 손익분기 도달이 어렵습니다`,
        detail:
          calc.breakEvenMonth == null
            ? "손익분기 도달을 목표 지표로 잡으셨지만, 계산상 12개월 내내 월 적자입니다."
            : `계산상 월 흑자 전환은 ${calc.breakEvenMonth}개월차입니다.`,
        refs: [ref("objectives/corporate"), ref("financials/revenue")],
      });
    }
  }

  // 14. 파는 것이 없다
  const hasProducts = str(get("overview/summary", "has_products"));
  const hasServices = str(get("overview/summary", "has_services"));
  if (hasProducts === "no" && hasServices === "no") {
    add({
      id: "nothing-to-sell",
      severity: "conflict",
      title: "판매하는 상품도 서비스도 없다고 되어 있습니다",
      detail: "둘 중 하나는 있어야 사업계획서의 매출·가격·유통 내용이 성립합니다.",
      refs: [ref("overview/summary")],
    });
  }

  return issues;
}

/** 특정 섹션과 관련된 모순만 골라낸다 (위저드에서 해당 섹션 작업 중 보여주기 위해) */
export function issuesForSection(issues: ConsistencyIssue[], key: string): ConsistencyIssue[] {
  return issues.filter((i) => i.refs.some((r) => r.key === key));
}
