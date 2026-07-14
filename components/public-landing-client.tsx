"use client";

import { FormEvent, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, ChevronDown, LoaderCircle, ShieldCheck } from "lucide-react";
import { landingCollectedItems, type LandingDraft } from "../lib/landing/domain";

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
}: {
  slug: string;
  config: LandingDraft;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
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

  const moveToForm = () => {
    void record("cta_click");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!privacyAgreed || submitting) return;
    setSubmitting(true);
    setError("");
    const data = new FormData(event.currentTarget);
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "신청을 접수하지 못했습니다.");
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "신청 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const style = { "--landing-accent": config.accentColor } as CSSProperties;
  const heroStyle = config.heroImageUrl
    ? { backgroundImage: `url(${config.heroImageUrl})` }
    : undefined;
  const initials = config.businessName.replaceAll(" ", "").slice(0, 2);
  return (
    <main className={`public-landing tone-${config.backgroundTone} template-${config.templateId}`} style={style}>
      <nav className="public-landing-nav">
        <span className="public-landing-brand">{config.logoImageUrl ? <img src={config.logoImageUrl} alt={`${config.businessName} 로고`} /> : <i>{initials}</i>}<strong>{config.businessName}</strong></span>
        <button onClick={moveToForm}>{config.ctaLabel}</button>
      </nav>

      <section className={`public-landing-hero ${config.heroImageUrl ? "with-image" : "without-image"}`} style={heroStyle} aria-label={config.heroImageAlt}>
        <div className="public-landing-hero-copy">
          <span>{config.heroLabel}</span>
          <h1>{config.headline}</h1>
          <p>{config.subheadline}</p>
          <button onClick={moveToForm}>{config.ctaLabel}<ArrowRight /></button>
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
      )}

      <section className={`public-lead-section ${config.leadCaptureEnabled ? "" : "brochure"}`} ref={formRef}>
        <div><small>신청하기</small><h2>{config.ctaLabel}</h2><p>남겨주신 정보를 확인한 뒤 다음 절차를 안내합니다.</p></div>
        {!config.leadCaptureEnabled ? (
          <div className="public-lead-ready"><ShieldCheck /><h3>홈페이지가 먼저 준비되었습니다</h3><p>사업자 연락처와 개인정보 문의 정보를 확인한 뒤 신청폼을 켤 수 있습니다.</p></div>
        ) : submitted ? (
          <div className="public-lead-success"><Check /><h3>신청이 접수되었습니다</h3><p>입력하신 연락처로 안내드리겠습니다.</p></div>
        ) : (
          <form onSubmit={submit}>
            <label><span>이름</span><input name="name" required maxLength={100} placeholder="성함 또는 닉네임" /></label>
            {config.collectEmail && <label><span>이메일</span><input name="email" type="email" required={!config.collectPhone} maxLength={200} placeholder="name@company.kr" /></label>}
            {config.collectPhone && <label><span>전화번호</span><input name="phone" type="tel" required={!config.collectEmail} maxLength={30} placeholder="010-0000-0000" /></label>}
            {config.collectMessage && <label><span>문의 내용</span><textarea name="message" maxLength={2000} placeholder="현재 상황과 궁금한 점을 알려주세요." /></label>}
            <input name="website" className="landing-honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <label className="public-consent"><input type="checkbox" checked={privacyAgreed} onChange={(event) => setPrivacyAgreed(event.target.checked)} /><span><Check /></span><p><strong>[필수] 개인정보 수집·이용 동의</strong><small>처리 주체: {config.privacyController}<br />수집 항목: {landingCollectedItems(config).join(", ")}<br />목적: {config.privacyPurpose}<br />보유기간: {config.privacyRetentionPeriod}<br />거부 안내: {config.privacyRefusalNotice}</small></p></label>
            <details className="public-privacy-policy"><summary>개인정보처리방침 전문</summary><p>{config.privacyPolicy}</p><small>문의: {config.privacyContact}</small></details>
            {config.marketingOptInEnabled && <label className="public-consent"><input type="checkbox" checked={marketingAgreed} onChange={(event) => setMarketingAgreed(event.target.checked)} /><span><Check /></span><p><strong>[선택] 홍보 정보 수신 동의</strong><small>새로운 서비스와 혜택 안내를 받을 수 있습니다.</small></p></label>}
            {error && <p className="public-form-error">{error}</p>}
            <button type="submit" disabled={!privacyAgreed || submitting}>{submitting ? <LoaderCircle className="spin" /> : config.ctaLabel}<ArrowRight /></button>
          </form>
        )}
      </section>

      <footer className="public-landing-footer">
        <div className="public-footer-brand"><span>{config.logoImageUrl ? <img src={config.logoImageUrl} alt="" /> : initials}</span><strong>{config.businessName}</strong></div>
        {(config.businessRepresentative || config.businessAddress || config.businessPhone || config.businessContact || config.businessEmail || config.businessRegistrationNumber || config.mailOrderSalesNumber) ? <div className="public-business-information"><p>대표자 {config.businessRepresentative || "등록 전"}</p><p>사업장 {config.businessAddress || "등록 전"}</p><p>전화 {config.businessPhone || config.businessContact || "등록 전"}</p><p>이메일 {config.businessEmail || "등록 전"}</p><p>사업자등록번호 {config.businessRegistrationNumber || "등록 전"}</p><p>통신판매업 {config.mailOrderSalesNumber || "해당 시 등록"}</p></div> : <p>사업자 정보는 판매 시작 전에 실제 등록 정보로 공개됩니다.</p>}
        {config.pageMode === "transaction" && <p>교환·환불: {config.refundPolicy} · <a href={config.termsUrl} target="_blank" rel="noreferrer">거래조건·이용약관</a></p>}
        <p>{config.legalNotice}</p>
        {config.leadCaptureEnabled && <small>개인정보 문의 {config.privacyContact}</small>}
        <small>호스팅 제공자 {config.hostingProvider} · © {new Date().getFullYear()} {config.businessName}</small>
      </footer>
      {config.analyticsEnabled && !analyticsDismissed && !analyticsAgreed && <aside className="public-analytics-consent"><p><strong>방문 분석 선택 동의</strong><span>{config.analyticsNotice}</span></p><div><button onClick={() => setAnalyticsDismissed(true)}>거부</button><button onClick={() => setAnalyticsAgreed(true)}>동의</button></div></aside>}
    </main>
  );
}
