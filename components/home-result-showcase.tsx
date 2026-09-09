"use client";

import { ArrowUpRight } from "lucide-react";
import { useHomeScroll } from "./use-home-scroll";
import styles from "./home-result-showcase.module.css";

export function HomeResultShowcase() {
  return <section id="deliverables" className={styles.results} aria-labelledby="home-results-title">
    <header className={styles.heading} data-reveal><span>대화 다음에 남는 것</span><h2 id="home-results-title">이제, 생각을 꺼내 쓰세요.</h2><p>읽고, 고치고, 다음 일을 이어가는 내 사업 자료.</p></header>
    <div className={styles.panels}>
      <article className={`${styles.panel} ${styles.document}`} data-reveal>
        <div className={styles.visual}>
          <div className={styles.paperStack}><div className={styles.backPaper} /><img src="/samples/sample_coffee-cover.png" width="778" height="1100" loading="lazy" alt="새벽커피 가상 사업계획서 PDF의 실제 표지" /></div>
          <span className={styles.visualCaption}>공개 샘플 PDF</span>
        </div>
        <div className={styles.panelCopy}><span>01 · 사업계획서</span><h3>내 사업을 설명하는<br />한 권의 계획.</h3><p>사업 소개부터 고객·비용·운영까지.<br />PDF와 수정 가능한 Word로.</p><a href="/samples/sample_coffee.pdf" target="_blank" rel="noopener noreferrer"><span>PDF 샘플 열기</span><ArrowUpRight aria-hidden="true" /></a></div>
      </article>
      <article className={`${styles.panel} ${styles.presentation}`} data-reveal>
        <div className={styles.visual}>
          <div className={styles.slides} aria-label="사업 소개, 고객과 상품, 운영 계획으로 구성되는 발표자료 예시">
            <div className={styles.slide}><span>BUSINESS PLAN</span><strong>내 사업의 시작,<br />한눈에 전하는 이야기.</strong><div className={styles.slideRule} /><small>사업 소개 · 고객과 상품 · 운영 계획</small></div>
            <div className={styles.slideTabs} aria-hidden="true"><i /><i /><i /></div>
          </div>
          <span className={styles.visualCaption}>발표자료 구성 예시</span>
        </div>
        <div className={styles.panelCopy}><span>02 · 발표자료</span><h3>이야기는 짧게.<br />핵심은 선명하게.</h3><p>정리한 사업계획서를 바탕으로<br />발표용 PPT를 만들어요.</p><a href="/samples/sample_coffee.pptx" download><span>PPT 샘플 받기</span><ArrowUpRight aria-hidden="true" /></a></div>
      </article>
      <article className={`${styles.panel} ${styles.workspace}`} data-reveal>
        <div className={styles.visual}>
          <div className={styles.tasks}><div className={styles.taskHeader}>내 사업 관리<span>한곳에서 이어서</span></div><div><span>사업안</span><strong>상품과 고객 정리</strong><i /></div><div><span>내 자료</span><strong>계획서 확인과 수정</strong><i /></div><div><span>다음 할 일</span><strong>첫 제안 준비하기</strong><i /></div></div>
          <span className={styles.visualCaption}>사업 관리 화면 구성 예시</span>
        </div>
        <div className={styles.panelCopy}><span>03 · 내 사업 관리</span><h3>계획 다음의 일도<br />끊기지 않도록.</h3><p>사업안과 문서, 대화와 다음 할 일을<br />사업별로 이어가요.</p><a href="/plan"><span>내 사업 열기</span><ArrowUpRight aria-hidden="true" /></a></div>
      </article>
    </div>
    <p className={styles.note}>공개 샘플은 가상 사례예요. 전체 문서 생성과 파일 내려받기는 결제 후 이용하며, AI 초안은 검토·수정해서 사용해야 해요.</p>
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
