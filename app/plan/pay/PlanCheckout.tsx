"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loadNicepaySdk } from "../../../lib/payments/nicepay-sdk";
import { finishNativePurchase, nativePlatform, nativePurchase } from "../../../lib/native-app";
import { AlertCircle, CheckCircle2, ChevronRight, LogIn, Unlock } from "lucide-react";
import styles from "./PlanCheckout.module.css";
import { StatusBadge } from "../../../components/status-badge";
import { ConsentList } from "../../../components/consent-list";
import { documentHref } from "../../../lib/plan-builder/business-hub";
import { homepageHref, payBackHref } from "../../../lib/plan-builder/journey";
import { Spinner } from "../PlanLoading";
import { PPT_GENERATION_VERIFIED } from "../../../lib/plan-builder/deck-availability";
import { BUNDLE_PRODUCT_AMOUNT, DOMAIN_PRODUCT_AMOUNT, DOMAIN_PURCHASE_PRODUCT_AMOUNT, DOMAIN_PURCHASE_REGISTRATION_AMOUNT, HOMEPAGE_PRODUCT_AMOUNT, LAUNCH_PRICE_LABEL, PACKAGE_AMOUNT, REGEN_INCLUDED, REGEN_PACK_AMOUNT, REGEN_PACK_COUNT, REGEN_PACK_NAME } from "../../../lib/payments/domain";
import { normalizePurchaseDomain, validateRegistrant } from "../../../lib/landing/domain-purchase";
import { AddressSearchButton } from "../../../components/address-search";
import { DocLink } from "../../../components/doc-sheet";
import { hydrateFromServer, isSamplePlan, lastHydrationFailed } from "../../../lib/plan-builder/plan-store";
import { MISSING_BUSINESS_DETAIL, MISSING_BUSINESS_TITLE } from "../../../lib/plan-builder/missing-business";
import { fetchWithTimeout, koreanText } from "../../../lib/client/user-error";

type Phase = "idle" | "preparing" | "opening" | "error";

/** 결제 전 필수 확인(계좌이체 주문과 같은 항목). 서버(/api/payments/plan/prepare)도 모두 true인지 확인한다. */
const AGREEMENT_KEYS = ["service", "privacy", "aiLimitations", "refund", "digitalSupply", "personalizedDigitalNoRefund"] as const;
type Agreements = Record<(typeof AGREEMENT_KEYS)[number], boolean>;
const NO_AGREEMENTS: Agreements = { service: false, privacy: false, aiLimitations: false, refund: false, digitalSupply: false, personalizedDigitalNoRefund: false };

/** 상품별 제공 시점. 카드 결제는 승인 즉시 열린다(계좌이체처럼 관리자 확인을 기다리지 않는다). */
const SUPPLY: Record<string, string> = {
  plan: "결제가 승인되면 바로 이 사업계획서의 전체 항목이 열리고 이용이 시작돼요.",
  homepage: "결제가 승인되면 바로 홈페이지 수정·공개 기능이 열리고 이용이 시작돼요.",
  regen: `결제가 승인되면 바로 이 사업계획서에 ‘다시 생성’ ${REGEN_PACK_COUNT}회가 더해져요.`,
  bundle: "결제가 승인되면 바로 이 사업계획서의 전체 항목과 홈페이지 수정·공개 기능이 함께 열리고 이용이 시작돼요.",
  domain: "결제가 승인되면 바로 도메인 연결 기능이 열리고 1년 호스팅 기간이 시작돼요.",
  "domain-purchase": "결제가 승인되면 1년 호스팅 기간이 시작되고, 아래 명의자 이름으로 도메인을 등록해 연결 준비를 마칩니다(.com 은 보통 몇 분, .kr·.co.kr 은 영업일 1~2일).",
  tokens: "결제가 승인되면 바로 AI 수정 토큰이 충전되며, 충전일부터 1년 동안 쓸 수 있어요.",
};

declare global {
  interface Window {
    AUTHNICE?: { requestPay: (options: Record<string, unknown>) => void };
  }
}

/**
 * 결제 시작 화면.
 * 주문번호·금액은 서버가 정하고(/api/payments/plan/prepare), 여기서는 결제창만 연다.
 * 승인은 returnUrl(/api/payments/plan/return)에서 서버가 처리한다.
 */
export default function PlanCheckout({ receiptByEmail = false }: { receiptByEmail?: boolean }) {
  // 어느 문서를 여는 결제인지 — 관문에서 붙여 보낸다
  const params = useSearchParams();
  const planId = params.get("planId") ?? "";
  const planType = params.get("planType") ?? "";
  /* 돌아갈 곳은 그 사업의 계획서 — 옛 '플랜 개요'로 보내지 않는다 */
  const planHref = planId ? documentHref(planId) : "/plan";
  // 계획서 결제와 홈페이지 결제는 같은 화면을 쓰되 금액과 안내가 다르다
  const isHomepage = params.get("product") === "homepage";
  /* 다시 생성 묶음 — 문서를 여는 결제가 아니라 횟수만 더한다 */
  const isRegen = params.get("product") === "regen";
  /* 홈페이지 부가 상품 — 도메인 연결+호스팅 1년 / AI 수정 토큰. 둘 다 홈페이지가 열린 뒤에만 */
  const isDomain = params.get("product") === "domain";
  /* 도메인 구매 대행 — 살 주소(domain)가 함께 온다 */
  const isDomainPurchase = params.get("product") === "domain-purchase";
  const purchaseDomain = isDomainPurchase ? normalizePurchaseDomain(params.get("domain") ?? "") : null;
  const isTokens = params.get("product") === "tokens";
  /* 주력 묶음 — 계획서 + 홈페이지를 한 번에 연다 */
  const isBundle = params.get("product") === "bundle";
  const product = isRegen ? "regen" : isHomepage ? "homepage" : isDomain ? "domain" : isDomainPurchase ? "domain-purchase" : isTokens ? "tokens" : isBundle ? "bundle" : "plan";
  const COPY: Record<string, { title: string; desc: string; price: number; unit: string }> = {
    bundle: { title: "사업계획서 + 홈페이지 함께 열기", desc: `이 사업의 사업계획서 전체 항목과 PDF·Word 내려받기(항목별 ‘다시 생성’ ${REGEN_INCLUDED}회 포함), 그리고 계획서로 만든 홈페이지의 수정·공개가 함께 열려요. 따로 사면 ${(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT).toLocaleString("ko-KR")}원이에요.`, price: BUNDLE_PRODUCT_AMOUNT, unit: "사업계획서 1부 + 홈페이지 1개 · 1회 결제" },
    domain: { title: "내 도메인 연결하고 1년 호스팅", desc: "가비아 등에서 산 도메인(예: mybusiness.kr)을 이 홈페이지에 연결해요. 1년 동안 호스팅·보안 인증서·연결 관리를 맡아 드려요.", price: DOMAIN_PRODUCT_AMOUNT, unit: "홈페이지 1개 · 1년" },
    "domain-purchase": { title: purchaseDomain ? `${purchaseDomain} 사서 연결하기` : "도메인 구매하고 연결하기", desc: `원하는 주소를 이용자 명의로 등록하고 이 홈페이지에 연결해요. 첫해 등록비(${DOMAIN_PURCHASE_REGISTRATION_AMOUNT.toLocaleString("ko-KR")}원)와 1년 동안의 호스팅·보안 인증서·연결 관리가 포함돼요.`, price: DOMAIN_PURCHASE_PRODUCT_AMOUNT, unit: "주소 1개 · 1년" },
    /* 다시 생성 묶음 — 예전엔 여기 없어서 '이 문서 전체 열기 · 49,000원'이 보였다(실제 결제는 이 금액) */
    regen: { title: `${REGEN_PACK_NAME} 추가`, desc: `이 사업계획서의 ‘다시 생성’ 횟수가 ${REGEN_PACK_COUNT}회 더해져요. 대화로 바꾼 내용을 계획서에 다시 반영할 때 써요.`, price: REGEN_PACK_AMOUNT, unit: `${REGEN_PACK_COUNT}회 · 이 사업계획서` },
    tokens: { title: "AI 수정 토큰 20만 충전", desc: "‘전부 우리 가게 말투로’, ‘가격을 25,000원으로’처럼 말하면 AI가 페이지 글을 고쳐요. 20만 토큰은 페이지 전체 고치기 25회 안팎이에요.", price: 9900, unit: "20만 토큰 · 쓴 만큼 차감" },
  };
  const extra = COPY[product];
  /* '나중에 하기'는 머리줄 ← 와 같은 곳 — 그 사업의 계획서, 홈페이지 쪽 상품이면 그 사업의 홈페이지 */
  const laterHref = payBackHref(product, planId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [agreements, setAgreements] = useState<Agreements>(NO_AGREEMENTS);
  const agreed = AGREEMENT_KEYS.every(key => agreements[key]);
  const agreedCount = AGREEMENT_KEYS.filter(key => agreements[key]).length;
  /* 아래 고정 결제 줄 — 동의 전에 누르면 동의 목록으로 데려가 알려 준다(예전엔 단추가 꺼져 있어 왜 안 눌리는지 몰랐다) */
  const consentRef = useRef<HTMLDivElement | null>(null);
  const [nudge, setNudge] = useState(false);
  // 부드러운 스크롤·다음 그림 기다리기는 화면이 가려진 탭 등에서 멈춘다 — 안내 글이 들어간 직후 바로 옮긴다
  const askAgree = () => { setNudge(true); window.setTimeout(() => consentRef.current?.scrollIntoView({ block: "start" }), 0); };
  const [message, setMessage] = useState<string | null>(null);
  /* 결제를 아직 열지 않아 거절된 경우 — 안내 옆에 고객센터 길을 붙인다(서버 오류 코드는 그대로 둔다) */
  const [paymentsClosed, setPaymentsClosed] = useState(false);
  /* 결제를 시작하지 못하면 초점을 안내 글로 — 아래 고정 줄의 글은 화면 낭독기·키보드 사용자가 놓쳤다(감사 2026-10-23) */
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (phase === "error" && message) errorRef.current?.focus({ preventScroll: true });
  }, [phase, message]);
  /* 결제 안내 문자 받을 휴대폰(선택) — 비우면 계정 이메일로만 안내한다 */
  const [noticePhone, setNoticePhone] = useState("");
  const phoneDigits = noticePhone.replace(/[\s-]/g, "");
  const phoneInvalid = phoneDigits !== "" && !/^010\d{8}$/.test(phoneDigits);
  /* 도메인 명의자 — 이용자 명의 등록에 필요(예전엔 결제 뒤 이메일로 받았다). .com 은 결제 직후 자동 등록 */
  const [registrant, setRegistrant] = useState({ name: "", phone: "", postalCode: "", address: "", addressDetail: "" });
  const registrantCheck = isDomainPurchase ? validateRegistrant(registrant) : null;
  const pickAddress = useCallback((picked: { postalCode: string; address: string }) => setRegistrant(current => ({ ...current, postalCode: picked.postalCode, address: picked.address })), []);
  const setReg = (key: keyof typeof registrant) => (event: { target: { value: string } }) => setRegistrant(current => ({ ...current, [key]: event.target.value }));
  const [info, setInfo] = useState<{ price: number; productName: string; paid: boolean; payable: boolean; authenticated: boolean; unavailable?: boolean } | null>(null);
  const [homepageInfo, setHomepageInfo] = useState<{ price: number; editable: boolean } | null>(null);
  const started = useRef(false);
  /* 결제 정보를 아예 받지 못함 — 예전엔 '확인하는 중…'에서 영원히 돌았다. 다시 확인 단추를 보인다 */
  const [infoFailed, setInfoFailed] = useState(false);
  const [infoAttempt, setInfoAttempt] = useState(0);
  /* 주소의 사업이 내 사업 목록에 있는지 — 목록을 못 불러왔으면 없다고 하지 않는다 */
  const [missingPlan, setMissingPlan] = useState(false);
  useEffect(() => {
    if (!planId || isSamplePlan(planId)) return;
    let alive = true;
    hydrateFromServer(false).then(state => {
      if (alive && !lastHydrationFailed() && !state.plans.some(plan => plan.id === planId)) setMissingPlan(true);
    }).catch(() => { /* 확인하지 못했으면 결제 화면을 그대로 둔다(서버가 결제 때 다시 확인한다) */ });
    return () => { alive = false; };
  }, [planId]);
  /*
   * 앱(아이폰·안드로이드) 안에서는 스토어 결제(인앱결제)로만 판다 — 스토어 규칙상 앱 안 디지털 상품은 카드 결제창을 띄울 수 없다.
   * 도메인은 앱에서 팔지 않는다(lib/payments/iap-products.ts).
   */
  const [native, setNative] = useState<"ios" | "android" | null>(null);
  useEffect(() => { setNative(nativePlatform()); }, []);
  const appSellable = product === "plan" || product === "bundle" || product === "homepage" || product === "regen";

  useEffect(() => {
    let alive = true;
    setInfoFailed(false);
    fetchWithTimeout(`/api/plan/access?planType=${encodeURIComponent(planType)}&planId=${encodeURIComponent(planId)}`)
      /* 오류 응답(JSON 이어도)은 실패로 — 가격 없이 그리면 화면이 깨졌다 */
      .then((r) => { if (!r.ok) throw new Error("access"); return r.json(); })
      .then((d) => {
        if (alive) setInfo({ price: d.price, productName: d.productName, paid: d.paid, payable: d.payable, authenticated: d.authenticated, unavailable: d.unavailable === true });
      })
      .catch(() => {
        if (alive) { setInfo(null); setInfoFailed(true); }
      });
    if ((isHomepage || isBundle || product === "plan") && planId) {
      // 홈페이지 가격·구매 여부는 홈페이지 API가 안다 — 계획서·묶음 화면도 묶음 권유를 정하려고 함께 본다
      fetchWithTimeout(`/api/plan/landing?planId=${encodeURIComponent(planId)}`)
        .then((r) => { if (!r.ok) throw new Error("landing"); return r.json(); })
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
  }, [infoAttempt]);

  async function startPayment() {
    if (started.current || !agreed) return;
    if (phoneInvalid) { setPhase("error"); setMessage("휴대폰 번호를 010으로 시작하는 11자리로 적어 주세요. 비워 둬도 결제할 수 있어요."); return; }
    if (registrantCheck && !registrantCheck.ok) { setPhase("error"); setMessage(registrantCheck.message); return; }
    started.current = true;
    setPhase("preparing");
    setMessage(null);
    setPaymentsClosed(false);
    try {
      const res = await fetch("/api/payments/plan/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, planType, ...(product !== "plan" ? { product } : {}), ...(purchaseDomain ? { domain: purchaseDomain } : {}), ...(phoneDigits ? { noticePhone: phoneDigits } : {}), ...(registrantCheck?.ok ? { registrant: registrantCheck.value } : {}), terms: agreements }),
      });
      const data = (await res.json()) as {
        clientId?: string; sdkUrl?: string; orderId?: string; amount?: number; goodsName?: string; buyerEmail?: string | null;
        error?: string; message?: string;
      };
      if (!res.ok || !data.clientId || !data.orderId) {
        setPhase("error");
        setPaymentsClosed(data.error === "payments_unavailable" || data.error === "paid_launch_blocked");
        setMessage(koreanText(data.message, "결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요."));
        started.current = false;
        return;
      }

      await loadNicepaySdk(data.sdkUrl);
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
          setMessage(koreanText(result?.errorMsg ?? result?.resultMsg, "결제가 취소됐어요."));
          started.current = false;
        },
      });
    } catch {
      setPhase("error");
      setMessage("결제창을 여는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
      started.current = false;
    }
  }

  /* 앱 결제: 서버가 규칙을 보고(시작) → 스토어 결제창 → 서버가 영수증 확인·반영(완료) → 아이폰은 거래 마무리 → 결제한 곳으로 */
  async function startAppPayment() {
    if (started.current || !agreed || !native) return;
    started.current = true;
    setPhase("preparing");
    setMessage(null);
    setPaymentsClosed(false);
    try {
      const startRes = await fetch("/api/payments/iap/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, product, terms: agreements }) });
      const start = (await startRes.json().catch(() => ({}))) as { productId?: string; appAccountToken?: string; message?: string; error?: string };
      if (!startRes.ok || !start.productId || !start.appAccountToken) {
        setPhase("error"); setPaymentsClosed(start.error === "paid_launch_blocked"); setMessage(koreanText(start.message, "결제를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.")); started.current = false; return;
      }
      setPhase("opening");
      let purchase: Awaited<ReturnType<typeof nativePurchase>>;
      try {
        purchase = await nativePurchase(start.productId, start.appAccountToken);
      } catch (error) {
        const text = error instanceof Error ? error.message : "";
        // 결제창을 닫은 경우는 오류로 보이지 않는다
        if (/cancel|취소/i.test(text)) { setPhase("idle"); started.current = false; return; }
        throw error;
      }
      const doneRes = await fetch("/api/payments/iap/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: native, product, planId, planType, jws: purchase.jws, purchaseToken: purchase.purchaseToken }) });
      const done = (await doneRes.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!doneRes.ok || !done.ok) {
        setPhase("error"); setMessage(koreanText(done.message, "결제는 됐지만 반영하지 못했어요. 앱을 다시 열면 다시 시도해요.")); started.current = false; return;
      }
      if (native === "ios") await finishNativePurchase(purchase.transactionId).catch(() => undefined);
      window.location.assign(laterHref);
    } catch {
      setPhase("error");
      setMessage("결제창을 여는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
      started.current = false;
    }
  }

  /* 결제 여부를 확인하지 못했으면 결제를 권하지 않는다 — 이미 산 사람이 두 번 결제하지 않게 */
  if (info?.unavailable && info.authenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><AlertCircle size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>결제 상태를 확인하지 못했어요</h1>
          <p className={styles.desc}>이미 결제했을 수도 있어요. 잠시 후 다시 확인해 주세요. 결제는 아직 진행되지 않았어요.</p>
          <button type="button" className={styles.primary} onClick={() => window.location.reload()}>다시 확인하기</button>
          <Link href={planHref} className={styles.back}>← 사업계획서로 돌아가기</Link>
        </div>
      </div>
    );
  }

  if (info && !info.authenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><LogIn size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>로그인이 필요해요</h1>
          <p className={styles.desc}>로그인하면 이 화면으로 돌아와요.</p>
          <Link href={`/account?next=${encodeURIComponent(`/plan/pay?${params.toString()}`)}`} className={`${styles.primary} ${styles.nav}`}>로그인 · 회원가입<ChevronRight size={18} aria-hidden="true" /></Link>
          <Link href={laterHref} className={styles.back}>← 나중에 하기</Link>
        </div>
      </div>
    );
  }

  /*
   * 주소의 사업이 내 사업 목록에 없다(지웠거나 다른 계정 것) — '이미 열려 있어요'·결제 대신 다른 화면과 같은 말로.
   * 사업 번호(planId) 없이 들어온 경우도 같다 — 예전엔 '이 사업계획서는 이미 열려 있어요'가 떴다(감사 2026-10-23).
   * 잠긴 자물쇠가 열린 그림 대신 알림 그림을 쓴다(결제로 열린 게 아니다).
   */
  if (missingPlan || !planId) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><AlertCircle size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>{MISSING_BUSINESS_TITLE}</h1>
          <p className={styles.desc}>{MISSING_BUSINESS_DETAIL} 결제는 진행되지 않았어요.</p>
          <Link href="/plan" className={`${styles.primary} ${styles.nav}`}>내 사업으로<ChevronRight size={18} aria-hidden="true" /></Link>
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
  /* 도메인·토큰·다시 생성은 '이미 샀다'는 개념이 없다(서버가 중복·갱신 시점을 따로 판정) */
  /* 묶음은 계획서나 홈페이지 중 하나라도 이미 있으면 살 수 없다(서버 기준과 같게) — 동의를 다 받은 뒤 거절하지 않게 미리 알린다 */
  const bundleBlocked = isBundle && (info?.paid === true || homepageInfo?.editable === true);
  const bothOwned = info?.paid === true && homepageInfo?.editable === true;
  const alreadyOwned = bundleBlocked ? true : extra || isRegen ? false : isHomepage ? homepageInfo?.editable === true : info?.paid === true;

  /* 홈페이지 단독 가격은 그 사업의 계획서를 결제한 분 전용(서버도 같은 기준으로 막는다) — 아직이면 묶음으로 안내한다 */
  if (isHomepage && planId && info && !info.unavailable && info.paid === false && homepageInfo?.editable !== true) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><Unlock size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>홈페이지는 사업계획서와 함께 열어요</h1>
          <p className={styles.desc}>홈페이지 단독 {HOMEPAGE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원은 이 사업의 사업계획서를 결제한 분 전용이에요. 사업계획서 + 홈페이지를 {BUNDLE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원에 함께 결제해 주세요.</p>
          <Link href={`/plan/pay?${new URLSearchParams({ planId, planType, product: "bundle" }).toString()}`} className={`${styles.primary} ${styles.nav}`}>사업계획서 + 홈페이지 결제하기<ChevronRight size={18} aria-hidden="true" /></Link>
          <Link href={laterHref} className={styles.back}>← 나중에 하기</Link>
        </div>
      </div>
    );
  }

  if (isDomainPurchase && !purchaseDomain) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><AlertCircle size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>살 주소를 먼저 골라 주세요</h1>
          <p className={styles.desc}>홈페이지 화면 아래 ‘내 도메인 연결’에서 원하는 주소(.com·.kr·.co.kr)가 비어 있는지 확인한 뒤 결제할 수 있어요.</p>
          <Link href={laterHref} className={`${styles.primary} ${styles.nav}`}>홈페이지로 돌아가기<ChevronRight size={18} aria-hidden="true" /></Link>
        </div>
      </div>
    );
  }

  if (alreadyOwned) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><CheckCircle2 size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>{bundleBlocked && bothOwned ? "사업계획서와 홈페이지가 모두 열려 있어요" : bundleBlocked ? "묶음 대신 남은 상품만 결제해 주세요" : isHomepage ? "홈페이지는 이미 열려 있어요" : "이 사업계획서는 이미 열려 있어요"}</h1>
          <p className={styles.desc}>{bundleBlocked && bothOwned ? "따로 결제할 것이 없어요." : bundleBlocked ? `${info?.paid ? "사업계획서" : "홈페이지"}는 이미 열려 있어요. ${info?.paid ? "홈페이지" : "사업계획서"}만 따로 결제하면 돼요.` : isHomepage ? "결제가 확인돼서 사진·글·버튼을 고치고 공개할 수 있어요." : "결제가 확인돼서 전체 항목을 쓸 수 있어요."}</p>
          {bundleBlocked && !bothOwned && planId && <Link href={`/plan/pay?${new URLSearchParams({ planId, planType, ...(info?.paid ? { product: "homepage" } : {}) }).toString()}`} className={`${styles.primary} ${styles.nav}`}>{info?.paid ? "홈페이지만 결제하기" : "사업계획서만 결제하기"}<ChevronRight size={18} aria-hidden="true" /></Link>}
          <Link href={isHomepage ? (planId ? homepageHref(planId) : "/plan/homepage") : planHref} className={bundleBlocked ? styles.back : `${styles.primary} ${styles.nav}`}>{bundleBlocked ? "← " : null}{isHomepage ? "홈페이지 에디터 열기" : "사업계획서로 돌아가기"}{bundleBlocked ? null : <ChevronRight size={18} aria-hidden="true" />}</Link>
        </div>
      </div>
    );
  }

  const payAmount: number | null = extra ? extra.price : isHomepage ? (homepageInfo?.price ?? HOMEPAGE_PRODUCT_AMOUNT) : info ? info.price : null;
  /*
   * 지금 이 화면에서 결제할 수 없는 경우 — 결제 줄·결제 뒤 안내를 빼고 짧은 안내와 돌아가기만 둔다.
   * 앱에서 팔지 않는 상품(도메인·토큰)은 '다른 곳에서 사라'고 안내하지 않는다(App Store 3.1.1).
   */
  const notSoldInApp = native !== null && !appSellable;
  const paymentsOff = native === null && info !== null && !info.payable;
  const blocked = notSoldInApp || paymentsOff;
  const storeName = native === "android" ? "Google Play" : "Apple(App Store)";
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">{blocked ? <AlertCircle size={30} strokeWidth={1.8} /> : <Unlock size={30} strokeWidth={1.8} />}</div>
        <h1 className={styles.title}>{extra ? extra.title : isHomepage ? "홈페이지 수정하고 공개하기" : "사업계획서 전체 열기"}</h1>
        <p className={styles.desc}>
          {extra ? extra.desc : isHomepage ? (
            <>
              계획서 내용으로 만든 홈페이지를 직접 고치고 인터넷에 공개할 수 있어요.
            </>
          ) : (
            <>
              {/* 문서 종류를 고르는 화면은 없어졌다 — 종류 이름(planType)이나 '다른 유형' 안내 대신 이 사업의 계획서로 말한다 */}
              이 사업의 사업계획서 전체 항목이 열리고, 완성 후 {PPT_GENERATION_VERIFIED ? "PDF·Word·발표용 PPT" : "PDF·Word"}로 내려받을 수 있어요.
              {!PPT_GENERATION_VERIFIED && " PPT 자동 생성은 준비 중이라 이번 결제에는 들어가지 않아요."}
              {" "}항목별 ‘다시 생성’ {REGEN_INCLUDED}회가 포함돼요.
            </>
          )}
        </p>

        {!notSoldInApp && (product === "plan" || product === "homepage" || product === "bundle") && <p className={styles.launchTag}><StatusBadge tone="info">{LAUNCH_PRICE_LABEL}</StatusBadge></p>}
        {notSoldInApp ? null : extra ? (
          <div className={styles.price}>
            {extra.price.toLocaleString("ko-KR")}원
            <span>{extra.unit} · 부가세 포함</span>
          </div>
        ) : infoFailed ? (
          /* 홈페이지 상품도 결제 여부를 못 받았으면 알린다 — 예전엔 가격만 보이고 실패가 드러나지 않았다(점검 r41-A) */
          <div className={styles.price} role="alert">
            <span>결제 정보를 확인하지 못했어요. 연결을 확인해 주세요.</span>
            <button type="button" className={styles.retry} onClick={() => setInfoAttempt((n) => n + 1)}>다시 확인하기</button>
          </div>
        ) : isHomepage ? (
          <div className={styles.price}>
            {(homepageInfo?.price ?? HOMEPAGE_PRODUCT_AMOUNT).toLocaleString("ko-KR")}원
            <span>홈페이지 1개 · 1회 결제 · 부가세 포함</span>
          </div>
        ) : info ? (
          <div className={styles.price}>
            {info.price.toLocaleString("ko-KR")}원
            <span>사업계획서 1부 · 1회 결제 · 부가세 포함</span>
            {!info.paid && homepageInfo?.editable !== true && <Link className={styles.upsell} href={`/plan/pay?${new URLSearchParams({ planId, planType, product: "bundle" }).toString()}`}>홈페이지까지 함께 열면 {BUNDLE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원 <small>따로 사면 {(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT).toLocaleString("ko-KR")}원</small><ChevronRight size={18} aria-hidden="true" /></Link>}
          </div>
        ) : (
          /* 가격 확인 전 — 자리를 비워두면 화면이 덜컥거린다 */
          <div className={styles.price} aria-busy="true" role="status">
            <Spinner />
            <span>결제 정보를 확인하는 중…</span>
          </div>
        )}

        {/* 앱 결제(애플·구글)는 웹 카드 결제(나이스페이) 설정과 상관없다 — 웹 결제가 꺼져 있어도 앱에서는 동의 항목을 보여야 '앱에서 결제하기'가 켜진다 */}
        {(native ? appSellable : !(info && !info.payable)) && (
          <section className={styles.terms} aria-label="결제 전 필수 확인">
            <p className={styles.supply}><strong>제공 시점</strong>{SUPPLY[product]}</p>
            {isDomainPurchase ? <fieldset className={styles.registrant}>
              <legend>도메인 명의자 <small>(도메인은 이 분 이름으로 등록돼요)</small></legend>
              <label className={styles.phone}><span>이름(실명)</span><input autoComplete="name" value={registrant.name} onChange={setReg("name")} placeholder="홍길동" /></label>
              <label className={styles.phone}><span>휴대폰</span><input type="tel" inputMode="numeric" autoComplete="tel" value={registrant.phone} onChange={setReg("phone")} placeholder="01012345678" maxLength={13} /></label>
              {/* 주소는 카카오 우편번호 검색으로 채운다(오타·우편번호 누락 방지) — 못 불러오면 손으로 적어도 된다 */}
              <div className={styles.registrantRow}>
                <label className={styles.phone}><span>우편번호</span><input inputMode="numeric" autoComplete="postal-code" value={registrant.postalCode} onChange={setReg("postalCode")} placeholder="03900" maxLength={5} /></label>
                <div className={styles.phone}><span>주소</span><AddressSearchButton onPick={pickAddress} label={registrant.address ? "다시 검색" : "주소 검색"} /></div>
              </div>
              <label className={styles.phone}><input aria-label="주소" autoComplete="street-address" value={registrant.address} onChange={setReg("address")} placeholder="주소 검색을 누르면 채워져요" /></label>
              <label className={styles.phone}><span>상세 주소 <small>(선택)</small></span><input value={registrant.addressDetail} onChange={setReg("addressDetail")} placeholder="2층 201호" /></label>
              <small>등록기관(도메인 관리 기관)에 그대로 전달돼요. 사업자등록증의 주소와 같으면 좋아요.</small>
            </fieldset> : null}
            {/* 결제 안내 문자는 카드 결제용 — 앱 결제는 스토어가 영수증을 보낸다 */}
            {!native && <label className={styles.phone}>
              <span>결제 안내 받을 휴대폰 <small>(선택)</small></span>
              <input type="tel" inputMode="numeric" autoComplete="tel" placeholder="01012345678" maxLength={13} value={noticePhone} onChange={event => setNoticePhone(event.target.value)} aria-invalid={phoneInvalid} />
              <small>{phoneInvalid ? "010으로 시작하는 11자리로 적어 주세요." : `결제 완료 문자 1회${receiptByEmail ? " · 영수증은 가입한 이메일로도 가요" : ""}`}</small>
            </label>}
            {/* 약관 동의 — 공용 동의 목록(동그란 체크·(필수)·›, 대표 요청 2026-10-16). 환불 제한처럼 꼭 읽어야 할 설명은 그 줄 아래에 그대로 */}
            <div ref={consentRef} className={styles.consentAnchor}>
            {nudge && !agreed ? <p className={styles.nudge} role="alert">필수 항목에 모두 동의해 주세요</p> : null}
            <ConsentList className={styles.consentList} allLabel="필수 항목 전체동의" items={[
              { key: "service", label: "이용약관 동의", href: "/terms" },
              { key: "privacy", label: "개인정보 수집·이용 동의", href: "/privacy" },
              { key: "aiLimitations", label: "인공지능·국외 처리 안내 확인", href: "/ai-notice" },
              { key: "refund", label: "취소·환불 기준 동의", href: "/refund" },
              { key: "digitalSupply", label: "결제 즉시 디지털 콘텐츠 제공 시작 확인" },
              { key: "personalizedDigitalNoRefund", ...(native && (product === "plan" || product === "bundle" || product === "homepage") ? (
                  /* 앱 결제 — 환불은 스토어가 한다. 직접 환불을 약속하지 않는다 */
                  { label: "제공 시작 후 단순 변심 환불 제한에 동의", note: <>결제가 확인되면 바로 내 사업에 맞춘 디지털 콘텐츠 제공이 시작되므로, 전자상거래법 제17조 제2항에 따라 단순 변심에 따른 청약철회가 제한돼요. 앱에서 결제한 주문의 환불은 {storeName}에 신청해요.</> }
                ) : native && product === "regen" ? (
                  { label: "추가 횟수 환불 기준에 동의", note: <>앱에서 결제한 주문의 환불은 {storeName}에 신청해요. 환불 여부는 스토어 기준에 따라요.</> }
                ) : product === "regen" ? (
                  { label: "추가 횟수 환불 기준에 동의", note: <>사용하지 않은 횟수는 결제일부터 7일 이내에 전액 환불을 요청할 수 있고, 일부라도 사용했다면 남은 횟수에 해당하는 금액을 환불합니다.</> }
                ) : product === "domain-purchase" ? (
                  { label: "도메인 구매·연결 환불 기준에 동의", note: <>도메인을 등록하기 전에는 전액 환불합니다. 등록한 뒤에는 첫해 등록비 {DOMAIN_PURCHASE_REGISTRATION_AMOUNT.toLocaleString("ko-KR")}원을 뺀 {DOMAIN_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원에 연결·호스팅 환불 기준(연결 완료 후 7일 이내 전액, 그 뒤 남은 개월 수만큼 월할)을 적용합니다. 등록한 도메인은 이용자 명의이며, 환불하거나 해지해도 도메인은 이용자에게 남습니다. 등록을 위해 등록 명의자 이름·이메일·연락처·주소를 도메인 등록기관(.com 은 Cloudflare, Inc.(미국), .kr·.co.kr 은 ㈜가비아 등)에 제공하는 데 동의합니다.</> }
                ) : product === "domain" ? (
                  { label: "도메인 연결 환불 기준에 동의", note: <>연결을 완료하기 전이나 연결 완료 후 7일 이내에는 전액 환불하고, 그 이후에는 남은 개월 수만큼 월할로 환불합니다(사용한 달은 한 달로 계산, 수수료 없음). 가비아 등에서 직접 구매한 도메인 등록비는 환불 대상이 아닙니다.</> }
                ) : product === "tokens" ? (
                  { label: "AI 수정 토큰 유효기간·환불 기준에 동의", note: <>토큰은 충전일부터 1년 동안 이 홈페이지에서 사용할 수 있고, 기간이 지나면 남은 토큰은 소멸합니다. 사용하지 않았다면 7일 이내 전액 환불하고, 일부 사용했다면 유효기간 안에서 남은 토큰 비율만큼 환불합니다.</> }
                ) : (
                  { label: "제공 시작 후 단순 변심 환불 제한에 동의", note: <>결제가 승인되면 바로 내 사업에 맞춘 디지털 콘텐츠 제공이 시작되므로, 전자상거래법 제17조 제2항에 따라 단순 변심에 따른 청약철회가 제한됩니다. 제공된 내용에 하자가 있거나 표시·광고와 다르게 제공된 경우에는 관계 법령에 따라 환불받을 수 있습니다.</> }
                )) },
            ]} values={agreements} onChange={(next) => setAgreements({ ...NO_AGREEMENTS, ...next } as Agreements)} />
            </div>
            <p className={styles.disclaimer}>제공 자료는 사업 기획과 실행 준비를 돕는 초안이며 사업 성공, 수익, 투자 유치나 지원사업 선정을 보장하지 않습니다. <DocLink className={styles.infoLink} href="/business-info" title="판매자·사업자 정보">판매자·사업자 정보</DocLink></p>
          </section>
        )}

        {/* 결제 단추는 화면 아래에 늘 붙여 둔다(네이버페이처럼) — 동의 항목이 길어 단추를 찾으려면 한참 내려야 했다(대표 요청 2026-10-16) */}
        {blocked ? (
          <>
            {/* 결제를 아직 열지 않았을 때(출시 전·결제 설정 전) — '잠시 후 다시'는 기다리면 될 것처럼 읽혔다(감사 2026-10-23) */}
            <p className={styles.notice} role="status">{notSoldInApp ? "이 상품은 앱에서 결제할 수 없어요." : <>아직 결제를 열기 전이에요 · <Link href="/account/support">고객센터</Link></>}</p>
            <Link href={laterHref} className={`${styles.primary} ${styles.nav} ${styles.blockedBack}`}>돌아가기<ChevronRight size={18} aria-hidden="true" /></Link>
          </>
        ) : (
          <div className={styles.payBar} data-pay-bar>
            {/* 결제를 시작하지 못한 이유 — 아래 고정 줄 안에 보여야 눌렀는데 아무 일도 없는 것처럼 보이지 않는다 */}
            {message ? <p ref={errorRef} tabIndex={-1} className={styles.payBarError} role="alert">{message}{paymentsClosed ? <> <Link href="/account/support">고객센터</Link></> : null}</p> : null}
            <div className={styles.payBarInner}>
              <p className={styles.payBarNote}>{agreed ? "약관과 결제 내용을 확인했어요" : `필수 항목 ${agreedCount}/${AGREEMENT_KEYS.length} 동의`}</p>
              <button
                type="button"
                className={styles.payBarButton}
                onClick={!agreed ? askAgree : native ? startAppPayment : startPayment}
                disabled={phase === "preparing" || phase === "opening" || (agreed && !native && registrantCheck !== null && !registrantCheck.ok)}
              >
                {phase === "preparing" ? <><Spinner /> 결제 준비 중…</> : phase === "opening" ? <><Spinner /> 결제창을 여는 중…</> : <>{payAmount !== null ? `${payAmount.toLocaleString("ko-KR")}원 ` : ""}{native ? "결제하기" : "카드로 결제하기"}</>}
              </button>
            </div>
          </div>
        )}

        {blocked ? null : <>
          {/*
            * 결제 뒤 할 일 — 도메인만 남긴다(직접 해야 할 일이 있다). 계획서·홈페이지·묶음 등은 위 '제공 시점'과 같은 말이라 걷었다(군더더기 점검 r37)
            */}
          {product === "domain" || product === "domain-purchase" ? <p className={styles.note}>
            {product === "domain" ? "결제가 끝나면 홈페이지 화면에서 가지고 있는 도메인의 www 주소를 넣고 ‘연결 시작’을 눌러요(홈페이지를 먼저 공개해야 해요). 도메인을 산 곳에서 안내대로 한 줄(CNAME)만 설정하면 보통 몇 분 안에 연결돼요."
              : "결제가 끝나면 적어 주신 명의자 이름으로 도메인을 등록해요(.com 은 보통 몇 분, .kr·.co.kr 은 영업일 1~2일). 진행 상황은 홈페이지 화면에서 볼 수 있어요."}
          </p> : null}
          <Link href={laterHref} className={styles.back}>← 나중에 하기</Link>
        </>}
      </div>
    </div>
  );
}
