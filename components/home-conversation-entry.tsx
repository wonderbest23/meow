"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "./home-conversation-entry.module.css";

export function HomeConversationEntry({ onStart }: { onStart: () => void }) {
  const prompt = "어떤 사업을 꿈꾸고 있나요?";
  const [typed, setTyped] = useState(prompt);
  const router = useRouter();
  const [entering, setEntering] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const origin = useRef<DOMRect | null>(null);
  const started = useRef(false);
  const navigate = useRef(onStart);
  navigate.current = onStart;
  useEffect(() => { router.prefetch("/plan/chat"); }, [router]);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (timer) clearInterval(timer);
      setTyped(prompt);
      if (motion.matches) return;
      let tick = 0;
      timer = setInterval(() => {
        if (document.hidden) return;
        tick = (tick + 1) % (prompt.length + 38);
        setTyped(prompt.slice(0, Math.min(prompt.length, tick + 1)));
      }, 110);
    };
    sync(); motion.addEventListener("change", sync);
    return () => { if (timer) clearInterval(timer); motion.removeEventListener("change", sync); };
  }, []);
  useEffect(() => {
    if (!entering || !surface.current) return;
    const el = surface.current;
    const rect = origin.current;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const animation = el.animate([
      { clipPath: rect ? `inset(${Math.max(0, rect.top)}px ${Math.max(0, width - rect.right)}px ${Math.max(0, height - rect.bottom)}px ${Math.max(0, rect.left)}px round 16px)` : "inset(35% 15% round 32px)", opacity: 0.7 },
      { clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1 },
    ], { duration: 680, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
    let finished = false;
    const finish = () => { if (!finished) { finished = true; navigate.current(); } };
    animation.onfinish = finish;
    const fallback = window.setTimeout(finish, 850);
    const recovery = window.setTimeout(() => { setEntering(false); started.current = false; }, 5000);
    return () => { animation.cancel(); window.clearTimeout(fallback); window.clearTimeout(recovery); document.body.style.overflow = previousOverflow; };
  }, [entering]);
  const enter = () => {
    if (started.current) return;
    started.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onStart(); return; }
    origin.current = document.querySelector("[data-home-preview-window]")?.getBoundingClientRect() ?? null;
    setEntering(true);
  };
  return <>
    <div className={styles.entry}><button className={styles.ring} type="button" onClick={enter} disabled={entering} aria-label="대화로 사업 기획 시작하기">
      <span className={styles.inner}><span className={styles.prompt} aria-hidden="true"><span>{prompt}</span><span className={styles.typed}>{typed}<i/></span></span></span>
    </button></div>
    {entering && createPortal(<div className={styles.portal} role="status" aria-label="사업 기획 대화로 이동 중">
      <div ref={surface} className={styles.surface}><header>오늘창업<span>사업 기획</span></header><div className={styles.welcome}><span>생각이 사업이 되는 순간</span><h2>어떤 사업을<br/>생각하고 계세요?</h2><div className={styles.line}/></div><div className={styles.input}><span>생각을 편하게 이야기해 주세요</span></div></div>
    </div>, document.body)}
  </>;
}
