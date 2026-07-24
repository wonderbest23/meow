import { z } from "zod";

export const landingBlockTypes = [
  "HeroSection",
  "TrustBar",
  "FeatureGrid",
  "ProcessSteps",
  "StorySection",
  "StatsSection",
  "GallerySection",
  "OfferSection",
  "CtaSection",
] as const;

export type LandingBlockType = (typeof landingBlockTypes)[number];

const primitiveProp = z.union([z.string().max(900_000), z.number(), z.boolean(), z.null()]);

export const landingPageDataSchema = z.object({
  root: z.object({
    props: z.record(z.string(), primitiveProp).optional(),
  }).passthrough(),
  content: z.array(z.object({
    type: z.enum(landingBlockTypes),
    props: z.record(z.string(), primitiveProp),
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
    title: `선택 이유 ${index + 1}`,
    description: "고객이 얻는 결과를 쉬운 문장으로 알려주세요.",
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
      intro: "고객이 바로 이해할 수 있는 핵심 장점을 세 가지로 정리했습니다.",
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
    cta: {
      eyebrow: "지금 시작하기",
      title: "궁금한 내용을 편하게 알려주세요",
      description: "남겨주신 내용을 확인한 뒤 필요한 다음 단계를 안내합니다.",
      buttonLabel: seed.ctaLabel,
    },
  };
}

export function createLandingPageData(seed: LandingPageSeed, templateId: string): LandingPageData {
  const value = shared(seed);
  const proof = seed.proofItems;
  const trust = block("TrustBar", `trust-${templateId}`, {
    label: "고객이 확인할 수 있는 내용",
    item1: proof[0] ?? "제공 범위를 먼저 안내합니다",
    item2: proof[1] ?? "진행 단계를 쉽게 설명합니다",
    item3: proof[2] ?? "문의 후 조건을 확정합니다",
    item4: "모바일에서도 편하게 확인",
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
    heading: "복잡한 설명보다 분명한 진행",
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
    eyebrow: "서비스 미리보기",
    heading: "이런 경험을 제공합니다",
    image1: seed.heroImageUrl,
    caption1: seed.benefits[0]?.title ?? "첫 번째 경험",
    image2: "",
    caption2: seed.benefits[1]?.title ?? "두 번째 경험",
    image3: "",
    caption3: seed.benefits[2]?.title ?? "세 번째 경험",
  });
  const cta = block("CtaSection", `cta-${templateId}`, value.cta);

  const heroLayout: Record<string, string> = {
    service: "split",
    local: "immersive",
    product: "product",
    class: "course",
    tech: "tech",
    creator: "editorial",
    wellness: "immersive",
    editorial: "editorial",
  };
  const hero = block("HeroSection", `hero-${templateId}`, {
    ...value.hero,
    layout: heroLayout[templateId] ?? "split",
  });

  const layouts: Record<string, LandingPageData["content"]> = {
    service: [hero, trust, feature, process, offer, cta],
    local: [hero, trust, gallery, feature, offer, cta],
    product: [hero, offer, stats, feature, gallery, cta],
    class: [hero, feature, process, stats, offer, cta],
    tech: [hero, stats, feature, process, offer, cta],
    creator: [hero, gallery, story, feature, cta],
    wellness: [hero, trust, feature, gallery, offer, cta],
    editorial: [hero, story, stats, feature, offer, cta],
  };
  return landingPageDataSchema.parse({
    root: { props: { title: seed.businessName } },
    content: layouts[templateId] ?? layouts.service,
  });
}

export function syncLandingPageData(
  data: LandingPageData,
  seed: LandingPageSeed,
  changedKeys: string[],
): LandingPageData {
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
      if (component.type === "TrustBar" && changed.has("proofItems")) {
        [0, 1, 2].forEach((index) => {
          props[`item${index + 1}`] = seed.proofItems[index] ?? "";
        });
      }
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
