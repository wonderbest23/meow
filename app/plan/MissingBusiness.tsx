"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import BusinessAppChrome from "./BusinessAppChrome";
import styles from "./BusinessHub.module.css";
import frame from "./chat/page.module.css";
import { MISSING_BUSINESS_DETAIL, MISSING_BUSINESS_TITLE } from "../../lib/plan-builder/missing-business";

/* 주소의 사업을 찾지 못했을 때 — 사업 관리·홈페이지 화면과 같은 말과 '내 사업으로' 길 하나(lib/plan-builder/missing-business.ts) */

/** 본문 — 머리줄·왼쪽 목록이 이미 있는 화면 안에 넣는다 */
export function MissingBusinessBody({ title = MISSING_BUSINESS_TITLE, detail = MISSING_BUSINESS_DETAIL, children }: { title?: string; detail?: string; children?: ReactNode }) {
  return <section className={styles.empty}>
    <h2>{title}</h2>
    <p>{detail}</p>
    <Link className={styles.primary} href="/plan">내 사업으로</Link>
    {children}
  </section>;
}

/** 화면 전체 — 머리줄·왼쪽 목록과 함께 */
export default function MissingBusinessScreen({ chromeTitle, ...body }: { chromeTitle: string; title?: string; detail?: string; children?: ReactNode }) {
  return <main className={frame.page}><BusinessAppChrome title={chromeTitle}>
    <div className={styles.scroll}><div className={styles.content}><MissingBusinessBody {...body} /></div></div>
  </BusinessAppChrome></main>;
}
