import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

/*
 * UI 공통 규격 4: 빈 화면·로딩 — 앱 화면의 빈 화면은 app/plan/BusinessEmptyState 의 EmptyState 하나로, 도는 표시는 PlanLoading 의 키프레임 하나로 그린다.
 * 1) 규격: 아이콘(lucide 28px · --app-muted) · 제목 1.0625rem/700 --app-text · 설명 .9375rem --app-muted · 동작은 AppButton(primary·secondary),
 *    세로·가로 가운데, 여백 하나(48px 24px), --app-* 토큰만, PC·모바일 같은 모양(@media 없음)
 * 2) 자체 빈 화면이던 7곳(문의·문서·운영 기록·고객센터·내 정보 + 내 사업·대화)이 공통 부품을 쓰고, 예전 빈 화면 클래스는 자리만 남는다
 * 3) 도는 표시의 키프레임은 PlanLoading.module.css 의 loadingSpin 하나 — 다른 곳은 composes 로 빌린다. 움직임 줄이기를 따른다
 * 4) 바꾼 파일에는 hex 색이 남지 않는다(주석 밖)
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const uncomment = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (source: string, selector: string) => {
  const at = source.indexOf(`${selector} {`);
  assert.ok(at >= 0, `'${selector}' 규칙이 없다`);
  return source.slice(at, source.indexOf("}", at) + 1);
};

// 1) 규격
const css = uncomment(read("app/plan/BusinessEmptyState.module.css"));
assert.match(css, /\.root \{ composes: tokens from "\.\.\/\.\.\/components\/workspace-theme\.module\.css"; \}/, "빈 화면이 토큰을 들고 다니지 않는다 — 테마 밖(계정·고객센터)에서 색이 빠진다");
const root = rule(css, ".root[data-empty-state][data-empty-state]");
for (const part of ["display:flex", "flex-direction:column", "align-items:center", "justify-content:center", "padding:48px 24px", "text-align:center"]) {
  assert.ok(root.includes(part), `빈 화면 규격에 '${part}' 가 없다`);
}
const title = rule(css, ".title[data-empty-part][data-empty-part]");
for (const part of ["font-size:1.0625rem", "font-weight:700", "color:var(--app-text)", "margin:0"]) assert.ok(title.includes(part), `제목 규격에 '${part}' 가 없다`);
const description = rule(css, ".description[data-empty-part][data-empty-part]");
for (const part of ["font-size:.9375rem", "color:var(--app-muted)", "margin:0"]) assert.ok(description.includes(part), `설명 규격에 '${part}' 가 없다`);
assert.match(rule(css, ".icon[data-empty-part][data-empty-part]"), /width:60px;[^}]*height:60px;[^}]*border-radius:16px;[^}]*background:var\(--app-soft\);[^}]*color:var\(--app-primary\)/, "아이콘은 둥근 네모 60px 바탕 안에(앱 전체 같은 모양)");
assert.match(rule(css, ".actions[data-empty-part][data-empty-part]"), /justify-content:center;[^}]*gap:8px;[^}]*margin:16px 0 0;/, "동작 버튼 줄은 가운데 · 8px 간격 · 설명 아래 16px");
assert.equal([...css.matchAll(/padding\s*:/g)].length, 1, "여백은 하나(48px 24px) — 화면마다 다른 여백을 두지 않는다");
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "빈 화면 색을 하드코딩했다 — --app-* 토큰만 쓴다");
for (const [, value] of css.matchAll(/(?:^|[\s;{])(?:color|background|border-color)\s*:\s*([^;}]+)/g)) {
  assert.match(value.trim(), /^var\(--app-[a-z-]+\)$/, `빈 화면 색이 --app-* 토큰이 아니다: ${value.trim()}`);
}
assert.doesNotMatch(css, /@media/, "PC·모바일 모양이 갈린다 — 빈 화면은 한 규격");
assert.match(css, /:where\(\.root\) \{[^}]*\}/, "자리(너비·바깥 여백)는 :where() 로 — 쓰는 쪽 className 이 바꿀 수 있게");
assert.doesNotMatch(rule(css, ".root[data-empty-state][data-empty-state]"), /(?:^|[\s;{])(?:margin|min-height|height|width)\s*:/, "공통 빈 화면이 자리(높이·너비·바깥 여백)를 정했다 — 쓰는 쪽이 정한다");

const component = read("app/plan/BusinessEmptyState.tsx");
assert.match(component, /export function EmptyState\(/, "공통 EmptyState 를 내보내지 않는다");
assert.match(component, /<span className=\{styles\.icon\} aria-hidden="true" data-empty-part="icon"><Icon size=\{28\} strokeWidth=\{1\.75\} \/><\/span>/, "아이콘은 lucide 28px · 둥근 네모 바탕 · 화면 읽기에서 숨김");
for (const file of ["app/plan/chat/BusinessIntake.tsx", "app/plan/MissingBusiness.tsx"]) assert.match(read(file), /<EmptyIcon icon=\{/, `${file} 의 안내 아이콘이 공통 EmptyIcon 이 아니다`);
assert.match(component, /export type EmptyStateHeading = "h1" \| "h2" \| "h3" \| "p";/, "제목 태그는 화면 제목 순서에 맞춰 고른다");
assert.match(component, /data-empty-state=""/);
assert.match(component, /export default function BusinessEmptyState\([\s\S]*<EmptyState as="section"/, "내 사업 빈 화면도 공통 EmptyState 로 그린다");
assert.doesNotMatch(component, /styles\.empty\b|emptyIcon|emptyTitle/, "내 사업 빈 화면이 예전 BusinessHub 빈 화면 클래스를 쓴다");

// 2) 바꾼 화면 — 공통 EmptyState 를 쓰고, 동작은 AppButton(primary·secondary)
/** <EmptyState …/> 또는 <EmptyState …>…</EmptyState> 덩어리를 중괄호 깊이를 따라 잘라 낸다 */
const emptyStates = (source: string) => {
  const blocks: string[] = [];
  for (let at = source.indexOf("<EmptyState "); at >= 0; at = source.indexOf("<EmptyState ", at + 1)) {
    let depth = 0, end = -1;
    for (let i = at; i < source.length; i++) {
      const char = source[i];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (depth === 0 && source.startsWith("/>", i)) { end = i + 2; break; }
      else if (depth === 0 && char === ">" && source[i - 1] !== "=") { end = source.indexOf("</EmptyState>", i); assert.ok(end > 0, "닫는 </EmptyState> 가 없다"); end += 13; break; }
    }
    assert.ok(end > at, "EmptyState 덩어리를 읽지 못했다");
    blocks.push(source.slice(at, end));
  }
  return blocks;
};
const users: [string, number][] = [
  ["app/plan/inquiries/page.tsx", 2], ["app/plan/document/DocumentWorkspace.tsx", 1], ["app/plan/workspace/OperatingWorkspace.tsx", 2],
  ["app/account/support/SupportCenter.tsx", 2], ["app/plan/me/page.tsx", 2], ["app/plan/BusinessEmptyState.tsx", 1],
];
for (const [path, count] of users) {
  const source = read(path);
  if (!path.endsWith("BusinessEmptyState.tsx")) assert.match(source, /import \{ EmptyState \} from "(?:\.\.\/)+(?:plan\/)?BusinessEmptyState";/, `${path}: 공통 빈 화면을 가져오지 않는다`);
  const blocks = emptyStates(source);
  assert.equal(blocks.length, count, `${path}: 공통 빈 화면 ${count}곳이어야 한다(지금 ${blocks.length}곳)`);
  for (const block of blocks) {
    assert.match(block, /\btitle=/, `${path}: 빈 화면에 제목이 없다`);
    assert.match(block, /\bicon=\{/, `${path}: 빈 화면에 아이콘이 없다`);
    assert.doesNotMatch(block, /<(?:button|Link|a)\s/, `${path}: 빈 화면 동작이 공통 버튼(AppButton)이 아니다`);
    for (const [, variant] of block.matchAll(/<AppButton\s(?:[^<>]|\{[^{}]*\})*?\bvariant="(\w+)"/g)) {
      assert.ok(variant === "primary" || variant === "secondary", `${path}: 빈 화면 동작은 primary·secondary 만 — ${variant}`);
    }
    assert.doesNotMatch(block, /<AppButton\s[^>]*className=/, `${path}: 빈 화면 안 버튼에 자리 클래스를 붙였다 — 줄 맞춤은 EmptyState 가 한다`);
  }
}
/* 빈 화면은 제목과 단추만 — 단추가 있는 빈 화면에는 설명 줄을 두지 않는다(대표 결정 2026-11-26) */
for (const path of ["app/plan/PlanList.tsx", "app/plan/inquiries/page.tsx", "app/plan/document/DocumentWorkspace.tsx", "app/plan/BusinessEmptyState.tsx", "app/account/support/SupportCenter.tsx", "app/plan/me/page.tsx"]) {
  for (const tag of read(path).split("<EmptyState").slice(1)) {
    const head = tag.slice(0, tag.search(/\bactions=/) + 1 || 0);
    if (head) assert.doesNotMatch(head, /\bdescription=/, `${path}: 단추가 있는 빈 화면에 설명 줄이 있다`);
  }
}
for (const path of ["app/plan/PlanList.tsx", "app/plan/chat/page.tsx"]) assert.match(read(path), /<BusinessEmptyState\b/, `${path}: 내 사업·대화 빈 화면은 BusinessEmptyState`);
// 문구·링크는 그대로
const copies: [string, RegExp][] = [
  ["app/plan/inquiries/page.tsx", /published === 0 \? "아직 공개한 홈페이지가 없어요" : "아직 들어온 문의가 없어요"[\s\S]*홈페이지 만들기[\s\S]*#hk-leads`\}>알림 번호 설정[\s\S]*onClick=\{\(\) => refresh\(true\)\}><RefreshCw size=\{14\} aria-hidden \/> 새로 확인/],
  // 만들기 전 계획서 탭 — '아직 만들기 전이에요 · 만들기'(점검 2026-11-16: 쉽게 보기가 '다 만들어졌어요'로 보였다)
  ["app/plan/document/DocumentWorkspace.tsx", /title="아직 만들기 전이에요"\s[\s\S]*href=\{`\$\{coachHref\}&start=1`\}>사업계획서 만들기[\s\S]*href=\{back\}>\{pane \? "대화로 가기" : "사업안으로 돌아가기"\}/],
  ["app/plan/workspace/OperatingWorkspace.tsx", /title="아직 기간 기록이 없어요"[\s\S]*대화에서 말한 실적으로 첫 기록 만들기[\s\S]*기간 기록 추가[\s\S]*저장 전에 고칠 수 있어요<\/small>\}\s*<\/EmptyState>/],
  ["app/plan/workspace/OperatingWorkspace.tsx", /title="보관한 리포트가 없어요" description="기간 기록에서 다음 개선 행동을 정한 뒤 보관하세요"/],
  ["app/account/support/SupportCenter.tsx", /title="로그인 후 문의를 남겨 주세요" actions=\{<AppButton variant="primary" href=\{loginHref\}>/],
  ["app/account/support/SupportCenter.tsx", /title="아직 접수한 문의가 없어요\." actions=\{<AppButton variant="secondary" onClick=\{\(\) => setView\("write"\)\}>문의 남기기/],
  ["app/plan/me/page.tsx", /title="아직 시작한 사업이 없어요\." actions=\{<AppButton href="\/plan\/chat\?new=1" variant="secondary">새 대화로 시작하기/],
  ["app/plan/me/page.tsx", /title="아직 결제 내역이 없어요\."/],
];
for (const [path, pattern] of copies) assert.match(read(path), pattern, `${path}: 빈 화면 문구·동작이 예전과 다르다`);

// 2) 예전 빈 화면 클래스 — 자리(높이·너비·바깥 여백)만 남는다
const VISUAL = /(?:^|[\s;{])(?:padding(?:-[a-z]+)?|background(?:-color)?|color|font(?:-size|-weight)?|border(?:-[a-z]+)?|box-shadow|line-height|text-align|gap|display|justify-[a-z]+|align-[a-z]+|place-[a-z]+|text-wrap)\s*:/;
const placements: [string, string[]][] = [
  ["app/plan/inquiries/page.module.css", ["empty", "placeholder", "emptyActions", "emptyRefresh", "emptyLink"]],
  ["app/plan/document/DocumentWorkspace.module.css", ["empty", "emptyPrimary"]],
  ["app/plan/workspace/OperatingWorkspace.module.css", ["empty"]],
  ["app/account/support/support.module.css", ["empty"]],
  ["app/plan/me/PlanMe.module.css", ["empty", "emptyPlans", "emptyAction"]],
  ["app/plan/BusinessHub.module.css", ["emptyPlace"]],
];
for (const [path, classes] of placements) {
  const source = uncomment(read(path));
  for (const [, head, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const name = classes.find(cls => new RegExp(`\\.${cls}(?![\\w-])`).test(head));
    if (name) assert.doesNotMatch(body, VISUAL, `${path} .${name}: 빈 화면 모양(여백·색·글자·정렬)을 다시 정했다 — 자리만 정한다: ${head.trim()} {${body}}`);
  }
}
// 쓰는 곳이 없던 파일은 지웠다
for (const path of ["app/plan/PlanList.module.css", "app/plan/document/PlanDocument.module.css"]) {
  assert.ok(!existsSync(new URL(`../${path}`, import.meta.url)), `${path}: 가져오는 곳이 없는 스타일 파일이 다시 생겼다`);
}

// 3) 도는 표시 — 키프레임 하나
const SKIP = /(?:^|\/)(?:home-|brainwave-|bwmob-|legacy-|project-refinement-studio|beginner-mission-roadmap)|^app\/admin\//;
const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap(name => {
  const path = `${dir}/${name}`;
  return statSync(new URL(`../${path}`, import.meta.url)).isDirectory() ? walk(path) : [path];
});
const modules = [...walk("app"), ...walk("components")].filter(path => path.endsWith(".module.css") && !SKIP.test(path));
const spins = modules.flatMap(path => [...uncomment(read(path)).matchAll(/@keyframes\s+([\w-]+)\s*\{[^{}]*\{[^{}]*rotate\(\s*360deg\s*\)/g)].map(match => `${path}:${match[1]}`));
assert.deepEqual(spins, ["app/plan/PlanLoading.module.css:loadingSpin"], `도는 키프레임은 PlanLoading 의 loadingSpin 하나 — ${spins.join(", ")}`);
const loading = uncomment(read("app/plan/PlanLoading.module.css"));
assert.match(rule(loading, ".spin"), /animation:loadingSpin \.8s linear infinite;/, "공통 도는 표시는 .8s");
assert.match(rule(loading, ".spinner"), /composes: spin;/, "Spinner 도 같은 규칙으로 돈다");
const reduced = loading.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?\})\s*\}/);
assert.ok(reduced, "움직임 줄이기 설정을 따르지 않는다");
/*
 * 움직임 줄이기 — 도는 표시는 천천히(2.4s). 전역(globals.css *) · 화면 틀(.page * { animation:none !important })이 모든 움직임을 끄므로
 * !important + 한 단계 높인 선택자로 이겨야 한다(예전 animation-duration:2.4s 만으로는 져서 멈춘 그림이 됐다 — 움직임 조사 2026-11-17)
 */
assert.match(reduced[1], /\.spin\.spin, \.ring\.ring \{ animation:loadingSpin 2\.4s linear infinite !important; \}/, "움직임 줄이기 — 도는 표시는 천천히, 전역·틀 규칙보다 앞서게");
assert.match(reduced[1], /\.dots i \{ animation:none; \}/, "움직임 줄이기 — 튀는 점은 그대로 멈춘다");
// 틀 규칙이 .spin.spin(클래스 둘)보다 높아지면 위 예외가 다시 진다 — 움직임을 통째로 끄는 !important 규칙은 '클래스 하나 + *' 꼴만
for (const path of modules) {
  const source = uncomment(read(path));
  for (const [, head, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/animation\s*:\s*none\s*!important/.test(body)) continue;
    for (const part of head.split(",").map(item => item.trim()).filter(Boolean)) {
      if (/^\.[\w-]+ \*(?:::?(?:before|after))?$/.test(part)) continue;
      // 키프레임 이름이 회전이 아닌 특정 부품만 끄는 규칙(.x .y 등)은 도는 표시를 덮지 않으면 괜찮다
      assert.doesNotMatch(part, /\*/, `${path}: '${part}' — 움직임을 통째로 끄는 규칙이 .spin.spin 보다 높다(도는 표시 예외가 진다)`);
    }
  }
}
const borrowers: [string, string, string][] = [
  ["app/plan/chat/intake.module.css", ".spinner", "../PlanLoading.module.css"],
  ["app/plan/proposal/proposal.module.css", ".spin", "../PlanLoading.module.css"],
  ["app/plan/GenerationProgress.module.css", ".spin", "./PlanLoading.module.css"],
  ["app/plan/WorkNarration.module.css", ".spin", "./PlanLoading.module.css"],
  ["components/app-button.module.css", ".spinner", "../app/plan/PlanLoading.module.css"],
  ["app/plan/document/DocumentWorkspace.module.css", ".spin", "../PlanLoading.module.css"],
];
for (const [path, selector, from] of borrowers) {
  const body = rule(uncomment(read(path)), selector);
  assert.ok(body.includes(`composes: spin from "${from}";`), `${path} ${selector}: 공통 도는 규칙을 빌리지 않는다`);
  assert.doesNotMatch(body, /animation\s*:/, `${path} ${selector}: 도는 속도를 따로 정했다`);
}
for (const path of modules) {
  const source = uncomment(read(path));
  for (const [, name] of source.matchAll(/animation(?:-name)?\s*:\s*([\w-]*spin[\w-]*)/gi)) {
    assert.ok(path === "app/plan/PlanLoading.module.css" && name === "loadingSpin", `${path}: 따로 정한 도는 애니메이션 '${name}'`);
  }
}
// 계획서 '확인했어요' 저장 중 아이콘 — 예전엔 회전 클래스가 없어 멈춰 있었다(움직임 조사 2026-11-17)
assert.match(read("app/plan/document/DocumentSourceReview.tsx"), /\{busy \? <LoaderCircle size=\{15\} className=\{styles\.spin\} aria-hidden="true" \/> : <Check size=\{15\} \/>\}확인했어요/, "'확인했어요' 저장 중 아이콘이 돌지 않는다");

/*
 * 전역 .spin(lucide 아이콘에 className="spin") — 홈페이지 편집기 공개·고치기·사진 올리기·저장, 도메인 연결 확인, 관리자 로딩.
 * 예전엔 @keyframes spin 이 어디에도 없어 아이콘이 멈춰 있었다(움직임 조사 TOP1). 속도는 공통 도는 표시와 같은 0.8초.
 */
{
  const globals = uncomment(read("app/globals.css"));
  assert.equal([...globals.matchAll(/@keyframes spin \{ to \{ transform: rotate\(360deg\); \} \}/g)].length, 1, "전역 @keyframes spin 이 한 곳에 있어야 한다");
  assert.deepEqual([...globals.matchAll(/(?:^|\n)\.spin \{([^}]*)\}/g)].map(match => match[1].trim()), ["animation: spin .8s linear infinite;"], "전역 .spin 은 한 번만, 0.8초 한 바퀴");
  assert.match(globals, /\.admin-support-loading svg \{ width: 18px; animation: spin \.8s linear infinite; \}/, "관리자 로딩 아이콘도 같은 속도로");
  // 움직임 줄이기 — 전역 규칙(.01ms)과 같은 블록에서 작은 회전만 천천히 돌게 연다
  const reducedGlobal = globals.match(/@media \(prefers-reduced-motion: reduce\) \{\n  \*, \*:before, \*:after \{[^}]*\}\n([^@]*?)\n\}/);
  assert.ok(reducedGlobal, "전역 움직임 줄이기 블록");
  assert.match(reducedGlobal[1], /\.spin\.spin, \.admin-support-loading svg \{ animation: spin 2\.4s linear infinite !important; \}/, "움직임 줄이기에서도 작은 회전은 천천히 돈다");
  const spinUsers: [string, RegExp][] = [
    ["components/brainwave-editor.tsx", /<LoaderCircle className="spin" \/> 공개하는 중/],
    ["components/brainwave-editor.tsx", /<LoaderCircle className="spin" \/> 고치는 중/],
    ["components/brainwave-editor.tsx", /<LoaderCircle className="spin" aria-hidden \/> 사진 올리는 중/],
    ["components/brainwave-editor.tsx", /persistence\.saving \? <LoaderCircle className="spin" \/> : <Save \/>/],
    ["components/landing-visual-builder.tsx", /persistence\.saving \? <LoaderCircle className="spin" \/> : <Save \/>/],
    ["components/landing-domain-connector.tsx", /<em><LoaderCircle className="spin" \/> 연결 확인 중<\/em>/],
    ["components/landing-domain-connector.tsx", /<RefreshCw className=\{action === "loading" \? "spin" : ""\} \/> 연결 확인/],
  ];
  for (const [path, pattern] of spinUsers) assert.match(read(path), pattern, `${path}: 진행 중 아이콘에 회전 클래스가 없다`);
}
// 생성 진행 카드의 도는 표시 — 2026-11-17부터 '지금 하는 일' 목록(WorkNarration)의 지금 줄이 공통 도는 규칙으로 돈다
assert.match(read("app/plan/GenerationProgress.tsx"), /사업계획서 만드는 중<span className=\{styles\.cardCount\}>[\s\S]*?<WorkNarration narration=\{narration\}/, "생성 진행 카드의 도는 표시");
assert.match(read("app/plan/WorkNarration.tsx"), /<LoaderCircle size=\{15\} className=\{styles\.spin\} \/>/, "지금 하는 일 줄의 도는 표시");
// '불러오는 중' 글만 있던 자리 — PlanLoading 의 Spinner 를 함께 둔다
const loadingTexts: [string, RegExp][] = [
  ["app/plan/document/FactEdit.tsx", /<p role="status"><Spinner \/> 사업 정보를 불러오고 있어요…<\/p>/],
  ["components/support-chat-home.tsx", /role="status"><Spinner \/> 불러오고 있어요…<\/p>/],
  ["components/landing-image-crop.tsx", /<><Spinner \/> 이미지를 불러오는 중<\/>/],
];
for (const [path, pattern] of loadingTexts) {
  const source = read(path);
  assert.match(source, /import \{ Spinner \} from "(?:\.\.\/)+(?:app\/plan\/)?PlanLoading";/, `${path}: PlanLoading 의 Spinner 를 가져오지 않는다`);
  assert.match(source, pattern, `${path}: '불러오는 중' 안내에 도는 표시가 없다`);
}

// 4) 바꾼 파일 — 주석 밖 hex 색이 없다
const changed = [
  "app/plan/BusinessEmptyState.module.css", "app/plan/BusinessHub.module.css", "app/plan/inquiries/page.module.css", "app/plan/document/DocumentWorkspace.module.css",
  "app/plan/workspace/OperatingWorkspace.module.css", "app/account/support/support.module.css", "app/plan/me/PlanMe.module.css", "app/plan/PlanLoading.module.css",
  "app/plan/chat/intake.module.css", "app/plan/proposal/proposal.module.css", "app/plan/GenerationProgress.module.css", "components/app-button.module.css",
];
for (const path of changed) {
  const hex = uncomment(read(path)).match(/#[0-9a-f]{3,8}\b/i);
  assert.equal(hex, null, `${path}: hex 색 '${hex?.[0]}' 이 남았다 — --app-* 토큰으로`);
}

console.log("empty state: ok");
