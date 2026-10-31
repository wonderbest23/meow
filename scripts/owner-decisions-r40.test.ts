import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANDING_THEMES } from "../lib/landing/themes";

/*
 * 대표 결정 r40 — 정한 것이 다시 흩어지지 않게 소스로 지킨다.
 * 1) '산뜻한' accent 는 흰 글씨 대비 4.5:1 이상
 * 2) PC 홈페이지 탭(홈페이지만 결제 전) 칸 위 줄에 '결제하고 공개하기 · 금액' 단추가 없다 — 머리줄 [공개하기] 하나
 * 3) 태블릿(761~900px)은 장 머리 '대화로 고치기'를 숨긴다(도구 줄 단추가 있을 때)
 * 4) 예시 사업 PC 칸 위 줄은 '사업계획서'
 * 5) 처음 열 때 이 기기에 없는 사업이면 서버에 지운 사업인지 바로 묻는다
 * 6) 동네 가게 기본 제목은 '오시는 길과 영업시간'(예전 문구도 자동 문구로 알아본다)
 * 7) 첫 화면 768~1023px 은 고객센터 단추를 본문 바깥 여백으로
 * r40-2) PC 칸 위 줄은 결제 전(계획서도 결제 전 · 예시 사업 포함)에 단추가 하나도 없다 — 머리줄 [공개하기] 하나
 * r40-2) 첫 화면 1024~1439px 도 고객센터 단추를 본문 바깥 여백으로(1440 이상은 원래 안 겹침)
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const fresh = LANDING_THEMES.find(theme => theme.id === "fresh");
assert.ok(fresh);
assert.ok(1.05 / (luminance(fresh.tokens.accent) + 0.05) >= 4.5, `'산뜻한' accent ${fresh.tokens.accent} 흰 글씨 대비가 4.5:1 미만`);

const homepage = read("app/plan/homepage/HomepageScreen.tsx");
const strip = homepage.slice(homepage.indexOf("const strip = studioPro"), homepage.indexOf("</div> : null;", homepage.indexOf("const strip = studioPro")));
assert.ok(strip.length > 0);
assert.doesNotMatch(strip, /`결제하고 공개하기 · \$\{price/, "PC 칸 위 줄에 '결제하고 공개하기' 단추가 다시 생겼다");
assert.doesNotMatch(strip, /함께 결제하기|내 사업으로 만들기|openPayPrompt/, "PC 칸 위 줄에 결제 안내 단추('함께 결제하기'·'내 사업으로 만들기')가 다시 생겼다(r40-2)");
assert.match(strip, /\{editable && !floatTools && <>/, "PC 칸 위 줄 단추는 결제 뒤(고칠 수 있을 때)만");
// lovable 구조 2단계 — 같은 단추가 아래 떠 있는 도구 알약으로 옮겨 가도 결제 뒤(고칠 수 있을 때)만
assert.match(homepage, /\{editable && <button type="button" className=\{styles\.floatTool\} disabled=\{busy\} onClick=\{\(\) => setBuilderOpen\(true\)\}/);
assert.match(homepage, /\{editable && !inApp && <button type="button" className=\{styles\.floatTool\}/);
assert.match(homepage, /<span>공개하기<\/span><\/AppButton>/, "PC 머리줄 [공개하기]는 남아 있어야 한다");
assert.match(homepage, /confirmLabel: "내 사업으로 만들기"/, "예시 사업은 머리줄 [공개하기] 확인창에서 '내 사업으로 만들기'");

const css = read("app/plan/document/DocumentWorkspace.module.css");
assert.match(css, /@media \(min-width:761px\) and \(max-width:900px\) \{ \.page:has\(\.chapterChatEdit\) \.chapterChatAction \{ display:none; \} \}/);
const workspace = read("app/plan/document/DocumentWorkspace.tsx");
assert.match(workspace, /styles\.chapterChatAction/);
assert.doesNotMatch(workspace, /예시 사업계획서/, "예시 PC 칸 위 줄은 '사업계획서'");

const guard = read("app/plan/DeletedBusinessGuard.tsx");
assert.match(guard, /lastServerCheck = knownHere \? Date\.now\(\) : 0/, "이 기기에 없는 사업이면 처음부터 서버에 묻는다");

const content = read("lib/landing/brainwave/business-content.ts");
assert.match(content, /visitTitle: "오시는 길과 영업시간"/);
assert.match(content, /"오시는 길과 영업시간", "오시는 길·영업시간"/, "예전 기본 제목도 자동 문구로 알아봐야 한다");

const home = read("components/home-landing.module.css");
assert.match(home, /@media \(min-width: 768px\) and \(max-width: 1023px\) \{\n  \.content \{ padding: 0 84px; \}/);
assert.match(home, /support-chat-widget:not\(\.open\)\) \{ right: 12px;/);
assert.match(home, /@media \(min-width: 1024px\) and \(max-width: 1439px\) \{\n  \.content \{ padding: 0 clamp\(20px, calc\(84px - \(100% - 1220px\) \/ 2\), 84px\); \}\n  :global\(body\):has\(\.page\) :global\(\.support-chat-widget:not\(\.open\)\) \{ right: 12px; bottom: 24px; \}/, "1024~1439px 도 단추를 바깥 여백으로(r40-2)");
assert.match(home, /@media \(min-width: 1024px\) and \(max-width: 1439px\) \{\n  \.page :global\(\.home-footer\) \{ padding-inline: 84px; \}/);

console.log("owner decisions r40: ok");
