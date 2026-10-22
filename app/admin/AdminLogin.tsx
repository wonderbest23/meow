"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState, type ComponentType } from "react";

/*
 * 관리자 로그인 칸 — 어느 관리자 화면에서든 같은 모양.
 * 예전 생성 작업·AI 비용·서비스 신청·도메인·DB 화면은 로그인이 풀리면 빨간 글 한 줄과 링크만 보여,
 * 대시보드로 가서 로그인한 뒤 다시 찾아와야 했다. 지금은 그 자리에서 로그인하고 같은 화면을 이어 본다.
 */
export default function AdminLogin({ title, description, Icon = LockKeyhole, configured: knownConfigured, onLoggedIn }: {
  title: string;
  description: string;
  Icon?: ComponentType;
  /** 모르면 비워 둔다 — 서버에 물어본다 */
  configured?: boolean;
  onLoggedIn: () => void;
}) {
  const [password, setPassword] = useState("");
  const [configured, setConfigured] = useState(knownConfigured ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (knownConfigured !== undefined) { setConfigured(knownConfigured); return; }
    let alive = true;
    void fetch("/api/admin/support/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((state: { authenticated?: boolean; configured?: boolean }) => {
        if (!alive) return;
        setConfigured(state.configured !== false);
        // 다른 탭에서 이미 로그인했으면 바로 이어 본다
        if (state.authenticated) onLoggedIn();
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [knownConfigured]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/support/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? "로그인하지 못했어요.");
      setPassword("");
      onLoggedIn();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "로그인하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-login-page">
      <form onSubmit={login}>
        <span><Icon /></span>
        <h1>{title}</h1>
        <p>{description}</p>
        {!configured && <div className="admin-config-warning">서버에 관리자 비밀번호를 먼저 넣어 주세요.</div>}
        <label><span>관리자 비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" /></label>
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !password || !configured}>{busy ? "확인 중…" : "로그인"}</button>
        <Link href="/">고객 화면으로 돌아가기</Link>
      </form>
    </main>
  );
}
