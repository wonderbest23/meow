import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 대표 결정 r39 — 화면 문구·단추 자리가 다시 흩어지지 않게 소스로 지킨다.
 * 1) 홈페이지만 결제할 때 결제 문구는 어디서나 '결제하고 공개하기 · 금액'
 * 2) 머리줄 '공개됨'은 메뉴(주소 복사 · 새 창으로 보기 · 공개 멈추기)를 연다 — 공개 멈추기는 기존 확인창을 쓴다
 * 3) 직접 고치기의 '계획서에 반영하기'는 위쪽 줄 하나뿐(노란 카드에는 없음), 휴대폰은 위에 붙은 줄에
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const homepage = read("app/plan/homepage/HomepageScreen.tsx");
assert.doesNotMatch(homepage, /결제하고 고치기|홈페이지 고치고 공개하기/, "예전 결제 문구가 남아 있다");
const payLabels = homepage.match(/결제하고 공개하기 · \$\{price\.toLocaleString\("ko-KR"\)\}원/g) ?? [];
assert.ok(payLabels.length >= 3, `휴대폰 결제 카드 · PC 맨 위 줄 · 공개 확인창이 같은 문구여야 한다 (지금 ${payLabels.length}곳)`);
assert.match(homepage, /useState\(HOMEPAGE_PRODUCT_AMOUNT\)/, "금액은 기존 상수에서 시작한다");

const menu = read("app/plan/homepage/PublishedMenu.tsx");
for (const label of ["주소 복사", "새 창으로 보기", "공개 멈추기"]) assert.match(menu, new RegExp(`role="menuitem"[^>]*>.*${label}`), `메뉴에 '${label}'이 없다`);
assert.match(menu, /aria-haspopup="menu"/);
assert.match(menu, /event\.key === "Escape"/, "Esc 로 닫혀야 한다");
assert.match(menu, /document\.addEventListener\("pointerdown"/, "바깥을 누르면 닫혀야 한다");
assert.match(menu, /button\.current\?\.focus\(\)/, "닫으면 초점이 단추로 돌아와야 한다");
assert.match(menu, /plan-ui/, "body 에 띄운 메뉴는 전역 버튼 정규화(아이콘 숨김)에서 빠져야 한다");
assert.match(homepage, /onUnpublish=\{\(\) => void unpublishRef\.current\(\)\}/, "공개 멈추기는 기존 unpublish(확인창 포함)를 불러야 한다");
assert.match(homepage, /title: "공개를 멈출까요\?"/, "공개 멈추기 확인창이 그대로 있어야 한다");
const menuUses = homepage.match(/publishedMenu\(/g) ?? [];
assert.ok(menuUses.length >= 3, "작업실 PC·좁은 화면·예전 머리줄 모두 '공개됨' 메뉴를 써야 한다");

const factEdit = read("app/plan/document/FactEdit.tsx");
const factCard = factEdit.slice(factEdit.indexOf("export function FactCard"), factEdit.indexOf("export function FactPopover"));
assert.ok(factCard.length > 0);
assert.doesNotMatch(factCard, /계획서에 반영하기|RewriteConfirm/, "노란 카드에 '계획서에 반영하기'가 다시 생겼다");
const workspace = read("app/plan/document/DocumentWorkspace.tsx");
assert.match(workspace, /<FactCard edit=\{facts\} onPick=\{[^}]*\}[^>]*\/>/);
assert.match(workspace, /className=\{styles\.readingBar\} data-fact-mode=\{factMode \|\| undefined\}/, "휴대폰 위쪽 줄이 고치는 중을 알아야 한다");
const css = read("app/plan/document/DocumentWorkspace.module.css");
assert.match(css, /\.readingBar\[data-fact-mode\] \.toolbarActions \{ display:flex;/, "휴대폰에서도 위쪽 줄에 반영 단추가 보여야 한다");
assert.match(css, /\.actions\[data-fact-mode\] \{ display:none; \}/, "휴대폰 아래 단추 줄과 두 벌이 되면 안 된다");

console.log("owner decisions r39: ok");
