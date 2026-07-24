import PptxGenJS from "pptxgenjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import {
  applyPresentationDraft,
  buildPresentationSlides,
  formatDeckCompactMoney,
  type PresentationChart,
  type PresentationDeckDraft,
  type PresentationDeckInput,
  type PresentationMetric,
  type PresentationPoint,
  type PresentationSlide,
  type PresentationSource,
  type PresentationStep,
} from "../../../../lib/delivery/presentation-deck";

export const runtime = "nodejs";
export const maxDuration = 60;

const deckRequestSchema = z.object({
  deckType: z.enum(["intro", "ir"]).default("intro"),
  brandName: z.string().trim().min(1).max(80),
  slogan: z.string().trim().max(120).default(""),
  title: z.string().trim().min(1).max(160),
  oneLiner: z.string().trim().min(1).max(500),
  customer: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(300),
  revenue: z.string().trim().min(1).max(300),
  priceWon: z.number().int().min(0).max(10_000_000_000),
  risk: z.string().trim().max(700).default(""),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sector: z.string().trim().max(160).default(""),
  stage: z.string().trim().max(160).default(""),
  launchTime: z.string().trim().max(160).default(""),
  firstTest: z.string().trim().max(700).default(""),
  matchScore: z.number().min(0).max(100).nullable().default(null),
  marketScore: z.number().min(0).max(100).nullable().default(null),
  feasibilityScore: z.number().min(0).max(100).nullable().default(null),
  monthlyFixedCostWon: z.number().min(0).max(100_000_000_000).nullable().default(null),
  breakEvenUnits: z.number().min(0).max(100_000_000).nullable().default(null),
  totalFundingNeedWon: z.number().min(0).max(100_000_000_000).nullable().default(null),
  targetMonthlyUnits: z.number().min(0).max(100_000_000).nullable().default(null),
  variableCostPerUnit: z.number().min(0).max(100_000_000_000).nullable().default(null),
  contributionPerUnit: z.number().min(-100_000_000_000).max(100_000_000_000).nullable().default(null),
  contributionMarginRate: z.number().min(-10_000).max(10_000).nullable().default(null),
  breakEvenRevenueWon: z.number().min(0).max(100_000_000_000_000).nullable().default(null),
  initialInvestmentWon: z.number().min(0).max(100_000_000_000_000).nullable().default(null),
  runwayMonths: z.number().min(0).max(1_000).nullable().default(null),
  investmentAskWon: z.number().min(0).max(100_000_000_000_000).nullable().default(null),
  financialScenarios: z.array(z.object({
    name: z.string().trim().min(1).max(40),
    monthlyUnits: z.number().min(0).max(100_000_000),
    netRevenue: z.number().min(-100_000_000_000_000).max(100_000_000_000_000),
    operatingProfitBeforeTax: z.number().min(-100_000_000_000_000).max(100_000_000_000_000),
  })).max(6).default([]),
  monthlyForecast: z.array(z.object({
    monthIndex: z.number().int().min(1).max(12),
    month: z.string().trim().min(1).max(30),
    rampFactor: z.number().min(0).max(100),
    units: z.number().int().min(0).max(100_000_000),
    grossUnitPriceWon: z.number().min(0).max(100_000_000_000),
    netUnitPriceWon: z.number().min(0).max(100_000_000_000),
    grossRevenueWon: z.number().min(0).max(100_000_000_000_000),
    netRevenueWon: z.number().min(0).max(100_000_000_000_000),
    variableCostsWon: z.number().min(0).max(100_000_000_000_000),
    contributionWon: z.number().min(-100_000_000_000_000).max(100_000_000_000_000),
    fixedCostsWon: z.number().min(0).max(100_000_000_000_000),
    operatingProfitBeforeTaxWon: z.number().min(-100_000_000_000_000).max(100_000_000_000_000),
    cumulativeOperatingProfitWon: z.number().min(-100_000_000_000_000).max(100_000_000_000_000),
    cumulativeCashAfterInitialInvestmentWon: z.number().min(-100_000_000_000_000).max(100_000_000_000_000),
  })).max(12).default([]),
  fundingUses: z.array(z.object({
    label: z.string().trim().min(1).max(100),
    amountWon: z.number().min(0).max(100_000_000_000_000),
  })).max(12).default([]),
  marketEvidence: z.array(z.object({
    metric: z.string().trim().min(1).max(160),
    value: z.string().trim().min(1).max(120),
    numericValue: z.number().finite().nullable().default(null),
    unit: z.string().trim().max(40).default(""),
    region: z.string().trim().max(100).default(""),
    sourceName: z.string().trim().max(180).default(""),
    verification: z.enum(["verified", "user_supplied", "unverified", "example"]).default("unverified"),
    url: z.string().url().optional(),
    observedAt: z.string().max(40).optional(),
  })).max(12).default([]),
  teamSize: z.number().int().min(1).max(100_000).nullable().default(null),
  founderStrengths: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  founderExperience: z.string().trim().max(1_000).default(""),
  evidenceSources: z.array(z.object({
    title: z.string().trim().min(1).max(180),
    status: z.string().trim().max(80).default("확인 필요"),
    url: z.string().url().optional(),
    observedAt: z.string().max(40).optional(),
  })).max(6).default([]),
  traction: z.object({
    interviews: z.number().int().min(0).max(1_000_000_000).default(0),
    proposals: z.number().int().min(0).max(1_000_000_000).default(0),
    purchases: z.number().int().min(0).max(1_000_000_000).default(0),
    revenueWon: z.number().min(0).max(100_000_000_000_000).default(0),
    confidenceScore: z.number().min(0).max(100).default(0),
  }).default({ interviews: 0, proposals: 0, purchases: 0, revenueWon: 0, confidenceScore: 0 }),
  edits: z.object({
    slides: z.record(z.string().regex(/^[a-z0-9-]+$/), z.object({
      title: z.string().trim().max(180).optional(),
      lead: z.string().trim().max(700).optional(),
      statement: z.string().trim().max(900).optional(),
      supporting: z.string().trim().max(700).optional(),
      note: z.string().trim().max(700).optional(),
      chartPreset: z.enum(["fit", "traction"]).nullable().optional(),
    })),
    updatedAt: z.string().datetime(),
  }).optional(),
});

type DeckInput = z.infer<typeof deckRequestSchema>;

const INK = "14231D";
const INK_2 = "243A31";
const MUTED = "65756D";
const LINE = "DCE5E0";
const PALE = "F1F6F3";
const WHITE = "FFFFFF";
const SOFT_WHITE = "C7D5CE";
const IR_INK = "15213B";
const IR_INK_2 = "26385C";
const IR_PALE = "EEF3FF";
const IR_LINE = "D7E0F4";
const BODY_FONT = "Malgun Gothic";
const SHAPE = new PptxGenJS().ShapeType;

function cleanHex(value: string) {
  const hex = value.replace("#", "").toUpperCase();
  const [r, g, b] = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((part) => Number.parseInt(part, 16));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.78 ? "08775A" : hex;
}

function compact(value: string, max = 110) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function addFooter(slide: PptxGenJS.Slide, input: PresentationDeckInput, page: number, accent: string, dark = false) {
  const color = dark ? "82978E" : MUTED;
  const line = dark ? "31483F" : LINE;
  slide.addShape(SHAPE.line, { x: 0.75, y: 7.02, w: 11.82, h: 0, line: { color: line, width: 0.7 } });
  slide.addText(`${input.brandName} · ${input.deckType === "ir" ? "INVESTOR RELATIONS" : "BUSINESS INTRODUCTION"}`, {
    x: 0.75, y: 7.12, w: 7.8, h: 0.18, fontFace: BODY_FONT, fontSize: 8, color, margin: 0,
  });
  slide.addText(String(page).padStart(2, "0"), {
    x: 11.8, y: 7.1, w: 0.76, h: 0.2, fontFace: BODY_FONT, fontSize: 9, bold: true, color: accent, align: "right", margin: 0,
  });
}

function addHeading(slide: PptxGenJS.Slide, item: PresentationSlide, page: number, accent: string, dark = false) {
  slide.addText(item.eyebrow, {
    x: 0.75, y: 0.48, w: 7.4, h: 0.26, fontFace: BODY_FONT, fontSize: 11, bold: true, color: accent, charSpacing: 0.6, margin: 0,
  });
  slide.addText(compact(item.title, 72), {
    x: 0.75, y: 0.88, w: 11.25, h: 0.75, fontFace: BODY_FONT, fontSize: 32, bold: true, color: dark ? WHITE : INK, margin: 0, fit: "shrink",
  });
  slide.addText(String(page).padStart(2, "0"), {
    x: 11.75, y: 0.47, w: 0.8, h: 0.26, fontFace: BODY_FONT, fontSize: 10, bold: true, color: dark ? "82978E" : MUTED, align: "right", margin: 0,
  });
}

function addCover(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, accent: string) {
  const slide = pptx.addSlide();
  const coverInk = input.deckType === "ir" ? IR_INK : INK;
  slide.background = { color: coverInk };
  slide.addShape(SHAPE.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: accent }, line: { color: accent } });
  slide.addShape(SHAPE.line, { x: 0.86, y: 0.86, w: 11.62, h: 0, line: { color: input.deckType === "ir" ? "304164" : "3B554A", width: 0.8 } });
  slide.addText(item.eyebrow, { x: 0.88, y: 1.12, w: 6.5, h: 0.28, fontFace: BODY_FONT, fontSize: 12, bold: true, color: accent, charSpacing: 1.1, margin: 0 });
  slide.addText(compact(item.title, 38), { x: 0.86, y: 1.78, w: 9.1, h: 1.2, fontFace: BODY_FONT, fontSize: 46, bold: true, color: WHITE, margin: 0, fit: "shrink" });
  slide.addText(compact(item.lead ?? "", 100), { x: 0.9, y: 3.25, w: 8.9, h: 0.9, fontFace: BODY_FONT, fontSize: 21, color: SOFT_WHITE, margin: 0, fit: "shrink" });
  slide.addText(item.supporting ?? "", { x: 0.9, y: 5.91, w: 6.4, h: 0.28, fontFace: BODY_FONT, fontSize: 13, bold: true, color: WHITE, margin: 0 });
  slide.addText(new Date().toLocaleDateString("ko-KR"), { x: 0.9, y: 6.31, w: 3.6, h: 0.22, fontFace: BODY_FONT, fontSize: 9, color: "82978E", margin: 0 });
  slide.addText(input.deckType === "ir" ? "IR" : "BI", { x: 10.23, y: 4.58, w: 2.1, h: 1.18, fontFace: BODY_FONT, fontSize: 54, bold: true, color: accent, align: "right", margin: 0, transparency: 12 });
  slide.addShape(SHAPE.line, { x: 10.92, y: 5.92, w: 1.4, h: 0, line: { color: accent, width: 4 } });
}

function addStatement(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  addHeading(slide, item, page, accent);
  slide.addText("“", { x: 0.7, y: 1.88, w: 1.25, h: 1.05, fontFace: "Georgia", fontSize: 66, color: accent, margin: 0 });
  slide.addText(compact(item.statement ?? "", 160), { x: 1.65, y: 2.05, w: 10.1, h: 1.7, fontFace: BODY_FONT, fontSize: 29, bold: true, color: INK, margin: 0, fit: "shrink", valign: "middle" });
  slide.addShape(SHAPE.line, { x: 1.68, y: 4.28, w: 1.2, h: 0, line: { color: accent, width: 3 } });
  slide.addText(compact(item.supporting ?? "", 220), { x: 1.68, y: 4.63, w: 9.85, h: 0.82, fontFace: BODY_FONT, fontSize: 17, color: MUTED, margin: 0, fit: "shrink" });
  addFooter(slide, input, page, accent);
}

function addPointRows(slide: PptxGenJS.Slide, points: PresentationPoint[], accent: string, x: number, y: number, width: number) {
  points.slice(0, 3).forEach((point, index) => {
    const rowY = y + index * 1.08;
    slide.addText(String(index + 1).padStart(2, "0"), { x, y: rowY + 0.03, w: 0.42, h: 0.24, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, margin: 0 });
    slide.addText(compact(point.label, 28), { x: x + 0.58, y: rowY, w: 2.02, h: 0.3, fontFace: BODY_FONT, fontSize: 13, bold: true, color: INK, margin: 0, fit: "shrink" });
    slide.addText(compact(point.detail, 96), { x: x + 2.72, y: rowY - 0.03, w: width - 2.72, h: 0.66, fontFace: BODY_FONT, fontSize: 14, color: MUTED, margin: 0, fit: "shrink" });
    if (index < Math.min(points.length, 3) - 1) slide.addShape(SHAPE.line, { x, y: rowY + 0.86, w: width, h: 0, line: { color: LINE, width: 0.8 } });
  });
}

function addSplit(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  addHeading(slide, item, page, accent);
  slide.addShape(SHAPE.rect, { x: 0.75, y: 2.02, w: 3.68, h: 3.95, fill: { color: PALE }, line: { color: PALE } });
  slide.addShape(SHAPE.rect, { x: 0.75, y: 2.02, w: 0.1, h: 3.95, fill: { color: accent }, line: { color: accent } });
  slide.addText("핵심", { x: 1.12, y: 2.43, w: 1.2, h: 0.25, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, margin: 0 });
  slide.addText(compact(item.lead ?? "", 88), { x: 1.1, y: 2.9, w: 2.92, h: 1.78, fontFace: BODY_FONT, fontSize: 23, bold: true, color: INK, margin: 0, fit: "shrink", valign: "middle" });
  if (item.note) slide.addText(compact(item.note, 120), { x: 1.12, y: 5.06, w: 2.85, h: 0.54, fontFace: BODY_FONT, fontSize: 10, color: MUTED, margin: 0, fit: "shrink" });
  addPointRows(slide, item.points ?? [], accent, 4.92, 2.22, 7.2);
  addFooter(slide, input, page, accent);
}

function addProcess(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: PALE };
  addHeading(slide, item, page, accent);
  if (item.lead) slide.addText(compact(item.lead, 170), { x: 0.77, y: 1.72, w: 10.8, h: 0.52, fontFace: BODY_FONT, fontSize: 15, color: MUTED, margin: 0, fit: "shrink" });
  slide.addShape(SHAPE.line, { x: 1.37, y: 3.16, w: 10.12, h: 0, line: { color: "ADC0B7", width: 1.5 } });
  (item.steps ?? []).slice(0, 4).forEach((step: PresentationStep, index) => {
    const x = 0.78 + index * 3.08;
    slide.addText(String(index + 1).padStart(2, "0"), { x, y: 2.63, w: 1.16, h: 0.56, fontFace: BODY_FONT, fontSize: 31, bold: true, color: index === 0 ? accent : "9BB0A6", margin: 0 });
    slide.addShape(SHAPE.ellipse, { x: x + 0.13, y: 3.02, w: 0.28, h: 0.28, fill: { color: index === 0 ? accent : WHITE }, line: { color: accent, width: 1.1 } });
    slide.addText(compact(step.title, 26), { x, y: 3.72, w: 2.7, h: 0.42, fontFace: BODY_FONT, fontSize: 18, bold: true, color: INK, margin: 0, fit: "shrink" });
    slide.addText(compact(step.detail, 72), { x, y: 4.35, w: 2.62, h: 0.82, fontFace: BODY_FONT, fontSize: 14, color: MUTED, margin: 0, fit: "shrink" });
  });
  addFooter(slide, input, page, accent);
}

function addMetricColumns(slide: PptxGenJS.Slide, metrics: PresentationMetric[], accent: string, dark: boolean) {
  metrics.slice(0, 4).forEach((metric, index) => {
    const x = 0.78 + index * 3.05;
    if (index > 0) slide.addShape(SHAPE.line, { x: x - 0.3, y: 2.68, w: 0, h: 2.88, line: { color: dark ? "3A5047" : LINE, width: 1 } });
    slide.addText(metric.label, { x, y: 2.73, w: 2.55, h: 0.3, fontFace: BODY_FONT, fontSize: 11, bold: true, color: accent, margin: 0, fit: "shrink" });
    slide.addText(compact(metric.value, 32), { x, y: 3.36, w: 2.55, h: 1.0, fontFace: BODY_FONT, fontSize: 27, bold: true, color: dark ? WHITE : INK, margin: 0, fit: "shrink" });
    slide.addText(compact(metric.note, 76), { x, y: 4.73, w: 2.52, h: 0.7, fontFace: BODY_FONT, fontSize: 12, color: dark ? SOFT_WHITE : MUTED, margin: 0, fit: "shrink" });
  });
}

function addMetrics(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  const dark = Boolean(item.dark);
  slide.background = { color: dark ? INK : WHITE };
  addHeading(slide, item, page, accent, dark);
  if (item.lead) slide.addText(compact(item.lead, 180), { x: 0.77, y: 1.73, w: 11.0, h: 0.5, fontFace: BODY_FONT, fontSize: 15, color: dark ? SOFT_WHITE : MUTED, margin: 0, fit: "shrink" });
  addMetricColumns(slide, item.metrics ?? [], accent, dark);
  addFooter(slide, input, page, accent, dark);
}

function addEvidenceRows(slide: PptxGenJS.Slide, sources: PresentationSource[], accent: string) {
  sources.slice(0, 4).forEach((source, index) => {
    const y = 2.64 + index * 0.78;
    slide.addText(String(index + 1).padStart(2, "0"), { x: 0.78, y: y + 0.08, w: 0.44, h: 0.22, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, margin: 0 });
    slide.addText(compact(source.title, 100), { x: 1.48, y, w: 8.3, h: 0.42, fontFace: BODY_FONT, fontSize: 16, bold: true, color: INK, margin: 0, fit: "shrink" });
    slide.addText(compact(source.status, 34), { x: 10.18, y: y + 0.01, w: 2.1, h: 0.34, fontFace: BODY_FONT, fontSize: 9, bold: true, color: accent, align: "right", margin: 0, fit: "shrink" });
    slide.addShape(SHAPE.line, { x: 1.48, y: y + 0.58, w: 10.8, h: 0, line: { color: LINE, width: 0.8 } });
  });
}

function addEvidence(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  addHeading(slide, item, page, accent);
  if (item.lead) slide.addText(compact(item.lead, 180), { x: 0.77, y: 1.73, w: 11.1, h: 0.52, fontFace: BODY_FONT, fontSize: 15, color: MUTED, margin: 0, fit: "shrink" });
  addEvidenceRows(slide, item.sources ?? [], accent);
  if (item.note) {
    slide.addShape(SHAPE.rect, { x: 0.78, y: 5.93, w: 11.45, h: 0.62, fill: { color: PALE }, line: { color: PALE } });
    slide.addText(compact(item.note, 170), { x: 1.02, y: 6.11, w: 11.0, h: 0.24, fontFace: BODY_FONT, fontSize: 10, color: MUTED, margin: 0, fit: "shrink" });
  }
  addFooter(slide, input, page, accent);
}

function addTimeline(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  addHeading(slide, item, page, accent);
  if (item.lead) slide.addText(compact(item.lead, 170), { x: 0.77, y: 1.72, w: 11.0, h: 0.52, fontFace: BODY_FONT, fontSize: 15, color: MUTED, margin: 0, fit: "shrink" });
  (item.steps ?? []).slice(0, 3).forEach((step, index) => {
    const x = 0.78 + index * 4.06;
    slide.addText(step.title, { x, y: 2.64, w: 3.56, h: 0.45, fontFace: BODY_FONT, fontSize: 20, bold: true, color: index === 0 ? accent : INK, margin: 0 });
    slide.addShape(SHAPE.line, { x, y: 3.31, w: 3.56, h: 0, line: { color: index === 0 ? accent : LINE, width: index === 0 ? 4 : 2 } });
    slide.addText(compact(step.detail, 96), { x, y: 3.75, w: 3.52, h: 1.05, fontFace: BODY_FONT, fontSize: 15, color: MUTED, margin: 0, fit: "shrink" });
  });
  if (item.note) slide.addText(compact(item.note, 145), { x: 0.78, y: 5.62, w: 11.3, h: 0.36, fontFace: BODY_FONT, fontSize: 11, bold: true, color: accent, margin: 0, fit: "shrink" });
  addFooter(slide, input, page, accent);
}

function addFunding(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: INK };
  addHeading(slide, item, page, accent, true);
  slide.addText("현재 필요 자금", { x: 0.8, y: 2.18, w: 3.4, h: 0.28, fontFace: BODY_FONT, fontSize: 11, bold: true, color: accent, margin: 0 });
  slide.addText(compact(item.lead ?? "확인 필요", 28), { x: 0.78, y: 2.72, w: 4.12, h: 1.02, fontFace: BODY_FONT, fontSize: 34, bold: true, color: WHITE, margin: 0, fit: "shrink" });
  slide.addText(compact(item.note ?? "", 110), { x: 0.8, y: 4.13, w: 3.74, h: 0.72, fontFace: BODY_FONT, fontSize: 12, color: SOFT_WHITE, margin: 0, fit: "shrink" });
  (item.points ?? []).slice(0, 3).forEach((point, index) => {
    const y = 2.18 + index * 1.15;
    slide.addText(point.label, { x: 5.16, y, w: 2.35, h: 0.3, fontFace: BODY_FONT, fontSize: 12, bold: true, color: index === 0 ? accent : SOFT_WHITE, margin: 0, fit: "shrink" });
    slide.addText(compact(point.detail, 78), { x: 7.62, y: y - 0.03, w: 4.55, h: 0.58, fontFace: BODY_FONT, fontSize: 14, color: WHITE, margin: 0, fit: "shrink" });
    slide.addShape(SHAPE.line, { x: 5.16, y: y + 0.78, w: 7.0, h: 0, line: { color: "3A5047", width: 0.8 } });
  });
  addFooter(slide, input, page, accent, true);
}

function addThesis(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFF" };
  addHeading(slide, item, page, accent);
  slide.addText(compact(item.lead ?? "", 190), {
    x: 0.78, y: 1.72, w: 11.2, h: 0.55, fontFace: BODY_FONT, fontSize: 16, color: IR_INK_2, margin: 0, fit: "shrink",
  });
  (item.metrics ?? []).slice(0, 4).forEach((metric, index) => {
    const x = 0.78 + index % 2 * 5.86;
    const y = 2.48 + Math.floor(index / 2) * 1.6;
    slide.addShape(SHAPE.roundRect, { x, y, w: 5.48, h: 1.28, rectRadius: 0.05, fill: { color: WHITE }, line: { color: IR_LINE, width: 1 } });
    slide.addText(metric.label, { x: x + 0.28, y: y + 0.2, w: 1.48, h: 0.24, fontFace: BODY_FONT, fontSize: 9, bold: true, color: accent, margin: 0, fit: "shrink" });
    slide.addText(compact(metric.value, 58), { x: x + 1.78, y: y + 0.18, w: 3.38, h: 0.46, fontFace: BODY_FONT, fontSize: 18, bold: true, color: IR_INK, margin: 0, fit: "shrink", align: "right" });
    slide.addText(compact(metric.note, 82), { x: x + 0.28, y: y + 0.78, w: 4.88, h: 0.25, fontFace: BODY_FONT, fontSize: 9, color: MUTED, margin: 0, fit: "shrink" });
  });
  if (item.note) slide.addText(compact(item.note, 170), { x: 0.8, y: 5.91, w: 11.2, h: 0.34, fontFace: BODY_FONT, fontSize: 11, bold: true, color: IR_INK_2, margin: 0, fit: "shrink" });
  addFooter(slide, input, page, accent);
}

function addMarket(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  addHeading(slide, item, page, accent);
  slide.addText(compact(item.lead ?? "", 180), { x: 0.78, y: 1.7, w: 11.1, h: 0.44, fontFace: BODY_FONT, fontSize: 14, color: MUTED, margin: 0, fit: "shrink" });
  (item.marketTiers ?? []).slice(0, 3).forEach((tier, index) => {
    const x = 0.78 + index * 4.04;
    slide.addShape(SHAPE.roundRect, {
      x, y: 2.38, w: 3.62, h: 3.38, rectRadius: 0.05,
      fill: { color: index === 2 ? IR_PALE : "F8FAFD" }, line: { color: index === 2 ? accent : IR_LINE, width: index === 2 ? 1.6 : 1 },
    });
    slide.addText(tier.label, { x: x + 0.28, y: 2.67, w: 0.92, h: 0.3, fontFace: BODY_FONT, fontSize: 13, bold: true, color: accent, margin: 0 });
    slide.addText(tier.name, { x: x + 1.18, y: 2.69, w: 2.08, h: 0.24, fontFace: BODY_FONT, fontSize: 9, color: MUTED, align: "right", margin: 0, fit: "shrink" });
    slide.addText(compact(tier.value, 32), { x: x + 0.28, y: 3.3, w: 3.06, h: 0.72, fontFace: BODY_FONT, fontSize: 26, bold: true, color: IR_INK, margin: 0, fit: "shrink" });
    slide.addShape(SHAPE.line, { x: x + 0.28, y: 4.26, w: 3.02, h: 0, line: { color: IR_LINE, width: 0.8 } });
    slide.addText(compact(tier.formula, 92), { x: x + 0.28, y: 4.49, w: 3.02, h: 0.48, fontFace: BODY_FONT, fontSize: 10, color: IR_INK_2, margin: 0, fit: "shrink" });
    slide.addText(compact(tier.status, 72), { x: x + 0.28, y: 5.17, w: 3.02, h: 0.3, fontFace: BODY_FONT, fontSize: 8, color: accent, margin: 0, fit: "shrink" });
  });
  if (item.note) slide.addText(compact(item.note, 180), { x: 0.8, y: 6.16, w: 11.2, h: 0.26, fontFace: BODY_FONT, fontSize: 9, color: MUTED, margin: 0, fit: "shrink" });
  addFooter(slide, input, page, accent);
}

function addMatrix(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFF" };
  addHeading(slide, item, page, accent);
  slide.addText(compact(item.lead ?? "", 170), { x: 0.78, y: 1.7, w: 11.1, h: 0.4, fontFace: BODY_FONT, fontSize: 14, color: MUTED, margin: 0, fit: "shrink" });
  const columns = item.matrix?.columns ?? [];
  const widths = [1.68, 3.12, 3.12, 3.52];
  const starts = [0.78, 2.46, 5.58, 8.7];
  columns.slice(0, 4).forEach((column, index) => {
    slide.addShape(SHAPE.rect, { x: starts[index], y: 2.31, w: widths[index], h: 0.62, fill: { color: index === 3 ? accent : IR_INK }, line: { color: index === 3 ? accent : IR_INK } });
    slide.addText(compact(column, 32), { x: starts[index] + 0.12, y: 2.5, w: widths[index] - 0.24, h: 0.22, fontFace: BODY_FONT, fontSize: 9, bold: true, color: WHITE, align: index === 0 ? "left" : "center", margin: 0, fit: "shrink" });
  });
  (item.matrix?.rows ?? []).slice(0, 4).forEach((row, rowIndex) => {
    const y = 2.93 + rowIndex * 0.77;
    const fill = rowIndex % 2 === 0 ? WHITE : "F2F5FB";
    slide.addShape(SHAPE.rect, { x: 0.78, y, w: 1.68, h: 0.77, fill: { color: fill }, line: { color: IR_LINE, width: 0.6 } });
    slide.addText(row.label, { x: 0.94, y: y + 0.24, w: 1.36, h: 0.22, fontFace: BODY_FONT, fontSize: 9, bold: true, color: IR_INK, margin: 0, fit: "shrink" });
    row.values.slice(0, 3).forEach((value, valueIndex) => {
      const columnIndex = valueIndex + 1;
      slide.addShape(SHAPE.rect, { x: starts[columnIndex], y, w: widths[columnIndex], h: 0.77, fill: { color: columnIndex === 3 ? IR_PALE : fill }, line: { color: columnIndex === 3 ? "B9C8F2" : IR_LINE, width: 0.6 } });
      slide.addText(compact(value, 52), { x: starts[columnIndex] + 0.14, y: y + 0.18, w: widths[columnIndex] - 0.28, h: 0.35, fontFace: BODY_FONT, fontSize: 9, bold: columnIndex === 3, color: columnIndex === 3 ? "2349C5" : MUTED, align: "center", margin: 0, fit: "shrink", valign: "middle" });
    });
  });
  if (item.matrix?.note) slide.addText(compact(item.matrix.note, 170), { x: 0.8, y: 6.25, w: 11.2, h: 0.27, fontFace: BODY_FONT, fontSize: 9, color: MUTED, margin: 0, fit: "shrink" });
  addFooter(slide, input, page, accent);
}

function addFinancial(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  addHeading(slide, item, page, accent);
  slide.addText(compact(item.lead ?? "", 170), { x: 0.78, y: 1.7, w: 11.1, h: 0.42, fontFace: BODY_FONT, fontSize: 14, color: IR_INK_2, margin: 0, fit: "shrink" });
  const forecast = item.monthlyForecast ?? [];
  if (forecast.length === 12) {
    const annualRevenue = forecast.reduce((sum, month) => sum + month.grossRevenueWon, 0);
    const annualProfit = forecast.reduce((sum, month) => sum + month.operatingProfitBeforeTaxWon, 0);
    const firstPositive = forecast.find((month) => month.operatingProfitBeforeTaxWon >= 0)?.month ?? "12개월 내 미도달";
    slide.addChart(pptx.ChartType.bar, [{
      name: "월 영업손익",
      labels: forecast.map((month) => month.month.replace(/^\d{4}년\s*/, "")),
      values: forecast.map((month) => Math.round(month.operatingProfitBeforeTaxWon / 10_000)),
    }], {
      x: 0.78, y: 2.34, w: 8.05, h: 3.42,
      barDir: "col",
      catAxisLabelColor: MUTED,
      catAxisLabelFontFace: BODY_FONT,
      catAxisLabelFontSize: 9,
      catAxisLabelPos: "low",
      catAxisLineColor: IR_LINE,
      chartColors: [accent],
      showLegend: false,
      showTitle: false,
      showValue: false,
      showValAxisTitle: false,
      showCatAxisTitle: false,
      valAxisLabelColor: MUTED,
      valAxisLabelFontFace: BODY_FONT,
      valAxisLabelFontSize: 9,
      valAxisLabelFormatCode: '#,##0"만원"',
      valGridLine: { color: IR_LINE, size: 0.7 },
      valAxisLineColor: IR_LINE,
      showPercent: false,
      showSerName: false,
      showLeaderLines: false,
    });
    [
      { label: "12개월 매출", value: formatDeckCompactMoney(annualRevenue), note: "부가세 포함" },
      { label: "12개월 영업손익", value: formatDeckCompactMoney(annualProfit), note: "세전·입력값 기준" },
      { label: "첫 월 흑자", value: firstPositive, note: "월 영업손익 0원 이상" },
    ].forEach((metric, index) => {
      const y = 2.36 + index * 1.12;
      slide.addShape(SHAPE.roundRect, { x: 9.18, y, w: 3.12, h: 0.94, rectRadius: 0.04, fill: { color: index === 1 ? IR_PALE : "F7F9FC" }, line: { color: index === 1 ? "B9C8F2" : IR_LINE, width: 0.7 } });
      slide.addText(metric.label, { x: 9.4, y: y + 0.15, w: 2.68, h: 0.18, fontFace: BODY_FONT, fontSize: 8.5, bold: true, color: MUTED, margin: 0 });
      slide.addText(metric.value, { x: 9.4, y: y + 0.38, w: 2.68, h: 0.28, fontFace: BODY_FONT, fontSize: 17, bold: true, color: index === 1 && annualProfit < 0 ? "B64343" : IR_INK, margin: 0, fit: "shrink" });
      slide.addText(metric.note, { x: 9.4, y: y + 0.71, w: 2.68, h: 0.13, fontFace: BODY_FONT, fontSize: 7.5, color: MUTED, margin: 0 });
    });
    if (item.note) slide.addText(compact(item.note, 190), { x: 0.8, y: 6.17, w: 11.2, h: 0.32, fontFace: BODY_FONT, fontSize: 9, color: MUTED, margin: 0, fit: "shrink" });
    addFooter(slide, input, page, accent);
    return;
  }
  const headers = ["시나리오", "월 판매", "연환산 매출", "연환산 영업손익"];
  const xs = [0.78, 3.0, 5.25, 8.45];
  const ws = [2.22, 2.25, 3.2, 3.82];
  headers.forEach((header, index) => {
    slide.addShape(SHAPE.rect, { x: xs[index], y: 2.42, w: ws[index], h: 0.68, fill: { color: IR_INK }, line: { color: IR_INK } });
    slide.addText(header, { x: xs[index] + 0.14, y: 2.65, w: ws[index] - 0.28, h: 0.2, fontFace: BODY_FONT, fontSize: 9, bold: true, color: WHITE, align: index === 0 ? "left" : "right", margin: 0, fit: "shrink" });
  });
  const scenarios = item.financialScenarios ?? [];
  (scenarios.length > 0 ? scenarios.slice(0, 3) : [{ name: "입력 필요", monthlyUnits: 0, netRevenue: 0, operatingProfitBeforeTax: 0 }]).forEach((scenario, rowIndex) => {
    const y = 3.1 + rowIndex * 0.92;
    const values = [scenario.name, scenario.monthlyUnits ? scenario.monthlyUnits.toLocaleString("ko-KR") + "건" : "-", scenario.netRevenue ? formatDeckCompactMoney(scenario.netRevenue * 12) : "-", scenario.operatingProfitBeforeTax ? formatDeckCompactMoney(scenario.operatingProfitBeforeTax * 12) : "-"];
    values.forEach((value, index) => {
      slide.addShape(SHAPE.rect, { x: xs[index], y, w: ws[index], h: 0.92, fill: { color: rowIndex === 1 ? IR_PALE : "F8FAFD" }, line: { color: IR_LINE, width: 0.7 } });
      slide.addText(value, { x: xs[index] + 0.14, y: y + 0.29, w: ws[index] - 0.28, h: 0.26, fontFace: BODY_FONT, fontSize: 12, bold: index === 0 || rowIndex === 1, color: index === 3 && scenario.operatingProfitBeforeTax < 0 ? "B64343" : IR_INK, align: index === 0 ? "left" : "right", margin: 0, fit: "shrink" });
    });
  });
  if (item.note) slide.addText(compact(item.note, 190), { x: 0.8, y: 6.17, w: 11.2, h: 0.32, fontFace: BODY_FONT, fontSize: 9, color: MUTED, margin: 0, fit: "shrink" });
  addFooter(slide, input, page, accent);
}

function addTeam(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFF" };
  addHeading(slide, item, page, accent);
  slide.addShape(SHAPE.roundRect, { x: 0.78, y: 2.15, w: 4.05, h: 3.72, rectRadius: 0.05, fill: { color: IR_INK }, line: { color: IR_INK } });
  slide.addText("대표자·팀의 실행 근거", { x: 1.08, y: 2.55, w: 3.42, h: 0.26, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, margin: 0 });
  slide.addText(compact(item.lead ?? "", 150), { x: 1.08, y: 3.08, w: 3.42, h: 1.45, fontFace: BODY_FONT, fontSize: 20, bold: true, color: WHITE, margin: 0, fit: "shrink", valign: "middle" });
  if (item.note) slide.addText(compact(item.note, 120), { x: 1.08, y: 5.03, w: 3.42, h: 0.48, fontFace: BODY_FONT, fontSize: 9, color: "A8B5D0", margin: 0, fit: "shrink" });
  (item.points ?? []).slice(0, 3).forEach((point, index) => {
    const y = 2.19 + index * 1.18;
    slide.addText(String(index + 1).padStart(2, "0"), { x: 5.35, y: y + 0.02, w: 0.42, h: 0.24, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, margin: 0 });
    slide.addText(point.label, { x: 5.92, y, w: 2.0, h: 0.3, fontFace: BODY_FONT, fontSize: 13, bold: true, color: IR_INK, margin: 0, fit: "shrink" });
    slide.addText(compact(point.detail, 100), { x: 7.95, y: y - 0.03, w: 4.16, h: 0.62, fontFace: BODY_FONT, fontSize: 12, color: MUTED, margin: 0, fit: "shrink" });
    slide.addShape(SHAPE.line, { x: 5.35, y: y + 0.87, w: 6.76, h: 0, line: { color: IR_LINE, width: 0.8 } });
  });
  addFooter(slide, input, page, accent);
}

function addAsk(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: IR_INK };
  addHeading(slide, item, page, accent, true);
  slide.addText("이번 요청", { x: 0.8, y: 2.03, w: 2.0, h: 0.26, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, margin: 0 });
  slide.addText(compact(item.lead ?? "산정 전", 30), { x: 0.78, y: 2.5, w: 3.58, h: 0.82, fontFace: BODY_FONT, fontSize: 35, bold: true, color: WHITE, margin: 0, fit: "shrink" });
  slide.addText(compact(item.supporting ?? "", 105), { x: 0.8, y: 3.55, w: 3.55, h: 0.64, fontFace: BODY_FONT, fontSize: 11, color: "B8C3D8", margin: 0, fit: "shrink" });
  if (item.note) slide.addText(compact(item.note, 115), { x: 0.8, y: 4.55, w: 3.55, h: 0.65, fontFace: BODY_FONT, fontSize: 9, color: "8797B8", margin: 0, fit: "shrink" });
  slide.addText("자금 사용처", { x: 4.96, y: 2.03, w: 2.1, h: 0.26, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, margin: 0 });
  ((item.fundingUses ?? []).length > 0 ? item.fundingUses!.slice(0, 4) : [{ label: "사용처 확정 필요", amountWon: 0 }]).forEach((use, index) => {
    const y = 2.48 + index * 0.62;
    slide.addText(use.label, { x: 4.96, y, w: 2.45, h: 0.24, fontFace: BODY_FONT, fontSize: 10, color: WHITE, margin: 0, fit: "shrink" });
    slide.addText(use.amountWon ? formatDeckCompactMoney(use.amountWon) : "-", { x: 7.42, y, w: 1.42, h: 0.24, fontFace: BODY_FONT, fontSize: 10, bold: true, color: WHITE, align: "right", margin: 0, fit: "shrink" });
  });
  slide.addText("달성 목표", { x: 9.25, y: 2.03, w: 2.1, h: 0.26, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, margin: 0 });
  (item.points ?? []).slice(0, 3).forEach((point, index) => {
    const y = 2.48 + index * 0.91;
    slide.addText(point.label, { x: 9.25, y, w: 0.72, h: 0.24, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, margin: 0 });
    slide.addText(compact(point.detail, 60), { x: 10.0, y: y - 0.02, w: 2.08, h: 0.49, fontFace: BODY_FONT, fontSize: 10, color: WHITE, margin: 0, fit: "shrink" });
  });
  addFooter(slide, input, page, accent, true);
}

function addClosing(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  const slide = pptx.addSlide();
  slide.background = { color: input.deckType === "ir" ? IR_INK : INK };
  slide.addText(item.eyebrow, { x: 0.84, y: 0.76, w: 7.0, h: 0.28, fontFace: BODY_FONT, fontSize: 11, bold: true, color: accent, charSpacing: 0.8, margin: 0 });
  slide.addText(compact(item.title, 54), { x: 0.82, y: 1.52, w: 11.0, h: 0.92, fontFace: BODY_FONT, fontSize: 39, bold: true, color: WHITE, margin: 0, fit: "shrink" });
  slide.addText(compact(item.statement ?? "", 160), { x: 0.86, y: 2.94, w: 10.4, h: 1.12, fontFace: BODY_FONT, fontSize: 21, color: SOFT_WHITE, margin: 0, fit: "shrink" });
  slide.addShape(SHAPE.line, { x: 0.86, y: 4.68, w: 11.42, h: 0, line: { color: "3A5047", width: 1 } });
  slide.addText(input.brandName, { x: 0.86, y: 5.08, w: 7.4, h: 0.52, fontFace: BODY_FONT, fontSize: 23, bold: true, color: WHITE, margin: 0 });
  slide.addText(item.supporting ?? "", { x: 0.88, y: 5.79, w: 7.2, h: 0.28, fontFace: BODY_FONT, fontSize: 11, color: "82978E", margin: 0 });
  slide.addText(String(page).padStart(2, "0"), { x: 11.66, y: 6.63, w: 0.62, h: 0.24, fontFace: BODY_FONT, fontSize: 10, bold: true, color: accent, align: "right", margin: 0 });
}

function addChartSlide(
  pptx: PptxGenJS,
  input: PresentationDeckInput,
  item: PresentationSlide & { chart: PresentationChart },
  page: number,
  accent: string,
) {
  const slide = pptx.addSlide();
  const dark = Boolean(item.dark);
  slide.background = { color: dark ? INK : WHITE };
  addHeading(slide, item, page, accent, dark);
  slide.addText(item.chart.title, {
    x: 0.78, y: 1.79, w: 7.6, h: 0.34, fontFace: BODY_FONT, fontSize: 15, bold: true,
    color: dark ? SOFT_WHITE : INK_2, margin: 0,
  });
  const maximum = item.chart.preset === "fit"
    ? 100
    : Math.max(1, ...item.chart.items.map((chartItem) => chartItem.value));
  item.chart.items.slice(0, 4).forEach((chartItem, index) => {
    const y = 2.62 + index * 1.05;
    const ratio = Math.max(0, Math.min(1, chartItem.value / maximum));
    slide.addText(chartItem.label, {
      x: 0.82, y: y + 0.1, w: 2.1, h: 0.28, fontFace: BODY_FONT, fontSize: 13, bold: true,
      color: dark ? WHITE : INK, margin: 0, fit: "shrink",
    });
    slide.addShape(SHAPE.rect, {
      x: 3.08, y: y + 0.08, w: 7.65, h: 0.34,
      fill: { color: dark ? "31483F" : "E6ECE9" }, line: { color: dark ? "31483F" : "E6ECE9" },
    });
    if (ratio > 0) {
      slide.addShape(SHAPE.rect, {
        x: 3.08, y: y + 0.08, w: Math.max(0.08, 7.65 * ratio), h: 0.34,
        fill: { color: accent }, line: { color: accent },
      });
    }
    slide.addText(`${Math.round(chartItem.value).toLocaleString("ko-KR")}${item.chart.unit}`, {
      x: 10.98, y, w: 1.18, h: 0.46, fontFace: BODY_FONT, fontSize: 15, bold: true,
      color: dark ? WHITE : INK, align: "right", margin: 0,
    });
  });
  slide.addText(item.chart.sourceNote, {
    x: 0.82, y: 6.12, w: 11.3, h: 0.3, fontFace: BODY_FONT, fontSize: 9,
    color: dark ? "91A79D" : MUTED, margin: 0, fit: "shrink",
  });
  addFooter(slide, input, page, accent, dark);
}

function renderSlide(pptx: PptxGenJS, input: PresentationDeckInput, item: PresentationSlide, page: number, accent: string) {
  if (item.chart) {
    addChartSlide(pptx, input, item as PresentationSlide & { chart: PresentationChart }, page, accent);
    return;
  }
  switch (item.kind) {
    case "cover": addCover(pptx, input, item, accent); break;
    case "thesis": addThesis(pptx, input, item, page, accent); break;
    case "statement": addStatement(pptx, input, item, page, accent); break;
    case "split": addSplit(pptx, input, item, page, accent); break;
    case "process": addProcess(pptx, input, item, page, accent); break;
    case "metrics": addMetrics(pptx, input, item, page, accent); break;
    case "evidence": addEvidence(pptx, input, item, page, accent); break;
    case "market": addMarket(pptx, input, item, page, accent); break;
    case "matrix": addMatrix(pptx, input, item, page, accent); break;
    case "financial": addFinancial(pptx, input, item, page, accent); break;
    case "team": addTeam(pptx, input, item, page, accent); break;
    case "ask": addAsk(pptx, input, item, page, accent); break;
    case "timeline": addTimeline(pptx, input, item, page, accent); break;
    case "funding": addFunding(pptx, input, item, page, accent); break;
    case "closing": addClosing(pptx, input, item, page, accent); break;
  }
}

function buildDeck(input: DeckInput) {
  const deckInput: PresentationDeckInput = input;
  const edits: PresentationDeckDraft | undefined = input.edits;
  const accent = input.deckType === "ir" ? "2D5BFF" : cleanHex(input.accentColor);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = input.brandName;
  pptx.company = input.brandName;
  pptx.subject = input.deckType === "intro" ? `${input.title} 사업소개서` : `${input.title} 투자제안서(IR)`;
  pptx.title = `${input.brandName} ${input.deckType === "intro" ? "사업소개서" : "투자제안서(IR)"}`;
  pptx.theme = { headFontFace: BODY_FONT, bodyFontFace: BODY_FONT };
  applyPresentationDraft(buildPresentationSlides(deckInput), edits, deckInput)
    .forEach((slide, index) => renderSlide(pptx, deckInput, slide, index + 1, accent));
  return pptx;
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("delivery-deck", request, {
    limit: 15,
    windowMs: 5 * 60_000,
    message: "발표자료 생성 요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;
  try {
    const input = deckRequestSchema.parse(await request.json());
    const output = await buildDeck(input).write({ outputType: "nodebuffer", compression: true });
    const body = output instanceof Uint8Array ? output : new Uint8Array(output as ArrayBuffer);
    const responseBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    const deckName = input.deckType === "intro" ? "사업소개서" : "투자제안서-IR";
    const filename = encodeURIComponent(`${input.brandName}-${deckName}-초안.pptx`);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "DECK_GENERATION_FAILED",
          message: error instanceof Error ? error.message : "파워포인트 파일(PPTX)을 만들지 못했습니다.",
        },
      },
      { status: 400 },
    );
  }
}
