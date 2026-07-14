import type { BusinessArchetype } from "./domain";

type OpportunityLike = {
  sector?: unknown;
  model?: unknown;
  oneLiner?: unknown;
  revenue?: unknown;
  regulation?: unknown;
};

const regulatedKeywords = [
  "의료", "약국", "건강", "금융", "대출", "투자", "보험", "법률", "식품",
  "카페", "음식점", "미용", "학원", "교습", "숙박", "여행", "부동산",
];

export function inferBusinessArchetype(opportunity: OpportunityLike): BusinessArchetype {
  const text = [
    opportunity.sector,
    opportunity.model,
    opportunity.oneLiner,
    opportunity.revenue,
  ].map((value) => String(value ?? "")).join(" ");
  const regulation = typeof opportunity.regulation === "number" ? opportunity.regulation : 0;

  if (regulation >= 65 || regulatedKeywords.some((keyword) => text.includes(keyword))) {
    return "regulated";
  }
  if (/(제조|제품|키트|렌탈|장비|소재|공장)/.test(text)) return "manufacturing";
  if (/(커머스|쇼핑|판매|공동구매|마켓|유통|중고|거래 네트워크)/.test(text)) return "ecommerce";
  if (/(팝업|공간|매장|오프라인|체험|스튜디오)/.test(text)) return "local_retail";
  if (/(SaaS|플랫폼|구독|데이터|AI|온라인|소프트웨어)/i.test(text)) return "digital_service";
  return "professional_service";
}
