export const provinces = [
  "seoul",
  "busan",
  "daegu",
  "incheon",
  "gwangju",
  "daejeon",
  "ulsan",
  "sejong",
  "gyeonggi",
  "gangwon",
  "chungbuk",
  "chungnam",
  "jeonbuk",
  "jeonnam",
  "gyeongbuk",
  "gyeongnam",
  "jeju",
] as const;

export type ProvinceCode = (typeof provinces)[number];
export type ResolvedProvinceCode = ProvinceCode | "unknown";

export const provinceLabels: Record<ProvinceCode, string> = {
  seoul: "서울특별시",
  busan: "부산광역시",
  daegu: "대구광역시",
  incheon: "인천광역시",
  gwangju: "광주광역시",
  daejeon: "대전광역시",
  ulsan: "울산광역시",
  sejong: "세종특별자치시",
  gyeonggi: "경기도",
  gangwon: "강원특별자치도",
  chungbuk: "충청북도",
  chungnam: "충청남도",
  jeonbuk: "전북특별자치도",
  jeonnam: "전라남도",
  gyeongbuk: "경상북도",
  gyeongnam: "경상남도",
  jeju: "제주특별자치도",
};

export const regionalDatasetKinds = [
  "stores",
  "population",
  "businesses",
  "sales",
  "rent",
  "building_use",
  "permits",
] as const;

export type RegionalDatasetKind = (typeof regionalDatasetKinds)[number];

export const datasetKindLabels: Record<RegionalDatasetKind, string> = {
  stores: "상가·경쟁점",
  population: "인구·가구",
  businesses: "사업체",
  sales: "매출·소비",
  rent: "임대·공간비",
  building_use: "건축물 용도·토지",
  permits: "인허가·관할기관",
};

export type RegionalSource = {
  id: string;
  name: string;
  kinds: RegionalDatasetKind[];
  scope: "nationwide" | "province";
  access: "api" | "portal" | "manual_verification";
  sourceUrl: string;
  expectedRefreshDays: number | null;
  configured: boolean;
  note: string;
};

export type RegionalCoverageItem = {
  kind: RegionalDatasetKind;
  required: boolean;
  status: "verified_fresh" | "verified_stale" | "connector_ready" | "manual_required" | "missing";
  latestObservedAt: string | null;
  ageDays: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  availableSources: RegionalSource[];
  action: string;
};

export type RegionalCoverageReport = {
  province: ResolvedProvinceCode;
  provinceLabel: string;
  regionInput: string;
  coverageScore: number;
  freshRequiredCount: number;
  requiredCount: number;
  items: RegionalCoverageItem[];
  blockers: string[];
  warnings: string[];
  localPortal: {
    name: string;
    url: string;
    directRegionalPortal: boolean;
  };
  generatedAt: string;
  rulesVersion: string;
};
