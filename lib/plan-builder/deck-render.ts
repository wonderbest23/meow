// 슬라이드 구성 → PPTX 파일.
// 진단 흐름의 발표자료 생성기와 분리해 둔다 — 그쪽은 진단 전용 필드에 묶여 있어
// 플랜 데이터를 억지로 끼우면 양쪽 다 취약해진다.

import PptxGenJS from "pptxgenjs";
import type { DeckPlan, DeckSlide } from "./deck-plan";

// 16:9 (13.33 x 7.5 인치)
const W = 13.33;
const H = 7.5;

// 플랜 빌더와 같은 색 계열
const BRAND = "3182F6";
const INK = "191F28";
const INK_SOFT = "4E5968";
const MUTED = "8B95A1";
const LINE = "E5E8EB";
const PANEL = "F7F8FA";
const WHITE = "FFFFFF";

// 한글이 깨지지 않는 기본 글꼴
const FONT = "Malgun Gothic";

function footer(slide: PptxGenJS.Slide, brandName: string, page: number, total: number, dark = false) {
  slide.addText(brandName, {
    x: 0.75, y: 6.95, w: 7, h: 0.24,
    fontFace: FONT, fontSize: 9, color: dark ? "8FA6BF" : MUTED, margin: 0,
  });
  slide.addText(`${page} / ${total}`, {
    x: 11.6, y: 6.95, w: 0.98, h: 0.24,
    fontFace: FONT, fontSize: 9, bold: true, color: dark ? "8FA6BF" : MUTED, align: "right", margin: 0,
  });
}

function heading(slide: PptxGenJS.Slide, item: DeckSlide) {
  slide.addText(item.eyebrow.toUpperCase(), {
    x: 0.75, y: 0.62, w: 8, h: 0.26,
    fontFace: FONT, fontSize: 11, bold: true, color: BRAND, charSpacing: 1.2, margin: 0,
  });
  slide.addText(item.title, {
    x: 0.75, y: 1.0, w: 11.8, h: 0.82,
    fontFace: FONT, fontSize: 30, bold: true, color: INK, margin: 0, fit: "shrink",
  });
  slide.addShape(new PptxGenJS().ShapeType.line, {
    x: 0.75, y: 1.95, w: 11.83, h: 0,
    line: { color: LINE, width: 1 },
  });
}

/** 표지 */
function coverSlide(pptx: PptxGenJS, plan: DeckPlan, item: DeckSlide) {
  const slide = pptx.addSlide();
  slide.background = { color: "0E1E30" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: H, fill: { color: BRAND }, line: { color: BRAND } });
  slide.addText(plan.slogan || item.eyebrow, {
    x: 0.9, y: 1.5, w: 9, h: 0.3,
    fontFace: FONT, fontSize: 13, bold: true, color: BRAND, charSpacing: 1.1, margin: 0,
  });
  slide.addText(item.title || plan.brandName, {
    x: 0.88, y: 2.15, w: 10.5, h: 1.5,
    fontFace: FONT, fontSize: 46, bold: true, color: WHITE, margin: 0, fit: "shrink",
  });
  if (item.lead) {
    slide.addText(item.lead, {
      x: 0.9, y: 3.85, w: 9.6, h: 1,
      fontFace: FONT, fontSize: 19, color: "C3D3DF", margin: 0, fit: "shrink",
    });
  }
  slide.addShape(pptx.ShapeType.line, { x: 0.9, y: 5.85, w: 1.6, h: 0, line: { color: BRAND, width: 4 } });
  slide.addText(plan.brandName, {
    x: 0.9, y: 6.05, w: 7, h: 0.3,
    fontFace: FONT, fontSize: 14, bold: true, color: WHITE, margin: 0,
  });
  slide.addText(new Date().toLocaleDateString("ko-KR"), {
    x: 0.9, y: 6.42, w: 4, h: 0.24,
    fontFace: FONT, fontSize: 10, color: "8FA6BF", margin: 0,
  });
}

/** 항목 카드 (최대 4개) */
function addPoints(pptx: PptxGenJS, slide: PptxGenJS.Slide, points: NonNullable<DeckSlide["points"]>) {
  const n = Math.min(points.length, 4);
  const gap = 0.3;
  const cardW = (11.83 - gap * (n - 1)) / n;
  points.slice(0, n).forEach((p, i) => {
    const x = 0.75 + i * (cardW + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.5, w: cardW, h: 3.0,
      fill: { color: PANEL }, line: { color: LINE, width: 1 }, rectRadius: 0.12,
    });
    slide.addText(String(i + 1).padStart(2, "0"), {
      x: x + 0.28, y: 2.78, w: 1, h: 0.3,
      fontFace: FONT, fontSize: 12, bold: true, color: BRAND, margin: 0,
    });
    slide.addText(p.label, {
      x: x + 0.28, y: 3.18, w: cardW - 0.56, h: 0.66,
      fontFace: FONT, fontSize: 17, bold: true, color: INK, margin: 0, fit: "shrink",
    });
    slide.addText(p.detail, {
      x: x + 0.28, y: 3.95, w: cardW - 0.56, h: 1.3,
      fontFace: FONT, fontSize: 12.5, color: INK_SOFT, margin: 0, lineSpacingMultiple: 1.25, fit: "shrink",
    });
  });
}

/** 수치 카드 (최대 4개) */
function addMetrics(pptx: PptxGenJS, slide: PptxGenJS.Slide, metrics: NonNullable<DeckSlide["metrics"]>, y = 2.5) {
  const n = Math.min(metrics.length, 4);
  const gap = 0.3;
  const cardW = (11.83 - gap * (n - 1)) / n;
  metrics.slice(0, n).forEach((m, i) => {
    const x = 0.75 + i * (cardW + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: 1.9,
      fill: { color: WHITE }, line: { color: BRAND, width: 1.2 }, rectRadius: 0.12,
    });
    slide.addText(m.label, {
      x: x + 0.26, y: y + 0.26, w: cardW - 0.52, h: 0.3,
      fontFace: FONT, fontSize: 11.5, bold: true, color: MUTED, margin: 0,
    });
    slide.addText(m.value, {
      x: x + 0.26, y: y + 0.62, w: cardW - 0.52, h: 0.68,
      fontFace: FONT, fontSize: 24, bold: true, color: INK, margin: 0, fit: "shrink",
    });
    if (m.note) {
      slide.addText(m.note, {
        x: x + 0.26, y: y + 1.34, w: cardW - 0.52, h: 0.32,
        fontFace: FONT, fontSize: 11, color: INK_SOFT, margin: 0, fit: "shrink",
      });
    }
  });
}

/** 일반 슬라이드 */
function bodySlide(pptx: PptxGenJS, item: DeckSlide) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  heading(slide, item);

  let y = 2.25;
  if (item.lead) {
    slide.addText(item.lead, {
      x: 0.75, y, w: 11.83, h: 0.6,
      fontFace: FONT, fontSize: 17, color: INK_SOFT, margin: 0, fit: "shrink",
    });
    y += 0.85;
  }

  if (item.metrics?.length) {
    addMetrics(pptx, slide, item.metrics, y);
    y += 2.2;
  }
  if (item.points?.length && y < 3.2) {
    addPoints(pptx, slide, item.points);
  } else if (item.points?.length) {
    // 수치 아래에 오는 경우 목록으로
    item.points.slice(0, 4).forEach((p, i) => {
      slide.addText(`${p.label} — ${p.detail}`, {
        x: 0.85, y: y + i * 0.42, w: 11.6, h: 0.38,
        fontFace: FONT, fontSize: 13, color: INK_SOFT, bullet: { code: "2022" }, margin: 0, fit: "shrink",
      });
    });
  }

  if (item.note) {
    slide.addText(item.note, {
      x: 0.75, y: 6.15, w: 11.83, h: 0.5,
      fontFace: FONT, fontSize: 11.5, italic: true, color: MUTED, margin: 0, fit: "shrink",
    });
  }
  return slide;
}

/** 마지막 슬라이드 — 요청·다음 단계 */
function closingSlide(pptx: PptxGenJS, plan: DeckPlan, item: DeckSlide) {
  const slide = pptx.addSlide();
  slide.background = { color: "0E1E30" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: H, fill: { color: BRAND }, line: { color: BRAND } });
  slide.addText(item.eyebrow.toUpperCase(), {
    x: 0.9, y: 1.7, w: 8, h: 0.3,
    fontFace: FONT, fontSize: 12, bold: true, color: BRAND, charSpacing: 1.1, margin: 0,
  });
  slide.addText(item.title, {
    x: 0.88, y: 2.25, w: 10.6, h: 1.2,
    fontFace: FONT, fontSize: 38, bold: true, color: WHITE, margin: 0, fit: "shrink",
  });
  if (item.lead) {
    slide.addText(item.lead, {
      x: 0.9, y: 3.6, w: 9.8, h: 0.9,
      fontFace: FONT, fontSize: 17, color: "C3D3DF", margin: 0, fit: "shrink",
    });
  }
  (item.points ?? []).slice(0, 3).forEach((p, i) => {
    slide.addText(`${p.label} — ${p.detail}`, {
      x: 0.95, y: 4.7 + i * 0.44, w: 11, h: 0.4,
      fontFace: FONT, fontSize: 13.5, color: "E5E9EF", bullet: { code: "2022" }, margin: 0, fit: "shrink",
    });
  });
  slide.addText(plan.brandName, {
    x: 0.9, y: 6.4, w: 7, h: 0.3,
    fontFace: FONT, fontSize: 13, bold: true, color: WHITE, margin: 0,
  });
  return slide;
}

/** 슬라이드 구성을 PPTX 바이트로 */
export async function renderDeckPptx(plan: DeckPlan): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "PLAN16x9", width: W, height: H });
  pptx.layout = "PLAN16x9";
  pptx.author = plan.brandName;
  pptx.title = `${plan.brandName} 사업 제안서`;

  const total = plan.slides.length;
  plan.slides.forEach((item, index) => {
    const isFirst = index === 0;
    const isLast = index === total - 1 && total > 1;
    if (isFirst) {
      coverSlide(pptx, plan, item);
      return; // 표지에는 쪽번호를 넣지 않는다
    }
    const slide = isLast ? closingSlide(pptx, plan, item) : bodySlide(pptx, item);
    footer(slide, plan.brandName, index + 1, total, isLast);
  });

  const data = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return data;
}
