"use client";

import { useEffect, useRef } from "react";
import styles from "./home-scroll-story.module.css";

const scenes = [
  { label: "대화로 시작", first: "생각만", emphasis: "가져오세요.", description: "막연한 관심사도, 지금 사업의 고민도. 한마디에서 시작해요.", words: ["관심 있는 일", "내 아이디어", "운영 중인 사업"] },
  { label: "내 사업안 다듬기", first: "막연했던 생각이", emphasis: "구체적인 사업으로.", description: "누구에게 무엇을 팔지, 얼마가 필요할지. 대화하고 직접 고치며 정리해요.", words: ["상품과 고객", "비용과 운영", "시작 방법"] },
  { label: "계획서로 이어가기", first: "대화는 끝나도", emphasis: "내 계획은 남으니까.", description: "정리한 사업안을 계획서로 만들고, 내 사업에서 자료와 다음 할 일을 이어가요.", words: ["사업계획서", "발표자료", "내 사업 관리"] },
];

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
      const enabled = !reduced.matches && window.innerHeight >= 620;
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
            <span className={styles.label}>0{index + 1} <span>{scene.label}</span></span>
            <h3><span>{scene.first}</span><strong>{scene.emphasis}</strong></h3>
            <p>{scene.description}</p>
            <div className={styles.words}>{scene.words.map(word => <span key={word}>{word}</span>)}</div>
          </li>)}
        </ol>
        <div className={styles.progress} aria-hidden="true"><span /></div>
      </div>
    </div>
  </section>;
}
