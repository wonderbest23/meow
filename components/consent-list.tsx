"use client";

import { Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./consent-list.module.css";
import { DocLink } from "./doc-sheet";

/*
 * 약관 동의 목록 — 앱에서 흔히 보는 모양(대표 요청 2026-10-16: 스타벅스 앱처럼, 지금은 인위적이다).
 *   맨 위 '전체동의' 한 줄 → 선 → 항목마다 [동그란 체크] 이름 (필수/선택) ……… [›] (› 는 문서 보기)
 * 꼭 읽어야 하는 설명(환불 제한·개인정보 수집 항목 등)은 그 줄 아래 작은 글씨로 그대로 보인다 — 접어 두지 않는다.
 * 회원가입·결제·공개 홈페이지 문의 양식이 같이 쓴다.
 */
export type ConsentItem = {
  key: string;
  /** 항목 이름 — 문서 보기 단추의 읽기 이름에도 쓴다 */
  label: string;
  required?: boolean;
  /** › 를 누르면 여는 문서(웹은 새 창, 앱 안은 화면 위) */
  href?: string;
  /** 줄 아래 작은 설명 */
  note?: ReactNode;
};

export function ConsentList({ items, values, onChange, allLabel = "약관 전체동의", className }: {
  items: ConsentItem[];
  values: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  allLabel?: string;
  className?: string;
}) {
  const all = items.length > 0 && items.every((item) => values[item.key]);
  const setAll = (checked: boolean) => onChange(Object.fromEntries(items.map((item) => [item.key, checked])));
  return <div className={`${styles.list} ${className ?? ""}`}>
    {/* 항목이 하나뿐이면 '전체동의'는 같은 말을 두 번 하는 셈이라 뺀다 */}
    {items.length > 1 && <label className={`${styles.row} ${styles.all}`}>
      <input type="checkbox" checked={all} onChange={(event) => setAll(event.target.checked)} />
      <span className={styles.check} aria-hidden="true"><Check /></span>
      <span className={styles.text}><strong>{allLabel}</strong></span>
    </label>}
    <ul>
      {items.map((item) => <li key={item.key} className={styles.item}>
        <label className={styles.row}>
          <input type="checkbox" checked={Boolean(values[item.key])} onChange={(event) => onChange({ ...values, [item.key]: event.target.checked })} />
          <span className={styles.check} aria-hidden="true"><Check /></span>
          <span className={styles.text}>
            <span>{item.label}<em>{item.required === false ? "(선택)" : "(필수)"}</em></span>
            {item.note ? <small>{item.note}</small> : null}
          </span>
        </label>
        {/* 웹은 새 창, 앱 안은 화면 위에 문서를 띄운다 — 앱에서 새 창은 앱 밖으로 나가 동의하던 화면을 잃었다 */}
        {item.href ? <DocLink className={styles.view} href={item.href} title={item.label} aria-label={`${item.label} 내용 보기`}><ChevronRight /></DocLink> : null}
      </li>)}
    </ul>
  </div>;
}
