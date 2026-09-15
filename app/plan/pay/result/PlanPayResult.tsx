"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import styles from "../PlanCheckout.module.css";

/**
 * 결제 결과 안내.
 * 성공 여부는 서버(returnUrl)가 이미 판정해 쿼리로 넘겨준 것이고,
 * 실제 잠금 해제는 DB의 주문 상태로만 결정된다.
 */
export default function PlanPayResult() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status"));
  const [reason, setReason] = useState(params.get("reason"));
  const [checking, setChecking] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const inFlight = useRef(false);
  const ok = status === "ok";
  const pending = status === "pending";
  const orderId = params.get("orderId");
  async function checkPayment() {
    if (inFlight.current || !orderId) return;
    inFlight.current = true;
    setChecking(true);
    try {
      const response = await fetch("/api/payments/plan/reconcile", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }),
        signal: AbortSignal.timeout(25_000),
      });
      if (response.status === 401) { setLoginRequired(true); return; }
      const data = await response.json();
      if (!response.ok || !["ok", "pending", "fail"].includes(data.status)) throw new Error("CHECK_UNAVAILABLE");
      setStatus(data.status); setReason(data.reason ?? null);
    } catch { setReason("아직 결과를 확인하지 못했습니다. 다시 결제하지 말고 잠시 후 확인해주세요."); }
    finally { inFlight.current = false; setChecking(false); }
  }
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
        <div className={`${styles.icon} ${ok ? styles.iconPop : ""}`} aria-hidden="true">{ok ? <CheckCircle2 size={30} strokeWidth={1.8} /> : pending ? <Clock3 size={30} strokeWidth={1.8} /> : <AlertTriangle size={30} strokeWidth={1.8} />}</div>
        <h1 className={styles.title}>{ok ? "결제가 완료되었습니다" : pending ? "결제 결과를 확인하고 있어요" : "결제를 마치지 못했습니다"}</h1>
        <p className={styles.desc} aria-live="polite">
          {ok ? doneDesc : pending ? (reason ?? "승인 결과 확인이 늦어지고 있습니다. 다시 결제하지 말고 이 주문의 결과를 확인해주세요.") : (reason ?? "결제가 취소되었거나 승인되지 않았습니다.")}
        </p>
        {pending && orderId && <p className={styles.desc} style={{ overflowWrap: "anywhere" }}>주문번호 {orderId}</p>}
        {ok ? (
          <Link href={doneHref} className={styles.primary}>{doneLabel}</Link>
        ) : pending ? (
          loginRequired ? <Link href={`/account?next=${encodeURIComponent(`/plan/pay/result?${params.toString()}`)}`} className={styles.primary}>로그인하고 결과 확인</Link>
            : <button type="button" onClick={checkPayment} disabled={checking || !orderId} className={`${styles.primary} ${styles.statusAction}`}><RefreshCw size={18} aria-hidden="true" />{checking ? "확인 중" : "결제 결과 확인"}</button>
        ) : (
          <Link href={retryHref} className={styles.primary}>{planId ? "다시 시도하기" : "플랜 개요로 가기"}</Link>
        )}
        <Link href={homepageProduct ? "/plan/homepage" : "/plan/overview"} className={styles.back}>← {homepageProduct ? "홈페이지로" : "플랜으로"} 돌아가기</Link>
      </div>
    </div>
  );
}
