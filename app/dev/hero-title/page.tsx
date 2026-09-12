import { notFound } from "next/navigation";
import { HomeTitleEditor } from "../../../components/home-title-editor";
import styles from "../../../components/home-cinematic-hero.module.css";

export default async function HeroTitlePreview({ searchParams }: { searchParams: Promise<{ time?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { time } = await searchParams;
  const value = Number(time ?? 6.4);
  return <main className="new-home simple-home product-home cinematic-home">
    <div className={styles.hero}>
      <div className={styles.media}><img src="/home-media/oneulstart-team.png" width="1942" height="809" alt="" /></div>
      <section className={styles.copy}>
        <h1><HomeTitleEditor title="오늘창업" previewTime={Number.isFinite(value) ? value : 6.4} /></h1>
        <h2>가능성은 가볍게 묻고.<br />시작은 구체적으로.</h2>
        <p>아이디어만 있어도, 이미 운영 중이어도 괜찮아요.<br />대화로 정리하고, 내 사업에 맞는 계획으로 만드세요.</p>
      </section>
    </div>
  </main>;
}
