"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { LEAD_NOTIFICATION_LABELS, LEAD_NOTIFICATION_MAX_ATTEMPTS, type LeadNotificationSummary } from "../lib/landing/lead-notification-types";

export function useHomepageLeadNotifications(projectId: string | null, refresh: number) {
  const [items, setItems] = useState<LeadNotificationSummary[] | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const retryRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setItems(null); setError(""); setRetrying(null);
    if (projectId) fetch(`/api/projects/${projectId}/landing/notifications`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok || !Array.isArray(body.notifications)) throw new Error(); if (!controller.signal.aborted) setItems(body.notifications); })
      .catch(() => { if (!controller.signal.aborted) setError("메일 알림 상태를 확인하지 못했습니다 문의 내용은 아래에서 확인할 수 있습니다"); });
    return () => { controller.abort(); retryRequest.current?.abort(); };
  }, [projectId, refresh]);
  async function retry(leadId: string) {
    if (!projectId || retrying) return;
    setRetrying(leadId); setError("");
    const controller = new AbortController(); retryRequest.current = controller;
    try {
      const response = await fetch(`/api/projects/${projectId}/landing/notifications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.notifications)) throw new Error();
      if (!controller.signal.aborted) setItems(body.notifications);
    } catch { if (!controller.signal.aborted) setError("메일 재시도 결과를 확인하지 못했습니다 새로고침해 확인해주세요"); }
    finally { if (!controller.signal.aborted) setRetrying(null); }
  }
  return { items, error, retrying, retry };
}

export function HomepageLeadNotification({ value, busy, onRetry }: { value: LeadNotificationSummary | undefined; busy: boolean; onRetry: () => void }) {
  if (!value) return <small>메일 알림 기록 없음</small>;
  const message = value.errorCode === "missing_email_config" ? "발송 설정이 없어 문의 목록에만 저장됐습니다"
    : value.errorCode === "recipient_missing" ? "계정 이메일 확인이 필요합니다"
    : value.errorCode === "delivery_unknown" ? "발송 여부 확인이 필요합니다"
    : value.errorCode === "provider_rejected" ? "메일 서비스에서 발송을 거절했습니다" : "";
  const canRetry = value.attempts < LEAD_NOTIFICATION_MAX_ATTEMPTS && ["pending", "retry", "blocked"].includes(value.status);
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
    <small>{LEAD_NOTIFICATION_LABELS[value.status]}{message ? ` · ${message}` : ""}</small>
    {canRetry ? <button type="button" disabled={busy} onClick={onRetry} title="문의 알림 이메일 재시도" aria-label="문의 알림 이메일 재시도" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", border: "1px solid #d8e1ed", borderRadius: 6, background: "transparent", color: "#365f98", fontSize: 12 }}>{busy ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />} 재시도</button> : null}
  </div>;
}
