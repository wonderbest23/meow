/*
 * 로그인 뒤 화면(/plan · 고객센터)의 화면 테마 — 시스템 / 라이트 / 다크 (lovable 구조 5단계).
 * 고른 값은 이 기기에만 저장한다(localStorage). 기본은 라이트.
 * <html data-app-theme="light|dark"> 하나로 토큰(components/workspace-theme.module.css)이 바뀐다.
 * 로그인 전 화면(/ · 로그인 · 가입)은 .theme/.tokens 를 쓰지 않거나 이 표식을 지운 뒤 열려 영향이 없다.
 */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "oneul-theme";
export const THEME_ATTRIBUTE = "data-app-theme";
export const DEFAULT_THEME: ThemePreference = "light";
export const THEME_CHANGE_EVENT = "oneul-theme-change";
export const THEME_OPTIONS: Array<[ThemePreference, string]> = [["system", "시스템"], ["light", "라이트"], ["dark", "다크"]];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : DEFAULT_THEME;
  } catch { return DEFAULT_THEME; }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

function systemPrefersDark(): boolean {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

/** 지금 고른 값을 <html> 에 적용한다 */
export function applyThemePreference(preference: ThemePreference = readThemePreference()): ResolvedTheme {
  const resolved = resolveTheme(preference, systemPrefersDark());
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
  return resolved;
}

export function saveThemePreference(preference: ThemePreference) {
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* 저장소가 막혀 있으면 이 창에서만 적용 */ }
  applyThemePreference(preference);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: preference }));
}

/** 그리기 전에(깜빡임 없이) 테마를 붙이는 짧은 스크립트 — 서버 레이아웃이 <script> 로 넣는다 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(p!=="system"&&p!=="dark"&&p!=="light")p=${JSON.stringify(DEFAULT_THEME)};var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},d?"dark":"light");}catch(e){}})();`;
