"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import AccountAuthForm, { type AuthMode } from "./account-auth-form";
import { safeNextPath } from "../lib/http/safe-next";
import accountStyles from "../app/account/Account.module.css";
import styles from "./login-dialog.module.css";

/*
 * 로그인 팝업. 둘러보기는 로그인 없이 하고, 저장·생성처럼 계정이 필요한 순간에만 이 자리에서 로그인한다.
 * 예전엔 /account 화면으로 보냈다가 돌아와서 보던 화면과 흐름을 잃었다.
 *
 * 열기는 openLogin() — 앱 어디서든 부를 수 있게 창 이벤트로 연결한다. 팝업이 아직 없으면(스크립트 로딩 전 등)
 * 예전처럼 /account 로 이동한다.
 */
const OPEN_EVENT = "oneul:open-login";
let hostMounted = false;

function currentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

export function loginHref(next?: string | null) {
  return `/account?next=${encodeURIComponent(next ?? "/plan")}`;
}

/** 로그인 팝업을 연다. next 가 없으면 지금 보고 있는 화면으로 돌아온다. mode 로 회원가입 화면부터 열 수 있다 */
export function openLogin(next?: string | null, mode: AuthMode = "login") {
  const target = safeNextPath(next ?? currentPath()) ?? "/plan";
  if (!hostMounted) { window.location.assign(`${loginHref(target)}${mode === "register" ? "&mode=register" : ""}`); return; }
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { next: target, mode } }));
}

/** 화면 안에 바로 펼친 로그인 — 안내 문구와 버튼을 한 번 더 거치지 않고 그 자리에서 로그인한다 */
export function InlineLogin({ next }: { next: string }) {
  return <div className={`${accountStyles.page} ${styles.inline}`}>
    <div className={`${accountStyles.auth} ${styles.auth}`}><AccountAuthForm next={safeNextPath(next) ?? "/plan"} titleId="inline-login-title" /></div>
  </div>;
}

/** 로그인 화면으로 가는 링크 자리 — 누르면 팝업을 연다(새 탭 열기 등은 그대로 링크로 동작) */
export function LoginLink({ next, className, children, title, ariaLabel }: { next?: string | null; className?: string; children: ReactNode; title?: string; ariaLabel?: string }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    openLogin(next);
  };
  return <a href={loginHref(next)} className={className} onClick={onClick} title={title} aria-label={ariaLabel}>{children}</a>;
}

export function LoginDialogHost() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [next, setNext] = useState<string | null>(null);
  const [opened, setOpened] = useState(0);
  const [mode, setMode] = useState<AuthMode>("login");

  useEffect(() => {
    hostMounted = true;
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ next?: string; mode?: AuthMode }>).detail;
      setNext(detail?.next ?? null);
      setMode(detail?.mode === "register" ? "register" : "login");
      setOpened(count => count + 1);
    };
    /*
     * 앱 곳곳의 "로그인하고 돌아오기" 링크(/account?next=…)를 한곳에서 팝업으로 바꾼다.
     * 링크 주소는 그대로라 새 탭 열기·스크립트 전 클릭은 예전처럼 로그인 화면으로 간다.
     * next 가 없는 /account(머리말 계정 아이콘)는 로그인 상태에 따라 내 계정으로 가야 해서 건드리지 않는다.
     */
    const intercept = (event: globalThis.MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== "/account" || !url.searchParams.has("next")) return;
      if (window.location.pathname === "/account") return;
      event.preventDefault();
      event.stopPropagation();
      setNext(safeNextPath(url.searchParams.get("next")) ?? "/plan");
      setMode(url.searchParams.get("mode") === "register" ? "register" : "login");
      setOpened(count => count + 1);
    };
    window.addEventListener(OPEN_EVENT, open);
    document.addEventListener("click", intercept, true);
    return () => { hostMounted = false; window.removeEventListener(OPEN_EVENT, open); document.removeEventListener("click", intercept, true); };
  }, []);

  useEffect(() => {
    if (!opened || !dialog.current || dialog.current.open) return;
    dialog.current.showModal();
  }, [opened]);

  const close = () => dialog.current?.close();
  /* 바깥 클릭으로 닫는 것은 '누르기 시작'도 바깥이었을 때만 — 글자를 끌어 선택하다 밖에서 놓으면 닫히던 문제 */
  const pressedOnBackdrop = useRef(false);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="login-dialog-title" onPointerDown={event => { pressedOnBackdrop.current = event.target === dialog.current; }} onClick={event => { if (pressedOnBackdrop.current && event.target === dialog.current) close(); pressedOnBackdrop.current = false; }}>
      {opened > 0 && (
        <div className={`${accountStyles.page} ${styles.scope}`}>
          <button type="button" className={styles.close} onClick={close} aria-label="로그인 닫기"><X size={20} /></button>
          {/* 열 때마다 새 폼 — 이전 입력·메시지를 남기지 않는다 */}
          <div className={`${accountStyles.auth} ${styles.auth}`}><AccountAuthForm key={opened} next={next} initialMode={mode} titleId="login-dialog-title" /></div>
        </div>
      )}
    </dialog>
  );
}
