import styles from "../../not-found.module.css";

/*
 * 공개 홈페이지(/launch/주소·사장님 도메인)가 없거나 닫혀 있을 때 — 보는 사람은 가게 손님이다.
 * 전체 404(app/not-found.tsx)의 '내 사업 보기'·오늘창업 로고는 사장님용이라 여기선 보여 주지 않는다.
 * 제목(메타데이터)은 page.tsx 의 generateMetadata 가 정한다.
 */
export default function LaunchNotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="launch-not-found-title">
        <h1 id="launch-not-found-title">이 홈페이지는 지금 볼 수 없어요</h1>
        <p>주소가 바뀌었거나 사장님이 잠시 닫아 두었을 수 있어요. 주소를 다시 확인하거나 가게에 직접 물어봐 주세요.</p>
      </section>
    </main>
  );
}
