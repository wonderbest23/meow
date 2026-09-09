"use client";

import { PACKAGE_AMOUNT, REGEN_INCLUDED } from "../lib/payments/domain";
import { useEffect, useRef } from "react";
import { HomeScrollStory } from "./home-scroll-story";
import { HomeResultShowcase, HomeFounderWall } from "./home-result-showcase";
import { BRAINWAVE_CREDIT } from "../lib/landing/brainwave/catalog";
import styles from "./home-service-overview.module.css";

export function HomeServiceOverview({ onStart }: { onStart: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.seen = "true";
        observer.unobserve(entry.target);
      }
    }, { threshold: .15 });
    root.current.querySelectorAll("[data-reveal]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return <div className={styles.overview} ref={root}>
    <HomeScrollStory />
    <HomeResultShowcase />
    <HomeFounderWall />

    <section className={styles.difference} id="difference" aria-labelledby="home-difference-title">
      <div className={styles.section}>
        <header className={styles.heading} data-reveal>
          <span>오늘창업의 차이</span>
          <h2 id="home-difference-title">“챗GPT로 사업계획서 쓰면<br />되는 것 아닌가요?”</h2>
          <p>오늘창업도 AI를 사용해요. 대화 이후의<br className={styles.desktopBreak} /> 정리·수정·문서 관리를 연결했어요.</p>
        </header>
        <div className={styles.differenceRows}>
          <article data-reveal><span className={styles.keyword}>사업별 정리</span><div><h3>긴 대화가 내 사업안으로 남아요</h3><p>상품, 고객, 비용, 시작 방법을 항목별로 모아요. 다시 들어와도 같은 사업을 이어서 다듬어요.</p></div></article>
          <article data-reveal><span className={styles.keyword}>수정 연결</span><div><h3>무엇을 고쳤는지 놓치지 않아요</h3><p>직접 수정한 사업 정보는 저장하고, 기존 계획서에 반영이 필요한지 표시해요.</p></div></article>
          <article data-reveal><span className={styles.keyword}>계획과 실적 구분</span><div><h3>예상 숫자와 실제 실적을 구분해요</h3><p>입력한 조건으로 비용과 손익을 계산하고, AI가 제안한 값은 가정으로 다뤄요. 실제 견적과 고객 반응은 따로 확인해야 해요.</p></div></article>
        </div>
      </div>
    </section>

    <section className={styles.website} aria-labelledby="home-website-title">
      <div className={styles.section}>
        <header className={styles.heading} data-reveal>
          <span>계획 다음, 필요한 만큼</span>
          <h2 id="home-website-title">내 사업을 보여줄<br />홈페이지가 필요하다면.</h2>
          <p>계획이 정리된 뒤, 제작 범위와 비용을<br className={styles.desktopBreak} /> 상담하고 다음 단계를 선택하세요.</p>
        </header>
        <div className={styles.siteExamples} data-reveal>
          <figure><img src="/brainwave/thumbs/0-290.jpg" width="640" height="560" loading="lazy" alt="상담 서비스용 홈페이지 디자인 템플릿 예시" /><figcaption>상담·전문 서비스</figcaption></figure>
          <figure><img src="/brainwave/thumbs/0-2226.jpg" width="640" height="560" loading="lazy" alt="공간 운영용 홈페이지 디자인 템플릿 예시" /><figcaption>공간·매장 소개</figcaption></figure>
        </div>
        <p className={styles.templateNote}>디자인 템플릿 예시이며, 이미지 속 업체·수치·후기는 실제 고객 실적이 아니에요.<br /><a href={BRAINWAVE_CREDIT.url} target="_blank" rel="noopener noreferrer">{BRAINWAVE_CREDIT.text}</a> · 한글 문구 적용 · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">라이선스</a></p>
        <div className={styles.actions}><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("venture:open-support-chat", { detail: { mode: "support", message: "홈페이지 제작을 상담하고 싶어요. 제작 범위와 비용을 알려주세요." } }))}>홈페이지 제작 상담하기</button></div>
      </div>
    </section>

    <section className={`${styles.section} ${styles.usage}`} id="price" aria-labelledby="home-usage-title">
      <header className={styles.heading}><span>이용 안내</span><h2 id="home-usage-title">시작 전에 궁금한 것.</h2></header>
      <div className={styles.faq}>
        <details><summary>아이디어가 없거나 이미 사업 중이어도 되나요?</summary><p>네. 관심 있는 일, 해 본 일, 지금 사업에서 바꾸고 싶은 점을 이야기해 주세요. 사업자등록 없이도 사업안을 기획할 수 있어요.</p></details>
        <details><summary>어디까지 무료이고, 언제 결제하나요?</summary><p>로그인 후 계정당 최대 3개 문서에서 앞 2개 항목을 무료로 생성할 수 있어요. 전체 문서 생성과 PDF·Word·PPT 내려받기는 문서 1부당 {PACKAGE_AMOUNT.toLocaleString("ko-KR")}원 결제 후 이용해요. 섹션 다시 생성 {REGEN_INCLUDED}회가 포함되며, 최종 금액과 제공 범위는 결제 화면에서 확인해 주세요.</p></details>
        <details><summary>완성한 내용을 그대로 제출해도 되나요?</summary><p>내용과 수치를 직접 확인한 뒤 사용해 주세요. 시장 조사나 전문가 검토를 대신하지 않으며, 지원사업 제출 적합성이나 사업 성공을 보장하지 않아요.</p></details>
        <details><summary>홈페이지 제작이나 사업자등록도 자동으로 되나요?</summary><p>현재 중심 기능은 사업 기획, 문서 제작, 사업별 자료 관리예요. 홈페이지 제작 등 추가 작업은 필요한 범위를 따로 확인하며, 사업자등록·세무·계약이 자동으로 완료되는 서비스는 아니에요.</p></details>
      </div>
      <div className={styles.closing} data-reveal><p>완벽한 아이디어가<br /><strong>아니어도 괜찮아요.</strong></p></div>
      <div className={styles.actions}><button type="button" onClick={onStart}>대화로 시작하기</button><a href="/plan">내 사업 이어가기</a></div>
    </section>
  </div>;
}
