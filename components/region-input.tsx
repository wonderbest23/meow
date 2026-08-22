"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchRegions, regionLabel } from "../lib/korea-regions";

/*
 * 지역 입력칸.
 *
 * '마포'만 쳐도 '서울 마포구'를 골라 넣는다. 직접 쓰는 것도 막지 않는다 —
 * 목록에 없는 표현(예: '수도권 전역')을 쓸 수도 있어야 한다.
 * 위/아래 화살표와 엔터로도 고를 수 있게 한다(마우스 없이 답하는 사람).
 */
export default function RegionInput({
  value,
  onChange,
  placeholder,
  className,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => searchRegions(value, 8), [value]);
  /* 이미 정확히 고른 값이면 목록을 띄우지 않는다 */
  const exact = hits.length === 1 && regionLabel(hits[0]) === value.trim();
  const show = open && value.trim().length > 0 && hits.length > 0 && !exact;

  useEffect(() => { setActive(0); }, [value]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  function choose(i: number) {
    const r = hits[i];
    if (!r) return;
    onChange(regionLabel(r));
    setOpen(false);
  }

  return (
    <div className="region-field" ref={wrapRef}>
      <input
        id={id}
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((n) => (n + 1) % hits.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((n) => (n - 1 + hits.length) % hits.length); }
          else if (e.key === "Enter") { e.preventDefault(); choose(active); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {show && (
        <ul className="region-list" role="listbox">
          {hits.map((r, i) => (
            <li key={`${r.sido}-${r.sigungu}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? "on" : ""}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <b>{regionLabel(r)}</b>
                <small>{r.sido}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
