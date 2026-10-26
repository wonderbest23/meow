"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { AuthMode } from "./account-auth-form";
import { safeNextPath } from "../lib/http/safe-next";
import { preloadAfterFirstInteraction, preloadOnce } from "../lib/client/preload-on-intent";
import { OPEN_LOGIN_EVENT, setLoginHostMounted } from "./login-dialog-core";
import accountStyles from "../app/account/Account.module.css";
import styles from "./login-dialog.module.css";

/*
 * 로그인 팝업 틀 — 모든 화면(app/layout.tsx)에 붙는다. 열기는 openLogin()(login-dialog-core).
 *
 * 틀(<dialog>·여는 이벤트·/account?next= 링크 가로채기·초점 돌려주기)은 바로 붙이고, 로그인 폼(account-auth-form)은
 * 처음 열 때 받는다 — 폼이 사업 기획 저장소까지 끌고 와 약관 화면도 처음 받는 JS 가 컸다(점검 r42-B 결정 1).
 * 로그인 링크에 마우스를 올리거나 초점이 가면, 그리고 화면을 처음 누르면 한가할 때 미리 받아 두어 열 때 기다리지 않는다.
 * 그래도 아직 못 받았으면(아주 느린 망) 창은 바로 열고 폼 자리에 '여는 중'을 잠깐 보인다.
 */
const authForm = preloadOnce(() => import("./account-auth-form"));
const AccountAuthForm = dynamic(() => authForm.get(), {
  ssr: false,
  loading: () => <p role="status" style={{ minHeight: 360, display: "grid", placeItems: "center", margin: 0, color: "#4e5968" }}>로그인 창을 여는 중이에요</p>,
});

export function LoginDialogHost() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [next, setNext] = useState<string | null>(null);
  const [opened, setOpened] = useState(0);
  const [mode, setMode] = useState<AuthMode>("login");
  /*
   * 닫으면 연 단추로 초점을 돌려준다 — 작업실 '다시 로그인하기'·대화의 로그인 풀림 단추로 열고 닫으면 초점이 문서 맨 앞('본문 바로가기')으로 가
   * 키보드·화면 낭독 사용자가 있던 자리를 잃었다. Safari 는 누른 단추에 초점을 주지 않아, 방금 누른 단추(lastPressed)를 대신 쓴다.
   */
  const returnFocus = useRef<HTMLElement | null>(null);
  const lastPressed = useRef<{ element: HTMLElement; at: number } | null>(null);

  useEffect(() => {
    setLoginHostMounted(true);
    /* 로그인으로 가는 링크에 마우스를 올리거나 초점이 가면 폼 코드를 미리 받는다(앱 곳곳의 로그인 단추는 첫 누르기 뒤 한가할 때) */
    const warmOnIntent = (event: Event) => {
      const control = (event.target as Element | null)?.closest?.("a[href^='/account'], a[href*='/account?']");
      if (control) authForm.warm();
    };
    const stopPreload = preloadAfterFirstInteraction(authForm.warm);
    /* 열 때 한 번만 — 이미 열린 창을 다시 열라고 하면(겹친 요청) 처음 연 단추를 그대로 둔다 */
    const remember = (fallback: HTMLElement | null) => {
      if (dialog.current?.open) return;
      const active = document.activeElement;
      const pressed = lastPressed.current && Date.now() - lastPressed.current.at < 1000 ? lastPressed.current.element : null;
      returnFocus.current = active instanceof HTMLElement && active !== document.body && !dialog.current?.contains(active) ? active : fallback ?? pressed;
    };
    const open = (event: Event) => {
      remember(null);
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
      /* 누른 단추를 적어 둔다(캡처 단계라 그 단추의 openLogin() 보다 먼저) — 창 안에서 누른 것은 빼고 */
      const control = (event.target as Element | null)?.closest?.("button, a[href], [role='button'], summary");
      if (control instanceof HTMLElement && !dialog.current?.contains(control)) lastPressed.current = { element: control, at: Date.now() };
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== "/account" || !url.searchParams.has("next")) return;
      if (window.location.pathname === "/account") return;
      event.preventDefault();
      event.stopPropagation();
      remember(anchor);
      setNext(safeNextPath(url.searchParams.get("next")) ?? "/plan");
      setMode(url.searchParams.get("mode") === "register" ? "register" : "login");
      setOpened(count => count + 1);
    };
    window.addEventListener(OPEN_LOGIN_EVENT, open);
    document.addEventListener("click", intercept, true);
    document.addEventListener("pointerover", warmOnIntent, true);
    document.addEventListener("focusin", warmOnIntent, true);
    return () => {
      setLoginHostMounted(false);
      stopPreload();
      window.removeEventListener(OPEN_LOGIN_EVENT, open);
      document.removeEventListener("click", intercept, true);
      document.removeEventListener("pointerover", warmOnIntent, true);
      document.removeEventListener("focusin", warmOnIntent, true);
    };
  }, []);

  useEffect(() => {
    if (!opened || !dialog.current || dialog.current.open) return;
    dialog.current.showModal();
  }, [opened]);

  const close = () => dialog.current?.close();
  /* 닫히면(닫기 단추 · Esc · 바깥 누르기) 연 단추로 — 그 단추가 사라졌거나(로그인돼 화면이 바뀜) 막힌 칸 안이면 두지 않는다 */
  const restoreFocus = () => {
    const target = returnFocus.current;
    returnFocus.current = null;
    if (!target?.isConnected || target.closest("[inert]")) return;
    target.focus({ preventScroll: true });
  };
  /* 바깥 클릭으로 닫는 것은 '누르기 시작'도 바깥이었을 때만 — 글자를 끌어 선택하다 밖에서 놓으면 닫히던 문제 */
  const pressedOnBackdrop = useRef(false);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="login-dialog-title" onClose={restoreFocus} onPointerDown={event => { pressedOnBackdrop.current = event.target === dialog.current; }} onClick={event => { if (pressedOnBackdrop.current && event.target === dialog.current) close(); pressedOnBackdrop.current = false; }}>
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
