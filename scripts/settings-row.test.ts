import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * lovable 구조 3단계 — 프로필 · 계정 설정 · 고객센터(시안 docs/design/settings-mock · lovable-mock/MSettings · MPref).
 * 1) 설정 행 카드는 공용 부품(components/settings-row) 하나 — 내 계정 · 고객센터 · 환경설정 · 보안 · 기기 및 앱 · 약관이 같은 것을 쓴다
 * 2) 규격 값(제목 20/500 행간 25 자간 -0.2 · 설명 14 · 소제목 16/500 · 카드 r16 20×24 · 행 20 · 휴대폰 카드 16 · 흰 띠 24 · 17/15 · 토글 46×28 · 전환 32)
 * 3) 색은 --app-* 토큰만(hex·rgba 없음)
 * 4) PC 설정 메뉴(뒤로 가기 · 설정 검색 · 계정 / 알림·도움 묶음) · 휴대폰 계정 설정 목록(내 계정 · 환경설정 · 보안 · 기기 및 앱 · 사업 설정)
 * 5) 없는 설정을 만들지 않는다 — 시안의 말투·기본 지역·카카오 알림·대화 제안·'AI가 먼저 묻지 않고 할 일'·화면 캡처 붙이기·로그인 수단 연결은 화면에 없다
 * 6) 휴대폰 설정 화면에는 아래 탭 막대를 둔다(판 아래를 비워 마지막 행이 가리지 않는다)
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const uncomment = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

// 1) 공용 부품을 쓴다
const component = read("components/settings-row.tsx");
for (const name of ["SettingsHeader", "SettingsHelpLink", "SettingsSection", "SettingsCard", "SettingsRow", "SettingsAvatar", "SettingsToggle", "SettingsSegment", "SettingsNote", "SettingsDisclosure"]) {
  assert.match(component, new RegExp(`export function ${name}\\b`), `${name} 이 없다`);
}
assert.match(component, /<input type="checkbox" role="switch"/, "토글은 실제 체크박스(role=switch)");
assert.match(component, /<details className=\{styles\.disclosure\}/, "펼치는 행은 실제 <details>");
const users = [
  "app/plan/me/page.tsx", "app/plan/me/AccountActions.tsx", "app/account/support/SupportCenter.tsx", "app/plan/info/page.tsx",
  "app/plan/settings/SettingsIndex.tsx", "app/plan/settings/preferences/Preferences.tsx", "app/plan/settings/security/Security.tsx", "app/plan/settings/devices/Devices.tsx",
];
for (const path of users) assert.match(read(path), /from "(?:\.\.\/)+components\/settings-row";/, `${path}: 설정 행 카드 공용 부품을 쓰지 않는다`);
for (const path of ["app/plan/me/page.tsx", "app/account/support/SupportCenter.tsx", "app/plan/settings/preferences/Preferences.tsx"]) {
  assert.match(read(path), /<SettingsRow\b/, `${path}: 행을 공용 SettingsRow 로 그리지 않는다`);
  assert.match(read(path), /<SettingsCard\b/, `${path}: 카드를 공용 SettingsCard 로 그리지 않는다`);
}

// 2) 규격 값
const css = uncomment(read("components/settings-row.module.css"));
const rule = (selector: string) => {
  const at = css.search(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{`));
  assert.ok(at >= 0, `'${selector}' 규칙이 없다`);
  return css.slice(at, css.indexOf("}", at) + 1);
};
assert.match(rule(".title.title"), /font-size:1\.25rem; font-weight:500; line-height:1\.5625rem; letter-spacing:-\.2px !important;/, "제목 20/500 행간 25 자간 -0.2");
assert.match(rule(".lead"), /margin:4px 0 0; color:var\(--app-muted\); font-size:\.875rem;/, "설명 14 회색 4px 아래");
assert.match(rule(".h2.h2"), /font-size:1rem; font-weight:500;/, "소제목 16/500");
assert.match(rule(".section"), /margin-top:24px;/, "소제목 위 24");
assert.match(rule(".section + .section"), /margin-top:32px;/, "카드 뒤 32");
assert.match(rule(".card"), /margin:16px 0 0; padding:20px 24px;[^}]*border-radius:16px;/, "카드까지 16 · 카드 r16 안쪽 20×24");
assert.match(rule(".row"), /padding:20px 0;/, "행 위아래 20");
assert.match(rule(".row + .row"), /border-top:1px solid var\(--app-line\);/, "행 사이 1px 구분선");
assert.match(rule(".t"), /font-size:\.875rem; font-weight:500;/, "행 제목 14/500");
assert.match(rule(".d"), /color:var\(--app-muted\); font-size:\.875rem;/, "행 설명 14 회색");
assert.match(rule(".switch"), /width:46px; height:28px;/, "토글 46×28(PC)");
assert.match(css, /\.switch \{ width:32px; height:20px; border-radius:10px; \}/, "휴대폰 토글 32×20 r10(lovable 실측)");
assert.match(rule(".seg button"), /height:32px;[^}]*border-radius:999px;/, "알약형 전환 32 r999");
assert.match(rule(".note"), /border-radius:16px; background:var\(--app-warning-bg\);/, "안내 띠 r16 노란 바탕");
assert.match(css, /\.card\[data-mobile=card\] \{ margin-top:12px; padding:16px; \}/, "휴대폰 행 카드 안쪽 16(Mobile.dc)");
assert.match(css, /\.card\[data-mobile=card\] \.row \{ gap:12px; padding:16px 0; \}/, "휴대폰 행 16");
assert.match(css, /\.card\[data-mobile=band\] \.row \{ flex-direction:column; align-items:flex-start; gap:14px; padding:24px 0; \}/, "흰 띠 항목 위아래 24(MPref)");
assert.match(css, /\.card\[data-mobile=band\] \.t \{ font-size:1rem; font-weight:500;/, "흰 띠 항목 제목 16/500(lovable 실측)");
assert.match(css, /\.card\[data-mobile=band\] \.d \{ margin-top:4px; font-size:\.875rem;/, "흰 띠 항목 설명 14(lovable 실측)");
assert.match(css, /\.card\[data-mobile=band\] \{ margin:0 -16px; padding:0 28px;/, "흰 띠 본문 좌우 28(lovable 실측)");

// 3) 색은 토큰만
for (const path of ["components/settings-row.module.css", "app/plan/SettingsMenu.module.css", "app/plan/settings/settings.module.css", "app/plan/me/PlanMe.module.css", "app/account/support/support.module.css", "app/plan/info/PlanInfo.module.css"]) {
  assert.doesNotMatch(uncomment(read(path)), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${path}: 색을 하드코딩했다 — --app-* 토큰만`);
}
const theme = read("components/workspace-theme.module.css");
for (const token of ["--app-fill", "--app-fill-hover", "--app-danger-line", "--app-nav-selected"]) assert.match(theme, new RegExp(`${token}: color-mix\\(`), `${token} 토큰이 없다`);

// 4) PC 설정 메뉴 · 휴대폰 계정 설정 목록
const menu = read("app/plan/SettingsMenu.tsx");
assert.match(menu, /<Link href="\/plan" className=\{styles\.back\}>[\s\S]*?뒤로 가기<\/Link>/, "맨 위 '뒤로 가기'");
assert.match(menu, /placeholder="설정 검색"/, "설정 검색");
const labels = [...menu.matchAll(/label: "([^"]+)", (?:icon|words)/g)].map(match => match[1]);
assert.deepEqual(labels, ["내 계정", "내 사업", "결제 내역", "알림 설정", "고객센터", "이용 안내", "약관·정책"], "설정 메뉴 항목·순서");
assert.match(menu, /\{ label: "계정", items:[\s\S]*\{ label: "알림·도움", items:/, "묶음 제목 '계정' · '알림·도움'");
const menuCss = uncomment(read("app/plan/SettingsMenu.module.css"));
assert.match(menuCss, /\.item \{[^}]*height:32px; padding:4px 6px; border-radius:8px;[^}]*font-size:\.875rem;/, "메뉴 항목 32 r8 14px");
assert.match(menuCss, /\.item > svg \{[^}]*width:20px; height:20px;/, "메뉴 아이콘 20");
assert.match(menuCss, /\.item\[aria-current=page\] \{ background:var\(--app-nav-selected\);/, "선택 바탕 = 글자색 8%");
const chrome = read("app/plan/BusinessAppChrome.tsx");
assert.match(chrome, /\{settings \? <SettingsMenu \/> : <RailMenu /, "설정 화면에서는 왼쪽 메뉴가 설정 메뉴로 바뀐다");
const index = read("app/plan/settings/SettingsIndex.tsx");
assert.deepEqual([...index.matchAll(/\{ href: "[^"]+", label: "([^"]+)"/g)].map(match => match[1]), ["내 계정", "환경설정", "보안", "기기 및 앱"], "휴대폰 계정 설정 목록");
assert.match(index, /variant="secondary" size="compact"[^>]*>[\s\S]*?사업 설정<\/AppButton>/, "맨 아래 32px r8 테두리 단추(lovable 실측) '사업 설정'");
const listCss = uncomment(read("app/plan/settings/settings.module.css"));
assert.match(listCss, /\.item \{[^}]*height:48px; padding:0 12px; border-radius:8px;[^}]*font-size:1rem;/, "목록 48px r8 안쪽 12 · 16px(lovable 실측)");
assert.match(listCss, /\.item > svg:first-child \{[^}]*width:20px; height:20px;/, "목록 아이콘 20(lovable 실측)");
assert.match(read("app/plan/ProfileMenu.tsx"), /row\(anchor === "sheet" \? "\/plan\/settings" : "\/plan\/me#me-info", <Settings aria-hidden="true" \/>, "계정 설정"/, "휴대폰 프로필 시트의 계정 설정 → 전체 화면 목록");
assert.match(read("app/plan/PlanShell.tsx"), /pathname\.startsWith\("\/plan\/settings"\)/, "계정 설정 화면이 예전 문서 셸(머리말)을 덧그리지 않는다");

// 5) 없는 설정을 만들지 않는다(주석은 빼고 화면 글자만 본다)
const shown = [read("app/plan/settings/preferences/Preferences.tsx"), read("app/plan/settings/security/Security.tsx"), read("app/plan/settings/devices/Devices.tsx"), read("app/account/support/SupportCenter.tsx"), read("app/plan/me/page.tsx"), read("app/plan/me/AccountActions.tsx")].map(uncomment).join("\n");
for (const fake of ["말투", "기본 지역", "카카오 알림", "대화 제안", "먼저 묻지 않고", "화면 캡처", "애플 연결", "로그인 수단"]) assert.ok(!shown.includes(fake), `지금 없는 설정 '${fake}' 이 화면에 있다`);
const prefs = uncomment(read("app/plan/settings/preferences/Preferences.tsx"));
assert.match(prefs, /SUPPORT_BADGE_KEY/, "상담 단추 숫자는 상담 창 설정과 같은 값");
assert.match(prefs, /`\$\{homepageHref\(plan\.id\)\}#hk-leads`/, "문의 알림 번호는 그 사업 홈페이지 화면의 알림 번호 칸으로");

// 6) 휴대폰 아래 탭 막대
for (const path of ["/plan/me", "/plan/info", "/account/support", "/plan/settings", "/plan/settings/preferences", "/plan/settings/security", "/plan/settings/devices"]) {
  assert.match(chrome, new RegExp(`TABBAR_PATHS = \\[[^\\]]*"${path.replace(/\//g, "\\/")}"`), `${path}: 휴대폰 아래 탭 막대가 없다`);
}
assert.match(read("app/plan/AppChrome.module.css"), /\.surface\[data-tabbar\] \{ padding-bottom:calc\(57px \+ 24px \+ 12px \+ env\(safe-area-inset-bottom\)\); \}/, "탭 막대 자리를 비워 마지막 행이 가리지 않게");

console.log("settings row: ok");
