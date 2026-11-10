import type { DeckPlan, DeckSlide } from "./deck-plan";
import { PURPOSE_LABELS, type ProposalLayout } from "./proposal-blueprint";
import { validateProposalBox, type ProposalElement, type ProposalChart, type ProposalBox, type ProposalImage } from "./proposal-revision";
import { proposalChartSchema } from "./proposal-editor";


export type SceneTextOptions = { x: number; y: number; w: number; h: number; fontFace: string; fontSize: number; color: string; bold?: boolean; margin: number; valign: "top"; lineSpacingMultiple: number; paraSpaceAfter?: number; align?: "left" | "center" | "right" };
export type SceneShape = "line" | "rect" | "roundRect" | "ellipse";
export type SceneShapeOptions = { x: number; y: number; w: number; h: number; line: { color?: string; width?: number; type?: "none" }; fill?: { color: string }; rectRadius?: number };
export type SceneImageOptions = { data: string; x: number; y: number; w: number; h: number; sizing: { type: "cover" | "contain"; w: number; h: number }; altText: string; crop?: ProposalImage["crop"]; sourceWidth?: number; sourceHeight?: number };
export type SceneTableCell = { text: string; options: { color: string; fill: { color: string }; fontSize: number; bold: boolean } };
export type SceneTableOptions = { x: number; y: number; w: number; h: number; rowH: number[]; colW: number[]; fontFace: string; fontSize: number; color: string; margin: [number, number, number, number]; border: { type: "solid"; color: string; pt: number }; valign: "middle"; autoPage: false };
export type ProposalSceneNode = { id: string } & (
  | { type: "text"; text: string; options: SceneTextOptions; element?: ProposalElement }
  | { type: "shape"; shape: SceneShape; options: SceneShapeOptions }
  | { type: "image"; options: SceneImageOptions; element: "image" }
  | { type: "table"; rows: SceneTableCell[][]; options: SceneTableOptions; element: "table" }
  | { type: "chart"; chart: ProposalChart; options: ProposalBox; element: "chart" });
export type ProposalScene = { nodes: ProposalSceneNode[]; notes: string; background: string };
type SceneSlide = {
  background: { color: string };
  addText(value: string, options: SceneTextOptions, element?: ProposalElement): void;
  addShape(shape: SceneShape, options: SceneShapeOptions): void;
  addImage(options: SceneImageOptions): void;
  addTable(rows: SceneTableCell[][], options: SceneTableOptions): void;
  addChart(chart: ProposalChart, options: ProposalBox): void;
  addNotes(notes: string): void;
};
type ScenePptx = { ShapeType: { [K in SceneShape]: K }; addSlide(): SceneSlide };

/** blue fills and large type; deep is the same hue dark enough for small text. */
const C = { ink: "1F2329", muted: "5B6573", blue: "0F82F5", deep: "0B63C4", soft: "BBDCFF", tint: "E8F3FF", line: "D9E2EC", pale: "F4F8FD", white: "FFFFFF" };
const FONT = "Malgun Gothic";
const X = .72;
const WIDTH = 11.89;
const TOP = 3.05;

function fits(value: string, w: number, h: number, font: number) {
  const capacity = w * 72 / font;
  if (capacity <= 0) return false;
  let lines = 0;
  for (const line of value.split("\n")) {
    const units = [...line].reduce((sum, char) => sum + (/[^\u0000-ÿ]/.test(char) ? 1 : /[MW@]/.test(char) ? .85 : .53), 0);
    lines += Math.max(1, Math.ceil(units / capacity));
  }
  return !value || lines * font * 1.16 <= h * 72 + 1;
}
/** Largest size every value fits at, by the same estimate the layout check uses; the last size is the floor. */
const fitSize = (values: string[], w: number, h: number, sizes: number[]) => sizes.find(size => values.every(value => fits(value, w, h, size))) ?? sizes[sizes.length - 1];

function text(slide: SceneSlide, value: string, x: number, y: number, w: number, h: number, size = 16, color = C.ink, bold = false, element?: ProposalElement, align?: SceneTextOptions["align"]) {
  slide.addText(value, { x, y, w, h, fontFace: FONT, fontSize: size, color, bold, margin: 0, valign: "top", lineSpacingMultiple: 1.16, paraSpaceAfter: 0, ...(align ? { align } : {}) }, element);
}
function placedText(slide: SceneSlide, item: DeckSlide, key: "title" | "lead", x: number, y: number, w: number, h: number, sizes: number[], color = C.ink, bold = false) {
  const placed = item.placement?.[key];
  if (placed) validateProposalBox(placed);
  const box = placed ?? { x, y, w, h }, value = item[key] ?? "";
  slide.addText(value, { ...box, fontFace: FONT, fontSize: fitSize([value], box.w, box.h, sizes), color, bold, margin: 0, valign: "top", lineSpacingMultiple: 1.16 }, key);
}
function line(pptx: ScenePptx, slide: SceneSlide, x: number, y: number, w: number, color = C.line) {
  slide.addShape(pptx.ShapeType.line, { x, y, w, h: 0, line: { color, width: .7 } });
}
function rect(pptx: ScenePptx, slide: SceneSlide, x: number, y: number, w: number, h: number, color: string, radius = 0) {
  slide.addShape(radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, { x, y, w, h, line: { type: "none" }, fill: { color }, ...(radius ? { rectRadius: radius } : {}) });
}
function dot(pptx: ScenePptx, slide: SceneSlide, x: number, y: number, size: number, color: string) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: size, h: size, line: { type: "none" }, fill: { color } });
}

function chrome(pptx: ScenePptx, slide: SceneSlide, plan: DeckPlan, item: DeckSlide, index: number, dark: boolean) {
  const color = dark ? C.white : C.muted;
  text(slide, plan.brandName, X, .3, 3.55, .25, fitSize([plan.brandName], 3.55, .25, [11, 10, 9]), dark ? C.white : C.deep, true);
  text(slide, item.eyebrow, 4.365, .3, 4.6, .3, fitSize([item.eyebrow], 4.6, .3, [11, 10]), color, false, "eyebrow", "center");
  text(slide, `${item.appendix ? "부록 · " : ""}${String(index + 1).padStart(2, "0")} / ${plan.slides.length}`, 10.61, .3, 2, .25, 11, color, false, undefined, "right");
  line(pptx, slide, X, .72, WIDTH, dark ? C.soft : C.line);
}

function heading(slide: SceneSlide, item: DeckSlide) {
  placedText(slide, item, "title", X, 1.0, WIDTH, 1.12, [34, 30], C.ink, true);
  if (item.lead) placedText(slide, item, "lead", X, 2.2, WIDTH, .65, [18, 15], C.muted);
}

function drawCover(pptx: ScenePptx, slide: SceneSlide, plan: DeckPlan, item: DeckSlide) {
  if (!item.image) {
    dot(pptx, slide, 8.4, 1.0, 4.2, C.tint);
    dot(pptx, slide, 7.75, 3.7, 1.25, C.soft);
    dot(pptx, slide, 11.9, 1.05, .5, C.blue);
  }
  const label = PURPOSE_LABELS[plan.blueprint!.purpose], pill = label.length * .22 + .5;
  rect(pptx, slide, X, 1.2, pill, .46, C.tint, .23);
  text(slide, label, X, 1.31, pill, .26, 14, C.deep, true, undefined, "center");
  placedText(slide, item, "title", X, 2.0, item.image ? 6.2 : WIDTH, 1.65, [46, 42], C.ink, true);
  placedText(slide, { ...item, lead: item.lead ?? plan.slogan }, "lead", X, 3.92, item.image ? 6.0 : 10.7, .95, [21, 19], C.muted);
  if (item.image) {
    const box = item.placement?.image ?? { x: 7.45, y: 1.24, w: 5.16, h: 4.08 };
    validateProposalBox(box);
    slide.addImage(imageOptions(item.image, box));
  }
  const roles = ["summary", "offering", "roadmap"].flatMap(role => { const slot = plan.blueprint!.slots.find(slot => slot.role === role); return slot ? [slot] : []; });
  roles.forEach((slot, index) => {
    const x = X + index * 4.08;
    rect(pptx, slide, x, 5.68, 3.73, .74, C.pale, .14);
    text(slide, `0${index + 1}`, x + .26, 5.93, .45, .25, 13, C.deep, true);
    text(slide, slot.title, x + .8, 5.87, 2.75, .36, fitSize([slot.title], 2.75, .36, [17, 15, 13]), C.ink, true);
  });
}

function drawSummary(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  placedText(slide, item, "title", X, 1.0, WIDTH, 1.12, [34, 30], C.ink, true);
  placedText(slide, item, "lead", X, 2.5, 7.25, 2.15, [27, 25], C.blue, true);
  const rows = (item.points ?? []).slice(0, 4);
  if (!rows.length) return;
  rect(pptx, slide, 8.2, 2.3, 4.41, rows.length * 1.06 + .3, C.pale, .16);
  const labelSize = fitSize(rows.map(point => point.label), 3.85, .3, [15, 13, 12]), detailSize = fitSize(rows.map(point => point.detail), 3.85, .56, [16, 14, 13, 12]);
  rows.forEach((point, index) => {
    const y = 2.56 + index * 1.06;
    if (index) line(pptx, slide, 8.48, y - .13, 3.85);
    text(slide, point.label, 8.48, y, 3.85, .3, labelSize, C.muted, true, pointElement(point, index, "label"));
    text(slide, point.detail, 8.48, y + .36, 3.85, .56, detailSize, C.ink, false, pointElement(point, index, "detail"));
  });
}

/** Equal cards across the body; text sizes are shared so the row reads as one set. */
function cards(pptx: ScenePptx, slide: SceneSlide, points: NonNullable<DeckSlide["points"]>, steps: boolean) {
  const count = Math.max(1, points.length), gap = .3, pad = .26, w = (WIDTH - gap * (count - 1)) / count, inner = w - pad * 2;
  const labelSize = fitSize(points.map(point => point.label), inner, .86, [24, 21, 19, 17]), detailSize = fitSize(points.map(point => point.detail), inner, 1.75, [19, 17, 15, 14, 13, 12]);
  points.forEach((_, index) => rect(pptx, slide, X + index * (w + gap), TOP, w, 3.85, C.pale, .16));
  if (steps && points.length > 1) line(pptx, slide, X + pad + .25, TOP + .51, (points.length - 1) * (w + gap), C.blue);
  points.forEach((point, index) => {
    const x = X + index * (w + gap) + pad;
    if (steps) {
      dot(pptx, slide, x, TOP + .26, .5, C.blue);
      text(slide, String(index + 1), x, TOP + .38, .5, .25, 14, C.white, true, undefined, "center");
    } else text(slide, String(index + 1).padStart(2, "0"), x, TOP + .26, inner, .5, 26, C.blue, true);
    text(slide, point.label, x, TOP + .98, inner, .86, labelSize, C.ink, true, pointElement(point, index, "label"));
    text(slide, point.detail, x, TOP + 1.92, inner, 1.75, detailSize, C.muted, false, pointElement(point, index, "detail"));
  });
}

function drawColumns(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  heading(slide, item);
  cards(pptx, slide, item.points?.length ? item.points : [{ label: "확인할 내용", detail: item.note ?? "원문에서 추가 확인이 필요한 항목입니다" }], false);
}

function drawProcess(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  heading(slide, item);
  cards(pptx, slide, item.points ?? [], true);
}

function drawTable(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide, timeline = false) {
  heading(slide, item);
  const table = item.table ?? (item.metrics?.length ? {
    headers: ["지표", "값", "기준"], rows: item.metrics.map(metric => [metric.label, metric.value, metric.note ?? "원문 기준"]),
  } : {
    headers: [timeline ? "단계" : "항목", timeline ? "완료 조건" : "내용"], rows: (item.points ?? []).map(point => [point.label, point.detail]),
  });
  if (!table.rows.length) return;
  const colW = WIDTH / table.headers.length, rowH = [.55, ...table.rows.map(() => Math.min(.85, 3.3 / table.rows.length))];
  const fontSize = [18, 16, 14].find(size => [table.headers, ...table.rows].every((row, ri) => row.every(cell => fits(cell, colW - .32, rowH[ri] - .18, size)))) ?? 13;
  const rows: SceneTableCell[][] = [
    table.headers.map(header => ({ text: header, options: { bold: true, color: C.deep, fill: { color: C.tint }, fontSize } })),
    ...table.rows.map(row => row.map((cell, colIndex) => ({ text: cell, options: { color: colIndex === 0 ? C.ink : C.muted, bold: colIndex === 0, fill: { color: C.white }, fontSize } }))),
  ];
  slide.addTable(rows, {
    x: X, y: TOP, w: WIDTH, h: rowH.reduce((sum, value) => sum + value, 0), rowH, colW: table.headers.map(() => colW),
    fontFace: FONT, fontSize, color: C.ink, margin: [.09 * 72, .16 * 72, .09 * 72, .16 * 72],
    border: { type: "solid", color: C.soft, pt: .5 }, valign: "middle", autoPage: false,
  });
}

function drawEvidence(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  if (!item.image) { drawTable(pptx, slide, item); return; }
  heading(slide, item);
  const box = item.placement?.image ?? { x: X, y: TOP, w: 7, h: 3.56 };
  validateProposalBox(box);
  slide.addImage(imageOptions(item.image, box));
  (item.points ?? []).forEach((point, index) => {
    const spacing = 3.6 / Math.max(1, item.points!.length), y = TOP + .06 + index * spacing;
    text(slide, point.label, 8.17, y, 4.44, .35, 16, C.ink, true, pointElement(point, index, "label"));
    text(slide, point.detail, 8.17, y + .4, 4.44, spacing - .45, 13, C.muted, false, pointElement(point, index, "detail"));
  });
}

function drawClosing(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  placedText(slide, item, "title", X, 1.42, WIDTH, 1.36, [40, 35], C.white, true);
  if (item.lead) placedText(slide, item, "lead", X, 2.94, WIDTH, .86, [21, 19], C.tint);
  const points = item.points ?? [];
  const labelSize = fitSize(points.map(point => point.label), 3.2, .36, [17, 15]), detailSize = fitSize(points.map(point => point.detail), 7.3, .48, [17, 15, 14, 13]);
  points.forEach((point, index) => {
    const y = 4.0 + index * .7, oneLine = fits(point.detail, 7.3, .26, detailSize);
    rect(pptx, slide, X, y, WIDTH, .62, C.white, .12);
    text(slide, String(index + 1).padStart(2, "0"), X + .26, y + .18, .55, .3, 15, C.deep, true);
    text(slide, point.label, 1.62, y + .16, 3.2, .36, labelSize, C.ink, true, pointElement(point, index, "label"));
    text(slide, point.detail, 5.12, y + (oneLine ? .19 : .07), 7.3, oneLine ? .3 : .48, detailSize, C.muted, false, pointElement(point, index, "detail"));
  });
}

/** All body elements are native PowerPoint objects; no slide-sized raster is used. */
function appendScenes(pptx: ScenePptx, plan: DeckPlan) {
  if (!plan.blueprint || plan.slides.length !== plan.blueprint.slots.length) throw new Error("invalid_editorial_deck");
  plan.slides.forEach((item, index) => {
    if (item.id !== plan.blueprint!.slots[index].id) throw new Error("invalid_editorial_slide_id");
    const slide = pptx.addSlide();
    const layout: ProposalLayout = plan.blueprint!.slots[index].layout;
    const closing = layout === "closing";
    slide.background = { color: closing ? C.blue : C.white };
    chrome(pptx, slide, plan, item, index, closing);
    if (layout === "cover") drawCover(pptx, slide, plan, item);
    else if (layout === "summary") drawSummary(pptx, slide, item);
    else if (layout === "columns") drawColumns(pptx, slide, item);
    else if (layout === "process") drawProcess(pptx, slide, item);
    else if (layout === "table" || layout === "timeline") drawTable(pptx, slide, item, layout === "timeline");
    else if (layout === "evidence") drawEvidence(pptx, slide, item);
    else if (layout === "chart") {
      heading(slide, item);
      if (proposalChartSchema.safeParse(item.chart).success && item.chart) {
        slide.addChart(item.chart, { x: X, y: TOP, w: WIDTH, h: 3.4 });
        text(slide, `${item.chart.basis === "actual" ? "실제 실적" : "예상"} (${item.chart.unit})  ${item.chart.source}`, X, 6.58, WIDTH, .32, 11, C.muted);
      }
    }
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
    ShapeType: { line: "line", rect: "rect", roundRect: "roundRect", ellipse: "ellipse" },
    addSlide() {
      const item = plan.slides[scenes.length];
      const scene: ProposalScene = { nodes: [], notes: "", background: C.white };
      scenes.push(scene);
      return {
        get background() { return { color: scene.background }; },
        set background(value) { scene.background = value.color; },
        addText(text, options, element) { scene.nodes.push({ id: `${item.id}:${element ?? `text-${scene.nodes.length}`}`, type: "text", text, options: { ...options, ...(element ? item.placement?.[element] : {}), ...(element && item.alignment?.[element] ? { align: item.alignment[element] } : {}) }, ...(element ? { element } : {}) }); },
        addShape(shape, options) { scene.nodes.push({ id: `${item.id}:rule-${scene.nodes.length}`, type: "shape", shape, options }); },
        addImage(options) { scene.nodes.push({ id: `${item.id}:image`, type: "image", options, element: "image" }); },
        addTable(rows, options) {
          const box = item.placement?.table;
          scene.nodes.push({ id: `${item.id}:table`, type: "table", rows, options: box ? { ...options, ...box, rowH: options.rowH.map(height => height / options.h * box.h), colW: options.colW.map(width => width / options.w * box.w) } : options, element: "table" });
        },
        addChart(chart, options) { scene.nodes.push({ id: `${item.id}:chart`, type: "chart", chart, options: { ...options, ...item.placement?.chart }, element: "chart" }); },
        addNotes(notes) { scene.notes = notes; },
      };
    },
  };
  appendScenes(pptx, plan);
  return scenes;
}

function pointElement(point: { id?: string }, index: number, part: "label" | "detail"): ProposalElement { return `point:${point.id ?? `p${index + 1}`}:${part}`; }
function imageOptions(image: ProposalImage, box: ProposalBox): SceneImageOptions {
  return { data: image.data, ...box, sizing: { type: image.fit ?? "contain", w: box.w, h: box.h }, altText: image.alt, crop: image.crop, sourceWidth: image.width, sourceHeight: image.height };
}

/** Cropping is explicit; the selected region retains its aspect ratio in both renderers. */
export function proposalImageViewport(options: SceneImageOptions) {
  const crop = options.crop;
  if (!crop) return options;
  const ratio = (options.sourceWidth ?? 1) * crop.w / ((options.sourceHeight ?? 1) * crop.h);
  const w = Math.min(options.w, options.h * ratio), h = w / ratio;
  return { ...options, x: options.x + (options.w - w) / 2, y: options.y + (options.h - h) / 2, w, h };
}

export type ProposalLayoutIssue = { slideId: string; element: string; code: "overflow" | "bounds" | "overlap" | "missing_data"; message: string };
export function proposalChartScale(chart: ProposalChart) {
  const values = chart.series.flatMap(series => series.values);
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const rough = (high - low || 1) / 4, magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map(value => value * magnitude).find(value => value >= rough)!;
  const min = Math.floor(low / step) * step, max = Math.ceil((high || step) / step) * step;
  return { min, max, step };
}
export function proposalLayoutIssues(plan: DeckPlan, scenes = proposalScenes(plan)): ProposalLayoutIssue[] {
  const issues: ProposalLayoutIssue[] = [];
  scenes.forEach((scene, index) => {
    const slide = plan.slides[index];
    const issue = (element: string, code: ProposalLayoutIssue["code"], message: string) => issues.push({ slideId: slide.id!, element, code, message });
    if (slide.composition?.layout === "chart" && !proposalChartSchema.safeParse(slide.chart).success) issue("chart", "missing_data", "차트 수치와 출처를 입력해 주세요");
    for (const node of scene.nodes) {
      const box = node.options, element = "element" in node && node.element ? node.element : node.id;
      if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.x < 0 || box.y < 0 || box.w < 0 || box.h < 0 || box.x + box.w > 13.331 || box.y + box.h > 7.501) issue(element, "bounds", "슬라이드 밖으로 벗어난 요소가 있어요");
      if (node.type === "text" && !fits(node.text, box.w, box.h, node.options.fontSize)) issue(element, "overflow", "텍스트가 공간보다 길어요. 배치를 넓히거나 페이지를 나눠 주세요");
      if (node.type === "table") for (const [ri, row] of node.rows.entries()) for (const [ci, cell] of row.entries()) if (!fits(cell.text, node.options.colW[ci] - .32, node.options.rowH[ri] - .18, cell.options.fontSize)) issue("table", "overflow", "표 내용이 셀을 넘어요. 행을 나누거나 표 크기를 늘려 주세요");
      if (node.type === "chart") {
        if (node.chart.categories.some(label => !fits(label, box.w * .87 / node.chart.categories.length, .23, 11))) issue("chart", "overflow", "차트 항목명이 겹쳐요. 항목명을 줄이거나 차트를 넓혀 주세요");
        if (node.chart.series.some(series => !fits(series.name, box.w * .87 / node.chart.series.length - .3, .23, 11))) issue("chart", "overflow", "차트 범례가 길어요. 계열명을 줄이거나 차트를 넓혀 주세요");
      }
    }
    const editable = scene.nodes.filter(node => "element" in node && node.element);
    for (let a = 0; a < editable.length; a++) for (let b = a + 1; b < editable.length; b++) {
      const first = editable[a], second = editable[b], x = first.options, y = second.options;
      if (Math.min(x.x + x.w, y.x + y.w) - Math.max(x.x, y.x) > .03 && Math.min(x.y + x.h, y.y + y.h) - Math.max(x.y, y.y) > .03) issue(first.id, "overlap", "내용 요소가 겹쳐요. 배치를 조정해 주세요");
    }
  });
  return issues.filter((issue, index) => issues.findIndex(other => other.slideId === issue.slideId && other.element === issue.element && other.code === issue.code) === index);
}
