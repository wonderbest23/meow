"use client";

import { Banknote, CheckCircle2, Clock3, ExternalLink, FileCheck2, LogOut, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type SessionState = { authenticated: boolean; configured: boolean };
type AdminTransferOrder = {
  orderId: string;
  amount: number;
  orderName: string;
  status: string;
  customerEmail: string | null;
  depositorName: string | null;
  customerPhone: string | null;
  cashReceiptType: "PERSONAL" | "BUSINESS" | "NONE" | null;
  cashReceiptIdentifier: string | null;
  cashReceiptStatus: "not_requested" | "requested" | "issued";
  cashReceiptIssuedAt: string | null;
  depositReportedAt: string | null;
  expiresAt: string;
  confirmedAt: string | null;
  projectId: string | null;
  adminNote: string | null;
  opportunityTitle: string;
  createdAt: string;
  updatedAt: string;
};

const statusText: Record<string, string> = {
  awaiting_deposit: "입금 대기",
  deposit_reported: "고객 입금 알림",
  done: "입금 확인 완료",
  refunded: "환불 완료",
  canceled: "주문 취소",
  expired: "입금 기한 만료",
  failed: "처리 오류",
};

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function AdminPaymentsPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<AdminTransferOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const data = await payload<{ orders: AdminTransferOrder[] }>(await fetch("/api/admin/payments/orders", { cache: "no-store" }));
    setOrders(data.orders);
    setSelectedId((current) => current ?? data.orders[0]?.orderId ?? null);
  }, []);

  useEffect(() => {
    void fetch("/api/admin/support/session?scope=payments", { cache: "no-store" })
      .then((response) => payload<SessionState>(response))
      .then((state) => { setSession(state); if (state.authenticated) void load().catch((error) => setMessage(error.message)); })
      .catch((error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    if (!session?.authenticated) return;
    const timer = window.setInterval(() => void load().catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, [load, session?.authenticated]);

  const selected = useMemo(() => orders.find((order) => order.orderId === selectedId) ?? null, [orders, selectedId]);
  const waitingCount = orders.filter((order) => ["awaiting_deposit", "deposit_reported"].includes(order.status)).length;

  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await payload(await fetch("/api/admin/support/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, scope: "payments" }) }));
      setPassword(""); setSession({ authenticated: true, configured: true }); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "로그인하지 못했습니다."); } finally { setBusy(false); }
  };

  const logout = async () => {
    await fetch("/api/admin/support/session?scope=payments", { method: "DELETE" });
    setSession((current) => ({ authenticated: false, configured: current?.configured ?? true }));
  };

  const act = async (action: "confirm" | "cancel" | "refund" | "cash_receipt_issued") => {
    if (!selected || busy) return;
    const warning = action === "confirm" ? "카카오뱅크 거래내역에서 금액과 입금자명을 직접 확인했나요?"
      : action === "refund" ? "제작 시작 후 단순 변심 환불은 제한됩니다. 결과물 미제공·계약 불일치·중대한 하자 등 법정 예외를 확인했고, 고객 계좌로 실제 환급을 완료했나요?"
        : action === "cash_receipt_issued" ? "홈택스에서 현금영수증 발급을 완료했나요?"
          : "이 주문을 취소할까요?";
    if (!window.confirm(warning)) return;
    setBusy(true); setMessage("");
    try {
      const data = await payload<{ order: AdminTransferOrder }>(await fetch("/api/admin/payments/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selected.orderId, action, note }),
      }));
      setOrders((current) => current.map((order) => order.orderId === data.order.orderId ? data.order : order));
      setNote("");
      setMessage(action === "confirm" ? "입금 확인을 완료하고 고객 프로젝트를 생성했습니다."
        : action === "refund" ? "법정 예외 환급 완료 상태로 기록했습니다."
          : action === "cash_receipt_issued" ? "현금영수증 발급 완료로 기록했습니다."
            : "주문을 취소했습니다.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "주문을 처리하지 못했습니다."); } finally { setBusy(false); }
  };

  if (!session) return <main className="admin-support-loading"><RefreshCw /> 입금 주문을 불러오는 중입니다.</main>;
  if (!session.authenticated) return <main className="admin-login-page"><form onSubmit={login}><span><Banknote /></span><h1>입금 주문 관리</h1><p>계좌 입금 확인과 현금영수증 상태를 처리합니다.</p><label><span>관리자 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>{message && <p className="admin-login-error">{message}</p>}<button disabled={busy || !password || !session.configured}>로그인</button><Link href="/">고객 화면으로 돌아가기</Link></form></main>;

  return <main className="admin-payment-page">
    <header className="admin-support-header">
      <div><span><Banknote /></span><div><strong>계좌이체 주문 관리</strong><small>카카오뱅크 3333-01-4982733 · 김주홍</small></div></div>
      <div><Link href="/admin">1:1 문의</Link><Link className="active" href="/admin/payments">입금 주문</Link><Link href="/admin/legal">운영 설정</Link><button type="button" onClick={logout}><LogOut /> 로그아웃</button></div>
    </header>
    <section className="admin-payment-summary"><div><Clock3 /><span><small>확인할 주문</small><strong>{waitingCount}건</strong></span></div><p>고객의 ‘입금했어요’ 알림만 믿지 말고 카카오뱅크 거래내역의 금액과 입금자명을 직접 대조하세요.</p><button onClick={() => void load()}><RefreshCw /> 새로고침</button></section>
    <div className="admin-payment-workspace">
      <aside className="admin-payment-orders"><header><strong>최근 계좌이체 주문</strong><span>{orders.length}건</span></header><div>{orders.length === 0 && <p>아직 계좌이체 주문이 없습니다.</p>}{orders.map((order) => <button key={order.orderId} className={selectedId === order.orderId ? "selected" : ""} onClick={() => { setSelectedId(order.orderId); setNote(order.adminNote ?? ""); }}><span><strong>{order.depositorName || "입금자 미입력"}</strong><em className={`status-${order.status}`}>{statusText[order.status] ?? order.status}</em></span><p>{order.opportunityTitle}</p><small>{order.amount.toLocaleString("ko-KR")}원 · {dateTime(order.createdAt)}</small></button>)}</div></aside>
      <article className="admin-payment-detail">
        {!selected ? <div className="admin-chat-placeholder"><Banknote /><strong>확인할 주문을 선택하세요</strong><p>입금 대기 주문의 금액과 입금자명을 확인할 수 있습니다.</p></div> : <>
          <header><div><small>{selected.orderId}</small><h1>{selected.opportunityTitle}</h1><span className={`status-${selected.status}`}>{statusText[selected.status] ?? selected.status}</span></div>{selected.projectId && <Link href={`/?view=project&project=${selected.projectId}`} target="_blank">프로젝트 열기 <ExternalLink /></Link>}</header>
          <section className="admin-payment-amount"><small>확인할 입금 금액</small><strong>{selected.amount.toLocaleString("ko-KR")}원</strong><span>{selected.depositorName} 이름으로 입금</span></section>
          <dl><div><dt>주문자 계정</dt><dd>{selected.customerEmail || "-"}</dd></div><div><dt>연락처</dt><dd>{selected.customerPhone || "-"}</dd></div><div><dt>입금 알림</dt><dd>{dateTime(selected.depositReportedAt)}</dd></div><div><dt>입금 기한</dt><dd>{dateTime(selected.expiresAt)}</dd></div><div><dt>입금 확인</dt><dd>{dateTime(selected.confirmedAt)}</dd></div></dl>
          <section className="admin-cash-receipt"><header><FileCheck2 /><div><strong>현금영수증</strong><small>{selected.cashReceiptType === "PERSONAL" ? "소득공제용" : selected.cashReceiptType === "BUSINESS" ? "지출증빙용" : "구매자 번호 없이 발급"}</small></div><em>{selected.cashReceiptStatus === "issued" ? "발급 완료" : selected.cashReceiptStatus === "requested" ? "발급 필요" : "해당 없음"}</em></header>{selected.cashReceiptIdentifier && <p>{selected.cashReceiptIdentifier}</p>}</section>
          <label className="admin-payment-note"><span>처리 메모</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={selected.status === "done" ? "예: 약정한 핵심 결과물 미제공 확인, 7월 23일 전액 환급" : "예: 7월 23일 14:32 입금 확인"} /></label>
          {message && <p className="admin-payment-message">{message}</p>}
          <footer>
            {["awaiting_deposit", "deposit_reported"].includes(selected.status) && <><button className="confirm" disabled={busy} onClick={() => void act("confirm")}><CheckCircle2 /> 입금 확인·제작 시작</button><button disabled={busy} onClick={() => void act("cancel")}><XCircle /> 주문 취소</button></>}
            {selected.status === "done" && <button className="refund" disabled={busy || note.trim().length < 5} onClick={() => void act("refund")} title={note.trim().length < 5 ? "예외 환급 사유를 처리 메모에 적어주세요." : undefined}><RotateCcw /> 예외 환급 처리</button>}
            {selected.status === "done" && selected.cashReceiptStatus === "requested" && <button disabled={busy} onClick={() => void act("cash_receipt_issued")}><FileCheck2 /> 현금영수증 발급 완료</button>}
          </footer>
        </>}
      </article>
    </div>
  </main>;
}
