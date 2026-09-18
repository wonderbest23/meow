"use client";

import type { ReactNode } from "react";
import { HomeConversationEntry } from "./home-conversation-entry";
import { HomeTitleEditor } from "./home-title-editor";
import { useHomeScroll } from "./use-home-scroll";
import { useHeroExpansion } from "./use-hero-expansion";
import styles from "./home-cinematic-hero.module.css";

export function HomeCinematicHero({ title, onStart }: {
  title: string; subtitle?: ReactNode; onStart: () => void;
}) {
  const ref = useHomeScroll();
  useHeroExpansion(ref);
  return <div className={styles.hero} ref={ref} data-cinematic-hero>
    <div className={styles.stage} data-hero-stage>
      <div className={styles.media} data-home-preview-window>
        <img src="/home-media/oneulstart-team.png" width="1942" height="809" fetchPriority="high" alt="서로 다른 사업 아이디어를 노트북 앞에서 함께 이야기하는 사람들" />
      </div>
    </div>
    <section className={styles.copy}>
      <h1><HomeTitleEditor title={title} /></h1>
      <h2>가능성은 <strong>가볍게</strong> 묻고<br />시작은 <strong>구체적으로</strong></h2>
      <div className={`${styles.entry} home-hero-actions`}><HomeConversationEntry onStart={onStart} /></div>
    </section>
  </div>;
}
