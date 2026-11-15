"use client";

import { useEffect, useState } from "react";
import { AppButton } from "../../../components/app-button";
import { TextField } from "../../../components/app-field";
import { STAGE_ALERT_CONSENT } from "../../../lib/notify/account-alert-contact";
import styles from "./StageAlertOffer.module.css";

/*
 * 대화 끝(사업 방향을 정리한 직후)에 한 번 권한다 — "다음 할 일을 문자로 받아 볼까요?"(2026-11-15 사장님 — 알림톡을 붙이기 전까지는 문자라고 말한다).
 * 계정에 한 번만: 번호를 등록했거나 '괜찮아요'를 누른 계정에는 다시 묻지 않는다(서버가 기억). 나중에는 환경설정 → 진행 단계 안내에서 켠다.
 */
export default function StageAlertOffer() {
  const [show, setShow] = useState(false);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    // 못 물어보면(로그아웃 · 연결 끊김) 권하지 않는다
    fetch("/api/account/alerts", { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(data => { if (alive && data?.offer === true) setShow(true); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function send(command: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(data?.error?.message ?? "저장하지 못했어요. 잠시 후 다시 시도해 주세요."); return false; }
      return true;
    } catch { setError("저장하지 못했어요. 연결을 확인해 주세요."); return false; }
    finally { setBusy(false); }
  }
  if (!show) return null;
  if (done) return <p className={styles.done} role="status">등록했어요. 단계가 넘어가면 다음 할 일을 보내 드릴게요.</p>;
  return <form className={styles.offer} data-stage-alert-offer onSubmit={async event => { event.preventDefault(); if (await send({ action: "register", phone, agreed })) setDone(true); }} noValidate>
    <strong>다음 할 일을 문자로 받아 볼까요?</strong>
    <p>계획서 완성, 홈페이지 공개처럼 단계가 넘어갈 때만 보내요.</p>
    <label className={styles.label} htmlFor="stage-offer-phone">휴대폰 번호</label>
    <div className={styles.input}><TextField id="stage-offer-phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000" aria-invalid={error.includes("번호") || undefined} aria-describedby={error ? "stage-offer-error" : undefined} value={phone} onChange={event => setPhone(event.target.value)} /></div>
    {/* 환경설정 등록 칸과 같은 모양 — 번호 → 회색 동의 상자 → 단추. 동의 글은 첫 문장을 제목으로 나눠 보인다 */}
    <label className={styles.agree}><input id="stage-offer-agree" type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /><span><b>{STAGE_ALERT_CONSENT.slice(0, STAGE_ALERT_CONSENT.indexOf(". "))}</b>{STAGE_ALERT_CONSENT.slice(STAGE_ALERT_CONSENT.indexOf(". ") + 1)}</span></label>
    {error && <p id="stage-offer-error" role="alert" className={styles.error}>{error}</p>}
    <div className={styles.acts}>
      <AppButton type="submit" variant="primary" disabled={busy}>받을게요</AppButton>
      {/* 괜찮아요 — 다시 묻지 않는다. 기억하지 못해도(연결 끊김) 이번 화면에서는 닫는다 */}
      <AppButton type="button" variant="soft" disabled={busy} onClick={() => { setShow(false); void send({ action: "decline" }); }}>괜찮아요</AppButton>
    </div>
  </form>;
}
