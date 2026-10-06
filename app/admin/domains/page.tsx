"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, RefreshCw } from "lucide-react";
import AdminNav from "../AdminNav";
import styles from "../generation/page.module.css";

type Order = { orderId: string; domain: string; status: "requested" | "registered"; registeredAt?: string; paidAt: string; customerEmail: string | null; planId: string; amount: number;
  registrant?: { name: string; phone: string; postalCode: string; address: string; addressDetail: string };
  auto?: { state: string; at: string; reason: string } };

/* 자동 등록(.com) 상태 — 손으로 할 일인지 한눈에 */
const AUTO_LABEL: Record<string, string> = { checking: "자동 등록 확인 중", in_progress: "자동 등록 중", succeeded: "자동 등록 완료", manual: "손으로 처리 필요" };

function date(value?: string) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ko-KR") : "-"; }

/*
 * 도메인 구매 대행 처리함.
 * .com 은 결제 직후 자동 등록(Cloudflare Registrar)·DNS·연결까지 된다 — '손으로 처리 필요'만 사람이 한다.
 * .kr·.co.kr 과 자동이 안 된 주문: 등록기관(가비아 등)에서 고객 명의(결제 때 받은 명의자 정보)로 사고
 * → www 를 CNAME 연결 주소로 향하게 한 뒤 → '등록 완료'를 누른다.
 */
export default function DomainOrdersAdminPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [cnameTarget, setCnameTarget] = useState("connect.oneulstart.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [login, setLogin] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/payments/domain-orders", { cache: "no-store" });
      const data = await response.json();
      setLogin(response.status === 401);
      if (!response.ok) throw new Error(data.error?.message ?? "불러오지 못했습니다");
      setOrders(data.orders); setCnameTarget(data.cnameTarget ?? cnameTarget);
    } catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했습니다"); }
    finally { setBusy(false); }
  }, [cnameTarget]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function registered(order: Order) {
    if (busy || !window.confirm(`${order.domain} 등록과 www CNAME(${cnameTarget}) 설정을 마쳤나요? 연결을 바로 시작하고 고객에게 알립니다.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/payments/domain-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.orderId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "바꾸지 못했습니다");
      setOrders(data.orders);
      // 자동 연결·사장님 알림 결과 — 실패는 경고로만 온다(등록 완료는 이미 저장됨)
      setNotice(data.warning ? `등록 완료로 바꿨어요. ${data.warning}` : data.connection?.connected ? `${data.connection.hostname} 연결을 시작하고 사장님께 알렸어요(${(data.connection.notified ?? []).join("·") || "알림 없음"}).` : "");
    } catch (e) { setError(e instanceof Error ? e.message : "바꾸지 못했습니다"); }
    finally { setBusy(false); }
  }

  /* 등록할 수 없는 주소 — 전액 카드 취소하고 도메인 연결 상품을 닫는다(환불 접수함에도 기록이 남는다) */
  async function refund(order: Order) {
    if (busy) return;
    const note = window.prompt(`${order.domain} 주문 ${order.amount.toLocaleString("ko-KR")}원을 전액 카드 취소합니다. 고객에게 보일 사유를 적어 주세요(5자 이상).`, "등록할 수 없는 주소로 확인되어 전액 환불");
    if (note === null) return;
    if (note.trim().length < 5) { setError("환불 사유를 5자 이상 적어 주세요."); return; }
    if (!window.confirm("카드 취소는 되돌릴 수 없습니다. 진행할까요?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/payments/domain-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.orderId, action: "refund", note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "환불하지 못했습니다");
      setOrders(data.orders);
    } catch (e) { setError(e instanceof Error ? e.message : "환불하지 못했습니다"); }
    finally { setBusy(false); }
  }

  const waiting = orders?.filter((order) => order.status === "requested").length ?? 0;
  return <main className={styles.page}>
    {!login && <AdminNav title="도메인 구매" subtitle="고객 명의로 도메인을 사서 연결 준비를 마치는 처리함" />}
    <div className={styles.content}>
      <div className={styles.toolbar}>
        <button title="새로고침" aria-label="새로고침" disabled={busy} onClick={() => void load()}><RefreshCw size={18} /></button>
        {orders && <small>처리 대기 {waiting}건 · 전체 {orders.length}건</small>}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{notice}</p>}
      {login && <Link href="/admin">관리자 로그인</Link>}
      <section className={styles.section}>
        <header><h2>처리 순서</h2></header>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, fontSize: 14 }}>
          <li><strong>.com 은 자동</strong>입니다(등록·DNS·연결·고객 알림). 상태가 ‘손으로 처리 필요’인 주문과 .kr·.co.kr 주문만 아래 순서로 처리합니다.</li>
          <li>가비아 등 등록기관에서 <strong>고객 명의</strong>로 주소를 등록합니다(명의자 정보는 표의 ‘명의자’ 칸 — 결제 때 받은 것).</li>
          <li>그 주소의 DNS에 <code>www</code> CNAME → <code>{cnameTarget}</code> 를 추가합니다.</li>
          <li>아래 ‘등록 완료’를 누르면 그 홈페이지에 www 주소 연결을 바로 시작하고 고객에게 문자·메일로 알립니다(안 되면 경고가 보이고, 고객 화면의 ‘연결 시작’으로도 연결할 수 있습니다). 살 수 없는 주소면 고객과 다른 주소를 정하거나, ‘전액 환불’로 카드 결제를 취소합니다(환불 접수함에도 기록됩니다).</li>
        </ol>
      </section>
      {orders && <section className={styles.section}>
        <header><h2>결제된 주문</h2></header>
        <div className={styles.table}><table>
          <thead><tr><th>주소</th><th>상태</th><th>고객</th><th>결제</th><th></th></tr></thead>
          <tbody>{orders.map((order) => <tr key={order.orderId}>
            <td><strong>{order.domain}</strong><small>{order.orderId}</small></td>
            <td>{order.status === "registered" ? <><strong>등록 완료</strong><small>{date(order.registeredAt)}</small></> : <strong className={styles.failure}>{order.auto && order.auto.state !== "manual" ? AUTO_LABEL[order.auto.state] ?? "처리 대기" : "처리 대기"}</strong>}
              {order.auto ? <small>{AUTO_LABEL[order.auto.state] ?? order.auto.state}{order.auto.reason ? ` — ${order.auto.reason}` : ""}</small> : null}</td>
            <td>{order.customerEmail ?? "-"}<small>{order.planId}</small>
              {order.registrant ? <small>명의자: {order.registrant.name} · {order.registrant.phone} · ({order.registrant.postalCode}) {order.registrant.address} {order.registrant.addressDetail}</small> : <small>명의자 정보 없음(옛 주문 — 고객에게 요청)</small>}</td>
            <td>{order.amount.toLocaleString("ko-KR")}원<small>{date(order.paidAt)}</small></td>
            <td>{order.status === "requested" && <>
              <button disabled={busy} onClick={() => void registered(order)}><CheckCircle2 size={16} /> 등록 완료</button>
              <button disabled={busy} onClick={() => void refund(order)}>전액 환불</button>
            </>}</td>
          </tr>)}</tbody>
        </table></div>
        {orders.length === 0 && <p className={styles.empty}>아직 도메인 구매 주문이 없습니다</p>}
      </section>}
    </div>
  </main>;
}
