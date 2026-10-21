import Link from "next/link";
import type { Metadata } from "next";
import styles from "./not-found.module.css";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요 | 오늘창업", robots: { index: false } };

/** 없는 주소·운영에서 막힌 개발용 화면이 보여 주는 화면. 기본 영어 404 대신 한국어로 다음 행동을 안내한다. */
export default function NotFound() {
  return (
    <main className={styles.page}>
      {/* PC 에서 회색 바탕에 카드만 떠 있어 어느 사이트인지 알기 어려웠다 — 위에 로고(누르면 처음 화면) */}
      <Link href="/" className={styles.brand} aria-label="오늘창업 처음 화면"><img src="/today-startup-logo-2026.png" alt="오늘창업" /></Link>
      <section className={styles.card} aria-labelledby="not-found-title">
        <h1 id="not-found-title">페이지를 찾을 수 없어요</h1>
        <p>주소가 바뀌었거나 없는 화면이에요. 아래에서 이어서 진행해 주세요.</p>
        <div className={styles.actions}>
          <Link href="/" className={styles.primary}>처음 화면으로</Link>
          <Link href="/plan" className={styles.secondary}>내 사업 보기</Link>
        </div>
      </section>
    </main>
  );
}
