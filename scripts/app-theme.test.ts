import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_THEME, isThemePreference, resolveTheme, THEME_ATTRIBUTE, THEME_BOOT_SCRIPT, THEME_OPTIONS, THEME_STORAGE_KEY } from "../lib/client/app-theme";

/*
 * lovable 구조 5단계 — 로그인 뒤 화면의 다크·라이트 테마.
 * 1) 시스템/라이트/다크 세 가지, 기본은 라이트, 이 기기에만 저장(localStorage 'oneul-theme')
 * 2) 그리기 전 스크립트가 같은 규칙으로 <html data-app-theme> 를 붙인다(깜빡임 없음)
 * 3) 토큰 파일에 라이트·다크 두 벌이 있고, 표식이 없는 화면(로그인·가입·관리자)은 예전 값 그대로
 * 4) /plan · 고객센터 레이아웃만 테마를 붙이고, 로그인 전 화면(/ · /account)은 붙이지 않는다
 * 5) 프로필 메뉴 '화면 설정'과 환경설정에서 고를 수 있다
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// 1) 값과 기본값
assert.deepEqual(THEME_OPTIONS.map(([value]) => value), ["system", "light", "dark"]);
assert.deepEqual(THEME_OPTIONS.map(([, label]) => label), ["시스템", "라이트", "다크"]);
assert.equal(DEFAULT_THEME, "light", "기본은 라이트");
assert.equal(THEME_STORAGE_KEY, "oneul-theme");
assert.equal(isThemePreference("dark"), true);
assert.equal(isThemePreference("sepia"), false);
assert.equal(isThemePreference(null), false);
assert.equal(resolveTheme("light", true), "light");
assert.equal(resolveTheme("dark", false), "dark");
assert.equal(resolveTheme("system", true), "dark");
assert.equal(resolveTheme("system", false), "light");

// 2) 그리기 전 스크립트 — 실제로 돌려 본다
function runBoot(stored: string | null, systemDark: boolean, storageThrows = false) {
  const attributes: Record<string, string> = {};
  const localStorage = { getItem: (key: string) => { if (storageThrows) throw new Error("blocked"); return key === THEME_STORAGE_KEY ? stored : null; } };
  const window = { matchMedia: (query: string) => ({ matches: query.includes("dark") && systemDark }) };
  const document = { documentElement: { setAttribute: (name: string, value: string) => { attributes[name] = value; } } };
  new Function("localStorage", "window", "document", THEME_BOOT_SCRIPT)(localStorage, window, document);
  return attributes[THEME_ATTRIBUTE];
}
assert.equal(runBoot(null, true), "light", "저장값이 없으면 시스템이 어두워도 라이트(기본)");
assert.equal(runBoot("dark", false), "dark");
assert.equal(runBoot("light", true), "light");
assert.equal(runBoot("system", true), "dark");
assert.equal(runBoot("system", false), "light");
assert.equal(runBoot("weird", true), "light", "모르는 값은 기본으로");
assert.equal(runBoot(null, true, true), undefined, "저장소가 막혀도 오류 없이 넘어간다");

// 3) 토큰 — 라이트·다크 두 벌, 표식이 있을 때만
const tokens = read("components/workspace-theme.module.css");
assert.match(tokens, /:global\(html\[data-app-theme\]\) :is\(\.tokens, \.theme\) \{/, "라이트 토큰(표식이 있을 때)");
assert.match(tokens, /:global\(html\[data-app-theme="dark"\]\) :is\(\.tokens, \.theme\) \{[^}]*color-scheme: dark;/, "다크 토큰 + color-scheme");
for (const name of ["--app-bg", "--app-panel", "--app-surface", "--app-text", "--app-body", "--app-muted", "--app-line", "--app-primary", "--app-danger", "--app-ring-shadow"]) {
  const dark = tokens.slice(tokens.indexOf(':global(html[data-app-theme="dark"])'));
  assert.match(dark, new RegExp(`${name}:`), `다크 토큰에 ${name} 이 없다`);
}
// 예전 값(표식 없는 화면)은 그대로 남아 있다
assert.match(tokens, /\.tokens, \.theme \{\n  --app-bg: #f7f9fc;/, "표식 없는 화면의 예전 토큰이 바뀌었다");

// 4) 테마를 붙이는 곳
for (const path of ["app/plan/layout.tsx", "app/account/support/layout.tsx"]) {
  assert.match(read(path), /<AppThemeBoot \/>/, `${path}: 그리기 전 테마 스크립트가 없다`);
  assert.match(read(path), /<AppThemeSync \/>/, `${path}: 테마 동기화가 없다`);
}
for (const path of ["app/page.tsx", "app/account/page.tsx", "app/home-page.tsx"]) {
  assert.doesNotMatch(read(path), /AppTheme(Boot|Sync)/, `${path}: 로그인 전 화면은 테마를 붙이지 않는다`);
}
assert.match(read("components/app-theme.tsx"), /removeAttribute\(THEME_ATTRIBUTE\)/, "로그인 뒤 화면을 떠나면 표식을 뗀다");

// 5) 고르는 곳
assert.match(read("app/plan/ProfileMenu.tsx"), /role="radiogroup" aria-label="화면 테마"/, "프로필 메뉴 '화면 설정'에 테마 선택이 없다");
assert.match(read("app/plan/settings/preferences/Preferences.tsx"), /label="화면 테마"/, "환경설정에 테마 선택이 없다");

console.log("app theme: passed");
