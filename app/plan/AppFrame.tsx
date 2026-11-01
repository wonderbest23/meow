"use client";

import type { ReactNode } from "react";
import BusinessAppChrome from "./BusinessAppChrome";
import frame from "./chat/page.module.css";
import styles from "./AppFrame.module.css";

/**
 * 결제·마이페이지·이용 안내처럼 안쪽 내용만 있는 화면을 대화·계획서·홈페이지와 같은 틀에 담는다.
 * 머리줄(← 제목 ☰), 왼쪽 메뉴(내 사업 나무), 폰 서랍이 모든 화면에서 같다.
 */
/* 이 틀에 담기는 화면(결제·내 계정·이용 안내·고객센터)은 본문이 자기 h1을 가지므로 머리줄 제목은 h1로 두지 않는다 */
/*
 * settings — 설정 화면(내 계정 · 고객센터 · 이용 안내 · 환경설정 …): PC 는 왼쪽 메뉴가 설정 메뉴로 바뀌고 판 안쪽 48px,
 * 휴대폰은 위 56px(✕ 또는 ‹ · 제목) + 아래 3탭 막대. 본문 폭은 판 폭 가득(시안 settings-mock).
 */
export default function AppFrame({ title, backHref = "/plan", actions, settings, children }: { title: string; backHref?: string; actions?: ReactNode; settings?: "close" | "back"; children: ReactNode }) {
  return <main className={frame.page}>
    <BusinessAppChrome title={title} backHref={backHref} actions={actions} titleHeading={false} settings={settings}>
      <div className={styles.scroll} data-settings={settings ? "" : undefined}><div className={styles.inner}>{children}</div></div>
    </BusinessAppChrome>
  </main>;
}
