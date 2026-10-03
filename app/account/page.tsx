"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "../../components/site-header";
import AccountAuthForm, { type AuthMode } from "../../components/account-auth-form";
import { prepareAccountSignIn } from "../../lib/plan-builder/plan-store";
import PlanLoading, { Spinner } from "../plan/PlanLoading";
import styles from "./Account.module.css";
import { safeNextPath } from "../../lib/http/safe-next";

/*
 * 로그인 화면. 폼은 로그인 팝업과 같은 것(components/account-auth-form)을 쓰고,
 * 여기는 메일·카카오 링크로 돌아온 경우(계정 확인, 비밀번호 재설정)와 직접 들어온 경우만 맡는다.
 * 로그인한 사람의 계정 정보는 왼쪽 메뉴의 '내 계정'(/plan/me) 한 곳에 둔다.
 */
type AccountProject = { id: string; title: string; status: string; paymentStatus: string; activeStage: number; updatedAt: string };
type SessionState = { authenticated: boolean; email: string | null; projects: AccountProject[] };

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}

export default function AccountPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<SessionState | null>(null);
  const [recoveryTokens, setRecoveryTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  /*
   * 링크(이메일 인증·카카오)로 돌아온 로그인 정보. 바로 로그인하지 않고 어느 계정인지 보여 준 뒤 사용자가 확인해야 로그인한다.
   * 남이 자기 로그인 정보를 담아 보낸 링크를 누르면 그 사람 계정으로 로그인되고 내 게스트 기획이 넘어가는 일을 막는다.
   */
  const [linkSignIn, setLinkSignIn] = useState<{ accessToken: string; refreshToken: string; email: string | null; provider: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);

  /**
   * 로그인 후 돌아갈 곳. 열린 리다이렉트가 되지 않게 내부 경로만 받는다.
   * ("//evil.com", "https://…" 같은 값은 버린다)
   */
  const nextPath = useMemo(() => {
    if (typeof window === "undefined") return null;
    return safeNextPath(new URL(window.location.href).searchParams.get("next"));
  }, []);

  const loadSession = async () => {
    setSession(await payload<SessionState>(await fetch("/api/auth/session", { cache: "no-store" })));
  };

  useEffect(() => {
    /* 카카오 리디렉트가 실패로 돌아온 경우 — 설정이 빠졌을 때다 */
    if (new URL(window.location.href).searchParams.get("social_error") === "kakao") {
      window.history.replaceState({}, "", "/account");
      setMessage("카카오 로그인이 아직 준비되지 않았습니다. 이메일로 로그인해 주세요.");
    }
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const recovery = hash.get("type") === "recovery" || new URL(window.location.href).searchParams.get("mode") === "reset";
    if (accessToken && refreshToken && recovery) {
      setRecoveryTokens({ accessToken, refreshToken }); setMode("reset"); setSession({ authenticated: false, email: null, projects: [] }); return;
    }
    if (accessToken && refreshToken) {
      // 주소창의 토큰은 바로 지운다(뒤로 가기·공유로 새지 않게). 토큰은 확인 전까지 메모리에만 둔다.
      const url = new URL(window.location.href); url.hash = "";
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      setSession({ authenticated: false, email: null, projects: [] });
      void fetch("/api/auth/session/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken }) })
        .then((response) => payload(response) as Promise<{ email?: string | null; provider?: string | null }>)
        .then((account) => setLinkSignIn({ accessToken, refreshToken, email: account.email ?? null, provider: account.provider ?? null }))
        .catch((error) => { setMessageError(true); setMessage(error.message); });
      return;
    }
    void loadSession().catch((error) => { setMessageError(true); setMessage(error.message); setSession({ authenticated: false, email: null, projects: [] }); });
  }, []);

  // 이미 로그인돼 있으면 붙잡아두지 않는다 — 돌아갈 곳이 있으면 거기로, 없으면 내 계정으로
  useEffect(() => {
    if (session?.authenticated) router.replace(nextPath ?? "/plan/me");
  }, [session?.authenticated, nextPath, router]);

  /** 확인 화면에서 "이 계정으로 로그인"을 눌렀을 때만 세션을 만들고 게스트 기획을 옮긴다. */
  const confirmLinkSignIn = () => {
    if (!linkSignIn) return;
    setBusy(true); setMessage(""); setMessageError(false);
    void prepareAccountSignIn().then(() => fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: linkSignIn.accessToken, refreshToken: linkSignIn.refreshToken }) }))
      .then((response) => payload(response))
      .then(() => { setLinkSignIn(null); window.location.assign(nextPath ?? "/plan"); })
      .catch((error) => { setMessageError(true); setMessage(error.message); setLinkSignIn(null); })
      .finally(() => setBusy(false));
  };
  const cancelLinkSignIn = () => {
    setLinkSignIn(null); setMessageError(false);
    setMessage("링크로 로그인하지 않았어요. 내 계정이면 아래에서 직접 로그인해 주세요.");
  };

  if (!session) return <main className={`${styles.page} plan-ui`}><SiteHeader light showAccount={false} onHome={() => router.push("/")} /><div className={styles.loading}><PlanLoading count={2} note="내 계정을 확인하고 있어요" /></div></main>;

  return (
    <main className={`${styles.page} account-page plan-ui`}>
      {/* 머리말은 홈과 같은 것을 쓴다. 마이페이지 아이콘은 끈다 — 지금 보고 있는 화면으로 다시 보내는 단추다.
          로그인 폼은 위에 로고(홈 링크)를 직접 두므로, 로그인 전에는 머리말을 빼 로고가 두 번 보이지 않게 한다. */}
      {session.authenticated && <SiteHeader light showAccount={false} onHome={() => router.push("/")} onStart={() => router.push("/plan/chat?new=1")} />}
      {session.authenticated ? (
        <div className={styles.loading}><PlanLoading count={2} note="내 계정으로 이동하고 있어요" /></div>
      ) : (
        <section className={`${styles.auth} account-auth-shell`}>
          {linkSignIn ? (
            <div className={styles.linkConfirm} role="dialog" aria-labelledby="link-confirm-title">
              <span className={styles.eyebrow}>오늘창업 계정</span>
              <h1 id="link-confirm-title">이 계정으로 로그인할까요?</h1>
              <p className={styles.linkAccount}>{linkSignIn.email ?? (linkSignIn.provider === "kakao" ? "카카오 계정" : "이메일 없는 계정")}{linkSignIn.provider && linkSignIn.provider !== "email" ? <small>{linkSignIn.provider === "kakao" ? "카카오" : linkSignIn.provider === "google" ? "구글" : linkSignIn.provider}로 연결된 계정</small> : null}</p>
              <p className={styles.linkNote}>내 계정이 맞을 때만 로그인하세요. 로그인하면 이 기기에서 작성 중인 기획이 이 계정으로 옮겨집니다. 내가 보낸 적 없는 링크라면 취소해 주세요.</p>
              <button type="button" className="account-submit" disabled={busy} onClick={confirmLinkSignIn}>{busy ? <><Spinner />로그인하고 있어요</> : "이 계정으로 로그인"}</button>
              <button type="button" className={styles.linkCancel} disabled={busy} onClick={cancelLinkSignIn}>취소</button>
              {message && <p role={messageError ? "alert" : "status"} className={messageError ? styles.error : styles.message}>{message}</p>}
            </div>
          ) : (
            <AccountAuthForm key={mode} next={nextPath} initialMode={mode} initialMessage={message} recoveryTokens={recoveryTokens}
              onReset={async () => { window.history.replaceState({}, "", "/account"); setRecoveryTokens(null); await loadSession(); }} />
          )}
        </section>
      )}
    </main>
  );
}
