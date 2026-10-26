"use client";

import { FormEvent, useEffect, useRef, useState, type CSSProperties } from "react";
import { isLandingKit, landingKitCredit } from "../lib/landing/kits";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { BrainwaveLayoutHintContext, type BrainwavePageData } from "./brainwave-page";
import type { BrainwaveLayoutHint } from "../lib/landing/layout-hint";
import { CalendarCheck, Check, ChevronDown, ChevronRight, MessageCircle, PencilLine, Phone, ShieldCheck, ShoppingBag } from "lucide-react";
import { draftPhone, quickActions, withContactLinks } from "../lib/landing/contact-method";
import { landingCollectedItems, privacyPolicyWithContact, type LandingDraft } from "../lib/landing/domain";
import { LandingBlocksRenderer } from "./landing-blocks";
import { ConsentList } from "./consent-list";
import { themeStyle } from "../lib/landing/themes";
import { BRAINWAVE_CTA_EVENT, scrollToContact } from "../lib/landing/brainwave/button-action";
import { Spinner } from "../app/plan/PlanLoading";
import { koreanText } from "../lib/client/user-error";

function getVisitorId() {
  const key = "venture-landing-visitor";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export function PublicLandingClient({
  slug,
  config,
  brainwavePage = null,
  layoutHint = null,
}: {
  slug: string;
  config: LandingDraft;
  /** 킷 페이지 트리 — 서버가 미리 읽어 넘기면 첫 HTML 에 글이 다 들어간다 */
  brainwavePage?: BrainwavePageData | null;
  /** 서버가 요청 머리말로 짐작한 배치(휴대폰이면 처음부터 휴대폰 배치) — lib/landing/layout-hint.ts */
  layoutHint?: BrainwaveLayoutHint | null;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const sendingRef = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  /* 오류가 난 칸 — 그 칸 바로 아래에 안내를 붙여, 커서가 간 자리에서 이유가 보이게 한다 */
  const [errorField, setErrorField] = useState<"name" | "email" | "phone" | null>(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [marketingAgreed, setMarketingAgreed] = useState(false);
  const [analyticsAgreed, setAnalyticsAgreed] = useState(false);
  const [analyticsDismissed, setAnalyticsDismissed] = useState(false);

  const record = async (eventType: "page_view" | "cta_click") => {
    if (!config.analyticsEnabled || !analyticsAgreed) return;
    try {
      await fetch(`/api/public/landing/${slug}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          visitorId: getVisitorId(),
          path: location.pathname,
          referrer: document.referrer,
          analyticsConsent: true,
        }),
        keepalive: true,
      });
    } catch {
      // Analytics must never interrupt the public page.
    }
  };

  useEffect(() => {
    if (viewed.current) return;
    if (!analyticsAgreed) return;
    viewed.current = true;
    void record("page_view");
  }, [analyticsAgreed]);

  // 킷 디자인의 버튼(runBrainwaveButton)도 '버튼 누름'으로 센다
  useEffect(() => {
    const onCta = () => { void record("cta_click"); };
    window.addEventListener(BRAINWAVE_CTA_EVENT, onCta);
    return () => window.removeEventListener(BRAINWAVE_CTA_EVENT, onCta);
  });

  const moveToForm = () => {
    void record("cta_click");
    scrollToContact();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    /* 단추를 빠르게 여러 번 눌러도 한 번만 보낸다 — submitting 상태는 다음 그리기 전까지 바뀌지 않아 연타를 못 막았다 */
    if (submitting || sendingRef.current || submitted) return;
    const data = new FormData(event.currentTarget);
    /*
     * 보내기 전에 화면에서 먼저 확인한다 — 예전엔 동의 전에는 단추만 흐리게 꺼져 이유를 몰랐고,
     * 빈 이름은 브라우저 기본 말풍선, 연락처 빠짐은 '이름과 연락처…' 같은 두루뭉술한 서버 안내뿐이었다.
     */
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const missing = !text("name") ? "이름을 적어 주세요."
      : (config.collectEmail || config.collectPhone) && !text("email") && !text("phone") ? (config.collectEmail && config.collectPhone ? "이메일이나 전화번호 중 하나는 꼭 적어 주세요." : config.collectPhone ? "전화번호를 적어 주세요." : "이메일을 적어 주세요.")
      : text("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text("email")) ? "이메일 주소를 다시 확인해 주세요."
      : !privacyAgreed ? "개인정보 수집·이용에 동의해 주세요."
      : "";
    /* 고칠 칸으로 커서를 옮긴다 — 예전엔 맨 아래 빨간 글만 떠 휴대폰에서는 어느 칸인지 찾아 올라가야 했다(감사 r36) */
    if (missing) {
      const form = event.currentTarget;
      const field = !text("name") ? "name" : missing.includes("동의") ? null : text("email") && missing.includes("이메일 주소") ? "email" : config.collectEmail ? "email" : "phone";
      setError(missing);
      setErrorField(field);
      const target = field ? form.elements.namedItem(field) : form.querySelector(".public-consent-list input, .public-consent-list button");
      if (target instanceof HTMLElement) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: "center", behavior: "smooth" }); }
      return;
    }
    sendingRef.current = true;
    setSubmitting(true);
    setError("");
    setErrorField(null);
    try {
      const response = await fetch(`/api/public/landing/${slug}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email") ?? "",
          phone: data.get("phone") ?? "",
          message: data.get("message") ?? "",
          website: data.get("website") ?? "",
          privacyAgreed,
          marketingAgreed,
          source: "public_landing",
        }),
      });
      /* 방문자에게는 서버가 준 한국어 안내만 — 연결 끊김·HTML 오류 페이지의 영어 원문(Failed to fetch 등)은 보이지 않는다 */
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) { setError(koreanText(payload?.error?.message, "신청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.")); return; }
      setSubmitted(true);
    } catch {
      setError("연결이 불안정해 신청을 보내지 못했어요. 인터넷 연결을 확인한 뒤 다시 보내 주세요.");
    } finally {
      sendingRef.current = false;
      setSubmitting(false);
    }
  };

  /* 분위기(색 조합)는 디자인 부분에만 걸려 있어, 그 밖의 문의 양식·맨 아래는 다른 색(기본 초록)으로 남았다 — 페이지 전체에 같은 분위기 색을 건다 */
  const style = { "--landing-accent": config.accentColor, ...(config.pageData?.brainwave ? themeStyle(config.pageData.theme) : undefined) } as CSSProperties;
  const heroStyle = config.heroImageUrl
    ? { backgroundImage: `url(${config.heroImageUrl})` }
    : undefined;
  /* 둥근 로고 글자는 첫 글자 하나 — 두 글자를 자르면 '아파트 상가 아침 빵집'이 '아파'가 됐다(실제 AI 점검 2026-10-22) */
  const initials = Array.from(config.businessName.trim())[0] ?? "";
  /*
   * 킷 배치(lib/landing/kits.ts)는 블록 안에서 정해지지만, 문의 양식과 상단
   * 메뉴는 블록 밖에 있다 — 껍데기에도 같은 클래스를 붙여 한 벌로 입힌다.
   */
  const kitValue = config.pageData?.root?.props?.kit;
  const kit = isLandingKit(kitValue) ? kitValue : null;
  /* 킷 페이지는 머리글을 자기 안에 갖고 있다 — 우리 상단 메뉴를 겹쳐 두지 않는다 */
  const brainwave = Boolean(config.pageData?.brainwave);
  /* 휴대폰 화면 아래 고정 연락 버튼 — 사장님이 넣어 둔 전화·카톡·예약만 */
  const quick = quickActions(config.contact, draftPhone(config), config.leadCaptureEnabled);
  const quickIcon = { phone: Phone, kakao: MessageCircle, booking: CalendarCheck, store: ShoppingBag, form: PencilLine } as const;
  return (
    <main className={`public-landing tone-${config.backgroundTone} template-${config.templateId}${kit ? ` kit kit-${kit}` : ""}${brainwave ? " brainwave" : ""}${quick.length ? " has-quickbar" : ""}`} style={style}>
      {!brainwave && <nav className="public-landing-nav">
        <span className="public-landing-brand">{config.logoImageUrl ? <img src={config.logoImageUrl} alt={`${config.businessName} 로고`} /> : <i>{initials}</i>}<strong>{config.businessName}</strong></span>
        <button onClick={moveToForm}>{config.ctaLabel}</button>
      </nav>}

      {config.pageData ? <BrainwaveLayoutHintContext.Provider value={layoutHint}><LandingBlocksRenderer data={withContactLinks(config) ?? config.pageData} preloaded={brainwavePage} /></BrainwaveLayoutHintContext.Provider> : <><section className={`public-landing-hero ${config.heroImageUrl ? "with-image" : "without-image"}`} style={heroStyle} aria-label={config.heroImageAlt}>
        <div className="public-landing-hero-copy">
          <span>{config.heroLabel}</span>
          <h1>{config.headline}</h1>
          <p>{config.subheadline}</p>
          <button onClick={moveToForm}>{config.ctaLabel}<ChevronRight /></button>
          <small><ShieldCheck /> {config.leadCaptureEnabled ? "신청 정보는 안내 목적으로만 사용됩니다." : "현재는 사업 소개만 공개되어 있습니다."}</small>
        </div>
      </section>

      <section className="public-offer-band"><div><small>첫 상품</small><h2>{config.offerTitle}</h2><p>{config.offerDescription}</p></div><strong>{config.priceLabel}</strong><ul>{config.benefits.slice(0, 3).map((benefit) => <li key={benefit.title}><Check /> {benefit.title}</li>)}</ul></section>

      <section className="public-benefits">
        <header><small>선택하는 이유</small><h2>처음부터 복잡하게 시작하지 않습니다</h2></header>
        <div>{config.benefits.map((benefit, index) => <article key={benefit.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{benefit.title}</h3><p>{benefit.description}</p></article>)}</div>
      </section>

      {config.proofItems.length > 0 && (
        <section className="public-proof">
          <header><small>확인 근거</small><h2>확인할 수 있는 근거</h2></header>
          <div>{config.proofItems.map((item) => <p key={item}><Check /> {item}</p>)}</div>
        </section>
      )}

      {config.faq.length > 0 && (
        <section className="public-faq">
          <header><small>궁금한 점</small><h2>자주 묻는 질문</h2></header>
          <div>{config.faq.map((item) => <details key={item.question}><summary>{item.question}<ChevronDown /></summary><p>{item.answer}</p></details>)}</div>
        </section>
      )}</>}

      <section id="landing-contact" className={`public-lead-section ${config.leadCaptureEnabled ? "" : "brochure"}`} ref={formRef}>
        {/* 제목 위 작은 '신청하기' 꼬리표는 바로 아래 큰 제목('문의하기' 등)과 같은 말이라 뺐다 */}
        <div><h2 id="landing-contact-title">{config.ctaLabel}</h2>{config.leadCaptureEnabled && <p>남겨 주시면 확인하고 연락드릴게요.</p>}</div>
        {!config.leadCaptureEnabled ? (
          /* 신청폼이 꺼져 있을 때 — 방문자에게는 사장님용 안내('신청폼을 켤 수 있습니다') 대신 연락할 방법을 보여 준다 */
          (() => {
            const phone = draftPhone(config);
            const email = config.businessEmail.trim();
            return <div className="public-lead-ready"><ShieldCheck /><h3>{phone || email ? "아래 연락처로 문의해 주세요" : "온라인 신청은 준비 중이에요"}</h3>
              {phone || email ? <p>{phone && <a href={`tel:${phone}`}>{config.businessPhone || config.businessContact || phone}</a>}{phone && email ? " · " : ""}{email && <a href={`mailto:${email}`}>{email}</a>}</p>
                : <p>지금은 사업 소개만 공개되어 있어요. 곧 신청을 받을 수 있게 준비하고 있어요.</p>}</div>;
          })()
        ) : submitted ? (
          /* 문의·예약 모두 받는 양식이라 '신청' 대신 '문의', 가게가 손님에게 하는 말투로 */
          <div className="public-lead-success"><Check /><h3>문의가 접수됐어요</h3><p>남겨 주신 연락처로 곧 연락드릴게요.</p></div>
        ) : (
          <form onSubmit={submit} noValidate aria-labelledby="landing-contact-title">
            <label><span>이름</span><input name="name" required maxLength={100} autoComplete="name" placeholder="성함 또는 닉네임" aria-invalid={errorField === "name" || undefined} aria-describedby={errorField === "name" ? "public-form-field-error" : undefined} onInput={() => { if (errorField === "name") { setErrorField(null); setError(""); } }} />{errorField === "name" && <span id="public-form-field-error" className="public-form-field-error" role="alert">{error}</span>}</label>
            {config.collectEmail && <label><span>이메일</span><input name="email" type="email" autoComplete="email" required={!config.collectPhone} maxLength={200} placeholder="example@email.com" aria-invalid={errorField === "email" || undefined} aria-describedby={errorField === "email" ? "public-form-field-error" : undefined} onInput={() => { if (errorField === "email") { setErrorField(null); setError(""); } }} />{errorField === "email" && <span id="public-form-field-error" className="public-form-field-error" role="alert">{error}</span>}</label>}
            {config.collectPhone && <label><span>전화번호</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" required={!config.collectEmail} maxLength={30} placeholder="010-0000-0000" aria-invalid={errorField === "phone" || undefined} aria-describedby={errorField === "phone" ? "public-form-field-error" : undefined} onInput={() => { if (errorField === "phone") { setErrorField(null); setError(""); } }} />{errorField === "phone" && <span id="public-form-field-error" className="public-form-field-error" role="alert">{error}</span>}</label>}
            {config.collectMessage && <label><span>문의 내용</span><textarea name="message" maxLength={2000} placeholder="궁금한 점이나 원하는 내용을 적어 주세요." /></label>}
            <input name="website" className="landing-honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            {/* 동의 — 공용 동의 목록(동그란 체크·(필수)/(선택)). 법으로 알려야 하는 수집 항목·목적·보유기간은 줄 아래에 그대로 */}
            <ConsentList className="public-consent-list" allLabel="전체 동의" items={[
              { key: "privacy", label: "개인정보 수집·이용 동의", note: <>처리 주체: {config.privacyController}<br />수집 항목: {landingCollectedItems(config).join(", ")}<br />목적: {config.privacyPurpose}<br />보유기간: {config.privacyRetentionPeriod}<br />거부 안내: {config.privacyRefusalNotice}</> },
              ...(config.marketingOptInEnabled ? [{ key: "marketing", label: "홍보 정보 수신 동의", required: false, note: "새로운 서비스와 혜택 안내를 받을 수 있어요." }] : []),
            ]} values={{ privacy: privacyAgreed, marketing: marketingAgreed }} onChange={(next) => { setPrivacyAgreed(Boolean(next.privacy)); setMarketingAgreed(Boolean(next.marketing)); }} />
            <details className="public-privacy-policy"><summary>개인정보처리방침 전문</summary><p>{privacyPolicyWithContact(config.privacyPolicy, config.privacyContact)}</p><small>문의: {config.privacyContact}</small></details>
            {error && !errorField && <p className="public-form-error" role="alert">{error}</p>}
            <button type="submit" disabled={submitting}>{submitting ? <Spinner /> : "문의 보내기"}</button>
          </form>
        )}
      </section>

      <footer className="public-landing-footer">
        <div className="public-footer-brand"><span>{config.logoImageUrl ? <img src={config.logoImageUrl} alt="" /> : initials}</span><strong>{config.businessName}</strong></div>
        {/* 판매(결제) 페이지는 법정 표기라 빈 칸도 '등록 전'으로 드러내고, 소개·문의 페이지는 채운 칸만 보인다 — '등록 전' 다섯 줄은 손님 눈에 어수선했다(운영 점검) */}
        {(() => {
          const transaction = config.pageMode === "transaction";
          const rows = ([["대표자", config.businessRepresentative, "등록 전"], ["사업장", config.businessAddress, "등록 전"], ["전화", config.businessPhone || config.businessContact, "등록 전"], ["이메일", config.businessEmail, "등록 전"], ["사업자등록번호", config.businessRegistrationNumber, "등록 전"], ["통신판매업", config.mailOrderSalesNumber, "해당 시 등록"]] as const)
            .filter(([, value]) => transaction || value.trim());
          /* 소개·문의 페이지에서 채운 칸이 없으면 아무것도 안 쓴다 — '판매 시작 전에 공개됩니다'는 손님에게 할 말이 아니었다. 판매 페이지는 위에서 '등록 전'을 드러낸다 */
          if (!rows.some(([, value]) => value.trim())) return transaction ? <p>사업자 정보는 판매 시작 전에 실제 등록 정보로 공개됩니다.</p> : null;
          return <div className="public-business-information">{rows.map(([label, value, empty]) => <p key={label}>{label} {value || empty}</p>)}</div>;
        })()}
        {config.pageMode === "transaction" && <p>교환·환불: {config.refundPolicy} · <a href={config.termsUrl} target="_blank" rel="noreferrer">거래조건·이용약관</a></p>}
        <p>{config.legalNotice}</p>
        {config.leadCaptureEnabled && <small>개인정보 문의 {config.privacyContact}</small>}
        <small>호스팅 제공자 {config.hostingProvider} · © {new Date().getFullYear()} {config.businessName}</small>
        {/* CC BY 4.0 — 킷 배치를 쓴 페이지는 출처를 적는다 */}
        {kit || brainwave ? <small className="public-kit-credit"><a href={landingKitCredit.url} target="_blank" rel="noreferrer">{landingKitCredit.text}</a></small> : null}
      </footer>
      {quick.length ? (
        <nav className="public-quickbar" aria-label="빠른 연락">
          {quick.map((action) => {
            const Icon = quickIcon[action.key];
            const external = action.href.startsWith("https://");
            return <a key={action.key} href={action.href} className={`public-quickbar-${action.key}`} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={(event) => { if (action.key === "form") { event.preventDefault(); moveToForm(); } else void record("cta_click"); }}>
              <Icon size={18} aria-hidden /> {action.label}
            </a>;
          })}
        </nav>
      ) : null}
      {config.analyticsEnabled && !analyticsDismissed && !analyticsAgreed && <aside className="public-analytics-consent"><p><strong>방문 분석 선택 동의</strong><span>{config.analyticsNotice}</span></p><div><button onClick={() => setAnalyticsDismissed(true)}>거부</button><button onClick={() => setAnalyticsAgreed(true)}>동의</button></div></aside>}
    </main>
  );
}
