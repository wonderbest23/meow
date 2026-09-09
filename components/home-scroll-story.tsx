"use client";

import { useEffect, useRef } from "react";
import styles from "./home-scroll-story.module.css";

const scenes = [
  { label: "대화로 시작", first: "처음부터 잘 몰라도", emphasis: "대화하면 되니까.", description: "하고 싶은 일도, 운영 중인 사업의 고민도. 편하게 이야기해 주세요.", words: ["아이디어 찾기", "새 사업 기획", "내 사업 개선"] },
  { label: "내 사업안 다듬기", first: "흩어진 생각을", emphasis: "하나의 사업으로.", description: "상품, 고객, 비용, 시작 방법까지. 대화를 사업에 필요한 항목으로 정리해요.", words: ["직접 수정", "AI와 다듬기", "사업별 저장"] },
  { label: "계획서로 이어가기", first: "대화에서 끝내지 않고", emphasis: "꺼내 쓰는 계획서로.", description: "정리한 사업안을 문서로 만들어요. 검토하고 수정하면서 내 계획으로 완성하세요.", words: ["PDF", "Word", "발표자료"] },
];

function ProductScene({ index }: { index: number }) {
  if (index === 0) return <div className={styles.phone}>
    <div className={styles.phoneTop}><span>사업 기획</span><span>오늘창업</span></div>
    <div className={styles.chatBody}>
      <span className={styles.chatDate}>새로운 대화</span>
      <div className={`${styles.bubble} ${styles.userBubble}`}>작은 테이크아웃 카페를<br />시작하고 싶어요.</div>
      <div className={`${styles.bubble} ${styles.assistantBubble}`}>좋아요. 어떤 손님이<br />찾는 카페면 좋을까요?</div>
      <div className={`${styles.bubble} ${styles.userBubble} ${styles.lastBubble}`}>출근길에 들를 수 있는<br />동네 카페요.</div>
    </div>
    <div className={styles.composer}><span>생각을 편하게 이야기해 주세요</span><b>보내기</b></div>
  </div>;
  if (index === 1) return <div className={styles.brief}>
    <div className={styles.paperTop}><span>내 사업안</span><span>가상 사업 예시</span></div>
    <h4>출근길에 만나는<br />작은 동네 카페</h4>
    <div className={styles.briefRows}>
      <div><span>상품</span><strong>빠르게 가져가는 커피</strong></div>
      <div><span>고객</span><strong>출근하는 동네 직장인</strong></div>
      <div><span>운영</span><strong>테이크아웃 중심의 작은 매장</strong></div>
    </div>
    <div className={styles.nextTask}><span>먼저 해볼 일</span><p>예상 고객의 출근 동선과<br />주변 카페를 살펴보기</p></div>
    <span className={styles.draftLabel}>대화를 바탕으로 정리한 AI 제안</span>
  </div>;
  return <div className={styles.document}>
    <div className={styles.documentBack} aria-hidden="true" />
    <img src="/samples/sample_coffee-cover.png" width="778" height="1100" loading="lazy" alt="새벽커피 사업계획서 샘플의 실제 표지" />
    <span className={styles.documentLabel}>기존 샘플 PDF · 가상 사례</span>
  </div>;
}

export function HomeScrollStory() {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = track.current;
    const surface = stage.current;
    if (!root || !surface) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = -1;
    const update = () => {
      frame = 0;
      const enabled = !reduced.matches && window.innerHeight >= 700;
      root.dataset.motion = enabled ? "on" : "off";
      if (!enabled) return;
      const top = parseFloat(getComputedStyle(surface).top) || 0;
      const travel = root.offsetHeight - surface.offsetHeight;
      const progress = Math.max(0, Math.min(1, (top - root.getBoundingClientRect().top) / Math.max(1, travel)));
      const step = Math.min(2, Math.floor(progress * 3));
      root.style.setProperty("--progress", String(progress));
      if (step === previous) return;
      previous = step;
      root.dataset.step = String(step);
      root.style.setProperty("--step", String(step));
      root.querySelectorAll<HTMLElement>("[data-story-scene]").forEach((scene, index) => {
        scene.dataset.active = String(index === step);
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return <section id="how" className={styles.story} aria-labelledby="home-how-title">
    <h2 id="home-how-title" className={styles.srOnly}>대화에서 내 사업계획서까지</h2>
    <div className={styles.track} ref={track} data-scroll-story>
      <div className={styles.stage} ref={stage}>
        <div className={styles.eyebrow}>한마디가 내 사업이 되는 과정</div>
        <ol className={styles.scenes}>
          {scenes.map((scene, index) => <li key={scene.label} className={styles.scene} data-story-scene style={{ "--index": index } as React.CSSProperties}>
            <div className={styles.copy}>
              <span className={styles.label}>0{index + 1} <span>{scene.label}</span></span>
              <h3><span>{scene.first}</span><strong>{scene.emphasis}</strong></h3>
              <p>{scene.description}</p>
              <div className={styles.words}>{scene.words.map(word => <span key={word}>{word}</span>)}</div>
            </div>
            <div className={styles.visual} aria-label={`${scene.label} 화면 예시`}><ProductScene index={index} /></div>
          </li>)}
        </ol>
        <div className={styles.stageFooter}><span>이용 과정을 보여주는 가상 사업 예시예요.</span><div className={styles.progress} aria-hidden="true"><span /></div></div>
      </div>
    </div>
  </section>;
}
