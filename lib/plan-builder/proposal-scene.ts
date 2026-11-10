import type { DeckPlan, DeckSlide } from "./deck-plan";
import { PURPOSE_LABELS, type ProposalLayout } from "./proposal-blueprint";
import { validateProposalBox, type ProposalElement, type ProposalChart, type ProposalBox, type ProposalImage } from "./proposal-revision";
import { proposalChartSchema } from "./proposal-editor";


export type SceneTextOptions = { x: number; y: number; w: number; h: number; fontFace: string; fontSize: number; color: string; bold?: boolean; margin: number; valign: "top"; lineSpacingMultiple: number; paraSpaceAfter?: number; align?: "left" | "center" | "right" };
export type SceneShape = "line" | "rect" | "roundRect" | "ellipse" | "chevron";
export type SceneShapeOptions = { x: number; y: number; w: number; h: number; line: { color?: string; width?: number; type?: "none" }; fill?: { color: string; transparency?: number }; rectRadius?: number };
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
const C = { ink: "1F2329", muted: "5B6573", blue: "0F82F5", deep: "0B63C4", soft: "BBDCFF", tint: "E8F3FF", line: "D9E2EC", gray: "E3EAF2", pale: "F1F5FA", white: "FFFFFF" };
const FONT = "Malgun Gothic";
const X = .72;
const WIDTH = 11.89;
const MID = X + WIDTH / 2;
/** Diagrams sit between the heading and the bottom margin. */
const BODY = 2.75, BOTTOM = 6.96;

function lines(value: string, w: number, font: number) {
  const capacity = w * 72 / font;
  let count = 0;
  for (const line of value.split("\n")) {
    const units = [...line].reduce((sum, char) => sum + (/[^\u0000-ÿ]/.test(char) ? 1 : /[MW@]/.test(char) ? .85 : .53), 0);
    count += Math.max(1, Math.ceil(units / capacity));
  }
  return count;
}
function fits(value: string, w: number, h: number, font: number) {
  if (w * 72 / font <= 0) return false;
  return !value || lines(value, w, font) * font * 1.16 <= h * 72 + 1;
}
/** Largest size every value fits at, by the same estimate the layout check uses; the last size is the floor. */
const fitSize = (values: string[], w: number, h: number, sizes: number[]) => sizes.find(size => values.every(value => fits(value, w, h, size))) ?? sizes[sizes.length - 1];
/** Height of the tallest value at this size, by the same estimate. */
const need = (values: string[], w: number, size: number) => Math.max(1, ...values.map(value => lines(value, w, size))) * size * 1.16 / 72;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function text(slide: SceneSlide, value: string, x: number, y: number, w: number, h: number, size = 16, color = C.ink, bold = false, element?: ProposalElement, align?: SceneTextOptions["align"]) {
  slide.addText(value, { x, y, w, h, fontFace: FONT, fontSize: size, color, bold, margin: 0, valign: "top", lineSpacingMultiple: 1.16, paraSpaceAfter: 0, ...(align ? { align } : {}) }, element);
}
/** Text centred on cy inside a maxH band; text longer than the band still reports overflow. */
function middle(slide: SceneSlide, value: string, x: number, cy: number, w: number, maxH: number, size: number, color = C.ink, bold = false, element?: ProposalElement, align: SceneTextOptions["align"] = "center") {
  const h = Math.min(maxH, need([value], w, size));
  text(slide, value, x, cy - h / 2, w, (maxH + h) / 2, size, color, bold, element, align);
}
function placedText(slide: SceneSlide, item: DeckSlide, key: "title" | "lead", x: number, y: number, w: number, h: number, sizes: number[], color = C.ink, bold = false) {
  const placed = item.placement?.[key];
  if (placed) validateProposalBox(placed);
  const box = placed ?? { x, y, w, h }, value = item[key] ?? "";
  slide.addText(value, { ...box, fontFace: FONT, fontSize: fitSize([value], box.w, box.h, sizes), color, bold, margin: 0, valign: "top", lineSpacingMultiple: 1.16 }, key);
}
/** Horizontal by default; pass h for a vertical connector. */
function line(pptx: ScenePptx, slide: SceneSlide, x: number, y: number, w: number, color = C.line, h = 0, width = .7) {
  slide.addShape(pptx.ShapeType.line, { x, y, w, h, line: { color, width } });
}
function rect(pptx: ScenePptx, slide: SceneSlide, x: number, y: number, w: number, h: number, color: string, radius = 0, transparency = 0) {
  slide.addShape(radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, { x, y, w, h, line: { type: "none" }, fill: { color, ...(transparency ? { transparency } : {}) }, ...(radius ? { rectRadius: radius } : {}) });
}
function dot(pptx: ScenePptx, slide: SceneSlide, x: number, y: number, size: number, color: string, transparency = 0) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: size, h: size, line: { type: "none" }, fill: { color, ...(transparency ? { transparency } : {}) } });
}
function ring(pptx: ScenePptx, slide: SceneSlide, x: number, y: number, size: number, color: string, fill?: string) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: size, h: size, line: { color, width: 1.5 }, ...(fill ? { fill: { color: fill } } : {}) });
}
/** ">>>" centred on (cx, cy), fading in toward the target. */
function chevrons(pptx: ScenePptx, slide: SceneSlide, cx: number, cy: number, color: string, size = .22) {
  [60, 30, 0].forEach((transparency, index) => slide.addShape(pptx.ShapeType.chevron, { x: cx - size + index * size * .6, y: cy - size / 2, w: size * .8, h: size, line: { type: "none" }, fill: { color, ...(transparency ? { transparency } : {}) } }));
}
function badge(pptx: ScenePptx, slide: SceneSlide, cx: number, cy: number, size: number, value: number, fill = C.blue, color = C.white) {
  dot(pptx, slide, cx - size / 2, cy - size / 2, size, fill);
  middle(slide, String(value), cx - size / 2, cy, size, size, Math.round(size * 30), color, true);
}
/** Draws into a buffer first; the diagram is kept only when every text fits and nothing leaves the body. */
function attempt(slide: SceneSlide, draw: (probe: SceneSlide) => void) {
  const calls: Array<() => void> = [];
  let ok = true;
  draw({
    background: slide.background,
    addText(value, options, element) { ok = ok && options.y + options.h <= BOTTOM && fits(value, options.w, options.h, options.fontSize); calls.push(() => slide.addText(value, options, element)); },
    addShape(shape, options) { ok = ok && options.y + options.h <= BOTTOM; calls.push(() => slide.addShape(shape, options)); },
    addImage() {}, addTable() {}, addChart() {}, addNotes() {},
  });
  if (ok) calls.forEach(call => call());
  return ok;
}

function chrome(pptx: ScenePptx, slide: SceneSlide, plan: DeckPlan, item: DeckSlide, index: number, dark: boolean) {
  const color = dark ? C.white : C.muted;
  text(slide, plan.brandName, X, .3, 3.55, .25, fitSize([plan.brandName], 3.55, .25, [11, 10, 9]), dark ? C.white : C.deep, true);
  text(slide, item.eyebrow, 4.365, .3, 4.6, .3, fitSize([item.eyebrow], 4.6, .3, [11, 10]), color, false, "eyebrow", "center");
  text(slide, `${item.appendix ? "부록 · " : ""}${String(index + 1).padStart(2, "0")} / ${plan.slides.length}`, 10.61, .3, 2, .25, 11, color, false, undefined, "right");
  line(pptx, slide, X, .72, WIDTH, dark ? C.soft : C.line);
}

function title(slide: SceneSlide, item: DeckSlide) {
  // A one-line title sits closer to the lead so the heading reads as one block.
  const one = fits(item.title ?? "", WIDTH, .5, 28);
  placedText(slide, item, "title", X, one ? 1.24 : .98, WIDTH, one ? .5 : .92, [28, 24], C.ink, true);
}
function heading(slide: SceneSlide, item: DeckSlide) {
  title(slide, item);
  if (item.lead) placedText(slide, item, "lead", X, 1.96, WIDTH, .66, [16, 14, 13], C.muted);
}

function drawCover(pptx: ScenePptx, slide: SceneSlide, plan: DeckPlan, item: DeckSlide) {
  if (!item.image) {
    dot(pptx, slide, 8.3, .95, 4.6, C.blue, 88);
    dot(pptx, slide, 10.55, 3.3, 2.5, C.blue, 76);
    ring(pptx, slide, 7.7, 4.0, 1.3, C.soft);
    dot(pptx, slide, 12.0, 1.1, .46, C.blue);
  }
  const label = PURPOSE_LABELS[plan.blueprint!.purpose], pill = label.length * .22 + .5;
  rect(pptx, slide, X, 1.2, pill, .46, C.blue, .23);
  text(slide, label, X, 1.31, pill, .26, 14, C.white, true, undefined, "center");
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
    rect(pptx, slide, x, 5.68, 3.73, .74, C.white, .37);
    badge(pptx, slide, x + .37, 6.05, .46, index + 1);
    middle(slide, slot.title, x + .78, 6.05, 2.7, .5, fitSize([slot.title], 2.7, .5, [17, 15, 13]), C.ink, true, undefined, "left");
  });
}

/** The brand as a hub; each point is a spoke. */
function drawSummary(pptx: ScenePptx, slide: SceneSlide, plan: DeckPlan, item: DeckSlide) {
  // Title and lead keep the boxes saved layouts were arranged around: lead from 2.5 down, left of 8.5.
  const one = fits(item.title ?? "", WIDTH, .58, 32);
  placedText(slide, item, "title", X, one ? 1.66 : 1.2, WIDTH, one ? .58 : 1.04, [32, 28, 24], C.ink, true);
  placedText(slide, item, "lead", X, 2.5, 7.7, .8, [24, 22, 20, 18, 16], C.blue, true);
  const rows = (item.points ?? []).slice(0, 4), cy = 5.15;
  if (!rows.length) return;
  const rowH = Math.min(1.2, 3.5 / rows.length), top = cy - rows.length * rowH / 2, maxH = rowH - .24;
  const labelSize = fitSize(rows.map(point => point.label), 2.2, maxH, [17, 15, 14, 13, 12]), detailSize = fitSize(rows.map(point => point.detail), 4.5, maxH, [16, 15, 14, 13, 12]);
  line(pptx, slide, 3.6, cy, .9, C.blue, 0, 1.25);
  if (rows.length > 1) line(pptx, slide, 4.5, top + rowH / 2, 0, C.blue, (rows.length - 1) * rowH, 1.25);
  dot(pptx, slide, .95, cy - 1.45, 2.9, C.blue, 85);
  dot(pptx, slide, 1.35, cy - 1.05, 2.1, C.blue);
  middle(slide, plan.brandName, 1.55, cy, 1.7, 1.2, fitSize([plan.brandName], 1.7, 1.2, [20, 17, 14, 12, 10]), C.white, true);
  rows.forEach((point, index) => {
    const mid = top + (index + .5) * rowH;
    line(pptx, slide, 4.5, mid, .7, C.blue, 0, 1.25);
    rect(pptx, slide, 5.2, mid - rowH / 2 + .07, 7.41, rowH - .14, C.white, .14);
    dot(pptx, slide, 5.13, mid - .07, .14, C.blue);
    middle(slide, point.label, 5.5, mid, 2.2, maxH, labelSize, C.deep, true, pointElement(point, index, "label"), "left");
    middle(slide, point.detail, 7.9, mid, 4.5, maxH, detailSize, C.ink, false, pointElement(point, index, "detail"), "left");
  });
}

type Points = NonNullable<DeckSlide["points"]>;
/** Circle size and centre offsets for one to four overlapping causes. */
const VENN: Array<{ d: number; at: Array<[number, number]> }> = [
  { d: 3.2, at: [[0, 0]] },
  { d: 2.7, at: [[-.95, 0], [.95, 0]] },
  { d: 2.35, at: [[0, -.87], [-.95, .75], [.95, .75]] },
  { d: 2.1, at: [[-.85, -.85], [.85, -.85], [-.85, .85], [.85, .85]] },
];
/** Overlapping causes on the left, each explained in the numbered row it points to. */
function drawVenn(pptx: ScenePptx, slide: SceneSlide, points: Points) {
  const { d, at } = VENN[points.length - 1], cx = 3.1, cy = 4.85, labelW = d * .62;
  const labelSize = fitSize(points.map(point => point.label), labelW, .7, [17, 15, 14, 13, 12]);
  const rowH = Math.min(1.3, 4.2 / points.length), top = cy - points.length * rowH / 2, maxH = rowH - .28;
  const detailSize = fitSize(points.map(point => point.detail), 5.05, maxH, [16, 15, 14, 13, 12]);
  at.forEach(([dx, dy]) => dot(pptx, slide, cx + dx - d / 2, cy + dy - d / 2, d, C.blue, 82));
  chevrons(pptx, slide, 5.92, cy, C.blue, .36);
  points.forEach((point, index) => {
    const [dx, dy] = at[index], far = Math.hypot(dx, dy) || 1, mid = top + (index + .5) * rowH;
    // The badge rides the outer edge; a circle beside its twin carries it on top.
    const [ux, uy] = dy ? [dx / far, dy / far] : [0, -1];
    middle(slide, point.label, cx + dx + dx / far * .16 - labelW / 2, cy + dy + dy / far * .16, labelW, .7, labelSize, C.ink, true, pointElement(point, index, "label"));
    badge(pptx, slide, cx + dx + ux * (d / 2 - .05), cy + dy + uy * (d / 2 - .05), .4, index + 1);
    rect(pptx, slide, 6.45, mid - rowH / 2 + .06, 6.16, rowH - .12, C.white, .14);
    badge(pptx, slide, 6.88, mid, .42, index + 1);
    middle(slide, point.detail, 7.33, mid, 5.05, maxH, detailSize, C.ink, false, pointElement(point, index, "detail"), "left");
  });
}

/** The brand branches into its parts. */
function drawTree(pptx: ScenePptx, slide: SceneSlide, root: string, points: Points) {
  const count = points.length, gap = .3, w = (WIDTH - gap * (count - 1)) / count;
  const labelSize = fitSize(points.map(point => point.label), w - .4, .6, [18, 16, 14, 13]), detailSize = fitSize(points.map(point => point.detail), w - .44, 2.1, [17, 16, 15, 14, 13, 12]);
  const body = Math.min(2.3, Math.max(1.3, need(points.map(point => point.detail), w - .44, detailSize) + .5)), top = BODY + .05 + (2.3 - body) / 2;
  rect(pptx, slide, MID - 2, top, 4, .5, C.deep, .25);
  middle(slide, root, MID - 1.8, top + .25, 3.6, .34, fitSize([root], 3.6, .34, [15, 13, 11, 9]), C.white, true);
  line(pptx, slide, MID, top + .5, 0, C.blue, .2, 1.25);
  if (count > 1) line(pptx, slide, X + w / 2, top + .7, WIDTH - w, C.blue, 0, 1.25);
  points.forEach((point, index) => {
    const x = X + index * (w + gap), y = top + .9;
    line(pptx, slide, x + w / 2, top + .7, 0, C.blue, .2, 1.25);
    rect(pptx, slide, x, y, w, .82 + body, C.white, .16);
    rect(pptx, slide, x, y, w, .82, C.blue, .16);
    rect(pptx, slide, x, y + .41, w, .41, C.blue);
    middle(slide, point.label, x + .2, y + .41, w - .4, .6, labelSize, C.white, true, pointElement(point, index, "label"));
    middle(slide, point.detail, x + .22, y + .82 + body / 2, w - .44, body - .2, detailSize, C.ink, false, pointElement(point, index, "detail"));
  });
}

/** Numbered nodes on one rail, each with its card. */
function drawProfiles(pptx: ScenePptx, slide: SceneSlide, points: Points) {
  const count = points.length, gap = .3, w = (WIDTH - gap * (count - 1)) / count;
  const labelSize = fitSize(points.map(point => point.label), w - .4, .6, [18, 16, 14, 13]), detailSize = fitSize(points.map(point => point.detail), w - .44, 1.9, [16, 15, 14, 13, 12]);
  const detailH = Math.min(1.9, need(points.map(point => point.detail), w - .44, detailSize)), top = BODY + .07 + (1.9 - detailH) / 2;
  points.forEach((_, index) => rect(pptx, slide, X + index * (w + gap), top + .55, w, 1.65 + detailH, C.white, .16));
  if (count > 1) line(pptx, slide, X + w / 2, top + .55, WIDTH - w, C.blue, 0, 1.25);
  points.forEach((point, index) => {
    const x = X + index * (w + gap), cx = x + w / 2;
    ring(pptx, slide, cx - .55, top, 1.1, C.blue, C.white);
    middle(slide, String(index + 1).padStart(2, "0"), cx - .55, top + .55, 1.1, .5, 24, C.blue, true);
    middle(slide, point.label, x + .2, top + 1.55, w - .4, .6, labelSize, C.ink, true, pointElement(point, index, "label"));
    middle(slide, point.detail, x + .22, top + 1.95 + detailH / 2, w - .44, detailH, detailSize, C.muted, false, pointElement(point, index, "detail"));
  });
}

function drawColumns(pptx: ScenePptx, slide: SceneSlide, plan: DeckPlan, item: DeckSlide, role: string) {
  heading(slide, item);
  const points = item.points?.length ? item.points : [{ label: "확인할 내용", detail: item.note ?? "원문에서 추가 확인이 필요한 항목입니다" }];
  if (role === "problem" && points.length <= VENN.length) drawVenn(pptx, slide, points);
  else if (role === "team") drawProfiles(pptx, slide, points);
  else drawTree(pptx, slide, plan.brandName, points);
}

/** Steps on one band with arrows between them; what each step does hangs below. */
function drawProcess(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  heading(slide, item);
  const points = item.points ?? [];
  if (!points.length) return;
  const w = WIDTH / points.length;
  const labelSize = fitSize(points.map(point => point.label), w - .4, .56, [18, 16, 14, 13]), detailSize = fitSize(points.map(point => point.detail), w - .56, 1.8, [18, 16, 15, 14, 13, 12]);
  const card = Math.min(2.2, Math.max(1.5, need(points.map(point => point.detail), w - .56, detailSize) + .7));
  rect(pptx, slide, X, 2.8, WIDTH, 1.62, C.blue, .2);
  points.forEach((point, index) => {
    const x = X + index * w, cx = x + w / 2;
    if (index) chevrons(pptx, slide, x, 3.33, C.white);
    badge(pptx, slide, cx, 3.33, .7, index + 1, C.white, C.blue);
    middle(slide, point.label, x + .2, 4.06, w - .4, .56, labelSize, C.white, true, pointElement(point, index, "label"));
    line(pptx, slide, cx, 4.42, 0, C.blue, .32, 1.25);
    rect(pptx, slide, x + .08, 4.74, w - .16, card, C.white, .16);
    dot(pptx, slide, cx - .08, 4.66, .16, C.blue);
    middle(slide, point.detail, x + .28, 4.74 + card / 2, w - .56, card - .4, detailSize, C.ink, false, pointElement(point, index, "detail"));
  });
}

type Table = NonNullable<DeckSlide["table"]>;
const column = (table: Table, index: number) => table.rows.map(row => row[index]);
/** Column widths and the gaps between them; the last gap holds the arrow. */
const FLOW: Record<number, { w: number[]; gap: number[] }> = {
  2: { w: [5.3, 5.99], gap: [.6] },
  3: { w: [3.4, 3.9, 3.89], gap: [.15, .55] },
  4: { w: [2.4, 2.9, 2.9, 2.95], gap: [.12, .12, .5] },
};
/** Each row reads left to right: what it is, its details, then the result it leads to. */
function drawFlow(pptx: ScenePptx, slide: SceneSlide, table: Table) {
  const { w, gap } = FLOW[table.headers.length], last = w.length - 1;
  const rowH = Math.min(1.05, 3.72 / table.rows.length), h = rowH - .12, maxH = h - .14;
  const left = w.map((_, index) => X + sum(w.slice(0, index)) + sum(gap.slice(0, index)));
  const headerSize = fitSize(table.headers, Math.min(...w), .3, [13, 12, 11]);
  const size = [17, 16, 15, 14, 13].find(size => table.rows.every(row => row.every((cell, index) => fits(cell, w[index] - .4, maxH, size)))) ?? 12;
  table.headers.forEach((header, index) => text(slide, header, left[index], 2.82, w[index], .3, headerSize, index === last ? C.deep : C.muted, true, undefined, "center"));
  table.rows.forEach((row, rowIndex) => {
    const y = 3.2 + rowIndex * rowH, mid = y + h / 2;
    row.forEach((cell, index) => {
      const edge = index === 0 || index === last;
      rect(pptx, slide, left[index], y, w[index], h, index === last ? C.blue : index === 0 ? C.gray : C.white, edge ? Math.min(.3, h / 2) : .12);
      middle(slide, cell, left[index] + .2, mid, w[index] - .4, maxH, size, index === last ? C.white : C.ink, edge);
    });
    chevrons(pptx, slide, left[last] - gap[last - 1] / 2, mid, C.blue);
  });
}

/** First column becomes dated pills on a rail; the rest of each row is its card. */
function drawTimeline(pptx: ScenePptx, slide: SceneSlide, table: Table) {
  const w = WIDTH / table.rows.length, inner = w - .56, fields = table.headers.slice(1);
  const pillSize = fitSize(column(table, 0), w - .6, .5, [15, 13, 12, 11]), captionSize = fitSize(fields, inner, .22, [12, 11, 10]);
  const measure = ([main, rest]: number[]) => fields.map((_, index) => need(column(table, index + 1), inner, index ? rest : main));
  const total = (heights: number[]) => sum(heights) + fields.length * .26 + (fields.length - 1) * .18;
  const sizes = [[18, 15], [16, 14], [15, 13], [14, 12], [13, 12]].find(pair => total(measure(pair)) <= 2.64) ?? [12, 12], heights = measure(sizes);
  line(pptx, slide, X, 3.66, WIDTH - .3, C.soft, 0, 2);
  chevrons(pptx, slide, X + WIDTH - .2, 3.66, C.blue, .2);
  table.rows.forEach((row, rowIndex) => {
    const x = X + rowIndex * w, cx = x + w / 2;
    rect(pptx, slide, x + .15, 2.8, w - .3, .6, C.blue, .3);
    middle(slide, row[0], x + .3, 3.1, w - .6, .5, pillSize, C.white, true);
    line(pptx, slide, cx, 3.4, 0, C.blue, .5, 1.25);
    ring(pptx, slide, cx - .1, 3.56, .2, C.blue, C.white);
    rect(pptx, slide, x + .08, 3.9, w - .16, total(heights) + .4, C.white, .16);
    let y = 4.1;
    fields.forEach((header, index) => {
      text(slide, header, x + .28, y, inner, .22, captionSize, C.deep, true);
      text(slide, row[index + 1], x + .28, y + .26, inner, heights[index], index ? sizes[1] : sizes[0], index ? C.muted : C.ink, !index);
      y += .26 + heights[index] + .18;
    });
  });
}

/** One card per row: name on the blue header, the offer in the body, its condition in the pill. The first header is a category word and is left out. */
function drawOffers(pptx: ScenePptx, slide: SceneSlide, table: Table) {
  const count = table.rows.length, gap = .3, w = (WIDTH - gap * (count - 1)) / count, third = table.headers.length === 3;
  const nameSize = fitSize(column(table, 0), w - .4, .8, [20, 18, 16, 14, 13, 12]), captionSize = fitSize(table.headers.slice(1), w - .66, .22, [12, 11, 10]);
  const measure = ([main, note]: number[]) => [need(column(table, 1), w - .44, main), third ? need(column(table, 2), w - .66, note) : 0];
  const total = ([valueH, noteH]: number[]) => .46 + valueH + .24 + (third ? .7 + noteH : 0);
  const sizes = [[20, 14], [18, 14], [16, 13], [14, 13], [13, 12]].find(pair => total(measure(pair)) <= 3.04) ?? [12, 12];
  const [valueH, noteH] = measure(sizes), body = total([valueH, noteH]), top = 2.8 + Math.max(0, 3.04 - body) / 2;
  table.rows.forEach((row, index) => {
    const x = X + index * (w + gap), y = top + 1.3;
    rect(pptx, slide, x, top, w, 1.1 + body, C.white, .16);
    rect(pptx, slide, x, top, w, 1.1, C.blue, .16);
    rect(pptx, slide, x, top + .55, w, .55, C.blue);
    middle(slide, row[0], x + .2, top + .55, w - .4, .8, nameSize, C.white, true);
    text(slide, table.headers[1], x + .22, y, w - .44, .22, captionSize, C.muted, true, undefined, "center");
    middle(slide, row[1], x + .22, y + .26 + valueH / 2, w - .44, valueH, sizes[0], C.ink, true);
    if (!third) return;
    const pill = y + .26 + valueH + .24;
    rect(pptx, slide, x + .18, pill, w - .36, .52 + noteH, C.tint, .12);
    text(slide, table.headers[2], x + .33, pill + .14, w - .66, .22, captionSize, C.deep, true, undefined, "center");
    middle(slide, row[2], x + .33, pill + .38 + noteH / 2, w - .66, noteH, sizes[1], C.deep);
  });
}

/** Numbers as tiles: the value is the picture. */
function drawTiles(pptx: ScenePptx, slide: SceneSlide, metrics: NonNullable<DeckSlide["metrics"]>) {
  const count = metrics.length, gap = .3, w = (WIDTH - gap * (count - 1)) / count, inner = w - .62;
  const labels = metrics.map(metric => metric.label), values = metrics.map(metric => metric.value), notes = metrics.map(metric => metric.note ?? "");
  const labelSize = fitSize(labels, inner, .5, [14, 13, 12]), valueSize = fitSize(values, inner, 1.3, [34, 30, 26, 22, 18, 16]), noteSize = fitSize(notes, inner, .8, [13, 12]);
  const labelH = need(labels, inner, labelSize), valueH = need(values, inner, valueSize), noteH = notes.some(Boolean) ? .16 + need(notes, inner, noteSize) : 0;
  const h = .6 + labelH + .14 + valueH + noteH, top = BODY + (4.2 - h) / 2;
  metrics.forEach((metric, index) => {
    const x = X + index * (w + gap);
    rect(pptx, slide, x, top, w, h, C.white, .16);
    rect(pptx, slide, x + .22, top + .3, .07, labelH + .14 + valueH, C.blue, .035);
    text(slide, metric.label, x + .42, top + .3, inner, labelH, labelSize, C.muted, true);
    text(slide, metric.value, x + .42, top + .44 + labelH, inner, valueH, valueSize, C.blue, true);
    if (metric.note) text(slide, metric.note, x + .42, top + .6 + labelH + valueH, inner, noteH - .16, noteSize, C.muted);
  });
}

const OFFER_ROLES = ["offering", "commercial", "ask"];
/** Table data is drawn as a diagram when it fits one; a table the user has placed, or one too long, stays a table. */
function drawTable(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide, role: string, timeline = false) {
  heading(slide, item);
  const metrics = !item.table && item.metrics?.length ? item.metrics : undefined;
  const table = item.table ?? (metrics ? {
    headers: ["지표", "값", "기준"], rows: metrics.map(metric => [metric.label, metric.value, metric.note ?? "원문 기준"]),
  } : {
    headers: [timeline ? "단계" : "항목", timeline ? "완료 조건" : "내용"], rows: (item.points ?? []).map(point => [point.label, point.detail]),
  });
  if (!table.rows.length) return;
  if (!item.placement?.table && FLOW[table.headers.length] && (
    metrics ? attempt(slide, probe => drawTiles(pptx, probe, metrics))
      : timeline ? attempt(slide, probe => drawTimeline(pptx, probe, table))
        : (OFFER_ROLES.includes(role) && table.headers.length <= 3 && table.rows.length <= 4 && attempt(slide, probe => drawOffers(pptx, probe, table))) || attempt(slide, probe => drawFlow(pptx, probe, table))
  )) return;
  const colW = WIDTH / table.headers.length, rowH = [.55, ...table.rows.map(() => Math.min(.85, 3.5 / table.rows.length))];
  const fontSize = [18, 16, 14].find(size => [table.headers, ...table.rows].every((row, ri) => row.every(cell => fits(cell, colW - .32, rowH[ri] - .18, size)))) ?? 13;
  const rows: SceneTableCell[][] = [
    table.headers.map(header => ({ text: header, options: { bold: true, color: C.deep, fill: { color: C.tint }, fontSize } })),
    ...table.rows.map(row => row.map((cell, colIndex) => ({ text: cell, options: { color: colIndex === 0 ? C.ink : C.muted, bold: colIndex === 0, fill: { color: C.white }, fontSize } }))),
  ];
  slide.addTable(rows, {
    x: X, y: BODY + .1, w: WIDTH, h: sum(rowH), rowH, colW: table.headers.map(() => colW),
    fontFace: FONT, fontSize, color: C.ink, margin: [.09 * 72, .16 * 72, .09 * 72, .16 * 72],
    border: { type: "solid", color: C.soft, pt: .5 }, valign: "middle", autoPage: false,
  });
}

function drawEvidence(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide, role: string) {
  if (!item.image) { drawTable(pptx, slide, item, role); return; }
  heading(slide, item);
  const box = item.placement?.image ?? { x: X, y: BODY + .1, w: 7, h: 4 };
  validateProposalBox(box);
  slide.addImage(imageOptions(item.image, box));
  const points = item.points ?? [], spacing = 4 / Math.max(1, points.length);
  const labelSize = fitSize(points.map(point => point.label), 3.98, .35, [16, 14]), detailSize = fitSize(points.map(point => point.detail), 4.44, spacing - .52, [13, 12]);
  points.forEach((point, index) => {
    const y = BODY + .12 + index * spacing;
    badge(pptx, slide, 8.34, y + .17, .34, index + 1);
    text(slide, point.label, 8.63, y, 3.98, .35, labelSize, C.ink, true, pointElement(point, index, "label"));
    text(slide, point.detail, 8.17, y + .45, 4.44, spacing - .52, detailSize, C.muted, false, pointElement(point, index, "detail"));
  });
}

/** Next steps as numbered nodes down one line. */
function drawClosing(pptx: ScenePptx, slide: SceneSlide, item: DeckSlide) {
  dot(pptx, slide, 10.1, .95, 2.7, C.white, 90);
  dot(pptx, slide, 11.7, 2.6, 1.1, C.white, 84);
  placedText(slide, item, "title", X, 1.42, WIDTH, 1.36, [40, 35, 30], C.white, true);
  if (item.lead) placedText(slide, item, "lead", X, 2.94, WIDTH, .86, [21, 19, 17], C.tint);
  const points = item.points ?? [];
  if (!points.length) return;
  const rowH = Math.min(.9, 2.9 / points.length), maxH = rowH - .2;
  const labelSize = fitSize(points.map(point => point.label), 3, maxH, [16, 14, 13]), detailSize = fitSize(points.map(point => point.detail), 7.4, maxH, [16, 14, 13]);
  if (points.length > 1) line(pptx, slide, X + .25, 4 + rowH / 2, 0, C.soft, (points.length - 1) * rowH, 1.5);
  points.forEach((point, index) => {
    const mid = 4 + (index + .5) * rowH;
    badge(pptx, slide, X + .25, mid, .5, index + 1, C.white, C.blue);
    rect(pptx, slide, X + .72, mid - rowH / 2 + .05, WIDTH - .72, rowH - .1, C.white, .14);
    middle(slide, point.label, 1.7, mid, 3, maxH, labelSize, C.ink, true, pointElement(point, index, "label"), "left");
    middle(slide, point.detail, 4.95, mid, 7.4, maxH, detailSize, C.muted, false, pointElement(point, index, "detail"), "left");
  });
}

/** All body elements are native PowerPoint objects; no slide-sized raster is used. */
function appendScenes(pptx: ScenePptx, plan: DeckPlan) {
  if (!plan.blueprint || plan.slides.length !== plan.blueprint.slots.length) throw new Error("invalid_editorial_deck");
  plan.slides.forEach((item, index) => {
    if (item.id !== plan.blueprint!.slots[index].id) throw new Error("invalid_editorial_slide_id");
    const slide = pptx.addSlide();
    const { layout, role } = plan.blueprint!.slots[index];
    const closing = layout === "closing";
    slide.background = { color: closing ? C.blue : C.pale };
    chrome(pptx, slide, plan, item, index, closing);
    if (layout === "cover") drawCover(pptx, slide, plan, item);
    else if (layout === "summary") drawSummary(pptx, slide, plan, item);
    else if (layout === "columns") drawColumns(pptx, slide, plan, item, role);
    else if (layout === "process") drawProcess(pptx, slide, item);
    else if (layout === "table" || layout === "timeline") drawTable(pptx, slide, item, role, layout === "timeline");
    else if (layout === "evidence") drawEvidence(pptx, slide, item, role);
    else if (layout === "chart") {
      heading(slide, item);
      if (proposalChartSchema.safeParse(item.chart).success && item.chart) {
        const box = { x: X + .15, y: BODY + .15, w: WIDTH - .3, h: 3.45 }, placed = { ...box, ...item.placement?.chart };
        const left = Math.max(0, placed.x - .15), top = Math.max(0, placed.y - .15);
        rect(pptx, slide, left, top, Math.min(13.33, placed.x + placed.w + .15) - left, Math.min(7.5, placed.y + placed.h + .15) - top, C.white, .16);
        slide.addChart(item.chart, box);
        text(slide, `${item.chart.basis === "actual" ? "실제 실적" : "예상"} (${item.chart.unit})  ${item.chart.source}`, X, 6.6, WIDTH, .32, 11, C.muted);
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
    ShapeType: { line: "line", rect: "rect", roundRect: "roundRect", ellipse: "ellipse", chevron: "chevron" },
    addSlide() {
      const item = plan.slides[scenes.length];
      const scene: ProposalScene = { nodes: [], notes: "", background: C.pale };
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
