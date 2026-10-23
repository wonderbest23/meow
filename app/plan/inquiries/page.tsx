"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, RefreshCw } from "lucide-react";
import BusinessAppChrome from "../BusinessAppChrome";
import PlanLoading from "../PlanLoading";
import frame from "../chat/page.module.css";
import styles from "./page.module.css";
import { HomepageLeadActions } from "../../../components/homepage-lead-actions";
import { HomepageLeadNotification, useHomepageLeadNotifications } from "../../../components/homepage-lead-notifications";
import { formatKoreanPhone } from "../../../lib/contact-links";
import { homepageHref } from "../../../lib/plan-builder/journey";
import { isSamplePlan, loadState } from "../../../lib/plan-builder/plan-store";
import { AUTH_ERROR, markInquiryHandled, unansweredCount, useInquiries, type Inquiry } from "./use-inquiries";

/** 받은 시각을 짧게 — 오늘이면 시:분, 아니면 월.일 */
function shortTime(iso: string) {
  const at = new Date(iso), now = new Date();
  return at.toDateString() === now.toDateString()
    ? at.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
    : at.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

/*
 * 내 문의 — 메신저처럼: 왼쪽은 문의 목록, 누르면 오른쪽(휴대폰은 전체 화면)에 손님 메시지와 연락처.
 * 홈페이지 화면의 '접수된 문의' 칸을 여기로 옮겼다(소유자 요청 2026-10-07).
 */
export default function InquiriesPage() {
  const { items, error, refresh } = useInquiries();
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const shown = useMemo(() => (items ?? []).filter(item => filter === "all" || item.lead.handledAt === null), [items, filter]);
  const selected = shown.find(item => item.lead.id === selectedId) ?? (items ?? []).find(item => item.lead.id === selectedId) ?? null;
  // 알림 기록은 홈페이지(사업) 단위 — 같은 사업의 다른 문의를 눌러도 다시 읽지 않게 여기서 한 번 읽는다
  const notifications = useHomepageLeadNotifications(selected?.projectId ?? null, 0);
  // PC 는 처음에 가장 최근 문의를 열어 둔다(휴대폰은 목록부터)
  useEffect(() => {
    if (selectedId || !items?.length || window.matchMedia("(max-width: 760px)").matches) return;
    setSelectedId(items[0].lead.id);
  }, [items, selectedId]);
  const open = items ? unansweredCount(items) : 0;
  /* 빈 화면의 다음 할 일 — 가장 최근에 손댄 내 사업의 홈페이지·알림 번호 설정으로(감사 2026-10-23: 빈 화면에 갈 곳이 없었다) */
  const [recentPlanId, setRecentPlanId] = useState<string | null>(null);
  useEffect(() => {
    const recent = loadState().plans.filter(plan => !isSamplePlan(plan.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    setRecentPlanId(recent?.id ?? null);
  }, []);
  // 휴대폰(목록·상세가 한 화면씩)인지 — 머리말 뒤로 단추가 상세에서 목록으로 돌아가게 할 때만 쓴다
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return <main className={frame.page}>{/* 휴대폰에서 문의를 열어 둔 동안 머리말 뒤로 단추는 목록으로 — 상세 안의 두 번째 뒤로 단추는 뺐다(뒤로가 두 개였다) */}
    <BusinessAppChrome title="손님 문의" active="inquiries" onBack={selected && phone ? () => setSelectedId(null) : undefined}>
    {items === null && !error ? <PlanLoading fill variant="compact" note="문의를 불러오고 있어요" onRetry={() => refresh(true)} /> : <div className={styles.wrap} data-detail={selected ? "" : undefined}>
      <aside className={styles.list} aria-label="문의 목록">
        {/* 문의가 하나도 없으면 0개짜리 거름 단추는 빼고, 새로 확인하는 단추만 빈 화면 안에 둔다 */}
        {items?.length === 0 ? null : <div className={styles.listHead}>
          <div className={styles.filters} role="tablist" aria-label="문의 보기">
            <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>전체{items ? ` ${items.length}` : ""}</button>
            <button type="button" role="tab" aria-selected={filter === "open"} onClick={() => setFilter("open")}>답할 것{items ? ` ${open}` : ""}</button>
          </div>
          <button type="button" className={styles.refresh} onClick={() => refresh(true)} aria-label="문의 새로고침" title="새로고침"><RefreshCw size={16} /></button>
        </div>}
        {error ? <p className={styles.notice} role="alert">{error} {error === AUTH_ERROR ? <Link className={styles.retry} href={`/account?next=${encodeURIComponent("/plan/inquiries")}`}>다시 로그인</Link> : <button type="button" className={styles.retry} onClick={() => refresh(true)}>다시 시도</button>}</p> : null}
        {/* 불러오지 못했으면 '문의 없음'이라고 하지 않는다 — 있는 문의를 없다고 믿게 된다 */}
        {items === null ? null : shown.length === 0 ? <div className={styles.empty}>
          <Inbox size={28} aria-hidden />
          <strong>{filter === "open" && items?.length ? "답할 문의가 없어요" : "아직 들어온 문의가 없어요"}</strong>
          <p>홈페이지를 공개하면 손님 문의가 여기로 모여요. 들어오면 알림 받을 번호로 문자도 보내 드려요.</p>
          {items.length === 0 && recentPlanId ? <div className={styles.emptyActions}>
            <Link className={styles.emptyLink} href={homepageHref(recentPlanId)}>홈페이지 보기</Link>
            <Link className={styles.emptyLink} href={`${homepageHref(recentPlanId)}#hk-leads`}>알림 번호 설정</Link>
          </div> : null}
          {items.length === 0 ? <button type="button" className={styles.emptyRefresh} onClick={() => refresh(true)}><RefreshCw size={14} aria-hidden /> 새로 확인</button> : null}
        </div> : <ul className={styles.rows}>
          {shown.map(item => <li key={item.lead.id}>
            <button type="button" aria-current={item.lead.id === selected?.lead.id ? "true" : undefined} onClick={() => setSelectedId(item.lead.id)}>
              <i aria-hidden>{item.lead.name.slice(0, 1)}</i>
              <span className={styles.rowMain}>
                <span className={styles.rowTop}><strong>{item.lead.name}</strong><small>{shortTime(item.lead.createdAt)}</small></span>
                {/* 처리한 문의는 '전체'에서도 알아보게 — 예전엔 점이 없을 뿐이라 처리했는지 알 수 없었다(여정 점검 2026-10-22).
                    표시는 둘째 줄 오른쪽에 — 줄 끝에 두면 '처리 완료' 글자 폭만큼 위 시각이 안쪽으로 밀려 줄마다 어긋났다(감사 2026-10-23) */}
                <span className={styles.rowMeta}><span className={styles.rowBiz}>{item.businessName}</span>{item.lead.handledAt === null ? <b className={styles.dot} aria-label="답할 문의" /> : <em className={styles.handledBadge}>처리 완료</em>}</span>
                <span className={styles.rowText}>{item.lead.message || "내용 없이 연락처만 남겼어요"}</span>
              </span>
            </button>
          </li>)}
        </ul>}
      </aside>
      <section className={styles.detail} aria-label="문의 내용">
        {/* 문의가 하나도 없으면 '왼쪽에서 골라 주세요'는 맞지 않는 말이다 */}
        {selected ? <InquiryDetail key={selected.lead.id} item={selected} notifications={notifications} /> : <div className={styles.placeholder}><Inbox size={30} aria-hidden /><p>{items && items.length === 0 ? "들어온 문의가 여기에 보여요" : "왼쪽에서 문의를 골라 주세요"}</p></div>}
      </section>
    </div>}
  </BusinessAppChrome></main>;
}

function InquiryDetail({ item, notifications }: { item: Inquiry; notifications: ReturnType<typeof useHomepageLeadNotifications> }) {
  const [lead, setLead] = useState(item.lead);
  const at = new Date(lead.createdAt).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
  return <div className={styles.thread}>
    <header className={styles.threadHead}>
      <i aria-hidden>{lead.name.slice(0, 1)}</i>
      <div><strong>{lead.name}</strong><Link href={homepageHref(item.planId)}>{item.businessName} 홈페이지</Link></div>
      {lead.handledAt ? <em className={styles.done}>처리 완료</em> : <em className={styles.open}>답할 문의</em>}
    </header>
    <div className={styles.messages}>
      <p className={styles.day}>{at}</p>
      <div className={styles.bubble}>{lead.message || "내용 없이 연락처만 남겼어요."}</div>
    </div>
    <dl className={styles.info}>
      {lead.phone ? <div><dt>전화</dt><dd>{formatKoreanPhone(lead.phone)}</dd></div> : null}
      {lead.email ? <div><dt>이메일</dt><dd>{lead.email}</dd></div> : null}
      <div><dt>홍보 수신</dt><dd>{lead.marketingAgreed ? "동의함" : "동의 안 함"}</dd></div>
    </dl>
    <div className={styles.actions}>
      <HomepageLeadActions projectId={item.projectId} lead={lead} businessName={item.businessName} onHandled={(leadId, handledAt) => { setLead(current => ({ ...current, handledAt })); markInquiryHandled(leadId, handledAt); }} />
      {notifications.items ? <HomepageLeadNotification value={notifications.items.find(entry => entry.leadId === lead.id)} busy={notifications.retrying !== null} onRetry={() => { void notifications.retry(lead.id); }} phoneHref={item.planId ? `${homepageHref(item.planId)}#hk-leads` : undefined} /> : null}
      {notifications.error ? <small className={styles.notifyError} role="alert">{notifications.error}</small> : null}
    </div>
    <p className={styles.privacy}>손님 개인정보예요. 상담이 끝나면 외부로 옮기거나 공유하지 마세요.</p>
  </div>;
}
