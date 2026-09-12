"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DECK_PHASE_LABELS, deckFailureMessage, type PublicDeckJob } from "../../../lib/plan-builder/deck-job-types";
import { PPT_GENERATION_VERIFIED, PPT_PREPARING_MESSAGE } from "../../../lib/plan-builder/deck-availability";

export function useDeckExport(planId: string | null, enabled: boolean, title: string) {
  const [job, setJob] = useState<PublicDeckJob | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [generationEnabled, setGenerationEnabled] = useState(PPT_GENERATION_VERIFIED);
  const [downloading, setDownloading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uncertainUntil, setUncertainUntil] = useState(0);
  const uncertain = useRef(uncertainUntil); uncertain.current = uncertainUntil;
  const currentId = useRef(planId); currentId.current = planId;
  const polling = useRef<AbortController | null>(null);
  const action = useRef<AbortController | null>(null);
  const busy = !!job && ["queued", "running"].includes(job.status);

  const refresh = useCallback(async () => {
    if (!planId || !enabled || polling.current) return;
    const controller = new AbortController();
    polling.current = controller;
    const timer = window.setTimeout(() => controller.abort("timeout"), 15000);
    const current = () => currentId.current === planId && polling.current === controller;
    try {
      const response = await fetch(`/api/plan/deck?planId=${encodeURIComponent(planId)}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!current() || controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.message || "제작 상태를 확인하지 못했어요.");
      setJob(data.job ?? null); setStale(!!data.stale); setLoaded(true); setStatusError(null);
      setGenerationEnabled(data.generationEnabled === true);
      if (data.job) {
        if (uncertain.current) setError(null);
        setUncertainUntil(0);
      }
    } catch (failure) {
      if (current() && (!controller.signal.aborted || controller.signal.reason === "timeout")) {
        setStatusError(failure instanceof Error && !controller.signal.aborted ? failure.message : "접수 상태를 확인하지 못했어요. 연결되면 다시 확인합니다.");
      }
    } finally {
      window.clearTimeout(timer);
      if (polling.current === controller) polling.current = null;
    }
  }, [planId, enabled]);

  useEffect(() => {
    setJob(null); setStale(false); setError(null); setStatusError(null); setLoaded(false);
    setSubmitting(false); setDownloading(false); setUncertainUntil(0); setGenerationEnabled(PPT_GENERATION_VERIFIED);
    void refresh();
    const reconnect = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    document.addEventListener("visibilitychange", reconnect);
    return () => {
      polling.current?.abort(); polling.current = null;
      action.current?.abort(); action.current = null;
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      document.removeEventListener("visibilitychange", reconnect);
    };
  }, [refresh]);

  useEffect(() => {
    if (!busy && !uncertainUntil && !statusError) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (uncertainUntil && Date.now() >= uncertainUntil) {
        setUncertainUntil(0);
        setError("접수 결과를 확정하지 못했어요. 상태를 다시 확인한 후 재시도해주세요. 이미 접수된 작업은 중복 생성하지 않습니다.");
      }
      void refresh();
    }, statusError ? 12000 : 4000);
    return () => window.clearInterval(timer);
  }, [busy, uncertainUntil, statusError, refresh]);

  async function startOrDownload() {
    if (!planId || !enabled || busy || uncertainUntil || action.current) return;
    if (!loaded || statusError) { await refresh(); return; }
    const ready = !!job?.ready && !stale;
    if (!ready && !generationEnabled) { setError(PPT_PREPARING_MESSAGE); return; }
    const controller = new AbortController();
    action.current = controller;
    const timer = window.setTimeout(() => controller.abort("timeout"), ready ? 90000 : 20000);
    const current = () => currentId.current === planId && action.current === controller;
    setError(null); setDownloading(ready); setSubmitting(!ready);
    let accepted = false;
    let rejected = false;
    try {
      const response = ready
        ? await fetch(`/api/plan/deck?planId=${encodeURIComponent(planId)}&download=1`, { cache: "no-store", signal: controller.signal })
        : await fetch("/api/plan/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ background: true, planId }), signal: controller.signal });
      if (!response.ok) {
        rejected = response.status < 500;
        const data = await response.json();
        if (data.code === "ppt_preparing") { rejected = true; if (current()) setGenerationEnabled(false); }
        throw new Error(data.message || (ready ? "파일 제작에 실패했어요." : "제작 요청을 보내지 못했어요."));
      }
      if (ready) {
        const blob = await response.blob();
        if (!current() || controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = `${title} 사업 제안서.pptx`; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const data = await response.json();
        if (!current() || controller.signal.aborted) return;
        accepted = !!data.job;
        setJob(data.job ?? null); setStale(!!data.stale);
        if (!accepted) setUncertainUntil(Date.now() + 30000);
      }
    } catch (failure) {
      if (current() && (!controller.signal.aborted || controller.signal.reason === "timeout")) {
        setError(failure instanceof Error && !controller.signal.aborted ? failure.message : ready ? "내려받기 연결이 끊겼어요. 완성된 자료는 유지되어 있으니 다시 내려받아주세요." : "서버 접수 여부를 확인하고 있어요. 다시 생성하지 않고 상태부터 확인합니다.");
        // A lost POST response does not mean the server rejected the job.
        if (!ready && !accepted && !rejected) { setUncertainUntil(Date.now() + 30000); void refresh(); }
      }
    } finally {
      window.clearTimeout(timer);
      if (current()) { action.current = null; setSubmitting(false); setDownloading(false); }
    }
  }
  const ready = !!job?.ready && !stale;
  const message = busy ? `${DECK_PHASE_LABELS[job!.phase]} · ${job!.resumable ? "슬라이드 초안이 저장됐어요. " : "원본 계획서는 저장되어 있어요. "}화면을 나가도 서버에서 계속 진행해요.`
    : uncertainUntil ? "제작 접수 상태를 확인하고 있어요. 중복 요청은 보내지 않습니다."
    : job?.status === "failed" ? `${deckFailureMessage(job.code, job.resumable && !["source_validation_failed", "invalid_slides", "review_json_invalid"].includes(job.code ?? ""))} 문의 번호: ${job.token.slice(0, 8)}`
    : ready ? DECK_PHASE_LABELS.ready
    : !generationEnabled ? PPT_PREPARING_MESSAGE
    : stale ? "계획서가 수정됐어요. 최신 내용으로 발표자료를 다시 만들어주세요." : "";
  return { busy: busy || submitting || downloading || !!uncertainUntil, canRequest: enabled && (ready || generationEnabled), message, error: error || statusError, refresh, startOrDownload,
    label: downloading ? "PPT 파일을 준비하고 있어요" : busy || submitting ? "발표자료 제작 중" : uncertainUntil ? "PPT 접수 확인 중" : ready ? "완성된 PPT 내려받기" : !generationEnabled ? "PPT 제공 준비 중" : !loaded || statusError ? "PPT 상태 다시 확인" : stale ? "최신 내용으로 PPT 만들기" : job?.status === "failed" ? "발표자료 다시 시도" : "발표자료 PPT" };
}
