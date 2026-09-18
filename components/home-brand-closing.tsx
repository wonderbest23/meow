"use client";

import { CtaArrow } from "./cta-arrow";
import { useHomeScroll } from "./use-home-scroll";
import styles from "./home-brand-closing.module.css";

export function HomeBrandClosing({ onStart }: { onStart: () => void }) {
  const root = useHomeScroll();
  return <div className={styles.ending} ref={root}>
    <section className={styles.scene} aria-labelledby="home-closing-title">
      <img className={styles.photo} src="/home-media/oneulstart-first-day.webp" width="1672" height="941" loading="lazy" alt="파란 문을 열고 첫 하루를 시작하는 가상 카페의 창업자" />
      <div className={styles.copy} data-home-copy>
        <p>완벽한 아이디어가 아니어도 괜찮아요</p>
        <h2 id="home-closing-title">내 사업의 첫날<br /><strong>오늘창업</strong></h2>
        <div className={styles.actions}>
          <button type="button" onClick={onStart}>대화로 시작하기<CtaArrow /></button>
        </div>
      </div>
    </section>
  </div>;
}
