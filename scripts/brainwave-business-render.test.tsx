import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { businessNeedsFlow } from "../lib/landing/brainwave/layout-safety";
import { heroImageForSector, landingTemplateOptions } from "../lib/landing/domain";
import { BUSINESS_DESIGNED_PAGES, BUSINESS_TEMPLATE_PROFILES, businessTemplateManifest, createBusinessTemplate } from "../lib/landing/brainwave/business-content";

// CSS 모듈은 클래스 이름만 필요하다 — 이름을 그대로 돌려준다
const require = createRequire(import.meta.url);
require.extensions[".css"] = (module) => { module.exports = { default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const { BrainwaveBusinessMobile } = require("../components/brainwave-business-mobile") as typeof import("../components/brainwave-business-mobile");

const content = { businessName: "카페피드", offer: "월 12회 게시물 촬영·편집·업로드", description: "사진부터 리포트까지 맡기는 카페 SNS 관리.", customer: "동네 카페 사장님", price: "390,000원", cta: "문의하기", image: "/qa-light-photo.png" };
const render = (data: ReturnType<typeof createBusinessTemplate>, onPick?: () => void) => renderToStaticMarkup(createElement(BrainwaveBusinessMobile, {
  pageId: data.page, overrides: data, hidden: new Set(data.hidden), sectionOrder: businessTemplateManifest[data.page].sections.map(section => section.id).reverse(), onPick, desktop: true,
}));
const count = (html: string, needle: string) => html.split(needle).length - 1;

// 상담 서비스(0-290)는 Figma 디자인을 옮긴 화면으로 그린다 — 글이 길거나 사진을 바꿔도 그대로
assert.ok(BUSINESS_DESIGNED_PAGES.has("0-290"));
assert.equal(businessNeedsFlow({ id: "0-290", slots: { text: [], image: [] } } as never, { contentMode: "business", texts: { "0:414": "짧은 제목" }, images: {} }), true, "designed page never falls back to the fixed-coordinate kit");
const legacy = render(createBusinessTemplate(content, "0-290"));
assert.match(legacy, /<h1[^>]*>카페피드<\/h1>/);
assert.ok(legacy.includes(">카페피드에 문의해 보세요<"), "contact band invites the visitor by name");
assert.equal(count(legacy, 'src="/qa-light-photo.png"'), 1, "public page shows one photo once");
assert.ok(count(render(createBusinessTemplate(content, "0-290"), () => {}), 'src="/qa-light-photo.png"') > 1, "editor shows every photo slot");
assert.ok(!/Brainwave|Get started|consult|Easy Booking|1M\+/i.test(legacy), "no raw kit copy");
const titled = render(createBusinessTemplate({ ...content, headline: "동네 카페 인스타, 매달 대신 채워 드려요" }, "0-290"));
// 첫 화면: 큰 제목은 사업 이름, 그 아래 한 줄 소개, 그리고 버튼
assert.match(titled, /<h1[^>]*>카페피드<\/h1><p[^>]*>동네 카페 인스타, 매달 대신 채워 드려요<\/p><button[^>]*data-bw-btn="0:416"/);
for (const label of ["제공 내용", "이용 대상", "가격 안내", "390,000원"]) assert.ok(titled.includes(label), label);
// 소개 문장이 첫 항목(대표 상품)과 같으면 한 번만
assert.equal(count(titled, `>${content.offer}<`), 1);
// 온라인 상점(0-1102)도 Figma 디자인 화면 — 머리글 → 큰 제목·소개 → 제공 내용·이용 대상·가격 카드 → 마무리 문구
assert.ok(BUSINESS_DESIGNED_PAGES.has("0-1102"));
const shop = render(createBusinessTemplate({ ...content, headline: "퇴근하면 문 앞에 반찬이 와 있는 저녁" }, "0-1102"));
assert.match(shop, /<h1[^>]*>카페피드<\/h1><p[^>]*>퇴근하면 문 앞에 반찬이 와 있는 저녁<\/p><button[^>]*data-bw-btn="0:1110"/, "name, tagline, then a button on the first screen");
assert.ok(shop.indexOf(">카페피드<") < shop.indexOf("<h1"), "header comes first even though it overlays the hero in the kit");
assert.ok(render(createBusinessTemplate(content, "0-1102")).includes(content.description), "without a tagline the business description sits under the name");
for (const label of ["제공 내용", "이용 대상", "가격 안내", "390,000원", "카페피드에 문의해 보세요"]) assert.ok(shop.includes(label), label);
assert.equal(count(shop, 'src="/qa-light-photo.png"'), 1);
assert.ok(!/Brainwave|Living Room|Start Shopping|Explore All|\$\d/.test(shop), "no raw kit copy");
// 사장님이 편집기에서 순서를 바꾸면 그 순서를 따른다
const reordered = createBusinessTemplate(content, "0-1102");
const reorderedHtml = renderToStaticMarkup(createElement(BrainwaveBusinessMobile, { pageId: "0-1102", overrides: { ...reordered, order: ["0:1104", "0:1360", "0:1321", "0:1329"] }, hidden: new Set(reordered.hidden), sectionOrder: ["0:1104", "0:1360", "0:1321", "0:1329"], desktop: true }));
assert.ok(reorderedHtml.indexOf("카페피드에 문의해 보세요") < reorderedHtml.indexOf("<h1"));
// 다른 템플릿(흐름 화면)도 같은 사진은 공개 화면에 한 번만
for (const pageId of Object.keys(BUSINESS_TEMPLATE_PROFILES).filter(id => !BUSINESS_DESIGNED_PAGES.has(id))) {
  const html = render(createBusinessTemplate(content, pageId));
  assert.ok(count(html, 'src="/qa-light-photo.png"') <= 1, `${pageId}: photo once`);
}
for (const pageId of Object.keys(BUSINESS_TEMPLATE_PROFILES)) {
  const html = render(createBusinessTemplate({ ...content, headline: "한 줄 소개" }, pageId));
  assert.equal(count(html, "<h1"), 1, `${pageId}: one headline`);
  assert.ok(html.includes(">카페피드<"), `${pageId}: business name still visible`);
}
// 사진이 없으면 공개 화면에는 사진 자리가 없고, 편집 화면에만 '사진 넣기'가 있다
const noPhoto = createBusinessTemplate({ ...content, image: "" }, "0-290");
assert.ok(!render(noPhoto).includes("사진 넣기"));
assert.ok(!render(noPhoto).includes("<img"));
const picks: string[] = [];
const editorHtml = renderToStaticMarkup(createElement(BrainwaveBusinessMobile, { pageId: "0-290", overrides: noPhoto, hidden: new Set(noPhoto.hidden), sectionOrder: businessTemplateManifest["0-290"].sections.map(section => section.id), onPick: (_kind, id) => { picks.push(id); }, desktop: true }));
assert.ok(count(editorHtml, "사진 넣기") >= 1, "editor offers a place to add a photo");
assert.equal(count(editorHtml, "사진 넣기"), count(editorHtml, "data-bw-image="), "each slot button targets a real image slot");
// 사진이 있는 칸에는 '사진 넣기'가 붙지 않는다
assert.ok(!render(createBusinessTemplate(content, "0-290"), () => {}).includes("사진 넣기"));
// 예전 페이지에 남은 킷 견본 사진(/brainwave/…)은 공개 화면에 나오지 않고, 편집 화면은 '사진 넣기'
for (const pageId of Object.keys(BUSINESS_TEMPLATE_PROFILES)) {
  const sample = createBusinessTemplate({ ...content, image: `/brainwave/${pageId}/imgSample.jpg` }, pageId);
  assert.ok(!render(sample).includes("/brainwave/"), `${pageId}: kit sample photo hidden`);
  const editor = render(sample, () => {});
  assert.ok(!editor.includes('src="/brainwave/'), `${pageId}: editor shows a slot instead of the sample`);
}
assert.ok(render(createBusinessTemplate({ ...content, image: "/brainwave/0-290/imgBg.jpg" }, "0-290"), () => {}).includes("사진 넣기"));
// 템플릿 기본 사진(노트북 앞 외국인, 손목시계…)도 사업 페이지에는 싣지 않는다 — 업종 사진은 그대로
for (const option of landingTemplateOptions) {
  for (const pageId of ["0-290", "0-1102", "0-2385"]) assert.ok(!render(createBusinessTemplate({ ...content, image: option.heroImageUrl }, pageId)).includes(option.heroImageUrl), `${pageId}: ${option.id} stock photo hidden`);
}
const cafePhoto = heroImageForSector("카페", "");
assert.ok(cafePhoto && render(createBusinessTemplate({ ...content, image: cafePhoto }, "0-1102")).includes(cafePhoto.replaceAll("&", "&amp;")), "sector photo still shows");
// 움직임: 디자인 템플릿은 자체 움직임을 갖고(섹션째 떠오르기와 겹치지 않게), 첫 화면은 스크롤 값을 받는다
for (const pageId of ["0-290", "0-1102"]) {
  const html = render(createBusinessTemplate(content, pageId));
  assert.ok(html.includes("data-own-motion"), `${pageId}: owns its motion`);
  assert.ok(html.includes("data-scroll"), `${pageId}: hero follows scroll`);
  assert.ok(html.includes('data-reveal="title"'), `${pageId}: title reveals`);
  assert.ok(html.includes("data-kenburns"), `${pageId}: hero photo slow zoom`);
}
// 여러 줄 단계는 공개 화면에서 한 줄씩(편집 화면은 한 덩어리로 그 자리에서 고친다)
const steps = createBusinessTemplate(content, "0-1102");
steps.texts["0:1141"] = "한 주는 이렇게 흘러가요";
steps.texts["0:1142"] = "① 메뉴 공지\n② 신청 마감\n③ 배송";
steps.hidden = steps.hidden.filter(id => id !== "0:1137");
const stepsHtml = render(steps);
const violetHtml = stepsHtml.slice(stepsHtml.indexOf('data-bw-node="0:1137"'), stepsHtml.indexOf('data-bw-node="0:1104"'));
assert.equal(count(violetHtml, "<li"), 3);
assert.ok(render(steps, () => {}).includes('data-bw-text="0:1142"'));
// 공개 페이지: 넣어 둔 연락처로 휴대폰 아래 고정 버튼(전화·카톡), 아무것도 없으면 없음
// next/font 은 Next 빌드에서만 동작한다 — 테스트에서는 빈 글꼴로 바꿔 끼운다
const NodeModule = require("node:module") as { _load: (name: string, ...rest: unknown[]) => unknown };
const originalLoad = NodeModule._load;
NodeModule._load = function (name: string, ...rest: unknown[]) {
  if (name === "next/font/google") return new Proxy({}, { get: () => () => ({ variable: "", className: "", style: {} }) });
  return originalLoad.call(this, name, ...rest);
};
const { PublicLandingClient } = require("../components/public-landing-client") as typeof import("../components/public-landing-client");
const { landingDraftFromPlan } = require("../lib/landing/from-plan") as typeof import("../lib/landing/from-plan");
const publicDraft = landingDraftFromPlan({ planTitle: "문앞반찬", business: {}, answers: { "market/products": { main_offer: "반찬 정기배송" }, "market/segments": { first_target: "맞벌이 부부" } } });
const withContact = { ...publicDraft, businessPhone: "010-1234-5678", contact: { method: "phone" as const, kakaoUrl: "https://pf.kakao.com/_munap", bookingUrl: "", storeUrl: "", instagramUrl: "", quickBar: true } };
const publicHtml = renderToStaticMarkup(createElement(PublicLandingClient, { slug: "munap", config: withContact }));
assert.ok(publicHtml.includes('aria-label="빠른 연락"') && publicHtml.includes('href="tel:01012345678"') && publicHtml.includes('href="https://pf.kakao.com/_munap"'));
assert.ok(publicHtml.includes("has-quickbar"));
assert.ok(!renderToStaticMarkup(createElement(PublicLandingClient, { slug: "munap", config: publicDraft })).includes("빠른 연락"), "no contacts, no bar");
console.log(JSON.stringify({ passed: 34 }));
