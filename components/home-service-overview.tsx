"use client";

import { PACKAGE_AMOUNT, REGEN_INCLUDED } from "../lib/payments/domain";
import { PPT_GENERATION_VERIFIED } from "../lib/plan-builder/deck-availability";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { HomePhoneStory as HomeScrollStory } from "./home-phone-story";
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
          <h2 id="home-difference-title">챗GPT로 <span className={styles.phrase}>사업계획서 쓰면</span><br />되는 것 아닌가요</h2>
          <p>맞아요 AI로도 초안을 쓸 수 있어요<br />오늘창업은 그 뒤에 필요한 근거 확인과 계산<br className={styles.desktopBreak} /> 수정 관리를 하나의 과정으로 연결했어요</p>
        </header>
        <div className={styles.differenceRows}>
          <article data-reveal>
            <span className={styles.keyword}>입력 근거 대조</span>
            <div><h3>내가 말한 조건과<br className={styles.mobileBreak} /> AI의 제안을 구분해요</h3><p>고객과 상품 예산을 항목별로 저장해요 사용자 입력으로 분류된 내용은 원래 발언과 대조하고 AI의 제안이 기존 입력을 덮어쓰지 않도록 해요</p><dl className={styles.proof}><div><dt>사용자 입력</dt><dd>시작 예산 100만원</dd></div><div><dt>AI 제안</dt><dd>메뉴 사진 촬영 서비스</dd></div></dl></div>
          </article>
          <article data-reveal>
            <span className={styles.keyword}>별도 계산 로직</span>
            <div><h3>가능하다는 답변 대신<br className={styles.mobileBreak} /> 숫자를 먼저 점검해요</h3><p>AI가 쓴 설명과 별개로 예산 대비 초기 지출과 건당 원가를 계산해요 판매량에 필요한 작업시간도 비교하고 값이 부족하면 판단을 보류해요</p><dl className={styles.proof}><div><dt>시작 예산</dt><dd>100만원</dd></div><div><dt>초기 지출</dt><dd>150만원</dd></div><div className={styles.attention}><dt>계산 결과</dt><dd>50만원 부족</dd></div></dl></div>
          </article>
          <article data-reveal>
            <span className={styles.keyword}>문서 버전 비교</span>
            <div><h3>사업안이 바뀌어도<br className={styles.mobileBreak} /> 내가 고친 문장은 지켜요</h3><p>현재 사업안과 문서를 만들 때의 버전을 비교해 다시 확인할 항목을 찾아요 직접 수정하거나 잠근 항목은 자동으로 덮어쓰지 않고 검토 대상으로 남겨요</p><dl className={styles.proof}><div><dt>사업안 변경</dt><dd>판매 가격 조정</dd></div><div><dt>직접 수정한 문서</dt><dd>기존 내용 유지 후 검토</dd></div></dl></div>
          </article>
        </div>
        <p className={styles.differenceNote}>이해를 돕기 위한 예시예요 입력 근거 대조는 발언 확인이며 외부 사실 검증은 아니에요<br className={styles.desktopBreak} /> 계산은 입력값에 따른 점검이므로 실제 견적과 시장 반응은 직접 확인해야 해요</p>
      </div>
    </section>

    <section className={styles.website} aria-labelledby="home-website-title">
      <div className={styles.section}>
        <header className={styles.heading} data-reveal>
          <h2 id="home-website-title">내 사업을 보여줄<br />홈페이지가 필요하다면</h2>
          <p>사업계획서 내용으로 홈페이지 초안을 자동 생성해요<br className={styles.desktopBreak} /> 내 사업에 맞춰 확인하고 필요한 만큼 다듬으세요</p>
        </header>
        <div className={styles.siteExamples} data-reveal>
          <figure><img src="/brainwave/thumbs/0-290.jpg" width="640" height="560" loading="lazy" alt="상담 서비스용 홈페이지 디자인 템플릿 예시" /><figcaption>상담 및 전문 서비스</figcaption></figure>
          <figure><img src="/brainwave/thumbs/0-2226.jpg" width="640" height="560" loading="lazy" alt="공간 운영용 홈페이지 디자인 템플릿 예시" /><figcaption>공간 및 매장 소개</figcaption></figure>
        </div>
        <p className={styles.templateNote}>디자인 템플릿 예시이며, 이미지 속 업체·수치·후기는 실제 고객 실적이 아니에요.<br /><a href={BRAINWAVE_CREDIT.url} target="_blank" rel="noopener noreferrer">{BRAINWAVE_CREDIT.text}</a> · 한글 문구 적용 · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">라이선스</a></p>
        <div className={styles.actions}><a className={styles.websiteCreate} href="/plan/homepage"><span>홈페이지 100% 자동 생성<small>맞춤 제작은 유료</small></span><ArrowRight aria-hidden="true" /></a></div>
        <p className={styles.websiteTerms}>사업계획서 기반 초안 미리보기는 무료이며, 편집·공개는 별도 결제가 필요해요.</p>
      </div>
    </section>

    <section className={`${styles.section} ${styles.usage}`} id="price" aria-labelledby="home-usage-title">
      <header className={styles.heading}><h2 id="home-usage-title">시작 전에 궁금한 것</h2></header>
      <div className={styles.faq}>
        <details><summary>아이디어가 없거나 이미 사업 중이어도 되나요?</summary><p>네. 관심 있는 일, 해 본 일, 지금 사업에서 바꾸고 싶은 점을 이야기해 주세요. 사업자등록 없이도 사업안을 기획할 수 있어요.</p></details>
        <details><summary>어디까지 무료이고, 언제 결제하나요?</summary><p>로그인 후 계정당 최대 3개 문서에서 앞 2개 항목을 무료로 생성할 수 있어요. 전체 문서 생성과 {PPT_GENERATION_VERIFIED ? "PDF·Word·PPT" : "PDF·Word"} 내려받기는 문서 1부당 {PACKAGE_AMOUNT.toLocaleString("ko-KR")}원 결제 후 이용해요. 섹션 다시 생성 {REGEN_INCLUDED}회가 포함되며, 최종 금액과 제공 범위는 결제 화면에서 확인해 주세요.{!PPT_GENERATION_VERIFIED && " PPT 자동 생성은 제공 준비 중이며 현재 결제 제공 범위에 포함되지 않아요."}</p></details>
        <details><summary>완성한 내용을 그대로 제출해도 되나요?</summary><p>내용과 수치를 직접 확인한 뒤 사용해 주세요. 시장 조사나 전문가 검토를 대신하지 않으며, 지원사업 제출 적합성이나 사업 성공을 보장하지 않아요.</p></details>
        <details><summary>홈페이지 제작이나 사업자등록도 자동으로 되나요?</summary><p>사업계획서에 정리한 내용으로 홈페이지 초안을 자동 생성해요. 초안 미리보기는 무료이며, 편집·공개는 별도 결제가 필요해요. 맞춤 제작은 범위와 비용을 따로 상담해요. 사업자등록·세무·계약이 자동으로 완료되는 서비스는 아니에요.</p></details>
      </div>
      <div className={styles.closing} data-reveal><p>완벽한 아이디어가<br /><strong>아니어도 괜찮아요</strong></p></div>
      <div className={styles.actions}><button type="button" onClick={onStart}>대화로 시작하기</button><a href="/plan">내 사업 이어가기</a></div>
    </section>
  </div>;
}
