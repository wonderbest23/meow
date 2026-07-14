"use client";

import { Image as ImageIcon, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

async function resizeImage(file: File, kind: "logo" | "hero") {
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
  return canvas.toDataURL(kind === "logo" ? "image/png" : "image/jpeg", kind === "logo" ? 0.92 : 0.82);
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

  const choose = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      onChange(await resizeImage(file, kind));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이미지를 처리하지 못했습니다.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
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
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void choose(event.target.files?.[0])} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={loading}><Upload /> {loading ? "처리 중" : "이미지 선택"}</button>
      {value && <button type="button" className="remove" title={`${label} 삭제`} aria-label={`${label} 삭제`} onClick={() => onChange("")}><X /></button>}
    </section>
  );
}
