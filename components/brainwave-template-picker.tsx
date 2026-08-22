"use client";

import { X } from "lucide-react";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";

/*
 * 템플릿 고르기 — 킷 26장을 첫 화면 그림으로 보여주고 하나를 고른다.
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
  const groups: Array<{ key: "landing" | "inner"; label: string; note: string }> = [
    { key: "landing", label: "랜딩 페이지 10", note: "첫 화면부터 문의까지 한 장에 담긴 홈페이지" },
    { key: "inner", label: "안쪽 페이지 16", note: "소개·요금·문의·상품 같은 단일 목적 페이지" },
  ];
  return (
    <div className="bwtp" role="dialog" aria-modal="true" aria-label="템플릿 선택">
      <div className="bwtp-sheet">
        <header>
          <div><strong>템플릿 선택</strong><small>디자인은 그대로, 글과 사진만 내 것으로 바꿉니다. 바꾸면 지금 고친 글·사진은 새 페이지에 맞지 않아 초기화됩니다.</small></div>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </header>
        <div className="bwtp-body">
          {groups.map((g) => (
            <section key={g.key}>
              <h4>{g.label} <small>{g.note}</small></h4>
              <div className="bwtp-grid">
                {BRAINWAVE_PAGES.filter((p) => p.group === g.key).map((p) => (
                  <button key={p.id} type="button" className={p.id === current ? "on" : ""} onClick={() => onPick(p.id)}>
                    <img src={`/brainwave/thumbs/${p.id}.jpg`} alt="" loading="lazy" />
                    <span><b>{p.ko}</b><small>{p.name}</small></span>
                    {p.id === current ? <em>사용 중</em> : null}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
