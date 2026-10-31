import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * UI 공통 규격 2: 버튼 — 앱 화면의 주·보조·글자·위험 버튼은 components/app-button 하나로 그린다.
 * 1) 규격: 종류 넷(primary·secondary·text·danger) × 크기 둘(기본 44px · 작은 36px, 누르는 자리 44px), 모서리 8px, 글자 .9375rem/600,
 *    --app-* 토큰만, PC·모바일 같은 모양(@media 는 움직임 줄이기만), 포커스 표시 하나, 막힘·로딩 상태, 링크로도 쓴다
 * 2) 토큰 글자 대비 4.5:1 이상(포커스 선은 3:1 이상)
 * 3) 바꾼 화면은 공통 버튼을 쓰고, 예전 버튼 클래스에는 자리(여백·너비·정렬)만 남는다 — 높이·여백·색·글자·모서리를 다시 정하지 않는다
 * 4) 바꾼 파일에는 예전 파란 hex·글자·선 hex 가 남지 않는다
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const uncomment = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

// 1) 규격
const css = uncomment(read("components/app-button.module.css"));
const rule = (source: string, selector: string) => {
  const at = source.indexOf(`${selector} {`);
  assert.ok(at >= 0, `'${selector}' 규칙이 없다`);
  return source.slice(at, source.indexOf("}", at) + 1);
};
const base = rule(css, ".button[data-variant]");
for (const part of ["display:inline-flex", "min-height:44px", "border-radius:8px", "font-size:.9375rem", "font-weight:600", "height:auto"]) {
  assert.ok(base.includes(part), `버튼 기본 규격에 '${part}' 가 없다`);
}
assert.doesNotMatch(base, /(?:^|[\s;{])margin\s*:/, "공통 버튼이 바깥 여백을 정했다 — 자리는 쓰는 쪽이 정한다");
const small = rule(css, ".button[data-variant][data-size=small]");
assert.match(small, /min-height:36px/, "작은 버튼은 36px");
assert.match(rule(css, ".button[data-variant][data-size=small]::before"), /inset:-4px 0/, "작은 버튼도 누르는 자리는 44px(위아래 4px씩)");
const variants = [...new Set([...css.matchAll(/\.button\[data-variant=(\w+)\]/g)].map(match => match[1]))];
assert.deepEqual(variants.sort(), ["danger", "primary", "secondary", "text"], "버튼 종류는 넷뿐이다");
assert.doesNotMatch(css, /border-radius:\s*(?!8px)\d/, "모서리는 8px 하나 — 알약형(999px)은 칩·선택지에만");
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "버튼 색을 하드코딩했다 — --app-* 토큰만 쓴다");
for (const [, value] of css.matchAll(/(?:^|[\s;{])(?:color|background|border-color|outline)\s*:\s*([^;}]+)/g)) {
  assert.match(value.trim(), /^(?:transparent|(?:\d+px solid )?var\(--app-[a-z-]+\))$/, `버튼 색이 --app-* 토큰이 아니다: ${value.trim()}`);
}
for (const media of css.match(/@media[^{]*/g) ?? []) assert.match(media, /prefers-reduced-motion/, `PC·모바일 모양이 갈린다 — 버튼은 한 규격: ${media}`);
assert.match(rule(css, ".button[data-variant][data-size]:focus-visible"), /outline:3px solid var\(--app-focus-ring\); outline-offset:2px;/, "포커스 표시 하나(3px)");
assert.match(css, /\.button\[data-variant\]:disabled, \.button\[data-variant\]\[aria-disabled=true\] \{ opacity:\.5;/, "막힘 상태");
assert.match(css, /\.button \{ composes: tokens from "\.\/workspace-theme\.module\.css"; \}/, "버튼이 토큰을 들고 다니지 않는다 — 테마 밖(계정·창·첫 로딩)에서 색이 빠진다");

const component = read("components/app-button.tsx");
assert.match(component, /export type AppButtonVariant = "primary" \| "secondary" \| "text" \| "danger";/);
assert.match(component, /export type AppButtonSize = "default" \| "small";/);
assert.match(component, /<LoaderCircle className=\{styles\.spinner\} size=\{16\} aria-hidden="true" \/>/, "로딩은 도는 LoaderCircle");
assert.match(component, /disabled=\{disabled \|\| loading\} aria-busy=\{loading \|\| undefined\}/, "로딩 중에는 누르지 못하고 aria-busy");
assert.match(component, /type = "button"/, "버튼 기본 type 은 button(폼 안에서 뜻밖에 제출하지 않게)");
assert.match(component, /if \(as === "a"\) return <a /, "바깥 주소·내려받기는 <a>");
assert.match(component, /return <Link \{\.\.\.rest\} href=\{href\}/, "href 를 주면 next/link");

// 2) 글자 대비 — 토큰 값으로 계산(hover 는 토큰 정의대로 섞어서)
const theme = read("components/workspace-theme.module.css");
const raw = (name: string) => {
  const found = theme.match(new RegExp(`--app-${name}:\\s*([^;]+);`));
  assert.ok(found, `--app-${name} 토큰이 없다`);
  return found[1].trim();
};
const hex = (name: string): string => {
  const value = raw(name);
  const plain = value.match(/^#([0-9a-f]{6})$/i) ?? value.match(/^var\(--brand-primary, (#[0-9a-f]{6})\)$/i);
  if (plain) return plain[0].startsWith("#") ? plain[0] : plain[1];
  const mix = value.match(/^color-mix\(in srgb, var\(--app-([a-z-]+)\) (\d+)%, var\(--app-([a-z-]+)\)\)$/);
  assert.ok(mix, `--app-${name} 값을 읽지 못했다: ${value}`);
  const [a, b, weight] = [hex(mix[1]), hex(mix[3]), Number(mix[2]) / 100];
  return `#${[1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * weight + parseInt(b.slice(i, i + 2), 16) * (1 - weight)).toString(16).padStart(2, "0")).join("")}`;
};
const luminance = (color: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const [text, background] of [["surface", "primary"], ["surface", "primary-hover"], ["surface", "danger"], ["surface", "danger-hover"], ["text", "surface"], ["text", "raised"], ["primary", "surface"], ["primary", "soft"]]) {
  const ratio = contrast(text, background);
  assert.ok(ratio >= 4.5, `--app-${text} / --app-${background} 대비 ${ratio.toFixed(2)} — 4.5:1 미만`);
}
assert.ok(contrast("focus-ring", "surface") >= 3, "포커스 선이 흰 바탕에서 3:1 미만이다");

// 3) 바꾼 화면 — 공통 버튼을 쓴다
const users = [
  "app/account/page.tsx", "app/account/support/SupportCenter.tsx", "app/plan/BusinessEmptyState.tsx", "app/plan/BusinessRailTree.tsx",
  "app/plan/DeletedBusinessGuard.tsx", "app/plan/GenerationProgress.tsx", "app/plan/MarketEvidencePanel.tsx", "app/plan/MissingBusiness.tsx",
  "app/plan/PlanGate.tsx", "app/plan/PlanList.tsx", "app/plan/PlanLoading.tsx", "app/plan/chat/BriefEditor.tsx", "app/plan/chat/BusinessBrief.tsx",
  "app/plan/chat/BusinessIntake.tsx", "app/plan/chat/intake-ui/IdeaExploration.tsx", "app/plan/chat/intake-ui/IntakePanels.tsx",
  "app/plan/chat/intake-ui/ResourcePanel.tsx", "app/plan/chat/page.tsx", "app/plan/document/DocumentWorkspace.tsx", "app/plan/document/FactEdit.tsx",
  "app/plan/homepage/HomepageScreen.tsx", "app/plan/homepage/PublishedMenu.tsx", "app/plan/inquiries/page.tsx", "app/plan/me/page.tsx",
  "app/plan/pay/PlanCheckout.tsx", "app/plan/pay/result/PlanPayResult.tsx", "app/plan/proposal/BusinessConditionsPanel.tsx",
  "app/plan/proposal/DocumentRefreshPanel.tsx", "app/plan/proposal/SourceUpdatePanel.tsx", "app/plan/proposal/page.tsx", "app/plan/studio/Studio.tsx",
  "app/plan/workspace/ArtifactUpdatePanel.tsx", "app/plan/workspace/BusinessWorkspace.tsx", "app/plan/workspace/ExpertEditor.tsx",
  "app/plan/workspace/LaunchWorkspace.tsx", "app/plan/workspace/MarketingKit.tsx", "app/plan/workspace/OperatingAnalysisPanel.tsx",
  "app/plan/workspace/OperatingWorkspace.tsx", "app/plan/workspace/WorkspaceContent.tsx", "components/account-auth-form.tsx",
  "components/confirm-dialog.tsx", "components/homepage-source-update.tsx", "components/landing-image-crop.tsx", "components/next-services.tsx",
];
for (const path of users) {
  const source = read(path);
  assert.match(source, /import \{ AppButton(?:, [^}]+)? \} from "[./]+(?:components\/)?app-button";/, `${path}: 공통 버튼을 가져오지 않는다`);
  assert.match(source, /<AppButton\s(?:[^<>]|\{[^{}]*\})*?\bvariant=/, `${path}: 공통 버튼을 쓰지 않는다`);
}
// 대표 화면 — 감사에서 갈라져 있던 주 버튼 다섯 곳
assert.match(read("app/account/page.tsx"), /<AppButton variant="primary" loading=\{busy\} onClick=\{confirmLinkSignIn\}>/, "계정 확인 단추");
assert.match(read("app/plan/BusinessEmptyState.tsx"), /<AppButton variant="primary" href="\/plan\/chat\?new=1">시작하기/, "빈 사업 목록 시작하기");
assert.match(read("app/plan/proposal/page.tsx"), /<AppButton variant="primary" size="small" className=\{styles\.primary\} aria-label="PPT 내려받기"/, "제안서 내려받기");
assert.match(read("app/plan/homepage/HomepageScreen.tsx"), /<AppButton type="button" variant="primary" className=\{styles\.cta\}/, "홈페이지 막힘 화면 단추");
assert.match(read("app/plan/MarketEvidencePanel.tsx"), /<AppButton variant="primary" size="small" loading=\{busy\}/, "시장자료 찾기(목록 안 작은 동작)");
assert.match(read("components/confirm-dialog.tsx"), /variant=\{options\.danger \? "danger" : "primary"\}/, "확인창 — 되돌릴 수 없는 일은 위험 버튼");
assert.match(read("app/plan/me/page.tsx"), /<AppButton\s+type="button"\s+variant="danger"\s+className=\{styles\.dangerBtn\}/, "회원 탈퇴 최종 단추는 위험 버튼");

// 3) 예전 버튼 클래스 — 자리만 남는다
const VISUAL = /(?:^|[\s;{])(?:min-height|height|padding(?:-[a-z]+)?|background(?:-color)?|color|font(?:-size|-weight)?|border(?:-radius|-color)?|box-shadow|filter|line-height)\s*:/;
const placements: [string, string[]][] = [
  ["app/plan/BusinessHub.module.css", ["primary", "secondary", "textButton"]],
  ["app/plan/chat/page.module.css", ["primary", "secondary", "textButton", "finishButton", "editLink", "refineAction"]],
  ["app/plan/chat/intake.module.css", ["primaryButton", "secondaryButton", "textButton"]],
  ["app/plan/document/DocumentWorkspace.module.css", ["primary", "secondary", "nextButton", "emptyPrimary", "noticeAction", "factRetry", "chapterAction", "chapterChatAction"]],
  ["app/plan/workspace/PaneHeaderActions.module.css", ["btn", "primary"]],
  ["app/plan/workspace/OperatingWorkspace.module.css", ["primary", "inlineButton"]],
  ["app/plan/workspace/LaunchWorkspace.module.css", ["primary", "secondary"]],
  ["app/plan/GenerationProgress.module.css", ["primary", "secondary", "cardPrimary", "cardSecondary"]],
  ["app/plan/PlanGate.module.css", ["primary", "secondary"]],
  ["app/plan/proposal/proposal.module.css", ["primary"]],
  ["app/plan/homepage/page.module.css", ["cta", "ctaSecondary", "headerPrimary", "troubleLink"]],
  ["app/plan/pay/PlanCheckout.module.css", ["primary", "back", "retry", "payBarButton", "nav", "statusAction"]],
  ["app/plan/me/PlanMe.module.css", ["logout", "cardAction", "emptyAction", "refundBtn", "refundSubmit", "refundCancel", "dangerBtn"]],
  ["app/plan/inquiries/page.module.css", ["emptyLink", "emptyRefresh", "retry"]],
  ["app/account/support/support.module.css", ["primary", "secondary"]],
  ["app/plan/studio/Studio.module.css", ["relogin"]],
  ["components/account-auth-form.module.css", ["primary"]],
  ["components/next-services.module.css", ["cta"]],
  ["components/homepage-source-update.module.css", ["primary"]],
  ["components/landing-image-crop.module.css", ["original", "apply"]],
  ["components/confirm-dialog.module.css", ["confirm", "cancel"]],
];
const splitTop = (text: string) => { const parts: string[] = []; let depth = 0, current = ""; for (const char of text) { if ("([".includes(char)) depth++; if (")]".includes(char)) depth--; if (char === "," && depth === 0) { parts.push(current); current = ""; } else current += char; } parts.push(current); return parts; };
const subjectOf = (selector: string) => selector.trim().split(/\s*[>+~]\s*|\s+(?![^(]*\))/).pop() ?? "";
for (const [path, classes] of placements) {
  const source = uncomment(read(path));
  for (const [, head, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of splitTop(head)) {
      const name = classes.find(cls => new RegExp(`\\.${cls}(?![\\w-])`).test(subjectOf(selector)));
      if (name) assert.doesNotMatch(body, VISUAL, `${path} .${name}: 버튼 모양(높이·여백·색·글자·모서리)을 다시 정했다 — 자리만 정한다: ${selector.trim()} {${body}}`);
    }
  }
}
// 예전 버튼 모양 규칙은 남기지 않는다
const gone: [string, RegExp][] = [
  ["app/account/Account.module.css", /\.linkCancel\b|:global\(\.account-submit\)|:global\(\.account-(?:welcome|projects|plan-list|plan-all|payments|dashboard)\)/],
  ["app/plan/MarketEvidencePanel.module.css", /\.(?:primary|ghost)\b/],
  ["app/plan/PlanLoading.module.css", /\.retry\b/],
  ["app/plan/chat/intake.module.css", /\.(?:detailButton|mobileSummaryButton|unknownButton)\b|\.confirmActions button/],
  ["app/plan/homepage/page.module.css", /\.ghost\b/],
  ["app/plan/homepage/PublishedMenu.module.css", /\.trigger\b/],
  ["app/plan/BusinessRailTree.module.css", /\.lockDialog (?:button|a)\b/],
  ["app/plan/DeletedBusinessGuard.module.css", /\.dialog a\b/],
  ["app/plan/workspace/ArtifactUpdatePanel.module.css", /\.panel button[^{]*\{[^}]*(?:background|min-height)/],
  ["app/plan/chat/intake-ui/resource-panel.module.css", /\.panel button/],
  ["app/plan/chat/intake-ui/idea-exploration.module.css", /\.section button|\.actions button/],
  ["components/next-services.module.css", /\.(?:action|ghost)\b|\.loadError button|\.verifyRow button/],
];
for (const [path, pattern] of gone) assert.doesNotMatch(uncomment(read(path)), pattern, `${path}: 예전 버튼 모양 규칙이 남았다(${pattern})`);

// 4) 바꾼 파일 — 예전 파란 hex(#246bd1 #2867ca #1957c2 #1b64da #3182f6)·글자(#191f28)·선(#e5e8eb) 대신 토큰
const changedStyles = [...new Set([...placements.map(([path]) => path), ...gone.map(([path]) => path), "app/plan/BusinessRailTree.module.css", "app/plan/PlanLoading.module.css"])];
for (const path of changedStyles) {
  assert.doesNotMatch(read(path), /#(?:246bd1|2867ca|1957c2|1b64da|3182f6|191f28|e5e8eb)/i, `${path}: 예전 hex 가 남았다 — --app-* 토큰으로`);
}
for (const name of ["primary-hover", "danger-hover", "focus-ring"]) assert.match(theme, new RegExp(`--app-${name}: color-mix\\(in srgb, var\\(--app-`), `--app-${name} 토큰은 다른 토큰을 섞어 만든다`);

console.log("app button: ok");
