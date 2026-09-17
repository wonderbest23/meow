import type { ProposalSector } from "./proposal-blueprint";

/**
 * 업종과 무관하게 사업을 설명하는 공통 구조 축. 질문·계산·문서는 업종 이름이 아니라 이 값에서 결정한다.
 * 값은 중분류(2자리) 기준 기본값이며 사용자가 고른 사업 형태가 항상 우선한다.
 */
export type BusinessStructure = {
  /** 우리 앱의 11업종 호환 값 */
  sector: ProposalSector;
  /** 누가 돈을 내는가 */
  payer: "b2c" | "b2b" | "b2g" | "mixed";
  /** 무엇을 제공하는가 */
  offering: "goods" | "service" | "software" | "space" | "content" | "mixed";
  /** 어떻게 청구하는가 */
  revenue: "per_unit" | "per_hour" | "subscription" | "rental" | "commission" | "project" | "mixed";
  /** 어디서 어떻게 전달하는가 */
  delivery: "store" | "visit" | "online" | "delivery" | "production" | "mixed";
  /** 시작에 필요한 자본 형태 */
  capital: "storefront" | "equipment" | "remote" | "vehicle" | "mixed";
  /** 시작 전 행정 절차. varies는 세분류에 따라 다름 */
  license: "none" | "registration" | "permit" | "professional" | "varies";
  /** 1인·소규모 창업이 흔한 업종인가(탐색 경로의 후보 필터) */
  smallBusiness: boolean;
};

/** 구조 축 값의 한국어 표시. 요약·문서 컨텍스트·"다음 할 일" 안내에 쓴다. */
export const STRUCTURE_LABELS = {
  payer: { b2c: "개인 고객", b2b: "기업·사업자 고객", b2g: "공공기관 고객", mixed: "개인·기업 고객" },
  offering: { goods: "실물 상품", service: "서비스", software: "소프트웨어", space: "공간 제공", content: "콘텐츠", mixed: "복합 제공" },
  revenue: { per_unit: "건당 결제", per_hour: "시간당 결제", subscription: "월 구독", rental: "대여·이용료", commission: "수수료", project: "프로젝트 단위 계약", mixed: "복합 수익" },
  delivery: { store: "매장 방문", visit: "출장·방문", online: "온라인", delivery: "배송", production: "생산·납품", mixed: "복합 전달" },
  capital: { storefront: "매장 필요", equipment: "설비 필요", remote: "무점포 가능", vehicle: "차량 필요", mixed: "자본 형태 복합" },
  license: { none: "인허가 없음", registration: "신고·등록 필요", permit: "허가 필요", professional: "자격·면허 필요", varies: "세부 업종별 인허가 확인" },
} as const;

/** 요약 한 줄용 라벨 5개: 지불자 · 제공 형태 · 전달 · 수익 · 인허가 */
export function structureSummary(structure: BusinessStructure): string[] {
  return [STRUCTURE_LABELS.payer[structure.payer], STRUCTURE_LABELS.offering[structure.offering], STRUCTURE_LABELS.delivery[structure.delivery], STRUCTURE_LABELS.revenue[structure.revenue], STRUCTURE_LABELS.license[structure.license]];
}

/** 수익 방식이 정하는 가격 질문의 기준 단위. null이면 업종 기본(PRICE_BASIS)을 쓴다. */
export function revenueBasis(structure: BusinessStructure): string | null {
  const basis: Partial<Record<BusinessStructure["revenue"], string>> = { subscription: "월 구독 1건", rental: "1회 대여(1박·1시간 등)", per_hour: "1시간", commission: "거래 1건(수수료)", project: "프로젝트 1건" };
  return basis[structure.revenue] ?? null;
}

/** 처리량 질문의 단위 칩 순서. 제공 형태가 정하고, null이면 업종 기본 순서를 쓴다. */
export function capacityUnitOrder(structure: BusinessStructure): string[] | null {
  switch (structure.offering) {
    case "space": return ["좌석·룸", "건", "명", "회", "개"];
    case "goods": return ["개", "건", "명", "회", "좌석·룸"];
    case "software": return ["명", "건", "개", "회", "좌석·룸"];
    case "content": return ["개", "건", "회", "명", "좌석·룸"];
    case "service": return ["건", "회", "명", "개", "좌석·룸"];
    default: return null;
  }
}

/** 시작 전 행정 절차 안내 한 줄. 인허가가 없으면 null. 법적 판단이 아니라 업종 분류 기준의 기본 안내다. */
export function licenseHint(structure: BusinessStructure): string | null {
  switch (structure.license) {
    case "registration": return "이 업종은 시작 전 영업 신고·등록이 필요한 편입니다. 관할 구청·세무서 기준으로 확인해 주세요.";
    case "permit": return "이 업종은 시작 전 영업 허가가 필요한 편입니다. 관할 기관 기준으로 확인해 주세요.";
    case "professional": return "이 업종은 자격·면허가 있어야 열 수 있는 편입니다. 면허 보유 여부와 개설 신고·등록 절차를 관할 기관 기준으로 확인해 주세요.";
    case "varies": return "세부 업종에 따라 인허가가 다릅니다. 시작 전에 해당 업종 기준을 확인해 주세요.";
    default: return null;
  }
}

/** 수익 방식에 맞춘 금액·수량 항목 라벨. 표시용이며 저장 키(price/volume/unitCost/minutesPerSale)는 그대로다. */
export function structureFieldLabels(structure: BusinessStructure): Partial<Record<"price" | "volume" | "unitCost" | "minutesPerSale", string>> {
  switch (structure.revenue) {
    case "subscription": return { price: "월 구독 가격", volume: "월 구독자 수", unitCost: "구독자 1명당 월 비용", minutesPerSale: "구독자 1명 응대 시간" };
    case "per_hour": return { price: "시간당 가격", volume: "월 판매 시간", unitCost: "1시간당 비용", minutesPerSale: "1시간 서비스 준비 시간" };
    case "rental": return { price: "1회 대여·이용 가격", volume: "월 대여·이용 건수", unitCost: "1건당 비용", minutesPerSale: "1건 준비·정비 시간" };
    case "commission": return { price: "거래 1건 수수료", volume: "월 거래 건수", unitCost: "거래 1건당 비용", minutesPerSale: "거래 1건 처리 시간" };
    case "project": return { price: "프로젝트 1건 가격", volume: "월 프로젝트 수", unitCost: "프로젝트 1건당 비용", minutesPerSale: "프로젝트 1건 소요 시간" };
    default: return {};
  }
}

/** 사용자가 직접 고칠 수 있는 축과 표시 순서(인허가 포함, 자본 형태·소규모 여부는 제외). */
export const STRUCTURE_AXES = ["payer", "offering", "delivery", "revenue", "license"] as const;
export type StructureAxis = (typeof STRUCTURE_AXES)[number];

/** KSIC 코드가 아직 없을 때 11업종에서 쓰는 기본 구조. 추정이며 사용자가 고칠 수 있다. */
export const SECTOR_DEFAULT_STRUCTURE: Record<ProposalSector, BusinessStructure> = {
  b2b_service: { sector: "b2b_service", payer: "b2b", offering: "service", revenue: "project", delivery: "online", capital: "remote", license: "varies", smallBusiness: true },
  software: { sector: "software", payer: "mixed", offering: "software", revenue: "subscription", delivery: "online", capital: "remote", license: "none", smallBusiness: true },
  food_beverage: { sector: "food_beverage", payer: "b2c", offering: "goods", revenue: "per_unit", delivery: "store", capital: "storefront", license: "registration", smallBusiness: true },
  retail_commerce: { sector: "retail_commerce", payer: "b2c", offering: "goods", revenue: "per_unit", delivery: "mixed", capital: "mixed", license: "varies", smallBusiness: true },
  manufacturing: { sector: "manufacturing", payer: "mixed", offering: "goods", revenue: "per_unit", delivery: "production", capital: "equipment", license: "varies", smallBusiness: true },
  education: { sector: "education", payer: "b2c", offering: "service", revenue: "subscription", delivery: "mixed", capital: "mixed", license: "registration", smallBusiness: true },
  local_service: { sector: "local_service", payer: "b2c", offering: "service", revenue: "per_unit", delivery: "mixed", capital: "mixed", license: "varies", smallBusiness: true },
  space_hospitality: { sector: "space_hospitality", payer: "b2c", offering: "space", revenue: "rental", delivery: "store", capital: "storefront", license: "registration", smallBusiness: true },
  logistics: { sector: "logistics", payer: "mixed", offering: "service", revenue: "per_unit", delivery: "delivery", capital: "vehicle", license: "permit", smallBusiness: true },
  content_media: { sector: "content_media", payer: "mixed", offering: "content", revenue: "project", delivery: "online", capital: "remote", license: "none", smallBusiness: true },
  general: { sector: "general", payer: "b2c", offering: "service", revenue: "per_unit", delivery: "mixed", capital: "mixed", license: "varies", smallBusiness: true },
};
