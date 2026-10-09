"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { HOMEPAGE_EXPERT_SERVICE_ID } from "../lib/services/catalog";

/*
 * 홈페이지 6번 '전문가 상담' — 담당자가 직접 손봐 주는 고퀄리티 개선 상담 신청(소유자 요청 2026-10-09).
 * 신청은 '다음 단계' 서비스 신청(/api/plan/services)을 그대로 쓴다. 접수되면 운영자에게 문자·메일이 가고,
 * 담당자가 전화로 원하는 수정을 듣고 개별로 반영한다. 가격은 상담 후 안내.
 */
type ExistingRequest = { serviceId: string; status: string };

export function HomepageExpertConsult({ planId }: { planId: string | null }) {
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [state, setState] = useState<"loading" | "idle" | "sending" | "done" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!planId) { setState("idle"); return; }
    let alive = true;
    fetch(`/api/plan/services?planId=${encodeURIComponent(planId)}`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then((data: { requests?: ExistingRequest[]; suggestedPhone?: string } | null) => {
        if (!alive) return;
        if (data?.suggestedPhone) setPhone(current => current || data.suggestedPhone!);
        const open = data?.requests?.some(item => item.serviceId === HOMEPAGE_EXPERT_SERVICE_ID && !["done", "cancelled"].includes(item.status));
        setState(open ? "done" : "idle");
      })
      .catch(() => { if (alive) setState("idle"); });
    return () => { alive = false; };
  }, [planId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!planId || state === "sending") return;
    setState("sending"); setMessage("");
    try {
      const response = await fetch("/api/plan/services", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, serviceId: HOMEPAGE_EXPERT_SERVICE_ID, phone, preferredTime: "", memo }),
      });
      const data = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      if (response.ok || data?.error?.code === "ALREADY_REQUESTED") { setState("done"); return; }
      setState("error"); setMessage(data?.error?.message ?? "신청하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } catch {
      setState("error"); setMessage("연결이 끊겼어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  if (state === "loading") return <p className="hk-expert-note"><LoaderCircle size={15} className="hk-spin" aria-hidden /> 확인하고 있어요</p>;
  if (state === "done") return <p className="hk-expert-done" role="status"><Check size={16} aria-hidden /> 상담을 신청했어요. 담당자가 곧 전화드릴게요.</p>;
  return (
    <form className="hk-expert" onSubmit={submit}>
      <p className="hk-expert-note">담당자가 전화로 원하는 부분을 듣고 사진·문구·디자인을 직접 다듬어 드려요. 비용은 상담 후 안내해요.</p>
      <label>
        <span>연락받을 휴대폰</span>
        <input type="tel" inputMode="tel" autoComplete="tel" maxLength={13} placeholder="010-0000-0000" value={phone} onChange={event => setPhone(event.target.value)} required />
      </label>
      <label>
        <span>고치고 싶은 부분 (선택)</span>
        <textarea rows={3} maxLength={1000} placeholder="예: 첫 화면 사진을 가게 사진으로, 메뉴 표를 깔끔하게" value={memo} onChange={event => setMemo(event.target.value)} />
      </label>
      {message && <p className="hk-expert-error" role="alert">{message}</p>}
      <div className="hk-fold-save"><button type="submit" disabled={!planId || state === "sending" || !phone.trim()}>{state === "sending" ? "신청하는 중" : "전문가 상담 신청하기"}</button></div>
    </form>
  );
}
