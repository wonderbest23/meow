"use client";

import { useState } from "react";
import { Check, Mail, MessageSquare, Phone } from "lucide-react";
import { leadReplySubject, leadReplyText, mailtoHref, smsHref, telHref } from "../lib/contact-links";
import type { LandingLeadRecord } from "../lib/landing/domain";

/*
 * 접수된 문의 한 건의 바로 연락 단추 — [전화] [문자] [이메일] [처리 완료].
 *
 * 문의는 빨리 답할수록 손님이 남는다. 휴대폰에서 엄지로 누르기 쉽게 단추를 크게(44px) 두고,
 * 문자는 첫 인사를 미리 채워 바로 보낼 수 있게 한다.
 * '처리 완료'는 DB 칸(handled_at)이 있을 때만 보인다 — 마이그레이션 전에는 handledAt 이 undefined 다.
 */
export function HomepageLeadActions({ projectId, lead, businessName, onHandled }: {
  projectId: string | null;
  lead: LandingLeadRecord;
  businessName: string;
  onHandled: (leadId: string, handledAt: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tel = lead.phone ? telHref(lead.phone) : null;
  const sms = lead.phone ? smsHref(lead.phone, leadReplyText(businessName)) : null;
  const mail = lead.email ? mailtoHref(lead.email, leadReplySubject(businessName), `${lead.name}님, ${leadReplyText(businessName)}\n\n`) : null;
  const handled = Boolean(lead.handledAt);

  async function toggle() {
    if (!projectId || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/landing/leads`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id, handled: !handled }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message ?? "바꾸지 못했어요. 다시 눌러 주세요.");
      onHandled(lead.id, data.handledAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "바꾸지 못했어요. 다시 눌러 주세요.");
    } finally { setBusy(false); }
  }

  if (!tel && !sms && !mail && lead.handledAt === undefined) return null;
  return <div className="hk-lead-actions">
    {tel ? <a href={tel} className="hk-lead-btn"><Phone size={16} aria-hidden /> 전화</a> : null}
    {sms ? <a href={sms} className="hk-lead-btn"><MessageSquare size={16} aria-hidden /> 문자</a> : null}
    {mail ? <a href={mail} className="hk-lead-btn"><Mail size={16} aria-hidden /> 이메일</a> : null}
    {lead.handledAt !== undefined ? <button type="button" className={`hk-lead-btn hk-lead-done${handled ? " on" : ""}`} aria-pressed={handled} disabled={busy || !projectId} onClick={() => void toggle()}>
      <Check size={16} aria-hidden /> {handled ? "처리 완료" : "처리 완료로 표시"}
    </button> : null}
    {error ? <small role="alert" className="hk-lead-error">{error}</small> : null}
  </div>;
}
