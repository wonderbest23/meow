"use client";

import { useEffect, useState } from "react";
import { AppButton } from "../../../../components/app-button";
import { TextField } from "../../../../components/app-field";
import { SettingsCard, SettingsRow, SettingsSection, SettingsToggle } from "../../../../components/settings-row";
import { STAGE_ALERT_CONSENT, STAGE_ALERT_MOMENTS, type AlertContactView } from "../../../../lib/notify/account-alert-contact";
import styles from "./StageAlerts.module.css";

/*
 * 진행 단계 안내 받기(2026-11-15 사장님) — 계정에 휴대폰 하나를 등록하고 수신에 동의하면, 단계가 넘어갈 때 다음 할 일을 보낸다.
 * 이 화면은 번호 등록 · 동의 · 끄기 · 지우기와 저장까지만 한다(발송은 카카오 채널 심사 뒤에 붙인다).
 */
export default function StageAlerts() {
  const [contact, setContact] = useState<AlertContactView | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 지우기는 두 번 눌러야 지운다 — 한 번에 번호와 동의 기록이 사라지지 않게
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/alerts", { cache: "no-store" }).then(async response => {
      const data = await response.json().catch(() => null);
      if (!alive) return;
      if (response.ok) setContact(data?.contact ?? null);
      else { setContact(null); setLoadError(response.status === 401 ? "로그인하면 설정할 수 있어요." : data?.error?.message ?? "알림 설정을 불러오지 못했어요."); }
    }).catch(() => { if (alive) { setContact(null); setLoadError("알림 설정을 불러오지 못했어요. 연결을 확인해 주세요."); } });
    return () => { alive = false; };
  }, []);

  async function send(command: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(data?.error?.message ?? "저장하지 못했어요. 잠시 후 다시 시도해 주세요."); return false; }
      setContact(data?.contact ?? null);
      return true;
    } catch { setError("저장하지 못했어요. 연결을 확인해 주세요."); return false; }
    finally { setBusy(false); }
  }
  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (await send({ action: "register", phone, agreed })) { setEditing(false); setPhone(""); setAgreed(false); }
  }

  const moments = <ul className={styles.moments}>{STAGE_ALERT_MOMENTS.map(item => <li key={item}>{item}</li>)}</ul>;
  // 동의 글은 한 덩어리(기록과 같은 글)지만 화면에서는 첫 문장을 제목으로, 나머지를 설명으로 나눠 보인다
  const cut = STAGE_ALERT_CONSENT.indexOf(". ") + 1;
  const form = <form className={styles.form} onSubmit={register} noValidate>
    <label className={styles.label} htmlFor="stage-alert-phone">휴대폰 번호</label>
    <div className={styles.input}><TextField id="stage-alert-phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000" aria-describedby={error ? "stage-alert-error" : undefined} aria-invalid={error.includes("번호") || undefined} value={phone} onChange={event => setPhone(event.target.value)} /></div>
    <label className={styles.agree}><input id="stage-alert-agree" type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /><span><b>{STAGE_ALERT_CONSENT.slice(0, cut - 1)}</b>{STAGE_ALERT_CONSENT.slice(cut)}</span></label>
    {error && <p id="stage-alert-error" role="alert" className={styles.error}>{error}</p>}
    {/* 단추는 늘 눌린다 — 빠진 것(번호 · 동의)은 눌렀을 때 글로 알려 준다(2026-11-15 사장님: 꺼진 단추가 헷갈린다) */}
    <div className={styles.acts}>
      <AppButton type="submit" variant="primary" disabled={busy}>{busy ? "저장 중…" : "등록하기"}</AppButton>
      {editing && <AppButton type="button" variant="soft" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>취소</AppButton>}
    </div>
  </form>;

  return <SettingsSection id="pref-stage-alerts" title="진행 단계 안내" description="단계가 넘어갈 때 다음 할 일을 문자로 보내 드려요.">
    <SettingsCard mobile="band">
      {contact === undefined ? <SettingsRow title="진행 단계 안내 받기" description="불러오는 중…" />
        : loadError ? <SettingsRow title="진행 단계 안내 받기" description={loadError} />
        : !contact || editing ? <SettingsRow stack title={editing ? "받는 번호 바꾸기" : "진행 단계 안내 받기"} description={editing ? "새 번호로 다시 동의해 주세요." : "휴대폰 번호를 등록하고 동의하면 켜져요."}>{form}</SettingsRow>
        : <>
          <SettingsRow inline title="진행 단계 안내 받기" descriptionId="stage-alert-desc" description={contact.enabled ? "지금 받고 있어요." : "꺼 두었어요. 번호와 동의 기록은 남아 있어요."}
            control={<SettingsToggle checked={contact.enabled} disabled={busy} onChange={value => void send({ action: "toggle", enabled: value })} label="진행 단계 안내 받기" describedBy="stage-alert-desc" />} />
          <SettingsRow title="받는 번호" description={<>{contact.phone} <span className={styles.ok}>· {new Date(contact.agreedAt).toLocaleDateString("ko-KR", { dateStyle: "long" })} 동의</span></>}
            control={<span className={styles.acts}><AppButton type="button" variant="soft" size="adaptive" disabled={busy} onClick={() => { setEditing(true); setError(""); }}>바꾸기</AppButton><AppButton type="button" variant="soft" size="adaptive" disabled={busy} onBlur={() => setConfirmRemove(false)} onClick={() => { if (confirmRemove) { setConfirmRemove(false); void send({ action: "remove" }); } else setConfirmRemove(true); }}>{confirmRemove ? "한 번 더 누르면 지워요" : "지우기"}</AppButton></span>} />
          <SettingsRow title="보내는 시간" description="아침 8시 ~ 밤 9시. 밤에 생긴 알림은 아침에 보내요." />
          {error && <SettingsRow title="저장하지 못했어요" description={<span role="alert" className={styles.error}>{error}</span>} />}
        </>}
      <SettingsRow stack title="이럴 때 보내요">{moments}</SettingsRow>
    </SettingsCard>
  </SettingsSection>;
}
