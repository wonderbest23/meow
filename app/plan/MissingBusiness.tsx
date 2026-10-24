"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import BusinessAppChrome from "./BusinessAppChrome";
import styles from "./BusinessHub.module.css";
import frame from "./chat/page.module.css";
import { MISSING_BUSINESS_DETAIL, MISSING_BUSINESS_TITLE } from "../../lib/plan-builder/missing-business";

/* 주소의 사업을 찾지 못했을 때 — 사업 관리·홈페이지 화면과 같은 말과 '내 사업으로' 길 하나(lib/plan-builder/missing-business.ts) */

/**
 * 본문 — 머리줄·왼쪽 목록이 이미 있는 화면 안에 넣는다.
 * action — '내 사업으로' 대신 둘 주된 단추(예: 로그인이 풀렸을 때 '다시 로그인하기' — 그때는 '내 사업으로'를 덜 눈에 띄게 아래에)
 */
export function MissingBusinessBody({ title = MISSING_BUSINESS_TITLE, detail = MISSING_BUSINESS_DETAIL, action, children }: { title?: string; detail?: string; action?: ReactNode; children?: ReactNode }) {
  return <section className={styles.empty}>
    <h2>{title}</h2>
    <p>{detail}</p>
    {/* 어디로 가는 단추인지 보이게 > 아이콘을 붙인다(대표 요청 2026-10-24) */}
    {action ?? <Link className={styles.primary} href="/plan">내 사업으로<ChevronRight size={18} aria-hidden="true" /></Link>}
    {action ? <Link className={styles.secondary} href="/plan">내 사업으로<ChevronRight size={18} aria-hidden="true" /></Link> : null}
    {children}
  </section>;
}

/** 화면 전체 — 머리줄·왼쪽 목록과 함께 */
export default function MissingBusinessScreen({ chromeTitle, ...body }: { chromeTitle: string; title?: string; detail?: string; children?: ReactNode }) {
  return <main className={frame.page}><BusinessAppChrome title={chromeTitle}>
    <div className={styles.scroll}><div className={styles.content}><MissingBusinessBody {...body} /></div></div>
  </BusinessAppChrome></main>;
}
