"use client";

import { ArrowLeft, ArrowRight, BriefcaseBusiness, CheckCircle2, KeyRound, LogIn, LogOut, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Mode = "login" | "register" | "recover" | "reset";
type AccountProject = { id: string; title: string; status: string; paymentStatus: string; activeStage: number; updatedAt: string };
type SessionState = { authenticated: boolean; email: string | null; projects: AccountProject[] };

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}

export default function AccountPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [session, setSession] = useState<SessionState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [aiNotice, setAiNotice] = useState(false);
  const [recoveryTokens, setRecoveryTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadSession = async () => setSession(await payload<SessionState>(await fetch("/api/auth/session", { cache: "no-store" })));

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
        .then(() => { window.history.replaceState({}, "", "/account"); setMessage("이메일 확인이 완료되었습니다."); return loadSession(); })
        .catch((error) => { setMessage(error.message); setSession({ authenticated: false, email: null, projects: [] }); });
      return;
    }
    void loadSession().catch((error) => { setMessage(error.message); setSession({ authenticated: false, email: null, projects: [] }); });
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
        const result = await payload<{ authenticated: boolean; confirmationRequired: boolean }>(await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, terms, privacy, aiNotice }) }));
        if (result.confirmationRequired) setMessage("가입 확인 메일을 보냈습니다. 메일의 링크를 열면 현재 프로젝트가 계정에 연결됩니다.");
        else { setMessage("계정을 만들고 현재 프로젝트를 연결했습니다."); await loadSession(); }
      } else {
        await payload(await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
        setPassword(""); setMessage("로그인하고 현재 프로젝트를 계정에 연결했습니다."); await loadSession();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); } finally { setBusy(false); }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }); setSession({ authenticated: false, email: null, projects: [] }); setMessage("로그아웃했습니다.");
  };

  if (!session) return <main className="account-loading">계정 정보를 확인하는 중입니다.</main>;

  return (
    <main className="account-page">
      <header><Link href="/"><img src="/today-startup-logo.png" alt="오늘창업" /></Link><Link href="/"><ArrowLeft /> 홈으로</Link></header>
      {session.authenticated ? (
        <section className="account-dashboard">
          <div className="account-welcome"><span><CheckCircle2 /></span><div><small>내 계정</small><h1>작업을 이어서 시작하세요</h1><p>{session.email}</p></div><button onClick={logout}><LogOut /> 로그아웃</button></div>
          <div className="account-projects"><header><div><strong>저장된 사업</strong><p>로그인한 다른 기기에서도 같은 주소로 이어갈 수 있습니다.</p></div><Link href="/?view=start">새 사업 시작 <ArrowRight /></Link></header>{session.projects.length === 0 ? <div className="account-empty"><BriefcaseBusiness /><strong>아직 계정에 연결된 사업이 없습니다.</strong><p>새 사업을 시작하거나, 기존 작업을 만든 브라우저에서 로그인하면 자동으로 연결됩니다.</p></div> : <div>{session.projects.map((project) => <Link key={project.id} href={`/?view=project&project=${project.id}`}><span><BriefcaseBusiness /></span><div><strong>{project.title}</strong><small>{project.activeStage + 1}단계 · {new Date(project.updatedAt).toLocaleDateString("ko-KR")} 수정</small></div><ArrowRight /></Link>)}</div>}</div>
          {message && <p className="account-message">{message}</p>}
        </section>
      ) : (
        <section className="account-auth-shell">
          <div className="account-auth-copy"><span><ShieldCheck /></span><h1>{mode === "register" ? "계정을 만들고\n작업을 안전하게 보관하세요" : mode === "recover" ? "비밀번호를\n다시 설정할게요" : mode === "reset" ? "새 비밀번호를\n입력해주세요" : "어디서든\n이어서 시작하세요"}</h1><p>로그인하면 지금 만든 비회원 프로젝트가 자동으로 내 계정에 연결됩니다.</p></div>
          <form onSubmit={submit}>
            <header><span>{mode === "register" ? "회원가입" : mode === "recover" || mode === "reset" ? "계정 복구" : "로그인"}</span><strong>{mode === "register" ? "무료 계정 만들기" : mode === "recover" ? "복구 메일 받기" : mode === "reset" ? "새 비밀번호 저장" : "내 작업 불러오기"}</strong></header>
            {mode !== "reset" && <label><span>이메일</span><div><Mail /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div></label>}
            {mode !== "recover" && <label><span>{mode === "reset" ? "새 비밀번호" : "비밀번호"}</span><div><KeyRound /><input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="8자 이상" /></div></label>}
            {(mode === "register" || mode === "reset") && <label><span>비밀번호 확인</span><div><KeyRound /><input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" /></div></label>}
            {mode === "register" && <div className="account-consents"><label><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /><span><Link href="/terms" target="_blank">이용약관</Link>에 동의합니다.</span></label><label><input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} /><span><Link href="/privacy" target="_blank">개인정보처리방침</Link>에 동의합니다.</span></label><label><input type="checkbox" checked={aiNotice} onChange={(event) => setAiNotice(event.target.checked)} /><span><Link href="/ai-notice" target="_blank">인공지능·국외 처리 안내</Link>를 확인했습니다.</span></label></div>}
            {message && <p className="account-form-message">{message}</p>}
            <button className="account-submit" disabled={!valid || busy}>{busy ? "처리 중..." : mode === "register" ? "계정 만들기" : mode === "recover" ? "복구 메일 보내기" : mode === "reset" ? "새 비밀번호 저장" : "로그인"} <LogIn /></button>
            <footer>{mode === "login" ? <><button type="button" onClick={() => { setMode("register"); setMessage(""); }}>처음이신가요? 회원가입</button><button type="button" onClick={() => { setMode("recover"); setMessage(""); }}>비밀번호 찾기</button></> : <button type="button" onClick={() => { setMode("login"); setMessage(""); }}>로그인으로 돌아가기</button>}</footer>
          </form>
        </section>
      )}
    </main>
  );
}
