"use client";

import { apiMessage, userErrorMessage } from "../lib/client/user-error";
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  ExternalLink,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingDomainConnection } from "../lib/landing/custom-domain";
import type { LandingSiteRecord } from "../lib/landing/domain";
import type { DomainAvailability, DomainRequestStatus } from "../lib/landing/domain-purchase";

type DomainPurchase = { domain: string; status: DomainRequestStatus; orderId: string; paidAt: string };
type DomainEntitlement = { active: boolean; expiresAt: string | null; required: boolean; planId: string; price: number; purchasePrice?: number; purchase?: DomainPurchase | null };
type DomainPayload = {
  site: LandingSiteRecord;
  connection?: LandingDomainConnection;
  entitlement?: DomainEntitlement;
  error?: { message?: string };
};

export function LandingDomainConnector({
  projectId,
  initialCustomDomain,
  published,
  demo,
  onSiteUpdated,
  onReadyChange,
}: {
  projectId: string | null;
  initialCustomDomain: string;
  published: boolean;
  demo: boolean;
  onSiteUpdated: (site: LandingSiteRecord) => void;
  /** 연결이 실제로 열렸는지(DNS·인증서까지) — 접힌 카드 머리의 배지가 '연결됨'을 너무 일찍 보이지 않게 */
  onReadyChange?: (ready: boolean) => void;
}) {
  const [hostname, setHostname] = useState(initialCustomDomain);
  const [connection, setConnection] = useState<LandingDomainConnection | null>(null);
  const [entitlement, setEntitlement] = useState<DomainEntitlement | null>(null);
  const [action, setAction] = useState<"idle" | "loading" | "connecting" | "removing">("idle");
  const actionRef = useRef(action);
  actionRef.current = action;
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const siteUpdatedRef = useRef(onSiteUpdated);
  const loadRequestRef = useRef<AbortController | null>(null);

  useEffect(() => { siteUpdatedRef.current = onSiteUpdated; }, [onSiteUpdated]);
  useEffect(() => { onReadyChange?.(Boolean(connection?.ready)); }, [connection?.ready, onReadyChange]);

  const load = useCallback(async (quiet = false) => {
    if (!projectId || demo || loadRequestRef.current) return;
    const controller = new AbortController();
    loadRequestRef.current = controller;
    if (!quiet) setAction("loading");
    try {
      const response = await fetch(`/api/projects/${projectId}/landing/domain`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json() as DomainPayload;
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(payload.error?.message ?? "도메인 상태를 확인하지 못했습니다.");
      setConnection(payload.connection ?? null);
      setEntitlement(payload.entitlement ?? null);
      // 대신 사 드린 주소는 연결 칸을 미리 채워 둔다(등록이 끝나면 '연결 시작'만 누르면 된다)
      setHostname(payload.site.customDomain ?? (payload.entitlement?.purchase ? `www.${payload.entitlement.purchase.domain}` : ""));
      siteUpdatedRef.current(payload.site);
      if (!quiet) setMessage(payload.connection?.ready ? "도메인 연결이 완료되었습니다." : "");
    } catch (error) {
      if (!quiet && !controller.signal.aborted) setMessage(userErrorMessage(error, "도메인 상태를 확인하지 못했습니다."));
    } finally {
      if (loadRequestRef.current === controller) {
        loadRequestRef.current = null;
        if (!quiet) setAction("idle");
      }
    }
  }, [demo, projectId]);

  useEffect(() => {
    setHostname(initialCustomDomain);
    if (projectId && !demo) void load();
    return () => { loadRequestRef.current?.abort(); loadRequestRef.current = null; };
  }, [demo, initialCustomDomain, load, projectId]);

  useEffect(() => {
    if (!connection?.hostname || connection.ready || !connection.configured || !projectId) return;
    // 연결·해제를 처리하는 동안은 확인하지 않는다
    const timer = window.setInterval(() => { if (actionRef.current === "idle") void load(true); }, 8000);
    return () => window.clearInterval(timer);
  }, [connection?.configured, connection?.hostname, connection?.ready, load, projectId]);

  const connect = async () => {
    if (!projectId || action !== "idle") return;
    // 진행 중인 상태 확인을 멈춘다 — 늦게 오면 방금 바꾼 연결 상태를 옛것으로 덮었다
    loadRequestRef.current?.abort(); loadRequestRef.current = null;
    setAction("connecting");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/landing/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const payload = await response.json() as DomainPayload;
      if (!response.ok) throw new Error(payload.error?.message ?? "도메인을 연결하지 못했습니다.");
      setConnection(payload.connection ?? null);
      setHostname(payload.site.customDomain ?? hostname);
      onSiteUpdated(payload.site);
      setMessage(payload.connection?.ready
        ? "도메인 연결이 완료되었습니다."
        : "연결 신청을 완료했습니다. 아래 DNS 설정 한 줄만 추가해주세요.");
    } catch (error) {
      setMessage(userErrorMessage(error, "도메인을 연결하지 못했습니다."));
    } finally {
      setAction("idle");
    }
  };

  const remove = async () => {
    if (!projectId || action !== "idle") return;
    loadRequestRef.current?.abort(); loadRequestRef.current = null;
    setAction("removing");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/landing/domain`, { method: "DELETE" });
      const payload = await response.json() as DomainPayload;
      if (!response.ok) throw new Error(payload.error?.message ?? "도메인 연결을 해제하지 못했습니다.");
      setConnection(null);
      setHostname("");
      onSiteUpdated(payload.site);
      setMessage("개인 도메인 연결을 해제했습니다. 무료 주소는 그대로 사용할 수 있습니다.");
    } catch (error) {
      setMessage(userErrorMessage(error, "도메인 연결을 해제하지 못했습니다."));
    } finally {
      setAction("idle");
    }
  };

  const copyTarget = async () => {
    if (!connection?.cnameTarget) return;
    await navigator.clipboard.writeText(connection.cnameTarget);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (demo) {
    return (
      <section className="landing-domain-connector demo">
        <div className="domain-connector-title"><Globe2 /><span><strong>내 도메인 연결</strong><p>결제 후 구매한 도메인의 www 주소를 연결할 수 있습니다.</p></span></div>
        <div className="domain-demo-row"><span>www.mybrand.com</span><em>연결 예시</em></div>
        <nav className="domain-buy-links"><span>아직 도메인이 없다면</span><a href="https://domain.gabia.com/" target="_blank" rel="noreferrer">가비아 <ExternalLink /></a><a href="https://www.hosting.kr/domain" target="_blank" rel="noreferrer">호스팅케이알 <ExternalLink /></a><a href="https://www.cafe24.com/?controller=product_domain" target="_blank" rel="noreferrer">카페24 <ExternalLink /></a></nav>
      </section>
    );
  }

  const connectedHostname = connection?.hostname || initialCustomDomain;
  const busy = action !== "idle";
  /*
   * 도메인 연결은 '내 도메인 연결 + 호스팅 1년' 을 산 뒤에 연다.
   * 아직 안 샀으면 폼 대신 결제로 보내는 카드 — 연결돼 있는데 만료됐으면 끊지
   * 않고(사이트가 죽으면 안 된다) 갱신만 안내한다.
   */
  const needsPurchase = entitlement?.required && !entitlement.active;
  const expiresSoon = entitlement?.active && entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() - Date.now() < 30 * 86_400_000;
  const purchase = entitlement?.purchase ?? null;
  const planQuery = entitlement?.planId ? `/plan/pay?planId=${encodeURIComponent(entitlement.planId)}` : "";
  const payHref = planQuery ? `${planQuery}&product=domain` : "";
  /* 갱신은 처음 산 상품 그대로 — 대신 사 드린 주소면 등록비까지 함께 */
  const renewHref = purchase && planQuery ? `${planQuery}&product=domain-purchase&domain=${encodeURIComponent(purchase.domain)}` : payHref;
  const renewPrice = purchase ? entitlement?.purchasePrice ?? 79000 : entitlement?.price ?? 59000;
  const purchasedHostname = purchase ? `www.${purchase.domain}` : "";
  const waitingRegistration = Boolean(entitlement?.active && purchase?.status === "requested");
  if (needsPurchase && !connectedHostname) {
    return (
      <section className="landing-domain-connector">
        <div className="domain-connector-title"><Globe2 /><span><strong>내 도메인 연결</strong><p>www.우리가게.com 처럼 내 주소로 홈페이지를 엽니다. 1년 동안 호스팅·보안 인증서·연결 관리를 맡아 드립니다.</p></span></div>
        {/* 도메인 대신 사 드리기는 오픈 범위 밖(2026-10-08) — 이미 가진 도메인 연결만 받는다. 갱신은 아래 '1년 갱신' 링크로 */}
        <div className="domain-own-option">
          <strong>이미 도메인이 있어요</strong>
          <p>가비아 등에서 산 주소를 이 홈페이지에 연결만 합니다.</p>
          <a className="domain-buy-cta secondary" href={payHref}>{(entitlement?.price ?? 59000).toLocaleString("ko-KR")}원 · 1년 — 결제하고 연결하기</a>
        </div>
      </section>
    );
  }
  return (
    <section className="landing-domain-connector">
      {entitlement?.required && entitlement.expiresAt ? (
        <p className={`domain-term ${needsPurchase ? "expired" : expiresSoon ? "soon" : ""}`}>
          {needsPurchase ? "호스팅 기간이 끝났습니다. 연결은 유지되지만 변경하려면 갱신이 필요합니다." : `호스팅 ${entitlement.expiresAt.slice(0, 10)}까지`}
          {(needsPurchase || expiresSoon) && renewHref ? <a href={renewHref}> 1년 갱신 {renewPrice.toLocaleString("ko-KR")}원</a> : null}
        </p>
      ) : null}
      <div className="domain-connector-title"><Globe2 /><span><strong>내 도메인 연결</strong><p>{purchase ? "대신 사 드린 주소를 이 홈페이지에 연결합니다." : "구매한 주소의 www 주소만 입력하면 됩니다."}</p></span>{connection?.ready ? <em className="ready"><CheckCircle2 /> 연결 완료</em> : connectedHostname ? <em><LoaderCircle /> 연결 확인 중</em> : null}</div>

      {purchase && !connectedHostname && entitlement?.active ? (
        <div className="domain-service-note purchase" role="status"><CheckCircle2 /><p>{purchase.status === "registered"
          ? <><strong>{purchase.domain}</strong> 등록을 마쳤어요. 연결 설정(DNS)도 해 두었으니 아래 ‘연결 시작’만 눌러 주세요.</>
          : <><strong>{purchase.domain}</strong> 등록을 진행하고 있어요. .com 은 보통 몇 분, .kr·.co.kr 은 영업일 1~2일 걸려요. 결제 때 적어 주신 명의자 이름으로 등록해요. 끝나면 이 화면에서 ‘연결 시작’만 누르면 됩니다.</>}</p></div>
      ) : null}
      {!connectedHostname ? (
        <div className="domain-connect-form">
          <label><span>{purchase ? "연결할 주소" : "구매한 도메인"}</span><input value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="www.mybrand.com" autoCapitalize="none" autoCorrect="off" /></label>
          <button disabled={!published || busy || hostname.trim().length < 4 || (waitingRegistration && hostname.trim().toLowerCase() === purchasedHostname)} onClick={() => void connect()}>{action === "connecting" ? <LoaderCircle className="spin" /> : <Globe2 />} 연결 시작</button>
          {!published && <small>먼저 위의 ‘공개하기’를 눌러 홈페이지를 공개해주세요.</small>}
        </div>
      ) : (
        <div className="domain-connection-progress">
          <div className="domain-connected-address"><span><small>연결할 주소</small><strong>{connectedHostname}</strong></span>{connection?.ready && <a href={`https://${connectedHostname}`} target="_blank" rel="noreferrer">열기 <ExternalLink /></a>}</div>
          {!connection?.ready && connectedHostname === purchasedHostname ? <p className="domain-managed-dns">연결 설정(DNS)은 오늘창업이 해 두었어요. 보통 몇 분 안에 보안 인증서까지 자동으로 연결됩니다.</p> : !connection?.ready && <ol>
            <li><span>1</span><div><strong>도메인을 구매한 사이트의 DNS 관리로 이동</strong><p>가비아·호스팅케이알·카페24 등 구매한 곳에서 설정합니다.</p></div></li>
            <li><span>2</span><div><strong>CNAME 한 줄 추가</strong><p>이름은 www, 값은 아래 주소를 입력하세요.</p><button className="domain-copy-target" onClick={() => void copyTarget()}><code>{connection?.cnameTarget || "connect.oneulstart.com"}</code><em>{copied ? <CheckCircle2 /> : <Copy />}{copied ? "복사됨" : "복사"}</em></button></div></li>
            <li><span>3</span><div><strong>저장한 뒤 연결 확인</strong><p>보통 몇 분 안에 보안 인증서까지 자동으로 연결됩니다.</p></div></li>
          </ol>}
          {connection && !connection.configured && <div className="domain-service-note"><CircleAlert /><p>자동 연결 서버의 마지막 보안 설정을 준비하고 있습니다. 입력한 주소는 저장되지 않았습니다.</p></div>}
          {connection?.errors.length ? <div className="domain-service-note"><CircleAlert /><p>{connection.errors[0]}</p></div> : null}
          <div className="domain-progress-actions"><button disabled={busy} onClick={() => void load()}><RefreshCw className={action === "loading" ? "spin" : ""} /> 연결 확인</button><button className="remove" disabled={busy} onClick={() => void remove()}>{action === "removing" ? <LoaderCircle className="spin" /> : <Trash2 />} 연결 해제</button></div>
        </div>
      )}

      {message && <p className="domain-connector-message" role="status">{message}</p>}
      {!connectedHostname && !purchase && <nav className="domain-buy-links"><span>아직 도메인이 없다면</span><a href="https://domain.gabia.com/" target="_blank" rel="noreferrer">가비아 <ExternalLink /></a><a href="https://www.hosting.kr/domain" target="_blank" rel="noreferrer">호스팅케이알 <ExternalLink /></a><a href="https://www.cafe24.com/?controller=product_domain" target="_blank" rel="noreferrer">카페24 <ExternalLink /></a></nav>}
    </section>
  );
}

/*
 * 도메인 구매 대행 — 주소를 적고 비어 있는지 확인한 뒤 결제로 보낸다.
 * 확인은 등록소 답을 그대로 옮긴 참고값이라, 모를 때도 결제는 열어 둔다(등록 때 다시 확인).
 */
/** 도메인 대신 사 드리기 입력 — 오픈 범위 밖(2026-10-08)이라 지금은 그리지 않는다. 다시 열 때 위 구매 카드에서 그린다 */
export function DomainPurchaseForm({ planQuery, price, initial }: { planQuery: string; price: number; initial: string }) {
  const [value, setValue] = useState(initial);
  const [result, setResult] = useState<{ domain: string; availability: DomainAvailability } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const check = async () => {
    if (checking || value.trim().length < 4) return;
    setChecking(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/public/domain-check?domain=${encodeURIComponent(value.trim())}`, { cache: "no-store" });
      const payload = await response.json() as { domain?: string; availability?: DomainAvailability; error?: { message?: string } };
      if (!response.ok || !payload.domain || !payload.availability) throw new Error(payload.error?.message ?? "주소를 확인하지 못했어요.");
      setResult({ domain: payload.domain, availability: payload.availability });
      setValue(payload.domain);
    } catch (e) {
      setError(userErrorMessage(e, "주소를 확인하지 못했어요."));
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="domain-purchase">
      <strong>도메인이 없어요 — 대신 사서 연결해 주세요</strong>
      <p>원하는 주소를 적으면 사장님 명의로 등록하고 연결까지 해 드려요. 첫해 등록비 포함, .com·.kr·.co.kr 주소만 가능해요.</p>
      <form className="domain-connect-form" onSubmit={(event) => { event.preventDefault(); void check(); }}>
        <label><span>원하는 주소</span><input value={value} onChange={(event) => { setValue(event.target.value); setResult(null); setError(""); }} placeholder="mybrand.co.kr" autoCapitalize="none" autoCorrect="off" inputMode="url" /></label>
        <button type="submit" disabled={checking || value.trim().length < 4}>{checking ? <LoaderCircle className="spin" /> : <Search />} 비어 있는지 확인</button>
      </form>
      {error ? <p className="domain-purchase-result taken" role="alert">{error}</p> : null}
      {result ? (
        <p className={`domain-purchase-result ${result.availability}`} role="status">
          {result.availability === "available" ? <><strong>{result.domain}</strong> 은(는) 비어 있어요.</>
            : result.availability === "taken" ? <><strong>{result.domain}</strong> 은(는) 이미 누가 쓰고 있어요. 다른 이름이나 끝자리(.co.kr·.kr·.com)를 확인해 보세요.</>
            : <>지금은 등록 여부를 확인하지 못했어요. 결제 후 등록할 때 다시 확인하고, 살 수 없으면 전액 환불하거나 다른 주소로 바꿔 드려요.</>}
        </p>
      ) : null}
      {result && result.availability !== "taken" ? (
        <a className="domain-buy-cta" href={`${planQuery}&product=domain-purchase&domain=${encodeURIComponent(result.domain)}`}>{price.toLocaleString("ko-KR")}원 · 1년 — {result.domain} 사서 연결하기</a>
      ) : null}
    </div>
  );
}
