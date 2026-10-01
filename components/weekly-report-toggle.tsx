"use client";

import { useEffect, useState } from "react";

type Setting = { enabled: boolean | null; published: boolean; emailReady: boolean };

/*
 * 주간 리포트 받기 — 매주 월요일 아침 지난주 문의·방문 수를 메일로.
 * 메일의 '그만 받기'로 끈 사람도 여기서 다시 켤 수 있다.
 */
export function WeeklyReportToggle({ projectId }: { projectId: string | null }) {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    void fetch(`/api/projects/${projectId}/landing/weekly-report`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? setSetting(await response.json() as Setting) : null)
      .catch(() => undefined);
    return () => controller.abort();
  }, [projectId]);
  if (!projectId || !setting || setting.enabled === null) return null;
  const change = async (enabled: boolean) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/landing/weekly-report`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const data = await response.json() as Setting & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "바꾸지 못했어요.");
      setSetting(data);
    } catch (e) { setError(e instanceof Error ? e.message : "바꾸지 못했어요."); }
    finally { setBusy(false); }
  };
  return (
    <label className="hk-weekly">
      <input type="checkbox" checked={setting.enabled} disabled={busy} onChange={(event) => void change(event.target.checked)} />
      <span>
        <strong>주간 리포트 메일 받기</strong>
        <small>{!setting.published ? "홈페이지를 공개하면 매주 월요일 아침 지난주 문의·방문 수를 보내 드려요."
          : !setting.emailReady ? "메일 발송 준비가 끝나면 매주 월요일 아침 지난주 문의·방문 수를 보내 드려요."
          : "매주 월요일 아침, 지난주 문의·방문 수와 이번 주에 해 볼 일 하나를 보내 드려요."}</small>
        {error ? <small role="alert" className="hk-weekly-error">{error}</small> : null}
      </span>
    </label>
  );
}
