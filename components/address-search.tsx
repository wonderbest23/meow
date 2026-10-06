"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";

/*
 * 주소 검색 — 카카오(다음) 우편번호 서비스. 키 없이 무료, 도로명·지번·우편번호를 한 번에 채운다.
 * 손으로 주소를 치면 오타·우편번호 누락이 잦았다(도메인 명의자 주소는 등록기관에 그대로 간다).
 * 스크립트는 처음 누를 때만 불러온다. 못 불러오면 손으로 적을 수 있게 그대로 둔다.
 */

type DaumPostcodeData = { zonecode: string; roadAddress: string; jibunAddress: string; buildingName: string; apartment: "Y" | "N"; userSelectedType: "R" | "J" };
type DaumPostcode = new (options: { oncomplete: (data: DaumPostcodeData) => void; width?: string; height?: string }) => { embed: (element: HTMLElement) => void };
declare global { interface Window { daum?: { Postcode: DaumPostcode } } }

const SCRIPT = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
let loading: Promise<void> | null = null;
function loadPostcode(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT; script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loading = null; reject(new Error("POSTCODE_LOAD_FAILED")); };
    document.head.appendChild(script);
  });
  return loading;
}

export type PickedAddress = { postalCode: string; address: string };

/** 도로명 주소 + (아파트·건물 이름) — 등록기관·사업자 정보에 쓰기 좋은 한 줄 */
export function addressLine(data: Pick<DaumPostcodeData, "roadAddress" | "jibunAddress" | "buildingName" | "apartment" | "userSelectedType">): string {
  const base = data.userSelectedType === "J" && data.jibunAddress ? data.jibunAddress : data.roadAddress || data.jibunAddress;
  return data.buildingName && data.apartment === "Y" ? `${base} (${data.buildingName})` : base;
}

export function AddressSearchButton({ onPick, label = "주소 검색", className }: { onPick: (picked: PickedAddress) => void; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadPostcode().then(() => {
      if (cancelled || !box.current || !window.daum) return;
      new window.daum.Postcode({
        width: "100%", height: "100%",
        oncomplete: (data) => { onPick({ postalCode: data.zonecode, address: addressLine(data) }); setOpen(false); },
      }).embed(box.current);
    }).catch(() => { if (!cancelled) { setError("주소 검색을 불러오지 못했어요. 직접 적어 주세요."); setOpen(false); } });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { cancelled = true; window.removeEventListener("keydown", onKey); };
  }, [open, onPick]);
  return <>
    <button type="button" className={className ?? "address-search-button"} onClick={() => { setError(""); setOpen(true); }}><MapPin size={15} aria-hidden /> {label}</button>
    {error ? <small className="address-search-error" role="alert">{error}</small> : null}
    {open ? <div className="address-search-overlay" onClick={() => setOpen(false)}>
      <div className="address-search-sheet" role="dialog" aria-modal="true" aria-label="주소 검색" onClick={(event) => event.stopPropagation()}>
        <header><strong>주소 검색</strong><button type="button" onClick={() => setOpen(false)} aria-label="닫기"><X size={18} /></button></header>
        <div ref={box} className="address-search-frame" />
      </div>
    </div> : null}
  </>;
}
