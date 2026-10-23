import assert from "node:assert/strict";
import { applyHomepageCopy, carryCopyToDesign, copyFromNodes, dropVisitInfoAsks, homepageCopyOf, homepageCta, homepageFillPrompt, homepageKnownPrice, normalizeHomepageCopy, switchHomepageDesign, withKnownPrice } from "../lib/landing/ai-fill";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { landingDraftSchema, type LandingDraft } from "../lib/landing/domain";
import { createBusinessTemplate } from "../lib/landing/brainwave/business-content";
import { COACH_KEY, COACH_VERSION, type CoachState } from "../lib/plan-builder/coach";
import { photoSetFor } from "../lib/landing/photo-library";
import { DESCRIPTIVE_NAME_ITEM, homepageMissingInfo, looksDescriptiveName } from "../lib/landing/publish-check";

/*
 * 실제 AI 점검(2026-10-22) 빵집 사례 — 디자인을 바꾸면 AI 글이 사라지고, 가격 4,500원이 메뉴에 안 나오고,
 * 버튼이 모두 '영업시간 문의하기'였다. AI 를 부르지 않고 그때 받은 글 모양(fixture)으로 다시 본다.
 */
const coach: CoachState = {
  version: COACH_VERSION, revision: 2, stage: "startup", depth: "quick", ready: true, messages: [], suggestions: [],
  business: { name: "아파트 상가 아침 빵집", description: "출근길 직장인에게 식빵·소금빵을 파는 빵집", role: "", industry: "제과점", region: "", stage: "사업 기획" },
  fields: [
    { key: "offer", value: "식빵·소금빵", basis: "user", quote: "식빵·소금빵", messageId: "a" },
    { key: "price", value: "4500원", basis: "user", quote: "4500원", messageId: "a" },
  ],
};
const plan = { title: "아파트 상가 아침 빵집", answers: { [COACH_KEY]: { state: coach } } as Record<string, Record<string, unknown>> };

/* 실제 응답 모양: 메뉴 둘 다 '문의', 버튼 '영업시간 문의하기' */
const aiRaw = {
  tagline: "출근길에 갓 구운 소금빵 하나 챙겨 가는 아침",
  cardsTitle: "오늘의 빵", cardsIntro: "매일 아침 두 가지 빵만 구워요.",
  cards: [
    { title: "식빵과 소금빵, 딱 두 가지", body: "바쁜 아침에도 고민 없이 고를 수 있어요." },
    { title: "출근 시간에 맞춰 구워요", body: "들르셨을 때 이미 구워져 있어요." },
    { title: "오늘 구운 시각을 적어 둬요", body: "갓 구운 빵인지 한눈에 보여요." },
    { title: "작게 시작해요", body: "소량만 구워 신선하게 팔아요." },
  ],
  process: { title: "이렇게 사 가세요", steps: ["출근길에 들르기 — 단지 상가 매장 앞을 지나며 들러 주세요.", "빵 고르기 — 구운 시각을 보고 골라요.", "계산하고 가져가기 — 바로 들고 가세요."] },
  closing: "출근길, 갓 구운 빵 하나 챙겨 가세요", closingSub: "여는 시간이 궁금하시면 문의 버튼으로 물어봐 주세요.", cta: "영업시간 문의하기",
  menu: { title: "오늘의 빵", intro: "매일 아침 두 가지만 구워요.", items: [{ name: "소금빵", price: "문의" }, { name: "식빵", price: "문의" }] },
};
const copy = normalizeHomepageCopy(aiRaw)!;
assert.ok(copy);

// 4) 가격 하나 + 상품 둘 → 'N원부터' (AI 제안 가격은 쓰지 않는다)
assert.equal(homepageKnownPrice(plan), "4,500원");
const priced = withKnownPrice(copy, homepageKnownPrice(plan));
assert.deepEqual(priced.menu.items.map(item => item.price), ["4,500원부터", "4,500원부터"]);
assert.deepEqual(withKnownPrice({ ...copy, menu: { ...copy.menu, items: [copy.menu.items[0]] } }, "4,500원").menu.items.map(item => item.price), ["4,500원"], "one product takes the price as is");
assert.deepEqual(withKnownPrice({ ...copy, menu: { ...copy.menu, items: [{ name: "소금빵", price: "3,000원" }, { name: "식빵", price: "문의" }] } }, "4,500원").menu.items.map(item => item.price), ["3,000원", "문의"], "items with prices are left alone");
const proposalPlan = structuredClone(plan);
(proposalPlan.answers[COACH_KEY].state as CoachState).fields[1].basis = "proposal";
assert.equal(homepageKnownPrice(proposalPlan), "", "AI-proposed prices are not filled in");

// 동네 가게 디자인에 채우기
const created = landingDraftFromPlan({ planTitle: plan.title, business: {}, answers: plan.answers });
const local: LandingDraft = structuredClone(created);
local.pageData!.brainwave = createBusinessTemplate(local.pageData!.businessContent!, "0-2226");
const filled = applyHomepageCopy(local, priced, { industry: "제과점", now: "2026-10-22T04:00:00.000Z" });
landingDraftSchema.parse(filled);
const fbw = filled.pageData!.brainwave!;
assert.equal(fbw.texts["0:2345"], "오늘의 빵");
assert.equal(fbw.texts["0:2325"], "4,500원부터", "the entered price shows on the menu card");

// 5) '영업시간 문의하기'는 버튼이 되지 않는다 — 주소·전화가 없으면 '문의하기'
assert.equal(fbw.texts["I0:2372;0:4557"], "문의하기");
assert.equal(fbw.texts["I0:2233;0:4557"], "문의하기");
assert.equal(filled.ctaLabel, "문의하기", "form title is not '영업시간 문의하기'");
assert.deepEqual(homepageCta("영업시간 문의하기", "0-2226", { ...local, businessPhone: "010-1234-5678" }), { label: "전화하기", callPhone: true });
const withAddress = homepageCta("영업시간 문의하기", "0-2226", { ...local, businessAddress: "서울 마포구 월드컵로 12" });
assert.equal(withAddress.hero?.label, "오시는 길");
assert.match(withAddress.hero!.href, /^https:\/\/map\.naver\.com\/p\/search\//);
assert.equal(homepageCta("예약 문의하기", "0-1102", local).label, "예약 문의하기", "usable AI labels are kept on other designs");
// 전화번호가 있는 동네 가게: 버튼은 '전화하기'로, 문의 버튼은 전화로 연결된다
const phoneFilled = applyHomepageCopy({ ...local, businessPhone: "010-1234-5678", businessContact: "010-1234-5678" }, priced, { industry: "제과점" });
assert.equal(phoneFilled.pageData!.brainwave!.texts["I0:2372;0:4557"], "전화하기");
assert.equal(phoneFilled.contact?.method, "phone");
assert.equal(phoneFilled.pageData!.brainwave!.links["0:2372"], "tel:01012345678");
// 주소만 있으면 첫 화면 버튼은 '오시는 길'(지도), 마무리 버튼은 문의 양식
const addressFilled = applyHomepageCopy({ ...local, businessAddress: "서울 마포구 월드컵로 12" }, priced, { industry: "제과점" });
assert.equal(addressFilled.pageData!.brainwave!.texts["I0:2372;0:4557"], "오시는 길");
assert.match(addressFilled.pageData!.brainwave!.links["0:2372"] ?? "", /^https:\/\/map\.naver\.com/);
assert.equal(addressFilled.pageData!.brainwave!.texts["I0:2233;0:4557"], "문의하기");

// 1) 디자인을 바꿔도 AI 글은 역할대로 옮겨 간다 — 다시 돌아오면 원래 자리에 되살아난다
assert.ok(filled.pageData!.aiFill?.copy, "the role-shaped copy is stored with the fill");
const roundTrip = copyFromNodes("0-2226", fbw.texts)!;
assert.equal(roundTrip.cards[0].title, "식빵과 소금빵, 딱 두 가지");
assert.deepEqual(roundTrip.process.steps, priced.process.steps);
assert.equal(roundTrip.menu.items[0].price, "4,500원부터");
const build = (page: string) => (draft: LandingDraft) => createBusinessTemplate(draft.pageData!.businessContent!, page);
const toShop = switchHomepageDesign(filled, "0-1102", build("0-1102"));
landingDraftSchema.parse(toShop);
const sbw = toShop.pageData!.brainwave!;
assert.equal(sbw.page, "0-1102");
assert.equal(sbw.texts["0:1333"], "식빵과 소금빵, 딱 두 가지", "AI cards land in the new design's card slots");
assert.equal(sbw.texts["0:1348"], "작게 시작해요", "the fourth card (stored copy) appears in a design with more card slots");
assert.ok(sbw.texts["0:1142"].includes("출근길에 들르기"), "steps move too");
assert.equal(sbw.texts["0:1111"], "출근길, 갓 구운 빵 하나 챙겨 가세요");
assert.ok(!Object.values(sbw.texts).includes("제공 내용"), "no template label like '제공 내용' replaces AI copy");
const back = switchHomepageDesign(toShop, "0-2226", build("0-2226"));
const bbw = back.pageData!.brainwave!;
assert.equal(bbw.texts["0:2345"], "오늘의 빵", "switching back restores the menu title");
assert.equal(bbw.texts["0:2324"], "소금빵");
assert.equal(bbw.texts["0:2325"], "4,500원부터");
assert.equal(bbw.texts["0:2285"], "식빵과 소금빵, 딱 두 가지");
assert.equal(back.pageData!.aiFill!.at, filled.pageData!.aiFill!.at, "switching is not a new AI fill");
// 사장님이 AI 글을 고친 뒤 바꿔도 고친 글이 따라간다
const edited = structuredClone(filled);
edited.pageData!.brainwave!.texts["0:2286"] = "사장님이 고친 첫 카드 설명";
assert.equal(homepageCopyOf(edited.pageData)!.cards[0].body, "사장님이 고친 첫 카드 설명");
// AI 로 채운 적이 없으면 예전처럼 기본 글로 만든다
const plain = switchHomepageDesign(local, "0-1102", build("0-1102"));
assert.equal(plain.pageData!.aiFill, undefined);
assert.equal(homepageCopyOf(local.pageData), null);
// 편집기 안에서 바꿀 때도 같은 규칙
const editorNext = carryCopyToDesign(filled.pageData!, fbw, createBusinessTemplate(filled.pageData!.businessContent!, "0-421"));
assert.equal(editorNext.texts["0:565"], "식빵과 소금빵, 딱 두 가지");

// 2) 재검증(2026-10-22 2차): 상담 서비스(카드 이름만)를 거쳐 동네 가게로 돌아오면 카드 셋이 제목만 남았다. 다섯 디자인을 모두 돌고
// 와도 카드의 제목·설명 짝이 남는다. 상담 서비스에는 '가격'처럼 설명 없이는 뜻이 없는 빈 제목 카드와 '이용 대상' 꼬리표 칸이 보이지 않는다.
const realCopy = normalizeHomepageCopy({
  ...aiRaw,
  cards: [
    { title: "식빵·소금빵 두 가지", body: "메뉴는 식빵과 소금빵 두 가지예요. 고르는 데 시간이 거의 들지 않아요." },
    { title: "아침에 구운 빵", body: "출근 시간 전에 구워서 아침 출근 시간대에 매장에서 팔아요." },
    { title: "출근 동선 안의 상가 매장", body: "동네 아파트 상가 매장이라 출근길에 잠깐 들러 사서 바로 들고 나가요." },
    { title: "가격", body: "한 개 4,500원" },
    { title: "여는 날 안내", body: "매일 열지 않고 정한 아침에 열 예정이에요. 여는 요일과 시각은 문의 주시면 안내해 드려요." },
  ],
  process: { title: "이렇게 이용해요", steps: ["① 여는 날 확인 — 홈페이지의 문의 버튼으로 여는 요일과 시각을 물어봐 주세요", "② 출근길에 들르기 — 아파트 상가 매장에 들러요", "③ 바로 챙겨 가기 — 식빵이나 소금빵을 골라 사서 들고 나가요"] },
  facts: [{ value: "2가지", label: "빵 종류(식빵·소금빵)" }, { value: "4,500원", label: "빵 한 개 가격" }],
  faq: [{ question: "언제 문을 여나요?", answer: "매일 열지 않고 정한 아침 시간대에 열 예정이에요. 여는 요일과 시각은 문의 주시면 안내해 드려요." }],
})!;
// 5) 손님에게 영업시간·여는 시각·주소를 문의로 물어보라는 문장은 빠진다
assert.deepEqual(realCopy.process.steps, ["② 출근길에 들르기 — 아파트 상가 매장에 들러요", "③ 바로 챙겨 가기 — 식빵이나 소금빵을 골라 사서 들고 나가요"], "the 'ask us the opening days' step is dropped");
assert.equal(realCopy.cards[4].body, "매일 열지 않고 정한 아침에 열 예정이에요.");
assert.equal(realCopy.faq[0].answer, "매일 열지 않고 정한 아침 시간대에 열 예정이에요.");
assert.ok(!JSON.stringify({ ...realCopy, cta: "" }).match(/(여는 요일|여는 시간|영업시간|주소)[^"]*(문의|물어)/), "no 'ask about hours/address' sentence anywhere (the button label is homepageCta's job)");
assert.equal(dropVisitInfoAsks("주소는 문의 주시면 안내해 드려요."), "");
assert.equal(dropVisitInfoAsks("가격 문의는 언제든 편하게 주세요."), "가격 문의는 언제든 편하게 주세요.", "other inquiries stay");
assert.ok(homepageFillPrompt(plan).system.includes("이용 순서라면 '찾아오시는 길 확인'처럼 중립적인 단계로"));
assert.ok(homepageFillPrompt(plan).system.includes("- 아직 정하지 않은 것(가격 단위, 배송 요일, 영업시간 등)은 단정하지 말고 '문의 주시면 안내해 드려요'처럼 씁니다."), "existing rule kept verbatim");

const designs = ["0-2226", "0-1102", "0-290", "0-2385", "0-421"];
const cardSlots: Record<string, Array<[string, string | null]>> = {
  "0-2226": [["0:2285", "0:2286"], ["0:2294", "0:2295"], ["0:2301", "0:2302"]],
  "0-1102": [["0:1333", "0:1334"], ["0:1338", "0:1339"], ["0:1343", "0:1344"], ["0:1348", "0:1349"], ["0:1353", "0:1354"]],
  "0-2385": [["0:2521", "0:2522"], ["0:2528", "0:2529"], ["0:2534", "0:2535"]],
  "0-421": [["0:565", "0:566"], ["0:571", "0:572"], ["0:577", "0:578"], ["0:583", "0:584"], ["0:591", "0:592"]],
  "0-290": [["0:373", null], ["0:380", null], ["0:387", null], ["0:394", null]],
};
const bodyOf = new Map(realCopy.cards.map(card => [card.title, card.body]));
const checkDesign = (draft: LandingDraft, where: string) => {
  landingDraftSchema.parse(draft);
  const bw = draft.pageData!.brainwave!;
  const visible = (id: string) => !bw.hidden.includes(id) && Boolean(bw.texts[id]?.trim());
  for (const [title, body] of cardSlots[bw.page]) {
    if (!bw.texts[title]) continue;
    assert.ok(!/^가격$/.test(bw.texts[title]) || body, `${where}: no bare '가격' card name on ${bw.page}`);
    if (body) assert.equal(bw.texts[body], bodyOf.get(bw.texts[title]), `${where}: '${bw.texts[title]}' keeps its description on ${bw.page}`);
  }
  for (const card of (draft.pageData!.aiFill!.copy as { cards: Array<{ title: string; body: string }> }).cards) assert.ok(card.body, `${where}: stored card '${card.title}' keeps its description`);
  if (bw.page === "0-290") {
    for (const id of ["0:337", "0:343", "0:349"]) assert.ok(!["제공 내용", "이용 대상", "가격 안내"].includes(bw.texts[id]), `${where}: no label template on 상담 서비스 (${bw.texts[id]})`);
    assert.equal(bw.texts["0:365"], "이렇게 이용해요");
    assert.equal(bw.texts["0:337"], "출근길에 들르기");
    assert.equal(bw.texts["0:336"], "아파트 상가 매장에 들러요");
    assert.ok(!bw.hidden.includes("0:332"));
    assert.ok(visible("0:400") && bw.texts["0:401"] === "빵 종류(식빵·소금빵)" && !bw.hidden.includes("0:398"), "facts band opens");
    assert.deepEqual(["0:373", "0:380", "0:387", "0:394"].map(id => bw.texts[id]), ["식빵·소금빵 두 가지", "아침에 구운 빵", "출근 동선 안의 상가 매장", "여는 날 안내"]);
  }
  if (bw.page === "0-2226") assert.deepEqual([bw.texts["0:2286"], bw.texts["0:2295"], bw.texts["0:2302"]], realCopy.cards.slice(0, 3).map(card => card.body), `${where}: 동네 가게 cards keep descriptions`);
};
const start = applyHomepageCopy(local, withKnownPrice(realCopy, "4,500원"), { industry: "제과점", now: "2026-10-22T04:00:00.000Z" });
checkDesign(start, "start");
// 다섯 디자인을 한 바퀴 돌고 처음으로
let tour = start;
for (const page of [...designs.slice(1), "0-2226"]) { tour = switchHomepageDesign(tour, page, build(page)); checkDesign(tour, `tour→${page}`); }
// 각 디자인에 다녀오기(동네 가게 → X → 동네 가게), 그리고 편집기 안에서 바꾸기
for (const page of designs.slice(1)) {
  const away = switchHomepageDesign(start, page, build(page));
  checkDesign(away, `→${page}`);
  checkDesign(switchHomepageDesign(away, "0-2226", build("0-2226")), `${page}→0-2226`);
  const editorAway = carryCopyToDesign(start.pageData!, start.pageData!.brainwave!, build(page)(start));
  const editorBack = carryCopyToDesign({ ...start.pageData!, brainwave: editorAway }, editorAway, build("0-2226")(start));
  assert.deepEqual([editorBack.texts["0:2286"], editorBack.texts["0:2295"], editorBack.texts["0:2302"]], realCopy.cards.slice(0, 3).map(card => card.body), `editor ${page}→0-2226 keeps descriptions`);
}
// 사장님이 상담 서비스에서 카드 이름을 고쳐도 짝 설명은 따라간다
const consult = switchHomepageDesign(start, "0-290", build("0-290"));
consult.pageData!.brainwave!.texts["0:380"] = "새벽에 구운 빵";
const consultBack = switchHomepageDesign(consult, "0-2226", build("0-2226"));
assert.equal(consultBack.pageData!.brainwave!.texts["0:2294"], "새벽에 구운 빵");
assert.equal(consultBack.pageData!.brainwave!.texts["0:2295"], realCopy.cards[1].body, "an edited card name keeps its description");

// 8) 빵집 사진 — 가격표(€)가 보이던 첫 화면 사진과, '소금빵' 카드에 붙던 크루아상 사진을 쓰지 않는다
const bakery = photoSetFor("동네 빵집")!;
assert.ok(!bakery.hero.includes("1517433670267"), "hero without foreign price tags");
assert.ok(![...bakery.cards].some(url => url.includes("1555507036") || url.includes("1571115177098")), "generic bread photos on menu cards");

// 5·6) 공개 전 '채울 것' — 동네 가게의 영업시간, 설명 같은 가게 이름(이름 후보가 있을 때만)
assert.ok(homepageMissingInfo(filled).includes("영업시간"), "hours are listed when the visit section is shown");
assert.ok(homepageMissingInfo(filled).includes("사업장 주소"));
assert.ok(!homepageMissingInfo({ ...filled, openHours: "매일 07:00–11:00" }).includes("영업시간"));
assert.ok(!homepageMissingInfo(toShop).includes("영업시간"), "designs without an hours section do not ask");
assert.equal(looksDescriptiveName("아파트 상가 아침 빵집"), true);
assert.equal(looksDescriptiveName("소금빵집 하루"), false);
assert.ok(homepageMissingInfo(filled, { nameCandidates: true }).includes(DESCRIPTIVE_NAME_ITEM));
assert.ok(!homepageMissingInfo(filled).includes(DESCRIPTIVE_NAME_ITEM), "without name candidates the name is not flagged");

console.log("homepage-design-carry: AI copy carried across designs and back, known price on menu, walk-in CTA, bakery photos, pre-publish checks");
