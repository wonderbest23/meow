"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Check, Crop, RotateCcw, X } from "lucide-react";
import { IMAGE_CROP_ASPECTS, clampCropValue, cropImageFile, drawImageCrop, imageCropOutputSize, imageCropRect, loadCropImage, type ImageCropAspect, type ImageCropPosition } from "../lib/landing/image-crop";
import styles from "./landing-image-crop.module.css";

export type LandingImageCropProps = {
  file: File | null;
  /** Called once after an explicit Apply or Use original; close by setting file=null. */
  onApply: (file: File) => void;
  onCancel: () => void;
  initialAspect?: ImageCropAspect;
  /** Applied crops only, 1..4096, default 1600. Use original returns identical bytes. */
  maxOutputEdge?: number;
};
const centered: ImageCropPosition = { x: 0.5, y: 0.5, zoom: 1 };

/** Parent closes with file=null and may upload only the explicitly applied File. */
export default function LandingImageCrop({ file, onApply, onCancel, initialAspect = "original", maxOutputEdge = 1600 }: LandingImageCropProps) {
  const titleId = useId(), infoId = useId();
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [aspect, setAspect] = useState<ImageCropAspect>(initialAspect);
  const [position, setPosition] = useState<ImageCropPosition>(centered);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const currentFile = useRef(file); currentFile.current = file;
  const session = useRef<{ file: File; controller: AbortController; active: boolean; encoding: boolean; dispose?: () => void } | null>(null);
  const drag = useRef<{ pointer: number; clientX: number; clientY: number; position: ImageCropPosition; width: number; height: number } | null>(null);
  const ratio = IMAGE_CROP_ASPECTS.find(item => item.id === aspect)?.ratio ?? null;
  const dimensions = image ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  const rect = dimensions ? imageCropRect(dimensions, ratio, position) : null;
  const output = rect ? imageCropOutputSize(rect, maxOutputEdge) : null;
  const previewWidth = rect ? Math.min(stageSize.width, stageSize.height * rect.width / rect.height) : 0;

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setStageSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    setImage(null); setBusy(false); setError(""); setPosition(centered); setAspect(initialAspect); drag.current = null;
    if (!file) { dialog.current?.close(); return; }
    const run = { file, controller: new AbortController(), active: true, encoding: false, dispose: undefined as (() => void) | undefined };
    session.current = run;
    if (!dialog.current?.open) dialog.current?.showModal();
    void Promise.resolve().then(() => loadCropImage(file, run.controller.signal)).then(loaded => {
      if (!run.active || currentFile.current !== file) { loaded.dispose(); return; }
      run.dispose = loaded.dispose; setImage(loaded.image);
    }).catch(cause => { if (run.active && currentFile.current === file) setError(cause instanceof Error ? cause.message : "이미지를 열지 못했습니다."); });
    return () => { run.active = false; run.controller.abort(); run.dispose?.(); dialog.current?.close(); };
  }, [file, initialAspect, maxOutputEdge]);

  useEffect(() => {
    if (!canvas.current || !image || !rect) return;
    try { drawImageCrop(canvas.current, image, rect, 1000); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "미리보기를 표시하지 못했습니다."); }
  }, [image, ratio, position]);

  const cancel = () => {
    const run = session.current;
    if (!run?.active) return;
    run.active = false; run.controller.abort(); run.dispose?.(); drag.current = null;
    dialog.current?.close(); setBusy(false); onCancel();
  };
  const apply = async () => {
    const run = session.current;
    if (!run?.active || run.encoding || run.file !== currentFile.current || !image || !rect) return;
    run.encoding = true; setBusy(true); setError("");
    let result: File;
    try { result = await cropImageFile(run.file, image, rect, { maxEdge: maxOutputEdge, signal: run.controller.signal }); }
    catch (cause) {
      if (run.active && run.file === currentFile.current) { run.encoding = false; setBusy(false); setError(cause instanceof Error ? cause.message : "이미지를 처리하지 못했습니다."); }
      return;
    }
    if (!run.active || session.current !== run || run.file !== currentFile.current) return;
    run.active = false; run.dispose?.(); dialog.current?.close(); setBusy(false);
    onApply(result);
  };
  const useOriginal = () => {
    const run = session.current;
    if (!run?.active || run.encoding || run.file !== currentFile.current || !image) return;
    run.active = false; run.dispose?.(); dialog.current?.close();
    onApply(run.file);
  };
  const startDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy || !rect || !image || event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, position, width: box.width, height: box.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId || !rect || !dimensions || busy) return;
    const travelX = dimensions.width - rect.width, travelY = dimensions.height - rect.height;
    setPosition({ ...start.position,
      x: travelX > 0 ? clampCropValue(start.position.x - (event.clientX - start.clientX) / start.width * rect.width / travelX, 0, 1) : 0.5,
      y: travelY > 0 ? clampCropValue(start.position.y - (event.clientY - start.clientY) / start.height * rect.height / travelY, 0, 1) : 0.5,
    });
  };

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={infoId} onCancel={event => { event.preventDefault(); cancel(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled)")].filter(element => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className={styles.header}><h2 id={titleId}><Crop size={20} aria-hidden="true" />사진 자르기</h2><button type="button" className={styles.icon} onClick={cancel} aria-label="자르기 취소" title="자르기 취소"><X size={20} /></button></header>
    <div className={styles.body}>
      <p id={infoId} className={styles.fileName}>{file?.name}</p>
      <div ref={stage} className={styles.stage} aria-busy={!image && !error}>
        {image ? <canvas ref={canvas} className={styles.canvas} style={previewWidth && rect ? { width: previewWidth, height: previewWidth * rect.height / rect.width } : undefined} role="img" aria-label="자른 이미지 미리보기" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} /> : <p role="status">{error ? "미리보기 없음" : "이미지를 불러오는 중"}</p>}
      </div>
      <div className={styles.metadata}><span>{dimensions ? `원본 ${dimensions.width} × ${dimensions.height}` : ""}</span><output aria-label="자르기 출력 크기">{output ? `${output.width} × ${output.height}px` : ""}</output></div>
      <fieldset className={styles.controls} disabled={!image || busy}>
        <legend className={styles.srOnly}>이미지 자르기 설정</legend>
        <div className={styles.ratioRow}><label htmlFor={`${titleId}-ratio`}>비율</label><select id={`${titleId}-ratio`} value={aspect} onChange={event => { setAspect(event.target.value as ImageCropAspect); setPosition(centered); }}>
          {IMAGE_CROP_ASPECTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select><button type="button" className={styles.icon} title="원본으로 재설정" aria-label="원본으로 재설정" onClick={() => { setAspect("original"); setPosition(centered); }}><RotateCcw size={18} /></button></div>
        <label className={styles.range}>확대<output>{Math.round(position.zoom * 100)}%</output><input type="range" aria-label="확대" min="100" max="400" step="1" value={Math.round(position.zoom * 100)} aria-valuetext={`${Math.round(position.zoom * 100)}%`} onChange={event => setPosition(current => ({ ...current, zoom: Number(event.target.value) / 100 }))} /></label>
        <label className={styles.range}>가로 위치<output>{Math.round(position.x * 100)}%</output><input type="range" aria-label="가로 위치" min="0" max="100" step="1" value={Math.round(position.x * 100)} disabled={!rect || !dimensions || dimensions.width - rect.width < 0.001} aria-valuetext={`${Math.round(position.x * 100)}%`} onChange={event => setPosition(current => ({ ...current, x: Number(event.target.value) / 100 }))} /></label>
        <label className={styles.range}>세로 위치<output>{Math.round(position.y * 100)}%</output><input type="range" aria-label="세로 위치" min="0" max="100" step="1" value={Math.round(position.y * 100)} disabled={!rect || !dimensions || dimensions.height - rect.height < 0.001} aria-valuetext={`${Math.round(position.y * 100)}%`} onChange={event => setPosition(current => ({ ...current, y: Number(event.target.value) / 100 }))} /></label>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
    <footer className={styles.footer}><button type="button" className={styles.original} disabled={!image || busy} onClick={useOriginal}>원본 사용</button><button type="button" onClick={cancel}>취소</button><button type="button" className={styles.apply} disabled={!image || busy} onClick={() => void apply()}><Check size={18} aria-hidden="true" />{busy ? "처리 중" : "적용"}</button></footer>
  </dialog>;
}
