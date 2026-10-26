import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 심사 뒤 S1 — 글자 크기 설정(브라우저 기본 글자 크기)을 따르게 한 것이 다시 흩어지지 않게 소스로 지킨다.
 * 1) 자주 쓰는 화면(첫 화면·로그인·내 사업·작업실·결제·내 계정·고객센터·약관)의 CSS 모듈은 글자 크기·줄 높이를 px 로 쓰지 않는다
 *    (rem = px/16 — 기본 16px 에서는 값이 그대로다). 휴대폰 그림 같은 장식(iphone-mockup·home-phone-story)과
 *    사장님 공개 홈페이지 디자인(brainwave-*)·관리자 화면은 이번 범위 밖이라 px 그대로 둔다.
 * 2) 전역 CSS 의 같은 화면 규칙(머리줄 로그인·시작하기, 약관 본문, 첫 화면 바닥글)도 rem
 * 3) 맨 위(html·:root·body)에 px 글자 크기를 두지 않는다 — 두면 rem 이 다시 고정된다
 * 4) 휴대폰 입력칸 16px 고정(iOS 확대 방지)은 '16px 이상, 설정을 키우면 따라 커짐'
 * 5) 글자를 키웠을 때 버티는 규칙(작업실 탭 2×2 · 머리줄 높이 늘어남 · 줄바꿈)
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "");

const MODULES = [
  "app/account/Account.module.css", "app/account/support/support.module.css", "app/not-found.module.css",
  "app/plan/BusinessHub.module.css", "app/plan/BusinessRailTree.module.css", "app/plan/DeletedBusinessGuard.module.css",
  "app/plan/GenerationProgress.module.css", "app/plan/InlineDocEditor.module.css", "app/plan/MyBusinessList.module.css",
  "app/plan/PlanGate.module.css", "app/plan/PlanLoading.module.css", "app/plan/PlanRailNav.module.css", "app/plan/PlanShell.module.css",
  "app/plan/RailMenu.module.css", "app/plan/chat/intake-ui/idea-exploration.module.css", "app/plan/chat/intake-ui/resource-panel.module.css",
  "app/plan/chat/intake.module.css", "app/plan/chat/page.module.css", "app/plan/document/DocumentWorkspace.module.css",
  "app/plan/homepage/PublishedMenu.module.css", "app/plan/homepage/page.module.css", "app/plan/me/PlanMe.module.css",
  "app/plan/pay/PlanCheckout.module.css", "app/plan/studio/Studio.module.css", "app/plan/workspace/LaunchWorkspace.module.css",
  "app/plan/workspace/OperatingAnalysisPanel.module.css", "app/plan/workspace/OperatingWorkspace.module.css",
  "app/plan/workspace/PaneHeaderActions.module.css", "components/account-auth-form.module.css", "components/coach-chat-ui.module.css",
  "components/confirm-dialog.module.css", "components/consent-list.module.css", "components/doc-sheet.module.css",
  "components/home-landing.module.css", "components/home-prompt-hero.module.css", "components/home-prompt-sections.module.css",
  "components/login-dialog.module.css", "components/next-services.module.css", "components/site-header-menu.module.css",
  "components/support-chat-home.module.css", "components/workspace-brand.module.css",
];
const PX_TEXT = /(?:font-size|line-height)\s*:[^;}]*\d(?:\.\d+)?px|(?:^|[;{\s])font\s*:[^;}]*\d(?:\.\d+)?px|--coach-(?:font|label|title|welcome-size)\s*:\s*[\d.]+px/m;
for (const path of MODULES) {
  const src = css(path);
  const hit = src.split("\n").find(line => PX_TEXT.test(line));
  assert.equal(hit, undefined, `${path}: 글자 크기를 px 로 고정했다(rem 으로 — 글자 크기 설정을 따르지 않는다): ${hit?.trim().slice(0, 120)}`);
}

const globals = css("app/globals.css");
const ruleOf = (selector: string) => {
  const at = globals.indexOf(`${selector} {`);
  assert.ok(at >= 0, `globals.css 에 '${selector}' 규칙이 없다`);
  return globals.slice(at, globals.indexOf("}", at));
};
for (const selector of [".site-header .header-login", ".site-header .header-signup", ".platform-legal-document h1", ".platform-legal-layout > aside a", ".home-footer-notes", ".home-footer-legal"]) {
  assert.match(ruleOf(selector), /font-size:\s*[\d.]+rem/, `${selector}: 글자 크기가 rem 이 아니다`);
}
assert.match(ruleOf(".platform-legal-document > section p, .platform-legal-document > section li"), /font-size:\s*\.8125rem/, "약관 본문 글자가 rem 이 아니다");

for (const path of ["app/globals.css", "app/release-20260916.css", "app/puck-inter-font.css"]) {
  assert.doesNotMatch(css(path), /(?:^|[\s,}])(?:html|:root|body)\s*\{[^}]*font-size\s*:\s*[\d.]+px/, `${path}: 맨 위에 px 글자 크기 — rem 이 기본 글자 크기를 따르지 않게 된다`);
}

assert.match(globals, /input,\s*textarea,\s*select\s*\{\s*font-size:\s*max\(16px,\s*1rem\)\s*!important;/, "휴대폰 입력칸이 16px 고정이거나 16px 밑으로 내려갈 수 있다(iOS 확대)");

const studio = css("app/plan/studio/Studio.module.css");
assert.match(studio, /@media \(max-width:20\.5em\) \{ \.narrowTabs \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \} \}/, "글자를 키우면 작업실 탭 넷이 잘린다(2×2 규칙이 없다)");
assert.match(studio, /\.topBar \{ min-height:56px;/, "PC 작업실 머리줄 높이가 고정이라 글자를 키우면 단추가 밀려난다");
assert.match(studio, /\.tbRight \{[^}]*flex-wrap:wrap;/, "PC 작업실 머리줄 오른쪽이 줄을 바꾸지 않아 단추가 화면 밖으로 밀린다");
assert.match(css("app/plan/chat/page.module.css"), /\.header \{ min-height:80px;/, "머리줄 높이가 고정이라 제목·부제가 잘린다");

console.log("font scale s1: ok");
