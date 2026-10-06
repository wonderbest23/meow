"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, Camera, Check, CheckCircle2, ChevronRight, Clock3, LoaderCircle, Megaphone, Newspaper, PenLine, ShieldCheck, ShoppingBag, X, type LucideIcon } from "lucide-react";
import { formatKoreanPhone, normalizeMobilePhone } from "../lib/contact-links";
import { findService, SERVICE_CATALOG, SERVICE_GROUPS, servicePriceLabel, type ServiceGroupId, type ServiceIcon, type ServiceItem } from "../lib/services/catalog";
import { EMPTY_SIGNALS, orderServices, serviceBadges, serviceSignalsFromPlan } from "../lib/services/recommend";
import { SERVICE_REQUEST_STATUS_LABELS, type MyServiceRequest } from "../lib/services/requests";
import { careHref } from "../lib/plan-builder/journey";
import { businessStateLabel, formatBusinessNumber, mailOrderStateLabel, normalizeBusinessNumber, type BusinessCheck } from "../lib/public-data/business-check";
import type { ServiceBadge } from "../lib/services/recommend";
import { loadState, type Plan } from "../lib/plan-builder/plan-store";
import styles from "./next-services.module.css";

/*
 * '다음 단계' — 홈페이지 다음으로 맡길 수 있는 일(창업 행정·마케팅).
 *
 * 오늘창업은 대화 → 계획서 → 홈페이지에서 끝나지 않는다. 가게를 연 사장님이 다음에 막히는
 * 사업자등록·통신판매업 신고·블로그 배포 같은 일을 여기서 바로 상담 신청한다.
 * 아직 가격이 없다 — 신청을 받으면 운영자가 전화로 안내한다(catalog 에 price 를 넣으면 그 값이 보인다).
 * 배지는 이 사업에서 고른 값만 보고 정한다(recommend.ts) — AI 를 부르지 않는다.
 */

export const NEXT_SERVICES_ANCHOR = "next-services";

type LoadState = { requests: MyServiceRequest[]; suggestedPhone: string; login: boolean; error: string };

const OPEN_STATUSES = new Set(["received", "contacted"]);

/* 글만 늘어서 있으면 사장님이 무엇을 사는지 몰라 주저했다 — 쇼핑몰 상품처럼 그림·짧은 이름·포함 내용으로 */
const ICONS: Record<ServiceIcon, LucideIcon> = { badge: BadgeCheck, cart: ShoppingBag, shield: ShieldCheck, building: Building2, pen: PenLine, news: Newspaper, camera: Camera, megaphone: Megaphone };
/* 연락 시간 — 직접 쓰지 않고 누르기만 */
const TIME_CHOICES = ["아무 때나", "오전", "오후", "저녁"];

export function NextServices({ plan, homepagePublished }: { plan: Plan; homepagePublished: boolean }) {
  const [state, setState] = useState<LoadState | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | ServiceGroupId>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState("");
  const [loginNext, setLoginNext] = useState("/plan");

  const baseBadges = useMemo(() => serviceBadges(serviceSignalsFromPlan(plan, homepagePublished)), [plan, homepagePublished]);
  /* 내 사업자 확인 — 국세청·공정위 조회로 이미 끝난 일은 '완료'로(그 카드는 뒤로) */
  const [check, setCheck] = useState<BusinessCheck | null>(null);
  const [checkAvailable, setCheckAvailable] = useState(false);
  const [bno, setBno] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/plan/business-check?planId=${encodeURIComponent(plan.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        setCheckAvailable(data.available === true || Boolean(data.check));
        if (data.check) { setCheck(data.check); setBno(formatBusinessNumber(data.check.businessNumber)); }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [plan.id]);
  const badges = useMemo(() => {
    const merged: Record<string, ServiceBadge> = { ...baseBadges };
    if (check?.business?.state === "active") {
      merged["business-registration"] = { tone: "done", label: "완료", reason: "국세청에서 사업자등록이 확인됐어요." };
      if (merged["soho-office"]?.tone === "first") delete merged["soho-office"];
    }
    if (check?.mailOrder?.state === "reported") merged["mail-order-report"] = { tone: "done", label: "완료", reason: `통신판매업 신고가 확인됐어요${check.mailOrder.reportNo ? ` (${check.mailOrder.reportNo})` : ""}.` };
    return merged;
  }, [baseBadges, check]);
  async function runCheck(event: FormEvent) {
    event.preventDefault();
    if (checking) return;
    if (!normalizeBusinessNumber(bno)) { setCheckError("사업자등록번호 10자리를 확인해 주세요."); return; }
    setChecking(true); setCheckError("");
    try {
      const response = await fetch("/api/plan/business-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.id, businessNumber: bno }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? "확인하지 못했어요.");
      setCheck(data.check);
    } catch (error) { setCheckError(error instanceof Error ? error.message : "확인하지 못했어요."); }
    finally { setChecking(false); }
  }

  useEffect(() => {
    setLoginNext(`${window.location.pathname}${window.location.search}#${NEXT_SERVICES_ANCHOR}`);
    const controller = new AbortController();
    fetch(`/api/plan/services?planId=${encodeURIComponent(plan.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) return setState({ requests: [], suggestedPhone: "", login: true, error: "" });
        if (!response.ok) throw new Error(data.error?.message ?? "신청 내역을 불러오지 못했어요.");
        setState({ requests: data.requests ?? [], suggestedPhone: data.suggestedPhone ?? "", login: false, error: "" });
        setPhone((current) => current || (data.suggestedPhone ? formatKoreanPhone(data.suggestedPhone) : ""));
      })
      .catch((error) => { if (!controller.signal.aborted) setState({ requests: [], suggestedPhone: "", login: false, error: error instanceof Error ? error.message : "신청 내역을 불러오지 못했어요." }); });
    return () => controller.abort();
  }, [plan.id]);

  /* 홈페이지 화면의 '다음 단계' 카드에서 왔으면 이 칸으로 내려 준다 — 유지보수 화면은 늦게 그려져 브라우저가 스스로 못 찾는다 */
  useEffect(() => {
    if (window.location.hash !== `#${NEXT_SERVICES_ANCHOR}`) return;
    const timer = window.setTimeout(() => document.getElementById(NEXT_SERVICES_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => window.clearTimeout(timer);
  }, []);

  const openRequest = (serviceId: string) => state?.requests.find((item) => item.serviceId === serviceId && OPEN_STATUSES.has(item.status));

  function start(item: ServiceItem) {
    setOpenId(item.id); setFormError(""); setDone("");
    if (!phone && state?.suggestedPhone) setPhone(formatKoreanPhone(state.suggestedPhone));
  }

  async function submit(event: FormEvent, item: ServiceItem) {
    event.preventDefault();
    if (sending) return;
    if (!normalizeMobilePhone(phone)) { setFormError("010으로 시작하는 휴대폰 번호를 넣어 주세요."); return; }
    setSending(true); setFormError("");
    try {
      const response = await fetch("/api/plan/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.id, serviceId: item.id, phone, preferredTime, memo }) });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { setState((current) => current && { ...current, login: true }); throw new Error("로그인 후 신청할 수 있어요."); }
      if (!response.ok) throw new Error(data.error?.message ?? "신청하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setState((current) => current && { ...current, requests: [data.request, ...current.requests] });
      setOpenId(null); setDetailId(null); setMemo(""); setPreferredTime("");
      setDone(`${item.title} 신청됐어요. 담당자가 연락드릴게요.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "신청하지 못했어요.");
    } finally { setSending(false); }
  }

  const detail = detailId ? findService(detailId) : undefined;
  const shown = orderServices(SERVICE_CATALOG, badges).filter((item) => tab === "all" || item.group === tab);
  useEffect(() => {
    if (!detailId) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDetailId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailId]);
  const openDetail = (item: ServiceItem) => { setDetailId(item.id); start(item); };

  return <section className={styles.root} id={NEXT_SERVICES_ANCHOR} aria-labelledby="next-services-title">
    <span className={styles.eyebrow}>다음 단계</span>
    <h2 id="next-services-title">필요한 일, 골라서 맡기세요</h2>
    <p className={styles.lead}>눌러서 무엇을 해 주는지 보고 바로 신청하세요. 담당자가 전화로 안내해요.</p>
    {done ? <p className={styles.done} role="status"><CheckCircle2 size={18} aria-hidden /> {done}</p> : null}
    {state?.error ? <p className={styles.error} role="alert">{state.error}</p> : null}

    {checkAvailable ? <form className={styles.verify} onSubmit={(event) => void runCheck(event)}>
      <div className={styles.verifyHead}><BadgeCheck size={18} aria-hidden /><strong>이미 등록·신고하셨나요?</strong><small>번호만 넣으면 국세청·공정위에서 바로 확인해요</small></div>
      <div className={styles.verifyRow}>
        <input inputMode="numeric" autoComplete="off" value={bno} onChange={(event) => setBno(event.target.value)} placeholder="사업자등록번호 10자리" aria-label="사업자등록번호" />
        <button type="submit" disabled={checking}>{checking ? <LoaderCircle className="spin" size={16} aria-hidden /> : null} 확인</button>
      </div>
      {checkError ? <p className={styles.error} role="alert">{checkError}</p> : null}
      {check ? <ul className={styles.verifyResult}>
        <li data-ok={check.business?.state === "active" || undefined}><span>사업자등록</span><b>{businessStateLabel(check.business)}{check.business?.taxType ? ` · ${check.business.taxType.replace(/^부가가치세\s*/, "")}` : ""}</b></li>
        <li data-ok={check.mailOrder?.state === "reported" || undefined}><span>통신판매업</span><b>{mailOrderStateLabel(check.mailOrder)}</b></li>
        <li><small>{new Date(check.checkedAt).toLocaleString("ko-KR")} 기준</small></li>
      </ul> : null}
    </form> : null}

    <div className={styles.tabs} role="tablist" aria-label="서비스 종류">
      {[{ id: "all" as const, title: "전체" }, ...SERVICE_GROUPS].map((group) => <button key={group.id} type="button" role="tab" aria-selected={tab === group.id} className={tab === group.id ? styles.tabOn : ""} onClick={() => setTab(group.id)}>{group.title}</button>)}
    </div>

    <ul className={styles.shop}>
      {shown.map((item) => {
        const badge = badges[item.id];
        const pending = openRequest(item.id);
        const Icon = ICONS[item.icon];
        return <li key={item.id}>
          <button type="button" className={styles.product} data-badge={badge?.tone} onClick={() => openDetail(item)} aria-label={`${item.title} 자세히 보기`}>
            {badge ? <em className={styles.ribbon} data-tone={badge.tone}>{badge.label}</em> : null}
            <span className={styles.icon} data-tone={item.tone}><Icon aria-hidden /></span>
            <strong>{item.short}</strong>
            <span className={styles.tagline}>{item.summary}</span>
            <span className={styles.meta}><Clock3 size={13} aria-hidden /> {item.duration}</span>
            <span className={styles.buy}>
              {pending ? <b className={styles.requested}>신청함 · {SERVICE_REQUEST_STATUS_LABELS[pending.status]}</b> : <><b>{item.price?.trim() ? item.price : "가격 상담"}</b><i>자세히 <ChevronRight size={15} aria-hidden /></i></>}
            </span>
          </button>
        </li>;
      })}
    </ul>

    {detail ? (() => {
      const Icon = ICONS[detail.icon];
      const badge = badges[detail.id];
      const pending = openRequest(detail.id);
      return <div className={styles.overlay} onClick={() => setDetailId(null)}>
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="svc-detail-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className={styles.close} onClick={() => setDetailId(null)} aria-label="닫기"><X size={20} /></button>
          <div className={styles.sheetHead}>
            <span className={styles.icon} data-tone={detail.tone}><Icon aria-hidden /></span>
            <div>
              <h3 id="svc-detail-title">{detail.title}</h3>
              <p>{detail.summary}</p>
            </div>
          </div>
          {badge ? <p className={styles.reason}><em className={styles.ribbon} data-tone={badge.tone}>{badge.label}</em> {badge.reason}</p> : null}
          <div className={styles.priceRow}><span>{servicePriceLabel(detail)}</span><span><Clock3 size={14} aria-hidden /> {detail.duration}</span></div>
          <h4>이렇게 해 드려요</h4>
          <ul className={styles.checks}>{detail.includes.map((line) => <li key={line}><Check size={16} aria-hidden /> {line}</li>)}</ul>
          <ol className={styles.steps}>{detail.steps.map((line, index) => <li key={line}><b>{index + 1}</b><span>{line}</span></li>)}</ol>
          <p className={styles.prepare}><strong>준비하면 빨라요</strong> {detail.prepare.join(" · ")}</p>
          {pending ? <p className={styles.requestedBox}>이미 신청했어요 · {SERVICE_REQUEST_STATUS_LABELS[pending.status]}</p>
            : state?.login ? <Link className={styles.cta} href={`/account?next=${encodeURIComponent(loginNext)}`}>로그인하고 신청하기</Link>
            : <form className={styles.form} onSubmit={(event) => void submit(event, detail)}>
              <label><span>연락받을 휴대폰</span><input inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="010-1234-5678" /></label>
              <div className={styles.times} role="radiogroup" aria-label="연락 받기 좋은 시간">
                {TIME_CHOICES.map((choice) => <button key={choice} type="button" role="radio" aria-checked={(preferredTime || "아무 때나") === choice} className={(preferredTime || "아무 때나") === choice ? styles.timeOn : ""} onClick={() => setPreferredTime(choice === "아무 때나" ? "" : choice)}>{choice}</button>)}
              </div>
              <label><span>남길 말 <small>(선택)</small></span><input value={memo} maxLength={500} onChange={(event) => setMemo(event.target.value)} placeholder="예: 다음 주 안에 하고 싶어요" /></label>
              {formError ? <p className={styles.error} role="alert">{formError}</p> : null}
              <button type="submit" className={styles.cta} disabled={sending || !state}>{sending ? <LoaderCircle className="spin" size={18} aria-hidden /> : null} 신청하기</button>
              <small className={styles.note}>신청은 무료예요. 상담 후 진행 여부를 정하시면 돼요.</small>
            </form>}
        </div>
      </div>;
    })() : null}

    {state && state.requests.length ? <div className={styles.history}>
      <h3>내 신청</h3>
      <ul>
        {state.requests.map((item) => <li key={item.id}>
          <span><strong>{findService(item.serviceId)?.title ?? item.serviceId}</strong><small>{new Date(item.createdAt).toLocaleDateString("ko-KR")} · {formatKoreanPhone(item.phone)}</small></span>
          <em data-status={item.status}>{SERVICE_REQUEST_STATUS_LABELS[item.status]}</em>
        </li>)}
      </ul>
    </div> : null}
  </section>;
}

/*
 * 홈페이지 화면의 작은 카드 — 공개한 뒤에만. 이 사업에 '먼저 해요·필요해요'가 붙은 서비스가 있으면 이름을 보여 준다.
 * 누르면 유지보수 화면의 같은 목록으로 간다(목록은 한 곳에만 둔다).
 */
export function NextServicesCard({ planId, className }: { planId: string; className?: string }) {
  const [highlights, setHighlights] = useState<string[]>([]);
  useEffect(() => {
    const plan = loadState().plans.find((item) => item.id === planId);
    const badges = serviceBadges(plan ? serviceSignalsFromPlan(plan, true) : { ...EMPTY_SIGNALS, homepagePublished: true });
    setHighlights(orderServices(SERVICE_CATALOG, badges).filter((item) => badges[item.id]).slice(0, 2).map((item) => item.title));
  }, [planId]);
  return <Link className={`${styles.card2} ${className ?? ""}`} href={`${careHref(planId)}#${NEXT_SERVICES_ANCHOR}`}>
    <span>다음 단계</span>
    <strong>사업자등록·신고·홍보 맡기기 <ArrowRight size={16} aria-hidden /></strong>
    <small>{highlights.length ? `이 사업에 먼저 필요해 보여요: ${highlights.join(", ")}` : "창업 행정과 마케팅을 상담 신청할 수 있어요"}</small>
  </Link>;
}
