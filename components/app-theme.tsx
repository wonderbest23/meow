"use client";

import { useEffect, useState } from "react";
import { applyThemePreference, readThemePreference, saveThemePreference, THEME_ATTRIBUTE, THEME_BOOT_SCRIPT, THEME_CHANGE_EVENT, THEME_STORAGE_KEY, type ThemePreference } from "../lib/client/app-theme";

/*
 * 로그인 뒤 화면의 테마 표식을 붙였다 떼는 조각 — /plan · 고객센터 레이아웃에 하나씩 둔다.
 * 시스템을 고르면 기기 설정이 바뀔 때 따라가고, 다른 탭에서 바꾸면(storage) 함께 바뀐다.
 * 이 레이아웃을 떠나면(홈 · 로그인 · 가입) 표식을 지워 그 화면들은 늘 예전 그대로다.
 */
export function AppThemeSync() {
  useEffect(() => {
    applyThemePreference();
    let media: MediaQueryList | null = null;
    try { media = window.matchMedia("(prefers-color-scheme: dark)"); } catch { /* 오래된 브라우저 */ }
    const onSystem = () => { if (readThemePreference() === "system") applyThemePreference("system"); };
    const onStorage = (event: StorageEvent) => { if (event.key === THEME_STORAGE_KEY) applyThemePreference(); };
    media?.addEventListener?.("change", onSystem);
    window.addEventListener("storage", onStorage);
    return () => {
      media?.removeEventListener?.("change", onSystem);
      window.removeEventListener("storage", onStorage);
      document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    };
  }, []);
  return null;
}

/** 그리기 전에 테마를 붙인다(첫 화면 깜빡임 방지) — 서버 레이아웃에서 쓴다 */
export function AppThemeBoot() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />;
}

/** 프로필 메뉴 · 환경설정의 시스템/라이트/다크 선택 */
export function useThemePreference(): [ThemePreference, (value: ThemePreference) => void] {
  const [value, setValue] = useState<ThemePreference>("light");
  useEffect(() => {
    setValue(readThemePreference());
    const onChange = () => setValue(readThemePreference());
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => { window.removeEventListener(THEME_CHANGE_EVENT, onChange); window.removeEventListener("storage", onChange); };
  }, []);
  return [value, (next: ThemePreference) => { setValue(next); saveThemePreference(next); }];
}
