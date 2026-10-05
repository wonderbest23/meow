"use client";

import type { ReactNode } from "react";
import { HomeConversationEntry } from "./home-conversation-entry";
import { HomeTitleEditor } from "./home-title-editor";
import { useHomeScroll } from "./use-home-scroll";
import { useHeroExpansion } from "./use-hero-expansion";
import styles from "./home-cinematic-hero.module.css";

export function HomeCinematicHero({ title, subtitle, hidden = [], onStart }: {
  title: string; subtitle?: ReactNode; hidden?: string[]; onStart: () => void;
}) {
  const ref = useHomeScroll();
  useHeroExpansion(ref);
  return <div className={styles.hero} ref={ref} data-cinematic-hero>
    <div className={styles.stage} data-hero-stage>
      <div className={styles.media} data-home-preview-window>
        <img src="/home-media/oneulstart-team.png" width="1942" height="809" fetchPriority="high" alt="서로 다른 사업 아이디어를 노트북 앞에서 함께 이야기하는 사람들" />
      </div>
    </div>
    <section className={styles.copy} data-sc-section="chatHome">
      {/* 어드민에서 '이 글 삭제'한 문구는 그리지 않는다 */}
      {hidden.includes("chatHome.title") ? null : <h1 data-sc-field="chatHome.title"><HomeTitleEditor title={title} /></h1>}
      {/* 어드민이 고친 문구가 있으면 그것으로, 없으면 굵은 글씨가 들어간 기본 문구 */}
      {hidden.includes("chatHome.subtitle") ? null : <h2 data-sc-field="chatHome.subtitle">{subtitle ?? <>가능성은 <strong>가볍게</strong> 묻고<br />시작은 <strong>구체적으로</strong></>}</h2>}
      <div className={`${styles.entry} home-hero-actions`}><HomeConversationEntry onStart={onStart} /></div>
    </section>
  </div>;
}
