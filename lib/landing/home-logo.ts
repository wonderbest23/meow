import type { SiteLogoAsset } from "../../components/site-header";

/**
 * 홈(검정 화면) 로고.
 *
 * 소유자 결정(09-18): 원래 파란 로고를 그대로 쓴다. 검정 화면에서는 CSS 필터로 흰색으로 뒤집는다.
 * 다른 원본으로 바꾸려면 여기만 고친다: src 를 새 파일 경로로, width·height 를 실제 픽셀 크기로,
 * 원본이 이미 흰 글자면 white 를 true 로(필터를 끈다).
 * 홈 밖(사업 관리·약관 화면)은 이 값을 읽지 않고 기존 파란 로고를 그대로 쓴다.
 */
export const HOME_LOGO: SiteLogoAsset & { white: boolean } = {
  src: "/today-startup-logo-2026.png",
  width: 1288,
  height: 322,
  white: false,
};

/** 홈 CSS 변수 값 — 흰 원본은 그대로, 파란 원본은 흰색으로 뒤집는다 */
export const HOME_LOGO_FILTER = HOME_LOGO.white ? "none" : "brightness(0) invert(1)";
