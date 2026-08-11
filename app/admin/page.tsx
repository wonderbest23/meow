"use client";

import { Banknote, Headphones, LayoutDashboard, RefreshCw, RotateCcw, Users, Zap } from "lucide-react";
import Link from "next/link";
import { llmFailureAlert } from "../../lib/llm/alert";
import { FormEvent, useCallback, useEffect, useState } from "react";
import AdminNav from "./AdminNav";

type SessionState = { authenticated: boolean; configured: boolean };

type Stats = {
  users: { total: number | null; active7d: number | null };
  payments: {
    paidCount: number | null;
    paidAmount: number | null;
    paid7d: number | null;
    refundCount: number | null;
    refundPending: number | null;
    recentOrders: Array<{ orderId: string; orderName: string; amount: number; status: string; createdAt: string }>;
  };
  inquiries: {
    open: number;
    unread: number;
    total: number;
    recent: Array<{ id: string; preview: string; status: string; updatedAt: string; unread: number }>;
  };
  llm: {
    today: number;
    last7d: number;
    total: number;
    failed7d: number;
    last24h: number;
    failed24h: number;
    failed1h: number;
    lastFailureAt: string | null;
  } | null;
};

const orderStatusText: Record<string, string> = {
  created: "결제 대기",
  done: "결제 완료",
  failed: "결제 실패",
  refunded: "환불 완료",
  canceled: "취소",
  awaiting_deposit: "입금 대기",
  deposit_reported: "입금 알림",
  expired: "기한 만료",
};

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}

function won(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("ko-KR")}원`;
}

function num(value: number | null) {
  return value === null ? "—" : value.toLocaleString("ko-KR");
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function AdminDashboardPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/admin/stats", { cache: "no-store" });
    if (response.status === 401) {
      setSession((current) => ({ authenticated: false, configured: current?.configured ?? true }));
      return;
    }
    setStats(await payload<Stats>(response));
  }, []);

  useEffect(() => {
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then((response) => payload<SessionState>(response))
      .then((state) => setSession(state))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "관리자 상태를 확인하지 못했습니다."));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    void loadStats().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "지표를 불러오지 못했습니다."));
    const timer = window.setInterval(() => void loadStats().catch(() => undefined), 30_000);
      return () => window.clearInterval(timer);
  }, [loadStats, session?.authenticated]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await payload(await fetch("/api/admin/support/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }));
      setPassword("");
      setSession({ authenticated: true, configured: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (session === null) {
    return <main className="admin-support-loading"><RefreshCw /> 관리자 콘솔을 불러오는 중입니다.</main>;
  }

  if (!session.authenticated) {
    return (
      <main className="admin-login-page">
        <form onSubmit={login}>
          <span><LayoutDashboard /></span>
          <h1>관리자 콘솔</h1>
          <p>한 번 로그인하면 대시보드·상담·입금 주문·운영 설정을 모두 쓸 수 있습니다.</p>
          {!session.configured && <div className="admin-config-warning">서버에 관리자 비밀번호를 먼저 설정해주세요.</div>}
          <label><span>관리자 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" /></label>
          {error && <p className="admin-login-error">{error}</p>}
          <button type="submit" disabled={busy || !password || !session.configured}>로그인</button>
          <a href="/">고객 화면으로 돌아가기</a>
        </form>
      </main>
    );
  }

  const llmAlert = llmFailureAlert(stats?.llm ?? null);

  return (
    <main className="admin-dash-page">
      <AdminNav title="대시보드" subtitle="오늘창업 운영 현황 한눈에" />
      {error && <p className="admin-dash-error">{error}</p>}

      {/*
        지금 고장났는지를 맨 위에서 알린다.
        카드의 숫자만으로는 지나친다 — 크레딧이 떨어진 날에도 화면은 멀쩡해 보였다.
      */}
      {llmAlert && (
        <div className="admin-dash-alert" role="alert">
          <strong>AI 호출 실패가 이어지고 있습니다</strong>
          <span>{llmAlert}</span>
        </div>
      )}

      <section className="admin-dash-cards">
        <article>
          <span className="admin-dash-icon users"><Users /></span>
          <small>이용자</small>
          <strong>{num(stats?.users.total ?? null)}명</strong>
          <em>최근 7일 활동 {num(stats?.users.active7d ?? null)}명</em>
        </article>
        <article>
          <span className="admin-dash-icon pay"><Banknote /></span>
          <small>결제</small>
          <strong>{num(stats?.payments.paidCount ?? null)}건 · {won(stats?.payments.paidAmount ?? null)}</strong>
          <em>최근 7일 {num(stats?.payments.paid7d ?? null)}건</em>
        </article>
        <article>
          <span className="admin-dash-icon refund"><RotateCcw /></span>
          <small>환불</small>
          <strong>{stats?.payments.refundPending != null ? `대기 ${num(stats.payments.refundPending)}건` : "접수함 준비 중"}</strong>
          <em><Link href="/admin/refunds">환불 접수함 열기 →</Link>{stats?.payments.refundCount != null ? ` · 완료 ${num(stats.payments.refundCount)}건` : ""}</em>
        </article>
        <article>
          <span className="admin-dash-icon inquiry"><Headphones /></span>
          <small>1:1 문의</small>
          <strong>{stats ? `${stats.inquiries.open}건 진행 중` : "—"}</strong>
          <em>안 읽음 {stats?.inquiries.unread ?? "—"} · 누적 {stats?.inquiries.total ?? "—"}</em>
        </article>
        <article>
          <span className="admin-dash-icon llm"><Zap /></span>
          <small>AI API 사용량</small>
          {stats?.llm ? (
            <>
              <strong>오늘 {num(stats.llm.today)}회</strong>
              <em>
                24시간 {num(stats.llm.last24h)}회 · 실패 {num(stats.llm.failed24h)}
                {" · "}7일 실패 {num(stats.llm.failed7d)}
              </em>
            </>
          ) : (
            <>
              {/* '준비 중'으로 보이면 방치된다 — 무엇을 해야 하는지 적는다 */}
              <strong>기록 안 됨</strong>
              <em>
                Supabase SQL Editor에서 <code>supabase/migrations/0020_llm_usage.sql</code>을
                실행해야 AI 실패를 감시할 수 있습니다
              </em>
            </>
          )}
        </article>
      </section>

      <div className="admin-dash-columns">
        <section className="admin-dash-panel">
          <header>
            <strong>최근 1:1 문의</strong>
            <Link href="/admin/support">전체 보기 →</Link>
          </header>
          {(stats?.inquiries.recent ?? []).length === 0 ? (
            <p className="admin-dash-empty">아직 접수된 문의가 없습니다.</p>
          ) : (
            <ul>
              {stats!.inquiries.recent.map((item) => (
                <li key={item.id}>
                  <span className={`admin-dash-badge ${item.status}`}>{item.status === "open" ? "진행 중" : "완료"}</span>
                  <p>{item.preview || "새 상담"}</p>
                  <time>{dateLabel(item.updatedAt)}</time>
                  {item.unread > 0 && <em>{item.unread}</em>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-dash-panel">
          <header>
            <strong>최근 주문</strong>
            <Link href="/admin/payments">전체 보기 →</Link>
          </header>
          {(stats?.payments.recentOrders ?? []).length === 0 ? (
            <p className="admin-dash-empty">아직 주문이 없습니다.</p>
          ) : (
            <ul>
              {stats!.payments.recentOrders.map((order) => (
                <li key={order.orderId}>
                  <span className={`admin-dash-badge ${order.status}`}>{orderStatusText[order.status] ?? order.status}</span>
                  <p>{order.orderName || order.orderId}</p>
                  <b>{order.amount.toLocaleString("ko-KR")}원</b>
                  <time>{dateLabel(order.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
