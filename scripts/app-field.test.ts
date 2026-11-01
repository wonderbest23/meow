import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * UI 공통 규격 3: 입력칸 + 포커스 — 앱 화면의 한 줄·여러 줄·고르기 칸과 라벨은 components/app-field 하나로 그린다.
 * 1) 규격: 높이 44px(textarea 는 min-height), 모서리 8px(버튼과 같게), 테두리 1px --app-line, 글자 1rem(16px — iOS 확대 방지),
 *    포커스는 테두리 --app-primary + 버튼과 같은 3px 링(--app-focus-ring), placeholder --app-muted, 라벨 .875rem/600 --app-text,
 *    도움말 .8125rem --app-muted, 오류 --app-danger, 막힘 .5, --app-* 토큰만, PC·모바일 같은 규격(@media 없음)
 * 2) 바꾼 화면은 공통 입력칸을 쓴다 — 맨 <input>·<textarea>·<select> 가 남지 않는다(체크·라디오·범위·파일, 단위 묶음 칸 안 입력은 예외)
 * 3) 바꾼 CSS 에는 outline:none 이 없고, 입력칸 모양(테두리·모서리·글자 크기·높이)을 다시 정하지 않는다 — 자리만
 * 4) 오류·도움말 줄은 aria-describedby 로 입력칸에 잇는다
 * 5) 바꾼 파일에는 예전 입력칸 테두리 hex·포커스 hex 가 남지 않는다
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const uncomment = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

// 1) 규격
const css = uncomment(read("components/app-field.module.css"));
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `'${selector}' 규칙이 없다`);
  return css.slice(at, css.indexOf("}", at) + 1);
};
const C = ".control[data-app-field][data-app-field]";
const base = rule(C);
for (const part of ["height:44px", "padding:0 12px", "border:1px solid var(--app-line)", "border-radius:8px", "background:var(--app-surface)", "color:var(--app-text)", "font-size:1rem", "font-weight:400"]) {
  assert.ok(base.includes(part), `입력칸 기본 규격에 '${part}' 가 없다`);
}
assert.doesNotMatch(base, /(?:^|[\s;{])(?:margin|width)\s*:/, "공통 입력칸 모양 규칙이 자리(너비·여백)를 정했다 — 자리는 :where() 로 우선순위 0 에 둔다");
assert.match(css, /:where\(\.control\) \{ display:block; width:100%; min-width:0; margin:0; \}/, "자리는 :where() — 쓰는 쪽 className 이 언제나 바꿀 수 있게");
assert.match(rule(".control[data-app-field=textarea][data-app-field]"), /height:auto; min-height:88px;[^}]*resize:vertical;/, "여러 줄 칸은 min-height 로, 세로로만 늘린다");
assert.match(rule(`${C}::placeholder`), /color:var\(--app-muted\); opacity:1;/, "placeholder 는 --app-muted");
assert.match(rule(`${C}[aria-invalid=true]`), /border-color:var\(--app-danger\)/, "오류 칸 테두리는 --app-danger");
assert.match(rule(`${C}:focus`), /border-color:var\(--app-primary\)/, "포커스 테두리는 --app-primary");
assert.match(rule(`${C}:focus-visible`), /outline:3px solid var\(--app-focus-ring\); outline-offset:2px;/, "포커스 링은 버튼과 같은 3px --app-focus-ring");
assert.match(read("components/app-button.module.css"), /:focus-visible \{ outline:3px solid var\(--app-focus-ring\); outline-offset:2px; \}/, "버튼과 입력칸의 포커스 링이 갈렸다");
assert.match(css, /\.control\[data-app-field\]\[data-app-field\]:disabled, \.control\[data-app-field\]\[data-app-field\]\[aria-disabled=true\] \{ opacity:\.5;/, "막힘 상태는 투명도 .5");
assert.match(rule(".group[data-app-field][data-app-field]:focus-within"), /border-color:var\(--app-primary\); outline:3px solid var\(--app-focus-ring\); outline-offset:2px;/, "단위 묶음 칸도 같은 포커스 링");
assert.match(rule(".label[data-app-field][data-app-field]"), /font-size:\.875rem; font-weight:600;[^}]*color:var\(--app-text\);/, "라벨 .875rem/600 --app-text");
assert.match(rule(".help[data-app-field][data-app-field]"), /font-size:\.8125rem;[^}]*color:var\(--app-muted\);/, "도움말 .8125rem --app-muted");
assert.match(rule(".error[data-app-field][data-app-field]"), /color:var\(--app-danger\);/, "오류 줄 --app-danger");
/* 설정 화면(lovable 구조 3단계) — data-shape="round" 만 12px(휴대폰 검색칸 · 선택칸), data-size compact 32 · large 48 */
const round = rule(".control[data-app-field][data-app-field][data-shape=round], .group[data-app-field][data-app-field][data-shape=round]");
assert.match(round, /\{ border-radius:12px; \}/, "휴대폰 검색칸·선택칸(round)은 r12");
assert.doesNotMatch(css.replace(round, ""), /border-radius:\s*(?!8px)\d/, "모서리는 8px 하나(버튼과 같게 · round 만 12px)");
assert.match(rule(`${C}[data-size=compact]`), /height:32px;/, "설정 행 카드 입력칸은 32px");
assert.match(rule(`${C}[data-size=large]`), /height:48px;/, "휴대폰 선택칸은 48px");
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "입력칸 색을 하드코딩했다 — --app-* 토큰만 쓴다");
for (const [, value] of css.matchAll(/(?:^|[\s;{])(?:color|background|border(?:-color)?|outline(?:-color)?)\s*:\s*([^;}]+)/g)) {
  assert.match(value.trim(), /^(?:transparent|inherit|0|(?:\d+px solid )?var\(--app-[a-z-]+\))$/, `입력칸 색이 --app-* 토큰이 아니다: ${value.trim()}`);
}
assert.doesNotMatch(css, /@media/, "PC·모바일 모양이 갈린다 — 입력칸은 한 규격");
for (const [, size] of css.matchAll(/font-size:\s*([^;}]+)/g)) {
  if (/^\.(?:8125|875)rem$/.test(size.trim())) continue; // 라벨·도움말·오류 줄(입력칸 글자 아님)
  assert.equal(size.trim(), "1rem", `입력칸 글자가 16px 밑이다(iOS 가 확대한다): ${size}`);
}
for (const name of ["control", "group", "label", "help", "error"]) {
  assert.match(css, new RegExp(`\\.${name} \\{ composes: tokens from "\\./workspace-theme\\.module\\.css"; \\}`), `.${name} 이 토큰을 들고 다니지 않는다 — 테마 밖(계정·창)에서 색이 빠진다`);
}
// 모양은 [data-app-field] 두 번 — 빌드가 :is() 를 :-webkit-any() 로 바꾸면 테마 포커스 규칙이 (0,3,0) 이 된다
assert.doesNotMatch(css.replace(/\[data-app-field(?:=[a-z]+)?\]\[data-app-field\]/g, ""), /\[data-app-field/, "모양 규칙이 [data-app-field] 한 번뿐이다 — 테마·화면의 :-webkit-any() 규칙에 순서대로 밀린다");

const component = read("components/app-field.tsx");
for (const [name, tag, kind] of [["TextField", "input", "input"], ["TextArea", "textarea", "textarea"], ["Select", "select", "select"], ["FieldLabel", "label", "label"], ["FieldHelp", "p", "help"], ["FieldError", "p", "error"]] as const) {
  assert.match(component, new RegExp(`export function ${name}\\(`), `${name} 이 없다`);
  assert.match(component, new RegExp(`<${tag} \\{\\.\\.\\.rest\\}[^>]*data-app-field="${kind}"`), `${name} 이 <${tag} data-app-field="${kind}"> 를 그리지 않는다`);
}
assert.match(component, /export function FieldGroup\(\{ as: Tag = "div"/, "단위 묶음 칸(FieldGroup)이 없다");
assert.doesNotMatch(component, /data-field=/, "data-field 는 화면 코드가 쓰는 이름이다(운영 기록 오류 칸 찾기) — data-app-field 로");

// 2) 바꾼 화면 — 공통 입력칸을 쓴다
const users = [
  "app/account/support/SupportCenter.tsx", "app/plan/PlanList.tsx", "app/plan/chat/BriefEditor.tsx", "app/plan/chat/intake-ui/IntakePanels.tsx",
  "app/plan/chat/intake-ui/ResourcePanel.tsx", "app/plan/document/FactEdit.tsx", "app/plan/me/page.tsx", "app/plan/pay/PlanCheckout.tsx",
  "app/plan/proposal/BusinessConditionsPanel.tsx", "app/plan/proposal/ProposalContentControls.tsx", "app/plan/proposal/page.tsx",
  "app/plan/workspace/ArtifactUpdatePanel.tsx", "app/plan/workspace/ExpertEditor.tsx", "app/plan/workspace/LaunchWorkspace.tsx",
  "app/plan/workspace/OperatingAnalysisPanel.tsx", "app/plan/workspace/OperatingWorkspace.tsx", "components/account-auth-form.tsx",
  "components/confirm-dialog.tsx", "components/homepage-alert-settings.tsx", "components/homepage-expert-consult.tsx", "components/homepage-kit-panel.tsx",
  "components/landing-domain-connector.tsx", "components/landing-image-crop.tsx", "components/next-services.tsx",
  "app/plan/me/AccountActions.tsx", "app/plan/SettingsMenu.tsx", "app/plan/settings/SettingsIndex.tsx",
];
const NOT_TEXT = /\btype=(?:"(?:checkbox|radio|range|file|hidden|color)"|\{[^}]*"(?:checkbox|radio)")/;
for (const path of users) {
  const source = read(path);
  assert.match(source, /import \{ [^}]*\b(?:TextField|TextArea|Select|FieldGroup)\b[^}]* \} from "[./]+(?:components\/)?app-field";/, `${path}: 공통 입력칸을 가져오지 않는다`);
  assert.match(source, /<(?:TextField|TextArea|Select|FieldGroup)\b/, `${path}: 공통 입력칸을 쓰지 않는다`);
  // 단위 묶음 칸 안 <input> 은 겉 상자가 모양을 그린다 — 뺀 나머지에 맨 입력칸이 없어야 한다
  const outside = source.replace(/<FieldGroup\b[\s\S]*?<\/FieldGroup>/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  for (const [tag] of outside.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)) {
    assert.match(tag, NOT_TEXT, `${path}: 맨 입력칸이 남았다 — TextField·TextArea·Select 로: ${tag.slice(0, 100)}`);
  }
}
// 대표 화면 — 감사에서 갈라져 있던 다섯 곳
assert.match(read("app/account/support/SupportCenter.tsx"), /<SettingsRow title="제목" titleFor="support-subject"[\s\S]*?<TextField id="support-subject" data-size="compact" className=\{styles\.field\} value=\{draft\.subject\}/, "고객센터 문의 제목 칸(행 제목이 칸의 label)");
assert.match(read("components/confirm-dialog.tsx"), /<TextField ref=\{field\} className=\{styles\.field\}/, "확인창 입력칸");
assert.match(read("components/account-auth-form.tsx"), /<TextField ref=\{emailInput\} type="email"/, "로그인 이메일 칸");
assert.match(read("app/plan/proposal/BusinessConditionsPanel.tsx"), /<FieldLabel key=\{key\}>\{label\}<TextField aria-label=\{label\}/, "제안서 사업 조건 칸");
assert.match(read("app/plan/me/page.tsx"), /<TextArea\s+aria-label="환불 사유"/, "회원 정보 환불 사유 칸");

// 3) 바꾼 CSS — outline:none 없음, 입력칸 모양을 다시 정하지 않음
const styles = [
  "app/account/Account.module.css", "app/account/support/support.module.css", "app/plan/BusinessHub.module.css", "app/plan/chat/intake-ui/resource-panel.module.css",
  "app/plan/chat/intake.module.css", "app/plan/chat/page.module.css", "app/plan/document/DocumentWorkspace.module.css", "app/plan/me/PlanMe.module.css",
  "app/plan/pay/PlanCheckout.module.css", "app/plan/proposal/proposal.module.css", "app/plan/workspace/ArtifactUpdatePanel.module.css",
  "app/plan/workspace/LaunchWorkspace.module.css", "app/plan/workspace/OperatingWorkspace.module.css", "components/account-auth-form.module.css",
  "components/confirm-dialog.module.css", "components/landing-image-crop.module.css", "components/next-services.module.css",
];
const FIELD_LOOK = /(?:^|[\s;{])(?:height|min-height|padding(?:-[a-z]+)?|border(?:-(?:top|right|bottom|left))?|border-(?:color|radius)|background(?:-color)?|font-size|box-shadow|outline)\s*:/;
const splitTop = (text: string) => { const parts: string[] = []; let depth = 0, current = ""; for (const char of text) { if ("([".includes(char)) depth++; if (")]".includes(char)) depth--; if (char === "," && depth === 0) { parts.push(current); current = ""; } else current += char; } parts.push(current); return parts; };
const subjectOf = (selector: string) => selector.trim().split(/\s*[>+~]\s*|\s+(?![^(]*\))/).pop() ?? "";
// 대화 칸(composer)은 말풍선 모양이라 제외, 체크·라디오·범위는 입력칸이 아니다
const EXEMPT = /composer|\[type=["']?(?:checkbox|radio|range)|agreeList|agreeAll|consents|\.check\b|actionOption|appendix|reviewPages|transmission|documentSelection|sourceReview|changeTitle|\.range\b|checklist|chatQuestion|option/;
for (const path of styles) {
  const source = uncomment(read(path));
  assert.doesNotMatch(source, /outline\s*:\s*(?:none|0)\b/, `${path}: outline:none 이 남았다 — 보이는 포커스로(감싼 상자가 링을 그리면 안쪽은 outline-color:transparent)`);
  for (const [, head, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of splitTop(head)) {
      if (EXEMPT.test(selector) || !/(?:^|[\s(,])(?:input|textarea|select)\b/.test(subjectOf(selector))) continue;
      assert.doesNotMatch(body, FIELD_LOOK, `${path}: 입력칸 모양(높이·여백·테두리·모서리·바탕·글자 크기·포커스)을 다시 정했다 — 공통 입력칸에 맡기고 자리만: ${selector.trim()} {${body}}`);
    }
  }
}
// 예전 입력칸 모양 규칙은 남기지 않는다
const gone: [string, RegExp][] = [
  ["app/account/support/support.module.css", /\.form label \{|\.form :is\(input,select,textarea\)|:is\(button,a,input,select,textarea,summary\):focus-visible/],
  ["components/confirm-dialog.module.css", /\.field:focus|\.field\[readonly\]|min-height: 48px/],
  ["components/account-auth-form.module.css", /\.form \.input \{|\.input:focus|\.cell:(?:first|last|only)-child \.input|\.cell \+ \.cell \.input/],
  ["app/plan/proposal/proposal.module.css", /\.inspector input, \.inspector textarea|\.businessFields (?:input|label)|\.page select \{ font/],
  ["app/plan/me/PlanMe.module.css", /\.refundForm textarea|\.deleteForm input \{|1\.5px solid/],
  ["app/plan/workspace/OperatingWorkspace.module.css", /\.root input, \.root textarea, \.root select|\.root label \{/],
  ["app/plan/chat/intake.module.css", /\.page textarea|\.ksicSearch input|\.costHelperInput input|\.dateRange (?:input|label)|\.stepValue input \{[^}]*border/],
  ["app/plan/chat/page.module.css", /\.inlineField input|\.inlineField :is\(input,textarea\) \{ background/],
  ["components/next-services.module.css", /\.form input, \.form textarea|\.sheet \.form input|\.form label > span/],
];
for (const [path, pattern] of gone) assert.doesNotMatch(uncomment(read(path)), pattern, `${path}: 예전 입력칸 모양 규칙이 남았다(${pattern})`);
// 대화 칸은 말풍선 그대로, 포커스는 바깥 상자에 같은 링
assert.match(read("app/plan/chat/page.module.css"), /\.composer form:focus-within \{[^}]*outline:3px solid var\(--app-focus-ring\); outline-offset:2px; \}/, "대화 칸 포커스가 보이지 않는다");
assert.match(read("app/plan/chat/intake.module.css"), /\.composerShell:focus-within \{[^}]*outline: 3px solid var\(--app-focus-ring\); outline-offset: 2px; \}/, "대화 칸 포커스가 보이지 않는다");
assert.match(read("app/plan/chat/intake.module.css"), /\.page\[data-coach\] \.composerShell:focus-within \{[^}]*outline: 3px solid var\(--app-focus-ring\)/, "코치 대화 칸 포커스가 보이지 않는다");
// 홈페이지 편집 칸(전역 CSS) — 입력칸 모양은 공통 입력칸에
const globals = uncomment(read("app/globals.css"));
for (const pattern of [/\.hk-grid input:not\(\[type="checkbox"\]\) \{[^}]*border/, /\.hk-grid label \{ display/, /\.hk-alerts-phone input/, /\.hk-expert input, \.hk-expert textarea/, /\.domain-connect-form input/, /\.hk-grid \.slug-input\[data-invalid\]/]) {
  assert.doesNotMatch(globals, pattern, `globals.css: 예전 홈페이지 편집 칸 입력칸 규칙이 남았다(${pattern})`);
}

// 4) 오류·도움말 줄은 aria-describedby 로 잇는다
assert.match(read("app/account/support/SupportCenter.tsx"), /aria-describedby="support-message-help"[\s\S]*<FieldHelp id="support-message-help">/, "문의 내용 칸 안내");
assert.match(read("app/plan/pay/PlanCheckout.tsx"), /aria-invalid=\{phoneInvalid\} aria-describedby="notice-phone-help"[\s\S]*<FieldError id="notice-phone-help">/, "결제 안내 휴대폰 칸 오류");
assert.match(read("components/account-auth-form.tsx"), /<FieldError id=\{mismatchId\}[\s\S]*aria-invalid=\{error \? true : undefined\} aria-describedby=\{error\}/, "비밀번호 확인 칸 오류");
assert.match(read("app/plan/me/AccountActions.tsx"), /aria-describedby=\{deleteMessage \? "delete-guide delete-error" : "delete-guide"\}[\s\S]*<FieldError id="delete-error"/, "회원 탈퇴 확인 칸 오류");
assert.match(read("components/homepage-kit-panel.tsx"), /aria-describedby="hk-slug-help"[\s\S]*<FieldError id="hk-slug-help"[\s\S]*<FieldHelp id="hk-slug-help"/, "홈페이지 주소 칸 오류·안내");
assert.match(read("app/plan/document/FactEdit.tsx"), /aria-describedby="fact-amount-help"[\s\S]*<FieldHelp id="fact-amount-help" aria-live="polite">/, "금액 고치기 칸 안내");

// 5) 바꾼 파일 — 예전 입력칸 테두리 hex·포커스 hex 대신 토큰
const OLD = /#(?:dce1e8|c9d0d9|d8dee7|d7dfe9|cbd5e1|cad8ed|ced7e2|d1d6db|dbdbdb|cbd4df|cfdcec|d8e0ea|90baff|719fec|276cdb|276deb|2476e5|316be5)\b/i;
for (const path of [...styles, "components/app-field.module.css"]) assert.doesNotMatch(read(path), OLD, `${path}: 예전 입력칸 테두리·포커스 hex 가 남았다 — --app-* 토큰으로`);

console.log("app field: ok");
