"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { locallyDeletedPlanIds, planWasDeleted } from "../../lib/plan-builder/plan-store";
import styles from "./DeletedBusinessGuard.module.css";

/* 화면으로 돌아올 때마다 서버에 묻지 않게 — 이 기기에서 지운 것은 바로 알고, 서버 확인은 이 간격마다 한 번 */
const SERVER_CHECK_MS = 10_000;

/*
 * 지운 사업 화면을 계속 쓰지 못하게 한다 — 지운 뒤 뒤로 가기로 돌아오면 계획서와 '수정하기'가 그대로 동작했고,
 * 다른 탭에 열어 둔 계획서·홈페이지 편집기는 아무 안내가 없었다(점검 2026-10-22). 서버는 이미 되살리기를 막는다.
 * 처음 열 때와 화면으로 돌아올 때(visibilitychange·focus) 확인하고, 지웠으면 안내한 뒤 내 사업 목록으로 보낸다.
 */
export default function DeletedBusinessGuard() {
  const planId = useSearchParams().get("planId");
  const router = useRouter();
  const [deleted, setDeleted] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!planId) return;
    // 처음 열 때는 이 기기 기록만 본다 — 화면이 스스로 서버 목록을 읽어 지운 사업이면 '사업을 찾지 못했어요'를 띄운다
    let alive = true, lastServerCheck = Date.now(), checking = false;
    const check = async () => {
      if (checking || document.hidden) return;
      const now = Date.now();
      const askServer = now - lastServerCheck >= SERVER_CHECK_MS;
      checking = true;
      try {
        if (askServer) lastServerCheck = now;
        // 서버 확인 간격 안이면 이 기기에서 지운 기록만 본다(planWasDeleted 가 먼저 보는 곳과 같다)
        const gone = askServer ? await planWasDeleted(planId) : locallyDeletedPlanIds().includes(planId);
        if (alive && gone) setDeleted(planId);
      } finally { checking = false; }
    };
    void check();
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    // 브라우저 뒤로 가기로 통째로 되살아난 화면(bfcache)도 다시 확인한다
    window.addEventListener("pageshow", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); window.removeEventListener("pageshow", onVisible); };
  }, [planId]);
  const shown = !!deleted && deleted === planId;
  useEffect(() => {
    if (!shown) return;
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    const timer = window.setTimeout(() => router.replace("/plan"), 4000);
    return () => window.clearTimeout(timer);
  }, [shown, router]);
  if (!shown) return null;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="deleted-business-title" onCancel={event => { event.preventDefault(); router.replace("/plan"); }}>
    <h2 id="deleted-business-title">삭제된 사업이에요</h2>
    <p>이 사업은 지워져서 더 볼 수도 고칠 수도 없어요. 잠시 뒤 내 사업 목록으로 옮겨 갈게요.</p>
    <Link href="/plan" replace autoFocus>내 사업으로</Link>
  </dialog>;
}
