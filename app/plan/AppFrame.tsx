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
export default function AppFrame({ title, backHref = "/plan", actions, children }: { title: string; backHref?: string; actions?: ReactNode; children: ReactNode }) {
  return <main className={frame.page}>
    <BusinessAppChrome title={title} backHref={backHref} actions={actions} titleHeading={false}>
      <div className={styles.scroll}><div className={styles.inner}>{children}</div></div>
    </BusinessAppChrome>
  </main>;
}
