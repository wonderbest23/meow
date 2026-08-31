import { z } from "zod";
import { kitForTemplate, type LandingKitId } from "./kits";
import { BRAINWAVE_DEFAULT_FOR_TEMPLATE } from "./brainwave/catalog";

export const landingBlockTypes = [
  "HeroSection",
  "TrustBar",
  "FeatureGrid",
  "ProcessSteps",
  "StorySection",
  "StatsSection",
  "GallerySection",
  "OfferSection",
  /*
   * 아래 셋은 홈페이지 제작 서비스들의 업종별 템플릿이 공통으로 두는 자리다.
   * 음식점은 '메뉴·가격'과 '위치·영업시간'을, 앱·서비스는 '요금'과 'FAQ'를
   * 반드시 담는다. 없으면 방문자가 결정을 못 한다.
   */
  "PriceList",
  "LocationSection",
  "FaqSection",
  "CtaSection",
  /*
   * 나중에 더한 칸들. 여기 없으면 그 칸이 든 페이지는 통째로 불러오지 못한다 —
   * 블록을 새로 만들 때 이 목록에 넣는 것을 잊으면 안 된다.
   */
  "FooterSection",
  "PhotoGrid",
  "PhotoBlock",
  /*
   * Brainwave.io 킷에서 가져온 칸들(lib/landing/kits.ts).
   * 알림 띠(Alert) · 영상(Video) · 후기(Testimonial) — 킷의 9개 배치 중
   * 8개가 후기를 두고, 셋이 영상을, 둘이 알림 띠를 둔다.
   */
  "AlertBar",
  "VideoSection",
  "ReviewSection",
] as const;

export type LandingBlockType = (typeof landingBlockTypes)[number];

const primitiveProp = z.union([z.string().max(900_000), z.number(), z.boolean(), z.null()]);

/*
 * 칸 안에 다른 칸이 들어가는 자리(slot).
 *
 * '사진 여러 장' 안의 사진들, 첫 화면에 끌어다 놓은 사진이 여기 담긴다. 값이
 * 배열이라 위의 primitiveProp 만으로는 통과하지 못하고, 그러면 페이지를 아예
 * 불러오지 못한다.
 *
 * 안에 든 것은 다시 이 스키마로 재귀 검사하지 않는다 — 전체 크기 제한(4MB)이
 * 아래 superRefine 에서 걸리므로 여기서 깊이를 더 파고들 이유가 없다.
 */
const slotProp = z.array(z.unknown()).max(64);
const blockProp = z.union([primitiveProp, slotProp]);

/*
 * Brainwave.io 킷 페이지(노드 그대로).
 *
 * page 는 lib/landing/brainwave/catalog.ts 의 id, texts/images 는 노드 id → 바꾼 값.
 * 이 값이 있으면 content(블록)는 쓰지 않는다 — 페이지는 킷 트리가 그린다.
 */
export const brainwaveDataSchema = z.object({
  page: z.string().regex(/^[0-9]+-[0-9]+$/),
  texts: z.record(z.string(), z.string().max(4000)).default({}),
  images: z.record(z.string(), z.string().max(900_000)).default({}),
  /*
   * 버튼 노드 id → 누르면 하는 일. 없으면 "contact"(아래 문의 양식으로).
   * "none" 은 아무 동작 없음, 그 밖은 주소(https/tel/mailto)다.
   */
  links: z.record(z.string(), z.string().max(600)).default({}),
  /*
   * 글 자리 id → 글씨 크기 배율.
   * 자유 크기가 아니라 프리셋(0.85·1.15·1.3)만 쓴다 — 킷의 절대좌표 칸을
   * 크게 벗어나면 글이 잘리므로, 디자인이 버티는 범위로 못박는다.
   */
  sizes: z.record(z.string(), z.number().min(0.7).max(1.5)).default({}),
  /*
   * 숨긴 자리(노드 id 목록) — '삭제'는 킷 트리를 지우는 게 아니라 안 그리는 것이다.
   * 섹션 id 면 하위 전부가 숨고, 데스크톱은 아래 섹션들이 그만큼 올라온다.
   */
  hidden: z.array(z.string().max(80)).max(500).default([]),
});
export type BrainwaveData = z.infer<typeof brainwaveDataSchema>;

export const landingPageDataSchema = z.object({
  brainwave: brainwaveDataSchema.optional(),
  root: z.object({
    props: z.record(z.string(), blockProp).optional(),
  }).passthrough(),
  content: z.array(z.object({
    type: z.enum(landingBlockTypes),
    props: z.record(z.string(), blockProp),
  }).passthrough()).max(32),
  zones: z.record(z.string(), z.array(z.unknown())).optional(),
}).superRefine((value, context) => {
  if (JSON.stringify(value).length > 4_000_000) {
    context.addIssue({
      code: "custom",
      message: "페이지 이미지와 섹션 데이터가 너무 큽니다. 이미지 크기를 줄여주세요.",
    });
  }
});

export type LandingPageData = z.infer<typeof landingPageDataSchema>;

export type LandingPageSeed = {
  businessName: string;
  heroLabel: string;
  headline: string;
  subheadline: string;
  ctaLabel: string;
  heroImageUrl: string;
  offerTitle: string;
  offerDescription: string;
  priceLabel: string;
  benefits: Array<{ title: string; description: string }>;
  proofItems: string[];
  /* 찾아오는 길 — 계획서에서 확인된 것만 채운다. 없으면 그 칸을 통째로 뺀다 */
  businessAddress?: string;
  openHours?: string;
};

function block<T extends Record<string, string | number | boolean | null>>(
  type: LandingBlockType,
  id: string,
  props: T,
) {
  return { type, props: { id, ...props } };
}

function benefits(seed: LandingPageSeed) {
  return [0, 1, 2].map((index) => seed.benefits[index] ?? {
    title: "직접 상담합니다",
    description: "남겨주신 문의는 담당자가 직접 확인하고 답변드립니다.",
  });
}

function shared(seed: LandingPageSeed) {
  const items = benefits(seed);
  return {
    hero: {
      eyebrow: seed.heroLabel,
      title: seed.headline,
      description: seed.subheadline,
      buttonLabel: seed.ctaLabel,
      imageUrl: seed.heroImageUrl,
    },
    features: {
      eyebrow: "선택하는 이유",
      heading: `${seed.businessName}이 필요한 순간`,
      intro: "많은 분들이 이런 이유로 찾아주십니다.",
      title1: items[0].title,
      body1: items[0].description,
      title2: items[1].title,
      body2: items[1].description,
      title3: items[2].title,
      body3: items[2].description,
    },
    offer: {
      eyebrow: "대표 상품",
      title: seed.offerTitle,
      description: seed.offerDescription,
      price: seed.priceLabel,
      buttonLabel: seed.ctaLabel,
    },
    /*
     * 마지막 문의 칸.
     *
     * 예전에는 "남겨주신 내용을 확인한 뒤 필요한 다음 단계를 안내합니다" 같은
     * 문장이 박혀 있었다. 어느 사업에 붙여도 말이 되는 문장은 방문자에게
     * 아무것도 알려주지 않고, 이 페이지를 기계가 찍어냈다는 인상만 준다.
     * 사업 이름과 실제 상품을 넣어 '누구에게 무엇을 묻는 칸'인지 밝힌다.
     *
     * 없는 사실을 지어내지는 않는다 — 여기 들어가는 건 이미 사용자가 답한
     * 상호명과 상품뿐이다.
     */
    cta: {
      eyebrow: "문의하기",
      title: `${seed.businessName}에 문의해 보세요`,
      description: seed.offerTitle
        ? `${seed.offerTitle} 관련 문의를 남겨주시면 연락처로 답변드립니다.`
        : "궁금한 점을 남겨주시면 연락처로 답변드립니다.",
      buttonLabel: seed.ctaLabel,
    },
  };
}

/*
 * 가격 답변은 보통 "중형 꽃다발 25,000원"처럼 이름과 금액이 한 줄로 온다.
 *
 * 그대로 두면 메뉴 이름 칸에는 대표 상품 문구가("밤에도 문 여는 무인 꽃집"),
 * 가격 칸에는 이름과 금액이 함께 들어간다. 메뉴판에 가게 소개가 품목으로 올라간
 * 꼴이라 손님은 뭘 얼마에 파는지 알 수 없다.
 *
 * 금액 앞에 이름이 붙어 있으면 그쪽을 품목으로 올린다. 금액만 적혀 있거나
 * "가격 상담"처럼 숫자가 없으면 건드리지 않는다 — 쪼갤 근거가 없으면 그대로 둔다.
 */
function splitMenuLine(label: string, fallbackName: string): { name: string; price: string } {
  const hit = label.match(/^(.+?)\s*([\d,]+\s*원.*)$/);
  // 앞부분이 숫자·쉼표뿐이면 금액을 잘못 자른 것이다("25,000원" → "2" + "5,000원")
  if (hit && /[^\d,\s]/.test(hit[1])) return { name: hit[1].trim(), price: hit[2].trim() };
  return { name: fallbackName, price: label };
}

/**
 * @param kitOverride 킷을 직접 고를 때(개발용 미리보기·나중의 킷 고르기 화면).
 *                    없으면 업종 템플릿에 맞는 킷을 쓴다.
 */
export function createLandingPageData(seed: LandingPageSeed, templateId: string, kitOverride?: LandingKitId): LandingPageData {
  /*
   * 새 홈페이지는 Brainwave.io 킷 페이지를 노드 그대로 쓴다.
   *
   * 사용자 지시: "오차 없이 그대로 가져오고, 그 안에서 글·사진만 고친다" —
   * 계획서 내용을 킷 자리에 끼워 맞추지 않는다(내가 임의로 대입하지 않는다).
   * 킷의 글이 그대로 들어 있고, 편집기에서 자리마다 바꾼다.
   * 아래 블록 조립(kit 배치)은 brainwave 값이 없는 옛 페이지를 위해 남겨 둔다.
   */
  if (!kitOverride) {
    return landingPageDataSchema.parse({
      brainwave: { page: BRAINWAVE_DEFAULT_FOR_TEMPLATE[templateId] ?? "0-290", texts: {}, images: {}, links: {}, sizes: {}, hidden: [] },
      root: { props: { title: seed.businessName } },
      content: [],
    });
  }
  const value = shared(seed);
  const menu = splitMenuLine(seed.priceLabel, seed.offerTitle);
  /* 손님이 오기 전에 확인하는 것 — 아는 것만, 아는 순서대로 */
  const visitFacts = [
    seed.businessAddress ? `${seed.businessAddress}에서 운영합니다` : "",
    seed.openHours ? `${seed.openHours} 문 엽니다` : "",
  ].filter(Boolean);
  // 하나도 모르면 띠가 제목만 남는다 — 그때만 응대 약속을 세운다
  const trustItems = visitFacts.length ? visitFacts : ["문의 주시면 바로 안내해 드립니다"];

  const trust = block("TrustBar", `trust-${templateId}`, {
    label: "믿고 맡기셔도 됩니다",
    /*
     * 손님이 오기 전에 확인하는 것만 싣는다 — 어디인지, 언제 여는지, 얼마인지.
     *
     * 예전에는 두 종류의 남의 말이 들어와 있었다. 하나는 "모바일에서도 편하게
     * 확인" 같은 채움말로, 어느 가게에 붙여도 말이 되니 알려주는 게 없었다.
     * 다른 하나는 계획서의 실적("실제 판매·매출 발생")인데, 그건 사업을 심사하는
     * 사람에게 보이려고 쓴 말이지 손님이 알 바가 아니다.
     *
     * 아는 사실 하나가 지어낸 넷보다 낫다. 남는 칸은 그리지 않고, 사업주가 채운다.
     */
    item1: trustItems[0] ?? "",
    item2: trustItems[1] ?? "",
    item3: "",
    item4: "",
  });
  const feature = block("FeatureGrid", `features-${templateId}`, value.features);
  const offer = block("OfferSection", `offer-${templateId}`, value.offer);
  const process = block("ProcessSteps", `process-${templateId}`, {
    eyebrow: "이용 방법",
    heading: "세 단계면 충분합니다",
    step1Title: "문의 남기기",
    step1Body: "필요한 내용과 현재 상황을 알려주세요.",
    step2Title: "조건 확인하기",
    step2Body: "제공 범위, 일정과 금액을 함께 확인합니다.",
    step3Title: "서비스 시작하기",
    step3Body: "확정한 내용에 맞춰 진행하고 결과를 안내합니다.",
  });
  const stats = block("StatsSection", `stats-${templateId}`, {
    heading: "진행은 이렇게 됩니다",
    value1: "01",
    label1: "필요 확인",
    value2: "02",
    label2: "조건 안내",
    value3: "03",
    label3: "실행 시작",
  });
  const story = block("StorySection", `story-${templateId}`, {
    eyebrow: "브랜드 이야기",
    title: `${seed.businessName}은 고객의 실제 불편에서 시작합니다`,
    body: seed.subheadline,
    imageUrl: seed.heroImageUrl,
    imageSide: templateId === "editorial" ? "left" : "right",
  });
  const gallery = block("GallerySection", `gallery-${templateId}`, {
    eyebrow: "둘러보기",
    heading: "이런 모습입니다",
    /*
     * 첫 화면 사진을 여기 다시 쓰지 않는다.
     *
     * 예전에는 그렇게 채웠는데, 사진이 그것 하나뿐이라 "사진 3장" 칸에 첫 화면과
     * 똑같은 사진이 한 장만 덩그러니 놓였다. 같은 사진을 두 번 본 손님에게는
     * 보여줄 게 없는 가게로 읽힌다. 사진은 사업주가 넣는다 — 그때까지 이 칸은
     * 통째로 나오지 않는다.
     */
    image1: "",
    caption1: seed.benefits[0]?.title ?? "첫 번째 경험",
    image2: "",
    caption2: seed.benefits[1]?.title ?? "두 번째 경험",
    image3: "",
    caption3: seed.benefits[2]?.title ?? "세 번째 경험",
  });
  const cta = block("CtaSection", `cta-${templateId}`, value.cta);

  /*
   * 아래 셋은 업종별 템플릿의 필수 자리다(홈페이지 제작 서비스 공통).
   * 값은 계획서 답변에서 가져온 것만 채우고, 없으면 사업주가 채우도록 비워 둔다.
   */
  const price = block("PriceList", `price-${templateId}`, {
    eyebrow: "메뉴와 가격",
    /*
     * 제목은 이 칸이 무슨 칸인지가 아니라 누구네 가격인지를 말한다.
     * "무엇을 얼마에 드리는지"는 홈페이지를 만드는 사람 쪽 언어였다 —
     * 위에 이미 "메뉴와 가격"이라고 붙여 놓고 그 말을 한 번 더 풀어 쓴 셈이라,
     * 손님은 두 줄을 읽고도 새로 아는 게 없었다.
     */
    heading: `${seed.businessName} 가격 안내`,
    name1: menu.name,
    desc1: seed.offerDescription,
    price1: menu.price,
    /*
     * 계획서에서 확인되는 상품은 '대표 상품' 하나뿐이다.
     * 나머지를 '선택 이유'로 채우면 이름과 설명이 같은 줄이 생기고,
     * 무엇보다 팔지 않는 것을 메뉴에 올리게 된다 — 비워서 사업주가 채운다.
     */
    name2: "",
    desc2: "",
    price2: "",
    name3: "",
    desc3: "",
    price3: "",
    note: "가격과 구성은 상황에 따라 달라질 수 있습니다.",
  });
  const location = block("LocationSection", `location-${templateId}`, {
    eyebrow: "찾아오는 길",
    heading: "매장 위치와 영업시간",
    address: seed.businessAddress ?? "",
    hours: seed.openHours ?? "",
    closed: "",
    contact: "",
  });
  const faq = block("FaqSection", `faq-${templateId}`, {
    eyebrow: "자주 묻는 질문",
    heading: "문의 전에 확인해 보세요",
    q1: "문의하면 언제 답변받을 수 있나요?",
    a1: "남겨주신 연락처로 확인한 뒤 순서대로 안내해 드립니다.",
    q2: "어떤 내용을 남기면 되나요?",
    a2: "필요하신 내용과 연락 가능한 시간을 함께 남겨주시면 더 빠르게 안내해 드립니다.",
    q3: "",
    a3: "",
  });

  /*
   * 첫 화면 배치는 킷 샘플에 가장 가까운 뼈대를 고른다 — 나머지 차이(바탕색·
   * 둥글기·글자 크기)는 .kit-* CSS 가 입힌다.
   *   consult 사진 위 흰 글 / cowork 어두운 사진 / shop 둥근 검정 상자 → immersive
   *   agency·saas·app·b2b 사진 옆 글 → split / webapp 어두운 분할 → tech
   *   product 상품 사진 → product
   */
  const kitHero: Record<string, string> = {
    consult: "immersive", cowork: "immersive", shop: "immersive",
    agency: "split", saas: "split", app: "split", b2b: "split",
    webapp: "tech", product: "product",
  };
  const heroKit = kitOverride ?? kitForTemplate[templateId] ?? "consult";
  const hero = block("HeroSection", `hero-${templateId}`, {
    ...value.hero,
    layout: kitHero[heroKit] ?? "split",
  });

  /*
   * 업종마다 방문자가 확인하는 순서가 다르다.
   *  - 동네 매장·음식점: 무엇을 파는지(메뉴·가격) → 어디로 가면 되는지(위치)
   *  - 앱·플랫폼: 무엇이 되는지(기능) → 얼마인지(요금) → 걸리는 점(FAQ)
   *  - 수업·예약: 어떻게 진행되는지 → 얼마인지 → 궁금한 점
   */
  /*
   * 킷에서 가져온 칸들.
   *
   * 후기는 비워 둔다 — 받은 적 없는 후기를 지어 넣을 수는 없다. 사업주가
   * 채우기 전까지 이 칸은 공개 화면에 나오지 않는다(갤러리와 같은 규칙).
   * 알림 띠는 대표 상품 한 줄로, 영상은 주소를 넣기 전까지 나오지 않는다.
   */
  const alert = block("AlertBar", `alert-${templateId}`, {
    tag: "안내",
    text: seed.offerTitle ? `${seed.offerTitle} — 지금 문의하실 수 있습니다.` : "지금 문의하실 수 있습니다.",
    linkLabel: seed.ctaLabel,
  });
  const video = block("VideoSection", `video-${templateId}`, {
    heading: `${seed.businessName}을 1분 영상으로 만나보세요`,
    description: "",
    videoUrl: "",
    posterUrl: seed.heroImageUrl,
  });
  const reviews = block("ReviewSection", `reviews-${templateId}`, {
    eyebrow: "고객 후기",
    heading: "이용하신 분들의 이야기",
    quote1: "", name1: "", role1: "",
    quote2: "", name2: "", role2: "",
    quote3: "", name3: "", role3: "",
  });

  /*
   * 킷의 9개 샘플이 섹션을 쌓은 순서 그대로다(lib/landing/kits.ts 머리말).
   * 헤더·푸터는 공개 페이지 껍데기가 그리므로 뺐고, 킷의 'CTA Form' 은
   * 공개 페이지의 문의 양식(#landing-contact)이 그 모양을 입는다.
   *
   *  consult  08: Hero → Facts → Services → Content → Alert → Testimonial → (Form)
   *  agency   01: Hero → Services → Testimonial → About → Facts → Features → Works
   *  saas     02: Hero → Features → Content → Facts → Content → Testimonial → Pricing → FAQ → CTA
   *  cowork   03: Hero → Facts → Locations → Content → Features → Content → Subscribe
   *  webapp   05: Hero → Features → Content×3 → Pricing
   *  shop     06: Hero → Category → All Items → Content → Testimonial → CTA
   *  app      07: Hero → Content×2 → How → Video → Features → Testimonial → Pricing
   *  product  09: Hero → Content×3 → Pricing → CTA Image
   *  b2b      10: Hero → Alert → Content → Services → Video → Testimonial → CTA
   */
  const kit = kitOverride ?? kitForTemplate[templateId] ?? "consult";
  const kitLayouts: Record<string, LandingPageData["content"]> = {
    consult: [hero, stats, feature, story, alert, reviews, price, faq, cta],
    agency:  [hero, feature, reviews, story, stats, process, gallery, price, cta],
    saas:    [hero, trust, story, stats, feature, reviews, price, faq, cta],
    cowork:  [hero, stats, location, story, trust, gallery, price, faq, cta],
    webapp:  [hero, trust, story, feature, process, price, faq, cta],
    shop:    [hero, feature, offer, price, story, reviews, gallery, cta],
    app:     [hero, story, feature, process, video, reviews, price, faq, cta],
    product: [hero, offer, story, feature, price, reviews, cta],
    b2b:     [hero, alert, story, feature, video, reviews, process, price, cta],
  };
  /*
   * 찾아오는 길은 주소를 모르면 뺀다.
   * 예전에는 "주소를 입력하세요"가 그대로 손님 화면에 섰다 — 편집자에게 하는
   * 말이 방문자에게 보이면, 그 페이지는 미완성으로 읽힌다. 빈 칸을 남기느니
   * 없는 칸으로 두고, 주소를 채우면 그때 나타나게 한다.
   */
  const chosen = (kitLayouts[kit] ?? kitLayouts.consult).filter(
    (item) => item !== location || Boolean(seed.businessAddress?.trim()),
  );
  return landingPageDataSchema.parse({
    root: { props: { title: seed.businessName, kit, accent: "#473bf0" } },
    content: chosen,
  });
}

export function syncLandingPageData(
  data: LandingPageData,
  seed: LandingPageSeed,
  changedKeys: string[],
): LandingPageData {
  /* 킷 페이지는 폼 값을 받아 쓰지 않는다 — 글은 페이지 위에서 직접 고친다 */
  if (data.brainwave) return data;
  const changed = new Set(changedKeys);
  const items = benefits(seed);
  return landingPageDataSchema.parse({
    ...data,
    root: {
      ...data.root,
      props: {
        ...data.root.props,
        ...(changed.has("businessName") ? { title: seed.businessName } : {}),
      },
    },
    content: data.content.map((component) => {
      const props = { ...component.props };
      if (component.type === "HeroSection") {
        if (changed.has("heroLabel")) props.eyebrow = seed.heroLabel;
        if (changed.has("headline")) props.title = seed.headline;
        if (changed.has("subheadline")) props.description = seed.subheadline;
        if (changed.has("ctaLabel")) props.buttonLabel = seed.ctaLabel;
        if (changed.has("heroImageUrl")) props.imageUrl = seed.heroImageUrl;
      }
      if (component.type === "FeatureGrid" && changed.has("benefits")) {
        items.forEach((item, index) => {
          props[`title${index + 1}`] = item.title;
          props[`body${index + 1}`] = item.description;
        });
      }
      /*
       * 신뢰 띠는 더 이상 계획서 실적을 받지 않는다. 예전 연결을 남겨 두면
       * 실적이 비워질 때 사업주가 직접 적어 넣은 문구까지 같이 지워진다.
       */
      if (component.type === "OfferSection") {
        if (changed.has("offerTitle")) props.title = seed.offerTitle;
        if (changed.has("offerDescription")) props.description = seed.offerDescription;
        if (changed.has("priceLabel")) props.price = seed.priceLabel;
        if (changed.has("ctaLabel")) props.buttonLabel = seed.ctaLabel;
      }
      if (component.type === "CtaSection" && changed.has("ctaLabel")) {
        props.buttonLabel = seed.ctaLabel;
      }
      return { ...component, props };
    }),
  });
}
