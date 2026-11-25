"use client";

import { useEffect } from "react";
import { authLinkRescueHref } from "../lib/auth/auth-link-rescue";

/** 인증 메일 링크가 다른 화면으로 돌아오면 /account 로 옮긴다(lib/auth/auth-link-rescue.ts). 화면에는 아무것도 그리지 않는다. */
export function AuthLinkRescue() {
  useEffect(() => {
    const target = authLinkRescueHref(window.location.pathname, window.location.hash);
    if (target) window.location.replace(target);
  }, []);
  return null;
}
