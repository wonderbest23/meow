"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";
import { proposalChartScale, proposalImageViewport, type ProposalScene, type ProposalSceneNode } from "../../../lib/plan-builder/proposal-scene";
import { proposalElementLabel, type ProposalBox, type ProposalElement } from "../../../lib/plan-builder/proposal-revision";
import styles from "./proposal.module.css";

const U = 100;
const position = (box: ProposalBox): CSSProperties => ({ left: `${box.x / 13.33 * 100}%`, top: `${box.y / 7.5 * 100}%`, width: `${box.w / 13.33 * 100}%`, height: `${box.h / 7.5 * 100}%` });
function Text({ node }: { node: Extract<ProposalSceneNode, { type: "text" }> }) {
  return <div data-proposal-text={node.id} style={{ width: "100%", height: "100%", color: `#${node.options.color}`, fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif', fontSize: node.options.fontSize / 72 * U, fontWeight: node.options.bold ? 700 : 400, lineHeight: 1.16, whiteSpace: "pre-wrap", overflowWrap: "anywhere", letterSpacing: 0, textAlign: node.options.align ?? "left" }}>{node.text}</div>;
}
function Chart({ node }: { node: Extract<ProposalSceneNode, { type: "chart" }> }) {
  const { chart, options: box } = node, scale = proposalChartScale(chart);
  const colors = ["#2266cf", "#328071", "#bf694b"];
  const x = (box.x + box.w * .1) * U, y = (box.y + box.h * .05) * U, w = box.w * .87 * U, h = box.h * .73 * U;
  const valueY = (value: number) => y + h - (value - scale.min) / (scale.max - scale.min) * h;
  const ticks = Array.from({ length: Math.round((scale.max - scale.min) / scale.step) + 1 }, (_, i) => scale.min + i * scale.step);
  const stride = w / chart.categories.length;
  return <g fontFamily='"Malgun Gothic", sans-serif' fontSize={14} fill="#637083">
    {ticks.map(value => <g key={value}><line x1={x} x2={x + w} y1={valueY(value)} y2={valueY(value)} stroke="#dce2e9" /><text x={x - 10} y={valueY(value) + 5} textAnchor="end">{value.toLocaleString("ko-KR", { maximumSignificantDigits: 4 })}</text></g>)}
    {chart.categories.map((category, i) => <text key={i} x={x + stride * (i + .5)} y={y + h + 22} textAnchor="middle">{category}</text>)}
    {chart.series.map((series, si) => <g key={series.id}>
      {chart.type === "line" ? <><polyline points={series.values.map((value, i) => `${x + stride * (i + .5)},${valueY(value)}`).join(" ")} fill="none" stroke={colors[si]} strokeWidth={3} />{series.values.map((value, i) => <circle key={i} cx={x + stride * (i + .5)} cy={valueY(value)} r={4} fill={colors[si]} />)}</> : series.values.map((value, i) => <rect key={i} x={x + stride * (i + .18) + si * stride * .64 / chart.series.length} y={Math.min(valueY(0), valueY(value))} width={stride * .64 / chart.series.length} height={Math.abs(valueY(value) - valueY(0))} fill={colors[si]} />)}
      <rect x={x + si * w / chart.series.length} y={y + h + 47} width={15} height={10} fill={colors[si]} /><text x={x + si * w / chart.series.length + 24} y={y + h + 58}>{series.name}</text>
    </g>)}
  </g>;
}
function Node({ node }: { node: ProposalSceneNode }) {
  const o = node.options;
  if (node.type === "shape") return node.shape === "line" ? <line x1={o.x * U} y1={o.y * U} x2={(o.x + o.w) * U} y2={(o.y + o.h) * U} stroke={`#${node.options.line.color}`} strokeWidth={1} /> : <rect x={o.x * U} y={o.y * U} width={o.w * U} height={o.h * U} fill={`#${node.options.fill?.color ?? "FFFFFF"}`} />;
  if (node.type === "image") {
    const v = proposalImageViewport(node.options), crop = v.crop;
    if (crop) return <svg x={v.x * U} y={v.y * U} width={v.w * U} height={v.h * U} viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} preserveAspectRatio="none"><image href={v.data} width={1} height={1} preserveAspectRatio="none"><title>{v.altText}</title></image></svg>;
    return <svg x={o.x * U} y={o.y * U} width={o.w * U} height={o.h * U}><image href={node.options.data} width="100%" height="100%" preserveAspectRatio={node.options.sizing.type === "cover" ? "xMidYMid slice" : "xMidYMid meet"}><title>{node.options.altText}</title></image></svg>;
  }
  if (node.type === "text") return <foreignObject x={o.x * U} y={o.y * U} width={o.w * U} height={o.h * U}><Text node={node} /></foreignObject>;
  if (node.type === "chart") return <Chart node={node} />;
  let y = o.y;
  return <g>{node.rows.flatMap((row, rowIndex) => {
    const top = y; const height = node.options.rowH[rowIndex]; y += height;
    let x = o.x;
    return row.map((cell, colIndex) => {
      const left = x; const width = node.options.colW[colIndex]; x += width;
      return <g key={`${rowIndex}-${colIndex}`}><rect x={left * U} y={top * U} width={width * U} height={height * U} fill={`#${cell.options.fill.color}`} stroke="#dce2e9" strokeWidth={.7} /><foreignObject x={(left + .16) * U} y={(top + .09) * U} width={(width - .32) * U} height={(height - .18) * U}><div style={{ height: "100%", display: "flex", alignItems: "center", color: `#${cell.options.color}`, fontSize: cell.options.fontSize / 72 * U, fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif', fontWeight: cell.options.bold ? 700 : 400, lineHeight: 1.16, overflowWrap: "anywhere" }}>{cell.text}</div></foreignObject></g>;
    });
  })}</g>;
}
export default function ProposalCanvas({ scene, selected, onSelect, onChange, readOnly = false }: { scene: ProposalScene; selected: ProposalElement; onSelect: (element: ProposalElement) => void; onChange: (element: ProposalElement, box: ProposalBox) => void; readOnly?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ element: ProposalElement; box: ProposalBox; x: number; y: number; resize: boolean } | null>(null);
  function start(event: PointerEvent<HTMLButtonElement>, element: ProposalElement, box: ProposalBox, resize = false) {
    if (readOnly) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onSelect(element);
    drag.current = { element, box: { x: box.x, y: box.y, w: box.w, h: box.h }, x: event.clientX, y: event.clientY, resize };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current; const bounds = root.current?.getBoundingClientRect();
    if (!current || !bounds) return;
    const dx = (event.clientX - current.x) / bounds.width * 13.33, dy = (event.clientY - current.y) / bounds.height * 7.5;
    const b = current.box;
    const next = current.resize ? { ...b, w: Math.max(.25, Math.min(13.33 - b.x, b.w + dx)), h: Math.max(.2, Math.min(7.5 - b.y, b.h + dy)) }
      : { ...b, x: Math.max(0, Math.min(13.33 - b.w, b.x + dx)), y: Math.max(0, Math.min(7.5 - b.h, b.y + dy)) };
    onChange(current.element, next);
  }
  return <div ref={root} className={styles.canvas} aria-label="제안서 슬라이드 미리보기">
    <svg viewBox="0 0 1333 750" aria-hidden="true"><rect width="1333" height="750" fill="white" />{scene.nodes.map(node => <Node key={node.id} node={node} />)}</svg>
    {!readOnly && scene.nodes.flatMap((node, index) => {
      if (!("element" in node && node.element)) return [];
      const element = node.element, box = node.options;
      return <button key={index} className={`${styles.object} ${selected === element ? styles.selected : ""}`} style={position(box)} aria-label={`${proposalElementLabel(element)} 위치 조정`} title={`${proposalElementLabel(element)} 위치 조정`} onPointerDown={event => start(event, element, box)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onClick={() => onSelect(element)} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); const step = event.shiftKey ? .2 : .05;
        onChange(element, { w: box.w, h: box.h, x: Math.max(0, Math.min(13.33 - box.w, box.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0))), y: Math.max(0, Math.min(7.5 - box.h, box.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0))) });
      }} />;
    })}
    {!readOnly && scene.nodes.flatMap((node, index) => {
      if (!("element" in node && node.element === selected)) return [];
      const b = node.options;
      return <button key={index} className={styles.resize} style={{ left: `${(b.x + b.w) / 13.33 * 100}%`, top: `${(b.y + b.h) / 7.5 * 100}%` }} aria-label={`${proposalElementLabel(selected)} 크기 조정`} title={`${proposalElementLabel(selected)} 크기 조정`} onPointerDown={event => start(event, selected, b, true)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />;
    })}
  </div>;
}
