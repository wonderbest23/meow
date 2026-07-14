import type { BusinessSetup } from "../business/domain";
import type { MarketEvidence } from "../market/domain";
import {
  datasetKindLabels,
  provinceLabels,
  provinces,
  regionalDatasetKinds,
  type ProvinceCode,
  type ResolvedProvinceCode,
  type RegionalCoverageItem,
  type RegionalCoverageReport,
  type RegionalDatasetKind,
  type RegionalSource,
} from "./domain";

const aliases: Record<ProvinceCode, string[]> = {
  seoul: ["서울", "서울특별시"],
  busan: ["부산", "부산광역시"],
  daegu: ["대구", "대구광역시"],
  incheon: ["인천", "인천광역시"],
  gwangju: ["광주", "광주광역시"],
  daejeon: ["대전", "대전광역시"],
  ulsan: ["울산", "울산광역시"],
  sejong: ["세종", "세종특별자치시"],
  gyeonggi: ["경기", "경기도", "수원", "성남", "고양", "용인", "화성"],
  gangwon: ["강원", "강원도", "강원특별자치도"],
  chungbuk: ["충북", "충청북도"],
  chungnam: ["충남", "충청남도"],
  jeonbuk: ["전북", "전라북도", "전북특별자치도"],
  jeonnam: ["전남", "전라남도"],
  gyeongbuk: ["경북", "경상북도"],
  gyeongnam: ["경남", "경상남도"],
  jeju: ["제주", "제주도", "제주특별자치도"],
};

const freshnessDays: Record<RegionalDatasetKind, number> = {
  stores: 100,
  population: 400,
  businesses: 400,
  sales: 120,
  rent: 90,
  building_use: 365,
  permits: 180,
};

const metricKeywords: Record<RegionalDatasetKind, string[]> = {
  stores: ["점포", "경쟁", "상가", "업소"],
  population: ["인구", "가구", "유동", "거주", "직장인"],
  businesses: ["사업체", "종사자", "산업체"],
  sales: ["매출", "소비", "결제", "거래"],
  rent: ["임대", "월세", "보증금", "권리금", "공간비"],
  building_use: ["건축", "용도", "토지", "등기", "대장"],
  permits: ["인허가", "허가", "신고", "등록", "관할"],
};

const directPortals: Partial<Record<ProvinceCode, { name: string; url: string }>> = {
  seoul: { name: "서울 열린데이터광장", url: "https://data.seoul.go.kr/" },
  gyeonggi: { name: "경기데이터드림", url: "https://data.gg.go.kr/portal/mainPage.do" },
  ulsan: { name: "울산광역시 데이터포털", url: "https://data.ulsan.go.kr/" },
  sejong: { name: "세종 빅데이터 플랫폼 세담터", url: "https://www2.sejong.go.kr/bigdata/" },
};

export function detectProvince(region: string): ResolvedProvinceCode {
  const normalized = region.replace(/\s+/g, "");
  for (const province of provinces) {
    if (aliases[province].some((alias) => normalized.includes(alias))) return province;
  }
  return "unknown";
}

function sourcesFor(province: ResolvedProvinceCode): RegionalSource[] {
  const local = province === "unknown" ? undefined : directPortals[province];
  const provinceLabel = province === "unknown" ? "지역 미확인" : provinceLabels[province];
  const sources: RegionalSource[] = [
    {
      id: "sbiz-stores",
      name: "소상공인시장진흥공단 상가(상권)정보",
      kinds: ["stores"],
      scope: "nationwide",
      access: "api",
      sourceUrl: "https://www.data.go.kr/data/15012005/openapi.do",
      expectedRefreshDays: 1,
      configured: Boolean(process.env.DATA_GO_KR_API_KEY),
      note: "전국 영업 중 상가업소의 업종·주소·좌표를 제공합니다.",
    },
    {
      id: "sgis-census",
      name: "통계청 통계지리정보서비스(SGIS) 인구·사업체 조사",
      kinds: ["population", "businesses"],
      scope: "nationwide",
      access: "api",
      sourceUrl: "https://sgis.kostat.go.kr/developer/html/main.html",
      expectedRefreshDays: 400,
      configured: Boolean(process.env.SGIS_CONSUMER_KEY && process.env.SGIS_CONSUMER_SECRET),
      note: "전국 인구·가구·주택·사업체 통계를 제공합니다.",
    },
    {
      id: "kosis",
      name: "국가통계포털(KOSIS)",
      kinds: ["population", "businesses", "sales"],
      scope: "nationwide",
      access: "api",
      sourceUrl: "https://kosis.kr/openapi/",
      expectedRefreshDays: null,
      configured: Boolean(process.env.KOSIS_API_KEY),
      note: "통계표별 갱신주기가 달라 기준일을 별도로 저장해야 합니다.",
    },
    {
      id: "building-register",
      name: "세움터 건축행정시스템",
      kinds: ["building_use"],
      scope: "nationwide",
      access: "manual_verification",
      sourceUrl: "https://www.eais.go.kr/",
      expectedRefreshDays: null,
      configured: true,
      note: "계약 전 건축물대장 용도와 위반건축물 여부를 직접 확인합니다.",
    },
    {
      id: "vworld",
      name: "국가공간정보 지도서비스(VWorld)",
      kinds: ["building_use"],
      scope: "nationwide",
      access: "api",
      sourceUrl: "https://www.vworld.kr/",
      expectedRefreshDays: null,
      configured: Boolean(process.env.VWORLD_API_KEY),
      note: "토지이용·용도지역 등 공간정보 자동 조회에는 별도 연결키가 필요합니다.",
    },
    {
      id: "gov24",
      name: "정부24·기업민원 공식 확인",
      kinds: ["permits"],
      scope: "nationwide",
      access: "manual_verification",
      sourceUrl: "https://www.gov.kr/portal/main/nologin",
      expectedRefreshDays: null,
      configured: true,
      note: "업종과 주소를 기준으로 관할기관 신고·허가 가능 여부를 확인합니다.",
    },
    {
      id: "public-data-regional",
      name: `${provinceLabel} 공공데이터 통합 검색`,
      kinds: ["stores", "population", "businesses", "sales", "rent"],
      scope: "province",
      access: "portal",
      sourceUrl: local?.url ?? "https://www.data.go.kr/",
      expectedRefreshDays: null,
      configured: true,
      note: local
        ? `${local.name}에서 지역 특화 데이터셋의 기준일과 제공 범위를 확인합니다.`
        : "공공데이터포털에서 해당 시·도 제공기관으로 필터링해 최신 데이터셋을 확인합니다.",
    },
  ];
  if (province === "seoul") {
    sources.push({
      id: "seoul-golmok",
      name: "서울시 상권분석서비스",
      kinds: ["stores", "population", "businesses", "sales", "rent"],
      scope: "province",
      access: "api",
      sourceUrl: "https://golmok.seoul.go.kr/",
      expectedRefreshDays: 120,
      configured: Boolean(process.env.SEOUL_OPEN_DATA_API_KEY),
      note: "서울시 상권별 점포·추정매출·인구·임대 관련 지표를 제공합니다.",
    });
  }
  return sources;
}

function isRequired(kind: RegionalDatasetKind, setup: BusinessSetup | null): boolean {
  if (!setup) return true;
  const physical = ["commercial_lease", "factory"].includes(setup.workplaceType);
  const local = ["local_retail", "manufacturing", "regulated"].includes(setup.archetype);
  const map: Record<RegionalDatasetKind, boolean> = {
    stores: local || setup.archetype === "ecommerce",
    population: local,
    businesses: true,
    sales: true,
    rent: physical,
    building_use: physical,
    permits: true,
  };
  return map[kind];
}

function evidenceFor(kind: RegionalDatasetKind, evidence: MarketEvidence[]) {
  return evidence
    .filter((entry) => {
      const haystack = `${entry.title} ${entry.metric} ${entry.note}`;
      return metricKeywords[kind].some((keyword) => haystack.includes(keyword));
    })
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ?? null;
}

export function analyzeRegionalCoverage(input: {
  region: string;
  setup: BusinessSetup | null;
  evidence: MarketEvidence[];
}): RegionalCoverageReport {
  const province = detectProvince(input.region);
  const provinceLabel = province === "unknown" ? "지역을 먼저 확인해주세요" : provinceLabels[province];
  const sources = sourcesFor(province);
  const now = Date.now();
  const items: RegionalCoverageItem[] = regionalDatasetKinds.map((kind) => {
    const required = isRequired(kind, input.setup);
    const evidence = evidenceFor(kind, input.evidence);
    const ageDays = evidence
      ? Math.max(0, Math.floor((now - new Date(`${evidence.observedAt}T00:00:00Z`).getTime()) / 86_400_000))
      : null;
    const fresh = ageDays !== null && ageDays <= freshnessDays[kind];
    const availableSources = sources.filter((source) => source.kinds.includes(kind));
    const connector = availableSources.find((source) => source.access === "api" && source.configured);
    const manual = availableSources.find((source) => source.access !== "api" || source.configured);
    let status: RegionalCoverageItem["status"];
    if (evidence?.verification === "verified" && fresh) status = "verified_fresh";
    else if (evidence?.verification === "verified") status = "verified_stale";
    else if (connector) status = "connector_ready";
    else if (manual) status = "manual_required";
    else status = "missing";
    const action =
      status === "verified_fresh"
        ? `${freshnessDays[kind]}일 이내 최신 근거입니다.`
        : status === "verified_stale"
          ? `기준일이 ${ageDays}일 전입니다. 최신 원문으로 교체하세요.`
          : status === "connector_ready"
            ? `${connector?.name} 연결을 이용해 값을 조회하고 근거로 저장하세요.`
            : status === "manual_required"
              ? `${manual?.name}에서 ${datasetKindLabels[kind]} 값을 확인해 출처·기준일과 함께 저장하세요.`
              : "사용 가능한 공식 소스를 확인하지 못했습니다.";
    return {
      kind,
      required,
      status,
      latestObservedAt: evidence?.observedAt ?? null,
      ageDays,
      sourceName: evidence?.sourceName ?? null,
      sourceUrl: evidence?.sourceUrl || null,
      availableSources,
      action,
    };
  });
  const requiredItems = items.filter((item) => item.required);
  const scoreValues: Record<RegionalCoverageItem["status"], number> = {
    verified_fresh: 100,
    verified_stale: 45,
    connector_ready: 30,
    manual_required: 10,
    missing: 0,
  };
  const coverageScore = requiredItems.length
    ? Math.round(requiredItems.reduce((sum, item) => sum + scoreValues[item.status], 0) / requiredItems.length)
    : 100;
  const blockers = requiredItems
    .filter((item) => !["verified_fresh"].includes(item.status))
    .map((item) => `${datasetKindLabels[item.kind]}: ${item.action}`);
  const warnings: string[] = [];
  if (!process.env.DATA_GO_KR_API_KEY) warnings.push("공공데이터포털 상가업소 연결키가 없어 전국 경쟁점 자동 조회가 제한됩니다.");
  if (!process.env.SGIS_CONSUMER_KEY || !process.env.SGIS_CONSUMER_SECRET) warnings.push("통계지리정보서비스 연결키가 없어 전국 인구·사업체 통계를 자동 조회할 수 없습니다.");
  if (province !== "seoul") warnings.push("서울 상권 추정매출을 다른 지역에 대입하지 않습니다. 해당 지역 공식 자료 또는 직접 조사값이 필요합니다.");
  if (province === "unknown") warnings.push("입력한 지역에서 광역 시·도를 판별하지 못했습니다. 사업 조건의 지역을 구체적으로 입력하세요.");
  const local = province === "unknown" ? undefined : directPortals[province];
  return {
    province,
    provinceLabel,
    regionInput: input.region,
    coverageScore,
    freshRequiredCount: requiredItems.filter((item) => item.status === "verified_fresh").length,
    requiredCount: requiredItems.length,
    items,
    blockers,
    warnings,
    localPortal: {
      name: local?.name ?? `${provinceLabel} 제공기관 공공데이터 검색`,
      url: local?.url ?? "https://www.data.go.kr/",
      directRegionalPortal: Boolean(local),
    },
    generatedAt: new Date().toISOString(),
    rulesVersion: "kr-regional-coverage-v1",
  };
}
