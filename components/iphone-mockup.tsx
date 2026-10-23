/*
 * 아이폰 모양 틀(2026-10-23 사장님: '이상한 가짜 폰' 말고 진짜 아이폰처럼) — 애플 그림 없이 CSS·SVG로만 그린다.
 *
 * 비율은 다이내믹 아일랜드가 있는 아이폰(화면 390×844pt)을 따른다: 얇은 티타늄 테두리 + 검은 베젤, 둥근 모서리,
 * 다이내믹 아일랜드, 왼쪽 동작·음량 단추와 오른쪽 전원 단추, 아래 홈 막대.
 * 맨 위 54pt는 상태 표시줄(9:41 · 신호 · 와이파이 · 배터리)이고 그 아래 790pt에 화면 그림을 놓는다 —
 * 그림은 390×844 휴대폰 화면을 찍어 위에서부터 390×790만 잘라 둔 것이라 앱 머리줄이 상태 표시줄에 가려지지 않는다.
 *
 * 크기는 바깥에서 정한 너비(width) 하나로 정해지고, 안쪽 치수는 모두 그 너비 기준(container query 단위 cqw)이라
 * 작은 카드에서도 큰 진열 띠에서도 같은 모양으로 줄고 는다. 높이는 비율로 미리 잡혀 그림이 늦게 와도 아래가 밀리지 않는다.
 */
import type { HTMLAttributes } from "react";
import styles from "./iphone-mockup.module.css";

type Props = {
  src: string;
  alt: string;
  /** 그림 파일의 실제 크기 — 기본은 390×790pt를 2배로 줄인 780×1580 */
  width?: number;
  height?: number;
  loading?: "eager" | "lazy";
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

export function IphoneMockup({ src, alt, width = 780, height = 1580, loading = "lazy", className, ...rest }: Props) {
  return <div className={className ? `${styles.device} ${className}` : styles.device} {...rest}>
    <div className={styles.frame}>
      <span className={`${styles.button} ${styles.action}`} aria-hidden="true" />
      <span className={`${styles.button} ${styles.volumeUp}`} aria-hidden="true" />
      <span className={`${styles.button} ${styles.volumeDown}`} aria-hidden="true" />
      <span className={`${styles.button} ${styles.power}`} aria-hidden="true" />
      <div className={styles.bezel}>
        <div className={styles.screen}>
          <StatusBar />
          <img className={styles.shot} src={src} alt={alt} width={width} height={height} loading={loading} decoding="async" />
          <span className={styles.island} aria-hidden="true" />
          <span className={styles.homeBar} aria-hidden="true" />
        </div>
      </div>
    </div>
  </div>;
}

/** 상태 표시줄 — 390×54pt 좌표로 그려 틀 크기에 맞춰 함께 줄어든다 */
function StatusBar() {
  return <svg className={styles.statusBar} viewBox="0 0 390 54" aria-hidden="true" focusable="false">
    <text x="66" y="34.5" textAnchor="middle" className={styles.clock}>9:41</text>
    {/* 신호 네 칸 */}
    <rect x="291" y="27" width="3.2" height="5" rx="1" />
    <rect x="296" y="24.5" width="3.2" height="7.5" rx="1" />
    <rect x="301" y="22" width="3.2" height="10" rx="1" />
    <rect x="306" y="19.5" width="3.2" height="12.5" rx="1" />
    {/* 와이파이 */}
    <path d="M318.4 24.1a10.6 10.6 0 0 1 14.2 0" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    <path d="M321.2 27.2a6.4 6.4 0 0 1 8.6 0" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    <path d="M323.4 29.9a3 3 0 0 1 4.2 0L325.5 32z" />
    {/* 배터리 */}
    <rect x="340.5" y="20.5" width="24" height="12" rx="3.6" fill="none" stroke="currentColor" strokeOpacity=".4" strokeWidth="1" />
    <rect x="342.5" y="22.5" width="20" height="8" rx="2" />
    <path d="M366 24.6v3.8a2 2 0 0 0 0-3.8z" fillOpacity=".45" />
  </svg>;
}
