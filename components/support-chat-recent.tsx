"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { loadAuthSession } from "../lib/client/auth-session";
import { displayOrderName, PAYMENT_STATUS_LABEL } from "../lib/payments/order-display";
import type { PaymentHistoryItem } from "../lib/payments/plan-orders";
import { planOpenHref } from "../lib/plan-builder/business-hub";
import { planDisplayName } from "../lib/plan-builder/business-name";
import { isSamplePlan, loadState, type Plan } from "../lib/plan-builder/plan-store";
import styles from "./support-chat-recent.module.css";

/*
 * 상담 답변 아래 '내 최근 결제'·'내 최근 사업' — 환불·결제나 이어서 하기를 물은 손님이
 * 마이페이지·내 사업을 따로 찾아가지 않고 그 자리에서 바로 열게 한다(티켓 공구 상담봇의 '최근 예약 + 취소하기'와 같은 생각).
 */
export type RecentKind = "payments" | "plans";
const PAYMENT_FAQ = new Set(["pay-refund", "pay-multi", "pay-scope", "account-mypage"]);
const PLAN_FAQ = new Set(["write-continue", "write-reuse", "write-flow", "files-view", "files-edit", "files-download", "account-save", "account-device"]);

/** 답변(FAQ id 또는 AI 답의 화면 링크)에 맞는 카드 종류. 없으면 null */
export function recentKindFor(faqId?: string, linkHref?: string): RecentKind | null {
  if (faqId && PAYMENT_FAQ.has(faqId)) return "payments";
  if (faqId && PLAN_FAQ.has(faqId)) return "plans";
  if (!faqId && (linkHref === "/plan/me" || linkHref?.startsWith("/plan/info?doc=refund"))) return "payments";
  if (!faqId && linkHref === "/plan") return "plans";
  return null;
}

/* 상담 창을 연 동안 한 번만 묻는다 — shortcut: 상담 중에 새로 결제하면 창을 새로 열어야 보인다 */
let paymentsLoad: Promise<PaymentHistoryItem[] | null> | null = null;
function loadPayments() {
  paymentsLoad ??= loadAuthSession()
    .then((session) => (session.authenticated ? fetch("/api/auth/payments", { cache: "no-store" }) : null))
    .then((response) => (response?.ok ? (response.json() as Promise<{ payments?: PaymentHistoryItem[] }>) : null))
    .then((data) => data?.payments ?? null)
    .catch(() => {
      paymentsLoad = null;
      return null;
    });
  return paymentsLoad;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });

export function SupportRecent({ kind }: { kind: RecentKind }) {
  /* undefined = 불러오는 중, null = 보여 줄 것 없음(로그인 전·실패) */
  const [payments, setPayments] = useState<PaymentHistoryItem[] | null | undefined>(undefined);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    let alive = true;
    if (kind === "payments") void loadPayments().then((list) => alive && setPayments(list));
    else {
      const mine = loadState().plans.filter((plan) => !isSamplePlan(plan.id));
      setPlans([...mine].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 3));
    }
    return () => {
      alive = false;
    };
  }, [kind]);

  if (kind === "payments") {
    if (payments === undefined) return <p className={styles.loading}>내 결제 내역을 확인하는 중…</p>;
    if (!payments?.length) return null;
    return (
      <section className={styles.card} aria-label="내 최근 결제">
        <h4>내 최근 결제</h4>
        {payments.slice(0, 3).map((item) => (
          <div key={item.orderId} className={styles.row}>
            <div>
              <strong>{displayOrderName(item.orderName) || "-"}</strong>
              <small>{item.amount.toLocaleString("ko-KR")}원 · {shortDate(item.paidAt ?? item.createdAt)}</small>
            </div>
            <span className={item.status === "done" ? styles.ok : styles.muted}>{PAYMENT_STATUS_LABEL[item.status] ?? item.status}</span>
          </div>
        ))}
        <a className={styles.more} href="/plan/me#me-payments">결제·환불 요청은 마이페이지에서 <ChevronRight aria-hidden="true" /></a>
      </section>
    );
  }

  if (!plans.length) return null;
  return (
    <section className={styles.card} aria-label="내 최근 사업">
      <h4>내 최근 사업</h4>
      {plans.map((plan) => (
        <a key={plan.id} className={styles.row} href={planOpenHref(plan)}>
          <div>
            <strong>{planDisplayName(plan)}</strong>
            <small>{shortDate(plan.updatedAt)} 수정</small>
          </div>
          <span className={styles.open}>열기 <ChevronRight aria-hidden="true" /></span>
        </a>
      ))}
      <a className={styles.more} href="/plan">내 사업 전체 보기 <ChevronRight aria-hidden="true" /></a>
    </section>
  );
}
