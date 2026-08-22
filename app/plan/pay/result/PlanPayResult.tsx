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
  const product = params.get("product") ?? "plan";
  const retryHref = planId
    ? `/plan/pay?planId=${encodeURIComponent(planId)}${planType ? `&planType=${encodeURIComponent(planType)}` : ""}${product !== "plan" ? `&product=${product}` : ""}`
    : "/plan/overview";
  /* 홈페이지 계열 상품은 홈페이지 화면으로 — 계획서 개요로 보내면 산 것이 어디 있는지 모른다 */
  const homepageProduct = product === "homepage" || product === "domain" || product === "tokens";
  const doneHref = homepageProduct ? "/plan/homepage" : "/plan/overview";
  const doneLabel = product === "homepage" ? "홈페이지 고치러 가기" : product === "domain" ? "도메인 연결하러 가기" : product === "tokens" ? "AI 수정 쓰러 가기" : "이어서 작성하기";
  const doneDesc = product === "homepage" ? "홈페이지 편집과 공개가 열렸습니다." : product === "domain" ? "1년 동안 내 도메인을 연결해 쓸 수 있습니다." : product === "tokens" ? "AI 수정 토큰 20만이 충전됐습니다." : product === "regen" ? "다시 생성 10회가 추가됐습니다." : "모든 섹션이 열렸습니다. 이어서 작성해보세요.";

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={`${styles.icon} ${ok ? styles.iconPop : ""}`} aria-hidden="true">{ok ? <CheckCircle2 size={30} strokeWidth={1.8} /> : <AlertTriangle size={30} strokeWidth={1.8} />}</div>
        <h1 className={styles.title}>{ok ? "결제가 완료되었습니다" : "결제를 마치지 못했습니다"}</h1>
        <p className={styles.desc}>
          {ok ? doneDesc : (reason ?? "결제가 취소되었거나 승인되지 않았습니다.")}
        </p>
        {ok ? (
          <Link href={doneHref} className={styles.primary}>{doneLabel}</Link>
        ) : (
          <Link href={retryHref} className={styles.primary}>{planId ? "다시 시도하기" : "플랜 개요로 가기"}</Link>
        )}
        <Link href={homepageProduct ? "/plan/homepage" : "/plan/overview"} className={styles.back}>← {homepageProduct ? "홈페이지로" : "플랜으로"} 돌아가기</Link>
      </div>
    </div>
  );
}
