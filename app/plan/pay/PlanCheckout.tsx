"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
/* SDK 주소만 필요하다 — 서버 전용 모듈(시크릿 사용)을 클라이언트로 끌어오지 않는다 */
const NICEPAY_SDK_URL = "https://pay.nicepay.co.kr/v1/js/";
import { CheckCircle2, Unlock } from "lucide-react";
import styles from "./PlanCheckout.module.css";

type Phase = "idle" | "preparing" | "opening" | "error";

declare global {
  interface Window {
    AUTHNICE?: { requestPay: (options: Record<string, unknown>) => void };
  }
}

/** 나이스페이 SDK를 한 번만 불러온다 */
function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.AUTHNICE) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${NICEPAY_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("SDK_LOAD_FAILED")));
      return;
    }
    const script = document.createElement("script");
    script.src = NICEPAY_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("SDK_LOAD_FAILED"));
    document.head.appendChild(script);
  });
}

/**
 * 결제 시작 화면.
 * 주문번호·금액은 서버가 정하고(/api/payments/plan/prepare), 여기서는 결제창만 연다.
 * 승인은 returnUrl(/api/payments/plan/return)에서 서버가 처리한다.
 */
export default function PlanCheckout() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<{ price: number; productName: string; paid: boolean; payable: boolean; authenticated: boolean } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/plan/access")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setInfo({ price: d.price, productName: d.productName, paid: d.paid, payable: d.payable, authenticated: d.authenticated });
      })
      .catch(() => {
        if (alive) setInfo(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function startPayment() {
    if (started.current) return;
    started.current = true;
    setPhase("preparing");
    setMessage(null);
    try {
      const res = await fetch("/api/payments/plan/prepare", { method: "POST" });
      const data = (await res.json()) as {
        clientId?: string; orderId?: string; amount?: number; goodsName?: string; buyerEmail?: string | null;
        error?: string; message?: string;
      };
      if (!res.ok || !data.clientId || !data.orderId) {
        setPhase("error");
        setMessage(data.message ?? "결제를 시작하지 못했습니다.");
        started.current = false;
        return;
      }

      await loadSdk();
      if (!window.AUTHNICE) throw new Error("SDK_LOAD_FAILED");

      setPhase("opening");
      window.AUTHNICE.requestPay({
        clientId: data.clientId,
        method: "card",
        orderId: data.orderId,
        amount: data.amount,
        goodsName: data.goodsName,
        buyerEmail: data.buyerEmail ?? undefined,
        returnUrl: `${window.location.origin}/api/payments/plan/return`,
        fnError: (result: { errorMsg?: string; resultMsg?: string }) => {
          setPhase("error");
          setMessage(result?.errorMsg ?? result?.resultMsg ?? "결제가 취소되었습니다.");
          started.current = false;
        },
      });
    } catch {
      setPhase("error");
      setMessage("결제창을 여는 중 문제가 생겼습니다. 잠시 후 다시 시도해주세요.");
      started.current = false;
    }
  }

  if (info && !info.authenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><Unlock size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>로그인이 필요합니다</h1>
          <p className={styles.desc}>결제 내역을 계정에 남기기 위해 먼저 로그인해 주세요. 로그인하면 이 화면으로 돌아옵니다.</p>
          <Link href="/account?next=%2Fplan%2Fpay" className={styles.primary}>로그인 · 회원가입</Link>
          <Link href="/plan/overview" className={styles.back}>← 나중에 하기</Link>
        </div>
      </div>
    );
  }

  if (info?.paid) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><CheckCircle2 size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>이미 결제가 완료된 계정입니다</h1>
          <p className={styles.desc}>모든 섹션이 열려 있습니다.</p>
          <Link href="/plan/overview" className={styles.primary}>플랜으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true"><Unlock size={30} strokeWidth={1.8} /></div>
        <h1 className={styles.title}>모든 섹션 열기</h1>
        <p className={styles.desc}>
          결제하면 남은 섹션을 모두 작성할 수 있고, 완성한 계획서를 PDF·Word로 내려받을 수 있습니다.
        </p>

        {info ? (
          <div className={styles.price}>
            {info.price.toLocaleString("ko-KR")}원
            <span>{info.productName} · 1회 결제</span>
          </div>
        ) : null}

        {info && !info.payable ? (
          <p className={styles.notice}>
            결제 준비가 아직 완료되지 않았습니다. 잠시 후 다시 시도해주세요.
          </p>
        ) : (
          <button
            type="button"
            className={styles.primary}
            onClick={startPayment}
            disabled={phase === "preparing" || phase === "opening"}
          >
            {phase === "preparing" ? "결제 준비 중…" : phase === "opening" ? "결제창을 여는 중…" : "카드로 결제하기"}
          </button>
        )}

        {message ? <p className={styles.error}>{message}</p> : null}

        <p className={styles.note}>
          지금까지 답한 내용은 그대로 남아 있습니다. 결제가 끝나면 이어서 작성됩니다.
        </p>
        <Link href="/plan/overview" className={styles.back}>← 나중에 하기</Link>
      </div>
    </div>
  );
}
