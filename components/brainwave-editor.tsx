"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, LoaderCircle, Redo2, Save, Undo2, X } from "lucide-react";
import type { LandingPageData } from "../lib/landing/page-data";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";
import { BrainwavePage, loadBrainwavePage, type BrainwavePageData } from "./brainwave-page";
import { resizeImage, uploadImage } from "./landing-media-field";

/*
 * Brainwave.io 킷 페이지 자리 편집기.
 *
 * 페이지는 킷 그대로이고, 손대는 것은 둘뿐이다 — 글 자리와 사진 자리.
 *   · 글을 누르면 그 자리에서 고친다(contentEditable). 줄바꿈은 Enter.
 *   · 사진을 누르면 파일을 골라 바꾼다(스토리지에 올리고 주소만 저장).
 *   · 위쪽에서 26장 중 다른 페이지로 바꿀 수 있다 — 바꾸면 고친 글은 그 페이지
 *     노드 id 와 맞지 않으므로 버린다(물어본 뒤).
 * 칸을 옮기거나 색을 바꾸는 기능은 없다 — 킷 구조를 그대로 지키기 위해서다.
 */
type Over = { texts: Record<string, string>; images: Record<string, string> };

export function BrainwaveEditor({
  data,
  onClose,
  onSave,
}: {
  data: LandingPageData;
  onClose: () => void;
  onSave: (data: LandingPageData) => void;
}) {
  const init = data.brainwave!;
  const [page, setPage] = useState(init.page);
  const [over, setOver] = useState<Over>({ texts: { ...init.texts }, images: { ...init.images } });
  const [history, setHistory] = useState<Over[]>([]);
  const [future, setFuture] = useState<Over[]>([]);
  const [meta, setMeta] = useState<BrainwavePageData | null>(null);
  const [editing, setEditing] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingImage = useRef<string | null>(null);

  useEffect(() => { loadBrainwavePage(page).then(setMeta).catch(() => setMeta(null)); }, [page]);

  const commit = (next: Over) => {
    setHistory((h) => [...h.slice(-40), over]);
    setFuture([]);
    setOver(next);
  };
  const undo = () => { const prev = history.at(-1); if (!prev) return; setHistory((h) => h.slice(0, -1)); setFuture((f) => [over, ...f]); setOver(prev); };
  const redo = () => { const nxt = future[0]; if (!nxt) return; setFuture((f) => f.slice(1)); setHistory((h) => [...h, over]); setOver(nxt); };

  /* 글 자리 — 그 자리에서 고친다 */
  const pickText = (id: string, el: HTMLElement) => {
    if (editing?.el === el) return;
    finishText();
    el.contentEditable = "plaintext-only";
    el.focus();
    setEditing({ id, el });
  };
  /* 고치던 글을 마무리하고, 반영된 값을 돌려준다 — 저장 때 setState 가 늦어
     옛 값을 저장하는 일이 있었다 */
  const finishText = (): Over => {
    if (!editing) return over;
    const { id, el } = editing;
    el.contentEditable = "false";
    const text = el.innerText;
    const original = meta?.slots.text.find((t) => t.id === id)?.text ?? "";
    const next = { ...over, texts: { ...over.texts } };
    if (text === original) delete next.texts[id]; else next.texts[id] = text;
    setEditing(null);
    if (JSON.stringify(next.texts) !== JSON.stringify(over.texts)) { commit(next); return next; }
    return over;
  };

  /* 사진 자리 — 파일 고르기 */
  const pickImage = (id: string) => { finishText(); pendingImage.current = id; fileRef.current?.click(); };
  const onFile = async (file?: File) => {
    const id = pendingImage.current;
    if (!file || !id) return;
    setUploading(id); setError("");
    try {
      const url = await uploadImage(await resizeImage(file, "hero"), "hero");
      commit({ ...over, images: { ...over.images, [id]: url } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 올리지 못했습니다.");
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const changePage = (next: string) => {
    if (next === page) return;
    const dirty = Object.keys(over.texts).length + Object.keys(over.images).length > 0;
    if (dirty && !window.confirm("페이지를 바꾸면 이 페이지에서 고친 글·사진은 사라집니다. 바꿀까요?")) return;
    finishText();
    commit({ texts: {}, images: {} });
    setPage(next);
  };

  const save = () => {
    const final = finishText();
    onSave({ ...data, brainwave: { page, texts: final.texts, images: final.images }, content: [] });
  };

  const changed = Object.keys(over.texts).length + Object.keys(over.images).length;

  return (
    <div className="landing-visual-builder bw-editor" role="dialog" aria-modal="true" aria-label="홈페이지 글·사진 고치기">
      <header className="bw-editor-bar">
        <div className="bw-editor-left">
          <strong>글·사진 고치기</strong>
          <label className="bw-editor-page">
            <span>페이지</span>
            <select value={page} onChange={(e) => changePage(e.target.value)}>
              <optgroup label="랜딩 (10)">
                {BRAINWAVE_PAGES.filter((p) => p.group === "landing").map((p) => <option key={p.id} value={p.id}>{p.name} · {p.ko}</option>)}
              </optgroup>
              <optgroup label="안쪽 페이지 (16)">
                {BRAINWAVE_PAGES.filter((p) => p.group === "inner").map((p) => <option key={p.id} value={p.id}>{p.name} · {p.ko}</option>)}
              </optgroup>
            </select>
          </label>
          <small>글을 누르면 그 자리에서 고치고, 사진을 누르면 바꿉니다. {changed ? `고친 자리 ${changed}개` : ""}</small>
        </div>
        <div className="bw-editor-right">
          <button type="button" onClick={undo} disabled={!history.length} title="되돌리기"><Undo2 /></button>
          <button type="button" onClick={redo} disabled={!future.length} title="다시"><Redo2 /></button>
          <button type="button" className="bw-editor-save" onClick={save}><Save /> 저장</button>
          <button type="button" onClick={() => { finishText(); onClose(); }} title="닫기"><X /></button>
        </div>
      </header>
      {error ? <p className="bw-editor-error">{error}</p> : null}
      <div className="bw-editor-stage" onClick={finishText}>
        <div className="bw-editor-canvas">
          <BrainwavePage
            pageId={page}
            overrides={over}
            onPick={(kind, id, el) => (kind === "text" ? pickText(id, el) : pickImage(id))}
          />
          {uploading ? <div className="bw-editor-uploading"><LoaderCircle className="spin" /> 사진 올리는 중</div> : null}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <p className="bw-editor-hint"><ImageUp /> 사진은 그 자리 크기에 맞춰 잘려 들어갑니다. 칸을 옮기거나 색을 바꾸는 기능은 없습니다 — 킷 구조를 그대로 지킵니다.</p>
    </div>
  );
}
