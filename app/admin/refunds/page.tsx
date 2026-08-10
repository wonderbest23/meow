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
  status: "received" | "done" | "rejected";
  adminNote: string;
};

const statusText: Record<RefundRequest["status"], string> = {
  received: "접수됨",
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

  const act = async (status: "done" | "rejected") => {
    if (!selected || busy) return;
    const warning = status === "done"
      ? "고객 카드 취소·계좌 환급을 실제로 완료했나요? 완료로 기록합니다."
      : "이 환불 요청을 거절 처리할까요? 사유를 처리 메모에 남겨주세요.";
    if (!window.confirm(warning)) return;
    setBusy(true); setMessage("");
    try {
      const data = await payload<{ request: RefundRequest }>(await fetch("/api/admin/refunds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, status, note }),
      }));
      setRequests((current) => current.map((item) => (item.id === data.request.id ? data.request : item)));
      setNote("");
      setMessage(status === "done" ? "환불 완료로 기록했습니다." : "거절로 기록했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "처리하지 못했습니다."); } finally { setBusy(false); }
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
        <p>실제 환급(카드 취소·계좌 이체)을 먼저 완료한 뒤 ‘환불 완료’로 기록하세요. 단순 변심은 생성 시작 후 제한됩니다.</p>
        <button onClick={() => void load()}><RefreshCw /> 새로고침</button>
      </section>
      <div className="admin-payment-workspace">
        <aside className="admin-payment-orders">
          <header><strong>환불 요청</strong><span>{requests.length}건</span></header>
          <div>
            {requests.length === 0 && <p>아직 접수된 환불 요청이 없습니다.</p>}
            {requests.map((item) => (
              <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => { setSelectedId(item.id); setNote(item.adminNote ?? ""); }}>
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
              <label className="admin-payment-note"><span>처리 메모</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="예: 8월 12일 나이스페이 카드 취소 완료 / 생성 시작 이후 단순 변심으로 거절" /></label>
              {message && <p className="admin-payment-message">{message}</p>}
              <footer>
                {selected.status === "received" && (
                  <>
                    <button className="confirm" disabled={busy} onClick={() => void act("done")}><CheckCircle2 /> 환불 완료로 기록</button>
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
