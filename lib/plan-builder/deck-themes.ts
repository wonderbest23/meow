// 발표자료 테마 라이브러리.
//
// "AI가 그때그때 추측하는 디자인" 대신, 실제로 검증된 덱들의 색·구성 문법을
// 업종별 테마로 미리 축적해 두고 사업에 맞는 것을 결정적으로 고른다.
// 참고한 문법: Sequoia 피치덱 구성, YC 시드덱의 큰 문장 위주 조판,
// Airbnb 초기 덱의 카드 그리드, 국내 정부지원(PSST) 심사자료의 격식 톤.
// 테마는 여기에만 추가하면 렌더러 전체에 반영된다.

export interface DeckTheme {
  /** 테마 이름 (디버깅·로그용) */
  name: string;
  /** 커버·클로징 바탕 */
  dark: string;
  /** 주 액센트 */
  brand: string;
  /** 진한 액센트 (칩 글자, 번호) */
  brandDeep: string;
  /** 다크 바탕 위 보조 텍스트 */
  ice: string;
  /** 다크 바탕 위 라벨(작은 대문자) */
  label: string;
  /** 본문 칩·번호 원 배경 */
  chipBg: string;
  /** 본문 바탕(슬라이드 여백) */
  panel: string;
  /** statement 슬라이드 풀배경 */
  statement: string;
  /** 모티프 도형 — 테마마다 실루엣이 달라야 덱들이 서로 달라 보인다 */
  motif: "circle" | "square" | "arc";
}

/** 기본 — 네이비/블루 (서비스·플랫폼 일반) */
const NAVY: DeckTheme = {
  name: "navy",
  dark: "0F1D33",
  brand: "3182F6",
  brandDeep: "1D4ED8",
  ice: "C9DCF8",
  label: "6FA5F5",
  chipBg: "E8F1FE",
  panel: "F7F8FA",
  statement: "1D4ED8",
  motif: "circle",
};

/** 포레스트 — F&B·오프라인 매장·농식품 (신선함·현장감) */
const FOREST: DeckTheme = {
  name: "forest",
  dark: "14291C",
  brand: "2E9E63",
  brandDeep: "1E7A49",
  ice: "CBE8D6",
  label: "6FCB97",
  chipBg: "E4F5EB",
  panel: "F6F9F7",
  statement: "1E7A49",
  motif: "arc",
};

/** 테라코타 — 리테일·공방·수공예 (물성·따뜻함) */
const TERRA: DeckTheme = {
  name: "terra",
  dark: "3A2019",
  brand: "C2563A",
  brandDeep: "A03E26",
  ice: "F2D8CE",
  label: "E08A6F",
  chipBg: "FBEAE4",
  panel: "FAF7F5",
  statement: "A03E26",
  motif: "square",
};

/** 베리 — 뷰티·라이프스타일·컨텐츠 (감도) */
const BERRY: DeckTheme = {
  name: "berry",
  dark: "331522",
  brand: "C24A73",
  brandDeep: "9D3158",
  ice: "F3D3E0",
  label: "E387AA",
  chipBg: "FBE7EF",
  panel: "FAF6F8",
  statement: "9D3158",
  motif: "circle",
};

/** 슬레이트+민트 — 테크·SaaS·데이터 (정밀함) */
const SLATE: DeckTheme = {
  name: "slate",
  dark: "17212B",
  brand: "0FA47F",
  brandDeep: "0B7A5F",
  ice: "C6E9DE",
  label: "4FC9A6",
  chipBg: "E1F5EE",
  panel: "F5F8F7",
  statement: "0B7A5F",
  motif: "square",
};

/** 거버넌스 — 정부지원·공공 심사용 (격식·신뢰, 장식 최소) */
const GOV: DeckTheme = {
  name: "gov",
  dark: "102A43",
  brand: "2456A6",
  brandDeep: "1A3F7E",
  ice: "CBDCF2",
  label: "7FA3D6",
  chipBg: "E7EEF9",
  panel: "F6F8FB",
  statement: "1A3F7E",
  motif: "arc",
};

const THEMES = { NAVY, FOREST, TERRA, BERRY, SLATE, GOV };

/** 업종·설명 키워드 → 테마. 앞에 오는 규칙이 이긴다. */
const KEYWORD_RULES: Array<{ theme: DeckTheme; words: string[] }> = [
  { theme: FOREST, words: ["카페", "커피", "식당", "음식", "베이커리", "반찬", "농산", "식품", "꽃", "화훼", "매장", "편의점", "무인점"] },
  { theme: TERRA, words: ["공방", "수공예", "가구", "인테리어", "리테일", "소품", "빈티지", "도자", "가죽"] },
  { theme: BERRY, words: ["뷰티", "미용", "네일", "화장품", "패션", "의류", "웨딩", "콘텐츠", "크리에이터", "스튜디오"] },
  { theme: SLATE, words: ["앱", "플랫폼", "소프트웨어", "saas", "데이터", "ai", "인공지능", "개발", "솔루션", "자동화", "구독"] },
];

/**
 * 사업 정보로 테마를 결정한다 — 같은 입력이면 항상 같은 테마(추측이 아니라 규칙).
 * 정부지원 유형은 무조건 격식 테마.
 */
export function pickDeckTheme(planType?: string, businessName?: string, description?: string): DeckTheme {
  if (planType?.includes("정부지원")) return GOV;
  const hay = `${businessName ?? ""} ${description ?? ""}`.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.words.some((w) => hay.includes(w))) return rule.theme;
  }
  // 키워드가 없으면 사업명 해시로 결정적으로 분산 — 매번 같은 사업은 같은 테마
  const pool = [NAVY, SLATE, FOREST];
  let h = 0;
  for (const ch of businessName ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

export const DEFAULT_DECK_THEME = NAVY;
export { THEMES };
