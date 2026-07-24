"use client";

import { BarChart3, Check, RefreshCw, Save, Search, Sparkles, Undo2, X } from "lucide-react";
import type {
  PresentationChartPreset,
  PresentationSlide,
  PresentationSlideOverride,
} from "../lib/delivery/presentation-deck";

export type PresentationAssistResult = {
  fields: PresentationSlideOverride;
  summary: string;
  warnings: string[];
};

const fieldLabels: Array<{ key: keyof PresentationSlideOverride; label: string; multiline?: boolean }> = [
  { key: "title", label: "큰 제목" },
  { key: "lead", label: "핵심 설명", multiline: true },
  { key: "statement", label: "강조 문장", multiline: true },
  { key: "supporting", label: "보조 문장", multiline: true },
  { key: "note", label: "하단 안내", multiline: true },
];

export function PresentationEditorPanel({
  slide,
  value,
  assistResult,
  busy,
  message,
  hasFitChart,
  hasTractionChart,
  onChange,
  onAssist,
  onApplyAssist,
  onSave,
  onReset,
  onClose,
}: {
  slide: PresentationSlide;
  value: PresentationSlideOverride;
  assistResult: PresentationAssistResult | null;
  busy: "idle" | "saving" | "spellcheck" | "improve" | "market";
  message: string;
  hasFitChart: boolean;
  hasTractionChart: boolean;
  onChange: (next: PresentationSlideOverride) => void;
  onAssist: (mode: "spellcheck" | "improve" | "market") => void;
  onApplyAssist: () => void;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const editableFields = fieldLabels.filter(({ key }) => key === "title" || slide[key as keyof PresentationSlide] !== undefined);
  const setChart = (chartPreset: PresentationChartPreset | null) => onChange({ ...value, chartPreset });

  return <aside className="presentation-editor-panel" aria-label="슬라이드 문구 편집">
    <header>
      <div><small>{slide.eyebrow}</small><strong>이 장 수정하기</strong></div>
      <button title="편집창 닫기" aria-label="발표자료 편집창 닫기" onClick={onClose}>닫기</button>
    </header>

    <div className="presentation-editor-scroll">
      <section className="presentation-text-fields">
        <div className="presentation-editor-section-title"><span>문구</span><small>저장하면 미리보기와 PPTX에 함께 반영됩니다.</small></div>
        {editableFields.map(({ key, label, multiline }) => {
          const current = typeof value[key] === "string" ? String(value[key]) : "";
          return <label key={key}>
            <span>{label}</span>
            {multiline
              ? <textarea value={current} rows={3} maxLength={key === "title" ? 180 : 700} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
              : <input value={current} maxLength={180} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />}
          </label>;
        })}
      </section>

      <section className="presentation-ai-tools">
        <div className="presentation-editor-section-title"><span>문장 도움</span><small>제안을 확인한 뒤 적용할 수 있습니다.</small></div>
        <div>
          <button disabled={busy !== "idle"} onClick={() => onAssist("spellcheck")}>
            {busy === "spellcheck" ? <RefreshCw className="spin" /> : <Check />} 맞춤법 검사
          </button>
          <button disabled={busy !== "idle"} onClick={() => onAssist("improve")}>
            {busy === "improve" ? <RefreshCw className="spin" /> : <Sparkles />} 더 쉽게 다듬기
          </button>
          <button disabled={busy !== "idle"} onClick={() => onAssist("market")}>
            {busy === "market" ? <RefreshCw className="spin" /> : <Search />} 시장 근거 보강
          </button>
        </div>
        {assistResult && <article className="presentation-assist-result">
          <small>인공지능 제안</small>
          <strong>{assistResult.summary}</strong>
          {assistResult.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          <button onClick={onApplyAssist}><Sparkles /> 제안 적용</button>
        </article>}
      </section>

      {slide.kind !== "cover" && slide.kind !== "closing" && <section className="presentation-chart-tools">
        <div className="presentation-editor-section-title"><span>그래프</span><small>저장된 숫자만 자동으로 그립니다.</small></div>
        <div>
          <button className={!value.chartPreset ? "active" : ""} onClick={() => setChart(null)}><Undo2 /> 그래프 없음</button>
          <button className={value.chartPreset === "fit" ? "active" : ""} disabled={!hasFitChart} onClick={() => setChart("fit")}><BarChart3 /> 적합도 점수</button>
          <button className={value.chartPreset === "traction" ? "active" : ""} disabled={!hasTractionChart} onClick={() => setChart("traction")}><BarChart3 /> 고객 검증</button>
        </div>
        <p>자료가 없는 그래프는 선택할 수 없습니다. 출처 없는 시장 규모나 성장률은 만들지 않습니다.</p>
      </section>}
    </div>

    <footer>
      <button disabled={busy !== "idle"} onClick={onReset}><Undo2 /> 원래대로</button>
      <button disabled={busy !== "idle" || !String(value.title ?? "").trim()} onClick={onSave}>
        {busy === "saving" ? <RefreshCw className="spin" /> : <Save />} 저장하기
      </button>
      {message && <p role="status">{message}</p>}
    </footer>
  </aside>;
}
