"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
/* SDK 주소만 필요하다 — 서버 전용 모듈(시크릿 사용)을 클라이언트로 끌어오지 않는다 */
const NICEPAY_SDK_URL = "https://pay.nicepay.co.kr/v1/js/";
import { CheckCircle2, Unlock } from "lucide-react";
import styles from "./PlanCheckout.module.css";
import { Spinner } from "../PlanLoading";

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
  // 어느 문서를 여는 결제인지 — 관문에서 붙여 보낸다
  const params = useSearchParams();
  const planId = params.get("planId") ?? "";
  const planType = params.get("planType") ?? "";
  // 계획서 결제와 홈페이지 결제는 같은 화면을 쓰되 금액과 안내가 다르다
  const isHomepage = params.get("product") === "homepage";
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<{ price: number; productName: string; paid: boolean; payable: boolean; authenticated: boolean } | null>(null);
  const [homepageInfo, setHomepageInfo] = useState<{ price: number; editable: boolean } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/plan/access?planType=${encodeURIComponent(planType)}&planId=${encodeURIComponent(planId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setInfo({ price: d.price, productName: d.productName, paid: d.paid, payable: d.payable, authenticated: d.authenticated });
      })
      .catch(() => {
        if (alive) setInfo(null);
      });
    if (isHomepage && planId) {
      // 홈페이지 가격·구매 여부는 홈페이지 API가 안다
      fetch(`/api/plan/landing?planId=${encodeURIComponent(planId)}`)
        .then((r) => r.json())
        .then((d) => {
          if (alive) setHomepageInfo({ price: d.price, editable: Boolean(d.editable) });
        })
        .catch(() => {
          if (alive) setHomepageInfo(null);
        });
    }
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
      const res = await fetch("/api/payments/plan/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, planType, ...(isHomepage ? { product: "homepage" } : {}) }),
      });
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

  /*
   * 이미 산 것인지 판정.
   *
   * 예전에는 상품과 상관없이 계획서 결제 여부(info.paid)만 봤다. 그래서 계획서를
   * 산 사람이 홈페이지를 사러 오면 "이미 열려 있습니다"로 막혀 결제 자체가
   * 불가능했다 — 파는 쪽이 못 팔게 막고 있었다. 상품마다 따로 본다.
   */
  const alreadyOwned = isHomepage ? homepageInfo?.editable === true : info?.paid === true;

  if (alreadyOwned) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><CheckCircle2 size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>{isHomepage ? "홈페이지는 이미 열려 있습니다" : "이 문서는 이미 열려 있습니다"}</h1>
          <p className={styles.desc}>{isHomepage ? "결제가 확인되어 사진·글·버튼을 고치고 공개할 수 있습니다." : "결제가 확인되어 전체 섹션을 쓸 수 있습니다."}</p>
          <Link href={isHomepage ? "/plan/homepage" : "/plan/overview"} className={styles.primary}>{isHomepage ? "홈페이지 에디터 열기" : "플랜으로 돌아가기"}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true"><Unlock size={30} strokeWidth={1.8} /></div>
        <h1 className={styles.title}>{isHomepage ? "홈페이지 수정하고 공개하기" : "이 문서 전체 열기"}</h1>
        <p className={styles.desc}>
          {isHomepage ? (
            <>
              계획서 내용으로 만든 홈페이지를 직접 고치고 인터넷에 공개할 수 있습니다.
              신청 폼으로 들어온 문의도 이곳에서 확인합니다.
            </>
          ) : (
            <>
              {planType ? <b>{planType}</b> : "이 문서"} 1부의 전체 섹션이 열리고, 완성 후 PDF·Word·발표용 PPT로 내려받을 수 있습니다.
              같은 사업으로 다른 유형을 만들 땐 답변이 그대로 이어집니다.
            </>
          )}
        </p>

        {isHomepage ? (
          <div className={styles.price}>
            {(homepageInfo?.price ?? 149000).toLocaleString("ko-KR")}원
            <span>홈페이지 1개 · 1회 결제</span>
          </div>
        ) : info ? (
          <div className={styles.price}>
            {info.price.toLocaleString("ko-KR")}원
            <span>문서 1부 · 1회 결제</span>
          </div>
        ) : (
          /* 가격 확인 전 — 자리를 비워두면 화면이 덜컥거린다 */
          <div className={styles.price} aria-busy="true">
            <Spinner />
            <span>결제 정보를 확인하는 중…</span>
          </div>
        )}

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
            {phase === "preparing" ? <><Spinner /> 결제 준비 중…</> : phase === "opening" ? <><Spinner /> 결제창을 여는 중…</> : "카드로 결제하기"}
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
