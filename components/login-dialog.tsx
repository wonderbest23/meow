"use client";

import { type MouseEvent, type ReactNode } from "react";
import AccountAuthForm from "./account-auth-form";
import { safeNextPath } from "../lib/http/safe-next";
import { loginHref, openLogin } from "./login-dialog-core";
import accountStyles from "../app/account/Account.module.css";
import styles from "./login-dialog.module.css";

/*
 * 로그인 팝업. 둘러보기는 로그인 없이 하고, 저장·생성처럼 계정이 필요한 순간에만 이 자리에서 로그인한다.
 * 예전엔 /account 화면으로 보냈다가 돌아와서 보던 화면과 흐름을 잃었다.
 *
 * 열기는 openLogin()(login-dialog-core) — 팝업 틀은 login-dialog-host 가 모든 화면에 붙인다.
 */
export { loginHref, openLogin } from "./login-dialog-core";

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

