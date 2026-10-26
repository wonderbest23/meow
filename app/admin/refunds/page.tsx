"use client";

import { CheckCircle2, ChevronRight, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminNav from "../AdminNav";
import AdminLogin from "../AdminLogin";
import { won } from "../admin-labels";
import { askConfirm } from "../../../components/confirm-dialog";

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
  received: "새 요청",
  processing: "처리 중",
  done: "환불 완료",
  rejected: "거절",
};

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했어요.");
  return data as T;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function AdminRefundsPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  /* 이메일·주문 번호로 좁혀 보기 — 상담함·결제 주문에서 ?q= 로 들어온다 */
  const [filter, setFilter] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /* 환불 금액 — 비우면 요청 금액 전액. 도메인 월할·토큰 잔량 환불처럼 일부만 돌려줄 때 적는다 */
  const [amount, setAmount] = useState("");
  /* 옛 계좌이체 주문 — 카드 취소가 없으니 계좌로 직접 돌려준 뒤 기록만 */
  const [manualTransfer, setManualTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  /* 목록을 못 불러왔을 때 — '요청 없음'과 구분해 목록 자리에 보인다 */
  const [loadError, setLoadError] = useState("");
  const load = useCallback(async () => {
    try {
      const data = await payload<{ requests: RefundRequest[] }>(await fetch("/api/admin/refunds", { cache: "no-store" }));
      setRequests(data.requests);
      setLoadError("");
      setLoaded(true);
    } catch (error) {
      setLoaded(true);
      setLoadError(error instanceof Error ? error.message : "환불 요청을 불러오지 못했어요.");
      throw error;
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q")?.trim();
    if (q) setFilter(q);
  }, []);

  useEffect(() => {
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then((response) => payload<SessionState>(response))
      .then((state) => { setSession(state); if (state.authenticated) void load().catch((error) => setMessage(error.message)); })
      .catch((error) => setMessage(error.message));
  }, [load]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term ? requests.filter((item) => item.customerEmail.toLowerCase().includes(term) || item.orderId.toLowerCase().includes(term)) : requests;
  }, [requests, filter]);
  /* 고른 요청이 없거나 걸러져 사라지면 목록 맨 위를 고른다 */
  useEffect(() => {
    setSelectedId((current) => current && visible.some((item) => item.id === current) ? current : visible[0]?.id ?? null);
  }, [visible]);
  const selected = useMemo(() => requests.find((item) => item.id === selectedId) ?? null, [requests, selectedId]);
  /* 약관대로 계산할 근거 — 고를 때마다 불러온다 */
  const [basis, setBasis] = useState<{ lines: string[]; suggested: number | null; suggestedWhy: string } | null>(null);
  useEffect(() => {
    setBasis(null);
    if (!selectedId) return;
    let alive = true;
    void fetch(`/api/admin/refunds?basis=${encodeURIComponent(selectedId)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { basis: null })
      .then((data: { basis?: typeof basis }) => { if (alive) setBasis(data.basis ?? null); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [selectedId]);
  const pending = requests.filter((item) => item.status === "received").length;


  const refundAmount = amount.trim() ? Number(amount.replace(/[^\d]/g, "")) : selected?.amount ?? 0;
  const act = async (status: "done" | "rejected" | "recover") => {
    if (!selected || busy) return;
    const facts = `${status === "done" ? `돌려줄 금액 ${won(refundAmount)} (요청 ${won(selected.amount)})` : `요청 금액 ${won(selected.amount)}`}\n고객 ${selected.customerEmail || "이메일 없음"}\n주문 번호 ${selected.orderId}`;
    const dialog = status === "recover"
      ? { title: "멈춘 처리를 마무리할까요?", message: `주문이 이미 환불 상태면 완료로 기록하고, 아니면 '새 요청'으로 되돌려 다시 처리할 수 있게 해요. 카드가 이미 취소됐으면 다시 누를 때 확인해서 두 번 취소하지 않아요.\n\n${facts}`, confirmLabel: "마무리하기" }
      : status === "done"
      ? manualTransfer
        ? { title: "계좌로 돌려드렸나요?", message: `고객 계좌로 직접 돌려드린 뒤에만 눌러 주세요. 환불 완료로 기록하고 이 상품 이용을 닫아요. 되돌릴 수 없어요.\n\n${facts}`, confirmLabel: "환불 완료로 기록", danger: true }
        : { title: "카드 결제를 취소할까요?", message: `나이스페이로 실제 카드 취소를 해요. 취소되면 이 상품 이용이 바로 닫히고 되돌릴 수 없어요.\n\n${facts}`, confirmLabel: `${won(refundAmount)} 카드 취소`, danger: true }
      : { title: "환불 요청을 거절할까요?", message: `처리 메모가 고객 화면에 거절 사유로 보여요.\n\n${facts}`, confirmLabel: "거절하기", danger: true };
    if (!(await askConfirm({ ...dialog, cancelLabel: "닫기" }))) return;
    setBusy(true); setMessage("");
    try {
      const data = await payload<{ request: RefundRequest }>(await fetch("/api/admin/refunds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, status, note, ...(status === "done" ? { amount: refundAmount, manualTransfer } : {}) }),
      }));
      setRequests((current) => current.map((item) => (item.id === data.request.id ? data.request : item)));
      setNote(""); setAmount(""); setManualTransfer(false);
      setMessage(status === "recover" ? (data.request.status === "done" ? "주문이 이미 환불 상태라 완료로 기록했어요." : "'새 요청'으로 되돌렸어요. 금액을 확인하고 다시 처리해 주세요.") : status === "done" ? (manualTransfer ? "환불 완료로 기록하고 상품 이용을 닫았어요." : "카드 취소를 마치고 상품 이용을 닫았어요.") : "거절로 기록했어요. 고객 화면에 사유가 보여요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리하지 못했어요.");
      void load().catch(() => undefined);
    } finally { setBusy(false); }
  };

  if (!session) return <main className="admin-support-loading"><RefreshCw /> 환불 요청을 불러오는 중이에요.</main>;
  if (!session.authenticated) return <AdminLogin title="환불 요청" description="고객이 접수한 환불 요청을 보고 처리해요." Icon={RotateCcw} configured={session.configured} onLoggedIn={() => { setSession({ authenticated: true, configured: true }); void load().catch(() => undefined); }} />;

  const empty = loaded && !loadError && visible.length === 0;
  return (
    <main className="admin-payment-page">
      <AdminNav title="환불 요청" subtitle="고객이 접수한 환불 요청을 보고 처리해요" />
      <section className="admin-payment-summary">
        <div><RotateCcw /><span><small>처리 대기</small><strong>{pending}건</strong></span></div>
        <p>‘카드 취소하고 환불 완료’를 누르면 나이스페이로 실제 취소하고 그 상품 이용을 닫아요. 일부만 돌려줄 때는 금액을 적어 주세요.</p>
        {/* 카드 취소 중에는 새로고침하지 않는다 — 늦게 온 옛 목록이 '처리 중'으로 되돌렸다 */}
        <button disabled={busy} onClick={() => void load().catch(() => undefined)}><RefreshCw /> 새로고침</button>
      </section>
      {(filter || requests.length > 0) && <form className="admin-payment-filter" role="search" onSubmit={(event) => event.preventDefault()}>
        <input aria-label="이메일이나 주문 번호로 찾기" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="이메일이나 주문 번호로 찾기" autoCapitalize="off" spellCheck={false} />
        {filter && <button type="button" onClick={() => setFilter("")}>전체 보기</button>}
      </form>}
      <div className="admin-payment-workspace" data-empty={empty || undefined}>
        <aside className="admin-payment-orders">
          <header><strong>환불 요청</strong><span>{visible.length}건</span></header>
          <div>
            {loadError ? <p role="alert">{loadError}</p> : !loaded ? <p>불러오는 중이에요…</p> : empty && <p>{filter ? `‘${filter}’로 찾은 환불 요청이 없어요.` : "아직 접수된 환불 요청이 없어요."}</p>}
            {visible.map((item) => (
              <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => { setSelectedId(item.id); setNote(item.status === "received" ? "" : item.adminNote ?? ""); setAmount(""); setManualTransfer(false); setMessage(""); }}>
                <span><strong>{item.customerEmail || "이메일 없음"}</strong><em className={`status-${item.status === "done" ? "done" : item.status === "rejected" ? "canceled" : "deposit_reported"}`}>{statusText[item.status]}</em></span>
                <p>{item.orderName || item.orderId}</p>
                <small>{won(item.amount)} · {dateTime(item.createdAt)}</small>
              </button>
            ))}
          </div>
        </aside>
        {!empty && <article className="admin-payment-detail">
          {!selected ? (
            <div className="admin-chat-placeholder"><RotateCcw /><strong>처리할 요청을 골라 주세요</strong><p>목록에서 환불 요청을 고르면 자세한 내용이 보여요.</p></div>
          ) : (
            <>
              <header><div><small>주문 번호 {selected.orderId}</small><h1>{selected.orderName || "결제 주문"}</h1><span className={`status-${selected.status === "done" ? "done" : selected.status === "rejected" ? "canceled" : "deposit_reported"}`}>{statusText[selected.status]}</span></div></header>
              <section className="admin-payment-amount"><small>환불 요청 금액</small><strong>{selected.amount.toLocaleString("ko-KR")}원</strong><span>{selected.customerEmail || "이메일 없음"}</span></section>
              <dl>
                <div><dt>접수 일시</dt><dd>{dateTime(selected.createdAt)}</dd></div>
                <div><dt>마지막 처리</dt><dd>{dateTime(selected.updatedAt)}</dd></div>
                {selected.customerEmail && <div><dt>이 고객 결제</dt><dd><Link href={`/admin/payments?q=${encodeURIComponent(selected.customerEmail)}`}>결제 주문 보기<ChevronRight className="admin-link-chevron" aria-hidden="true" /></Link></dd></div>}
              </dl>
              {basis ? (
                <section className="admin-cash-receipt"><header><RotateCcw /><div><strong>환불 판단 근거</strong><small>약관의 남은 만큼 환불 기준으로 계산한 값 — 최종 금액은 직접 정해요</small></div></header>
                  {basis.lines.map((line) => <p key={line} style={{ margin: "2px 0" }}>{line}</p>)}
                  {basis.suggested !== null ? <p style={{ marginTop: 6 }}><strong>제안 {basis.suggested.toLocaleString("ko-KR")}원</strong> · {basis.suggestedWhy}{selected.status === "received" ? <> <button type="button" style={{ marginLeft: 6 }} onClick={() => setAmount(String(basis.suggested))}>금액에 넣기</button></> : null}</p> : null}
                </section>
              ) : null}
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
                {selected.status === "processing" && (
                  <button className="confirm" disabled={busy} onClick={() => void act("recover")}><RefreshCw /> {busy ? "확인 중…" : "멈춘 처리 마무리"}</button>
                )}
                {selected.status === "received" && (
                  <>
                    <button className="confirm danger" disabled={busy || !(refundAmount > 0 && refundAmount <= selected.amount)} onClick={() => void act("done")}><CheckCircle2 /> {busy ? "처리 중…" : manualTransfer ? "계좌로 환급 완료" : "카드 취소하고 환불 완료"}</button>
                    <button className="refund" disabled={busy || note.trim().length < 5} onClick={() => void act("rejected")} title={note.trim().length < 5 ? "거절 사유를 처리 메모에 적어 주세요." : undefined}><XCircle /> 거절</button>
                  </>
                )}
              </footer>
              {selected.status === "received" && note.trim().length < 5 && <p className="admin-payment-hint">거절하려면 처리 메모에 고객에게 보일 사유를 5자 이상 적어 주세요.</p>}
            </>
          )}
        </article>}
      </div>
    </main>
  );
}
