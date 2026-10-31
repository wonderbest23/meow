"use client";

import Link from "next/link";
import { ConsentList } from "./consent-list";
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { googleClientId } from "../lib/google-client-id";
import { nativeIdToken, nativePlatform } from "../lib/native-app";
import { prepareAccountSignIn } from "../lib/plan-builder/plan-store";
import { Spinner } from "../app/plan/PlanLoading";
import { DEFAULT_LOGO } from "./site-header";
import accountStyles from "../app/account/Account.module.css";
import styles from "./account-auth-form.module.css";
import { DocLink } from "./doc-sheet";
import { Eye, EyeOff } from "lucide-react";
import { apiMessage, userErrorMessage } from "../lib/client/user-error";
import { AppButton } from "./app-button";
import { FieldError, TextField } from "./app-field";
import theme from "./workspace-theme.module.css";

/*
 * 로그인·회원가입·비밀번호 찾기 폼 — /account 화면과 로그인 팝업(login-dialog)이 같이 쓴다.
 * 예전엔 로그인이 필요할 때마다 /account 로 보냈다가 돌아와서, 보던 화면을 잃고 동선이 끊겼다.
 *
 * 구글 로그인(GIS) — 버튼이 받아 온 ID 토큰을 서버(/api/auth/google)가 Supabase 로 검증한다.
 * 클라이언트 ID 는 공개값이라 코드에 둬도 되고, 환경변수로 바꿀 수 있게 열어 둔다.
 */
const GOOGLE_CLIENT_ID = googleClientId(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.NEXT_PUBLIC_APP_ENV);
/* 아이폰 앱의 구글 로그인 창이 쓰는 iOS 클라이언트 ID — 없으면 아이폰 앱에서는 구글 버튼을 숨긴다 */
const GOOGLE_IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";

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

const FAILED = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
/* fetch 가 TypeError 로 끝나면 연결이 끊긴 것 — 서버 문제처럼 말하지 않는다 */
const OFFLINE = "인터넷 연결을 확인하고 다시 시도해 주세요.";

/* HTML 오류 페이지(502 등)·끊긴 연결도 한국어 안내로 — "Unexpected token '<'"·"Failed to fetch" 가 그대로 보이지 않게 */
async function payload<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || data === null) throw new Error(apiMessage(data, FAILED));
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

export default function AccountAuthForm({ next, initialMode = "login", initialMessage = "", initialMessageError = false, recoveryTokens = null, onReset, onModeChange, titleId }: {
  /** 로그인 뒤 돌아갈 내부 경로(검증된 값만). 없으면 내 사업 목록 */
  next: string | null;
  initialMode?: AuthMode;
  initialMessage?: string;
  /** initialMessage 가 오류 안내인지(그러면 role=alert 로 바로 읽어 준다) */
  initialMessageError?: boolean;
  /** 비밀번호 재설정 메일 링크로 돌아왔을 때만 있다(reset 모드) */
  recoveryTokens?: { accessToken: string; refreshToken: string } | null;
  /** 새 비밀번호를 저장한 뒤 */
  onReset?: () => void | Promise<void>;
  /** 팝업이 제목으로 이름을 붙일 수 있게 */
  titleId?: string;
  /** 로그인·회원가입 등 모드가 바뀔 때(계정 화면이 탭 제목을 맞춘다) */
  onModeChange?: (mode: AuthMode) => void;
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
  const [messageError, setMessageError] = useState(initialMessageError);
  /*
   * 바깥(계정 화면)이 안내를 늦게 넘겨도 보여 준다 — 만료된 인증 링크·카카오 링크 확인 실패는 폼이 그려진 뒤에 알게 된다.
   * 예전엔 첫 렌더 값만 읽어 빈 폼만 남았다(감사 2026-10-23).
   */
  useEffect(() => {
    if (!initialMessage) return;
    setMessage(initialMessage);
    setMessageError(initialMessageError);
  }, [initialMessage, initialMessageError]);
  const switchMode = (next: AuthMode) => { setMode(next); setMessage(""); setMessageError(false); setAskedProblem(false); };
  const [googleReady, setGoogleReady] = useState(false);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  /* 구글 버튼이 그려질 자리 — GIS 가 이 안에 iframe 버튼을 그린다 */
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  /* 앱(아이폰·안드로이드) 안이면 휴대폰 로그인 창을 쓴다 — 구글은 앱 안 웹 화면 로그인을 막는다 */
  const [native, setNative] = useState<"ios" | "android" | null>(null);
  useEffect(() => { setNative(nativePlatform()); }, []);

  useEffect(() => { setMode(initialMode); }, [initialMode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onModeChange?.(mode); }, [mode]);

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
  /* 구글·애플 ID 토큰을 서버에 넘겨 로그인한다(웹의 구글 버튼과 앱의 휴대폰 로그인 창이 함께 쓴다) */
  const finishIdTokenLogin = (provider: "google" | "apple", credential: string) => {
    setBusy(true);
    setMessage("");
    setMessageError(false);
    void prepareAccountSignIn().then(() => fetch(`/api/auth/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential, remember }),
    }))
      .then((r) => payload<{ authenticated: boolean; email: string | null }>(r))
      .then((data) => {
        rememberLocally(remember, data.email ?? "");
        goNext();
      })
      .catch((error) => {
        setMessageError(true);
        setMessage(userErrorMessage(error, `${provider === "apple" ? "애플" : "구글"} 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.`));
        setBusy(false);
      });
  };

  /* 앱 안: 휴대폰 로그인 창을 열고, 받은 토큰으로 위와 같이 로그인한다. 창을 닫으면 조용히 돌아온다 */
  const nativeLogin = (provider: "google" | "apple") => {
    if (busy) return;
    setMessage(""); setMessageError(false);
    void nativeIdToken(provider, { googleWebClientId: GOOGLE_CLIENT_ID, googleIosClientId: GOOGLE_IOS_CLIENT_ID })
      .then((token) => finishIdTokenLogin(provider, token))
      .catch((error) => {
        const text = error instanceof Error ? error.message : "";
        /* 사용자가 창을 닫은 경우(애플 1001, 구글 cancel)는 조용히 돌아온다 */
        if (/cancel|취소|error 1001/i.test(text)) return;
        setMessageError(true);
        /* 휴대폰이 주는 영어 오류문은 그대로 보이지 않는다 */
        setMessage(/[가-힣]/.test(text) ? text : `${provider === "apple" ? "애플" : "구글"} 로그인을 마치지 못했어요. 잠시 후 다시 시도하거나 이메일로 로그인해 주세요.`);
      });
  };
  const nativeGoogle = native === "android" ? Boolean(GOOGLE_CLIENT_ID) : native === "ios" ? Boolean(GOOGLE_IOS_CLIENT_ID) : false;

  useEffect(() => {
    if (mode !== "login" && mode !== "register") return;
    if (native) return;
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
              finishIdTokenLogin("google", response.credential);
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
  }, [mode, remember, native]);

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

  /*
   * 모자란 것 — 예전엔 단추만 흐리게 꺼져 왜 안 눌리는지 알 수 없었다(비밀번호 5자, 약관 미동의 등).
   * 단추는 늘 누를 수 있게 두고, 누르면 첫 번째로 모자란 것을 알려 준다(결제 화면 동의 안내와 같은 방식).
   */
  const problem = useMemo(() => {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (mode !== "reset" && !email.trim()) return "이메일을 입력해 주세요.";
    if (mode !== "reset" && !emailOk) return "이메일 주소를 다시 확인해 주세요.";
    if (mode === "recover") return "";
    if (!password) return mode === "login" ? "비밀번호를 입력해 주세요." : "비밀번호를 정해 주세요.";
    if (mode !== "login" && password.length < 8) return "비밀번호를 8자 이상으로 정해 주세요.";
    if (mode !== "login" && password !== passwordConfirm) return "비밀번호가 서로 달라요. 확인 칸을 다시 입력해 주세요.";
    if (mode === "reset" && !recoveryTokens) return "재설정 링크가 만료됐어요. 메일을 다시 받아 주세요.";
    if (mode === "register" && !(terms && privacy && aiNotice)) return "필수 항목에 모두 동의해 주세요.";
    return "";
  }, [aiNotice, email, mode, password, passwordConfirm, privacy, recoveryTokens, terms]);
  const valid = !problem;
  /* 한 번 눌러 본 뒤에는 모자란 것을 고칠 때마다 안내가 바로 바뀐다(다 채우면 사라짐) */
  const [askedProblem, setAskedProblem] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    if (problem) { setAskedProblem(true); return; }
    setBusy(true); setMessage(""); setMessageError(false);
    try {
      if (mode !== "recover") await prepareAccountSignIn();
      if (mode === "recover") {
        await payload(await fetch("/api/auth/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }));
        setMessage("비밀번호 재설정 메일을 보냈어요. 메일의 링크를 열어 주세요.");
      } else if (mode === "reset") {
        await payload(await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...recoveryTokens, password }) }));
        setPassword(""); setPasswordConfirm(""); setMessage("새 비밀번호를 저장했어요."); await onReset?.();
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
          setMessage(result.message ?? "계정을 만들었어요. 로그인해 주세요.");
        }
      } else {
        await payload(await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, remember }) }));
        setPassword("");
        rememberLocally(remember, email);
        // 하던 작업으로 돌려보낸다 — 로그인만 하고 갇히지 않게
        goNext();
        return;
      }
    } catch (error) {
      setMessageError(true); setMessage(error instanceof TypeError ? OFFLINE : userErrorMessage(error, FAILED));
      // 실패하면 초점을 이메일 칸으로 — 어디에도 초점이 없으면(body) 키보드·낭독기 사용자가 다시 고칠 곳을 잃는다
      window.requestAnimationFrame(() => { const active = document.activeElement; if (!active || active === document.body) emailInput.current?.focus(); });
    } finally { setBusy(false); }
  };

  const entry = mode === "login" || mode === "register";
  const kakao = () => window.location.assign(`/api/auth/kakao${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  /* 보내는 동안 칸·로그인 단추는 disabled 대신 readOnly·aria-disabled로 둔다 — disabled면 누른 자리의 초점이 body로 떨어졌다(접근성 점검 2026-10-22). 다시 보내기는 submit의 busy가 막는다 */
  const mismatch = Boolean(passwordConfirm) && password !== passwordConfirm;
  const mismatchId = useId();
  const passwordField = (label: string, value: string, set: (value: string) => void, autoComplete: string, error?: string) => <PasswordField label={label} value={value} onChange={set} autoComplete={autoComplete} disabled={busy} error={error} />;

  /*
   * 레퍼런스(오늘의집 로그인): 로고 → 이메일·비밀번호를 한 상자로 → 로그인 → 비밀번호 재설정 · 회원가입
   * → SNS 간편 로그인 원형 아이콘 → 로그인 문의. 제목·설명 문단은 두지 않는다.
   */
  return (
    /* plan-ui: 홈처럼 옛 전역 규칙(버튼 속 아이콘 숨김·모서리 강제)이 남은 화면에서 팝업으로 떠도 카카오·구글 아이콘이 보이게 */
    <div className={`${theme.tokens} ${styles.root} plan-ui`}>
      <form className={styles.form} onSubmit={submit} noValidate aria-busy={busy} aria-labelledby={titleId}>
        <header className={styles.header}>
          <Link href="/" className={styles.logoLink} aria-label="오늘창업 홈">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.logo} src={DEFAULT_LOGO.src} alt="오늘창업" width={DEFAULT_LOGO.width} height={DEFAULT_LOGO.height} />
          </Link>
          <h1 id={titleId} className={styles.title}>{mode === "register" ? "회원가입" : mode === "recover" ? "비밀번호 재설정" : mode === "reset" ? "새 비밀번호" : "로그인"}</h1>
          {mode === "recover" && <p className={styles.sub}>가입한 이메일로 재설정 링크를 보내드려요.</p>}
          {mode === "reset" && <p className={styles.sub}>8자 이상으로 정해 주세요.</p>}
        </header>
        <div className={styles.group}>
          {mode !== "reset" && <label className={styles.cell}><span className={styles.srOnly}>이메일</span><TextField ref={emailInput} type="email" required readOnly={busy} aria-disabled={busy || undefined} placeholder="이메일" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} /></label>}
          {/*
            * "8자 이상"은 새로 정할 때만 지켜야 하는 규칙이다. 로그인 칸에 적어 두면
            * 이미 쓰고 있는 비밀번호를 두고 조건을 따지는 말이 된다. 규칙이 필요한 화면에서만 칸 아래 안내로 붙인다.
            */}
          {mode !== "recover" && passwordField(mode === "reset" ? "새 비밀번호 (8자 이상)" : mode === "register" ? "비밀번호 (8자 이상)" : "비밀번호", password, setPassword, mode === "login" ? "current-password" : "new-password")}
          {(mode === "register" || mode === "reset") && passwordField("비밀번호 확인", passwordConfirm, setPasswordConfirm, "new-password", mismatch ? mismatchId : undefined)}
        </div>
        {mismatch && <FieldError id={mismatchId} className={styles.fieldError}>비밀번호가 서로 달라요.</FieldError>}
        {mode === "register" && <ConsentList className={styles.consentList} items={[
          { key: "terms", label: "이용약관 동의", href: "/terms" },
          { key: "privacy", label: "개인정보 수집·이용 동의", href: "/privacy" },
          { key: "aiNotice", label: "인공지능·국외 처리 안내 확인", href: "/ai-notice" },
        ]} values={{ terms, privacy, aiNotice }} onChange={(next) => { setTerms(Boolean(next.terms)); setPrivacy(Boolean(next.privacy)); setAiNotice(Boolean(next.aiNotice)); }} />}
        {askedProblem && problem ? <p role="alert" className={accountStyles.error}>{problem}</p> : null}
        {message && <p role={messageError ? "alert" : "status"} className={messageError ? accountStyles.error : accountStyles.message}>{message}</p>}
        <AppButton type="submit" variant="primary" className={styles.primary} data-incomplete={!valid || undefined} aria-disabled={busy || undefined}>{busy ? <><Spinner />{mode === "login" ? "로그인하고 있어요" : mode === "recover" ? "메일을 보내고 있어요" : "저장하고 있어요"}</> : mode === "register" ? "회원가입" : mode === "recover" ? "재설정 메일 보내기" : mode === "reset" ? "새 비밀번호 저장" : "로그인"}</AppButton>
        <nav className={styles.links} aria-label="계정 메뉴">
          {mode === "login"
            ? <><AppButton variant="text" size="small" onClick={() => switchMode("recover")}>비밀번호 재설정</AppButton><AppButton variant="text" size="small" onClick={() => switchMode("register")}>회원가입</AppButton></>
            : <AppButton variant="text" size="small" onClick={() => switchMode("login")}>{mode === "register" ? "이미 계정이 있어요 · 로그인" : "로그인으로 돌아가기"}</AppButton>}
        </nav>
        {entry && <section className={styles.sns} aria-label="SNS 간편 로그인">
          <p className={styles.snsTitle}>SNS 계정으로 간편 로그인/회원가입</p>
          <div className={styles.snsRow}>
            {/* 구글은 공식 원형 아이콘 버튼(GIS)을 그대로 쓴다. 카카오는 노란 바탕 원형 */}
            {native === "ios" && <button type="button" className={styles.apple} disabled={busy} onClick={() => nativeLogin("apple")} aria-label="애플로 로그인">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.67-2.15.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.33-3.53zM14.18 6.13c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.93 2.69.98.08 1.98-.5 2.59-1.23z" /></svg>
            </button>}
            {native ? nativeGoogle && <button type="button" className={styles.google} disabled={busy} onClick={() => nativeLogin("google")} aria-label="구글로 로그인">
              <span className={styles.googlePlaceholder} aria-hidden="true"><svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg></span>
            </button> : <div className={styles.google} aria-busy={!googleReady && !googleUnavailable}>
              <span className={styles.googlePlaceholder} aria-hidden="true"><svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg></span>
              <div ref={googleButtonRef} className={styles.googleReal} />
            </div>}
            <button type="button" className={styles.kakao} disabled={busy} onClick={kakao} aria-label="카카오로 로그인">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.9 3 2.8 6.2 2.8 10.1c0 2.5 1.7 4.7 4.2 6l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.5.1 1 .1 1.4.1 5.1 0 9.2-3.2 9.2-7.2S17.1 3 12 3z" /></svg>
            </button>
          </div>
          {!native && googleUnavailable && <p className={styles.note}>구글 연결이 지연돼요. 이메일이나 카카오로 로그인해 주세요.</p>}
          {/* 로그인 탭에서도 보인다 — 처음 쓰는 SNS 계정은 로그인 버튼으로 바로 가입된다 */}
          {/* 문서 링크 — 웹은 새 창, 앱 안은 화면 위에 띄운다(앱에서 새 창은 앱 밖으로 나갔다) */}
          <p className={styles.note}>SNS로 계속하면 <DocLink href="/terms" title="이용약관">이용약관</DocLink>·<DocLink href="/privacy" title="개인정보처리방침">개인정보처리방침</DocLink>에 동의하고 <DocLink href="/ai-notice" title="인공지능·국외 처리 안내">인공지능·국외 처리 안내</DocLink>를 확인한 것으로 봐요.</p>
        </section>}
        {/* SNS 칸의 동의 문장에 같은 두 문서 링크가 이미 있다 — 그 칸이 없는 화면(비밀번호 재설정 등)에만 둔다(모바일 점검 r37: 두 번 보였다) */}
        {!entry && <footer className={styles.footer}><DocLink href="/terms" title="이용약관">이용약관</DocLink><DocLink href="/privacy" title="개인정보처리방침">개인정보처리방침</DocLink></footer>}
      </form>
    </div>
  );
}

/*
 * 비밀번호 칸 — 오른쪽 눈 아이콘을 누르면 친 글자를 보여 준다(대표 요청 2026-10-22: 휴대폰에서 무엇을 쳤는지 확인할 수 없었다).
 * 칸마다 따로 켜고 끈다. 아이콘을 눌러도 입력 칸의 커서는 그대로 둔다.
 */
function PasswordField({ label, value, onChange, autoComplete, disabled, error }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; disabled: boolean; error?: string }) {
  const [shown, setShown] = useState(false);
  return <label className={`${styles.cell} ${styles.passwordCell}`}>
    <span className={styles.srOnly}>{label}</span>
    <TextField className={styles.input} type={shown ? "text" : "password"} required readOnly={disabled} aria-disabled={disabled || undefined} aria-invalid={error ? true : undefined} aria-describedby={error} minLength={8} placeholder={label} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    <button type="button" className={styles.reveal} aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"} aria-pressed={shown} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => setShown((current) => !current)}>
      {shown ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
    </button>
  </label>;
}
