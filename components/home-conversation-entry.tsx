"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import styles from "./home-conversation-entry.module.css";

const EXAMPLE_PROMPTS = ["500만원 카페 창업", "플랫폼 창업하는 법", "내 사업 개선하기"];

export function HomeConversationEntry({ onStart }: { onStart: () => void }) {
  const [typed, setTyped] = useState(EXAMPLE_PROMPTS[0]);
  const router = useRouter();
  const [entering, startTransition] = useTransition();
  useEffect(() => { router.prefetch("/plan/chat?new=1"); }, [router]);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let index = 0;
    let length = EXAMPLE_PROMPTS[0].length;
    let deleting = true;
    const step = () => {
      if (deleting) {
        length -= 1;
        setTyped(EXAMPLE_PROMPTS[index].slice(0, length));
        if (length === 0) {
          // Pick a different example so two consecutive prompts never repeat.
          index = (index + 1 + Math.floor(Math.random() * (EXAMPLE_PROMPTS.length - 1))) % EXAMPLE_PROMPTS.length;
          deleting = false;
        }
        timer = setTimeout(step, length === 0 ? 260 : 45);
        return;
      }
      length += 1;
      setTyped(EXAMPLE_PROMPTS[index].slice(0, length));
      deleting = length === EXAMPLE_PROMPTS[index].length;
      timer = setTimeout(step, deleting ? 2200 : 95);
    };
    const sync = () => {
      if (timer) clearTimeout(timer);
      if (motion.matches) {
        index = 0;
        length = EXAMPLE_PROMPTS[0].length;
        deleting = true;
        setTyped(EXAMPLE_PROMPTS[0]);
        return;
      }
      if (!document.hidden) timer = setTimeout(step, 1600);
    };
    sync(); motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (timer) clearTimeout(timer);
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const enter = () => {
    if (entering) return;
    startTransition(onStart);
  };
  return <div className={styles.entry}><button className={styles.ring} type="button" onClick={enter} disabled={entering} aria-busy={entering} aria-label="대화로 사업 기획 시작하기">
    <span className={styles.inner}><span className={styles.prompt} aria-hidden="true"><span className={styles.typed}>{typed}<i/></span></span><span className={styles.send}>{entering ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : "보내기"}</span></span>
  </button></div>;
}
