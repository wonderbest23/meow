"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Inbox, RefreshCw } from "lucide-react";
import BusinessAppChrome from "../BusinessAppChrome";
import PlanLoading from "../PlanLoading";
import frame from "../chat/page.module.css";
import styles from "./page.module.css";
import { HomepageLeadActions } from "../../../components/homepage-lead-actions";
import { HomepageLeadNotification, useHomepageLeadNotifications } from "../../../components/homepage-lead-notifications";
import { formatKoreanPhone } from "../../../lib/contact-links";
import { homepageHref } from "../../../lib/plan-builder/journey";
import { markInquiryHandled, unansweredCount, useInquiries, type Inquiry } from "./use-inquiries";

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
  // PC 는 처음에 가장 최근 문의를 열어 둔다(휴대폰은 목록부터)
  useEffect(() => {
    if (selectedId || !items?.length || window.matchMedia("(max-width: 760px)").matches) return;
    setSelectedId(items[0].lead.id);
  }, [items, selectedId]);
  const open = items ? unansweredCount(items) : 0;

  return <main className={frame.page}><BusinessAppChrome title="내 문의" active="inquiries">
    {items === null && !error ? <PlanLoading fill variant="compact" note="문의를 불러오고 있어요" /> : <div className={styles.wrap} data-detail={selected ? "" : undefined}>
      <aside className={styles.list} aria-label="문의 목록">
        <div className={styles.listHead}>
          <div className={styles.filters} role="tablist" aria-label="문의 보기">
            <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>전체{items ? ` ${items.length}` : ""}</button>
            <button type="button" role="tab" aria-selected={filter === "open"} onClick={() => setFilter("open")}>답할 것{items ? ` ${open}` : ""}</button>
          </div>
          <button type="button" className={styles.refresh} onClick={() => refresh(true)} aria-label="문의 새로고침" title="새로고침"><RefreshCw size={16} /></button>
        </div>
        {error ? <p className={styles.notice} role="alert">{error} <button type="button" className={styles.retry} onClick={() => refresh(true)}>다시 불러오기</button></p> : null}
        {/* 불러오지 못했으면 '문의 없음'이라고 하지 않는다 — 있는 문의를 없다고 믿게 된다 */}
        {items === null ? null : shown.length === 0 ? <div className={styles.empty}>
          <Inbox size={28} aria-hidden />
          <strong>{filter === "open" && items?.length ? "답할 문의가 없어요" : "아직 들어온 문의가 없어요"}</strong>
          <p>홈페이지를 공개하면 손님 문의가 여기로 모여요. 들어오면 알림 받을 번호로 문자도 보내 드려요.</p>
        </div> : <ul className={styles.rows}>
          {shown.map(item => <li key={item.lead.id}>
            <button type="button" aria-current={item.lead.id === selected?.lead.id ? "true" : undefined} onClick={() => setSelectedId(item.lead.id)}>
              <i aria-hidden>{item.lead.name.slice(0, 1)}</i>
              <span className={styles.rowMain}>
                <span className={styles.rowTop}><strong>{item.lead.name}</strong><small>{shortTime(item.lead.createdAt)}</small></span>
                <span className={styles.rowBiz}>{item.businessName}</span>
                <span className={styles.rowText}>{item.lead.message || "내용 없이 연락처만 남겼어요"}</span>
              </span>
              {item.lead.handledAt === null ? <b className={styles.dot} aria-label="답할 문의" /> : null}
            </button>
          </li>)}
        </ul>}
      </aside>
      <section className={styles.detail} aria-label="문의 내용">
        {selected ? <InquiryDetail key={selected.lead.id} item={selected} onBack={() => setSelectedId(null)} /> : <div className={styles.placeholder}><Inbox size={30} aria-hidden /><p>왼쪽에서 문의를 골라 주세요</p></div>}
      </section>
    </div>}
  </BusinessAppChrome></main>;
}

function InquiryDetail({ item, onBack }: { item: Inquiry; onBack: () => void }) {
  const [lead, setLead] = useState(item.lead);
  const notifications = useHomepageLeadNotifications(item.projectId, 0);
  const at = new Date(lead.createdAt).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
  return <div className={styles.thread}>
    <header className={styles.threadHead}>
      <button type="button" className={styles.back} onClick={onBack} aria-label="문의 목록으로"><ChevronLeft size={22} /></button>
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
      <div><dt>받은 시각</dt><dd>{new Date(lead.createdAt).toLocaleString("ko-KR")}</dd></div>
      <div><dt>사업</dt><dd>{item.businessName}</dd></div>
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
