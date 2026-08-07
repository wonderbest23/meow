"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./GuideBubble.module.css";

/**
 * 안내 네비게이터 — 화면마다 "지금 눌러야 할 곳" 하나를 말풍선으로 짚어준다.
 * 목록(내 플랜)에서 시작한 언어를 개요·위저드까지 동일하게 쓴다.
 *
 * 사용법: 강조할 요소에 ringClass()를 추가하고, 그 안에 <GuideBubble text="..." />.
 * (ring 클래스가 position:relative를 포함하므로 부모 수정이 필요 없다)
 *
 * X로 닫으면 세션 동안 모든 화면의 말풍선이 함께 꺼진다.
 */

const OFF_KEY = "plan-guide-off";
const OFF_EVENT = "plan-guide-off";

/** 말풍선 표시 여부 + 끄기 — 목록의 자체 말풍선도 이 스위치를 같이 쓴다 */
export function useGuideVisible(): [boolean, () => void] {
  // SSR과 첫 페인트가 어긋나지 않게 일단 숨겼다가 클라이언트에서 판정
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(sessionStorage.getItem(OFF_KEY) !== "1");
    } catch {
      setVisible(true);
    }
    const off = () => setVisible(false);
    window.addEventListener(OFF_EVENT, off);
    return () => window.removeEventListener(OFF_EVENT, off);
  }, []);
  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(OFF_KEY, "1");
    } catch {}
    window.dispatchEvent(new Event(OFF_EVENT));
  }, []);
  return [visible, dismiss];
}

/** 닫기 × — 부모가 button인 경우가 많아 중첩 button 대신 role=button span */
export function GuideClose({ onClose, className }: { onClose: () => void; className?: string }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="안내 닫기"
      className={className ?? styles.close}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      ×
    </span>
  );
}

export default function GuideBubble({ text }: { text: string }) {
  const [visible, dismiss] = useGuideVisible();
  if (!visible) return null;
  return (
    <span className={styles.bubble}>
      {text}
      <GuideClose onClose={dismiss} />
    </span>
  );
}

/** 강조 대상 요소에 붙이는 클래스 — 숨쉬는 파란 링 + relative 기준점 */
export function ringClass(): string {
  return styles.ring;
}
