import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";

/*
 * 움직임 지킴이 — 2026-11-17 사이트 전체 움직임 조사(작은 묶음)에서 고친 것이 다시 생기지 않게.
 * 1) 가운데 맞춤(translateX(-50%))을 쓰는 요소의 등장 움직임은 transform 을 바꿔도 -50% 를 지킨다 — 계획서 토스트가 0.18초 동안
 *    오른쪽으로 반 폭 밀려 있다가 가운데로 튀었다. 아래쪽 알림(토스트)은 아래에서 올라온다.
 * 2) hover 때 움직이는(transform · 그림자 들림) 규칙은 마우스 기기에서만 — 터치(태블릿·휴대폰)에서는 누른 뒤에도 hover 가 남아
 *    왼쪽 메뉴 '내 사업' 줄이 밀린 채, 상담 단추·카드가 들린 채 있었다. 색만 바뀌는 hover 는 그대로 둔다.
 * 도는 표시(@keyframes spin · 움직임 줄이기 예외)는 empty-state.test.ts 가 지킨다.
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const uncomment = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap(name => {
  const path = `${dir}/${name}`;
  return statSync(new URL(`../${path}`, import.meta.url)).isDirectory() ? walk(path) : [path];
});

type Rule = { selector: string; body: string; at: string[] };
/** CSS 규칙을 감싼 @media·@supports 와 함께 꺼낸다(중첩 블록도 따라간다) */
function cssRules(css: string): Rule[] {
  const src = uncomment(css);
  const rules: Rule[] = [];
  const stack: string[] = [];
  let start = 0;
  for (let index = 0; index < src.length; index++) {
    const char = src[index];
    if (char === "{") {
      const raw = src.slice(start, index);
      const prelude = raw.slice(raw.lastIndexOf(";") + 1).trim();
      const nextOpen = src.indexOf("{", index + 1), nextClose = src.indexOf("}", index + 1);
      if (nextOpen !== -1 && nextOpen < nextClose) { stack.push(prelude); start = index + 1; continue; }
      rules.push({ selector: prelude, body: src.slice(index + 1, nextClose), at: [...stack] });
      index = nextClose; start = index + 1;
    } else if (char === "}") { stack.pop(); start = index + 1; }
  }
  return rules;
}
const HOVER_DEVICE = (at: string[]) => at.some(prelude => /\(\s*hover\s*:\s*hover\s*\)/.test(prelude) && /\(\s*pointer\s*:\s*fine\s*\)/.test(prelude));
const MOVES = /(?:^|;)\s*(?:transform|translate|scale)\s*:(?!\s*none\b)/;

// 파서 자체 — @media 안의 규칙은 감싼 조건과 함께 나온다
{
  const parsed = cssRules(".a:hover { transform: none; }\n@media (hover: hover) and (pointer: fine) { .b:hover { transform: translateY(-2px); } }\n@keyframes k { from { opacity: 0; } }");
  assert.deepEqual(parsed.map(rule => [rule.selector, rule.at.length]), [[".a:hover", 0], [".b:hover", 1], ["from", 1]]);
  assert.ok(HOVER_DEVICE(parsed[1].at) && !HOVER_DEVICE(parsed[0].at));
  assert.ok(!MOVES.test(parsed[0].body) && MOVES.test(parsed[1].body), "transform: none 은 움직임이 아니다");
}

/* 1) 가운데 맞춤 + 등장 움직임 — 키프레임의 transform 마다 -50% 가 남아야 한다(모든 모듈 CSS) */
{
  const modules = [...walk("app"), ...walk("components")].filter(path => path.endsWith(".module.css") && !path.startsWith("app/dev/"));
  const broken: string[] = [];
  for (const path of modules) {
    const source = uncomment(read(path));
    const keyframes = new Map([...source.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map(match => [match[1], match[2]]));
    for (const rule of cssRules(source)) {
      if (!/transform\s*:\s*translate(?:X)?\(\s*-50%/.test(rule.body)) continue;
      const name = rule.body.match(/animation\s*:\s*([\w-]+)/)?.[1];
      const frames = name ? keyframes.get(name) : undefined;
      if (!frames) continue;
      const lost = [...frames.matchAll(/transform\s*:\s*([^;}]+)/g)].map(match => match[1].trim()).filter(value => !value.includes("-50%"));
      if (lost.length) broken.push(`${path} ${rule.selector} → ${name}: ${lost.join(" / ")}`);
    }
  }
  assert.deepEqual(broken, [], `가운데 맞춤이 등장 움직임 동안 풀린다(옆으로 반 폭 튐): ${broken.join("; ")}`);

  // 계획서 토스트 — 가운데 그대로, 아래에서 살짝 올라온다(아래쪽 알림인데 위에서 내려오던 것)
  const document = uncomment(read("app/plan/document/DocumentWorkspace.module.css"));
  const toast = cssRules(document).find(rule => rule.selector === ".toast" && !rule.at.length);
  assert.ok(toast, "계획서 토스트 규칙");
  assert.match(toast.body, /transform:translateX\(-50%\)/);
  assert.match(toast.body, /bottom:calc\(/, "토스트는 아래쪽 알림");
  assert.match(toast.body, /animation:toastRise \.18s ease-out;/);
  assert.match(document, /@keyframes toastRise \{ from \{ opacity:0; transform:translate\(-50%, 8px\); \} to \{ opacity:1; transform:translate\(-50%, 0\); \} \}/, "아래에서 8px 올라오며 가운데 그대로");
  assert.match(document, /@media \(prefers-reduced-motion: reduce\) \{ \.toast \{ animation:none; \} \}/, "움직임 줄이기면 그냥 나타난다");
}

/* 2) hover 이동은 마우스 기기에서만 — 조사에서 짚은 곳(왼쪽 메뉴 '내 사업' 줄 · 상담 단추 · 손님 홈페이지 카드)과 같은 꼴로 묶은 곳 */
{
  const files = [
    "app/plan/PlanShell.module.css",
    "components/next-services.module.css",
    "components/home-prompt-sections.module.css",
    "app/plan/workspace/OperationsHub.module.css",
    ...walk("components").filter(path => /\/brainwave-business-[\w-]+\.module\.css$/.test(path)),
  ];
  const loose: string[] = [];
  for (const path of files) {
    for (const rule of cssRules(read(path))) {
      if (rule.selector.includes(":hover") && MOVES.test(rule.body) && !HOVER_DEVICE(rule.at)) loose.push(`${path} ${rule.selector}`);
    }
  }
  // 전역 CSS 는 짚은 선택자만(옛 화면 규칙은 이번 범위가 아니다)
  const globalTargets = [".support-chat-toggle:hover", ".landing-block-gallery figure:hover img", ".landing-video-play:hover b"];
  const globals = cssRules(read("app/globals.css"));
  for (const rule of globals) {
    if (globalTargets.some(target => rule.selector.includes(target)) && MOVES.test(rule.body) && !HOVER_DEVICE(rule.at)) loose.push(`app/globals.css ${rule.selector}`);
  }
  assert.deepEqual(loose, [], `hover 이동이 터치 기기에도 걸린다(누른 뒤 밀리거나 들린 채 남음): ${loose.join("; ")}`);

  // 짚은 곳이 실제로 마우스 기기 조건 안에 있다(규칙을 지워서 통과하는 일이 없게)
  const shell = cssRules(read("app/plan/PlanShell.module.css"));
  const railHover = shell.find(rule => rule.selector === ".railBtn:hover" && MOVES.test(rule.body));
  assert.ok(railHover && HOVER_DEVICE(railHover.at) && /translateX\(2px\)/.test(railHover.body), "왼쪽 메뉴 '내 사업' 줄 hover 밀림은 마우스 기기에서만");
  assert.ok(shell.some(rule => rule.selector === ".railBtn:hover svg" && HOVER_DEVICE(rule.at)), "'내 사업' 줄 아이콘 키움도 마우스 기기에서만");
  // 움직임 줄이기는 그대로 hover 이동을 끈다(마우스 기기 조건 뒤에 와서 이긴다)
  const shellSource = uncomment(read("app/plan/PlanShell.module.css"));
  assert.ok(shellSource.indexOf(".railBtn:hover, .railBtn:active, .railBtn:hover svg, .railToggle:active, .menuFab:active { transform: none; }") > shellSource.indexOf("@media (hover: hover) and (pointer: fine) {\n  .railBtn:hover"), "움직임 줄이기 규칙이 hover 규칙보다 뒤에 있어야 이긴다");
  const supportHover = globals.find(rule => rule.selector === ".support-chat-toggle:hover" && MOVES.test(rule.body));
  assert.ok(supportHover && HOVER_DEVICE(supportHover.at) && /translateY\(-2px\)/.test(supportHover.body), "상담 단추 들림은 마우스 기기에서만");
  const cardRules = walk("components").filter(path => /\/brainwave-business-[\w-]+\.module\.css$/.test(path)).flatMap(path => cssRules(read(path)).filter(rule => rule.selector.includes(":hover") && /translateY\(-\d+px\)/.test(rule.body)).map(rule => ({ path, rule })));
  assert.ok(cardRules.length >= 5, `손님 홈페이지 카드 들림 규칙(동네 가게 · 상담 · 병원 · 쇼핑 · 동네 가게2) (${cardRules.length}개)`);
  assert.ok(cardRules.every(({ rule }) => HOVER_DEVICE(rule.at)), "손님 홈페이지 카드 들림은 마우스 기기에서만");
}

console.log("motion guards: ok");
