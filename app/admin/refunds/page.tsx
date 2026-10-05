"use client";

import { CheckCircle2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AdminNav from "../AdminNav";

type SessionState = { authenticated: boolean; configured: boolean };

type RefundRequest = {
  id: string;
  createdAt: string;
  updatedAt: string;
  customerEmail: string;
  orderId: string;
  orderName: string;
  amount: number;
  reason: string;
  status: "received" | "processing" | "done" | "rejected";
  adminNote: string;
};

const statusText: Record<RefundRequest["status"], string> = {
  received: "접수됨",
  processing: "처리 중",
  done: "환불 완료",
  rejected: "거절",
};

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function AdminRefundsPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [password, setPassword] = useState("");
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /* 환불 금액 — 비우면 요청 금액 전액. 도메인 월할·토큰 잔량 환불처럼 일부만 돌려줄 때 적는다 */
  const [amount, setAmount] = useState("");
  /* 옛 계좌이체 주문 — 카드 취소가 없으니 계좌로 직접 돌려준 뒤 기록만 */
  const [manualTransfer, setManualTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const data = await payload<{ requests: RefundRequest[] }>(await fetch("/api/admin/refunds", { cache: "no-store" }));
    setRequests(data.requests);
    setSelectedId((current) => current ?? data.requests[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then((response) => payload<SessionState>(response))
      .then((state) => { setSession(state); if (state.authenticated) void load().catch((error) => setMessage(error.message)); })
      .catch((error) => setMessage(error.message));
  }, [load]);

  const selected = useMemo(() => requests.find((item) => item.id === selectedId) ?? null, [requests, selectedId]);
  const pending = requests.filter((item) => item.status === "received").length;

  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await payload(await fetch("/api/admin/support/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }));
      setPassword(""); setSession({ authenticated: true, configured: true }); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "로그인하지 못했습니다."); } finally { setBusy(false); }
  };

  const refundAmount = amount.trim() ? Number(amount.replace(/[^\d]/g, "")) : selected?.amount ?? 0;
  const act = async (status: "done" | "rejected") => {
    if (!selected || busy) return;
    const warning = status === "done"
      ? manualTransfer
        ? `고객 계좌로 ${refundAmount.toLocaleString("ko-KR")}원을 직접 돌려드렸나요? 환불 완료로 기록하고 이 상품 이용을 닫습니다.`
        : `나이스페이로 ${refundAmount.toLocaleString("ko-KR")}원을 카드 취소합니다. 취소되면 이 상품 이용이 바로 닫히고 되돌릴 수 없습니다. 진행할까요?`
      : "이 환불 요청을 거절할까요? 처리 메모가 고객 화면에 거절 사유로 보입니다.";
    if (!window.confirm(warning)) return;
    setBusy(true); setMessage("");
    try {
      const data = await payload<{ request: RefundRequest }>(await fetch("/api/admin/refunds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, status, note, ...(status === "done" ? { amount: refundAmount, manualTransfer } : {}) }),
      }));
      setRequests((current) => current.map((item) => (item.id === data.request.id ? data.request : item)));
      setNote(""); setAmount(""); setManualTransfer(false);
      setMessage(status === "done" ? (manualTransfer ? "환불 완료로 기록하고 상품 이용을 닫았습니다." : "카드 취소를 마치고 상품 이용을 닫았습니다.") : "거절로 기록했습니다. 고객 화면에 사유가 보입니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리하지 못했습니다.");
      void load().catch(() => undefined);
    } finally { setBusy(false); }
  };

  if (!session) return <main className="admin-support-loading"><RefreshCw /> 환불 요청을 불러오는 중입니다.</main>;
  if (!session.authenticated) {
    return (
      <main className="admin-login-page">
        <form onSubmit={login}>
          <span><RotateCcw /></span>
          <h1>환불 접수함</h1>
          <p>고객이 접수한 환불 요청을 확인하고 처리합니다.</p>
          <label><span>관리자 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>
          {message && <p className="admin-login-error">{message}</p>}
          <button disabled={busy || !password || !session.configured}>로그인</button>
          <Link href="/">고객 화면으로 돌아가기</Link>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-payment-page">
      <AdminNav title="환불 접수함" subtitle="고객 환불 요청 확인·처리" />
      <section className="admin-payment-summary">
        <div><RotateCcw /><span><small>처리 대기</small><strong>{pending}건</strong></span></div>
        <p>‘카드 취소하고 환불 완료’를 누르면 나이스페이로 실제 취소하고 그 상품 이용을 닫습니다. 일부만 돌려줄 때는 금액을 적으세요.</p>
        <button onClick={() => void load()}><RefreshCw /> 새로고침</button>
      </section>
      <div className="admin-payment-workspace">
        <aside className="admin-payment-orders">
          <header><strong>환불 요청</strong><span>{requests.length}건</span></header>
          <div>
            {requests.length === 0 && <p>아직 접수된 환불 요청이 없습니다.</p>}
            {requests.map((item) => (
              <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => { setSelectedId(item.id); setNote(item.status === "received" ? "" : item.adminNote ?? ""); setAmount(""); setManualTransfer(false); setMessage(""); }}>
                <span><strong>{item.customerEmail || "이메일 미확인"}</strong><em className={`status-${item.status === "done" ? "done" : item.status === "rejected" ? "canceled" : "deposit_reported"}`}>{statusText[item.status]}</em></span>
                <p>{item.orderName || item.orderId}</p>
                <small>{item.amount.toLocaleString("ko-KR")}원 · {dateTime(item.createdAt)}</small>
              </button>
            ))}
          </div>
        </aside>
        <article className="admin-payment-detail">
          {!selected ? (
            <div className="admin-chat-placeholder"><RotateCcw /><strong>처리할 요청을 선택하세요</strong><p>왼쪽 목록에서 환불 요청을 선택하면 상세가 표시됩니다.</p></div>
          ) : (
            <>
              <header><div><small>{selected.orderId}</small><h1>{selected.orderName || "결제 주문"}</h1><span className={`status-${selected.status === "done" ? "done" : selected.status === "rejected" ? "canceled" : "deposit_reported"}`}>{statusText[selected.status]}</span></div></header>
              <section className="admin-payment-amount"><small>환불 요청 금액</small><strong>{selected.amount.toLocaleString("ko-KR")}원</strong><span>{selected.customerEmail}</span></section>
              <dl>
                <div><dt>접수 일시</dt><dd>{dateTime(selected.createdAt)}</dd></div>
                <div><dt>마지막 처리</dt><dd>{dateTime(selected.updatedAt)}</dd></div>
              </dl>
              <section className="admin-cash-receipt"><header><RotateCcw /><div><strong>고객 요청 사유</strong><small>접수 당시 고객이 남긴 내용</small></div></header><p>{selected.reason}</p></section>
              <label className="admin-payment-note"><span>처리 메모</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="예: 도메인 3개월 사용 — 9개월분 월할 환불 / 거절이면 고객에게 보일 사유" /></label>
              {selected.status === "received" && (
                <>
                  <label className="admin-payment-note"><span>환불 금액(원) — 비우면 {selected.amount.toLocaleString("ko-KR")}원 전액</span><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={String(selected.amount)} /></label>
                  <label className="admin-payment-note" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={manualTransfer} onChange={(event) => setManualTransfer(event.target.checked)} style={{ width: "auto" }} /><span>옛 계좌이체 주문이라 고객 계좌로 직접 돌려드렸어요(카드 취소 없이 기록만)</span></label>
                </>
              )}
              {message && <p className="admin-payment-message">{message}</p>}
              <footer>
                {selected.status === "received" && (
                  <>
                    <button className="confirm" disabled={busy || !(refundAmount > 0 && refundAmount <= selected.amount)} onClick={() => void act("done")}><CheckCircle2 /> {busy ? "처리 중…" : manualTransfer ? "계좌로 환급 완료" : "카드 취소하고 환불 완료"}</button>
                    <button disabled={busy || note.trim().length < 5} onClick={() => void act("rejected")} title={note.trim().length < 5 ? "거절 사유를 처리 메모에 적어주세요." : undefined}><XCircle /> 거절</button>
                  </>
                )}
              </footer>
            </>
          )}
        </article>
      </div>
    </main>
  );
}
