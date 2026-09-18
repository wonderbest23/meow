"use client";

import { PACKAGE_AMOUNT, REGEN_INCLUDED } from "../lib/payments/domain";
import { PPT_GENERATION_VERIFIED } from "../lib/plan-builder/deck-availability";
import { useEffect, useRef } from "react";
import { HomeWebsiteDemo } from "./home-website-demo";
import { HomeBrandClosing } from "./home-brand-closing";
import { HomeResultShowcase, HomeFounderWall } from "./home-result-showcase";
import { BRAINWAVE_CREDIT } from "../lib/landing/brainwave/catalog";
import styles from "./home-service-overview.module.css";
import { HomeAction } from "./home-action";
import { useHomeCopyMotion } from "./use-home-copy-motion";
import { Lightbulb, MessageSquareText, Send, SlidersHorizontal, UsersRound } from "lucide-react";

const planningSteps = [
  { title: "관심과 경험", description: "좋아하는 일에서 아이템을 찾고", icon: Lightbulb },
  { title: "고객과 상품", description: "누구에게 무엇을 팔지 정하고", icon: UsersRound },
  { title: "가격과 운영", description: "내 조건에 맞는 시작안을 만들고", icon: SlidersHorizontal },
  { title: "첫 실행 방법", description: "처음 해볼 일까지 제안해요", icon: Send },
];

export function HomeServiceOverview({ onStart }: { onStart: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useHomeCopyMotion(root);
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
    <HomeResultShowcase />
    <HomeFounderWall />

    <section className={styles.difference} id="difference" aria-labelledby="home-difference-title">
      <div className={styles.section}>
        <header className={styles.heading} data-home-copy>
          <h2 id="home-difference-title">사업을 기획하는 순서로<br />대화를 이끌어요</h2>
          <p>무엇을 물어볼지 고민하지 않아도 괜찮아요<br />고객과 상품부터 시작할 방법까지 함께 정리해요</p>
        </header>
        <div className={styles.planningExample}>
          <div className={styles.planningSeed} data-reveal>
            <MessageSquareText aria-hidden="true" />
            <div><span>나의 한마디</span><blockquote>사진 찍는 걸 좋아해요<br />주 5시간으로 시작할 수 있을까요</blockquote></div>
          </div>
          <ol className={styles.planningSteps} aria-label="사업 기획 흐름">
            {planningSteps.map(({ title, description, icon: Icon }) => <li key={title} data-reveal>
              <span className={styles.planningMarker} aria-hidden="true"><Icon /></span>
              <div><h3>{title}</h3><p>{description}</p></div>
            </li>)}
          </ol>
          <div className={styles.planningOutcome} data-reveal>
            <header><span>함께 정리한 시작안</span><h3>동네 가게<br />메뉴 사진 제작</h3></header>
            <dl>
              <div><dt>고객</dt><dd>가까운 음식점과 카페</dd></div>
              <div><dt>상품</dt><dd>메뉴 1개의 사진과 소개문구</dd></div>
              <div><dt>첫 시작</dt><dd>샘플 1세트를 만들어 가게에 제안하기</dd></div>
            </dl>
          </div>
          <p className={styles.differenceNote}>이해를 돕기 위한 기획 예시예요 대화 내용에 따라 질문과 제안이 달라져요<br className={styles.desktopBreak} /> 이미 운영 중이라면 현재 문제와 매출 비용을 중심으로 개선안을 정리해요</p>
        </div>
      </div>
    </section>

    <section className={styles.website} aria-labelledby="home-website-title">
      <div className={styles.section}>
        <header className={styles.heading} data-home-copy>
          <h2 id="home-website-title">내 사업을 보여줄<br />홈페이지가 필요하다면</h2>
          <p>사업계획서 내용으로 홈페이지 초안을 자동 생성해요<br className={styles.desktopBreak} /> 내 사업에 맞춰 확인하고 필요한 만큼 다듬으세요</p>
        </header>
        <HomeWebsiteDemo />
        <p className={styles.templateNote}>실제 홈페이지 렌더러로 구성한 가상 사업의 편집 예시예요 이미지와 수치는 실제 고객 실적이 아니에요<br /><a href={BRAINWAVE_CREDIT.url} target="_blank" rel="noopener noreferrer">{BRAINWAVE_CREDIT.text}</a> · 한글 문구 적용 · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">라이선스</a></p>
        <div className={styles.actions}><HomeAction href="/plan/homepage" variant="solid">홈페이지 100% 자동 생성<small>맞춤 제작은 유료</small></HomeAction></div>
        <p className={styles.websiteTerms}>사업계획서 기반 초안 미리보기는 무료이며, 편집·공개는 별도 결제가 필요해요.</p>
      </div>
    </section>

    <section className={`${styles.section} ${styles.usage}`} id="price" aria-labelledby="home-usage-title">
      <header className={styles.heading} data-home-copy><h2 id="home-usage-title">시작 전에 궁금한 것</h2></header>
      <div className={styles.faq}>
        <details><summary>아이디어가 없거나 이미 사업 중이어도 되나요?</summary><p>네. 관심 있는 일, 해 본 일, 지금 사업에서 바꾸고 싶은 점을 이야기해 주세요. 사업자등록 없이도 사업안을 기획할 수 있어요.</p></details>
        <details><summary>어디까지 무료이고, 언제 결제하나요?</summary><p>로그인 후 계정당 최대 3개 문서에서 앞 2개 항목을 무료로 생성할 수 있어요. 전체 문서 생성과 {PPT_GENERATION_VERIFIED ? "PDF·Word·PPT" : "PDF·Word"} 내려받기는 문서 1부당 {PACKAGE_AMOUNT.toLocaleString("ko-KR")}원 결제 후 이용해요. 섹션 다시 생성 {REGEN_INCLUDED}회가 포함되며, 최종 금액과 제공 범위는 결제 화면에서 확인해 주세요.{!PPT_GENERATION_VERIFIED && " PPT 자동 생성은 제공 준비 중이며 현재 결제 제공 범위에 포함되지 않아요."}</p></details>
        <details><summary>완성한 내용을 그대로 제출해도 되나요?</summary><p>내용과 수치를 직접 확인한 뒤 사용해 주세요. 시장 조사나 전문가 검토를 대신하지 않으며, 지원사업 제출 적합성이나 사업 성공을 보장하지 않아요.</p></details>
        <details><summary>홈페이지 제작이나 사업자등록도 자동으로 되나요?</summary><p>사업계획서에 정리한 내용으로 홈페이지 초안을 자동 생성해요. 초안 미리보기는 무료이며, 편집·공개는 별도 결제가 필요해요. 맞춤 제작은 범위와 비용을 따로 상담해요. 사업자등록·세무·계약이 자동으로 완료되는 서비스는 아니에요.</p></details>
      </div>
    </section>
    <HomeBrandClosing onStart={onStart} />
  </div>;
}
