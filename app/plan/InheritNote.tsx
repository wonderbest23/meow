"use client";

import { useEffect, useState } from "react";
import { activePlan } from "../../lib/plan-builder/plan-store";
import styles from "./InheritNote.module.css";

/**
 * 답변 이어받기 안내 — 이어받아 만든 플랜은 처음부터 답이 채워져 있어서
 * "왜 이러지?" 싶어진다. 어디서 왔는지 한 줄로 설명하고, X로 끄면
 * 그 플랜에서는 다시 보이지 않는다(세션 기준).
 */
export default function InheritNote() {
  const [info, setInfo] = useState<{ id: string; title: string; count: number } | null>(null);

  useEffect(() => {
    const read = () => {
      const p = activePlan();
      if (!p?.inheritedFrom) return;
      try {
        if (sessionStorage.getItem(`inherit-note-off:${p.id}`) === "1") return;
      } catch {}
      setInfo({ id: p.id, title: p.inheritedFrom.title, count: p.inheritedFrom.count });
    };
    read();
    // 서버 하이드레이션이 마운트보다 늦게 로컬을 갱신할 수 있다 — 한 번 더 본다
    const t = setTimeout(read, 1500);
    return () => clearTimeout(t);
  }, []);

  if (!info) return null;
  return (
    <div className={styles.note} role="status">
      <span className={styles.text}>
        <b>답변을 이어받았어요</b> — ‘{info.title}’에서 가져온 답변 {info.count}개가 미리
        채워져 있어요. 맞는지 확인하고 필요한 곳만 고치면 돼요.
      </span>
      <button
        type="button"
        className={styles.close}
        aria-label="안내 닫기"
        onClick={() => {
          try {
            sessionStorage.setItem(`inherit-note-off:${info.id}`, "1");
          } catch {}
          setInfo(null);
        }}
      >
        ×
      </button>
    </div>
  );
}
