"use client";

/*
 * 메인 홈 편집 껍데기 — 어드민(/admin/homepage)이 홈을 iframe 으로 띄웠을 때만 붙는다.
 *
 * 예전 어드민은 입력칸을 길게 늘어놓고 체크박스로 섹션을 숨기는 화면이었다.
 * 어느 칸이 화면의 어디인지 알 수 없어서 쓸 수가 없었다(사용자 지적).
 * 이제 실제 홈 화면 위에 섹션마다 테두리와 작은 줄을 얹고, 거기서 바로
 * 글 고치기·숨기기·되살리기를 누른다. 화면 자체는 손님이 보는 것과 같다.
 *
 * 좌표를 부모 창에 넘겨 겹치는 방식은 스크롤마다 어긋난다 — 껍데기를 iframe
 * 안에서 그리고, 누른 결과만 부모에게 알린다(postMessage).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EDIT_SECTIONS, SITE_COPY_FIELDS } from "../lib/site-copy/domain";

type Box = { id: string; label: string; hideable: boolean; top: number; left: number; width: number; height: number };
/* 글 한 조각 — 고른 섹션 안에서만 표시한다(전부 그리면 화면이 시끄럽다) */
type FieldBox = { id: string; label: string; top: number; left: number; width: number; height: number };

export type HomeCopyMessage =
  | { type: "sc-select"; id: string }
  | { type: "sc-hide"; id: string }
  | { type: "sc-show"; id: string }
  | { type: "sc-field"; id: string };

export function HomeCopyChrome({ hidden, selected }: { hidden: string[]; selected: string | null }) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [fields, setFields] = useState<FieldBox[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const measure = () => {
      const next: Box[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("[data-sc-section]")) {
        const id = el.dataset.scSection;
        const meta = EDIT_SECTIONS.find((s) => s.id === id);
        if (!id || !meta) continue;
        const rect = el.getBoundingClientRect();
        if (rect.height < 20) continue;
        next.push({
          id,
          label: meta.label,
          hideable: meta.hideable,
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });
      }
      setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      const nextFields: FieldBox[] = [];
      if (selected) {
        for (const el of document.querySelectorAll<HTMLElement>("[data-sc-field]")) {
          const id = el.dataset.scField;
          if (!id || !id.startsWith(`${selected}.`)) continue;
          const field = SITE_COPY_FIELDS.find((f) => f.id === id);
          const rect = el.getBoundingClientRect();
          if (!field || rect.height < 6) continue;
          nextFields.push({ id, label: field.label, top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width, height: rect.height });
        }
      }
      setFields((prev) => (JSON.stringify(prev) === JSON.stringify(nextFields) ? prev : nextFields));
    };
    measure();
    /*
     * 홈은 등장 애니메이션·사진 로드로 키가 계속 변한다. 관찰자로 잡고,
     * 그래도 놓치는 경우(폰트 교체 등)를 위해 느슨한 주기 측정을 함께 둔다.
     */
    const observer = new ResizeObserver(measure);
    document.querySelectorAll("[data-sc-section]").forEach((el) => observer.observe(el));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    const timer = window.setInterval(measure, 700);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      window.clearInterval(timer);
    };
  }, [mounted, hidden, selected]);

  const send = (message: HomeCopyMessage) => window.parent.postMessage(message, window.location.origin);

  if (!mounted) return null;
  return createPortal(
    <div className="sc-chrome" aria-hidden="true">
      {boxes.map((box) => {
        const isHidden = hidden.includes(box.id);
        return (
          <div
            key={box.id}
            className={`sc-box ${isHidden ? "off" : ""} ${selected === box.id ? "on" : ""}`}
            style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          >
            <div className="sc-box-bar">
              <button type="button" className="sc-box-name" onClick={() => send({ type: "sc-select", id: box.id })}>
                {box.label}
              </button>
              <button type="button" onClick={() => send({ type: "sc-select", id: box.id })}>글 고치기</button>
              {box.hideable ? (
                isHidden
                  ? <button type="button" className="restore" onClick={() => send({ type: "sc-show", id: box.id })}>되살리기</button>
                  : <button type="button" className="danger" onClick={() => send({ type: "sc-hide", id: box.id })}>삭제</button>
              ) : <span className="sc-box-fixed">고정</span>}
            </div>
            {isHidden ? <span className="sc-box-off-tag">숨김 — 손님에게 보이지 않습니다</span> : null}
          </div>
        );
      })}
      {/* 고른 섹션 안의 글 조각 — 이 문장만 지우고 싶을 때 */}
      {fields.map((field) => {
        const off = hidden.includes(field.id);
        return (
          <div
            key={field.id}
            className={`sc-field ${off ? "off" : ""}`}
            style={{ top: field.top, left: field.left, width: field.width, height: field.height }}
          >
            <div className="sc-field-bar">
              <span>{field.label}</span>
              <button type="button" onClick={() => send({ type: "sc-field", id: field.id })}>고치기</button>
              {off
                ? <button type="button" className="restore" onClick={() => send({ type: "sc-show", id: field.id })}>되살리기</button>
                : <button type="button" className="danger" onClick={() => send({ type: "sc-hide", id: field.id })}>이 글 삭제</button>}
            </div>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
