"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCcw } from "lucide-react";

export function PaymentSuccessClient({
  paymentKey,
  orderId,
  amount,
}: {
  paymentKey: string;
  orderId: string;
  amount: number;
}) {
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!paymentKey || !orderId || !amount) {
      setError("결제 승인 정보가 올바르지 않습니다.");
      return;
    }
    let cancelled = false;
    async function confirm() {
      setError("");
      try {
        const response = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "결제를 승인하지 못했습니다.");
        if (cancelled) return;
        window.localStorage.setItem("venture-project-id", payload.project.id);
        if (payload.starterLanding?.publicPath) {
          window.localStorage.setItem("venture-landing-path", payload.starterLanding.publicPath);
        }
        window.localStorage.removeItem("venture-pending-order");
        window.location.replace("/");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "결제를 승인하지 못했습니다.");
      }
    }
    void confirm();
    return () => {
      cancelled = true;
    };
  }, [paymentKey, orderId, amount, attempt]);

  return (
    <main className="payment-result-page">
      <section>
        {error ? <AlertTriangle className="error" /> : <LoaderCircle className="spin" />}
        <small>결제 확인과 홈페이지 제작</small>
        <h1>{error ? "결제 승인을 완료하지 못했습니다." : "프로젝트와 홈페이지를 준비하고 있습니다."}</h1>
        <p>{error || "창을 닫지 마세요. 결제 금액을 확인한 뒤 무료 홈페이지를 자동 제작하고 공개합니다."}</p>
        {error && <button onClick={() => setAttempt((value) => value + 1)}><RefreshCcw /> 다시 확인</button>}
      </section>
    </main>
  );
}

export function PaymentFailClient({
  code,
  message,
}: {
  code: string;
  message: string;
}) {
  return (
    <main className="payment-result-page">
      <section>
        <AlertTriangle className="error" />
        <small>결제 미완료</small>
        <h1>결제가 완료되지 않았습니다.</h1>
        <p>{message || "결제창이 취소되었거나 결제사 인증에 실패했습니다."}</p>
        <em>오류 확인 번호 {code || "알 수 없음"}</em>
        <button onClick={() => window.history.back()}><RefreshCcw /> 결제 화면으로 돌아가기</button>
        <a href="/"><CheckCircle2 /> 처음 화면으로 이동</a>
      </section>
    </main>
  );
}
