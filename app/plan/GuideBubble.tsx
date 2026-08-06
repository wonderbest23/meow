"use client";

import styles from "./GuideBubble.module.css";

/**
 * 안내 네비게이터 — 화면마다 "지금 눌러야 할 곳" 하나를 말풍선으로 짚어준다.
 * 목록(내 플랜)에서 시작한 언어를 개요·위저드까지 동일하게 쓴다.
 *
 * 사용법: 강조할 요소에 ringClass()를 추가하고, 그 안에 <GuideBubble text="..." />.
 * (ring 클래스가 position:relative를 포함하므로 부모 수정이 필요 없다)
 */
export default function GuideBubble({ text }: { text: string }) {
  return (
    <span className={styles.bubble} aria-hidden="true">
      {text}
    </span>
  );
}

/** 강조 대상 요소에 붙이는 클래스 — 숨쉬는 파란 링 + relative 기준점 */
export function ringClass(): string {
  return styles.ring;
}
