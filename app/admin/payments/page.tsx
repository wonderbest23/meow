"use client";

import { Banknote, CheckCircle2, Clock3, ExternalLink, FileCheck2, RefreshCw, RotateCcw, Search, XCircle } from "lucide-react";
import Link from "next/link";
import AdminNav from "../AdminNav";
import AdminLogin from "../AdminLogin";
import { paymentMethodLabel, paymentStatusLabel, won } from "../admin-labels";
import { askConfirm } from "../../../components/confirm-dialog";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type SessionState = { authenticated: boolean; configured: boolean };
type AdminOrder = {
  orderId: string;
  amount: number;
  orderName: string;
  status: string;
  method: string;
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
  planId: string | null;
  adminNote: string | null;
  opportunityTitle: string;
  createdAt: string;
  updatedAt: string;
};

/* 계좌이체 확인 화면의 상태 이름 — 입금 확인 흐름에 맞춘 말 */
const transferStatusText: Record<string, string> = {
  awaiting_deposit: "입금 대기",
  deposit_reported: "고객 입금 알림",
  done: "입금 확인 완료",
  refunded: "환불 완료",
  canceled: "주문 취소",
  expired: "입금 기한 만료",
  failed: "처리 오류",
};

type View = "all" | "transfer";

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했어요.");
  return data as T;
}

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

/*
 * 결제 주문 — 카드(나이스페이)·앱 결제(Apple·Google Play)·계좌이체를 모두 본다.
 * 예전엔 계좌이체 주문만 보여 대시보드 '최근 주문'의 '전체 보기'를 눌러도 카드 주문이 없었다.
 * 계좌이체 입금 확인·현금영수증 처리는 '계좌이체 확인 필요' 칸에서 그대로 한다.
 */
export default function AdminPaymentsPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  /* 입금 확인 등을 처리하는 동안은 새로고침을 쉰다 — 늦게 온 옛 목록이 '입금 대기'로 되돌렸다 */
  const busyRef = useRef(false);
  const request = useRef(0);

  /* 주소의 ?q=(이메일·주문 번호) · ?view=transfer — 대시보드·상담함·환불 화면에서 바로 찾아 들어온다 */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q")?.trim() ?? "";
    if (params.get("view") === "transfer") setView("transfer");
    if (q) { setQuery(q); setSearch(q); }
  }, []);

  const load = useCallback(async () => {
    const current = ++request.current;
    try {
      const url = view === "all" ? `/api/admin/payments/orders?view=all${search ? `&q=${encodeURIComponent(search)}` : ""}` : "/api/admin/payments/orders";
      const response = await fetch(url, { cache: "no-store" });
      if (response.status === 401) { setSession((state) => ({ authenticated: false, configured: state?.configured ?? true })); return; }
      const data = await payload<{ orders: AdminOrder[] }>(response);
      if (busyRef.current || current !== request.current) return;
      setOrders(data.orders);
      setLoaded(true);
      setLoadError("");
      setSelectedId((selected) => selected && data.orders.some((order) => order.orderId === selected) ? selected : data.orders[0]?.orderId ?? null);
    } catch (error) {
      if (current !== request.current) return;
      setLoadError(error instanceof Error ? error.message : "주문을 불러오지 못했어요.");
      setLoaded(true);
    }
  }, [view, search]);

  useEffect(() => {
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then((response) => payload<SessionState>(response))
      .then(setSession)
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    void load();
    const timer = window.setInterval(() => { if (!busyRef.current) void load(); }, view === "transfer" ? 5000 : 15000);
    return () => window.clearInterval(timer);
  }, [load, session?.authenticated, view]);

  const selected = useMemo(() => orders.find((order) => order.orderId === selectedId) ?? null, [orders, selectedId]);
  const waitingCount = view === "transfer" ? orders.filter((order) => ["awaiting_deposit", "deposit_reported"].includes(order.status)).length : null;

  const switchView = (next: View, focusOrderId?: string) => {
    if (next === view && !focusOrderId) return;
    setView(next);
    setOrders([]);
    setLoaded(false);
    setSelectedId(focusOrderId ?? null);
    setNote("");
    setMessage("");
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(query.trim());
    setSelectedId(null);
  };

  const act = async (action: "confirm" | "cancel" | "refund" | "cash_receipt_issued") => {
    if (!selected || busy) return;
    const facts = `금액 ${won(selected.amount)}\n입금자 ${selected.depositorName || "미입력"}\n주문자 ${selected.customerEmail || "-"}\n주문 번호 ${selected.orderId}`;
    const dialog = action === "confirm"
      ? { title: "입금을 확인했나요?", message: `카카오뱅크 거래내역에서 금액과 입금자명을 직접 확인했을 때만 눌러 주세요. 확인하면 고객 프로젝트가 바로 만들어져요.\n\n${facts}`, confirmLabel: "입금 확인·제작 시작" }
      : action === "refund"
        ? { title: "예외 환급으로 기록할까요?", message: `제작 시작 뒤 단순 변심 환불은 안 돼요. 결과물 미제공·계약 불일치·중대한 하자 같은 법정 예외를 확인했고, 고객 계좌로 실제로 돌려드린 뒤에만 눌러 주세요. 되돌릴 수 없어요.\n\n${facts}`, confirmLabel: "환급 완료로 기록", danger: true }
        : action === "cash_receipt_issued"
          ? { title: "현금영수증을 발급했나요?", message: `홈택스에서 발급을 마친 뒤에 눌러 주세요.\n\n${facts}`, confirmLabel: "발급 완료로 기록" }
          : { title: "이 주문을 취소할까요?", message: `취소하면 되돌릴 수 없어요.\n\n${facts}`, confirmLabel: "주문 취소", danger: true };
    if (!(await askConfirm({ ...dialog, cancelLabel: "닫기" }))) return;
    setBusy(true); busyRef.current = true; setMessage("");
    try {
      const data = await payload<{ order: AdminOrder }>(await fetch("/api/admin/payments/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selected.orderId, action, note }),
      }));
      setOrders((current) => current.map((order) => order.orderId === data.order.orderId ? data.order : order));
      setNote("");
      setMessage(action === "confirm" ? "입금 확인을 마치고 고객 프로젝트를 만들었어요."
        : action === "refund" ? "법정 예외 환급 완료로 기록했어요."
          : action === "cash_receipt_issued" ? "현금영수증 발급 완료로 기록했어요."
            : "주문을 취소했어요.");
      busyRef.current = false;
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "주문을 처리하지 못했어요."); } finally { setBusy(false); busyRef.current = false; }
  };

  if (!session) return <main className="admin-support-loading"><RefreshCw /> 결제 주문을 불러오는 중이에요.</main>;
  if (!session.authenticated) return <AdminLogin title="결제 주문" description="카드·앱 결제·계좌이체 주문을 보고, 계좌이체 입금을 확인해요." Icon={Banknote} configured={session.configured} onLoggedIn={() => setSession({ authenticated: true, configured: true })} />;

  const empty = loaded && !loadError && orders.length === 0;
  return <main className="admin-payment-page">
    <AdminNav title="결제 주문" subtitle="카드·앱 결제·계좌이체 주문 전체 · 계좌이체 입금 확인" />
    <div className="admin-payment-tabs" role="tablist" aria-label="주문 보기">
      <button type="button" role="tab" aria-selected={view === "all"} onClick={() => switchView("all")}>전체 주문</button>
      <button type="button" role="tab" aria-selected={view === "transfer"} onClick={() => switchView("transfer")}>계좌이체 확인 필요</button>
    </div>
    {view === "all" ? (
      <section className="admin-payment-summary">
        <form className="admin-payment-search" onSubmit={submitSearch} role="search">
          <label><Search aria-hidden /><input aria-label="주문 번호나 이메일" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="주문 번호나 이메일로 찾기" inputMode="email" autoCapitalize="off" spellCheck={false} /></label>
          <button type="submit">찾기</button>
          {search && <button type="button" onClick={() => { setQuery(""); setSearch(""); setSelectedId(null); }}>전체 보기</button>}
        </form>
        <p>{search ? `‘${search}’로 찾은 주문이에요.` : "최근 주문 200건까지 보여요."} 카드·앱 결제 환불은 환불 요청에서 처리해요.</p>
        <button onClick={() => void load()}><RefreshCw /> 새로고침</button>
      </section>
    ) : (
      <section className="admin-payment-summary"><div><Clock3 /><span><small>확인할 주문</small><strong>{waitingCount ?? 0}건</strong></span></div><p>고객의 ‘입금했어요’ 알림만 믿지 말고 카카오뱅크 거래내역의 금액과 입금자명을 직접 맞춰 봐 주세요.</p><button onClick={() => void load()}><RefreshCw /> 새로고침</button></section>
    )}
    <div className="admin-payment-workspace" data-empty={empty || undefined}>
      <aside className="admin-payment-orders">
        <header><strong>{view === "all" ? "결제 주문" : "계좌이체 주문"}</strong><span>{orders.length}건</span></header>
        <div>
          {loadError ? <p role="alert">{loadError}</p> : !loaded ? <p>불러오는 중이에요…</p> : empty && <p>{view === "all" ? (search ? "찾는 주문이 없어요. 주문 번호나 이메일을 다시 확인해 주세요." : "아직 주문이 없어요.") : "아직 계좌이체 주문이 없어요."}</p>}
          {orders.map((order) => <button key={order.orderId} className={selectedId === order.orderId ? "selected" : ""} onClick={() => { setSelectedId(order.orderId); setNote(order.adminNote ?? ""); setMessage(""); }}>
            {view === "all" ? <>
              <span><strong>{order.customerEmail || "이메일 없음"}</strong><em className={`status-${order.status}`}>{paymentStatusLabel(order.status)}</em></span>
              <p>{order.orderName || order.orderId}</p>
              <small>{won(order.amount)} · {paymentMethodLabel(order.method)} · {dateTime(order.createdAt)}</small>
            </> : <>
              <span><strong>{order.depositorName || "입금자 미입력"}</strong><em className={`status-${order.status}`}>{transferStatusText[order.status] ?? paymentStatusLabel(order.status)}</em></span>
              <p>{order.opportunityTitle}</p>
              <small>{won(order.amount)} · {dateTime(order.createdAt)}</small>
            </>}
          </button>)}
        </div>
      </aside>
      {!empty && <article className="admin-payment-detail">
        {!selected ? <div className="admin-chat-placeholder"><Banknote /><strong>확인할 주문을 골라 주세요</strong><p>목록에서 주문을 고르면 금액과 주문자를 볼 수 있어요.</p></div> : view === "all" ? <>
          <header><div><small>주문 번호 {selected.orderId}</small><h1>{selected.orderName || "결제 주문"}</h1><span className={`status-${selected.status}`}>{paymentStatusLabel(selected.status)}</span></div></header>
          <section className="admin-payment-amount"><small>결제 금액</small><strong>{won(selected.amount)}</strong><span>{paymentMethodLabel(selected.method)}</span></section>
          <dl>
            <div><dt>주문자 계정</dt><dd>{selected.customerEmail || "-"}</dd></div>
            <div><dt>결제 방법</dt><dd>{paymentMethodLabel(selected.method)}</dd></div>
            <div><dt>주문 시각</dt><dd>{dateTime(selected.createdAt)}</dd></div>
            <div><dt>결제 확인</dt><dd>{dateTime(selected.confirmedAt)}</dd></div>
            <div><dt>사업 ID</dt><dd>{selected.planId || "-"}</dd></div>
            <div><dt>마지막 변경</dt><dd>{dateTime(selected.updatedAt)}</dd></div>
          </dl>
          {selected.method === "APPLE_IAP" || selected.method === "GOOGLE_IAP" ? <p className="admin-payment-message">앱 결제 환불은 Apple·Google Play가 처리해요. 고객에게 스토어에서 환불을 요청하도록 안내해 주세요.</p> : null}
          <footer>
            {selected.method === "TRANSFER" && <button className="confirm" onClick={() => switchView("transfer", selected.orderId)}><Banknote /> 계좌이체 확인 화면에서 열기</button>}
            {selected.customerEmail && <Link className="admin-payment-link" href={`/admin/refunds?q=${encodeURIComponent(selected.customerEmail)}`}><RotateCcw /> 이 고객 환불 요청 보기</Link>}
          </footer>
        </> : <>
          <header><div><small>주문 번호 {selected.orderId}</small><h1>{selected.opportunityTitle}</h1><span className={`status-${selected.status}`}>{transferStatusText[selected.status] ?? paymentStatusLabel(selected.status)}</span></div>{selected.projectId && <Link href={`/?view=project&project=${selected.projectId}`} target="_blank">프로젝트 열기 <ExternalLink /></Link>}</header>
          <section className="admin-payment-amount"><small>확인할 입금 금액</small><strong>{won(selected.amount)}</strong><span>{selected.depositorName || "입금자 미입력"} 이름으로 입금</span></section>
          <dl><div><dt>주문자 계정</dt><dd>{selected.customerEmail || "-"}</dd></div><div><dt>연락처</dt><dd>{selected.customerPhone || "-"}</dd></div><div><dt>입금 알림</dt><dd>{dateTime(selected.depositReportedAt)}</dd></div><div><dt>입금 기한</dt><dd>{dateTime(selected.expiresAt)}</dd></div><div><dt>입금 확인</dt><dd>{dateTime(selected.confirmedAt)}</dd></div></dl>
          <section className="admin-cash-receipt"><header><FileCheck2 /><div><strong>현금영수증</strong><small>{selected.cashReceiptType === "PERSONAL" ? "소득공제용" : selected.cashReceiptType === "BUSINESS" ? "지출증빙용" : "구매자 번호 없이 발급"}</small></div><em>{selected.cashReceiptStatus === "issued" ? "발급 완료" : selected.cashReceiptStatus === "requested" ? "발급 필요" : "해당 없음"}</em></header>{selected.cashReceiptIdentifier && <p>{selected.cashReceiptIdentifier}</p>}</section>
          <label className="admin-payment-note"><span>처리 메모</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={selected.status === "done" ? "예: 약정한 핵심 결과물 미제공 확인, 7월 23일 전액 환급" : "예: 7월 23일 14:32 입금 확인"} /></label>
          {message && <p className="admin-payment-message">{message}</p>}
          <footer>
            {["awaiting_deposit", "deposit_reported"].includes(selected.status) && <><button className="confirm" disabled={busy} onClick={() => void act("confirm")}><CheckCircle2 /> 입금 확인·제작 시작</button><button className="refund" disabled={busy} onClick={() => void act("cancel")}><XCircle /> 주문 취소</button></>}
            {selected.status === "done" && <button className="refund" disabled={busy || note.trim().length < 5} onClick={() => void act("refund")} title={note.trim().length < 5 ? "예외 환급 사유를 처리 메모에 적어 주세요." : undefined}><RotateCcw /> 예외 환급 처리</button>}
            {selected.status === "done" && selected.cashReceiptStatus === "requested" && <button disabled={busy} onClick={() => void act("cash_receipt_issued")}><FileCheck2 /> 현금영수증 발급 완료</button>}
          </footer>
          {selected.status === "done" && note.trim().length < 5 && <p className="admin-payment-hint">예외 환급은 처리 메모에 사유를 5자 이상 적어야 누를 수 있어요.</p>}
        </>}
      </article>}
    </div>
  </main>;
}
