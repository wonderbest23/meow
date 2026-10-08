"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ChevronRight, CircleUserRound, Home, MessageCircle, MessagesSquare, Send, Settings } from "lucide-react";
import { clearLocalState, hydrateFromServer, lastHydrationFailed, isSamplePlan, type Plan } from "../lib/plan-builder/plan-store";
import { businessEntryHref, businessHubState } from "../lib/plan-builder/business-hub";
import { openLogin } from "./login-dialog";
import styles from "./support-chat-home.module.css";
import { loadAuthSession } from "../lib/client/auth-session";

/*
 * 상담 창의 홈·설정 탭과 아래 탭 막대 — 메신저형(홈 · 대화 · 설정) 상담 창.
 * 대화 탭은 예전부터 있던 상담·문의 화면(support-chat-widget)을 그대로 쓴다.
 *
 * 홈: 인사와 상담 방법, 문의하기, 그리고 로그인했으면 내 사업이 어디까지 왔는지.
 * 설정: 계정, 알림 배지, 상담 기록 지우기, 도움말 링크.
 * 운영 시간은 정해 둔 것이 없어 적지 않는다(지어내지 않는다).
 */
export type SupportTab = "home" | "chat" | "settings";
export const SUPPORT_BADGE_KEY = "oneul:support-badge";

type Session = { authenticated: boolean; email: string | null };

function useSession(open: boolean) {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadAuthSession()
      .then(data => { if (alive) setSession({ authenticated: !!data.authenticated, email: data.email ?? null }); })
      /* 확인하지 못했으면 직전 상태를 둔다 — 로그인한 사람을 로그아웃 상태로 그리지 않게 */
      .catch(() => {});
    return () => { alive = false; };
  }, [open]);
  return session;
}

/** 로그인한 사람의 사업 — 최근에 손댄 순서로 세 개까지 */
function useRecentPlans(session: Session | null) {
  const [plans, setPlans] = useState<Plan[] | null | undefined>(null);
  useEffect(() => {
    if (!session?.authenticated) { setPlans(null); return; }
    let alive = true;
    /* 읽기만 한다 — 이 기기에만 있는 변경을 서버로 올리는 건 사업 화면이 맡는다 */
    hydrateFromServer(false)
      .then(state => {
        if (!alive) return;
        const list = state.plans.filter(plan => !isSamplePlan(plan.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
        // 서버 목록을 못 불러왔는데 저장본도 없으면 '사업 없음'이 아니라 못 불러온 것 — 칸을 숨긴다
        setPlans(!list.length && lastHydrationFailed() ? undefined : list);
      })
      .catch(() => { if (alive) setPlans(undefined); });
    return () => { alive = false; };
  }, [session?.authenticated]);
  return plans;
}

export function SupportHome({ open, onInquiry, onConsult, onClose }: { open: boolean; onInquiry: () => void; onConsult: () => void; onClose: () => void }) {
  const session = useSession(open);
  const plans = useRecentPlans(session);
  return <div className={`${styles.pane} plan-ui`}>
    <header className={styles.brand}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/today-startup-mark-2026.png" alt="" width="52" height="52" />
      <strong>오늘창업</strong>
    </header>

    <section className={styles.card} aria-label="고객센터">
      <div className={styles.greeting}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/support-agent-avatar-2026.png" alt="" width="40" height="40" />
        <div><b>오늘창업 고객센터</b><p>안녕하세요, 오늘창업입니다.</p></div>
      </div>
      <ul className={styles.ways}>
        {session && !session.authenticated && <li className={styles.notice}><CircleUserRound aria-hidden="true" /><span>내 사업 진행을 확인하려면 <button type="button" onClick={() => { onClose(); openLogin(); }}>로그인</button>해 주세요</span></li>}
        <li><Bot aria-hidden="true" /><span><b>AI 창업 상담</b> 언제든 바로 답변해요</span></li>
        <li><MessagesSquare aria-hidden="true" /><span><b>서비스 문의</b> 결제·환불·이용 방법은 남겨 주시면 담당자가 순서대로 답변해요</span></li>
      </ul>
      <button type="button" className={styles.primary} onClick={onInquiry}>문의하기<Send aria-hidden="true" /></button>
      <button type="button" className={styles.secondary} onClick={onConsult}>무료 창업 상담 시작하기</button>
    </section>

    {session?.authenticated && plans !== undefined && <section className={styles.card} aria-label="내 사업 진행">
      <div className={styles.cardHead}><b>내 사업 진행</b><Link href="/plan" onClick={onClose}>전체 보기</Link></div>
      {plans === null ? <p className={styles.muted}>불러오고 있어요…</p>
        : plans.length === 0 ? <div className={styles.emptyPlans}><p className={styles.muted}>아직 시작한 사업이 없어요.</p><Link href="/plan/chat?new=1" onClick={onClose}>새 대화로 시작하기</Link></div>
        : <ul className={styles.plans}>{plans.map(plan => {
          const state = businessHubState(plan);
          const total = state.keys.length;
          const done = state.documents.length;
          return <li key={plan.id}><Link href={businessEntryHref(plan)} onClick={onClose}>
            <span className={styles.planText}><b>{plan.title}</b><small>{state.status}{total > 0 && done > 0 ? ` · 문서 ${done}/${total}` : ""}</small></span>
            {total > 0 && <span className={styles.bar} aria-hidden="true"><i style={{ width: `${Math.round(done / total * 100)}%` }} /></span>}
            <ChevronRight aria-hidden="true" />
          </Link></li>;
        })}</ul>}
    </section>}
  </div>;
}

export function SupportSettings({ open, badge, onBadge, onClearConsult, onClose }: { open: boolean; badge: boolean; onBadge: (value: boolean) => void; onClearConsult: () => void; onClose: () => void }) {
  const session = useSession(open);
  const [cleared, setCleared] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  /* 마이페이지 로그아웃과 같은 순서 — 실패하면 알리고, 성공하면 이 기기의 사업 목록도 비운다(다음 사람에게 보이지 않게) */
  const logout = async () => {
    if (loggingOut) return;
    setLogoutFailed(false); setLoggingOut(true);
    const response = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!response || !response.ok) { setLogoutFailed(true); setLoggingOut(false); return; }
    clearLocalState();
    window.location.reload();
  };
  return <div className={`${styles.pane} plan-ui`}>
    <h2 className={styles.title}>설정</h2>

    <section className={styles.card} aria-label="계정">
      <div className={styles.cardHead}><b>계정</b></div>
      {session === null ? <p className={styles.muted}>확인하고 있어요…</p>
        : session.authenticated ? <>
          <p className={styles.account}>{session.email ?? "로그인됨"}</p>
          <div className={styles.row}>
            <Link className={styles.ghost} href="/plan/me" onClick={onClose}>내 계정 · 결제 내역</Link>
            <button type="button" className={styles.ghost} disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? "로그아웃 중…" : "로그아웃"}</button>
          </div>
          {logoutFailed && <p className={styles.muted} role="alert">로그아웃하지 못했어요. 연결을 확인하고 다시 눌러 주세요.</p>}
        </> : <div className={styles.row}>
          <button type="button" className={styles.ghost} onClick={() => { onClose(); openLogin(); }}>로그인</button>
          <button type="button" className={styles.dark} onClick={() => { onClose(); openLogin(undefined, "register"); }}>회원가입</button>
        </div>}
    </section>

    <section className={styles.card} aria-label="알림">
      <div className={styles.cardHead}><b>알림</b></div>
      <label className={styles.toggle}>
        <span>새 답변 숫자 표시<small>상담 버튼에 읽지 않은 답변 수를 띄워요</small></span>
        <input type="checkbox" role="switch" checked={badge} onChange={event => onBadge(event.target.checked)} />
      </label>
    </section>

    <section className={styles.card} aria-label="상담 기록">
      <div className={styles.cardHead}><b>상담 기록</b></div>
      <button type="button" className={styles.listButton} disabled={cleared} onClick={() => {
        if (!window.confirm("AI 창업 상담에서 나눈 대화와 파악한 조건을 지울까요?")) return;
        onClearConsult(); setCleared(true);
      }}>{cleared ? "AI 창업 상담 기록을 지웠어요" : "AI 창업 상담 기록 지우기"}</button>
      <Link className={styles.listButton} href="/account/support" onClick={onClose}>지난 문의 내역 보기<ChevronRight aria-hidden="true" /></Link>
    </section>

    <section className={styles.card} aria-label="도움말">
      <Link className={styles.listButton} href="/plan/info" onClick={onClose}>이용 안내<ChevronRight aria-hidden="true" /></Link>
      <Link className={styles.listButton} href="/terms" onClick={onClose}>이용약관<ChevronRight aria-hidden="true" /></Link>
      <Link className={styles.listButton} href="/privacy" onClick={onClose}>개인정보처리방침<ChevronRight aria-hidden="true" /></Link>
    </section>
  </div>;
}

export function SupportTabs({ tab, onTab, unread }: { tab: SupportTab; onTab: (tab: SupportTab) => void; unread: number }) {
  const items: Array<[SupportTab, string, typeof Home]> = [["home", "홈", Home], ["chat", "대화", MessageCircle], ["settings", "설정", Settings]];
  return <nav className={`${styles.tabs} plan-ui`} aria-label="상담 창 메뉴">
    {items.map(([id, label, Icon]) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => onTab(id)}>
      <span className={styles.tabIcon}><Icon aria-hidden="true" />{id === "chat" && unread > 0 && <em>{unread > 9 ? "9+" : unread}</em>}</span>{label}
    </button>)}
  </nav>;
}
