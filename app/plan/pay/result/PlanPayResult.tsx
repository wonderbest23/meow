"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import styles from "../PlanCheckout.module.css";

/**
 * 결제 결과 안내.
 * 성공 여부는 서버(returnUrl)가 이미 판정해 쿼리로 넘겨준 것이고,
 * 실제 잠금 해제는 DB의 주문 상태로만 결정된다.
 */
export default function PlanPayResult() {
  const params = useSearchParams();
  const ok = params.get("status") === "ok";
  const reason = params.get("reason");
  // 실패 시 같은 문서로 다시 시도할 수 있게 — 이게 빠지면 재시도 화면이 결제할 문서를 모른다
  const planId = params.get("planId");
  const planType = params.get("planType");
  const retryHref = planId
    ? `/plan/pay?planId=${encodeURIComponent(planId)}${planType ? `&planType=${encodeURIComponent(planType)}` : ""}`
    : "/plan/overview";

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={`${styles.icon} ${ok ? styles.iconPop : ""}`} aria-hidden="true">{ok ? <CheckCircle2 size={30} strokeWidth={1.8} /> : <AlertTriangle size={30} strokeWidth={1.8} />}</div>
        <h1 className={styles.title}>{ok ? "결제가 완료되었습니다" : "결제를 마치지 못했습니다"}</h1>
        <p className={styles.desc}>
          {ok
            ? "모든 섹션이 열렸습니다. 이어서 작성해보세요."
            : (reason ?? "결제가 취소되었거나 승인되지 않았습니다.")}
        </p>
        {ok ? (
          <Link href="/plan/overview" className={styles.primary}>이어서 작성하기</Link>
        ) : (
          <Link href={retryHref} className={styles.primary}>{planId ? "다시 시도하기" : "플랜 개요로 가기"}</Link>
        )}
        <Link href="/plan/overview" className={styles.back}>← 플랜으로 돌아가기</Link>
      </div>
    </div>
  );
}
