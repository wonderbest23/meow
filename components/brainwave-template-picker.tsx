"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";
import { BUSINESS_TEMPLATE_IDS } from "../lib/landing/brainwave/business-content";
import styles from "./brainwave-template-picker.module.css";

/*
 * 템플릿 고르기 — 사업용 홈페이지 10장을 미리 고른 뒤 적용한다.
 * 홈페이지 화면과 편집기 양쪽에서 같은 창을 쓴다.
 */
export function BrainwaveTemplatePicker({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(current);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const groups: Array<{ key: "landing" | "inner"; label: string; note: string }> = [
    { key: "landing", label: "랜딩 페이지 10", note: "첫 화면부터 문의까지 한 장에 담긴 홈페이지" },
  ];
  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="템플릿 선택" onCancel={event => { event.preventDefault(); onClose(); }}>
      <div className={`bwtp-sheet ${styles.sheet}`}>
        <header>
          <div><strong>템플릿 선택</strong><small>이미지는 디자인 예시입니다. 사업 내용에 맞춰 문구와 표시 섹션이 달라집니다.</small></div>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </header>
        <div className="bwtp-body">
          {groups.map((g) => (
            <section key={g.key}>
              <h4>{g.label} <small>{g.note}</small></h4>
              <div className="bwtp-grid">
                {BRAINWAVE_PAGES.filter((p) => p.group === g.key && BUSINESS_TEMPLATE_IDS.includes(p.id)).map((p) => (
                  <button key={p.id} type="button" aria-pressed={p.id === selected} className={p.id === selected ? "on" : ""} onClick={() => setSelected(p.id)}>
                    <img src={`/brainwave/thumbs/${p.id}.jpg`} alt="" loading="lazy" />
                    <span><b>{p.ko}</b><small>{p.name}</small></span>
                    {p.id === current ? <em>사용 중</em> : null}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className={styles.footer}>
          <p>{selected === current ? "현재 사용 중인 템플릿입니다." : "사업 정보는 유지되며 직접 고친 글과 사진, 배치는 초기화됩니다."}</p>
          <button type="button" onClick={onClose}>취소</button>
          <button type="button" className={styles.apply} disabled={selected === current} onClick={() => onPick(selected)}>이 템플릿 적용</button>
        </footer>
      </div>
    </dialog>
  );
}
