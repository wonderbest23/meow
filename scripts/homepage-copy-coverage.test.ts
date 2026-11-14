import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { applyHomepageCopy, carryCopyToDesign, carryEditedTexts, copyFromNodes, homepageCopyOf, homepageCta, normalizeHomepageCopy, switchHomepageDesign, WALK_IN_PAGES } from "../lib/landing/ai-fill";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { landingDraftSchema, type LandingDraft } from "../lib/landing/domain";
import { BUSINESS_DESIGNED_PAGES, businessTemplateManifest, createBusinessTemplate, restorableSections } from "../lib/landing/brainwave/business-content";
import { BRAINWAVE_DEFAULT_FOR_TEMPLATE } from "../lib/landing/brainwave/catalog";
import { COACH_KEY, COACH_VERSION, type CoachState } from "../lib/plan-builder/coach";

/*
 * AI 글이 디자인마다 몇 칸이나 들어가는지 — 실제 AI 점검(2026-11-14 반찬가게)에서 동네 가게(0-2226)는 카드 다섯 중 셋만 보이고
 * 자주 묻는 질문은 아예 안 보였다. 그래서 다 보여 주는 '동네 가게 2'(1-2226)를 더했다.
 * 여기서는 같은 글(카드 5·질문 3·메뉴 4·단계 3·숫자 2)을 여섯 디자인에 넣어 들어간 칸 수를 못박는다 — 기존 디자인의 수는 지금 그대로다.
 */
const NEW = "1-2226";
const coach: CoachState = {
  version: COACH_VERSION, revision: 2, stage: "startup", depth: "quick", ready: true, messages: [], suggestions: [],
  business: { name: "퇴근길 반찬가게", description: "퇴근길 직장인에게 반찬 묶음을 파는 가게", role: "", industry: "반찬가게", region: "", stage: "사업 기획" },
  fields: [
    { key: "offer", value: "저녁 반찬 묶음", basis: "user", quote: "저녁 반찬 묶음", messageId: "a" },
    { key: "price", value: "15000원", basis: "user", quote: "15000원", messageId: "a" },
  ],
};
const answers = { [COACH_KEY]: { state: coach } } as Record<string, Record<string, unknown>>;
const copy = normalizeHomepageCopy({
  tagline: "퇴근길에 들러 오늘 저녁 반찬 한 번에", cardsTitle: "오늘 저녁, 묶음 하나면 돼요", cardsIntro: "집밥 반찬을 한 묶음에 담아 저녁 시간에 팔아요.",
  cards: [1, 2, 3, 4, 5].map(n => ({ title: `좋은 점 ${n}`, body: `좋은 점 ${n} 설명이에요.` })),
  process: { title: "이렇게 이용해요", steps: ["① 들르기 — 퇴근길에 매장에 들러요", "② 고르기 — 오늘의 묶음을 골라요", "③ 들고 가기 — 계산하고 바로 가요"] },
  closing: "오늘 저녁은 묶음 하나로", closingSub: "퇴근길에 들러 주세요.", cta: "묶음 문의하기",
  facts: [{ value: "3~4가지", label: "한 묶음에 담긴 반찬" }, { value: "2종", label: "고를 수 있는 묶음" }],
  menu: { title: "저녁 묶음", intro: "두 가지 묶음이 있어요.", items: [] },
  faq: [1, 2, 3].map(n => ({ question: `질문 ${n}?`, answer: `답 ${n}이에요.` })),
})!;
/*
 * 메뉴 넷 — AI 답을 다듬는 단계(normalizeHomepageCopy)는 지금도 셋까지만 받는다(프롬프트가 0~3개라서, landing-ai-fill.test 가 못박아 둔 규칙).
 * 넷째부터는 사장님이 줄 메뉴에 직접 적은 것과 같은 모양으로 넣어, 칸·옮겨 담기가 여섯까지 버티는지 본다.
 */
copy.menu.items = [1, 2, 3, 4].map(n => ({ name: `묶음 ${n}`, price: `${n}0,000원` }));
assert.equal(normalizeHomepageCopy({ ...copy })!.menu.items.length, 3, "the AI path still takes three menu items");

const created = landingDraftFromPlan({ planTitle: "퇴근길 반찬가게", business: {}, answers });
// 새 사업이 처음 받는 디자인은 그대로다 — 새 디자인은 사장님이 골라야 쓴다
assert.equal(created.pageData!.brainwave!.page, "0-2226", "new local shops still start on 0-2226");
assert.ok(!Object.values(BRAINWAVE_DEFAULT_FOR_TEMPLATE).includes(NEW));
const draftOn = (page: string): LandingDraft => {
  const draft = structuredClone(created);
  draft.pageData!.brainwave = createBusinessTemplate(draft.pageData!.businessContent!, page);
  return draft;
};
const fill = (page: string) => applyHomepageCopy(draftOn(page), copy, { industry: "반찬가게", now: "2026-11-14T00:00:00.000Z" });

/* 들어간 칸 수: [카드, 질문, 메뉴] — 기존 다섯은 이 변경 전과 같은 수(바꾸지 않는다), 새 디자인은 전부 */
const LANDED: Record<string, [number, number, number]> = {
  "0-1102": [5, 0, 0], "0-290": [4, 0, 0], "0-2226": [3, 0, 3], "0-2385": [3, 3, 0], "0-421": [5, 0, 2], [NEW]: [5, 3, 4],
};
for (const [page, expected] of Object.entries(LANDED)) {
  assert.ok(BUSINESS_DESIGNED_PAGES.has(page), `${page} is a designed page`);
  const applied = fill(page);
  landingDraftSchema.parse(applied);
  const read = copyFromNodes(page, applied.pageData!.brainwave!.texts)!;
  assert.deepEqual([read.cards.length, read.faq.length, read.menu.items.length], expected, `${page}: cards/faq/menu landed`);
  // 못 들어간 글도 copy 에는 남아 칸이 많은 디자인으로 바꾸면 다시 나온다
  assert.equal((applied.pageData!.aiFill!.copy as typeof copy).menu.items.length, 4, `${page}: full copy kept`);
}

// 새 디자인: 넣은 글을 그대로 다시 읽는다(버튼 글만 연락 방법 규칙이 정한다 — 전화·주소가 없으면 AI 글 그대로)
const applied = fill(NEW);
const bw = applied.pageData!.brainwave!;
assert.deepEqual(copyFromNodes(NEW, bw.texts), copy, "lossless round trip");
assert.deepEqual(homepageCopyOf(applied.pageData), copy);
for (const id of ["1:20", "1:30", "1:50", "1:70", "1:80", "1:90", "1:110", "1:120"]) assert.ok(!bw.hidden.includes(id), `${id} open after fill`);
assert.ok(bw.hidden.includes("1:100"), "reviews stay closed — never generated");
assert.ok(restorableSections(NEW).includes("1:100"), "the owner can turn reviews on");
assert.equal(bw.texts["1:91"], "자주 묻는 질문");
assert.equal(bw.texts["1:71"], "사진");
assert.deepEqual([bw.texts["1:102"], bw.texts["1:103"], bw.texts["1:104"], bw.texts["1:105"]], ["", "", "", ""], "no review text is ever written");
// 사진: 업종 사진 한 벌이 첫 화면·메뉴 카드 셋·사진 모음 앞 두 장에 서로 다른 사진으로
const photoIds = ["1:16", "1:65", "1:66", "1:67", "1:72", "1:73"];
assert.equal(new Set(photoIds.map(id => bw.images[id])).size, 6, "six distinct sector photos");
assert.ok(photoIds.every(id => bw.images[id].includes("images.unsplash.com") && !bw.hidden.includes(id)));
// 숫자가 하나뿐이어도, 메뉴가 없어도 잃지 않는다
const sparse = { ...copy, facts: copy.facts.slice(0, 1), menu: { title: "", intro: "", items: [] }, faq: [] };
const sparseBw = applyHomepageCopy(draftOn(NEW), sparse, { now: "2026-11-14T00:00:00.000Z" }).pageData!.brainwave!;
assert.deepEqual(copyFromNodes(NEW, sparseBw.texts), sparse);
assert.ok(!sparseBw.hidden.includes("1:20") && sparseBw.hidden.includes("1:50") && sparseBw.hidden.includes("1:90"), "only filled sections open");
// 다시 채우면 지난번 글이 남지 않는다(카드 5 → 3)
const refilled = applyHomepageCopy(applied, { ...copy, cards: copy.cards.slice(0, 3) }, { now: "2026-11-14T01:00:00.000Z" }).pageData!.brainwave!;
assert.equal(copyFromNodes(NEW, refilled.texts)!.cards.length, 3);

// 찾아오는 가게 규칙은 동네 가게와 같다: 전화가 있으면 '전화하기', 주소만 있으면 첫 화면 버튼이 '오시는 길'
assert.ok(WALK_IN_PAGES.has(NEW));
const contactOf = (extra: Partial<LandingDraft>) => ({ businessPhone: "", businessContact: "", businessAddress: "", contact: undefined, ...extra });
assert.deepEqual(homepageCta("묶음 문의하기", NEW, contactOf({ businessPhone: "02-123-4567" })), homepageCta("묶음 문의하기", "0-2226", contactOf({ businessPhone: "02-123-4567" })));
const visited = applyHomepageCopy({ ...draftOn(NEW), businessAddress: "서울 마포구 성미산로 12", openHours: "평일 16:00–20:00" }, copy, { now: "2026-11-14T00:00:00.000Z" }).pageData!.brainwave!;
assert.equal(visited.texts["1:112"], "서울 마포구 성미산로 12");
assert.equal(visited.texts["1:114"], "평일 16:00–20:00");
assert.equal(visited.texts["I1:14;1:15"], "오시는 길");
assert.match(visited.links["1:14"], /^https:\/\/map\.naver\.com\//);
assert.equal(visited.texts["I1:123;1:124"], "묶음 문의하기");
const called = applyHomepageCopy({ ...draftOn(NEW), businessPhone: "02-123-4567" }, copy, { now: "2026-11-14T00:00:00.000Z" }).pageData!.brainwave!;
assert.equal(called.texts["I1:14;1:15"], "전화하기");
assert.equal(called.texts["1:115"], "02-123-4567", "phone shows in the visit section");
assert.equal(called.links["1:14"], "tel:021234567");

// 디자인 바꾸기: 동네 가게 → 동네 가게 2 로 가면 못 보이던 카드·질문·메뉴가 다 나오고, 돌아오면 원래대로
const build = (page: string) => (draft: LandingDraft) => createBusinessTemplate(draft.pageData!.businessContent!, page);
const local = fill("0-2226");
const toNew = switchHomepageDesign(local, NEW, build(NEW));
landingDraftSchema.parse(toNew);
assert.deepEqual(copyFromNodes(NEW, toNew.pageData!.brainwave!.texts), copy, "0-2226 → new shows everything");
const backTexts = switchHomepageDesign(toNew, "0-2226", build("0-2226")).pageData!.brainwave!.texts;
assert.deepEqual(backTexts, local.pageData!.brainwave!.texts, "new → 0-2226 is the same page as before");
// 단계를 제목·설명 칸으로 나누는 디자인(상담·병원·갤러리형)을 거치면 단계 앞 번호(①)만 떨어진다 — 번호는 화면이 다시 단다
const unnumbered = (value: typeof copy | null) => value && { ...value, process: { ...value.process, steps: value.process.steps.map(step => step.replace(/^[\u2460-\u2473]\s*/, "")) } };
for (const page of ["0-1102", "0-290", "0-2385", "0-421"]) {
  const away = switchHomepageDesign(applied, page, build(page));
  assert.deepEqual(unnumbered(copyFromNodes(NEW, switchHomepageDesign(away, NEW, build(NEW)).pageData!.brainwave!.texts)), unnumbered(copy), `new → ${page} → new keeps every text`);
}
// 편집기 안에서 바꿀 때도
assert.deepEqual(copyFromNodes(NEW, carryCopyToDesign(local.pageData!, local.pageData!.brainwave!, build(NEW)(local)).texts), copy);
// 직접 고친 글(큰 제목·오시는 길 제목)은 같은 역할 자리로
const edited = { ...local.pageData!.brainwave!.texts, "0:2376/0": "직접 쓴 큰 제목", "0:2281": "여기로 오세요" };
const carried = carryEditedTexts("0-2226", edited, local.pageData!.businessContent!, local.pageData!.aiFill!.texts, NEW, build(NEW)(local).texts);
assert.equal(carried.texts["1:12"], "직접 쓴 큰 제목");
assert.equal(carried.texts["1:111"], "여기로 오세요");
assert.equal(carried.lost, 0);
const carriedBack = carryEditedTexts(NEW, { ...bw.texts, "1:12": "새 디자인에서 고친 제목" }, applied.pageData!.businessContent!, applied.pageData!.aiFill!.texts, "0-2226", build("0-2226")(applied).texts);
assert.equal(carriedBack.texts["0:2376/0"], "새 디자인에서 고친 제목");

// 기존 디자인은 그대로다 — 동네 가게(0-2226)의 기본 글과 채운 글 몇 칸을 못박아 둔다
const base = createBusinessTemplate(created.pageData!.businessContent!, "0-2226");
assert.equal(Object.keys(base.texts).length, 74);
assert.deepEqual(
  [base.texts["0:2383"], base.texts["0:2376/0"], base.texts["0:2285"], base.texts["0:2286"], base.texts["0:2301"], base.texts["0:2302"], base.texts["0:2281"], base.texts["0:2282"], base.texts["0:2269"], base.texts["0:2268"], base.texts["0:2237"], base.texts["I0:2372;0:4557"]],
  ["퇴근길 반찬가게", "퇴근길 반찬가게", "제공 내용", "저녁 반찬 묶음", "가격 안내", "15,000원", "오시는 길과 영업시간", "주소는 문의 주시면 안내해 드려요", "영업시간", "영업시간은 문의 주시면 안내해 드려요", "문의해 보세요", "문의하기"],
);
for (const id of ["0:2347", "0:2322", "0:2309"]) assert.ok(base.hidden.includes(id));
const lt = local.pageData!.brainwave!.texts;
assert.deepEqual(
  [lt["0:2285"], lt["0:2286"], lt["0:2294"], lt["0:2301"], lt["0:2349"], lt["0:2350"], lt["0:2345"], lt["0:2346"], lt["0:2324"], lt["0:2325"], lt["0:2338"], lt["0:2339"], lt["0:2312/0"], lt["0:2313"], lt["0:2237"], lt["0:2235"], lt["I0:2372;0:4557"], lt["I0:2233;0:4557"]],
  ["좋은 점 1", "좋은 점 1 설명이에요.", "좋은 점 2", "좋은 점 3", "3~4가지", "한 묶음에 담긴 반찬", "저녁 묶음", "두 가지 묶음이 있어요.", "묶음 1", "10,000원", "묶음 3", "30,000원", "이렇게 이용해요", copy.process.steps.join("\n"), "오늘 저녁은 묶음 하나로", "퇴근길에 들러 주세요.", "묶음 문의하기", "묶음 문의하기"],
);
assert.ok(!Object.values(lt).includes("묶음 4") && !Object.values(lt).includes("좋은 점 4"), "0-2226 still shows only three cards and three menu items");

/* 화면 — CSS 모듈은 클래스 이름만 필요하다(이름을 그대로 돌려준다) */
const require = createRequire(import.meta.url);
require.extensions[".css"] = (module) => { module.exports = { default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const { BrainwaveBusinessMobile } = require("../components/brainwave-business-mobile") as typeof import("../components/brainwave-business-mobile");
const order = businessTemplateManifest[NEW].sections.map(section => section.id);
const render = (data: typeof bw, onPick?: () => void) => renderToStaticMarkup(createElement(BrainwaveBusinessMobile, { pageId: NEW, overrides: data, hidden: new Set(data.hidden), sectionOrder: order, onPick }));
const count = (html: string, needle: string) => html.split(needle).length - 1;
const html = render(visited);
// 구역 순서: 첫 화면 → 숫자 → 소개 카드 → 메뉴 → 사진 → 이용 순서 → 질문 → 오시는 길 → 마무리(후기는 닫혀 있다)
const at = ["1:10", "1:20", "1:30", "1:50", "1:70", "1:80", "1:90", "1:110", "1:120"].map(id => html.indexOf(`data-bw-node="${id}"`));
assert.ok(at.every((position, index) => position > 0 && (index === 0 || position > at[index - 1])), "sections in the default order");
assert.ok(!html.includes('data-bw-node="1:100"'));
assert.equal(count(html, "<h1"), 1);
assert.ok(html.indexOf(">퇴근길 반찬가게<") < html.indexOf("<h1"), "brand bar first");
for (let n = 1; n <= 5; n += 1) assert.ok(html.includes(`>좋은 점 ${n}<`) && html.includes(`>좋은 점 ${n} 설명이에요.<`), `card ${n}`);
assert.equal(count(html, "<article"), 5 + 3, "five cards + three menu photo cards");
assert.equal(html.match(/<li[ >]/g)?.length, 4 + 3, "four menu rows + three steps");
for (let n = 1; n <= 4; n += 1) assert.ok(html.includes(`>묶음 ${n}<`) && html.includes(`>${n}0,000원<`), `menu row ${n}`);
assert.equal(count(html, "<details"), 3);
assert.equal(count(html, "<summary"), 3);
assert.ok(html.includes(">질문 3?<") && html.includes(">답 3이에요.<"));
assert.ok(html.includes(">3~4가지<") && html.includes(">2종<"));
assert.equal(count(html.slice(at[4], at[5]), "<img"), 2, "gallery shows the two photos the sector set has left");
assert.equal(count(html, "<img"), 1 + 3 + 2, "every photo once");
assert.ok(html.includes('href="#visit"') && html.includes("네이버 지도에서 보기") && html.includes(">평일 16:00–20:00<"));
assert.equal(count(html, "data-bw-btn="), 2);
assert.equal(count(html, "data-bw-closing"), 1);
assert.ok(html.includes("data-own-motion") && html.includes('data-reveal="title"') && html.includes("data-kenburns"));
assert.ok(!html.includes("data-bw-text") && !html.includes("사진 넣기") && !html.includes("후기"), "no editor hints or review section in public");
assert.ok(render(called).includes('href="tel:021234567"'));
// 숨긴 구역·바꾼 순서를 따른다
assert.ok(!render({ ...visited, hidden: [...visited.hidden, "1:90"] }).includes("<details"));
const moved = renderToStaticMarkup(createElement(BrainwaveBusinessMobile, { pageId: NEW, overrides: { ...visited, order: [...order].reverse() }, hidden: new Set(visited.hidden), sectionOrder: [...order].reverse() }));
assert.ok(moved.indexOf('data-bw-node="1:120"') < moved.indexOf('data-bw-node="1:10"'));
// 처음 만든 페이지(AI 채우기 전): 이름·소개 카드·오시는 길·마무리만. 사진이 한 장뿐이면 사진 모음은 열지 않는다
const plain = render(createBusinessTemplate({ ...created.pageData!.businessContent!, image: "/qa-light-photo.png" }, NEW));
assert.equal(count(plain, "data-bw-node="), 4);
assert.equal(count(plain, "<img"), 1, "the hero photo is not repeated in the gallery");
assert.ok(plain.includes(">제공 내용<") && plain.includes(">15,000원<") && plain.includes(">오시는 길과 영업시간<") && !plain.includes("네이버 지도"));
// 후기: 글이 없으면 닫혀 있고, 구역을 켜도 공개 화면에는 안 나온다. 안내 글 칸을 채우면 그 글만, 후기를 적으면 후기만
const reviewsOn = { ...visited, hidden: visited.hidden.filter(id => id !== "1:100") };
assert.ok(!render(reviewsOn).includes('data-bw-node="1:100"'), "an empty review section never shows");
const honest = render({ ...reviewsOn, texts: { ...reviewsOn.texts, "1:105": "아직 후기가 없어요" } });
assert.ok(honest.includes('data-bw-node="1:100"') && honest.includes(">손님 후기<") && honest.includes(">아직 후기가 없어요<") && !honest.includes("<figure"));
const reviewed = render({ ...reviewsOn, texts: { ...reviewsOn.texts, "1:102": "반찬이 맛있어요", "1:105": "아직 후기가 없어요" } });
assert.ok(reviewed.includes(">반찬이 맛있어요<") && count(reviewed, "<figure") === 1 && !reviewed.includes("아직 후기가 없어요"));
// 편집 화면: 글·사진을 그 자리에서 고친다 — 글 자리는 하나씩만, 빈 칸은 하나 더 보여 눌러서 늘린다
const editor = render(reviewsOn, () => {});
for (const id of ["1:11", "1:12", "1:13", "1:31", "1:33", "1:41", "1:53", "1:54", "1:59", "1:71", "1:81", "1:82", "1:91", "1:92", "1:97", "1:101", "1:111", "1:112", "1:121", "1:122"]) assert.equal(count(editor, `data-bw-text="${id}"`), 1, `editable once: ${id}`);
assert.ok(editor.includes('data-bw-text="1:43"') && editor.includes('data-bw-text="1:61"') && !editor.includes('data-bw-text="1:63"'), "one spare card and one spare menu row");
assert.ok(editor.includes('data-bw-text="1:102"') && editor.includes('data-bw-text="1:105"'), "review and empty-state slots are offered");
for (const id of ["1:16", "1:65", "1:66", "1:67", "1:72", "1:73", "1:74"]) assert.equal(count(editor, `data-bw-image="${id}"`), 1, `photo slot ${id}`);
assert.equal(count(editor, "<details"), count(editor, "<details open"), "answers stay open in the editor");
assert.ok(!editor.includes("map.naver.com") && !editor.includes('href="#visit"'), "editor does not navigate away");

console.log(JSON.stringify({ passed: 77 }));
