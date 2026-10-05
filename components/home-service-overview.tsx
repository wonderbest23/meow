"use client";

import { BUNDLE_PRODUCT_AMOUNT, HOMEPAGE_PRODUCT_AMOUNT, PACKAGE_AMOUNT, REGEN_INCLUDED } from "../lib/payments/domain";
import { PPT_GENERATION_VERIFIED } from "../lib/plan-builder/deck-availability";
import { useEffect, useRef } from "react";
import { HomeWebsiteDemo } from "./home-website-demo";
import { HomeBrandClosing } from "./home-brand-closing";
import { HomeResultShowcase, HomeFounderWall } from "./home-result-showcase";
import styles from "./home-service-overview.module.css";
import { HomeAction } from "./home-action";
import { useHomeCopyMotion } from "./use-home-copy-motion";
import { CoachMessage } from "./coach-chat-ui";
import chatUi from "./coach-chat-ui.module.css";

/* 실제 새 대화처럼 — 한마디를 하면 AI가 기획 순서대로 질문 하나와 고를 수 있는 답을 준다 */
const chatChoices = ["음식·가게 사진", "사람·프로필 사진", "행사·스냅 사진", "아직 잘 모르겠어요"];

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
        <div className={`${styles.chatDemo} ${chatUi.theme}`} data-reveal aria-label="대화 예시">
          <CoachMessage role="user"><p>사진 찍는 걸 좋아해요. 이걸 사업으로 할 수 있는 방법이 없을까요?</p></CoachMessage>
          <CoachMessage role="assistant"><p>좋아요, 사진으로 시작할 수 있는 길은 여러 가지예요. 먼저 하나만 여쭤볼게요. 주로 어떤 사진을 찍으세요?</p></CoachMessage>
          <ul className={styles.chatChoices} aria-label="고를 수 있는 답">{chatChoices.map(choice => <li key={choice}>{choice}</li>)}</ul>
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
        <div className={styles.actions}>{/* 홈페이지는 계획서로 만든 초안에서 시작한다 — 사업이 없는 사람이 홈페이지 화면으로 가면 막힌 안내만 본다 */}<HomeAction href="/plan/chat?new=1" variant="solid">대화로 시작해 홈페이지 초안 받기</HomeAction></div>
      </div>
    </section>

    <section className={`${styles.section} ${styles.usage}`} id="price" aria-labelledby="home-usage-title">
      <header className={styles.heading} data-home-copy><h2 id="home-usage-title">시작 전에 궁금한 것</h2></header>
      <div className={styles.faq}>
        <details><summary>아이디어가 없거나 이미 사업 중이어도 되나요?</summary><p>네. 관심 있는 일, 해 본 일, 지금 사업에서 바꾸고 싶은 점을 이야기해 주세요. 사업자등록 없이도 사업안을 기획할 수 있어요.</p></details>
        <details><summary>어디까지 무료이고, 언제 결제하나요?</summary><p>로그인 후 계정당 사업 3개까지 각 사업계획서의 앞 2개 항목을 무료로 만들 수 있어요. 전체 문서 생성과 {PPT_GENERATION_VERIFIED ? "PDF·Word·PPT" : "PDF·Word"} 내려받기는 사업 하나당 {PACKAGE_AMOUNT.toLocaleString("ko-KR")}원 결제 후 이용해요. 다시 생성 {REGEN_INCLUDED}회가 포함되며, 최종 금액과 제공 범위는 결제 화면에서 확인해 주세요.{!PPT_GENERATION_VERIFIED && " PPT 자동 생성은 제공 준비 중이며 현재 결제 제공 범위에 포함되지 않아요."}</p></details>
        <details><summary>완성한 내용을 그대로 제출해도 되나요?</summary><p>내용과 수치를 직접 확인한 뒤 사용해 주세요. 시장 조사나 전문가 검토를 대신하지 않으며, 지원사업 제출 적합성이나 사업 성공을 보장하지 않아요.</p></details>
        <details><summary>홈페이지 제작이나 사업자등록도 자동으로 되나요?</summary><p>사업계획서에 정리한 내용으로 홈페이지 초안을 자동 생성해요. 초안 미리보기는 무료이며, 편집·공개는 홈페이지 {HOMEPAGE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원(계획서와 함께 열면 {BUNDLE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원) 결제 후 이용해요. 맞춤 제작은 범위와 비용을 따로 상담해요. 사업자등록·세무·계약이 자동으로 완료되는 서비스는 아니에요.</p></details>
      </div>
    </section>
    <HomeBrandClosing onStart={onStart} />
  </div>;
}
