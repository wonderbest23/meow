"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { useHomeScroll } from "./use-home-scroll";
import styles from "./home-result-showcase.module.css";
import { PPT_GENERATION_VERIFIED } from "../lib/plan-builder/deck-availability";
import { HomeWorkspaceDemo } from "./home-workspace-demo";

function DocumentLayers() {
  return <div className={styles.paperStack}>
    <div className={`${styles.paper} ${styles.paperBack}`} data-motion-layer><img src="/home-media/results/report-01.webp" width="1132" height="1600" loading="lazy" decoding="async" alt="" /></div>
    <div className={`${styles.paper} ${styles.paperMiddle}`} data-motion-layer><img src="/home-media/results/report-15.webp" width="1132" height="1600" loading="lazy" decoding="async" alt="" /></div>
    <div className={`${styles.paper} ${styles.paperCover}`} data-motion-layer><img src="/home-media/results/report-03.webp" width="1132" height="1600" loading="lazy" decoding="async" alt="" /></div>
  </div>;
}

const sampleSlides = [
  { page: "01", title: "사업 제안서" },
  { page: "03", title: "문제 정의" },
  { page: "08", title: "재무 계획" },
];

function PresentationLayers() {
  return <div className={styles.deck}>
    <div className={styles.slideMain}>
      {sampleSlides.map((slide, index) => <img key={slide.page} className={styles.slideImage} data-motion-layer style={{ "--slide": index } as React.CSSProperties} src={`/home-media/results/deck-${slide.page}.webp`} width="1600" height="900" loading="lazy" decoding="async" alt="" />)}
    </div>
    <div className={styles.slideStrip}>{sampleSlides.map((slide, index) => <div className={styles.slideThumb} key={slide.page}>
      <img src={`/home-media/results/deck-${slide.page}.webp`} width="1600" height="900" loading="lazy" decoding="async" alt="" />
      <span>{slide.page} · {slide.title}</span>
      <i data-motion-layer style={{ "--slide": index } as React.CSSProperties} />
    </div>)}</div>
  </div>;
}

function AnimatedGraphic({ name, alt, caption }: { name: "business-plan" | "presentation"; alt: string; caption: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => {
      element.dataset.running = String(visible && !document.hidden && !reduced.matches);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) element.dataset.entered = "true";
      update();
    }, { threshold: 0.15 });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  return <div className={styles.visual} ref={ref} data-graphic={name} role="img" aria-label={alt}>
    <div className={styles.sampleMeta} aria-hidden="true"><span>{name === "business-plan" ? "PDF · 16 PAGES" : "PPT · 10 SLIDES"}</span><span>새벽커피</span></div>
    <div className={styles.graphicEntrance} aria-hidden="true">
      {name === "business-plan" ? <DocumentLayers /> : <PresentationLayers />}
    </div>
    <span className={styles.visualCaption}>{caption}</span>
  </div>;
}

export function HomeResultShowcase() {
  return <section id="deliverables" className={styles.results} aria-labelledby="home-results-title">
    <header className={styles.heading} data-reveal><h2 id="home-results-title">이제 생각을 꺼내 쓰세요</h2><p>읽고 고치고 다음 일을 이어가는 내 사업 자료</p></header>
    <div className={styles.panels}>
      <article className={styles.panel} data-reveal>
        <AnimatedGraphic name="business-plan" alt="새벽커피 공개 PDF의 실제 표지, 사업 개요와 표, 12개월 손익 추정과 그래프 페이지" caption="공개 PDF 샘플의 실제 페이지 · 가상 사업" />
        <div className={styles.panelCopy}><span>사업계획서</span><h3>내 사업을 설명하는<br />한 권의 계획</h3><p>사업 소개부터 고객과 비용 운영까지<br />PDF와 수정 가능한 Word로</p><a href="/samples/sample_coffee.pdf" target="_blank" rel="noopener noreferrer"><span>PDF 샘플 열기</span><ArrowUpRight aria-hidden="true" /></a></div>
      </article>
      <article className={`${styles.panel} ${styles.presentation}`} data-reveal>
        <AnimatedGraphic name="presentation" alt="새벽커피 공개 PPT의 실제 사업 제안서 표지, 문제 정의, 재무 계획 슬라이드" caption="공개 PPT 샘플의 실제 슬라이드 · 가상 사업" />
        <div className={styles.panelCopy}><span>발표자료{!PPT_GENERATION_VERIFIED && <span className={styles.availability}>제공 준비 중</span>}</span><h3>이야기는 짧게<br />핵심은 선명하게</h3><p>{PPT_GENERATION_VERIFIED ? <>정리한 사업계획서를 바탕으로<br />발표용 PPT를 만들어요</> : <>PPT 자동 생성은 준비 중이에요<br />공개 샘플을 먼저 확인해 보세요</>}</p><a href="/samples/sample_coffee.pptx" download><span>PPT 샘플 받기</span><ArrowUpRight aria-hidden="true" /></a></div>
      </article>
      <article className={styles.panel} data-reveal>
        <HomeWorkspaceDemo />
        <div className={styles.panelCopy}><span>내 사업 관리</span><h3>계획 다음의 일도<br />끊기지 않도록</h3><p>사업안과 문서 대화와 다음 할 일을<br />사업별로 이어가요</p><a href="/plan"><span>내 사업 열기</span><ArrowUpRight aria-hidden="true" /></a></div>
      </article>
    </div>
    <p className={styles.note}>가상 사업으로 표현한 이용 흐름이며, 실제 내용과 화면은 사업별로 달라져요.<br />전체 문서 생성과 파일 내려받기는 결제 후 이용하며, AI 초안은 검토·수정해서 사용해야 해요.</p>
  </section>;
}

const professions = ["카페 창업", "음식점 창업", "배송 사업", "온라인 쇼핑몰", "공방 창업", "꽃집 창업", "앱 개발", "반려동물 돌봄", "가구 제작", "프리랜서 창업"];

export function HomeFounderWall() {
  const ref = useHomeScroll();
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.portraitSeen = "true";
        observer.unobserve(entry.target);
      }
    }, { threshold: .35 });
    root.querySelectorAll("[data-portrait]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [ref]);
  return <div className={styles.founders} ref={ref} data-founder-wall>
    <header data-reveal><h2>처음이어도<br />다시 시작해도</h2><p>당신의 경험과 조건에서<br />내 사업의 가능성을 찾아요</p></header>
    <div className={styles.portraitViewport} data-portrait-viewport>
      <div className={styles.portraits}>{professions.map((profession, index) => <figure className={styles.portrait} data-portrait key={profession} style={{ "--column": index % 5, "--row": Math.floor(index / 5), "--offset": index % 2 ? 1 : -1, "--bubble-delay": `${(index % 5) * 140}ms`, "--bubble-mobile-delay": `${(index % 2) * 180}ms` } as React.CSSProperties}><img src="/home-media/oneulstart-founders.png" width="1976" height="796" loading="lazy" alt={`${profession} 브랜드 이미지`} /><figcaption className={styles.professionBubble}>{profession}</figcaption></figure>)}</div>
    </div>
    <p className={styles.imageNote}>다양한 사업의 시작을 표현한 브랜드 이미지이며, 실제 이용 후기 사진은 아니에요.</p>
  </div>;
}
