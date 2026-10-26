import type { AuthMode } from "./account-auth-form";
import { safeNextPath } from "../lib/http/safe-next";

/*
 * 로그인 팝업 열기 — 앱 어디서든 부를 수 있게 창 이벤트로 연결한다. 팝업이 아직 없으면(스크립트 로딩 전 등)
 * 예전처럼 /account 로 이동한다.
 * 팝업 틀(login-dialog-host)은 모든 화면에 붙고, 이 파일은 그 틀과 화면들(login-dialog)이 같이 쓰는 가벼운 부분만 둔다 —
 * 로그인 폼 코드는 팝업을 열 때 받는다(점검 r42-B 결정 1).
 */
export const OPEN_LOGIN_EVENT = "oneul:open-login";
let hostMounted = false;

export function setLoginHostMounted(value: boolean) {
  hostMounted = value;
}

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
  window.dispatchEvent(new CustomEvent(OPEN_LOGIN_EVENT, { detail: { next: target, mode } }));
}
