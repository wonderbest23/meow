"use client";

import { ArrowRight, Check } from "lucide-react";
import type { ComponentType } from "react";
import type { Config } from "@puckeditor/core";
import type { LandingPageData } from "../lib/landing/page-data";
import { LandingMediaField } from "./landing-media-field";

type HeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  buttonLabel: string;
  imageUrl: string;
  layout: "split" | "immersive" | "product" | "course" | "tech" | "editorial";
};
type TrustProps = { label: string; item1: string; item2: string; item3: string; item4: string };
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
};
type ProcessProps = {
  eyebrow: string;
  heading: string;
  step1Title: string;
  step1Body: string;
  step2Title: string;
  step2Body: string;
  step3Title: string;
  step3Body: string;
};
type StoryProps = {
  eyebrow: string;
  title: string;
  body: string;
  imageUrl: string;
  imageSide: "left" | "right";
};
type StatsProps = {
  heading: string;
  value1: string;
  label1: string;
  value2: string;
  label2: string;
  value3: string;
  label3: string;
};
type GalleryProps = {
  eyebrow: string;
  heading: string;
  image1: string;
  caption1: string;
  image2: string;
  caption2: string;
  image3: string;
  caption3: string;
};
type OfferProps = { eyebrow: string; title: string; description: string; price: string; buttonLabel: string };
type CtaProps = { eyebrow: string; title: string; description: string; buttonLabel: string };

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
};

type PriceListProps = {
  eyebrow: string;
  heading: string;
  name1: string; desc1: string; price1: string;
  name2: string; desc2: string; price2: string;
  name3: string; desc3: string; price3: string;
  note: string;
};

type LocationProps = {
  eyebrow: string;
  heading: string;
  address: string;
  hours: string;
  closed: string;
  contact: string;
};

type FaqProps = {
  eyebrow: string;
  heading: string;
  q1: string; a1: string;
  q2: string; a2: string;
  q3: string; a3: string;
};

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

const text = (label: string) => ({ type: "text" as const, label });
const area = (label: string) => ({ type: "textarea" as const, label });

export const landingBlockConfig: Config<LandingBlockProps> = {
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
      components: ["TrustBar", "StatsSection", "GallerySection", "LocationSection", "FaqSection"],
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
        eyebrow: text("작은 안내 문구"),
        title: area("가장 큰 제목"),
        description: area("제목 아래 설명"),
        buttonLabel: text("버튼 문구"),
        imageUrl: imageField("대표 이미지"),
      },
      defaultProps: {
        layout: "split",
        eyebrow: "지금 첫 고객을 모집하고 있어요",
        title: "고객이 바로 이해하는 한 문장",
        description: "누구에게 어떤 도움을 주는지 짧게 설명하세요.",
        buttonLabel: "문의하기",
        imageUrl: "",
      },
      render: ({ eyebrow, title, description, buttonLabel, imageUrl, layout }) => (
        <section className={`landing-block landing-block-hero layout-${layout}`}>
          <div className="landing-block-hero-copy">
            <span>{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
            <a href="#landing-contact">{buttonLabel}<ArrowRight /></a>
          </div>
          {imageUrl && <figure><img src={imageUrl} alt="" /></figure>}
        </section>
      ),
    },
    TrustBar: {
      label: "신뢰 문구 띠",
      fields: {
        label: text("왼쪽 제목"),
        item1: text("문구 1"),
        item2: text("문구 2"),
        item3: text("문구 3"),
        item4: text("문구 4"),
      },
      defaultProps: {
        label: "안심하고 시작하세요",
        item1: "제공 범위 안내",
        item2: "진행 단계 확인",
        item3: "문의 후 조건 확정",
        item4: "모바일 대응",
      },
      render: ({ label, item1, item2, item3, item4 }) => (
        <section className="landing-block-trust">
          <strong>{label}</strong>
          <div>{[item1, item2, item3, item4].map((item) => <span key={item}><Check />{item}</span>)}</div>
        </section>
      ),
    },
    FeatureGrid: {
      label: "장점 3개",
      fields: {
        eyebrow: text("작은 제목"),
        heading: text("섹션 제목"),
        intro: area("짧은 설명"),
        title1: text("첫 번째 장점"),
        body1: area("첫 번째 설명"),
        title2: text("두 번째 장점"),
        body2: area("두 번째 설명"),
        title3: text("세 번째 장점"),
        body3: area("세 번째 설명"),
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
      },
      render: ({ eyebrow, heading, intro, title1, body1, title2, body2, title3, body3 }) => (
        <section className="landing-block landing-block-features">
          <header><span>{eyebrow}</span><h2>{heading}</h2><p>{intro}</p></header>
          <div>{[[title1, body1], [title2, body2], [title3, body3]].map(([title, body], index) => <article key={`${title}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><h3>{title}</h3><p>{body}</p></article>)}</div>
        </section>
      ),
    },
    ProcessSteps: {
      label: "이용 과정",
      fields: {
        eyebrow: text("작은 제목"),
        heading: text("섹션 제목"),
        step1Title: text("1단계 제목"),
        step1Body: area("1단계 설명"),
        step2Title: text("2단계 제목"),
        step2Body: area("2단계 설명"),
        step3Title: text("3단계 제목"),
        step3Body: area("3단계 설명"),
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
      },
      render: ({ eyebrow, heading, step1Title, step1Body, step2Title, step2Body, step3Title, step3Body }) => (
        <section className="landing-block landing-block-process">
          <header><span>{eyebrow}</span><h2>{heading}</h2></header>
          <ol>{[[step1Title, step1Body], [step2Title, step2Body], [step3Title, step3Body]].map(([title, body], index) => <li key={`${title}-${index}`}><i>{index + 1}</i><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
        </section>
      ),
    },
    StorySection: {
      label: "브랜드 이야기",
      fields: {
        eyebrow: text("작은 제목"),
        title: area("섹션 제목"),
        body: area("브랜드 설명"),
        imageUrl: imageField("브랜드 이미지"),
        imageSide: {
          type: "radio",
          label: "사진 위치",
          options: [{ label: "왼쪽", value: "left" }, { label: "오른쪽", value: "right" }],
        },
      },
      defaultProps: {
        eyebrow: "브랜드 이야기",
        title: "왜 이 일을 시작했는지 들려주세요",
        body: "고객이 공감할 수 있는 시작 이유와 운영 원칙을 적어주세요.",
        imageUrl: "",
        imageSide: "right",
      },
      render: ({ eyebrow, title, body, imageUrl, imageSide }) => (
        <section className={`landing-block landing-block-story image-${imageSide}`}>
          <div><span>{eyebrow}</span><h2>{title}</h2><p>{body}</p></div>
          {imageUrl && <figure><img src={imageUrl} alt="" /></figure>}
        </section>
      ),
    },
    StatsSection: {
      label: "숫자·단계 강조",
      fields: {
        heading: text("섹션 제목"),
        value1: text("숫자 1"),
        label1: text("설명 1"),
        value2: text("숫자 2"),
        label2: text("설명 2"),
        value3: text("숫자 3"),
        label3: text("설명 3"),
      },
      defaultProps: {
        heading: "한눈에 보는 진행",
        value1: "01",
        label1: "필요 확인",
        value2: "02",
        label2: "조건 안내",
        value3: "03",
        label3: "실행 시작",
      },
      render: ({ heading, value1, label1, value2, label2, value3, label3 }) => (
        <section className="landing-block landing-block-stats"><h2>{heading}</h2><div>{[[value1, label1], [value2, label2], [value3, label3]].map(([value, label]) => <article key={`${value}-${label}`}><strong>{value}</strong><span>{label}</span></article>)}</div></section>
      ),
    },
    GallerySection: {
      label: "사진 3장",
      fields: {
        eyebrow: text("작은 제목"),
        heading: text("섹션 제목"),
        image1: imageField("사진 1"),
        caption1: text("사진 1 설명"),
        image2: imageField("사진 2"),
        caption2: text("사진 2 설명"),
        image3: imageField("사진 3"),
        caption3: text("사진 3 설명"),
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
      },
      render: ({ eyebrow, heading, image1, caption1, image2, caption2, image3, caption3 }) => (
        <section className="landing-block landing-block-gallery">
          <header><span>{eyebrow}</span><h2>{heading}</h2></header>
          <div>{[[image1, caption1], [image2, caption2], [image3, caption3]].filter(([image]) => image).map(([image, caption], index) => <figure key={`${caption}-${index}`}><img src={image} alt="" /><figcaption>{caption}</figcaption></figure>)}</div>
        </section>
      ),
    },
    OfferSection: {
      label: "상품·가격",
      fields: {
        eyebrow: text("작은 제목"),
        title: text("상품 이름"),
        description: area("상품 설명"),
        price: text("가격"),
        buttonLabel: text("버튼 문구"),
      },
      defaultProps: {
        eyebrow: "대표 상품",
        title: "첫 상품 이름",
        description: "고객이 받는 내용과 제공 범위를 적어주세요.",
        price: "가격 상담",
        buttonLabel: "문의하기",
      },
      render: ({ eyebrow, title, description, price, buttonLabel }) => (
        <section className="landing-block landing-block-offer"><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><aside><strong>{price}</strong><a href="#landing-contact">{buttonLabel}<ArrowRight /></a></aside></section>
      ),
    },
    /* 메뉴·가격표 — 음식점·매장 템플릿의 핵심. 값을 모르면 방문자는 문의하지 않는다 */
    PriceList: {
      label: "메뉴·가격",
      fields: {
        eyebrow: text("작은 안내 문구"),
        heading: text("제목"),
        name1: text("항목 1 이름"), desc1: text("항목 1 설명"), price1: text("항목 1 가격"),
        name2: text("항목 2 이름"), desc2: text("항목 2 설명"), price2: text("항목 2 가격"),
        name3: text("항목 3 이름"), desc3: text("항목 3 설명"), price3: text("항목 3 가격"),
        note: text("아래 안내"),
      },
      defaultProps: {
        eyebrow: "메뉴와 가격",
        heading: "무엇을 얼마에 드리는지",
        name1: "대표 상품", desc1: "구성과 포함 내용을 적어주세요.", price1: "가격 상담",
        name2: "", desc2: "", price2: "",
        name3: "", desc3: "", price3: "",
        note: "가격은 상황에 따라 달라질 수 있습니다.",
      },
      render: ({ eyebrow, heading, name1, desc1, price1, name2, desc2, price2, name3, desc3, price3, note }) => (
        <section className="landing-block landing-block-price">
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
        eyebrow: text("작은 안내 문구"),
        heading: text("제목"),
        address: text("주소"),
        hours: text("영업시간"),
        closed: text("휴무"),
        contact: text("연락처"),
      },
      defaultProps: {
        eyebrow: "찾아오는 길",
        heading: "언제, 어디로 오시면 되는지",
        address: "주소를 입력하세요",
        hours: "평일 09:00 - 18:00",
        closed: "일요일 휴무",
        contact: "",
      },
      render: ({ eyebrow, heading, address, hours, closed, contact }) => (
        <section className="landing-block landing-block-location">
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
        eyebrow: text("작은 안내 문구"),
        heading: text("제목"),
        q1: text("질문 1"), a1: area("답변 1"),
        q2: text("질문 2"), a2: area("답변 2"),
        q3: text("질문 3"), a3: area("답변 3"),
      },
      defaultProps: {
        eyebrow: "자주 묻는 질문",
        heading: "궁금한 점을 먼저 풀어 드립니다",
        q1: "신청 후에는 어떻게 되나요?", a1: "입력한 연락처로 확인 후 다음 절차를 안내합니다.",
        q2: "바로 결제해야 하나요?", a2: "아니요. 필요한 범위와 조건을 먼저 확인합니다.",
        q3: "", a3: "",
      },
      render: ({ eyebrow, heading, q1, a1, q2, a2, q3, a3 }) => (
        <section className="landing-block landing-block-faq">
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
        eyebrow: text("작은 제목"),
        title: area("큰 제목"),
        description: area("설명"),
        buttonLabel: text("버튼 문구"),
      },
      defaultProps: {
        eyebrow: "문의하기",
        title: "궁금한 점을 남겨주세요",
        description: "문의를 남겨주시면 알려주신 연락처로 답변드립니다.",
        buttonLabel: "문의하기",
      },
      render: ({ eyebrow, title, description, buttonLabel }) => (
        <section className="landing-block landing-block-cta"><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p><a href="#landing-contact">{buttonLabel}<ArrowRight /></a></section>
      ),
    },
  },
};

export function LandingBlocksRenderer({ data }: { data: LandingPageData }) {
  return (
    <div className="landing-block-page">
      {data.content.map((component, index) => {
        const renderer = landingBlockConfig.components[component.type]?.render as ComponentType<Record<string, unknown>> | undefined;
        if (!renderer) return null;
        const Block = renderer;
        return <Block key={String(component.props.id ?? `${component.type}-${index}`)} {...component.props} />;
      })}
    </div>
  );
}
