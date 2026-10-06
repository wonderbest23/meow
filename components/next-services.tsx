"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { formatKoreanPhone, normalizeMobilePhone } from "../lib/contact-links";
import { findService, SERVICE_CATALOG, SERVICE_GROUPS, servicePriceLabel, servicesInGroup, type ServiceItem } from "../lib/services/catalog";
import { EMPTY_SIGNALS, orderServices, serviceBadges, serviceSignalsFromPlan } from "../lib/services/recommend";
import { SERVICE_REQUEST_STATUS_LABELS, type MyServiceRequest } from "../lib/services/requests";
import { careHref } from "../lib/plan-builder/journey";
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

export function NextServices({ plan, homepagePublished }: { plan: Plan; homepagePublished: boolean }) {
  const [state, setState] = useState<LoadState | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState("");
  const [loginNext, setLoginNext] = useState("/plan");

  const badges = useMemo(() => serviceBadges(serviceSignalsFromPlan(plan, homepagePublished)), [plan, homepagePublished]);

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
      setOpenId(null); setMemo(""); setPreferredTime("");
      setDone(`${item.title} 신청됐어요. 담당자가 연락드릴게요.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "신청하지 못했어요.");
    } finally { setSending(false); }
  }

  return <section className={styles.root} id={NEXT_SERVICES_ANCHOR} aria-labelledby="next-services-title">
    <span className={styles.eyebrow}>다음 단계</span>
    <h2 id="next-services-title">이제 맡길 일을 골라 보세요</h2>
    <p className={styles.lead}>홈페이지 다음으로 사장님이 직접 하기 번거로운 일이에요. 신청하면 담당자가 전화로 안내해요. 가격은 상담 후 알려 드려요.</p>
    {done ? <p className={styles.done} role="status"><CheckCircle2 size={18} aria-hidden /> {done}</p> : null}
    {state?.error ? <p className={styles.error} role="alert">{state.error}</p> : null}

    {SERVICE_GROUPS.map((group) => <div key={group.id} className={styles.group}>
      <h3>{group.title} <small>{group.note}</small></h3>
      <ul className={styles.list}>
        {orderServices(servicesInGroup(group.id), badges).map((item) => {
          const badge = badges[item.id];
          const pending = openRequest(item.id);
          return <li key={item.id} className={styles.card} data-badge={badge?.tone}>
            <div className={styles.cardHead}>
              <strong>{item.title}</strong>
              {badge ? <em className={styles.badge} data-tone={badge.tone}>{badge.label}</em> : null}
            </div>
            <p>{item.summary}</p>
            <small className={styles.who}>이런 분께: {item.who}</small>
            {badge ? <small className={styles.reason}>{badge.reason}</small> : null}
            <div className={styles.cardFoot}>
              <span className={styles.price}>{servicePriceLabel(item)}</span>
              {pending ? <span className={styles.requested}>신청함 · {SERVICE_REQUEST_STATUS_LABELS[pending.status]}</span>
                : state?.login ? <Link className={styles.action} href={`/account?next=${encodeURIComponent(loginNext)}`}>로그인하고 신청</Link>
                : openId === item.id ? null
                : <button type="button" className={styles.action} disabled={!state} onClick={() => start(item)}>상담 신청</button>}
            </div>
            {openId === item.id && !pending ? <form className={styles.form} onSubmit={(event) => void submit(event, item)}>
              <label><span>연락받을 휴대폰</span><input inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} onBlur={() => { if (normalizeMobilePhone(phone)) setPhone(formatKoreanPhone(phone)); }} placeholder="010-1234-5678" required /></label>
              <label><span>희망 연락 시간 <small>(선택)</small></span><input value={preferredTime} maxLength={100} onChange={(event) => setPreferredTime(event.target.value)} placeholder="예: 평일 오후 2시 이후" /></label>
              <label><span>메모 <small>(선택)</small></span><textarea value={memo} maxLength={1000} rows={3} onChange={(event) => setMemo(event.target.value)} placeholder="궁금한 점이나 상황을 적어 주세요" /></label>
              {formError ? <p className={styles.error} role="alert">{formError}</p> : null}
              <div className={styles.formActions}>
                <button type="button" className={styles.ghost} disabled={sending} onClick={() => { setOpenId(null); setFormError(""); }}>취소</button>
                <button type="submit" className={styles.action} disabled={sending}>{sending ? <LoaderCircle className="spin" size={16} aria-hidden /> : null} 신청하기</button>
              </div>
            </form> : null}
          </li>;
        })}
      </ul>
    </div>)}

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
