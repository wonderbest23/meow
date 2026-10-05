"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, RefreshCw } from "lucide-react";
import AdminNav from "../AdminNav";
import styles from "../generation/page.module.css";

type Order = { orderId: string; domain: string; status: "requested" | "registered"; registeredAt?: string; paidAt: string; customerEmail: string | null; planId: string; amount: number };

function date(value?: string) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ko-KR") : "-"; }

/*
 * 도메인 구매 대행 처리함.
 * 결제된 주문마다: 등록기관(가비아 등)에서 고객 명의로 주소를 사고 → www 를 CNAME 연결 주소로 향하게 한 뒤
 * → '등록 완료'를 누른다. 그러면 고객 화면의 '연결 시작'이 열린다.
 */
export default function DomainOrdersAdminPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [cnameTarget, setCnameTarget] = useState("connect.oneulstart.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    if (busy || !window.confirm(`${order.domain} 등록과 www CNAME(${cnameTarget}) 설정을 마쳤나요? 고객 화면에 '연결 시작'이 열립니다.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/payments/domain-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.orderId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "바꾸지 못했습니다");
      setOrders(data.orders);
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
      {login && <Link href="/admin">관리자 로그인</Link>}
      <section className={styles.section}>
        <header><h2>처리 순서</h2></header>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8, fontSize: 14 }}>
          <li>가비아 등 등록기관에서 <strong>고객 명의</strong>로 주소를 등록합니다(필요한 정보는 고객 이메일로 요청).</li>
          <li>그 주소의 DNS에 <code>www</code> CNAME → <code>{cnameTarget}</code> 를 추가합니다.</li>
          <li>아래 ‘등록 완료’를 누르면 고객 화면에 ‘연결 시작’이 열립니다. 살 수 없는 주소면 고객과 다른 주소를 정하거나, ‘전액 환불’로 카드 결제를 취소합니다(환불 접수함에도 기록됩니다).</li>
        </ol>
      </section>
      {orders && <section className={styles.section}>
        <header><h2>결제된 주문</h2></header>
        <div className={styles.table}><table>
          <thead><tr><th>주소</th><th>상태</th><th>고객</th><th>결제</th><th></th></tr></thead>
          <tbody>{orders.map((order) => <tr key={order.orderId}>
            <td><strong>{order.domain}</strong><small>{order.orderId}</small></td>
            <td>{order.status === "registered" ? <><strong>등록 완료</strong><small>{date(order.registeredAt)}</small></> : <strong className={styles.failure}>처리 대기</strong>}</td>
            <td>{order.customerEmail ?? "-"}<small>{order.planId}</small></td>
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
