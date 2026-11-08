"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import BusinessAppChrome from "../BusinessAppChrome";
import PlanLoading from "../PlanLoading";
import { loadState } from "../../../lib/plan-builder/plan-store";
import frame from "../chat/page.module.css";
import styles from "./Studio.module.css";

/* 이 기기에 저장된 사업 이름 — 서버를 부르기 전에 머리줄에 바로 보인다(예전엔 '사업 작업실'이 잠깐 보였다가 바뀌었다) */
let memo = { id: "", title: "" };
const noSubscribe = () => () => {};
function cachedTitle(planId: string) {
  if (!planId) return "";
  if (memo.id !== planId) memo = { id: planId, title: loadState().plans.find(item => item.id === planId)?.title ?? "" };
  return memo.title;
}
export function useCachedPlanTitle(planId: string) {
  return useSyncExternalStore(noSubscribe, () => cachedTitle(planId), () => "");
}
const planIdFromUrl = () => new URLSearchParams(window.location.search).get("planId") ?? "";

/**
 * 작업실 로딩 — 진짜 작업실과 같은 휴대폰 머리(✕ · 사업명 알약 · ›)에 본문 자리 작은 로딩. 라우트 로딩과 주소 확인 중에 같이 쓴다.
 * 예전엔 '‹ 사업 작업실' 흰 머리줄(예전 디자인)이 잠깐 보였다가 바뀌었다(2026-11-08 사장님). PC 는 머리 없이 로딩만.
 */
export default function StudioLoading() {
  /* 주소에 사업이 없으면 새 대화 — 진짜 작업실 머리와 같은 글자 */
  const title = useSyncExternalStore(noSubscribe, () => { const id = planIdFromUrl(); return id ? cachedTitle(id) : "새 대화"; }, () => "");
  return <main className={`${frame.page} ${styles.page}`}>
    <BusinessAppChrome title={title || "사업 작업실"} showRail={false} backHref="/plan" active="plans" topBar={() => <header className={`${styles.mHead} ${styles.loadingHead}`}>
      <Link className={styles.round44} href="/plan" aria-label="첫 화면으로"><X aria-hidden="true" /></Link>
      <span className={styles.namePill}><span className={styles.bizTitle}>{title || " "}</span><ChevronDown aria-hidden="true" /></span>
      <button type="button" className={styles.round44} aria-label="미리보기 보기" disabled><ChevronRight aria-hidden="true" /></button>
    </header>}>
      <PlanLoading fill variant="compact" note="작업실을 불러오고 있어요" />
    </BusinessAppChrome>
  </main>;
}
