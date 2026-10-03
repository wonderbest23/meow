"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { googleClientId } from "../lib/google-client-id";
import { prepareAccountSignIn } from "../lib/plan-builder/plan-store";
import { Spinner } from "../app/plan/PlanLoading";
import { DEFAULT_LOGO } from "./site-header";
import accountStyles from "../app/account/Account.module.css";
import styles from "./account-auth-form.module.css";

/*
 * 로그인·회원가입·비밀번호 찾기 폼 — /account 화면과 로그인 팝업(login-dialog)이 같이 쓴다.
 * 예전엔 로그인이 필요할 때마다 /account 로 보냈다가 돌아와서, 보던 화면을 잃고 동선이 끊겼다.
 *
 * 구글 로그인(GIS) — 버튼이 받아 온 ID 토큰을 서버(/api/auth/google)가 Supabase 로 검증한다.
 * 클라이언트 ID 는 공개값이라 코드에 둬도 되고, 환경변수로 바꿀 수 있게 열어 둔다.
 */
const GOOGLE_CLIENT_ID = googleClientId(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.NEXT_PUBLIC_APP_ENV);

type GoogleAccountsId = {
  initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

/** GIS 스크립트를 한 번만 싣는다 — 이미 있으면 그 로딩을 같이 기다린다 */
function loadGoogleScript(): Promise<GoogleAccountsId | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const script = existing ?? document.createElement("script");
    const done = () => resolve(window.google?.accounts?.id ?? null);
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      document.head.appendChild(script);
    } else if (window.google?.accounts?.id) {
      done();
    }
  });
}

export type AuthMode = "login" | "register" | "recover" | "reset";

async function payload<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data as T;
}

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

export default function AccountAuthForm({ next, initialMode = "login", initialMessage = "", recoveryTokens = null, onReset, titleId }: {
  /** 로그인 뒤 돌아갈 내부 경로(검증된 값만). 없으면 내 사업 목록 */
  next: string | null;
  initialMode?: AuthMode;
  initialMessage?: string;
  /** 비밀번호 재설정 메일 링크로 돌아왔을 때만 있다(reset 모드) */
  recoveryTokens?: { accessToken: string; refreshToken: string } | null;
  /** 새 비밀번호를 저장한 뒤 */
  onReset?: () => void | Promise<void>;
  /** 팝업이 제목으로 이름을 붙일 수 있게 */
  titleId?: string;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  /*
   * 로그인 상태 유지.
   * 켜면 30일짜리 쿠키를, 끄면 브라우저를 닫을 때 사라지는 세션 쿠키를 받는다.
   * 선택과 이메일은 이 브라우저에만 남긴다(비밀번호는 저장하지 않는다).
   */
  const [remember, setRemember] = useState(true);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [aiNotice, setAiNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [messageError, setMessageError] = useState(false);
  const switchMode = (next: AuthMode) => { setMode(next); setMessage(""); setMessageError(false); };
  const [googleReady, setGoogleReady] = useState(false);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  /* 구글 버튼이 그려질 자리 — GIS 가 이 안에 iframe 버튼을 그린다 */
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  /*
   * 로그인 뒤 갈 곳.
   * next가 있으면 하던 자리로 돌려보내고, 없으면 내 플랜 목록으로 보낸다.
   * 팝업에서는 next가 지금 보고 있는 화면이라, 같은 화면을 로그인 상태로 다시 연다.
   */
  const goNext = () => {
    window.location.assign(next ?? "/plan");
    return true;
  };

  /*
   * 구글 버튼 그리기.
   * remember·mode 가 바뀌면 콜백이 그 값을 새로 물도록 다시 초기화한다.
   */
  useEffect(() => {
    if (mode !== "login" && mode !== "register") return;
    if (!GOOGLE_CLIENT_ID) { setGoogleReady(false); setGoogleUnavailable(true); return; }
    let alive = true;
    setGoogleReady(false); setGoogleUnavailable(false);
    const timeout = window.setTimeout(() => { if (alive) setGoogleUnavailable(true); }, 10000);
    /*
     * 스크립트 로딩·폼 마운트·세션 확인이 제각각 끝나서 한 번에 그리려 하면
     * 빈 자리로 남는 때가 있었다 — 그려질 때까지 짧게 다시 시도한다.
     */
    void (async () => {
      for (let attempt = 0; attempt < 20 && alive; attempt += 1) {
        const gis = await loadGoogleScript();
        const parent = googleButtonRef.current;
        if (!alive) return;
        if (gis && parent) {
          gis.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => {
              if (!response.credential) return;
              setBusy(true);
              setMessage("");
              setMessageError(false);
              void prepareAccountSignIn().then(() => fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: response.credential, remember }),
              }))
                .then((r) => payload<{ authenticated: boolean; email: string | null }>(r))
                .then((data) => {
                  rememberLocally(remember, data.email ?? "");
                  goNext();
                })
                .catch((error) => {
                  setMessageError(true);
                  setMessage(error instanceof Error ? error.message : "구글 로그인에 실패했습니다.");
                  setBusy(false);
                });
            },
          });
          parent.innerHTML = "";
          gis.renderButton(parent, {
            /* 공식 원형 아이콘 버튼 — 카카오 원형 버튼과 나란히 둔다 */
            type: "icon",
            theme: "outline",
            size: "large",
            shape: "circle",
            locale: "ko",
          });
          if (parent.childElementCount > 0) { setGoogleReady(true); setGoogleUnavailable(false); window.clearTimeout(timeout); return; }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    })();
    return () => { alive = false; window.clearTimeout(timeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, remember]);

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
    event.preventDefault(); if (!valid || busy) return;
    setBusy(true); setMessage(""); setMessageError(false);
    try {
      if (mode !== "recover") await prepareAccountSignIn();
      if (mode === "recover") {
        await payload(await fetch("/api/auth/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }));
        setMessage("비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 열어주세요.");
      } else if (mode === "reset") {
        await payload(await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...recoveryTokens, password }) }));
        setPassword(""); setPasswordConfirm(""); setMessage("새 비밀번호를 저장했습니다."); await onReset?.();
      } else if (mode === "register") {
        const result = await payload<{ authenticated: boolean; confirmationRequired?: boolean; message?: string }>(await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, terms, privacy, aiNotice }) }));
        if (result.confirmationRequired) {
          setMode("login"); setPassword(""); setPasswordConfirm("");
          setMessage(result.message ?? "확인 메일의 링크로 이메일을 인증한 후 로그인해 주세요.");
        } else if (result.authenticated) {
          rememberLocally(remember, email);
          goNext();
          return;
        } else {
          setMode("login"); setPassword(""); setPasswordConfirm("");
          setMessage(result.message ?? "계정을 만들었습니다. 로그인해 주세요.");
        }
      } else {
        await payload(await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, remember }) }));
        setPassword("");
        rememberLocally(remember, email);
        // 하던 작업으로 돌려보낸다 — 로그인만 하고 갇히지 않게
        goNext();
        return;
      }
    } catch (error) { setMessageError(true); setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); } finally { setBusy(false); }
  };

  const entry = mode === "login" || mode === "register";
  const kakao = () => window.location.assign(`/api/auth/kakao${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  const passwordField = (label: string, value: string, set: (value: string) => void, autoComplete: string) => <label className={styles.cell}>
    <span className={styles.srOnly}>{label}</span>
    <input className={styles.input} type="password" required disabled={busy} minLength={8} placeholder={label} value={value} onChange={(event) => set(event.target.value)} autoComplete={autoComplete} />
  </label>;

  /*
   * 레퍼런스(오늘의집 로그인): 로고 → 이메일·비밀번호를 한 상자로 → 로그인 → 비밀번호 재설정 · 회원가입
   * → SNS 간편 로그인 원형 아이콘 → 로그인 문의. 제목·설명 문단은 두지 않는다.
   */
  return (
    /* plan-ui: 홈처럼 옛 전역 규칙(버튼 속 아이콘 숨김·모서리 강제)이 남은 화면에서 팝업으로 떠도 카카오·구글 아이콘이 보이게 */
    <div className={`${styles.root} plan-ui`}>
      <form className={styles.form} onSubmit={submit} aria-busy={busy} aria-labelledby={titleId}>
        <header className={styles.header}>
          <Link href="/" className={styles.logoLink} aria-label="오늘창업 홈">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.logo} src={DEFAULT_LOGO.src} alt="오늘창업" width={DEFAULT_LOGO.width} height={DEFAULT_LOGO.height} />
          </Link>
          <h1 id={titleId} className={mode === "login" ? styles.srOnly : styles.title}>{mode === "register" ? "회원가입" : mode === "recover" ? "비밀번호 재설정" : mode === "reset" ? "새 비밀번호" : "로그인"}</h1>
          {mode === "recover" && <p className={styles.sub}>가입한 이메일로 재설정 링크를 보내드려요.</p>}
          {mode === "reset" && <p className={styles.sub}>8자 이상으로 정해 주세요.</p>}
        </header>
        <div className={styles.group}>
          {mode !== "reset" && <label className={styles.cell}><span className={styles.srOnly}>이메일</span><input className={styles.input} type="email" required disabled={busy} placeholder="이메일" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} /></label>}
          {/*
            * "8자 이상"은 새로 정할 때만 지켜야 하는 규칙이다. 로그인 칸에 적어 두면
            * 이미 쓰고 있는 비밀번호를 두고 조건을 따지는 말이 된다. 규칙이 필요한 화면에서만 칸 아래 안내로 붙인다.
            */}
          {mode !== "recover" && passwordField(mode === "reset" ? "새 비밀번호 (8자 이상)" : mode === "register" ? "비밀번호 (8자 이상)" : "비밀번호", password, setPassword, mode === "login" ? "current-password" : "new-password")}
          {(mode === "register" || mode === "reset") && passwordField("비밀번호 확인", passwordConfirm, setPasswordConfirm, "new-password")}
        </div>
        {passwordConfirm && password !== passwordConfirm && <small className={styles.fieldError}>비밀번호가 서로 달라요.</small>}
        {mode === "register" && <div className={styles.consents}><label><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /><span><Link href="/terms" target="_blank">이용약관</Link>에 동의합니다.</span></label><label><input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} /><span><Link href="/privacy" target="_blank">개인정보처리방침</Link>에 동의합니다.</span></label><label><input type="checkbox" checked={aiNotice} onChange={(event) => setAiNotice(event.target.checked)} /><span><Link href="/ai-notice" target="_blank">인공지능·국외 처리 안내</Link>를 확인했습니다.</span></label></div>}
        {message && <p role={messageError ? "alert" : "status"} className={messageError ? accountStyles.error : accountStyles.message}>{message}</p>}
        <button className={styles.primary} disabled={!valid || busy}>{busy ? <><Spinner />{mode === "login" ? "로그인하고 있어요" : mode === "recover" ? "메일을 보내고 있어요" : "저장하고 있어요"}</> : mode === "register" ? "회원가입" : mode === "recover" ? "재설정 메일 보내기" : mode === "reset" ? "새 비밀번호 저장" : "로그인"}</button>
        <nav className={styles.links} aria-label="계정 메뉴">
          {mode === "login"
            ? <><button type="button" onClick={() => switchMode("recover")}>비밀번호 재설정</button><button type="button" onClick={() => switchMode("register")}>회원가입</button></>
            : <button type="button" onClick={() => switchMode("login")}>{mode === "register" ? "이미 계정이 있어요 · 로그인" : "로그인으로 돌아가기"}</button>}
        </nav>
        {entry && <section className={styles.sns} aria-label="SNS 간편 로그인">
          <p className={styles.snsTitle}>SNS계정으로 간편 로그인/회원가입</p>
          <div className={styles.snsRow}>
            {/* 구글은 공식 원형 아이콘 버튼(GIS)을 그대로 쓴다. 카카오는 노란 바탕 원형 */}
            <div className={styles.google} aria-busy={!googleReady && !googleUnavailable}>
              <span className={styles.googlePlaceholder} aria-hidden="true"><svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg></span>
              <div ref={googleButtonRef} className={styles.googleReal} />
            </div>
            <button type="button" className={styles.kakao} disabled={busy} onClick={kakao} aria-label="카카오로 로그인">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.9 3 2.8 6.2 2.8 10.1c0 2.5 1.7 4.7 4.2 6l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.5.1 1 .1 1.4.1 5.1 0 9.2-3.2 9.2-7.2S17.1 3 12 3z" /></svg>
            </button>
          </div>
          {googleUnavailable && <p className={styles.note}>구글 연결이 지연돼요. 이메일이나 카카오로 로그인해 주세요.</p>}
          {mode === "register" && <p className={styles.note}>SNS로 계속하면 <Link href="/terms" target="_blank">이용약관</Link>·<Link href="/privacy" target="_blank">개인정보처리방침</Link>에 동의하고 <Link href="/ai-notice" target="_blank">인공지능·국외 처리 안내</Link>를 확인한 것으로 봅니다.</p>}
        </section>}
        <footer className={styles.footer}><Link href="/terms" target="_blank">이용약관</Link><Link href="/privacy" target="_blank">개인정보처리방침</Link></footer>
      </form>
    </div>
  );
}
