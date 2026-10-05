"use client";

import Link from "next/link";
import styles from "./not-found.module.css";

/*
 * 화면에서 예상하지 못한 오류가 났을 때 — 예전엔 Next 기본 영어 화면("Application error…")이 떴다.
 * 404 화면과 같은 모양으로, 다시 시도하거나 내 사업으로 돌아갈 수 있게 한다.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="app-error-title">
        <p className={styles.code}>잠시 문제가 생겼어요</p>
        <h1 id="app-error-title">화면을 불러오지 못했어요</h1>
        <p>저장한 내용은 그대로 있어요. 다시 시도하거나 내 사업에서 이어서 진행해 주세요.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => reset()}>다시 시도</button>
          <Link href="/plan" className={styles.secondary}>내 사업 보기</Link>
        </div>
      </section>
    </main>
  );
}
