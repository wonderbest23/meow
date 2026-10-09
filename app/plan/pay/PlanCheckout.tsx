"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loadNicepaySdk } from "../../../lib/payments/nicepay-sdk";
import { CheckCircle2, Unlock } from "lucide-react";
import styles from "./PlanCheckout.module.css";
import { documentHref } from "../../../lib/plan-builder/business-hub";
import { homepageHref, payBackHref } from "../../../lib/plan-builder/journey";
import { Spinner } from "../PlanLoading";
import { PPT_GENERATION_VERIFIED } from "../../../lib/plan-builder/deck-availability";
import { BUNDLE_PRODUCT_AMOUNT, DOMAIN_PRODUCT_AMOUNT, DOMAIN_PURCHASE_PRODUCT_AMOUNT, DOMAIN_PURCHASE_REGISTRATION_AMOUNT, HOMEPAGE_PRODUCT_AMOUNT, LAUNCH_PRICE_LABEL, PACKAGE_AMOUNT, REGEN_PACK_AMOUNT, REGEN_PACK_COUNT, REGEN_PACK_NAME } from "../../../lib/payments/domain";
import { normalizePurchaseDomain, validateRegistrant } from "../../../lib/landing/domain-purchase";
import { AddressSearchButton } from "../../../components/address-search";

type Phase = "idle" | "preparing" | "opening" | "error";

/** 결제 전 필수 확인(계좌이체 주문과 같은 항목). 서버(/api/payments/plan/prepare)도 모두 true인지 확인한다. */
const AGREEMENT_KEYS = ["service", "privacy", "aiLimitations", "refund", "digitalSupply", "personalizedDigitalNoRefund"] as const;
type Agreements = Record<(typeof AGREEMENT_KEYS)[number], boolean>;
const NO_AGREEMENTS: Agreements = { service: false, privacy: false, aiLimitations: false, refund: false, digitalSupply: false, personalizedDigitalNoRefund: false };

/** 상품별 제공 시점. 카드 결제는 승인 즉시 열린다(계좌이체처럼 관리자 확인을 기다리지 않는다). */
const SUPPLY: Record<string, string> = {
  plan: "결제가 승인되면 바로 이 문서의 전체 섹션이 열리고 이용이 시작됩니다.",
  homepage: "결제가 승인되면 바로 홈페이지 수정·공개 기능이 열리고 이용이 시작됩니다.",
  regen: `결제가 승인되면 바로 이 문서에 ‘다시 생성’ ${REGEN_PACK_COUNT}회가 더해집니다.`,
  bundle: "결제가 승인되면 바로 이 문서의 전체 섹션과 홈페이지 수정·공개 기능이 함께 열리고 이용이 시작됩니다.",
  domain: "결제가 승인되면 바로 도메인 연결 기능이 열리고 1년 호스팅 기간이 시작됩니다.",
  "domain-purchase": "결제가 승인되면 1년 호스팅 기간이 시작되고, 아래 명의자 이름으로 도메인을 등록해 연결 준비를 마칩니다(.com 은 보통 몇 분, .kr·.co.kr 은 영업일 1~2일).",
  tokens: "결제가 승인되면 바로 AI 수정 토큰이 충전되며, 충전일부터 1년 동안 사용할 수 있습니다.",
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
    bundle: { title: "사업계획서 + 홈페이지 함께 열기", desc: `이 문서 전체 섹션과 PDF·Word 내려받기, 그리고 계획서로 만든 홈페이지의 수정·공개가 함께 열립니다. 따로 사면 ${(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT).toLocaleString("ko-KR")}원이에요.`, price: BUNDLE_PRODUCT_AMOUNT, unit: "문서 1부 + 홈페이지 1개 · 1회 결제" },
    domain: { title: "내 도메인 연결하고 1년 호스팅", desc: "가비아 등에서 산 도메인(예: mybusiness.kr)을 이 홈페이지에 연결합니다. 1년 동안 호스팅·보안 인증서·연결 관리를 맡아 드립니다.", price: DOMAIN_PRODUCT_AMOUNT, unit: "홈페이지 1개 · 1년" },
    "domain-purchase": { title: purchaseDomain ? `${purchaseDomain} 사서 연결하기` : "도메인 구매하고 연결하기", desc: `원하는 주소를 이용자 명의로 등록하고 이 홈페이지에 연결합니다. 첫해 등록비(${DOMAIN_PURCHASE_REGISTRATION_AMOUNT.toLocaleString("ko-KR")}원)와 1년 동안의 호스팅·보안 인증서·연결 관리가 포함됩니다.`, price: DOMAIN_PURCHASE_PRODUCT_AMOUNT, unit: "주소 1개 · 1년" },
    /* 다시 생성 묶음 — 예전엔 여기 없어서 '이 문서 전체 열기 · 49,000원'이 보였다(실제 결제는 이 금액) */
    regen: { title: `${REGEN_PACK_NAME} 추가`, desc: `이 문서의 ‘다시 생성’ 횟수가 ${REGEN_PACK_COUNT}회 더해집니다. 대화로 바꾼 내용을 계획서에 다시 반영할 때 씁니다.`, price: REGEN_PACK_AMOUNT, unit: `${REGEN_PACK_COUNT}회 · 이 문서` },
    tokens: { title: "AI 수정 토큰 20만 충전", desc: "‘전부 우리 가게 말투로’, ‘가격을 25,000원으로’ 처럼 말하면 AI 가 페이지 글을 고칩니다. 20만 토큰은 페이지 전체 고치기 25회 안팎입니다.", price: 9900, unit: "20만 토큰 · 쓴 만큼 차감" },
  };
  const extra = COPY[product];
  /* '나중에 하기'는 머리줄 ← 와 같은 곳 — 그 사업의 계획서, 홈페이지 쪽 상품이면 그 사업의 홈페이지 */
  const laterHref = payBackHref(product, planId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [agreements, setAgreements] = useState<Agreements>(NO_AGREEMENTS);
  const agreed = AGREEMENT_KEYS.every(key => agreements[key]);
  const toggle = (key: keyof Agreements) => setAgreements(current => ({ ...current, [key]: !current[key] }));
  const [message, setMessage] = useState<string | null>(null);
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

  useEffect(() => {
    let alive = true;
    setInfoFailed(false);
    fetch(`/api/plan/access?planType=${encodeURIComponent(planType)}&planId=${encodeURIComponent(planId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setInfo({ price: d.price, productName: d.productName, paid: d.paid, payable: d.payable, authenticated: d.authenticated, unavailable: d.unavailable === true });
      })
      .catch(() => {
        if (alive) { setInfo(null); setInfoFailed(true); }
      });
    if ((isHomepage || isBundle || product === "plan") && planId) {
      // 홈페이지 가격·구매 여부는 홈페이지 API가 안다 — 계획서·묶음 화면도 묶음 권유를 정하려고 함께 본다
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
  }, [infoAttempt]);

  async function startPayment() {
    if (started.current || !agreed) return;
    if (phoneInvalid) { setPhase("error"); setMessage("휴대폰 번호를 010으로 시작하는 11자리로 적어 주세요. 비워 둬도 결제할 수 있어요."); return; }
    if (registrantCheck && !registrantCheck.ok) { setPhase("error"); setMessage(registrantCheck.message); return; }
    started.current = true;
    setPhase("preparing");
    setMessage(null);
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
        setMessage(data.message ?? "결제를 시작하지 못했습니다.");
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

  /* 결제 여부를 확인하지 못했으면 결제를 권하지 않는다 — 이미 산 사람이 두 번 결제하지 않게 */
  if (info?.unavailable && info.authenticated) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><Unlock size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>결제 상태를 확인하지 못했어요</h1>
          <p className={styles.desc}>이미 결제했을 수도 있어요. 잠시 후 다시 확인해 주세요. 결제는 아직 진행되지 않았습니다.</p>
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
          <div className={styles.icon} aria-hidden="true"><Unlock size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>로그인이 필요합니다</h1>
          <p className={styles.desc}>결제 내역을 계정에 남기기 위해 먼저 로그인해 주세요. 로그인하면 이 화면으로 돌아옵니다.</p>
          <Link href={`/account?next=${encodeURIComponent(`/plan/pay?${params.toString()}`)}`} className={styles.primary}>로그인 · 회원가입</Link>
          <Link href={laterHref} className={styles.back}>← 나중에 하기</Link>
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
          <Link href={`/plan/pay?${new URLSearchParams({ planId, planType, product: "bundle" }).toString()}`} className={styles.primary}>사업계획서 + 홈페이지 결제하기</Link>
          <Link href={laterHref} className={styles.back}>← 나중에 하기</Link>
        </div>
      </div>
    );
  }

  if (isDomainPurchase && !purchaseDomain) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><Unlock size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>살 주소를 먼저 골라 주세요</h1>
          <p className={styles.desc}>홈페이지 화면 아래 ‘내 도메인 연결’에서 원하는 주소(.com·.kr·.co.kr)가 비어 있는지 확인한 뒤 결제할 수 있어요.</p>
          <Link href={laterHref} className={styles.primary}>홈페이지로 돌아가기</Link>
        </div>
      </div>
    );
  }

  if (alreadyOwned) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.icon} aria-hidden="true"><CheckCircle2 size={30} strokeWidth={1.8} /></div>
          <h1 className={styles.title}>{bundleBlocked && bothOwned ? "사업계획서와 홈페이지가 모두 열려 있습니다" : bundleBlocked ? "묶음 대신 남은 상품만 결제해 주세요" : isHomepage ? "홈페이지는 이미 열려 있습니다" : "이 사업계획서는 이미 열려 있습니다"}</h1>
          <p className={styles.desc}>{bundleBlocked && bothOwned ? "따로 결제할 것이 없어요." : bundleBlocked ? `${info?.paid ? "사업계획서" : "홈페이지"}는 이미 열려 있어요. ${info?.paid ? "홈페이지" : "사업계획서"}만 따로 결제하면 돼요.` : isHomepage ? "결제가 확인되어 사진·글·버튼을 고치고 공개할 수 있습니다." : "결제가 확인되어 전체 항목을 쓸 수 있습니다."}</p>
          {bundleBlocked && !bothOwned && planId && <Link href={`/plan/pay?${new URLSearchParams({ planId, planType, ...(info?.paid ? { product: "homepage" } : {}) }).toString()}`} className={styles.primary}>{info?.paid ? "홈페이지만 결제하기" : "사업계획서만 결제하기"}</Link>}
          <Link href={isHomepage ? (planId ? homepageHref(planId) : "/plan/homepage") : planHref} className={bundleBlocked ? styles.back : styles.primary}>{isHomepage ? "홈페이지 에디터 열기" : "사업계획서로 돌아가기"}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true"><Unlock size={30} strokeWidth={1.8} /></div>
        <h1 className={styles.title}>{extra ? extra.title : isHomepage ? "홈페이지 수정하고 공개하기" : "이 문서 전체 열기"}</h1>
        <p className={styles.desc}>
          {extra ? extra.desc : isHomepage ? (
            <>
              계획서 내용으로 만든 홈페이지를 직접 고치고 인터넷에 공개할 수 있습니다.
              신청 폼으로 들어온 문의는 왼쪽 메뉴 ‘내 문의’에서 한곳에 모아 봅니다.
            </>
          ) : (
            <>
              {/* 문서 종류를 고르는 화면은 없어졌다 — 종류 이름(planType)이나 '다른 유형' 안내 대신 이 사업의 계획서로 말한다 */}
              이 사업의 사업계획서 전체 항목이 열리고, 완성 후 {PPT_GENERATION_VERIFIED ? "PDF·Word·발표용 PPT" : "PDF·Word"}로 내려받을 수 있습니다.
              {!PPT_GENERATION_VERIFIED && " PPT 자동 생성은 제공 준비 중이며 현재 결제 제공 범위에는 포함되지 않습니다."}
              {" "}대화로 정리한 내용은 그대로 이어집니다.
            </>
          )}
        </p>

        {(product === "plan" || product === "homepage" || product === "bundle") && <p className={styles.launchTag}>{LAUNCH_PRICE_LABEL}</p>}
        {extra ? (
          <div className={styles.price}>
            {extra.price.toLocaleString("ko-KR")}원
            <span>{extra.unit} · 부가세 포함</span>
          </div>
        ) : isHomepage ? (
          <div className={styles.price}>
            {(homepageInfo?.price ?? HOMEPAGE_PRODUCT_AMOUNT).toLocaleString("ko-KR")}원
            <span>홈페이지 1개 · 1회 결제 · 부가세 포함</span>
          </div>
        ) : info ? (
          <div className={styles.price}>
            {info.price.toLocaleString("ko-KR")}원
            <span>문서 1부 · 1회 결제 · 부가세 포함</span>
            {!info.paid && homepageInfo?.editable !== true && <Link className={styles.upsell} href={`/plan/pay?${new URLSearchParams({ planId, planType, product: "bundle" }).toString()}`}>홈페이지까지 함께 열면 {BUNDLE_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원 <small>따로 사면 {(PACKAGE_AMOUNT + HOMEPAGE_PRODUCT_AMOUNT).toLocaleString("ko-KR")}원</small> →</Link>}
          </div>
        ) : infoFailed ? (
          <div className={styles.price} role="alert">
            <span>결제 정보를 확인하지 못했어요. 연결을 확인해 주세요.</span>
            <button type="button" className={styles.retry} onClick={() => setInfoAttempt((n) => n + 1)}>다시 확인하기</button>
          </div>
        ) : (
          /* 가격 확인 전 — 자리를 비워두면 화면이 덜컥거린다 */
          <div className={styles.price} aria-busy="true">
            <Spinner />
            <span>결제 정보를 확인하는 중…</span>
          </div>
        )}

        {!(info && !info.payable) && (
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
            <label className={styles.phone}>
              <span>결제 안내 받을 휴대폰 <small>(선택)</small></span>
              <input type="tel" inputMode="numeric" autoComplete="tel" placeholder="01012345678" maxLength={13} value={noticePhone} onChange={event => setNoticePhone(event.target.value)} aria-invalid={phoneInvalid} />
              <small>{phoneInvalid ? "010으로 시작하는 11자리로 적어 주세요." : `적으면 결제 완료를 문자로 한 번 알려 드려요.${receiptByEmail ? " 영수증은 가입한 이메일로도 가요." : ""}`}</small>
            </label>
            <label className={styles.agreeAll}>
              <input type="checkbox" checked={agreed} onChange={event => setAgreements(Object.fromEntries(AGREEMENT_KEYS.map(key => [key, event.target.checked])) as Agreements)} />
              <span><strong>필수 항목에 모두 동의합니다.</strong><small>각 문서를 열어 실제 제공 조건을 확인할 수 있습니다.</small></span>
            </label>
            <div className={styles.agreeList}>
              <label><input type="checkbox" checked={agreements.service} onChange={() => toggle("service")} /><span><a href="/terms" target="_blank" rel="noreferrer">이용약관</a> 동의</span></label>
              <label><input type="checkbox" checked={agreements.privacy} onChange={() => toggle("privacy")} /><span><a href="/privacy" target="_blank" rel="noreferrer">개인정보처리방침</a> 동의</span></label>
              <label><input type="checkbox" checked={agreements.aiLimitations} onChange={() => toggle("aiLimitations")} /><span><a href="/ai-notice" target="_blank" rel="noreferrer">인공지능·국외 처리 안내</a> 확인</span></label>
              <label><input type="checkbox" checked={agreements.refund} onChange={() => toggle("refund")} /><span><a href="/refund" target="_blank" rel="noreferrer">취소·환불 기준</a> 동의</span></label>
              <label><input type="checkbox" checked={agreements.digitalSupply} onChange={() => toggle("digitalSupply")} /><span>결제 승인 즉시 디지털 콘텐츠 제공이 시작됨을 확인</span></label>
              <label className={styles.noRefund}><input type="checkbox" checked={agreements.personalizedDigitalNoRefund} onChange={() => toggle("personalizedDigitalNoRefund")} /><span>
                {product === "regen" ? (
                  <><strong>추가 횟수 환불 기준에 동의</strong><small>사용하지 않은 횟수는 결제일부터 7일 이내에 전액 환급을 요청할 수 있고, 일부라도 사용했다면 남은 횟수에 해당하는 금액을 환급합니다.</small></>
                ) : product === "domain-purchase" ? (
                  <><strong>도메인 구매·연결 환불 기준에 동의</strong><small>도메인을 등록하기 전에는 전액 환불합니다. 등록한 뒤에는 첫해 등록비 {DOMAIN_PURCHASE_REGISTRATION_AMOUNT.toLocaleString("ko-KR")}원을 뺀 {DOMAIN_PRODUCT_AMOUNT.toLocaleString("ko-KR")}원에 연결·호스팅 환불 기준(연결 완료 후 7일 이내 전액, 그 뒤 남은 개월 수만큼 월할)을 적용합니다. 등록한 도메인은 이용자 명의이며, 환불하거나 해지해도 도메인은 이용자에게 남습니다. 등록을 위해 등록 명의자 이름·이메일·연락처·주소를 도메인 등록기관(.com 은 Cloudflare, Inc.(미국), .kr·.co.kr 은 ㈜가비아 등)에 제공하는 데 동의합니다.</small></>
                ) : product === "domain" ? (
                  <><strong>도메인 연결 환불 기준에 동의</strong><small>연결을 완료하기 전이나 연결 완료 후 7일 이내에는 전액 환불하고, 그 이후에는 남은 개월 수만큼 월할로 환불합니다(사용한 달은 한 달로 계산, 수수료 없음). 가비아 등에서 직접 구매한 도메인 등록비는 환불 대상이 아닙니다.</small></>
                ) : product === "tokens" ? (
                  <><strong>AI 수정 토큰 유효기간·환불 기준에 동의</strong><small>토큰은 충전일부터 1년 동안 이 홈페이지에서 사용할 수 있고, 기간이 지나면 남은 토큰은 소멸합니다. 사용하지 않았다면 7일 이내 전액 환불하고, 일부 사용했다면 유효기간 안에서 남은 토큰 비율만큼 환불합니다.</small></>
                ) : (
                  <><strong>제공 시작 후 단순 변심 환불 제한에 동의</strong><small>결제가 승인되면 바로 내 사업에 맞춘 디지털 콘텐츠 제공이 시작되므로, 전자상거래법 제17조 제2항에 따라 단순 변심에 따른 청약철회가 제한됩니다. 제공된 내용에 하자가 있거나 표시·광고와 다르게 제공된 경우에는 관계 법령에 따라 환불받을 수 있습니다.</small></>
                )}
              </span></label>
            </div>
            <p className={styles.disclaimer}>제공 자료는 사업 기획과 실행 준비를 돕는 초안이며 사업 성공, 수익, 투자 유치나 지원사업 선정을 보장하지 않습니다. <a href="/business-info" target="_blank" rel="noreferrer">판매자·사업자 정보</a></p>
          </section>
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
            disabled={!agreed || phase === "preparing" || phase === "opening" || (registrantCheck !== null && !registrantCheck.ok)}
          >
            {phase === "preparing" ? <><Spinner /> 결제 준비 중…</> : phase === "opening" ? <><Spinner /> 결제창을 여는 중…</> : "카드로 결제하기"}
          </button>
        )}

        {!agreed && !(info && !info.payable) ? <p className={styles.help}>필수 항목에 모두 동의하면 결제 버튼이 켜집니다.</p> : null}
        {message ? <p className={styles.error}>{message}</p> : null}

        <p className={styles.note}>
          {/* 결제 뒤 실제로 가는 곳(결제 결과 화면의 단추)과 같은 말 */}
          {product === "regen" ? "결제가 끝나면 사업계획서로 돌아가 이어서 고칠 수 있습니다."
            : product === "bundle" ? "결제가 끝나면 바로 사업계획서 작성을 시작해요. 홈페이지 편집·공개도 함께 열립니다."
            : extra ? "결제가 끝나면 홈페이지 화면으로 돌아갑니다."
            : "지금까지 답한 내용은 그대로 남아 있습니다. 결제가 끝나면 바로 사업계획서 작성을 시작해요."}
        </p>
        <Link href={laterHref} className={styles.back}>← 나중에 하기</Link>
      </div>
    </div>
  );
}
