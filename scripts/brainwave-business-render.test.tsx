import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { businessNeedsFlow } from "../lib/landing/brainwave/layout-safety";
import { heroImageForSector, landingTemplateOptions } from "../lib/landing/domain";
import { BUSINESS_DESIGNED_PAGES, BUSINESS_TEMPLATE_PROFILES, businessTemplateManifest, createBusinessTemplate, restorableSections } from "../lib/landing/brainwave/business-content";

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
for (const pageId of ["0-290", "0-1102", "0-2226", "0-2385", "0-421"]) {
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
// 동네 가게(0-2226): 가게 이름 띠 → 사진 첫 화면(이름·소개·버튼) → 좋은 점 → 오시는 길·영업시간 → 마무리
assert.ok(BUSINESS_DESIGNED_PAGES.has("0-2226"));
const local = createBusinessTemplate({ ...content, businessName: "퇴근필라", headline: "퇴근 후, 붐비지 않는 4인 기구 필라테스" }, "0-2226");
const localHtml = render(local);
assert.ok(localHtml.indexOf(">퇴근필라<") < localHtml.indexOf("<h1"), "brand bar first");
assert.match(localHtml, /<h1[^>]*>퇴근필라<\/h1><p[^>]*>퇴근 후, 붐비지 않는 4인 기구 필라테스<\/p><button[^>]*data-bw-btn="0:2372"/);
for (const label of ["제공 내용", "이용 대상", "가격 안내", "390,000원", "오시는 길·영업시간", "주소는 문의 주시면 안내해 드려요", "영업시간은 문의 주시면 안내해 드려요", "퇴근필라에 문의해 보세요"]) assert.ok(localHtml.includes(label), label);
assert.ok(!localHtml.includes("네이버 지도"), "no map link until there is an address");
assert.ok(!localHtml.includes('href="#visit"'), "no hours/address chips until they are known");
assert.ok(!/Coworking|Brainwave|자리 예약|새벽커피|이메일 주소|Subscribe/.test(localHtml), "no raw kit or sample copy");
assert.equal(count(localHtml, "data-bw-btn="), 2, "hero and closing buttons only");
// 주소·영업시간을 알면: 첫 화면 칩(누르면 오시는 길로), 지도 링크
local.texts["0:2282"] = "서울 마포구 월드컵로 12, 2층";
local.texts["0:2268"] = "평일 07:00–22:00\n주말 09:00–18:00";
const visitHtml = render(local);
assert.ok(visitHtml.includes('href="#visit"') && visitHtml.includes(">평일 07:00–22:00<") && visitHtml.includes(">서울 마포구 월드컵로 12, 2층<"));
assert.ok(visitHtml.includes(`href="https://map.naver.com/p/search/${encodeURIComponent("서울 마포구 월드컵로 12, 2층")}"`));
assert.ok(!render(local, () => {}).includes("map.naver.com"), "editor does not navigate away");
// 숫자·메뉴·이용 순서는 AI 채우기가 연 뒤에만
for (const id of ["0:2347", "0:2322", "0:2309"]) assert.ok(local.hidden.includes(id), `${id} closed at first`);
local.texts["0:2345"] = "수업·가격"; local.texts["0:2324"] = "4인 기구 필라테스(50분)"; local.texts["0:2325"] = "220,000원";
local.texts["0:2349"] = "4명"; local.texts["0:2350"] = "한 수업 정원"; local.texts["0:2352"] = "50분"; local.texts["0:2353"] = "수업 시간";
local.hidden = local.hidden.filter(id => !["0:2347", "0:2322", "0:2345", "0:2324", "0:2325", "0:2349", "0:2350", "0:2352", "0:2353"].includes(id));
const openedHtml = render(local);
assert.ok(openedHtml.includes(">수업·가격<") && openedHtml.includes(">220,000원<") && openedHtml.includes(">4명<") && openedHtml.includes(">한 수업 정원<"));
assert.equal(count(openedHtml.slice(openedHtml.indexOf('data-bw-node="0:2322"'), openedHtml.indexOf('data-bw-node="0:2283"')), "<article"), 1, "only filled menu items");
// 병원(0-2385): 머리글(예약 버튼) → 첫 화면(이름·소개·예약) → 진료 과목 → 진료 시간·오시는 길 → 마무리
assert.ok(BUSINESS_DESIGNED_PAGES.has("0-2385"));
const clinic = createBusinessTemplate({ ...content, businessName: "밝은하루치과", headline: "퇴근 후에도 들를 수 있는 동네 치과", cta: "진료 예약하기" }, "0-2385");
const clinicHtml = render(clinic);
assert.ok(clinicHtml.indexOf(">밝은하루치과<") < clinicHtml.indexOf("<h1") && clinicHtml.includes('data-bw-btn="0:2554"'), "brand bar with a booking button first");
assert.match(clinicHtml, /<h1[^>]*>밝은하루치과<\/h1><p[^>]*>퇴근 후에도 들를 수 있는 동네 치과<\/p><button[^>]*data-bw-btn="0:2544"/);
for (const label of ["진료 시간·오시는 길", "진료 시간은 문의 주시면 안내해 드려요", "주소는 문의 주시면 안내해 드려요", "밝은하루치과에 문의해 보세요"]) assert.ok(clinicHtml.includes(label), label);
assert.ok(!/Albino|Brainwave|\$\d|Get started|Pricing|Corey|Basic|Premium/.test(clinicHtml), "no raw kit copy");
assert.ok(!clinicHtml.includes("의료진"), "doctors stay hidden until the owner turns them on");
assert.equal(clinic.images["0:2459/0"], "", "doctor photos are never copied from the hero");
// 진료 시간표: 한 줄씩 요일·시간으로 나눠 표로
clinic.texts["0:2418"] = "평일 09:30–18:30\n점심시간 13:00–14:00\n일요일·공휴일 휴진";
clinic.texts["0:2399"] = "서울 마포구 양화로 45, 3층";
const hoursHtml = render(clinic);
assert.ok(hoursHtml.includes("<th scope=\"row\">평일</th><td colSpan=\"1\">09:30–18:30</td>") || hoursHtml.includes('<th scope="row">평일</th><td colspan="1">09:30–18:30</td>'));
assert.ok(hoursHtml.includes('<th scope="row">일요일·공휴일</th>') && hoursHtml.includes(">휴진<"));
assert.ok(hoursHtml.includes("map.naver.com") && hoursHtml.includes('href="#visit"'));
// 의료진을 켜면: 공개 화면은 적은 사람만, 편집 화면은 빈 칸에 안내 글
clinic.hidden = clinic.hidden.filter(id => id !== "0:2455");
clinic.texts["0:2461"] = "김하루"; clinic.texts["0:2460"] = "대표원장";
const doctorsHtml = render(clinic);
assert.ok(doctorsHtml.includes(">김하루<") && !doctorsHtml.includes("원장 이름"));
const doctorsEditor = render(clinic, () => {});
assert.ok(doctorsEditor.includes("원장 이름") && doctorsEditor.includes("학력·경력·진료 철학"));
assert.ok(restorableSections("0-2385").includes("0:2455"), "doctors can be turned on from the editor");
// 갤러리형(0-421): 머리글(문의) → 사진 첫 화면 → 작업 사례(누르면 크게) → 이런 일을 해요 → 찾아오시는 길 → 마무리(같은 문의 버튼)
assert.ok(BUSINESS_DESIGNED_PAGES.has("0-421"));
const gallery = createBusinessTemplate({ ...content, businessName: "온결 인테리어", headline: "오래 살아도 편한 집을 만듭니다", cta: "상담 신청하기" }, "0-421");
gallery.images["0:875/0"] = "https://example.com/work-1.jpg"; gallery.images["0:876/0"] = "https://example.com/work-2.jpg";
gallery.hidden = gallery.hidden.filter(id => !["0:875/0", "0:876/0"].includes(id));
const galleryHtml = render(gallery);
assert.ok(galleryHtml.indexOf(">온결 인테리어<") < galleryHtml.indexOf("<h1") && galleryHtml.includes('data-bw-btn="0:1101"'));
assert.match(galleryHtml, /<h1[^>]*>온결 인테리어<\/h1><p[^>]*>오래 살아도 편한 집을 만듭니다<\/p><button[^>]*data-bw-btn="0:1090"/);
for (const label of ["작업 사례", "이런 일을 해요", "찾아오시는 길", "운영 시간", "오시는 길", "온결 인테리어에 문의해 보세요"]) assert.ok(galleryHtml.includes(label), label);
assert.ok(!/Brainwave|Download|Starter|Unlimited|Isaac|Team Members|\$|Company|Careers|Privacy Policy|©/.test(galleryHtml), "no raw kit copy");
assert.equal(count(galleryHtml, 'data-bw-btn="0:1090"'), 2, "closing repeats the first-screen button");
assert.equal(count(galleryHtml, 'aria-label="크게 보기"'), 2, "each work photo opens large on the public page");
assert.ok(!render(gallery, () => {}).includes("크게 보기"), "editor taps change the photo instead");
assert.ok(!galleryHtml.includes("손님 후기"), "reviews stay hidden until the owner writes real ones");
assert.equal(gallery.images["0:616/0"], "", "review photos are never copied from the hero");
gallery.hidden = gallery.hidden.filter(id => id !== "0:611");
const reviewEditor = render(gallery, () => {});
assert.ok(reviewEditor.includes("실제 손님이 남긴 후기를 적어 주세요") && reviewEditor.includes("손님 이름"));
assert.ok(!render(gallery).includes("손님 후기"), "empty reviews never show on the public page");
assert.ok(restorableSections("0-421").includes("0:611"));
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
// 소개·문의 페이지의 사업자 표기는 채운 칸만('등록 전' 줄 없음), 판매 페이지는 빈 칸도 드러낸다
const footerHtml = renderToStaticMarkup(createElement(PublicLandingClient, { slug: "munap", config: withContact }));
assert.ok(footerHtml.includes("전화 010-1234-5678") && !footerHtml.includes("등록 전"));
assert.ok(renderToStaticMarkup(createElement(PublicLandingClient, { slug: "munap", config: { ...withContact, pageMode: "transaction" as const } })).includes("대표자 등록 전"));
console.log(JSON.stringify({ passed: 76 }));
