import type { DeckPlan, DeckSlide } from "./deck-plan";
import { PURPOSE_LABELS, SECTOR_PROFILES, type ProposalLayout } from "./proposal-blueprint";
import { validateProposalBox, type ProposalElement } from "./proposal-revision";


export type SceneTextOptions = { x: number; y: number; w: number; h: number; fontFace: string; fontSize: number; color: string; bold?: boolean; margin: number; valign: "top"; lineSpacingMultiple: number; paraSpaceAfter?: number; fit?: "shrink" };
export type SceneShapeOptions = { x: number; y: number; w: number; h: number; line: { color?: string; width?: number; type?: "none" }; fill?: { color: string } };
export type SceneImageOptions = { data: string; x: number; y: number; w: number; h: number; sizing: { type: "cover" | "contain"; w: number; h: number }; altText: string };
export type SceneTableCell = { text: string; options: { color: string; fill: { color: string }; fontSize: number; bold: boolean } };
export type SceneTableOptions = { x: number; y: number; w: number; h: number; rowH: number[]; colW: number[]; fontFace: string; fontSize: number; color: string; margin: [number, number, number, number]; border: { type: "solid"; color: string; pt: number }; valign: "middle"; autoPage: false };
export type ProposalSceneNode =
  | { type: "text"; text: string; options: SceneTextOptions; element?: ProposalElement }
  | { type: "shape"; shape: "line" | "rect"; options: SceneShapeOptions }
  | { type: "image"; options: SceneImageOptions; element: "image" }
  | { type: "table"; rows: SceneTableCell[][]; options: SceneTableOptions };
export type ProposalScene = { nodes: ProposalSceneNode[]; notes: string };
type SceneSlide = {
  background: { color: string };
  addText(value: string, options: SceneTextOptions, element?: ProposalElement): void;
  addShape(shape: "line" | "rect", options: SceneShapeOptions): void;
  addImage(options: SceneImageOptions): void;
  addTable(rows: SceneTableCell[][], options: SceneTableOptions): void;
  addNotes(notes: string): void;
};
type ScenePptx = { ShapeType: { line: "line"; rect: "rect" }; addSlide(): SceneSlide };

const C = { ink: "202631", muted: "637083", blue: "2266CF", line: "DCE2E9", pale: "F3F6FA", white: "FFFFFF" };
const FONT = "Malgun Gothic";
const X = .72;
const WIDTH = 11.89;

function text(slide: SceneSlide, value: string, x: number, y: number, w: number, h: number, size = 16, color = C.ink, bold = false) {
  slide.addText(value, { x, y, w, h, fontFace: FONT, fontSize: size, color, bold, margin: 0, valign: "top", lineSpacingMultiple: 1.16, paraSpaceAfter: 0 });
}
function placedText(slide: SceneSlide, item: DeckSlide, key: Exclude<ProposalElement, "image">, x: number, y: number, w: number, h: number, size: number, color = C.ink, bold = false) {
  const box = item.placement?.[key];
  if (box) {
    validateProposalBox(box);
    slide.addText(item[key] ?? "", { ...box, fontFace: FONT, fontSize: size, color, bold, margin: 0, valign: "top", lineSpacingMultiple: 1.16, fit: "shrink" }, key);
  } else slide.addText(item[key] ?? "", { x, y, w, h, fontFace: FONT, fontSize: size, color, bold, margin: 0, valign: "top", lineSpacingMultiple: 1.16, fit: "shrink" }, key);
}
function line(pptx: ScenePptx, slide: SceneSlide, x: number, y: number, w: number, color = C.line) {
  slide.addShape(pptx.ShapeType.line, { x, y, w, h: 0, line: { color, width: .7 } });
}
function rect(pptx: ScenePptx, slide: SceneSlide, x: number, y: number, w: number, h: number, color: string) {
  slide.addShape(pptx.ShapeType.rect, { x, y, w, h, line: { type: "none" }, fill: { color } });
}

function chrome(pptx: ScenePptx, slide: SceneSlide, plan: DeckPlan, item: DeckSlide, index: number) {
  const blueprint = plan.blueprint!;
  text(slide, plan.brandName, X, .34, 4, .23, 10, C.muted, true);
  text(slide, `${PURPOSE_LABELS[blueprint.purpose]}   /   ${item.eyebrow}`, 8.1, .34, 4.51, .23, 10, C.muted);
  line(pptx, slide, X, .81, WIDTH);
  rect(pptx, slide, X, .79, WIDTH * ((index + 1) / plan.slides.length), .035, C.blue);
  line(pptx, slide, X, 6.99, WIDTH);
  text(slide, item.note ? "상세 조건과 원문 근거는 발표자 노트에 보관" : SECTOR_PROFILES[blueprint.sector].label, X, 7.13, 9, .18, 9, C.muted);
  text(slide, `${String(index + 1).padStart(2, "0")} / ${plan.slides.length}`, 11.86, 7.12, .75, .2, 9, C.muted);
}

function heading(slide: SceneSlide, item: DeckSlide) {
  placedText(slide, item, "title", X, 1.05, WIDTH, .98, item.title.length > 34 ? 27 : 30, C.ink, true);
  if (item.lead) placedText(slide, item, "lead", X, 2.05, WIDTH, .65, 15, C.muted);
}

function drawCover(pptx: ScenePptx, slide: SceneSlide, plan: DeckPlan, item: DeckSlide) {
  text(slide, PURPOSE_LABELS[plan.blueprint!.purpose], X, 1.25, 7, .35, 16, C.blue, true);
  placedText(slide, item, "title", X, 2.0, item.image ? 6.2 : WIDTH, 1.65, item.title.length > 28 ? 34 : 42, C.ink, true);
  placedText(slide, { ...item, lead: item.lead ?? plan.slogan }, "lead", X, 3.92, item.image ? 6.0 : 10.7, .95, 19, C.muted);
  if (item.image) {
    const box = item.placement?.image ?? { x: 7.45, y: 1.24, w: 5.16, h: 4.08 };
    validateProposalBox(box);
    slide.addImage({ data: item.image.data, ...box, sizing: { type: "cover", w: box.w, h: box.h }, altText: item.image.alt });
  }
  line(pptx, slide, X, 5.55, WIDTH, C.blue);
  const roles = plan.blueprint!.slots.filter(slot => ["summary", "offering", "roadmap"].includes(slot.role));
  roles.forEach((slot, index) => {
    const x = X + index * 4.08;
    text(slide, `0${index + 1}`, x, 5.85, .45, .25, 12, C.blue, true);
    text(slide, slot.title, x + .62, 5.8, 3.08, .42, 17, C.ink, true);
  });
}

function drawSummary(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  placedText(slide, item, "title", X, 1.2, WIDTH, 1.04, 32, C.ink, true);
  placedText(slide, item, "lead", X, 2.5, 7.25, 2.15, 25, C.blue, true);
  const rows = (item.points ?? []).slice(0, 4);
  rows.forEach((point, index) => {
    const y = 2.48 + index * .94;
    line(pptx, slide, 8.5, y - .15, 4.11);
    text(slide, point.label, 8.5, y, 4.11, .32, 13, C.muted, true);
    text(slide, point.detail, 8.5, y + .36, 4.11, .52, 13, C.ink);
  });
}

function drawColumns(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  heading(slide, item);
  const points = item.points?.length ? item.points : [{ label: "확인할 내용", detail: item.note ?? "원문에서 추가 확인이 필요한 항목입니다" }];
  const w = (WIDTH - .38 * (points.length - 1)) / points.length;
  points.forEach((point, index) => {
    const x = X + index * (w + .38);
    text(slide, String(index + 1).padStart(2, "0"), x, 3.13, w, .5, 27, C.blue, true);
    line(pptx, slide, x, 3.91, w);
    text(slide, point.label, x, 4.16, w, .8, 19, C.ink, true);
    text(slide, point.detail, x, 5.04, w, 1.53, 14, C.muted);
  });
}

function drawProcess(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  heading(slide, item);
  const points = item.points ?? [];
  const w = (WIDTH - .4 * Math.max(0, points.length - 1)) / Math.max(1, points.length);
  line(pptx, slide, X, 3.3, WIDTH, C.blue);
  points.forEach((point, index) => {
    const x = X + index * (w + .4);
    rect(pptx, slide, x, 3.08, .46, .46, C.blue);
    text(slide, String(index + 1), x + .13, 3.15, .25, .25, 14, C.white, true);
    text(slide, point.label, x, 3.93, w, .86, 20, C.ink, true);
    text(slide, point.detail, x, 4.96, w, 1.6, 14, C.muted);
  });
}

function drawTable(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide, timeline = false) {
  heading(slide, item);
  const table = item.table ?? (item.metrics?.length ? {
    headers: ["지표", "값", "기준"], rows: item.metrics.map(metric => [metric.label, metric.value, metric.note ?? "원문 기준"]),
  } : {
    headers: [timeline ? "단계" : "항목", timeline ? "완료 조건" : "내용"], rows: (item.points ?? []).map(point => [point.label, point.detail]),
  });
  if (!table.rows.length) return;
  const rows: SceneTableCell[][] = [
    table.headers.map(header => ({ text: header, options: { bold: true, color: C.white, fill: { color: C.blue }, fontSize: 13 } })),
    ...table.rows.map((row, rowIndex) => row.map((cell, colIndex) => ({ text: cell, options: { color: colIndex === 0 ? C.ink : C.muted, bold: colIndex === 0, fill: { color: rowIndex % 2 === 0 ? C.pale : C.white }, fontSize: 13 } }))),
  ];
  const rowH = [.5, ...table.rows.map(() => Math.min(.8, 3.2 / table.rows.length))];
  slide.addTable(rows, {
    x: X, y: 2.96, w: WIDTH, h: rowH.reduce((sum, value) => sum + value, 0), rowH, colW: table.headers.map(() => WIDTH / table.headers.length),
    fontFace: FONT, fontSize: 13, color: C.ink, margin: [.09 * 72, .16 * 72, .09 * 72, .16 * 72],
    border: { type: "solid", color: C.line, pt: .5 }, valign: "middle", autoPage: false,
  });
}

function drawEvidence(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  if (!item.image) { drawTable(pptx, slide, item); return; }
  heading(slide, item);
  const box = item.placement?.image ?? { x: X, y: 2.94, w: 7, h: 3.56 };
  validateProposalBox(box);
  slide.addImage({ data: item.image.data, ...box, sizing: { type: "contain", w: box.w, h: box.h }, altText: item.image.alt });
  (item.points ?? []).slice(0, 3).forEach((point, index) => {
    const y = 3.06 + index * 1.12;
    text(slide, point.label, 8.17, y, 4.44, .44, 16, C.ink, true);
    text(slide, point.detail, 8.17, y + .47, 4.44, .59, 13, C.muted);
  });
}

function drawClosing(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  placedText(slide, item, "title", X, 1.42, WIDTH, 1.28, 35, C.ink, true);
  if (item.lead) placedText(slide, item, "lead", X, 2.94, WIDTH, .86, 19, C.muted);
  (item.points ?? []).slice(0, 3).forEach((point, index) => {
    const y = 4.16 + index * .73;
    line(pptx, slide, X, y - .12, WIDTH);
    text(slide, String(index + 1).padStart(2, "0"), X, y, .55, .36, 15, C.blue, true);
    text(slide, point.label, 1.56, y, 3.23, .46, 17, C.ink, true);
    text(slide, point.detail, 5.12, y + .02, 7.49, .48, 14, C.muted);
  });
}

/** All body elements are native PowerPoint objects; no slide-sized raster is used. */
function appendScenes(pptx: ScenePptx, plan: DeckPlan) {
  if (!plan.blueprint || plan.slides.length !== plan.blueprint.slots.length) throw new Error("invalid_editorial_deck");
  plan.slides.forEach((item, index) => {
    if (item.id !== plan.blueprint!.slots[index].id) throw new Error("invalid_editorial_slide_id");
    const slide = pptx.addSlide();
    slide.background = { color: C.white };
    chrome(pptx, slide, plan, item, index);
    const layout: ProposalLayout = plan.blueprint!.slots[index].layout;
    if (layout === "cover") drawCover(pptx, slide, plan, item);
    else if (layout === "summary") drawSummary(pptx, slide, item);
    else if (layout === "columns") drawColumns(pptx, slide, item);
    else if (layout === "process") drawProcess(pptx, slide, item);
    else if (layout === "table" || layout === "timeline") drawTable(pptx, slide, item, layout === "timeline");
    else if (layout === "evidence") drawEvidence(pptx, slide, item);
    else drawClosing(pptx, slide, item);
    slide.addNotes([
      `근거: ${(item.sourceSections ?? []).join(", ")}`,
      `슬라이드 ID: ${item.id}; 업종: ${plan.blueprint!.sector}; 목적: ${plan.blueprint!.purpose}`,
      "사용자 제공 내용, 제안과 목표, 실제 실적은 원문의 구분에 따라 읽어주세요.",
      item.image ? `이미지: ${item.image.id} / ${item.image.alt}` : "",
      item.note ?? "",
    ].filter(Boolean).join("\n"));
  });
}

/** The editor preview and PPT export consume the same positions, content and typography. */
export function proposalScenes(plan: DeckPlan): ProposalScene[] {
  const scenes: ProposalScene[] = [];
  const pptx: ScenePptx = {
    ShapeType: { line: "line", rect: "rect" },
    addSlide() {
      const scene: ProposalScene = { nodes: [], notes: "" };
      scenes.push(scene);
      return {
        background: { color: "FFFFFF" },
        addText(text, options, element) { scene.nodes.push({ type: "text", text, options, ...(element ? { element } : {}) }); },
        addShape(shape, options) { scene.nodes.push({ type: "shape", shape, options }); },
        addImage(options) { scene.nodes.push({ type: "image", options, element: "image" }); },
        addTable(rows, options) { scene.nodes.push({ type: "table", rows, options }); },
        addNotes(notes) { scene.notes = notes; },
      };
    },
  };
  appendScenes(pptx, plan);
  return scenes;
}
