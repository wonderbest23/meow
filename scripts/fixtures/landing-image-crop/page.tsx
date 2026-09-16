"use client";
import { useEffect, useRef, useState } from "react";
import LandingImageCrop from "../../../components/landing-image-crop";

declare global { interface Window { cropFixture?: { replace: () => void; unmount: () => void } } }

export default function CropFixture() {
  const [file, setFile] = useState<File | null>(null), [mounted, setMounted] = useState(true);
  const [applied, setApplied] = useState(0), [cancelled, setCancelled] = useState(0);
  const [result, setResult] = useState(""), [original, setOriginal] = useState("");
  const source = useRef<File | null>(null);
  useEffect(() => {
    window.cropFixture = { replace: () => { if (source.current) setFile(new File([source.current], "replacement.png", { type: "image/png" })); }, unmount: () => setMounted(false) };
    return () => { delete window.cropFixture; };
  }, []);
  return <main style={{ fontFamily: "sans-serif", padding: 12 }}>
    <label>테스트 이미지<input aria-label="테스트 이미지" type="file" onChange={event => { const next = event.target.files?.[0] ?? null; source.current = next; setFile(next); setMounted(true); event.target.value = ""; }} /></label>
    <button onClick={() => { setFile(source.current); setMounted(true); }}>다시 열기</button>
    <output data-testid="applied">{applied}</output><output data-testid="cancelled">{cancelled}</output>
    <output data-testid="result">{result}</output><output data-testid="original">{original}</output>
    {mounted && <LandingImageCrop file={file} onCancel={() => { setCancelled(value => value + 1); setFile(null); }} onApply={next => {
      setApplied(value => value + 1); setFile(null);
      const reader = new FileReader(); reader.onload = () => setResult(JSON.stringify({ name: next.name, type: next.type, url: reader.result })); reader.readAsDataURL(next);
      if (source.current) void source.current.arrayBuffer().then(bytes => setOriginal(String(bytes.byteLength)));
    }} />}
  </main>;
}
