"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import AdminNav from "../AdminNav";
import styles from "../generation/page.module.css";
import { findService, SERVICE_GROUPS } from "../../../lib/services/catalog";
import { formatKoreanPhone, telHref } from "../../../lib/contact-links";
import { SERVICE_REQUEST_NEXT, SERVICE_REQUEST_STATUS_LABELS, type ServiceRequestRecord, type ServiceRequestStatus } from "../../../lib/services/requests";

function date(value?: string) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ko-KR") : "-"; }

/* 어드민 단추 글 — 사장님 화면의 '연락드렸어요'와 달리 운영자가 한 일로 적는다 */
const ACTION_LABELS: Record<ServiceRequestStatus, string> = { received: "접수로 되돌리기", contacted: "연락함", done: "완료", canceled: "취소" };

/*
 * 서비스 신청함 — '다음 단계'에서 들어온 상담 신청.
 * 신청이 들어오면 메일이 오고, 여기서 전화한 뒤 '연락함' → 끝나면 '완료'를 누른다.
 * 상태는 사장님 화면(유지보수 → 다음 단계)에 그대로 보인다.
 */
export default function ServiceRequestsAdminPage() {
  const [requests, setRequests] = useState<ServiceRequestRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/service-requests", { cache: "no-store" });
      const data = await response.json();
      setLogin(response.status === 401);
      if (!response.ok) throw new Error(data.error?.message ?? "불러오지 못했습니다");
      setRequests(data.requests);
    } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했습니다"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function move(item: ServiceRequestRecord, status: ServiceRequestStatus) {
    if (busy) return;
    if (status === "canceled" && !window.confirm("이 신청을 취소로 바꿀까요? 사장님 화면에도 '취소'로 보입니다.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/service-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, expected: item.status, status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "바꾸지 못했습니다");
      setRequests((current) => current?.map((row) => (row.id === item.id ? data.request : row)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "바꾸지 못했습니다");
      void load();
    } finally { setBusy(false); }
  }

  const waiting = requests?.filter((item) => item.status === "received").length ?? 0;
  return <main className={styles.page}>
    {!login && <AdminNav title="서비스 신청" subtitle="다음 단계(창업 행정 도움·마케팅) 상담 신청 처리함" />}
    <div className={styles.content}>
      <div className={styles.toolbar}>
        <button title="새로고침" aria-label="새로고침" disabled={busy} onClick={() => void load()}><RefreshCw size={18} /></button>
        {requests && <small>새 신청 {waiting}건 · 전체 {requests.length}건</small>}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {login && <Link href="/admin">관리자 로그인</Link>}
      {requests && <section className={styles.section}>
        <header><h2>신청 목록 (최신순)</h2></header>
        <div className={styles.table}><table>
          <thead><tr><th>서비스</th><th>사업</th><th>연락처</th><th>메모</th><th>상태</th><th></th></tr></thead>
          <tbody>{requests.map((item) => {
            const service = findService(item.serviceId);
            const group = SERVICE_GROUPS.find((g) => g.id === service?.group);
            const tel = telHref(item.phone);
            return <tr key={item.id}>
              <td><strong>{service?.title ?? item.serviceId}</strong><small>{group?.title ?? "알 수 없는 서비스"} · {date(item.createdAt)}</small></td>
              <td>{item.planTitle || "-"}<small>{item.customerEmail || item.planId}</small></td>
              <td>{tel ? <a href={tel}>{formatKoreanPhone(item.phone)}</a> : item.phone}<small>{item.preferredTime ? `희망: ${item.preferredTime}` : "희망 시간 없음"}</small></td>
              <td style={{ maxWidth: 260, whiteSpace: "pre-wrap" }}>{item.memo || "-"}</td>
              <td>{item.status === "received" ? <strong className={styles.failure}>{SERVICE_REQUEST_STATUS_LABELS[item.status]}</strong> : <strong>{SERVICE_REQUEST_STATUS_LABELS[item.status]}</strong>}<small>{date(item.updatedAt)}</small></td>
              {/* 단추가 좁은 칸에서 글자째 접혀 겹쳤다 — 줄을 바꿔 쌓고 글자는 한 줄로 */}
              <td><div style={{ display: "flex", flexWrap: "wrap", gap: 6, minWidth: 150 }}>{SERVICE_REQUEST_NEXT[item.status].map((next) => <button key={next} disabled={busy} style={{ whiteSpace: "nowrap", width: "auto", padding: "0 12px", height: 36, borderRadius: 6 }} onClick={() => void move(item, next)}>{ACTION_LABELS[next]}</button>)}</div></td>
            </tr>;
          })}</tbody>
        </table></div>
        {requests.length === 0 && <p className={styles.empty}>아직 들어온 신청이 없습니다</p>}
      </section>}
    </div>
  </main>;
}
