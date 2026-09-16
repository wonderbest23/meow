"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, RefreshCw, X } from "lucide-react";
import type { LandingDraft, LandingSiteRecord } from "../lib/landing/domain";
import type { ArtifactPreview } from "../lib/plan-builder/artifact-updates";
import { landingDraftFingerprint } from "../lib/landing/save-contract";
import styles from "./homepage-source-update.module.css";

export function HomepageSourceUpdate({ projectId, draft, site, disabled, onApplied }: {
  projectId: string; draft: LandingDraft; site: LandingSiteRecord; disabled: boolean;
  onApplied: (site: LandingSiteRecord, expectedUpdatedAt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ArtifactPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, "replace" | "keep">>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const pending = useRef<{ id: string; hash: string; choices: Record<string, "replace" | "keep"> } | null>(null);
  const current = useRef({ projectId, draft, site, disabled });
  current.current = { projectId, draft, site, disabled };
  const dirty = landingDraftFingerprint(draft) !== landingDraftFingerprint(site.draft);
  const changes = preview?.homepage?.sourcePreview.changes ?? [];
  const selected = Object.values(choices).filter(choice => choice === "replace").length;
  const stale = Boolean(preview && (preview.base.homepageRevision !== site.updatedAt || dirty));

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    request.current?.abort(); request.current = null; pending.current = null;
    setOpen(false); setBusy(false); setPreview(null); setChoices({}); setMessage("");
    dialog.current?.close();
    return () => { request.current?.abort(); request.current = null; };
  }, [projectId]);
  function requestIsCurrent(controller: AbortController) {
    return request.current === controller && !controller.signal.aborted && current.current.projectId === projectId;
  }
  function close() {
    if (busy) return;
    setOpen(false);
  }
  async function load() {
    if (disabled || dirty || busy) return;
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    setOpen(true); setBusy(true); setMessage(""); setPreview(null); pending.current = null;
    try {
      const response = await fetch(`/api/plan/landing/source?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!requestIsCurrent(controller)) return;
      if (!response.ok) throw new Error(body.error?.message ?? body.message ?? "변경 정보를 확인하지 못했습니다.");
      const next = body.preview as ArtifactPreview;
      if (next.homepage && !next.homepage.sourcePreview?.supported) throw new Error("이 홈페이지는 최신 정보 비교를 지원하는 템플릿이 아닙니다.");
      setPreview(next);
      setChoices(Object.fromEntries((next.homepage?.sourcePreview.changes ?? []).map(change => [change.id, change.conflict ? "keep" : "replace"])));
    } catch (error) {
      if (requestIsCurrent(controller)) setMessage(error instanceof Error ? error.message : "변경 정보를 확인하지 못했습니다.");
    } finally { if (requestIsCurrent(controller)) { request.current = null; setBusy(false); } }
  }
  async function apply() {
    if (!preview?.homepage || !selected || busy || stale || disabled) return;
    const controller = new AbortController(); request.current = controller;
    const expected = preview.homepage.sourcePreview.expectedUpdatedAt;
    const receipt = pending.current ?? { id: crypto.randomUUID(), hash: preview.hash, choices: { ...choices } };
    pending.current = receipt;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/plan/artifact-updates", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ planId: preview.planId, command: { type: "homepage_apply", id: receipt.id, hash: receipt.hash, base: preview.base, choices: receipt.choices } }),
      });
      const body = await response.json();
      if (!requestIsCurrent(controller)) return;
      if (!response.ok) throw new Error(body.error?.message ?? body.message ?? "반영 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해주세요.");
      let saved = body.site as LandingSiteRecord | undefined;
      if (!saved) {
        const refreshed = await fetch(`/api/projects/${projectId}/landing`, { cache: "no-store", signal: controller.signal });
        const data = await refreshed.json();
        if (!refreshed.ok || !data.site) throw new Error(data.error?.message ?? data.message ?? "반영 요청 후 최신 초안을 확인하지 못했습니다. 같은 요청으로 다시 확인해주세요.");
        saved = data.site;
      }
      if (!requestIsCurrent(controller) || !saved) return;
      if (landingDraftFingerprint(current.current.draft) !== landingDraftFingerprint(current.current.site.draft)) {
        setMessage("서버 초안은 반영됐지만 현재 화면에 저장되지 않은 수정이 있어 유지했습니다. 최신 초안을 다시 불러와주세요.");
        return;
      }
      onApplied(saved, expected);
      pending.current = null;
      setOpen(false);
    } catch (error) {
      if (requestIsCurrent(controller)) setMessage(error instanceof Error ? error.message : "반영 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해주세요.");
    } finally { if (requestIsCurrent(controller)) { request.current = null; setBusy(false); } }
  }
  return <>
    <button type="button" onClick={load} disabled={disabled || dirty || busy} title={dirty ? "현재 수정 내용을 저장한 뒤 최신 사업정보를 확인해주세요" : "최신 사업정보 비교"}><RefreshCw size={14} /> 최신 사업정보</button>
    <dialog ref={dialog} className={styles.dialog} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="homepage-source-title">
      <header className={styles.header}><div><h3 id="homepage-source-title">최신 사업정보 비교</h3><p>선택한 내용만 초안에 반영됩니다 공개 페이지는 바뀌지 않습니다</p></div><button type="button" aria-label="비교 닫기" title="비교 닫기" disabled={busy} onClick={close}><X size={20} /></button></header>
      <div className={styles.body}>
        {busy && !preview ? <p role="status"><LoaderCircle size={18} className="spin" /> 최신 정보를 확인하고 있습니다</p> : null}
        {preview && !changes.length ? <p>현재 사업정보와 동일합니다</p> : null}
        {changes.map(change => <label className={styles.change} key={change.id}>
          <div className={styles.changeTitle}><input type="checkbox" checked={choices[change.id] === "replace"} disabled={busy || stale || Boolean(pending.current)} onChange={event => setChoices(value => ({ ...value, [change.id]: event.target.checked ? "replace" : "keep" }))} /><strong>{change.label}</strong>{change.conflict ? <span>직접 수정됨</span> : null}</div>
          <div className={styles.comparison}><div><small>현재 홈페이지</small><p>{change.before || "내용 없음"}</p></div><div><small>최신 사업정보</small><p>{change.after || "내용 없음"}</p></div></div>
          {change.conflict ? <small className={styles.conflict}>{choices[change.id] === "replace" ? "직접 고친 내용을 최신 정보로 바꿉니다" : "직접 고친 내용을 유지합니다"}</small> : null}
        </label>)}
        {stale ? <p role="alert" className={styles.error}>초안이 바뀌었습니다 현재 내용을 저장한 뒤 다시 비교해주세요</p> : null}
        {message ? <p role="alert" className={styles.error}>{message}</p> : null}
      </div>
      <footer className={styles.footer}><button type="button" disabled={busy} onClick={close}>닫기</button><button type="button" className={styles.primary} disabled={busy || stale || !selected || disabled} onClick={apply}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{pending.current ? "같은 요청 다시 확인" : `${selected}개 초안에 반영`}</button></footer>
    </dialog>
  </>;
}
