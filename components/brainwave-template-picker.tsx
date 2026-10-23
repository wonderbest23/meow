"use client";

import { X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";
import { BUSINESS_DESIGNED_PAGES, BUSINESS_TEMPLATE_IDS } from "../lib/landing/brainwave/business-content";
import styles from "./brainwave-template-picker.module.css";

/*
 * 템플릿 고르기 — 사업 내용에 맞춰 디자인을 옮겨 둔 홈페이지 중에서 미리 고른 뒤 적용한다.
 * 아직 간단한 화면으로만 나오는 템플릿('준비 중')은 보여 주지 않는다 — 지금 쓰고 있는 것만 예외.
 * 홈페이지 화면과 편집기 양쪽에서 같은 창을 쓴다.
 */
/* 카드마다 같은 설명('사진과 소개 글이 넉넉히…')이 다섯 번 되풀이돼 고르는 데 도움이 안 됐다 — 디자인마다 무엇이 먼저 보이는지로 적는다 */
const DESIGN_NOTES: Record<string, string> = {
  "0-290": "상담·문의를 받는 서비스에 맞는 구성",
  "0-2385": "진료 과목·진료 시간을 먼저 보여 주는 구성",
  "0-2226": "메뉴·가격·영업시간이 먼저 보이는 가게 구성",
  "0-1102": "상품을 카드로 나란히 보여 주는 구성",
  "0-421": "작업 사진을 크게 보여 주는 구성",
};

export function BrainwaveTemplatePicker({
  current,
  onPick,
  onClose,
  aiFilled = false,
}: {
  /** AI 로 채운 글이 있는지 — 바꿀 때 무엇이 옮겨지고 무엇이 바뀌는지 알린다 */
  aiFilled?: boolean;
  current: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(current);
  const dialog = useRef<HTMLDialogElement>(null);
  /* 열면 지금 쓰는 템플릿이 보이게 — 맨 아래에 있으면 다른 카드를 보는 동안 '사용 중' 안내만 떠 헷갈렸다 */
  /*
   * 닫힐 때는 dialog.close()를 먼저 불러 브라우저가 연 단추로 초점을 돌려주게 한다 — 예전엔 창을 DOM에서 바로 떼어 초점이 body로 떨어졌다.
   * 고르기(onPick)처럼 부모가 창을 바로 없애는 경우도 떼기 직전(layout 정리)에 닫고, 그래도 body면 연 단추로 옮긴다.
   */
  useLayoutEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal(); node?.querySelector(".bwtp-grid button.on")?.scrollIntoView({ block: "center" });
    return () => {
      if (node?.open) node.close();
      window.requestAnimationFrame(() => { const active = document.activeElement; if (opener?.isConnected && (!active || active === document.body)) opener.focus({ preventScroll: true }); });
    };
  }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  const pages = BRAINWAVE_PAGES.filter((p) => p.group === "landing" && BUSINESS_TEMPLATE_IDS.includes(p.id)
    && (BUSINESS_DESIGNED_PAGES.has(p.id) || p.id === current));
  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="디자인 바꾸기" onCancel={event => { event.preventDefault(); close(); }}>
      <div className={`bwtp-sheet ${styles.sheet}`}>
        <header>
          <div><strong>디자인 바꾸기</strong><small>그림은 디자인 예시예요. 내 사업 내용에 맞춰 문구와 보이는 구역이 달라져요.</small></div>
          <button type="button" onClick={close} aria-label="닫기"><X size={18} /></button>
        </header>
        <div className="bwtp-body">
          <section>
            <h4>디자인 {pages.length}개 <small>첫 화면부터 문의까지 한 장에 담겨요</small></h4>
            <div className="bwtp-grid">
              {pages.map((p) => (
                <button key={p.id} type="button" aria-pressed={p.id === selected} className={p.id === selected ? "on" : ""} onClick={() => setSelected(p.id)}>
                  <img src={`/brainwave/thumbs/${p.id}.jpg`} alt="" loading="lazy" />
                  <span><b>{p.ko}</b><small>{DESIGN_NOTES[p.id] ?? (BUSINESS_DESIGNED_PAGES.has(p.id) ? "사진과 소개 글이 넉넉히 들어가는 디자인" : "간단한 디자인")}</small></span>
                  {p.id === current ? <em>사용 중</em> : null}
                </button>
              ))}
            </div>
          </section>
        </div>
        <footer className={styles.footer}>
          {/* AI 글은 새 디자인 자리로 옮겨 담지만 칸 수가 달라 일부는 빠지거나 바뀔 수 있다 — 예전 안내는 '직접 고친 글'만 말해 AI 글이 사라지는 줄 몰랐다 */}
          {/* 직접 고친 글은 같은 역할 자리(큰 제목·소개 등)로 옮겨 담는다(carryEditedTexts) — 옮길 자리가 없는 글만 바뀐다 */}
          <p>{selected === current ? "지금 쓰고 있는 디자인이에요." : aiFilled
            ? "AI가 쓴 글과 직접 고친 글은 새 디자인의 같은 자리로 옮겨 담지만, 칸 수가 달라 일부는 빠지거나 바뀔 수 있어요. 직접 고친 사진·배치는 처음 상태로 돌아가요. 바꾼 뒤 되돌릴 수 있어요."
            : "직접 고친 글은 새 디자인의 같은 자리로 옮겨 담아요. 옮길 자리가 없는 글과 사진·배치는 처음 상태로 돌아가요. 바꾼 뒤 되돌릴 수 있어요."}</p>
          <button type="button" onClick={close}>취소</button>
          <button type="button" className={styles.apply} disabled={selected === current} onClick={() => onPick(selected)}>이 디자인으로 바꾸기</button>
        </footer>
      </div>
    </dialog>
  );
}
