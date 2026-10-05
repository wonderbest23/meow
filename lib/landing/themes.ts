import type { CSSProperties } from "react";
import { firstSectorMatch } from "../sector-match";

/*
 * 홈페이지 분위기(색 조합) — 디자인(배치)은 그대로 두고 색만 바꾼다.
 *
 * 디자인마다 쓰는 색 이름이 다르다(보라 버튼, 초록 강조, 청록…). 분위기는 공통 변수
 * (--t-*)로 내려주고, 각 디자인 CSS 가 자기 색을 var(--t-…, 원래 색)으로 받는다.
 * 분위기를 고르지 않으면(기본) 디자인 원래 색 그대로다.
 *
 *   ink       글자·진한 띠
 *   accent    주 버튼·강조 띠
 *   strong    강조색의 진한 쪽(글씨로 쓸 때)
 *   highlight 보조 강조(작은 제목·아이콘·두 번째 버튼)
 *   soft      옅은 바탕 띠
 *   paper     페이지 바탕
 */
export const LANDING_THEMES = [
  { id: "warm", label: "따뜻한", note: "카페·베이커리·공방", tokens: { ink: "#2b2118", accent: "#9a5b34", strong: "#7a4424", highlight: "#e0a458", soft: "#f6eee4", paper: "#fffaf4" } },
  { id: "modern", label: "모던", note: "인테리어·사진·IT", tokens: { ink: "#141414", accent: "#141414", strong: "#141414", highlight: "#8a8a8a", soft: "#f2f2f0", paper: "#ffffff" } },
  { id: "fresh", label: "산뜻한", note: "병원·운동·청소", tokens: { ink: "#12302d", accent: "#0e9384", strong: "#0b6f63", highlight: "#63c9b8", soft: "#ecf7f5", paper: "#ffffff" } },
  { id: "luxe", label: "고급", note: "웨딩·숙박·전문직", tokens: { ink: "#1b2233", accent: "#1f2a44", strong: "#1f2a44", highlight: "#c9a86a", soft: "#f4f1ea", paper: "#fdfcf9" } },
  { id: "vivid", label: "생기", note: "미용·반려동물·키즈", tokens: { ink: "#2a1c17", accent: "#e8603c", strong: "#c24a2a", highlight: "#ffb547", soft: "#fff1ea", paper: "#ffffff" } },
] as const;

export type LandingThemeId = (typeof LANDING_THEMES)[number]["id"];
export const LANDING_THEME_IDS = LANDING_THEMES.map((theme) => theme.id) as [LandingThemeId, ...LandingThemeId[]];

/** 분위기 → 디자인이 읽는 CSS 변수. 기본(없음)이면 undefined — 디자인 원래 색 */
export function themeStyle(theme: string | undefined): CSSProperties | undefined {
  const found = LANDING_THEMES.find((item) => item.id === theme);
  if (!found) return undefined;
  const { ink, accent, strong, highlight, soft, paper } = found.tokens;
  return {
    "--t-ink": ink, "--t-accent": accent, "--t-strong": strong, "--t-highlight": highlight, "--t-soft": soft, "--t-paper": paper,
    // 공개 페이지 아래 문의 양식·버튼 색도 같은 분위기로
    "--landing-accent": accent,
  } as CSSProperties;
}

/*
 * 업종에 맞는 처음 분위기 — 업종·상호·대표 상품 글로 고른다. 못 알아보면 기본(디자인 원래 색).
 * 사장님은 홈페이지 관리 화면의 '분위기'에서 언제든 바꾼다.
 */
const THEME_FOR_SECTOR: Array<{ test: RegExp; theme: LandingThemeId }> = [
  { test: /(카페|커피|베이커리|빵집|제과|디저트|브런치|반찬|도시락|한식|공방|꽃집|플라워)/, theme: "warm" },
  { test: /(병원|의원|치과|한의원|약국|재활|필라테스|요가|피트니스|헬스|운동|청소|세탁|방역)/, theme: "fresh" },
  { test: /(웨딩|호텔|펜션|숙박|리조트|세무|회계|법률|법무|노무)/, theme: "luxe" },
  { test: /(미용|헤어|네일|뷰티|속눈썹|반려|애견|펫|강아지|고양이|냥이|키즈|아동)/, theme: "vivid" },
  { test: /(인테리어|리모델링|건축|사진|촬영|스튜디오|소프트웨어|플랫폼|앱|개발)/, theme: "modern" },
];

export function themeForSector(text: string): LandingThemeId | undefined {
  const value = text.replace(/\s+/g, " ");
  return firstSectorMatch(THEME_FOR_SECTOR, value, (entry) => entry.test)?.theme;
}
