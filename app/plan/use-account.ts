"use client";

import { useEffect, useState } from "react";
import { loadAuthSession } from "../../lib/client/auth-session";

/** 로그인 상태 — 확인하기 전이면 null */
export type Account = { authenticated: boolean; email: string | null };

/*
 * 왼쪽 메뉴·휴대폰 머리줄·프로필 시트·첫 화면 인사말이 같이 쓰는 로그인 상태.
 * 같은 순간의 요청은 loadAuthSession 이 하나로 나눠 쓴다. 확인하지 못했으면 직전 상태를 둔다(로그인 안 됨으로 바꾸지 않는다).
 * key 가 바뀌면(화면 이동) 다시 묻는다 — 로그아웃이 바로 보이게.
 */
/* 마지막으로 확인한 상태 — 화면을 옮길 때마다 null 에서 시작해 머리줄의 'S'·이름이 '나'·손님 아이콘으로 잠깐 바뀌었다(2026-11-08 사장님).
 * 새로 불러온 첫 화면은 서버 그림과 같게 null 로 시작한다(모듈이 새로 뜨니 자연히 null) */
let lastAccount: Account | null = null;

export function useAccount(key?: string): Account | null {
  const [account, setAccount] = useState<Account | null>(() => lastAccount);
  useEffect(() => {
    let alive = true;
    loadAuthSession()
      .then(data => { lastAccount = { authenticated: !!data.authenticated, email: data.email ?? null }; if (alive) setAccount(lastAccount); })
      .catch(() => { /* 직전 상태 유지 */ });
    return () => { alive = false; };
  }, [key]);
  return account;
}

/** 부르는 이름 — 이메일 앞부분(이름을 따로 받지 않는다). 모르면 "" */
export function accountName(account: Account | null): string {
  const email = account?.authenticated ? account.email?.trim() ?? "" : "";
  return email ? email.split("@")[0] : "";
}

/** 동그라미 안 머리글자 — 이름이 없으면 "나", 로그인 상태를 아직 모르면 빈칸(나 → S 로 바뀌어 보이지 않게) */
export function accountInitial(account: Account | null): string {
  if (!account) return "";
  const name = accountName(account);
  return name ? name.charAt(0).toUpperCase() : "나";
}
