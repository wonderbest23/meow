"use client";

import { Image as ImageIcon, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import LandingImageCrop from "./landing-image-crop";

export async function resizeImage(file: File, kind: "logo" | "hero"): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 올릴 수 있습니다.");
  if (file.size > 12 * 1024 * 1024) throw new Error("12MB 이하 이미지를 선택해주세요.");

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("이미지를 열지 못했습니다."));
    element.src = source;
  });
  const limit = kind === "logo" ? 600 : 1600;
  const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 처리하지 못했습니다.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const type = kind === "logo" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, kind === "logo" ? 0.92 : 0.82),
  );
  if (!blob) throw new Error("이미지를 처리하지 못했습니다.");
  return blob;
}

/*
 * 줄인 사진을 스토리지에 올리고 주소만 돌려준다.
 *
 * 예전에는 여기서 data URL(base64)을 만들어 페이지 JSON에 그대로 넣었다.
 * 한 장에 최대 900KB라 몇 장만 올려도 페이지가 4MB 한도에 걸려 저장이 막혔다.
 * 파일은 스토리지에 두고 JSON에는 주소만 남긴다.
 *
 * 이미 base64로 저장된 옛 페이지는 그대로 읽힌다 — 스키마가 두 형태를 모두
 * 받아들이고, 여기서는 새로 올리는 것만 주소로 바꾼다.
 */
export async function uploadImage(blob: Blob, kind: "logo" | "hero") {
  return (await uploadEditorImage(blob, kind, false)).url;
}

export type EditorImageUpload = { url: string; cleanupToken?: string };

export async function uploadEditorImage(blob: Blob, kind: "logo" | "hero", editorDraft = true): Promise<EditorImageUpload> {
  const form = new FormData();
  form.append("file", new File([blob], `${kind}.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type }));
  if (editorDraft) form.append("editorDraft", "true");
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string; cleanupToken?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.message ?? "사진을 올리지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
  return { url: data.url, cleanupToken: data.cleanupToken };
}

export async function discardEditorImage(receipt: EditorImageUpload) {
  if (!receipt.cleanupToken) return false;
  try {
    const response = await fetch("/api/uploads", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cleanupToken: receipt.cleanupToken }), keepalive: true });
    return response.ok;
  } catch { return false; }
}

export function LandingMediaField({
  label,
  description,
  value,
  kind,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  kind: "logo" | "hero";
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [pending, setPending] = useState<EditorImageUpload | null>(null);
  const pendingRef = useRef<EditorImageUpload | null>(null);
  const active = useRef(true);
  const operation = useRef(0);
  const latest = useRef({ value, onChange, version: 0 });
  if (latest.current.value !== value) latest.current.version++;
  latest.current.value = value;
  latest.current.onChange = onChange;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      operation.current++;
      if (pendingRef.current) void discardEditorImage(pendingRef.current);
    };
  }, []);

  const choose = async (file?: File) => {
    if (!file || loading || pendingRef.current) return;
    const request = ++operation.current;
    const before = { value: latest.current.value, version: latest.current.version };
    setLoading(true);
    setError("");
    try {
      const blob = await resizeImage(file, kind);
      if (!active.current || operation.current !== request) return;
      const receipt = await uploadEditorImage(blob, kind);
      if (!active.current || operation.current !== request) { void discardEditorImage(receipt); return; }
      if (latest.current.value !== before.value || latest.current.version !== before.version) {
        pendingRef.current = receipt;
        setPending(receipt);
      } else latest.current.onChange(receipt.url);
    } catch (cause) {
      if (active.current && operation.current === request) setError(cause instanceof Error ? cause.message : "이미지를 처리하지 못했습니다.");
    } finally {
      if (active.current && operation.current === request) {
        setLoading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    }
  };
  const resolve = (apply: boolean) => {
    const receipt = pendingRef.current;
    if (!receipt) return;
    if (apply) latest.current.onChange(receipt.url); else void discardEditorImage(receipt);
    pendingRef.current = null;
    setPending(null);
  };

  return (
    <section className={`landing-media-field ${kind}`}>
      <div className="landing-media-preview">
        {value ? <img src={value} alt="" /> : <ImageIcon />}
      </div>
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
        {error && <small>{error}</small>}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setCropFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={loading || !!pending}><Upload /> {loading ? "처리 중" : "이미지 선택"}</button>
      {value && <button type="button" className="remove" title={`${label} 삭제`} aria-label={`${label} 삭제`} onClick={() => { latest.current.version++; latest.current.value = ""; latest.current.onChange(""); }}>삭제</button>}
      {pending ? <aside className="landing-media-conflict" role="region" aria-label={`${label} 변경 내용 비교`}>
        <p>업로드 중 사진이 변경됐어요</p>
        <img src={pending.url} alt="새로 업로드한 사진" />
        <div><button type="button" onClick={() => resolve(false)}>현재 사진 유지</button><button type="button" onClick={() => resolve(true)}>새 사진 적용</button></div>
      </aside> : null}
      <LandingImageCrop file={cropFile} maxOutputEdge={kind === "logo" ? 600 : 1600} onApply={file => { setCropFile(null); void choose(file); }} onCancel={() => setCropFile(null)} />
    </section>
  );
}
