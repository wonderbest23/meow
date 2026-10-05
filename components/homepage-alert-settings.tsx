"use client";

import { useEffect, useState } from "react";

type Settings = { phone: string | null; phoneReady: boolean; weeklyEnabled: boolean | null; published: boolean; smsReady: boolean; emailReady: boolean };

const pretty = (phone: string) => phone.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3");

/*
 * 사장님 알림 — 새 문의와 주간 리포트를 문자로(알리고). 번호는 공개 홈페이지에 나가지 않는다.
 * 가게 전화가 010 이면 그 번호를 먼저 채워 둔다(저장은 동의하고 눌러야 된다).
 */
export function HomepageAlertSettings({ projectId, suggestedPhone }: { projectId: string | null; suggestedPhone?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    void fetch(`/api/projects/${projectId}/landing/alerts`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as Settings;
        setSettings(data);
        const suggested = (suggestedPhone ?? "").replace(/[\s-]/g, "");
        setPhone(data.phone ? pretty(data.phone) : /^010\d{8}$/.test(suggested) ? pretty(suggested) : "");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [projectId, suggestedPhone]);
  if (!projectId || !settings || !settings.phoneReady) return null;

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/landing/alerts`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as Settings & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "저장하지 못했어요.");
      setSettings(data); setPhone(data.phone ? pretty(data.phone) : ""); setAgreed(false); setMessage(done);
    } catch (e) { setMessage(e instanceof Error ? e.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  };
  const typed = phone.replace(/[\s-]/g, "");
  const changed = typed !== (settings.phone ?? "");
  return (
    <div className="hk-alerts">
      <form onSubmit={(event) => { event.preventDefault(); void save({ phone: typed, agreed }, typed ? "문자 받을 휴대폰을 저장했어요." : "문자 알림을 껐어요."); }}>
        <label className="hk-alerts-phone"><span>문의 알림 문자 받을 휴대폰</span>
          <input value={phone} onChange={(event) => { setPhone(event.target.value); setMessage(""); }} inputMode="tel" placeholder="010-1234-5678" autoComplete="tel" />
        </label>
        {changed && typed ? <label className="hk-alerts-agree"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>새 문의와 주간 리포트를 이 번호로 문자로 받는 데 동의합니다. 번호는 알림에만 쓰고 홈페이지에 공개하지 않아요.</span></label> : null}
        <button type="submit" disabled={busy || !changed || (Boolean(typed) && !agreed)}>{typed ? "저장" : "문자 끄기"}</button>
      </form>
      <small>{!settings.smsReady ? "문자 발송 준비가 끝나면 이 번호로 알림이 가요. 지금 들어온 문의는 아래 목록에 그대로 쌓여요."
        : settings.phone ? `새 문의가 들어오면 ${pretty(settings.phone)}로 바로 문자를 보내 드려요.` : "번호를 등록하면 새 문의가 들어올 때 바로 문자를 보내 드려요."}</small>
      {settings.weeklyEnabled !== null ? (
        <label className="hk-alerts-weekly">
          <input type="checkbox" checked={settings.weeklyEnabled} disabled={busy} onChange={(event) => void save({ weeklyEnabled: event.target.checked }, event.target.checked ? "주간 리포트를 켰어요." : "주간 리포트를 껐어요.")} />
          <span><strong>주간 리포트 받기</strong><small>매주 월요일 아침, 지난주 문의·방문 수를 {settings.smsReady && settings.phone ? "문자로" : "가입한 이메일로"} 보내 드려요{settings.published ? "" : "(홈페이지를 공개한 뒤부터)"}.</small></span>
        </label>
      ) : null}
      {message ? <p className="hk-alerts-msg" role="status">{message}</p> : null}
    </div>
  );
}
