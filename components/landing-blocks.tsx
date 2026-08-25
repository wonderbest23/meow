"use client";

import { ArrowRight, Check } from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { Config, Slot } from "@puckeditor/core";
import type { LandingPageData } from "../lib/landing/page-data";
import { LandingMediaField } from "./landing-media-field";
import { isLandingKit, landingKitOptions } from "../lib/landing/kits";
import { BrainwavePage, type BrainwavePageData } from "./brainwave-page";

type HeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  buttonLabel: string;
  imageUrl: string;
  layout: "split" | "immersive" | "product" | "course" | "tech" | "editorial";
  photo: Slot;
} & BlockStyle;
type TrustProps = { label: string; item1: string; item2: string; item3: string; item4: string } & BlockStyle;
type FeatureProps = {
  eyebrow: string;
  heading: string;
  intro: string;
  title1: string;
  body1: string;
  title2: string;
  body2: string;
  title3: string;
  body3: string;
} & BlockStyle;
type ProcessProps = {
  eyebrow: string;
  heading: string;
  step1Title: string;
  step1Body: string;
  step2Title: string;
  step2Body: string;
  step3Title: string;
  step3Body: string;
} & BlockStyle;
type StoryProps = {
  eyebrow: string;
  title: string;
  body: string;
  imageUrl: string;
  imageSide: "left" | "right";
} & BlockStyle;
type StatsProps = {
  heading: string;
  value1: string;
  label1: string;
  value2: string;
  label2: string;
  value3: string;
  label3: string;
} & BlockStyle;
type GalleryProps = {
  eyebrow: string;
  heading: string;
  image1: string;
  caption1: string;
  image2: string;
  caption2: string;
  image3: string;
  caption3: string;
} & BlockStyle;
type OfferProps = { eyebrow: string; title: string; description: string; price: string; buttonLabel: string } & BlockStyle;
type BlockStyle = { tone?: string; density?: string; align?: string; divider?: string; motion?: string; bgImage?: string; bgShade?: string; bgPosition?: string; bgZoom?: string };
type CtaProps = { eyebrow: string; title: string; description: string; buttonLabel: string } & BlockStyle;
type PhotoProps = { imageUrl: string; caption: string; shape: string; size: string; fit: string };
type PhotoGridProps = { eyebrow: string; heading: string; columns: string; photos: Slot } & BlockStyle;
type FooterProps = { brand: string; tagline: string; hours: string; contact: string } & BlockStyle;
/* Brainwave.io 킷에서 가져온 칸들 */
type AlertProps = { tag: string; text: string; linkLabel: string } & BlockStyle;
type VideoProps = { heading: string; description: string; videoUrl: string; posterUrl: string } & BlockStyle;
type ReviewProps = {
  eyebrow: string;
  heading: string;
  quote1: string; name1: string; role1: string;
  quote2: string; name2: string; role2: string;
  quote3: string; name3: string; role3: string;
} & BlockStyle;

export type LandingBlockProps = {
  HeroSection: HeroProps;
  TrustBar: TrustProps;
  FeatureGrid: FeatureProps;
  ProcessSteps: ProcessProps;
  StorySection: StoryProps;
  StatsSection: StatsProps;
  GallerySection: GalleryProps;
  OfferSection: OfferProps;
  PriceList: PriceListProps;
  LocationSection: LocationProps;
  FaqSection: FaqProps;
  CtaSection: CtaProps;
  FooterSection: FooterProps;
  PhotoBlock: PhotoProps;
  PhotoGrid: PhotoGridProps;
  AlertBar: AlertProps;
  VideoSection: VideoProps;
  ReviewSection: ReviewProps;
};

type PriceListProps = {
  eyebrow: string;
  heading: string;
  name1: string; desc1: string; price1: string;
  name2: string; desc2: string; price2: string;
  name3: string; desc3: string; price3: string;
  note: string;
} & BlockStyle;

type LocationProps = {
  eyebrow: string;
  heading: string;
  address: string;
  hours: string;
  closed: string;
  contact: string;
} & BlockStyle;

type FaqProps = {
  eyebrow: string;
  heading: string;
  q1: string; a1: string;
  q2: string; a2: string;
  q3: string; a3: string;
} & BlockStyle;

const imageField = (label: string) => ({
  type: "custom" as const,
  label,
  render: ({ value, onChange }: { value: unknown; onChange: (value: string) => void }) => (
    <LandingMediaField
      label={label}
      description="사진을 누르면 내 이미지로 바꿀 수 있습니다."
      value={typeof value === "string" ? value : ""}
      kind="hero"
      onChange={onChange}
    />
  ),
});

/*
 * 블록마다 고르는 겉모습.
 *
 * 블록별로 고유한 값을 만들면 조합이 폭발해 사람도 AI도 고르지 못한다.
 * 모든 블록이 같은 네 가지만 나눠 쓴다 — 이 넷만 달라도 같은 블록이 전혀
 * 다른 자리처럼 읽힌다.
 *
 * 값은 감싸는 section의 클래스로만 나간다. 블록마다 CSS를 새로 짜지 않고
 * globals.css의 tone-* / density-* / align-* 규칙 한 벌을 함께 쓴다.
 */
const styleFields = {
  tone: { type: "select" as const, label: "배경", options: [
    { label: "기본", value: "plain" }, { label: "연한 색", value: "soft" },
    { label: "강조색", value: "accent" }, { label: "어둡게", value: "dark" },
  ] },
  density: { type: "select" as const, label: "여백", options: [
    { label: "좁게", value: "tight" }, { label: "보통", value: "normal" }, { label: "넉넉히", value: "roomy" },
  ] },
  align: { type: "select" as const, label: "정렬", options: [
    { label: "왼쪽", value: "left" }, { label: "가운데", value: "center" },
  ] },
  divider: { type: "select" as const, label: "위쪽 구분선", options: [
    { label: "없음", value: "none" }, { label: "선", value: "line" },
  ] },
  /*
   * 스크롤해서 이 칸이 보일 때 한 번 움직인다.
   *
   * 움직임에 어지러움을 느끼는 사람이 있다. 기기에서 '동작 줄이기'를 켜 두면
   * 어떤 값을 골라도 아예 움직이지 않는다 — CSS 쪽에서 막는다.
   */
  bgImage: imageField("배경 사진"),
  /*
   * 배경 사진 위 글이 안 읽히는 일을 막는 막.
   *
   * 사진을 깔면 밝은 부분에서 흰 글씨가, 어두운 부분에서 검은 글씨가 사라진다.
   * 사진마다 다르니 자동으로 정할 수 없다 — 고르게 한다. 사진이 없으면 아무
   * 일도 하지 않는다.
   */
  /*
   * 사진이 칸에 잘려 들어갈 때 어디를 보여줄지.
   *
   * 사진은 칸 비율에 맞춰 잘린다. 무엇이 잘릴지는 사진마다 다른데 고를 방법이
   * 없어서, 인물이 잘리거나 간판이 사라져도 손댈 수 없었다.
   */
  bgPosition: { type: "select" as const, label: "사진 위치", options: [
    { label: "가운데", value: "center" }, { label: "위쪽", value: "top" },
    { label: "아래쪽", value: "bottom" }, { label: "왼쪽", value: "left" },
    { label: "오른쪽", value: "right" },
  ] },
  bgZoom: { type: "select" as const, label: "사진 확대", options: [
    { label: "칸에 꽉 채우기", value: "cover" }, { label: "잘리지 않게 전부", value: "contain" },
    { label: "크게 (120%)", value: "z120" }, { label: "더 크게 (150%)", value: "z150" },
  ] },
  bgShade: { type: "select" as const, label: "사진 덮기", options: [
    { label: "없음", value: "none" }, { label: "옅게", value: "light" },
    { label: "보통", value: "medium" }, { label: "진하게", value: "heavy" },
  ] },
  motion: { type: "select" as const, label: "등장 효과", options: [
    { label: "없음", value: "none" }, { label: "서서히", value: "fade" },
    { label: "아래에서 위로", value: "up" }, { label: "좌우에서", value: "side" },
  ] },
};

const styleDefaults = { tone: "plain", density: "normal", align: "center", divider: "none", motion: "none", bgImage: "", bgShade: "medium", bgPosition: "center", bgZoom: "cover" };

/*
 * 이미 저장된 페이지에는 이 값들이 없다 — 없으면 기본값으로 읽는다.
 * 안 그러면 class="tone-undefined"가 되어 아무 규칙에도 안 걸린다.
 */
function styleClass(p: BlockStyle) {
  const bg = p.bgImage ? ` has-bg shade-${p.bgShade ?? "medium"} bgpos-${p.bgPosition ?? "center"} bgzoom-${p.bgZoom ?? "cover"}` : "";
  return `tone-${p.tone ?? "plain"} density-${p.density ?? "normal"} align-${p.align ?? "center"} divider-${p.divider ?? "none"} motion-${p.motion ?? "none"}${bg}`;
}

/*
 * 배경 사진 주소는 클래스로 나갈 수 없어 style 로 넘긴다.
 * 값이 없으면 아무것도 안 붙인다 — 빈 url() 이 나가면 브라우저가 현재 주소를
 * 사진으로 여겨 헛요청을 보낸다.
 */
function blockBg(p: BlockStyle) {
  if (!p.bgImage) return undefined;
  return { "--block-bg": `url("${p.bgImage.replace(/"/g, "%22")}")` } as CSSProperties;
}

const text = (label: string) => ({ type: "text" as const, label });

/*
 * 화면에서 바로 고치는 칸.
 *
 * contentEditable 을 켜면 Puck 이 미리보기의 그 글자를 편집 가능한 span 으로
 * 감싼다. 오른쪽 칸을 찾아 들어가지 않고 제목을 눌러 그 자리에서 고친다.
 *
 * 저장 형태는 그대로다(plaintext-only) — 옛 페이지가 깨지지 않는다.
 *
 * 다만 편집기에서는 값이 글자가 아니라 요소로 넘어온다. 그래서 값을 글자처럼
 * 쓰는 칸에는 아직 켜지 않았다 — 빈 칸을 걸러내거나(신뢰 띠·자주 묻는 질문·
 * 찾아오는 길) key 를 만드는 데 쓰는 값들이다. 거기 켜면 빈 줄이 되살아나거나
 * key 가 [object Object] 가 된다. 그 칸들은 걸러내기·key 를 값과 떼어낸 뒤에
 * 켠다.
 */
const liveText = (label: string) => ({ type: "text" as const, label, contentEditable: true });
const liveArea = (label: string) => ({ type: "textarea" as const, label, contentEditable: true });
const area = (label: string) => ({ type: "textarea" as const, label });

/*
 * 페이지 강조색.
 *
 * 버튼·작은 제목·강조 배경이 모두 --landing-accent 를 읽는다. 이 변수 하나만
 * 바꾸면 페이지 전체 색이 따라 바뀐다.
 *
 * 색을 직접 입력받지 않고 고르게 한다. 아무 색이나 넣으면 흰 글씨가 얹히는
 * 버튼에서 글이 안 보이는 조합이 나온다 — 흰 글씨가 읽히는 진하기만 골라 뒀다.
 */
const ACCENT_OPTIONS = [
  { label: "킷 파랑 (기본)", value: "#473bf0" },
  { label: "파랑", value: "#1b64da" },
  { label: "남색", value: "#1e3a8a" },
  { label: "초록", value: "#15803d" },
  { label: "청록", value: "#0f766e" },
  { label: "보라", value: "#6d28d9" },
  { label: "자주", value: "#a21caf" },
  { label: "빨강", value: "#b91c1c" },
  { label: "주황", value: "#c2410c" },
  { label: "갈색", value: "#78350f" },
  { label: "먹색", value: "#191f28" },
];

/*
 * 페이지 글꼴.
 *
 * 자유 입력을 받지 않는다. 아무 글꼴이나 받으면 한글이 없는 것을 골라 네모만
 * 뜨거나, 장식용 글꼴로 본문을 깔아 못 읽는 페이지가 나온다. 한글이 확실히
 * 되는 것만 골라 뒀다.
 */
const FONT_OPTIONS = [
  { label: "또렷한 고딕 (기본)", value: "sans" },
  { label: "부드러운 고딕", value: "round" },
  { label: "단정한 명조", value: "serif" },
];

/*
 * 글자 크기 — 페이지 전체가 한 단계씩 같이 움직인다.
 *
 * 굵기나 개별 크기는 열지 않는다. 제목은 굵게·본문은 보통으로 이미 짝지어져
 * 있어서 하나만 건드리면 그 짝이 깨진다. 손님이 읽기 어려워지는 쪽으로 흐른다.
 */
const SCALE_OPTIONS = [
  { label: "작게", value: "sm" },
  { label: "보통", value: "md" },
  { label: "크게", value: "lg" },
];

/** 저장된 값이 우리가 고른 색일 때만 쓴다 — 남이 넣은 값이 그대로 style 로 나가지 않게 */
/** 저장된 값이 우리가 고른 것일 때만 클래스로 내보낸다 */
export function landingPageClass(font: unknown, scale: unknown, kit?: unknown) {
  const f = FONT_OPTIONS.some((o) => o.value === font) ? font : "sans";
  const c = SCALE_OPTIONS.some((o) => o.value === scale) ? scale : "md";
  /*
   * 킷 배치(lib/landing/kits.ts). 값이 없으면 — 킷을 들이기 전에 저장된
   * 페이지 — 아무 킷 클래스도 붙지 않아 예전 모양 그대로 그려진다.
   */
  const k = isLandingKit(kit) ? ` kit kit-${kit}` : "";
  return `landing-block-page font-${f} scale-${c}${k}`;
}

export function landingAccentStyle(accent: unknown) {
  const hit = ACCENT_OPTIONS.find((option) => option.value === accent);
  return hit ? ({ "--landing-accent": hit.value } as CSSProperties) : undefined;
}

export const landingBlockConfig: Config<LandingBlockProps> = {
  root: {
    fields: {
      kit: {
        type: "select",
        label: "페이지 배치 (Brainwave.io 킷)",
        options: landingKitOptions.map((o) => ({ label: `${o.name} — ${o.description}`, value: o.id })),
      },
      accent: { type: "select", label: "페이지 강조색", options: ACCENT_OPTIONS },
      font: { type: "select", label: "글꼴", options: FONT_OPTIONS },
      scale: { type: "select", label: "글자 크기", options: SCALE_OPTIONS },
    },
    defaultProps: { kit: "consult", accent: "#473bf0", font: "sans", scale: "md" },
    render: ({ accent, font, scale, kit, children }) => (
      <div className={landingPageClass(font, scale, kit)} style={landingAccentStyle(accent)}>{children as ReactNode}</div>
    ),
  },
  categories: {
    main: {
      title: "첫 화면과 상품",
      components: ["HeroSection", "OfferSection", "PriceList", "CtaSection"],
      defaultExpanded: true,
    },
    content: {
      title: "설명 섹션",
      components: ["FeatureGrid", "ProcessSteps", "StorySection"],
      defaultExpanded: true,
    },
    visual: {
      title: "사진과 근거",
      components: ["TrustBar", "StatsSection", "GallerySection", "PhotoGrid", "LocationSection", "FaqSection", "ReviewSection", "VideoSection", "AlertBar", "FooterSection"],
      defaultExpanded: true,
    },
  },
  components: {
    HeroSection: {
      label: "첫 화면",
      fields: {
        layout: {
          type: "select",
          label: "첫 화면 배치",
          options: [
            { label: "사진과 글 나란히", value: "split" },
            { label: "사진을 화면 가득", value: "immersive" },
            { label: "상품 중심", value: "product" },
            { label: "수업·예약 중심", value: "course" },
            { label: "앱·플랫폼 중심", value: "tech" },
            { label: "잡지처럼 크게", value: "editorial" },
          ],
        },
        eyebrow: liveText("작은 안내 문구"),
        title: liveArea("가장 큰 제목"),
        description: liveArea("제목 아래 설명"),
        buttonLabel: liveText("버튼 문구"),
        imageUrl: imageField("대표 이미지"),
        /*
         * 사진을 따로 고르고 옮기려면 사진이 블록이어야 한다.
         *
         * 위 '대표 이미지'는 블록 속성이라 눌러도 첫 화면 전체가 잡힌다. 여기에
         * '사진 한 장'을 끌어다 놓으면 그 사진만 고르고 끌 수 있다.
         *
         * 둘 다 남겨 둔다 — 이미 대표 이미지로 만든 페이지가 있고, 그걸 지우면
         * 그 페이지들 첫 화면에서 사진이 사라진다. 끌어다 놓은 사진이 있으면
         * 그쪽을 쓰고, 없으면 예전처럼 대표 이미지를 쓴다.
         */
        photo: { type: "slot" as const, label: "사진 (끌어다 놓기)", allow: ["PhotoBlock"] },
        ...styleFields,
      },
      defaultProps: {
        layout: "split",
        eyebrow: "지금 첫 고객을 모집하고 있어요",
        title: "고객이 바로 이해하는 한 문장",
        description: "누구에게 어떤 도움을 주는지 짧게 설명하세요.",
        buttonLabel: "문의하기",
        imageUrl: "",
        photo: [],
        ...styleDefaults,
      },
      render: ({ eyebrow, title, description, buttonLabel, imageUrl, layout, photo: Photo, ...style }) => (
        // 사진이 없으면 no-image 를 남긴다 — 사진 깔던 자리가 빈 회색 상자로 남으면 안 된다
        <section className={`landing-block landing-block-hero layout-${layout} ${imageUrl ? "" : "no-image"} ${styleClass(style)}`} style={blockBg(style)}>
          <div className="landing-block-hero-copy">
            <span>{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
            <a href="#landing-contact">{buttonLabel}<ArrowRight /></a>
          </div>
          {/*
            * 끌어다 놓은 사진이 있으면 그쪽이 이긴다 — 없을 때만 예전 대표 이미지.
            *
            * 이 슬롯을 만들기 전에 저장된 페이지에는 photo 라는 값이 아예 없다.
            * 그대로 <Photo /> 를 쓰면 undefined 를 컴포넌트로 쓰려다 화면이 통째로
            * 죽는다 — 실제로 그렇게 났다. 그릴 수 있을 때만 그린다.
            */}
          {typeof Photo === "function" ? <Photo className="landing-block-hero-slot" /> : null}
          {imageUrl && <figure><img src={imageUrl} alt="" /></figure>}
        </section>
      ),
    },
    TrustBar: {
      label: "신뢰 문구 띠",
      fields: {
        label: liveText("왼쪽 제목"),
        item1: text("문구 1"),
        item2: text("문구 2"),
        item3: text("문구 3"),
        item4: text("문구 4"),
        ...styleFields,
      },
      defaultProps: {
        label: "안심하고 시작하세요",
        item1: "제공 범위 안내",
        item2: "진행 단계 확인",
        item3: "문의 후 조건 확정",
        item4: "모바일 대응",
        ...styleDefaults,
      },
      render: ({ label, item1, item2, item3, item4, ...style }) => (
        <section className={`landing-block landing-block-trust ${styleClass(style)}`} style={blockBg(style)}>
          <strong>{label}</strong>
          {/* 빈 칸은 그리지 않는다 — 체크 표시만 덩그러니 남는다 */}
          <div>{[item1, item2, item3, item4].filter(Boolean).map((item) => <span key={item}><Check />{item}</span>)}</div>
        </section>
      ),
    },
    FeatureGrid: {
      label: "장점 3개",
      fields: {
        eyebrow: liveText("작은 제목"),
        heading: liveText("섹션 제목"),
        intro: liveArea("짧은 설명"),
        title1: text("첫 번째 장점"),
        body1: area("첫 번째 설명"),
        title2: text("두 번째 장점"),
        body2: area("두 번째 설명"),
        title3: text("세 번째 장점"),
        body3: area("세 번째 설명"),
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "선택하는 이유",
        heading: "고객이 얻는 결과",
        intro: "가장 중요한 장점 세 가지를 보여주세요.",
        title1: "첫 번째 장점",
        body1: "고객에게 어떤 변화가 생기는지 설명하세요.",
        title2: "두 번째 장점",
        body2: "다른 선택지보다 편리한 점을 설명하세요.",
        title3: "세 번째 장점",
        body3: "믿고 선택할 수 있는 이유를 설명하세요.",
        ...styleDefaults,
      },
      render: ({ eyebrow, heading, intro, title1, body1, title2, body2, title3, body3, ...style }) => (
        <section className={`landing-block landing-block-features ${styleClass(style)}`} style={blockBg(style)}>
          <header><span>{eyebrow}</span><h2>{heading}</h2><p>{intro}</p></header>
          <div>{[[title1, body1], [title2, body2], [title3, body3]].map(([title, body], index) => <article key={`${title}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><h3>{title}</h3><p>{body}</p></article>)}</div>
        </section>
      ),
    },
    ProcessSteps: {
      label: "이용 과정",
      fields: {
        eyebrow: liveText("작은 제목"),
        heading: liveText("섹션 제목"),
        step1Title: text("1단계 제목"),
        step1Body: area("1단계 설명"),
        step2Title: text("2단계 제목"),
        step2Body: area("2단계 설명"),
        step3Title: text("3단계 제목"),
        step3Body: area("3단계 설명"),
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "이용 방법",
        heading: "세 단계면 충분합니다",
        step1Title: "문의 남기기",
        step1Body: "필요한 내용을 알려주세요.",
        step2Title: "조건 확인하기",
        step2Body: "일정과 금액을 함께 확인합니다.",
        step3Title: "서비스 시작하기",
        step3Body: "확정한 내용에 맞춰 진행합니다.",
        ...styleDefaults,
      },
      render: ({ eyebrow, heading, step1Title, step1Body, step2Title, step2Body, step3Title, step3Body, ...style }) => (
        <section className={`landing-block landing-block-process ${styleClass(style)}`} style={blockBg(style)}>
          <header><span>{eyebrow}</span><h2>{heading}</h2></header>
          <ol>{[[step1Title, step1Body], [step2Title, step2Body], [step3Title, step3Body]].map(([title, body], index) => <li key={`${title}-${index}`}><i>{index + 1}</i><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
        </section>
      ),
    },
    StorySection: {
      label: "브랜드 이야기",
      fields: {
        eyebrow: liveText("작은 제목"),
        title: liveArea("섹션 제목"),
        body: liveArea("브랜드 설명"),
        imageUrl: imageField("브랜드 이미지"),
        imageSide: {
          type: "radio",
          label: "사진 위치",
          options: [{ label: "왼쪽", value: "left" }, { label: "오른쪽", value: "right" }],
        },
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "브랜드 이야기",
        title: "왜 이 일을 시작했는지 들려주세요",
        body: "고객이 공감할 수 있는 시작 이유와 운영 원칙을 적어주세요.",
        imageUrl: "",
        imageSide: "right",
        ...styleDefaults,
      },
      render: ({ eyebrow, title, body, imageUrl, imageSide, ...style }) => (
        <section className={`landing-block landing-block-story image-${imageSide} ${styleClass(style)}`} style={blockBg(style)}>
          <div><span>{eyebrow}</span><h2>{title}</h2><p>{body}</p></div>
          {imageUrl && <figure><img src={imageUrl} alt="" /></figure>}
        </section>
      ),
    },
    StatsSection: {
      label: "숫자·단계 강조",
      fields: {
        heading: liveText("섹션 제목"),
        value1: text("숫자 1"),
        label1: text("설명 1"),
        value2: text("숫자 2"),
        label2: text("설명 2"),
        value3: text("숫자 3"),
        label3: text("설명 3"),
        ...styleFields,
      },
      defaultProps: {
        heading: "한눈에 보는 진행",
        value1: "01",
        label1: "필요 확인",
        value2: "02",
        label2: "조건 안내",
        value3: "03",
        label3: "실행 시작",
        ...styleDefaults,
      },
      render: ({ heading, value1, label1, value2, label2, value3, label3, ...style }) => (
        <section className={`landing-block landing-block-stats ${styleClass(style)}`} style={blockBg(style)}><h2>{heading}</h2><div>{[[value1, label1], [value2, label2], [value3, label3]].map(([value, label]) => <article key={`${value}-${label}`}><strong>{value}</strong><span>{label}</span></article>)}</div></section>
      ),
    },
    GallerySection: {
      label: "사진 3장",
      fields: {
        eyebrow: liveText("작은 제목"),
        heading: liveText("섹션 제목"),
        image1: imageField("사진 1"),
        caption1: text("사진 1 설명"),
        image2: imageField("사진 2"),
        caption2: text("사진 2 설명"),
        image3: imageField("사진 3"),
        caption3: text("사진 3 설명"),
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "서비스 미리보기",
        heading: "이런 경험을 제공합니다",
        image1: "",
        caption1: "첫 번째 경험",
        image2: "",
        caption2: "두 번째 경험",
        image3: "",
        caption3: "세 번째 경험",
        ...styleDefaults,
      },
      render: ({ eyebrow, heading, image1, caption1, image2, caption2, image3, caption3, ...style }) => {
        const shots = [[image1, caption1], [image2, caption2], [image3, caption3]].filter(([image]) => image);
        /*
         * 사진이 없으면 "이런 모습입니다"라는 제목만 남는다 — 그 칸은 아예 그리지 않는다.
         * null 대신 빈 조각을 돌려준다. Puck은 render가 항상 요소를 돌려주기를 요구한다.
         */
        if (!shots.length) return <></>;
        return (
          <section className={`landing-block landing-block-gallery ${styleClass(style)}`} style={blockBg(style)}>
            <header><span>{eyebrow}</span><h2>{heading}</h2></header>
            <div>{shots.map(([image, caption], index) => <figure key={`${caption}-${index}`}><img src={image} alt="" /><figcaption>{caption}</figcaption></figure>)}</div>
          </section>
        );
      },
    },
    OfferSection: {
      label: "상품·가격",
      fields: {
        eyebrow: liveText("작은 제목"),
        title: liveText("상품 이름"),
        description: liveArea("상품 설명"),
        price: liveText("가격"),
        buttonLabel: liveText("버튼 문구"),
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "대표 상품",
        title: "첫 상품 이름",
        description: "고객이 받는 내용과 제공 범위를 적어주세요.",
        price: "가격 상담",
        buttonLabel: "문의하기",
        ...styleDefaults,
      },
      render: ({ eyebrow, title, description, price, buttonLabel, ...style }) => (
        <section className={`landing-block landing-block-offer ${styleClass(style)}`} style={blockBg(style)}><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><aside><strong>{price}</strong><a href="#landing-contact">{buttonLabel}<ArrowRight /></a></aside></section>
      ),
    },
    /* 메뉴·가격표 — 음식점·매장 템플릿의 핵심. 값을 모르면 방문자는 문의하지 않는다 */
    PriceList: {
      label: "메뉴·가격",
      fields: {
        eyebrow: liveText("작은 안내 문구"),
        heading: liveText("제목"),
        name1: text("항목 1 이름"), desc1: text("항목 1 설명"), price1: text("항목 1 가격"),
        name2: text("항목 2 이름"), desc2: text("항목 2 설명"), price2: text("항목 2 가격"),
        name3: text("항목 3 이름"), desc3: text("항목 3 설명"), price3: text("항목 3 가격"),
        note: liveText("아래 안내"),
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "메뉴와 가격",
        heading: "무엇을 얼마에 드리는지",
        name1: "대표 상품", desc1: "구성과 포함 내용을 적어주세요.", price1: "가격 상담",
        name2: "", desc2: "", price2: "",
        name3: "", desc3: "", price3: "",
        note: "가격은 상황에 따라 달라질 수 있습니다.",
        ...styleDefaults,
      },
      render: ({ eyebrow, heading, name1, desc1, price1, name2, desc2, price2, name3, desc3, price3, note, ...style }) => (
        <section className={`landing-block landing-block-price ${styleClass(style)}`} style={blockBg(style)}>
          <header>
            <span>{eyebrow}</span>
            <h2>{heading}</h2>
          </header>
          <ul>
            {[[name1, desc1, price1], [name2, desc2, price2], [name3, desc3, price3]]
              .filter(([n]) => n)
              .map(([n, d, p]) => (
                <li key={n}>
                  <div><strong>{n}</strong>{d ? <span>{d}</span> : null}</div>
                  <b>{p}</b>
                </li>
              ))}
          </ul>
          {note ? <small>{note}</small> : null}
        </section>
      ),
    },

    /* 위치·영업시간 — 동네 장사에서 가장 많이 찾는 정보 */
    LocationSection: {
      label: "위치·영업시간",
      fields: {
        eyebrow: liveText("작은 안내 문구"),
        heading: liveText("제목"),
        address: text("주소"),
        hours: text("영업시간"),
        closed: text("휴무"),
        contact: text("연락처"),
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "찾아오는 길",
        heading: "언제, 어디로 오시면 되는지",
        address: "주소를 입력하세요",
        hours: "평일 09:00 - 18:00",
        closed: "일요일 휴무",
        contact: "",
        ...styleDefaults,
      },
      render: ({ eyebrow, heading, address, hours, closed, contact, ...style }) => (
        <section className={`landing-block landing-block-location ${styleClass(style)}`} style={blockBg(style)}>
          <header>
            <span>{eyebrow}</span>
            <h2>{heading}</h2>
          </header>
          <dl>
            {/* 값이 없으면 줄을 내지 않는다 — 빈 항목은 미완성으로 읽힌다 */}
            {address ? <div><dt>주소</dt><dd>{address}</dd></div> : null}
            {hours ? <div><dt>영업시간</dt><dd>{hours}</dd></div> : null}
            {closed ? <div><dt>휴무</dt><dd>{closed}</dd></div> : null}
            {contact ? <div><dt>연락처</dt><dd>{contact}</dd></div> : null}
          </dl>
        </section>
      ),
    },

    /* 자주 묻는 질문 — 초안에는 이미 있었는데 화면에 나올 자리가 없었다 */
    FaqSection: {
      label: "자주 묻는 질문",
      fields: {
        eyebrow: liveText("작은 안내 문구"),
        heading: liveText("제목"),
        q1: text("질문 1"), a1: area("답변 1"),
        q2: text("질문 2"), a2: area("답변 2"),
        q3: text("질문 3"), a3: area("답변 3"),
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "자주 묻는 질문",
        heading: "궁금한 점을 먼저 풀어 드립니다",
        q1: "신청 후에는 어떻게 되나요?", a1: "입력한 연락처로 확인 후 다음 절차를 안내합니다.",
        q2: "바로 결제해야 하나요?", a2: "아니요. 필요한 범위와 조건을 먼저 확인합니다.",
        q3: "", a3: "",
        ...styleDefaults,
      },
      render: ({ eyebrow, heading, q1, a1, q2, a2, q3, a3, ...style }) => (
        <section className={`landing-block landing-block-faq ${styleClass(style)}`} style={blockBg(style)}>
          <header>
            <span>{eyebrow}</span>
            <h2>{heading}</h2>
          </header>
          <dl>
            {[[q1, a1], [q2, a2], [q3, a3]].filter(([q]) => q).map(([q, a]) => (
              <div key={q}><dt>{q}</dt><dd>{a}</dd></div>
            ))}
          </dl>
        </section>
      ),
    },

    CtaSection: {
      label: "마지막 신청 안내",
      fields: {
        eyebrow: liveText("작은 제목"),
        title: liveArea("큰 제목"),
        description: liveArea("설명"),
        buttonLabel: liveText("버튼 문구"),
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "문의하기",
        title: "궁금한 점을 남겨주세요",
        description: "문의를 남겨주시면 알려주신 연락처로 답변드립니다.",
        buttonLabel: "문의하기",
        ...styleDefaults,
      },
      render: ({ eyebrow, title, description, buttonLabel, ...style }) => (
        <section className={`landing-block landing-block-cta ${styleClass(style)}`} style={blockBg(style)}><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p><a href="#landing-contact">{buttonLabel}<ArrowRight /></a></section>
      ),
    },
    /*
     * 사진 한 장 — 그 자체가 하나의 조각이다.
     *
     * 지금까지 사진은 블록 속성이라, 사진을 눌러도 블록 전체가 잡히고 끌면 블록이
     * 통째로 움직였다. 사진만 고르거나 옮길 수 없었다.
     *
     * 사진을 독립된 블록으로 만들면 Puck 이 그것 하나만 고르고 끌게 해 준다.
     * '사진 여러 장' 칸 안에 넣어 쓴다.
     */
    PhotoBlock: {
      label: "사진 한 장",
      fields: {
        imageUrl: imageField("사진"),
        caption: liveText("사진 설명"),
        shape: { type: "select" as const, label: "모양", options: [
          { label: "사각", value: "square" }, { label: "모서리 둥글게", value: "round" },
          { label: "동그랗게", value: "circle" },
        ] },
        size: { type: "select" as const, label: "크기", options: [
          { label: "작게", value: "sm" }, { label: "보통", value: "md" }, { label: "크게", value: "lg" },
        ] },
        fit: { type: "select" as const, label: "사진 맞춤", options: [
          { label: "칸에 꽉 채우기", value: "cover" }, { label: "잘리지 않게 전부", value: "contain" },
        ] },
      },
      defaultProps: { imageUrl: "", caption: "", shape: "round", size: "md", fit: "cover" },
      render: ({ imageUrl, caption, shape, size, fit }) => (
        <figure className={`landing-photo shape-${shape} size-${size} fit-${fit}`}>
          {imageUrl ? <img src={imageUrl} alt="" /> : <span className="landing-photo-empty">사진을 고르세요</span>}
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      ),
    },
    /*
     * 사진 여러 장 — 안에 '사진 한 장'을 넣는 칸.
     *
     * slot 이라 안에 든 사진마다 따로 고르고, 끌어서 순서를 바꾸고, 지울 수 있다.
     * 기존 '사진 3장' 블록은 그대로 둔다 — 이미 그 블록으로 만든 페이지가 있다.
     */
    PhotoGrid: {
      label: "사진 여러 장",
      fields: {
        eyebrow: liveText("작은 제목"),
        heading: liveText("섹션 제목"),
        columns: { type: "select" as const, label: "한 줄에", options: [
          { label: "2칸", value: "2" }, { label: "3칸", value: "3" }, { label: "4칸", value: "4" },
        ] },
        photos: { type: "slot" as const, label: "사진", allow: ["PhotoBlock"] },
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "둘러보기",
        heading: "이런 모습입니다",
        columns: "3",
        photos: [],
        ...styleDefaults,
      },
      render: ({ eyebrow, heading, columns, photos: Photos, ...style }) => (
        <section className={`landing-block landing-block-photogrid cols-${columns} ${styleClass(style)}`} style={blockBg(style)}>
          <header><span>{eyebrow}</span><h2>{heading}</h2></header>
          {typeof Photos === "function" ? <Photos className="landing-photogrid-zone" /> : null}
        </section>
      ),
    },
    /*
     * ── Brainwave.io 킷에서 가져온 칸들 ──────────────────────────────
     */
    AlertBar: {
      label: "알림 띠",
      fields: {
        tag: liveText("작은 꼬리표"),
        text: liveText("알림 문장"),
        linkLabel: liveText("링크 글자"),
        ...styleFields,
      },
      defaultProps: { tag: "안내", text: "지금 문의하실 수 있습니다.", linkLabel: "문의하기", ...styleDefaults },
      render: ({ tag, text, linkLabel, ...style }) => (
        <section className={`landing-block landing-block-alert ${styleClass(style)}`} style={blockBg(style)}>
          <div>
            {tag ? <i>{tag}</i> : null}
            <p>{text} {linkLabel ? <a href="#landing-contact">{linkLabel}</a> : null}</p>
          </div>
        </section>
      ),
    },
    /*
     * 영상 — 주소를 넣기 전까지는 그리지 않는다. 재생 단추만 있고 눌러도 아무
     * 일이 없는 칸은 고장 난 페이지로 읽힌다.
     */
    VideoSection: {
      label: "영상",
      fields: {
        heading: liveText("제목"),
        description: liveArea("설명"),
        videoUrl: text("영상 주소 (유튜브)"),
        posterUrl: imageField("덮개 사진"),
        ...styleFields,
      },
      defaultProps: { heading: "1분 영상으로 만나보세요", description: "", videoUrl: "", posterUrl: "", ...styleDefaults },
      render: ({ heading, description, videoUrl, posterUrl, ...style }) => {
        const url = typeof videoUrl === "string" ? videoUrl.trim() : "";
        if (!url) return <></>; /* Puck 은 render 가 항상 요소를 돌려주기를 요구한다 */
        const id = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/)?.[1];
        const poster = typeof posterUrl === "string" ? posterUrl : "";
        return (
          <section className={`landing-block landing-block-video ${styleClass(style)}`} style={blockBg(style)}>
            <div className="landing-video-frame" style={poster ? { backgroundImage: `url("${poster.replace(/"/g, "%22")}")` } : undefined}>
              {id ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${id}`}
                  title={typeof heading === "string" ? heading : "영상"}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <a className="landing-video-play" href={url} target="_blank" rel="noreferrer" aria-label="영상 보기"><b /></a>
              )}
            </div>
            <div className="landing-video-copy">
              <h2>{heading}</h2>
              {description ? <p>{description}</p> : null}
            </div>
          </section>
        );
      },
    },
    /*
     * 후기 — 셋 다 비어 있으면 칸 자체를 그리지 않는다(갤러리와 같은 규칙).
     * 받은 적 없는 후기를 채움말로 세우면 그게 곧 거짓 광고다.
     */
    ReviewSection: {
      label: "고객 후기",
      fields: {
        eyebrow: liveText("작은 안내 문구"),
        heading: liveText("제목"),
        quote1: area("후기 1"), name1: text("이름 1"), role1: text("소개 1 (예: 성수동 · 2회 방문)"),
        quote2: area("후기 2"), name2: text("이름 2"), role2: text("소개 2"),
        quote3: area("후기 3"), name3: text("이름 3"), role3: text("소개 3"),
        ...styleFields,
      },
      defaultProps: {
        eyebrow: "고객 후기", heading: "이용하신 분들의 이야기",
        quote1: "", name1: "", role1: "", quote2: "", name2: "", role2: "", quote3: "", name3: "", role3: "",
        ...styleDefaults,
      },
      render: ({ eyebrow, heading, quote1, name1, role1, quote2, name2, role2, quote3, name3, role3, ...style }) => {
        const items = [
          { quote: quote1, name: name1, role: role1 },
          { quote: quote2, name: name2, role: role2 },
          { quote: quote3, name: name3, role: role3 },
        ].filter((item) => typeof item.quote === "string" && item.quote.trim());
        if (!items.length) return <></>;
        return (
          <section className={`landing-block landing-block-reviews ${styleClass(style)}`} style={blockBg(style)}>
            <header><span>{eyebrow}</span><h2>{heading}</h2></header>
            <div>
              {items.map((item, index) => (
                <article key={index}>
                  <blockquote>“{item.quote}”</blockquote>
                  <footer>
                    <i aria-hidden="true">{(item.name || "고객").slice(0, 1)}</i>
                    <div><strong>{item.name || "고객"}</strong>{item.role ? <small>{item.role}</small> : null}</div>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        );
      },
    },
    /*
     * 페이지 맨 아래 가게 소개.
     *
     * 공개 페이지는 이미 사업자정보 푸터를 그린다(대표자·사업장·사업자등록번호·
     * 통신판매업). 그건 법으로 적어야 하는 것이라 여기서 고치거나 지울 수 없게
     * 두고, 이 블록은 그 위에 놓이는 가게 자신의 마무리 말만 맡는다.
     */
    FooterSection: {
      label: "맨 아래 가게 소개",
      fields: {
        brand: liveText("가게 이름"),
        tagline: liveArea("한 줄 소개"),
        /* 비면 안 그린다 — 값으로 걸러내므로 인라인 편집은 켜지 않는다 */
        hours: text("영업시간"),
        contact: text("연락처"),
        ...styleFields,
      },
      defaultProps: {
        brand: "가게 이름",
        tagline: "찾아주셔서 고맙습니다.",
        hours: "",
        contact: "",
        ...styleDefaults,
      },
      render: ({ brand, tagline, hours, contact, ...style }) => (
        <section className={`landing-block landing-block-footer ${styleClass(style)}`} style={blockBg(style)}>
          <strong>{brand}</strong>
          <p>{tagline}</p>
          <div>
            {hours ? <span>영업시간 {hours}</span> : null}
            {contact ? <span>연락처 {contact}</span> : null}
          </div>
        </section>
      ),
    },
  },
};

/* 저장된 칸 하나를 그린다 — 편집기 밖(미리보기·공개 화면)에서 쓴다 */
function renderStoredBlock(component: { type: string; props: Record<string, unknown> }, key: string) {
  const components = landingBlockConfig.components as Record<string, { render?: unknown } | undefined>;
  const renderer = components[component.type]?.render as ComponentType<Record<string, unknown>> | undefined;
  if (!renderer) return null;
  const Block = renderer;
  return <Block key={key} {...withSlotRenderers(component.props)} />;
}

/*
 * 칸 안에 든 칸(slot)을 편집기 밖에서도 그린다.
 *
 * 편집기에서는 Puck 이 슬롯 자리에 '그리는 함수'를 넣어 준다. 저장된 데이터에는
 * 그냥 배열이 들어 있어서, 그대로 넘기면 블록이 <Photo /> 처럼 배열을 컴포넌트로
 * 쓰려다 화면이 통째로 죽는다 — 실제로 그렇게 났다.
 *
 * 배열로 온 자리를 그리는 함수로 바꿔 끼운다. 편집기와 공개 화면이 같은 블록
 * 코드를 쓰므로, 여기서 모양을 맞춰 줘야 양쪽이 같은 결과를 낸다.
 */
function withSlotRenderers(props: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...props };
  for (const [key, value] of Object.entries(props)) {
    if (!Array.isArray(value)) continue;
    const children = value.filter(
      (item): item is { type: string; props: Record<string, unknown> } =>
        Boolean(item) && typeof item === "object" && typeof (item as { type?: unknown }).type === "string",
    );
    next[key] = function SlotZone({ className }: { className?: string }) {
      return <div className={className}>{children.map((child, index) => renderStoredBlock(child, `${key}-${index}`))}</div>;
    };
  }
  return next;
}

export function LandingBlocksRenderer({ data, preloaded }: { data: LandingPageData; preloaded?: BrainwavePageData | null }) {
  /* Brainwave.io 킷 페이지 — 노드 그대로, 글·사진만 바꿔 끼운 채 그린다 */
  if (data.brainwave) {
    return <BrainwavePage pageId={data.brainwave.page} overrides={{ texts: data.brainwave.texts, images: data.brainwave.images, links: data.brainwave.links }} preloaded={preloaded} />;
  }
  /* 편집기에서 고른 강조색은 root 에 있다 — 공개 화면에도 같은 색이 걸려야 한다 */
  return (
    <div
      className={landingPageClass(data.root?.props?.font, data.root?.props?.scale, data.root?.props?.kit)}
      style={landingAccentStyle(data.root?.props?.accent)}
    >
      {data.content.map((component, index) =>
        renderStoredBlock(component, String(component.props.id ?? `${component.type}-${index}`)),
      )}
    </div>
  );
}
