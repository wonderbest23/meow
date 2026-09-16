"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from "lucide-react";
import type { DeckSlide } from "../../../lib/plan-builder/deck-plan";
import type { ProposalChart, ProposalSlideEdits } from "../../../lib/plan-builder/proposal-revision";
import { proposalChartSchema, proposalImageSchema } from "../../../lib/plan-builder/proposal-editor";
import styles from "./proposal.module.css";

export default function ProposalContentControls({ slide, patch }: { slide: DeckSlide; patch: (edit: ProposalSlideEdits) => void }) {
  const [error, setError] = useState(""), [uploading, setUploading] = useState(false);
  const active = useRef(0), file = useRef<HTMLInputElement>(null);
  const live = useRef({ slide, patch }); live.current = { slide, patch };
  useEffect(() => { setUploading(false); return () => { active.current++; }; }, [slide.id, slide.composition?.layout]);
  const [chart, setChart] = useState<ProposalChart>(slide.chart ?? { type: "bar", unit: "", basis: "estimate", source: "", categories: [""], series: [{ id: "s1", name: "", values: [NaN] }] });
  useEffect(() => { setChart(slide.chart ?? { type: "bar", unit: "", basis: "estimate", source: "", categories: [""], series: [{ id: "s1", name: "", values: [NaN] }] }); }, [slide.chart]);
  function updateChart(next: ProposalChart) { setChart(next); patch({ content: { chart: next } }); }
  async function image(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10_000_000) { setError("PNG·JPEG·WebP 이미지 10MB 이하를 선택해 주세요"); return; }
    const request = ++active.current, startingImage = JSON.stringify(slide.image); setUploading(true); setError("");
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40_000_000) { bitmap.close(); throw new Error("이미지 해상도가 너무 커요"); }
      const ratio = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
      const context = canvas.getContext("2d"); if (!context) { bitmap.close(); throw new Error("이미지를 읽지 못했어요"); }
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const next = proposalImageSchema.parse({ id: `image-${crypto.randomUUID()}`, data: canvas.toDataURL("image/jpeg", .86), alt: file.name.replace(/\.[^.]+$/, "").slice(0, 160) || "사업 이미지", width: canvas.width, height: canvas.height, fit: "contain" });
      if (request !== active.current) return;
      if (JSON.stringify(live.current.slide.image) !== startingImage) { setError("이미지가 변경되어 이전 요청을 적용하지 않았어요"); return; }
      live.current.patch({ content: { image: next } });
    } catch (cause) { if (request === active.current) setError(cause instanceof Error && cause.message.length < 100 ? cause.message : "이미지를 줄여서 다시 선택해 주세요"); }
    finally { if (request === active.current) setUploading(false); }
  }
  function points(next: NonNullable<DeckSlide["points"]>) { patch({ content: { points: next } }); }
  function reorderPoint(index: number, direction: number) { const next = structuredClone(slide.points!); const to = index + direction; if (to < 0 || to >= next.length) return; [next[index], next[to]] = [next[to], next[index]]; points(next); }
  return <>
    {slide.points?.map((point, index) => <fieldset key={point.id ?? index}><legend>본문 {index + 1}</legend><div className={styles.compactTools}>
      <button title="본문 위로" aria-label={`본문 ${index + 1} 위로`} disabled={!index} onClick={() => reorderPoint(index, -1)}><ArrowUp size={15} /></button><button title="본문 아래로" aria-label={`본문 ${index + 1} 아래로`} disabled={index === slide.points!.length - 1} onClick={() => reorderPoint(index, 1)}><ArrowDown size={15} /></button><button title="본문 삭제" aria-label={`본문 ${index + 1} 삭제`} disabled={slide.points!.length === 1} onClick={() => points(slide.points!.filter((_, i) => i !== index))}><Trash2 size={15} /></button>
    </div><input aria-label={`본문 ${index + 1} 제목`} maxLength={20} value={point.label} onChange={event => points(slide.points!.map((p, i) => i === index ? { ...p, label: event.target.value } : p))} /><textarea aria-label={`본문 ${index + 1} 내용`} maxLength={160} rows={3} value={point.detail} onChange={event => points(slide.points!.map((p, i) => i === index ? { ...p, detail: event.target.value } : p))} /></fieldset>)}
    {slide.points && <button className={styles.controlButton} disabled={slide.points.length >= 4} onClick={() => points([...slide.points!, { id: `p-${crypto.randomUUID()}`, label: "새 항목", detail: "내용을 입력하세요" }])}><Plus size={15} />본문 항목 추가</button>}
    {slide.table && <fieldset><legend>표</legend>{[slide.table.headers, ...slide.table.rows].map((row, ri) => <div className={styles.tableRow} key={ri}>{row.map((cell, ci) => <textarea rows={2} key={ci} aria-label={`표 ${ri === 0 ? "머리글" : `${ri}행`} ${ci + 1}열`} maxLength={ri === 0 ? 24 : 160} value={cell} onChange={event => { const table = structuredClone(slide.table!); (ri === 0 ? table.headers : table.rows[ri - 1])[ci] = event.target.value; patch({ content: { table } }); }} />)}{ri > 0 && <button aria-label={`표 ${ri}행 삭제`} title="행 삭제" disabled={slide.table!.rows.length === 1} onClick={() => patch({ content: { table: { ...slide.table!, rows: slide.table!.rows.filter((_, i) => i !== ri - 1) } } })}><Trash2 size={14} /></button>}</div>)}
      <div className={styles.compactTools}><button disabled={slide.table.rows.length >= 8} onClick={() => patch({ content: { table: { ...slide.table!, rows: [...slide.table!.rows, slide.table!.headers.map(() => "")] } } })}><Plus size={15} />행</button><button disabled={slide.table.headers.length >= 4} onClick={() => patch({ content: { table: { headers: [...slide.table!.headers, "새 열"], rows: slide.table!.rows.map(row => [...row, ""]) } } })}><Plus size={15} />열</button></div>
      <div className={styles.compactTools}>{slide.table.headers.map((_, ci) => <button key={ci} title={`${ci + 1}열 삭제`} aria-label={`표 ${ci + 1}열 삭제`} disabled={slide.table!.headers.length <= 2} onClick={() => patch({ content: { table: { headers: slide.table!.headers.filter((_, i) => i !== ci), rows: slide.table!.rows.map(row => row.filter((_, i) => i !== ci)) } } })}><Trash2 size={14} />{ci + 1}열</button>)}</div>
    </fieldset>}
    {slide.metrics?.map((metric, index) => <fieldset key={index}><legend>지표 {index + 1}</legend>{(["label", "value", "note"] as const).map(key => <label key={key}>{({ label: "지표명", value: "값", note: "기준" })[key]}<input aria-label={`지표 ${index + 1} ${key}`} maxLength={key === "label" ? 24 : key === "value" ? 30 : 40} value={metric[key] ?? ""} onChange={event => patch({ content: { metrics: slide.metrics!.map((value, i) => i === index ? { ...value, [key]: event.target.value } : value) } })} /></label>)}</fieldset>)}
    {(["cover", "evidence"].includes(slide.composition?.layout ?? "")) && <fieldset><legend>이미지</legend><input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { void image(event.target.files?.[0]); event.target.value = ""; }} /><div className={styles.compactTools}><button disabled={uploading} onClick={() => file.current?.click()}><ImagePlus size={16} />{uploading ? "읽는 중" : slide.image ? "이미지 교체" : "이미지 추가"}</button>{slide.image && <button title="이미지 제거" aria-label="이미지 제거" onClick={() => { active.current++; setUploading(false); patch({ content: { image: null } }); }}><Trash2 size={16} /></button>}</div>
      {slide.image && <><label>이미지 설명<input maxLength={160} value={slide.image.alt} onChange={event => patch({ content: { image: { ...slide.image!, alt: event.target.value } } })} /></label><label>맞춤<select aria-label="이미지 맞춤" value={slide.image.fit ?? "contain"} onChange={event => patch({ content: { image: { ...slide.image!, fit: event.target.value as "contain" | "cover", crop: undefined } } })}><option value="contain">전체 보기</option><option value="cover">프레임 채우기</option></select></label>
        {slide.image.width && slide.image.height && <details><summary>이미지 자르기</summary>{(["x", "y", "w", "h"] as const).map(key => { const crop = slide.image!.crop ?? { x: 0, y: 0, w: 1, h: 1 }; return <label key={key}>{({ x: "왼쪽", y: "위", w: "너비", h: "높이" })[key]}<input type="range" aria-label={`이미지 자르기 ${key}`} min={key === "w" || key === "h" ? .05 : 0} max={key === "x" ? 1 - crop.w : key === "y" ? 1 - crop.h : key === "w" ? 1 - crop.x : 1 - crop.y} step="0.01" value={crop[key]} onChange={event => patch({ content: { image: { ...slide.image!, crop: { ...crop, [key]: Number(event.target.value) } } } })} /></label>; })}<button className={styles.controlButton} onClick={() => patch({ content: { image: { ...slide.image!, crop: undefined } } })}>자르기 초기화</button></details>}
      </>}
    </fieldset>}
    {slide.composition?.layout === "chart" && <fieldset><legend>차트 데이터</legend><label>종류<select value={chart.type} onChange={event => updateChart({ ...chart, type: event.target.value as ProposalChart["type"] })}><option value="bar">막대</option><option value="line">추이</option></select></label><label>단위<input aria-label="차트 단위" value={chart.unit} maxLength={12} onChange={event => updateChart({ ...chart, unit: event.target.value })} /></label><label>수치 구분<select value={chart.basis} onChange={event => updateChart({ ...chart, basis: event.target.value as ProposalChart["basis"] })}><option value="actual">실제 실적</option><option value="estimate">예상</option></select></label><label>출처와 기간<textarea aria-label="차트 출처" value={chart.source} maxLength={160} onChange={event => updateChart({ ...chart, source: event.target.value })} /></label>
      {chart.series.map((series, si) => <div className={styles.tableRow} key={series.id}><input aria-label={`차트 계열 ${si + 1}`} value={series.name} maxLength={24} onChange={event => updateChart({ ...chart, series: chart.series.map((s, i) => i === si ? { ...s, name: event.target.value } : s) })} /><button title="계열 삭제" aria-label={`차트 계열 ${si + 1} 삭제`} disabled={chart.series.length === 1} onClick={() => updateChart({ ...chart, series: chart.series.filter((_, i) => i !== si) })}><Trash2 size={14} /></button></div>)}
      {chart.categories.map((category, ci) => <div className={styles.tableRow} key={ci}><input aria-label={`차트 항목 ${ci + 1}`} value={category} maxLength={20} onChange={event => updateChart({ ...chart, categories: chart.categories.map((v, i) => i === ci ? event.target.value : v) })} />{chart.series.map((series, si) => <input key={series.id} type="number" aria-label={`차트 ${ci + 1}행 ${si + 1}값`} value={Number.isFinite(series.values[ci]) ? series.values[ci] : ""} onChange={event => updateChart({ ...chart, series: chart.series.map((s, i) => i === si ? { ...s, values: s.values.map((v, j) => j === ci ? event.target.value === "" ? NaN : Number(event.target.value) : v) } : s) })} />)}<button aria-label={`차트 항목 ${ci + 1} 삭제`} title="항목 삭제" disabled={chart.categories.length === 1} onClick={() => updateChart({ ...chart, categories: chart.categories.filter((_, i) => i !== ci), series: chart.series.map(s => ({ ...s, values: s.values.filter((_, i) => i !== ci) })) })}><Trash2 size={14} /></button></div>)}
      <div className={styles.compactTools}><button disabled={chart.categories.length >= 12} onClick={() => updateChart({ ...chart, categories: [...chart.categories, ""], series: chart.series.map(s => ({ ...s, values: [...s.values, NaN] })) })}><Plus size={14} />항목</button><button disabled={chart.series.length >= 3} onClick={() => updateChart({ ...chart, series: [...chart.series, { id: `s-${crypto.randomUUID()}`, name: "", values: chart.categories.map(() => NaN) }] })}><Plus size={14} />계열</button></div>
      {!proposalChartSchema.safeParse(chart).success && <p className={styles.validation} role="status">항목명·계열명·단위·출처를 모두 입력해야 차트가 저장됩니다</p>}
    </fieldset>}
    {error && <p role="alert" className={styles.validation}>{error}</p>}
  </>;
}
