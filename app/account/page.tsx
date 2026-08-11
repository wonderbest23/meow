"use client";

import { ArrowLeft, ArrowRight, Bookmark, BriefcaseBusiness, CheckCircle2, KeyRound, LogIn, LogOut, Mail, Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import type { PaymentHistoryItem } from "../../lib/payments/plan-orders";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Mode = "login" | "register" | "recover" | "reset";
type AccountProject = { id: string; title: string; status: string; paymentStatus: string; activeStage: number; updatedAt: string };
type SessionState = { authenticated: boolean; email: string | null; projects: AccountProject[] };

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}

/** 결제 상태를 사람이 읽는 말로 */
const PAYMENT_STATUS: Record<string, string> = {
  created: "결제 대기",
  confirming: "승인 중",
  done: "결제 완료",
  canceled: "취소됨",
  partial_canceled: "부분 취소",
  aborted: "중단됨",
  expired: "기한 만료",
  failed: "실패",
};

const REMEMBER_KEY = "oneul-remember";
const EMAIL_KEY = "oneul-remember-email";

/** 다음 방문에 되살릴 값 — 비밀번호는 절대 남기지 않는다 */
function rememberLocally(remember: boolean, email: string) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    if (remember) window.localStorage.setItem(EMAIL_KEY, email);
    else window.localStorage.removeItem(EMAIL_KEY);
  } catch {
    // 저장소를 못 써도 로그인 자체에는 지장이 없다
  }
}

export default function AccountPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [session, setSession] = useState<SessionState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  /*
   * 로그인 상태 유지.
   * 켜면 30일짜리 쿠키를, 끄면 브라우저를 닫을 때 사라지는 세션 쿠키를 받는다.
   * 선택과 이메일은 이 브라우저에만 남긴다(비밀번호는 저장하지 않는다).
   */
  const [remember, setRemember] = useState(true);
  /** 결제 내역 — 로그인한 뒤에만 불러온다 */
  const [payments, setPayments] = useState<PaymentHistoryItem[] | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [aiNotice, setAiNotice] = useState(false);
  const [recoveryTokens, setRecoveryTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  /**
   * 로그인 후 돌아갈 곳. 열린 리다이렉트가 되지 않게 내부 경로만 받는다.
   * ("//evil.com", "https://…" 같은 값은 버린다)
   */
  const nextPath = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URL(window.location.href).searchParams.get("next");
    if (!raw) return null;
    if (!raw.startsWith("/") || raw.startsWith("//")) return null;
    return raw;
  }, []);

  /*
   * 로그인 뒤 갈 곳.
   * next가 있으면 하던 자리로 돌려보내고, 없으면 내 플랜 목록으로 보낸다.
   * 예전에는 next가 없을 때 이 화면(옛 계정 대시보드)에 그대로 머물러서,
   * 로그인했는데 엉뚱한 곳에 떨어진 것처럼 보였다.
   */
  const goNext = () => {
    window.location.assign(nextPath ?? "/plan");
    return true;
  };

  const loadSession = async () => {
    const nextSession = await payload<SessionState>(await fetch("/api/auth/session", { cache: "no-store" }));
    setSession(nextSession);
    if (!nextSession.authenticated) {
     
      setPayments(null);
      return;
    }
    void fetch("/api/auth/payments", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { payments: [] }))
      .then((d: { payments?: PaymentHistoryItem[] }) => setPayments(d.payments ?? []))
      .catch(() => setPayments([]));
  };

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const recovery = hash.get("type") === "recovery" || new URL(window.location.href).searchParams.get("mode") === "reset";
    if (accessToken && refreshToken && recovery) {
      setRecoveryTokens({ accessToken, refreshToken }); setMode("reset"); setSession({ authenticated: false, email: null, projects: [] }); return;
    }
    if (accessToken && refreshToken) {
      void fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken, refreshToken }) })
        .then((response) => payload(response))
        .then(() => {
          const raw = new URL(window.location.href).searchParams.get("next");
          if (raw && raw.startsWith("/") && !raw.startsWith("//")) { window.location.assign(raw); return; }
          window.history.replaceState({}, "", "/account"); setMessage("이메일 확인이 완료되었습니다."); return loadSession();
        })
        .catch((error) => { setMessage(error.message); setSession({ authenticated: false, email: null, projects: [] }); });
      return;
    }
    void loadSession()
      .then(() => {
        // 이미 로그인돼 있는데 돌아갈 곳을 들고 왔다면 붙잡아두지 않는다
        const raw = new URL(window.location.href).searchParams.get("next");
        if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
          void fetch("/api/auth/session", { cache: "no-store" })
            .then((r) => r.json())
            .then((d: SessionState) => {
              if (d.authenticated) window.location.assign(raw);
            })
            .catch(() => {});
        }
      })
      .catch((error) => { setMessage(error.message); setSession({ authenticated: false, email: null, projects: [] }); });
  }, []);

  // 지난번 선택과 이메일을 되살린다
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_KEY);
      if (saved === "0") setRemember(false);
      const savedEmail = window.localStorage.getItem(EMAIL_KEY);
      if (savedEmail) setEmail(savedEmail);
    } catch {
      // 저장소를 못 쓰면 기본값(유지 켬)으로 둔다
    }
  }, []);

  const valid = useMemo(() => {
    if (mode === "recover") return email.includes("@");
    if (mode === "reset") return password.length >= 8 && password === passwordConfirm && Boolean(recoveryTokens);
    if (mode === "register") return email.includes("@") && password.length >= 8 && password === passwordConfirm && terms && privacy && aiNotice;
    return email.includes("@") && password.length >= 8;
  }, [aiNotice, email, mode, password, passwordConfirm, privacy, recoveryTokens, terms]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!valid || busy) return; setBusy(true); setMessage("");
    try {
      if (mode === "recover") {
        await payload(await fetch("/api/auth/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }));
        setMessage("비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 열어주세요.");
      } else if (mode === "reset") {
        await payload(await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...recoveryTokens, password }) }));
        window.history.replaceState({}, "", "/account"); setRecoveryTokens(null); setPassword(""); setPasswordConfirm(""); setMessage("새 비밀번호를 저장했습니다."); await loadSession();
      } else if (mode === "register") {
        const result = await payload<{ authenticated: boolean; message?: string }>(await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, terms, privacy, aiNotice }) }));
        // 이메일 인증 없이 가입 즉시 로그인된다
        if (result.authenticated) {
          rememberLocally(remember, email);
          if (goNext()) return;
          setMessage("계정을 만들었습니다."); await loadSession();
        } else {
          setMode("login"); setPassword(""); setPasswordConfirm("");
          setMessage(result.message ?? "계정을 만들었습니다. 로그인해 주세요.");
        }
      } else {
        await payload(await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, remember }) }));
        setPassword("");
        rememberLocally(remember, email);
        // 하던 작업으로 돌려보낸다 — 로그인만 하고 갇히지 않게
        if (goNext()) return;
        setMessage("로그인했습니다."); await loadSession();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); } finally { setBusy(false); }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }); setSession({ authenticated: false, email: null, projects: [] }); setMessage("로그아웃했습니다.");
  };


  if (!session) return <main className="account-loading">계정 정보를 확인하는 중입니다.</main>;

  return (
    <main className="account-page">
      <header><Link href="/"><img src="/today-startup-logo-2026.png" alt="오늘창업" /></Link><Link href="/"><ArrowLeft /> 홈으로</Link></header>
      {session.authenticated ? (
        <section className="account-dashboard">
          <div className="account-welcome"><span><CheckCircle2 /></span><div><small>내 계정</small><h1>작업을 이어서 시작하세요</h1><p>{session.email}</p></div><button onClick={logout}><LogOut /> 로그아웃</button></div>
          <div className="account-projects account-plan-shortcut"><header><div><strong>사업계획서 플랜</strong><p>작성 중인 사업계획서를 이어서 쓰거나 새로 시작할 수 있습니다.</p></div><Link href="/plan">내 플랜 열기 <ArrowRight /></Link></header></div>
          <div className="account-payments">
            <header>
              <div>
                <strong>결제 내역</strong>
                <p>결제한 상품과 금액을 확인할 수 있습니다.</p>
              </div>
            </header>
            {payments === null ? null : payments.length === 0 ? (
              <div className="account-empty">
                <Receipt />
                <strong>아직 결제 내역이 없습니다.</strong>
                <p>플랜 빌더를 결제하면 여기에 남습니다.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr><th>상품</th><th>금액</th><th>상태</th><th>일시</th></tr>
                </thead>
                <tbody>
                  {payments.map((item) => (
                    <tr key={item.orderId}>
                      <td>{item.orderName || "-"}</td>
                      <td className="account-payment-amount">{item.amount.toLocaleString("ko-KR")}원</td>
                      <td><span className={`account-payment-status is-${item.status}`}>{PAYMENT_STATUS[item.status] ?? item.status}</span></td>
                      <td>{new Date(item.paidAt ?? item.createdAt).toLocaleDateString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="account-projects"><header><div><strong>진행 중인 사업</strong><p>실행을 시작한 사업과 완성 중인 문서를 이어서 볼 수 있습니다.</p></div><Link href="/?view=start">새 사업 시작 <ArrowRight /></Link></header>{session.projects.length === 0 ? <div className="account-empty"><BriefcaseBusiness /><strong>아직 계정에 연결된 사업이 없습니다.</strong><p>새 사업을 시작하거나, 기존 작업을 만든 브라우저에서 로그인하면 자동으로 연결됩니다.</p></div> : <div>{session.projects.map((project) => <Link key={project.id} href={`/?view=project&project=${project.id}`}><span><BriefcaseBusiness /></span><div><strong>{project.title}</strong><small>{project.activeStage + 1}단계 · {new Date(project.updatedAt).toLocaleDateString("ko-KR")} 수정</small></div><ArrowRight /></Link>)}</div>}</div>
          {message && <p className="account-message">{message}</p>}
        </section>
      ) : (
        <section className="account-auth-shell">
          <form onSubmit={submit}>
            {/*
              로그인에 필요한 건 이메일·비밀번호뿐이다.
              예전에는 큰 히어로 문구('어디서든 이어서 시작하세요')와 카드 제목
              ('내 작업 불러오기')이 같은 말을 두 번 했고, 모바일에서는 방패
              아이콘이 제목 위에 덩그러니 놓였다. 제목 한 줄만 남긴다.
            */}
            <header>
              <strong>
                {mode === "register" ? "회원가입" : mode === "recover" ? "비밀번호 찾기" : mode === "reset" ? "새 비밀번호 설정" : "로그인"}
              </strong>
              <p>
                {mode === "register"
                  ? "이메일 인증 없이 바로 시작합니다."
                  : mode === "recover"
                    ? "가입한 이메일로 복구 링크를 보내드립니다."
                    : mode === "reset"
                      ? "8자 이상으로 새 비밀번호를 정해주세요."
                      : "작성한 내용이 계정에 저장돼 어느 기기에서든 이어집니다."}
              </p>
            </header>
            {mode !== "reset" && <label><span>이메일</span><div><Mail /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div></label>}
            {mode !== "recover" && <label><span>{mode === "reset" ? "새 비밀번호" : "비밀번호"}</span><div><KeyRound /><input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="8자 이상" /></div></label>}
            {(mode === "register" || mode === "reset") && <label><span>비밀번호 확인</span><div><KeyRound /><input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" /></div></label>}
            {mode === "register" && <div className="account-consents"><label><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /><span><Link href="/terms" target="_blank">이용약관</Link>에 동의합니다.</span></label><label><input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} /><span><Link href="/privacy" target="_blank">개인정보처리방침</Link>에 동의합니다.</span></label><label><input type="checkbox" checked={aiNotice} onChange={(event) => setAiNotice(event.target.checked)} /><span><Link href="/ai-notice" target="_blank">인공지능·국외 처리 안내</Link>를 확인했습니다.</span></label></div>}
            {(mode === "login" || mode === "register") && (
              <label className="account-remember">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <span>로그인 상태 유지<small>끄면 브라우저를 닫을 때 로그아웃됩니다.</small></span>
              </label>
            )}
            {message && <p className="account-form-message">{message}</p>}
            <button className="account-submit" disabled={!valid || busy}>{busy ? "처리 중..." : mode === "register" ? "계정 만들기" : mode === "recover" ? "복구 메일 보내기" : mode === "reset" ? "새 비밀번호 저장" : "로그인"} <LogIn /></button>
            <footer>{mode === "login" ? <><button type="button" onClick={() => { setMode("register"); setMessage(""); }}>처음이신가요? 회원가입</button><button type="button" onClick={() => { setMode("recover"); setMessage(""); }}>비밀번호 찾기</button></> : <button type="button" onClick={() => { setMode("login"); setMessage(""); }}>로그인으로 돌아가기</button>}</footer>
          </form>
        </section>
      )}
    </main>
  );
}
