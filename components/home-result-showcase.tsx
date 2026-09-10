"use client";

import { ArrowUpRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHomeScroll } from "./use-home-scroll";
import styles from "./home-result-showcase.module.css";

function AnimatedGraphic({ name, alt, caption, paused }: { name: string; alt: string; caption: string; paused: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => {
      element.dataset.running = String(visible && !document.hidden && !reduced.matches && !paused);
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
  }, [paused]);

  return <div className={styles.visual} ref={ref} data-graphic={name}>
    <div className={styles.graphicEntrance}>
      <div className={styles.graphicMotion}>
        <img src={`/home-media/${name}-graphic.png`} width="1254" height="1254" loading="lazy" decoding="async" alt={alt} />
      </div>
    </div>
    <span className={styles.visualCaption}>{caption}</span>
  </div>;
}

export function HomeResultShowcase() {
  const [paused, setPaused] = useState(false);
  return <section id="deliverables" className={styles.results} aria-labelledby="home-results-title">
    <header className={styles.heading} data-reveal><span>대화 다음에 남는 것</span><h2 id="home-results-title">이제, 생각을 꺼내 쓰세요.</h2><p>읽고, 고치고, 다음 일을 이어가는 내 사업 자료.</p><button className={styles.motionToggle} type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "그래픽 애니메이션 재생" : "그래픽 애니메이션 일시 정지"} title={paused ? "그래픽 애니메이션 재생" : "그래픽 애니메이션 일시 정지"}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button></header>
    <div className={styles.panels}>
      <article className={`${styles.panel} ${styles.document}`} data-reveal>
        <AnimatedGraphic name="business-plan" alt="사업계획서 표지와 분석 페이지를 펼친 그래픽" caption="사업계획서 그래픽 예시" paused={paused} />
        <div className={styles.panelCopy}><span>01 · 사업계획서</span><h3>내 사업을 설명하는<br />한 권의 계획.</h3><p>사업 소개부터 고객·비용·운영까지.<br />PDF와 수정 가능한 Word로.</p><a href="/samples/sample_coffee.pdf" target="_blank" rel="noopener noreferrer"><span>PDF 샘플 열기</span><ArrowUpRight aria-hidden="true" /></a></div>
      </article>
      <article className={`${styles.panel} ${styles.presentation}`} data-reveal>
        <AnimatedGraphic name="presentation" alt="태블릿과 여러 발표 슬라이드를 입체적으로 배치한 그래픽" caption="발표자료 그래픽 예시" paused={paused} />
        <div className={styles.panelCopy}><span>02 · 발표자료</span><h3>이야기는 짧게.<br />핵심은 선명하게.</h3><p>정리한 사업계획서를 바탕으로<br />발표용 PPT를 만들어요.</p><a href="/samples/sample_coffee.pptx" download><span>PPT 샘플 받기</span><ArrowUpRight aria-hidden="true" /></a></div>
      </article>
      <article className={`${styles.panel} ${styles.workspace}`} data-reveal>
        <AnimatedGraphic name="workspace" alt="사업 관리 대시보드를 표현한 콘셉트 그래픽으로, 실제 서비스 화면이 아닙니다" caption="사업 관리 콘셉트 · 실제 화면 아님" paused={paused} />
        <div className={styles.panelCopy}><span>03 · 내 사업 관리</span><h3>계획 다음의 일도<br />끊기지 않도록.</h3><p>사업안과 문서, 대화와 다음 할 일을<br />사업별로 이어가요.</p><a href="/plan"><span>내 사업 열기</span><ArrowUpRight aria-hidden="true" /></a></div>
      </article>
    </div>
    <p className={styles.note}>이미지는 연출용 그래픽이며, 표시된 수치와 관리 기능은 실제 실적·제공 기능을 의미하지 않아요.<br />공개 샘플은 가상 사례예요. 전체 문서 생성과 파일 내려받기는 결제 후 이용하며, AI 초안은 검토·수정해서 사용해야 해요.</p>
  </section>;
}

const professions = ["카페 운영", "음식점 창업", "배송 서비스", "온라인 사업", "공방 운영", "꽃집 창업", "개발 서비스", "반려동물 서비스", "수공예 사업", "전문 서비스"];

export function HomeFounderWall() {
  const ref = useHomeScroll();
  return <div className={styles.founders} ref={ref} data-founder-wall>
    <header data-reveal><span>서로 다른 시작, 나만의 계획</span><h2>처음이어도.<br />다시 시작해도.</h2><p>당신의 경험과 조건에서<br />내 사업의 가능성을 찾아요.</p></header>
    <div className={styles.portraits}>{professions.map((profession, index) => <div className={styles.portrait} key={profession} style={{ "--column": index % 5, "--row": Math.floor(index / 5), "--offset": index % 2 ? 1 : -1 } as React.CSSProperties}><img src="/home-media/oneulstart-founders.png" width="1976" height="796" loading="lazy" alt={`${profession}을 표현한 브랜드 이미지`} /></div>)}</div>
    <p className={styles.imageNote}>다양한 사업의 시작을 표현한 브랜드 이미지이며, 실제 이용 후기 사진은 아니에요.</p>
  </div>;
}
