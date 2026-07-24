"use client";

import {
  CheckCircle2,
  CircleAlert,
  Copy,
  ExternalLink,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LandingDomainConnection } from "../lib/landing/custom-domain";
import type { LandingSiteRecord } from "../lib/landing/domain";

type DomainPayload = {
  site: LandingSiteRecord;
  connection?: LandingDomainConnection;
  error?: { message?: string };
};

export function LandingDomainConnector({
  projectId,
  initialCustomDomain,
  published,
  demo,
  onSiteUpdated,
}: {
  projectId: string | null;
  initialCustomDomain: string;
  published: boolean;
  demo: boolean;
  onSiteUpdated: (site: LandingSiteRecord) => void;
}) {
  const [hostname, setHostname] = useState(initialCustomDomain);
  const [connection, setConnection] = useState<LandingDomainConnection | null>(null);
  const [action, setAction] = useState<"idle" | "loading" | "connecting" | "removing">("idle");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!projectId || demo) return;
    if (!quiet) setAction("loading");
    try {
      const response = await fetch(`/api/projects/${projectId}/landing/domain`, { cache: "no-store" });
      const payload = await response.json() as DomainPayload;
      if (!response.ok) throw new Error(payload.error?.message ?? "도메인 상태를 확인하지 못했습니다.");
      setConnection(payload.connection ?? null);
      setHostname(payload.site.customDomain ?? "");
      onSiteUpdated(payload.site);
      if (!quiet) setMessage(payload.connection?.ready ? "도메인 연결이 완료되었습니다." : "");
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : "도메인 상태를 확인하지 못했습니다.");
    } finally {
      if (!quiet) setAction("idle");
    }
  }, [demo, onSiteUpdated, projectId]);

  useEffect(() => {
    setHostname(initialCustomDomain);
    if (projectId && !demo) void load();
  }, [demo, initialCustomDomain, load, projectId]);

  useEffect(() => {
    if (!connection?.hostname || connection.ready || !connection.configured || !projectId) return;
    const timer = window.setInterval(() => void load(true), 8000);
    return () => window.clearInterval(timer);
  }, [connection?.configured, connection?.hostname, connection?.ready, load, projectId]);

  const connect = async () => {
    if (!projectId || action !== "idle") return;
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
      setMessage(error instanceof Error ? error.message : "도메인을 연결하지 못했습니다.");
    } finally {
      setAction("idle");
    }
  };

  const remove = async () => {
    if (!projectId || action !== "idle") return;
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
      setMessage(error instanceof Error ? error.message : "도메인 연결을 해제하지 못했습니다.");
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
  return (
    <section className="landing-domain-connector">
      <div className="domain-connector-title"><Globe2 /><span><strong>내 도메인 연결</strong><p>구매한 주소의 www 주소만 입력하면 됩니다.</p></span>{connection?.ready ? <em className="ready"><CheckCircle2 /> 연결 완료</em> : connectedHostname ? <em><LoaderCircle /> 연결 확인 중</em> : null}</div>

      {!connectedHostname ? (
        <div className="domain-connect-form">
          <label><span>구매한 도메인</span><input value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="www.mybrand.com" autoCapitalize="none" autoCorrect="off" /></label>
          <button disabled={!published || busy || hostname.trim().length < 4} onClick={() => void connect()}>{action === "connecting" ? <LoaderCircle className="spin" /> : <Globe2 />} 연결 시작</button>
          {!published && <small>먼저 위의 ‘저장하고 공개’를 눌러 홈페이지를 공개해주세요.</small>}
        </div>
      ) : (
        <div className="domain-connection-progress">
          <div className="domain-connected-address"><span><small>연결할 주소</small><strong>{connectedHostname}</strong></span>{connection?.ready && <a href={`https://${connectedHostname}`} target="_blank" rel="noreferrer">열기 <ExternalLink /></a>}</div>
          {!connection?.ready && <ol>
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
      {!connectedHostname && <nav className="domain-buy-links"><span>아직 도메인이 없다면</span><a href="https://domain.gabia.com/" target="_blank" rel="noreferrer">가비아 <ExternalLink /></a><a href="https://www.hosting.kr/domain" target="_blank" rel="noreferrer">호스팅케이알 <ExternalLink /></a><a href="https://www.cafe24.com/?controller=product_domain" target="_blank" rel="noreferrer">카페24 <ExternalLink /></a></nav>}
    </section>
  );
}
