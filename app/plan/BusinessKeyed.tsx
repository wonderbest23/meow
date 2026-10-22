"use client";

import { Fragment, Suspense, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import DeletedBusinessGuard from "./DeletedBusinessGuard";

/*
 * 주소의 사업(planId)이 바뀌면 화면 본문을 새로 그린다.
 * 사업계획서·홈페이지·사업 관리 화면은 처음 열 때 한 번만 주소의 사업을 읽어서, 왼쪽 목록에서 다른 사업을 골라
 * 주소만 바뀌면 본문은 이전 사업 그대로였다(엉뚱한 사업을 고칠 위험 — 점검 2026-10-22). 사업이 바뀔 때만 다시 그리므로
 * 같은 사업 안의 탭 바꾸기(tab=…)는 그대로 이어진다.
 *
 * 지운 사업이면 DeletedBusinessGuard 가 안내하고 내 사업으로 보낸다.
 *
 * adoptFirst: 주소에 사업이 없던 화면이 스스로 고른 사업을 주소에 적은 것(빈 값 → 사업)은 다시 그리지 않는다.
 */
function Keyed({ children, adoptFirst }: { children: ReactNode; adoptFirst: boolean }) {
  const planId = useSearchParams().get("planId") ?? "";
  const seen = useRef({ id: planId, key: planId });
  if (seen.current.id !== planId) seen.current = { id: planId, key: adoptFirst && seen.current.id === "" ? seen.current.key : planId };
  return <Fragment key={seen.current.key}>{children}</Fragment>;
}

/* useSearchParams 는 정적 빌드에서 Suspense 경계가 있어야 한다 — 그동안은 fallback(불러오는 중)을 보인다 */
export default function BusinessKeyed({ children, fallback, adoptFirst = false }: { children: ReactNode; fallback: ReactNode; adoptFirst?: boolean }) {
  return <Suspense fallback={fallback}><Keyed adoptFirst={adoptFirst}>{children}</Keyed><DeletedBusinessGuard /></Suspense>;
}
