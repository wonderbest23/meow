import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/*
 * UI 공통 규격: 상태 표시 배지 — 앱 화면의 상태·분류 배지는 components/status-badge 하나로 그린다.
 * 1) 규격: 색조 다섯(success·info·warning·danger·neutral) × 크기 하나, --app-* 토큰만, PC·모바일 같은 모양
 * 2) 토큰 글자 대비 4.5:1 이상(중립은 흰·연회색 바탕 위)
 * 3) 바꾼 화면은 공통 배지를 쓰고, 예전 자리 클래스에는 글자 크기·굵기·여백·색을 다시 두지 않는다
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const css = read("components/status-badge.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (source: string, selector: string) => {
  const at = source.indexOf(`${selector} {`);
  assert.ok(at >= 0, `'${selector}' 규칙이 없다`);
  return source.slice(at, source.indexOf("}", at) + 1);
};
const base = rule(css, ".badge");
for (const part of ["display:inline-flex", "gap:3px", "padding:3px 8px", "border-radius:999px", "font-size:.75rem", "font-weight:600"]) {
  assert.ok(base.includes(part), `배지 기본 규격에 '${part}' 가 없다`);
}
const tones = [...css.matchAll(/\.badge\[data-tone=(\w+)\]/g)].map(match => match[1]);
assert.deepEqual(tones.sort(), ["danger", "info", "neutral", "success", "warning"], "색조는 다섯 가지뿐이다");
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "배지 색을 하드코딩했다 — --app-* 토큰만 쓴다");
for (const [, value] of css.matchAll(/(?:^|[\s;{])(?:color|background)\s*:\s*([^;}]+)/g)) {
  assert.match(value.trim(), /^var\(--app-[a-z-]+\)$/, `배지 색이 --app-* 토큰이 아니다: ${value.trim()}`);
}
assert.doesNotMatch(css, /@media/, "PC·모바일 모양이 갈린다 — 배지는 한 규격");
assert.match(rule(css, ".badge[data-tone=neutral]"), /padding-inline:0;[^}]*color:var\(--app-muted\)/, "중립은 배경 없는 흐린 글씨");
assert.doesNotMatch(rule(css, ".badge[data-tone=neutral]"), /background/, "중립에 바탕색을 깔았다");

const component = read("components/status-badge.tsx");
assert.match(component, /export type StatusTone = "success" \| "info" \| "warning" \| "danger" \| "neutral";/);
assert.match(component, /<Check size=\{13\} strokeWidth=\{2\.75\} aria-hidden="true" \/>/, "완료 표시는 lucide Check 13px");

// 2) 글자 대비 — 토큰 값으로 계산
const theme = read("components/workspace-theme.module.css");
const token = (name: string) => {
  const found = theme.match(new RegExp(`--app-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(found, `--app-${name} 값을 찾지 못했다`);
  return found[1];
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const [text, background] of [["success", "success-bg"], ["selected-text", "selected"], ["warning", "warning-bg"], ["danger", "danger-bg"], ["muted", "surface"], ["muted", "raised"], ["muted", "selected"]]) {
  const ratio = contrast(token(text), token(background));
  assert.ok(ratio >= 4.5, `--app-${text} / --app-${background} 대비 ${ratio.toFixed(2)} — 4.5:1 미만`);
}

// 3) 바꾼 화면 — 공통 배지를 쓰고, 예전 클래스는 자리만 정한다
const users = [
  "app/account/support/SupportCenter.tsx", "app/plan/PlanList.tsx", "app/plan/PlanRailNav.tsx", "app/plan/workspace/WorkspaceContent.tsx",
  "app/plan/workspace/LaunchWorkspace.tsx", "app/plan/document/DocumentReadContent.tsx", "app/plan/document/DocumentWorkspace.tsx",
  "app/plan/homepage/HomepageScreen.tsx", "components/homepage-kit-panel.tsx", "app/plan/inquiries/page.tsx", "app/plan/me/page.tsx",
  "app/plan/pay/PlanCheckout.tsx", "app/plan/studio/StudioIntakeSummary.tsx", "app/plan/chat/intake-ui/IntakePanels.tsx",
  "app/plan/chat/intake-ui/StudioEditTurns.tsx", "app/plan/chat/BusinessBrief.tsx", "components/next-services.tsx",
];
for (const path of users) assert.match(read(path), /<StatusBadge tone=/, `${path}: 공통 상태 배지를 쓰지 않는다`);

const VISUAL = /(?:^|[\s;{])(?:font-size|font-weight|padding|border-radius|background|color)\s*:/;
const placements: [string, string][] = [
  ["app/plan/workspace/LaunchWorkspace.module.css", ".decidedTag"], ["app/plan/workspace/LaunchWorkspace.module.css", ".stepList .status"],
  ["app/plan/PlanRailNav.module.css", ".sampleTag"], ["app/plan/homepage/page.module.css", ".stripBadge"],
  ["app/plan/inquiries/page.module.css", ".handledBadge"], ["app/plan/pay/PlanCheckout.module.css", ".launchTag"],
  ["app/plan/chat/intake.module.css", ".ksicBadge"], ["app/plan/chat/intake.module.css", ".queueBadge"],
  ["app/plan/chat/intake.module.css", ".queueTag"], ["app/plan/chat/intake.module.css", ".bubbleTag"],
  ["components/next-services.module.css", ".ribbon"], ["components/next-services.module.css", ".historyStatus"],
];
for (const [path, selector] of placements) {
  const source = read(path);
  for (const at of [...source.matchAll(new RegExp(`${selector.replace(/[.[\]]/g, "\\$&")}(?:\\[[^\\]]+\\])? \\{`, "g"))].map(match => match.index!)) {
    const body = source.slice(at, source.indexOf("}", at) + 1);
    assert.doesNotMatch(body, VISUAL, `${path} ${selector}: 배지 모양(글자·여백·색)을 다시 정했다 — 자리만 정한다: ${body}`);
  }
}
// 예전 배지 모양 규칙은 남기지 않는다
const gone: [string, RegExp][] = [
  ["app/account/support/support.module.css", /\.status(?:Waiting|Done)\b/], ["app/plan/MyBusinessList.module.css", /\.stage\b/],
  ["app/plan/me/PlanMe.module.css", /\.status(?:Done|Bad)?\b/], ["app/plan/document/DocumentWorkspace.module.css", /\.(?:changingBadge|doneBadge)\b/],
  ["app/plan/studio/Studio.module.css", /\.sumTag\b|\.liveSummary dt small/], ["app/plan/BusinessHub.module.css", /\.status\b/],
  ["app/globals.css", /\.hk-badge/], ["components/next-services.module.css", /\.badge\b|\.ribbon\[data-tone/],
];
for (const [path, pattern] of gone) assert.doesNotMatch(read(path), pattern, `${path}: 예전 배지 모양 규칙이 남았다(${pattern})`);
assert.ok(!existsSync(new URL("../app/plan/ReviewPanel.module.css", import.meta.url)), "어디서도 쓰지 않는 ReviewPanel.module.css 가 돌아왔다");

console.log("status badge: ok");
