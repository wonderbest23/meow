"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, MonitorSmartphone, Search, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppButton } from "../../../components/app-button";
import { FieldGroup } from "../../../components/app-field";
import { SettingsCard, SettingsHeader, SettingsRow, SettingsSection } from "../../../components/settings-row";
import { PLAN_VIEW_ALL } from "../MobileTabBar";
import styles from "./settings.module.css";

/*
 * 계정 설정 목록 — 휴대폰(시안 MSettings, lovable 실측 2026-11-01): ✕ · 제목 16/500(머리는 AppFrame) → 검색 32 r8 → 목록 48px(아이콘 20 + 16px)
 * 내 계정 · 환경설정 · 보안 · 기기 및 앱 → 맨 아래 32px 테두리 단추 '사업 설정'(내 사업 목록).
 * PC 는 왼쪽 설정 메뉴가 있으니 같은 네 항목을 행 카드로 보인다.
 * 각 항목은 지금 있는 설정만 모은다(없는 설정을 만들지 않는다) — 무엇이 어디로 가는지는 docs/design/lovable-구조-시안-2026-10-31.md.
 */
const ITEMS: Array<{ href: string; label: string; description: string; icon: LucideIcon; words: string }> = [
  { href: "/plan/me", label: "내 계정", description: "이메일 · 이용 상태 · 내 사업 · 결제 내역", icon: UserRound, words: "이메일 이용 상태 사업 결제 환불 영수증" },
  { href: "/plan/settings/preferences", label: "환경설정", description: "상담 단추 알림 숫자 · 문의 알림 번호", icon: SlidersHorizontal, words: "알림 문의 문자 번호 상담" },
  { href: "/plan/settings/security", label: "보안", description: "로그아웃 · 회원 탈퇴", icon: ShieldCheck, words: "로그아웃 탈퇴 계정 삭제" },
  { href: "/plan/settings/devices", label: "기기 및 앱", description: "지금 쓰는 기기 · 화면 설정", icon: MonitorSmartphone, words: "앱 아이폰 안드로이드 브라우저 화면 글자 크기" },
];

export default function SettingsIndex() {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  /* 내 계정 화면 머리의 검색 단추(?search=1)로 오면 검색칸에 바로 초점 */
  useEffect(() => { if (new URL(window.location.href).searchParams.get("search") === "1") input.current?.focus(); }, []);
  const q = query.trim().toLowerCase();
  const items = ITEMS.filter(item => !q || `${item.label} ${item.description} ${item.words}`.toLowerCase().includes(q));
  return <div className={styles.index}>
    <SettingsHeader title="계정 설정" description="계정과 이 기기에서 쓰는 설정을 모았어요." mobile="hidden" />
    <FieldGroup as="label" className={styles.search} data-size="compact">
      <Search size={18} strokeWidth={1.8} aria-hidden="true" />
      <input ref={input} type="search" placeholder="설정 검색" aria-label="설정 검색" value={query} onChange={event => setQuery(event.target.value)} />
    </FieldGroup>
    {/* 휴대폰 목록 48px */}
    <nav className={styles.list} aria-label="계정 설정 목록">
      {items.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={styles.item}><Icon aria-hidden="true" /><span>{item.label}</span><ChevronRight className={styles.chev} aria-hidden="true" /></Link>; })}
      {!items.length && <p className={styles.none} role="status">찾는 설정이 없어요. 다른 낱말로 찾아 보세요.</p>}
    </nav>
    {/* PC 행 카드 */}
    <div className={styles.pcOnly}>
      <SettingsSection label="계정 설정 목록">
        <SettingsCard>
          {items.length ? items.map(item => <SettingsRow key={item.href} title={item.label} description={item.description} control={<AppButton href={item.href} variant="soft" size="compact" aria-label={`${item.label} 열기`}>열기</AppButton>} />)
            : <SettingsRow title="찾는 설정이 없어요" description="다른 낱말로 찾아 보세요." />}
        </SettingsCard>
      </SettingsSection>
    </div>
    <div className={styles.spring} />
    <AppButton href={`/plan?view=${PLAN_VIEW_ALL}`} variant="secondary" size="compact" className={styles.business}><Building2 size={16} strokeWidth={1.8} aria-hidden="true" />사업 설정</AppButton>
  </div>;
}
