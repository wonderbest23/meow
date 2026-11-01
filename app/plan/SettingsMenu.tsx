"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, BookOpen, ChevronLeft, CircleHelp, CreditCard, FileText, House, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FieldGroup } from "../../components/app-field";
import { accountInitial, useAccount } from "./use-account";
import styles from "./SettingsMenu.module.css";

/*
 * 설정 화면의 왼쪽 메뉴(시안 docs/design/settings-mock/Main.dc.html · Support.dc.html — lovable 설정 배치).
 * 설정 화면(내 계정 · 고객센터 · 이용 안내 · 환경설정 …)에서는 PC 왼쪽 메뉴(RailMenu)가 이것으로 바뀐다.
 * 256px(안쪽 8) · 맨 위 '‹ 뒤로 가기' 14px → 설정 검색 32 r8 → 묶음 제목 14px 회색
 * '계정': 내 계정 · 내 사업 · 결제 내역 / '알림·도움': 알림 설정 · 고객센터 · 이용 안내 · 약관·정책.
 * 항목 240×32 r8 14px 아이콘 20, 선택 바탕 = 글자색 8%. 주소는 모두 예전 그대로(내 계정 화면의 칸 · 고객센터 · 약관 화면).
 */
type Key = "me" | "business" | "payments" | "alerts" | "support" | "guide" | "policy";
type Item = { key: Key; href: string; label: string; icon?: LucideIcon; words: string };
const GROUPS: Array<{ label: string; items: Item[] }> = [
  { label: "계정", items: [
    { key: "me", href: "/plan/me", label: "내 계정", words: "이메일 로그인 로그아웃 이용 상태 탈퇴 보안 계정" },
    { key: "business", href: "/plan/me#me-business", label: "내 사업", icon: House, words: "사업 목록 열기" },
    { key: "payments", href: "/plan/me#me-payments", label: "결제 내역", icon: CreditCard, words: "결제 영수증 환불 주문" },
  ] },
  { label: "알림·도움", items: [
    { key: "alerts", href: "/plan/settings/preferences", label: "알림 설정", icon: Bell, words: "환경설정 알림 문의 알림 번호 문자 상담 숫자" },
    { key: "support", href: "/account/support", label: "고객센터", icon: CircleHelp, words: "문의 문의 내역 자주 묻는 질문 도움" },
    { key: "guide", href: "/plan/info", label: "이용 안내", icon: BookOpen, words: "사업자 통신판매 정보 안내" },
    { key: "policy", href: "/plan/info?doc=terms", label: "약관·정책", icon: FileText, words: "이용약관 개인정보 처리방침 인공지능 환불 취소" },
  ] },
];

/** 지금 화면이 어느 항목인지 — 내 계정 화면은 #칸(내 사업·결제 내역), 약관 화면은 doc 로 가른다 */
function currentKey(pathname: string, hash: string, doc: string | null): Key | undefined {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/plan/me") return hash === "#me-business" ? "business" : hash === "#me-payments" ? "payments" : "me";
  if (path === "/plan/settings/security") return "me";
  if (path === "/plan/settings/preferences") return "alerts";
  if (path === "/account/support") return "support";
  if (path === "/plan/info") return !doc || doc === "business" ? "guide" : "policy";
  return undefined;
}

function DocWatcher({ onChange }: { onChange: (doc: string | null) => void }) {
  const doc = useSearchParams().get("doc");
  useEffect(() => { onChange(doc); }, [doc, onChange]);
  return null;
}

export default function SettingsMenu() {
  const pathname = usePathname() || "";
  const account = useAccount(pathname);
  const [doc, setDoc] = useState<string | null>(null);
  const [hash, setHash] = useState("");
  const [query, setQuery] = useState("");
  /* #칸 이동은 next/link 가 pushState 로 해서 hashchange 가 오지 않는다 — 누를 때도 직접 맞춘다 */
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);
  const active = currentKey(pathname, hash, doc);
  const q = query.trim().toLowerCase();
  const groups = GROUPS.map(group => ({ ...group, items: group.items.filter(item => !q || `${item.label} ${item.words}`.toLowerCase().includes(q)) })).filter(group => group.items.length);
  return <nav className={styles.menu} aria-label="설정 메뉴" data-settings-menu="">
    <Suspense fallback={null}><DocWatcher onChange={setDoc} /></Suspense>
    <Link href="/plan" className={styles.back}><ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />뒤로 가기</Link>
    <FieldGroup as="label" className={styles.search} data-size="compact">
      <Search size={16} strokeWidth={2} aria-hidden="true" />
      <input type="search" placeholder="설정 검색" aria-label="설정 검색" value={query} onChange={event => setQuery(event.target.value)} />
    </FieldGroup>
    {groups.map(group => <div key={group.label} className={styles.group}>
      <p className={styles.grp}>{group.label}</p>
      {group.items.map(item => {
        const Icon = item.icon;
        return <Link key={item.key} href={item.href} className={styles.item} aria-current={active === item.key ? "page" : undefined} onClick={() => setHash(item.href.includes("#") ? item.href.slice(item.href.indexOf("#")) : "")}>
          {Icon ? <Icon aria-hidden="true" /> : <span className={styles.ava} aria-hidden="true">{accountInitial(account)}</span>}
          <span>{item.label}</span>
        </Link>;
      })}
    </div>)}
    {!groups.length && <p className={styles.none} role="status">찾는 설정이 없어요. 다른 낱말로 찾아 보세요.</p>}
  </nav>;
}
