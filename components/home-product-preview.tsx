"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./home-product-preview.module.css";

export function HomeProductPreview() {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const visible = useRef(false);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(motion.matches);
    sync(); motion.addEventListener("change", sync);
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      if (!entry.isIntersecting || motion.matches || paused) video.current?.pause();
      else void video.current?.play().catch(() => {});
    }, { threshold: .15 });
    if (root.current) observer.observe(root.current);
    const onVisibility = () => {
      if (document.hidden) video.current?.pause();
      else if (visible.current && !motion.matches && !paused) void video.current?.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { observer.disconnect(); motion.removeEventListener("change", sync); document.removeEventListener("visibilitychange", onVisibility); };
  }, [paused]);
  useEffect(() => {
    if (reduced || paused) video.current?.pause();
    else if (visible.current) void video.current?.play().catch(() => {});
  }, [reduced, paused]);
  return <section ref={root} className={styles.preview} aria-label="대화에서 사업계획서까지 영상 미리보기">
    <button className={styles.motionControl} type="button" onClick={() => setPaused(value => !value)}>{paused ? "영상 재생" : "영상 일시정지"}</button>
    <div className={styles.film} data-home-preview-window>
      <video ref={video} autoPlay muted loop playsInline preload="metadata" poster="/home-film/desktop-poster-v2.png" hidden={reduced || failed} onError={() => setFailed(true)} aria-label="아이디어를 대화로 구체화하고 사업계획서와 운영 계획으로 정리하는 가상 예시">
        <source src="/home-film/mobile-v2.mp4" media="(max-width: 600px)" type="video/mp4"/>
        <source src="/home-film/desktop-v2.mp4" type="video/mp4"/>
      </video>
      {(reduced || failed) && <picture><source media="(max-width: 600px)" srcSet="/home-film/mobile-poster-v2.png"/><img src="/home-film/desktop-poster-v2.png" alt="가상 사업 예시: 메뉴 사진 제작 사업의 계획서, 운영 계획, 첫 실행 자료"/></picture>}
    </div>
    <p className={styles.caption}>가상 사업 예시입니다. 실제 계획은 대화에 따라 달라집니다.</p>
  </section>;
}
