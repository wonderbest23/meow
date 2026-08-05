// 슬라이드 구성 → PPTX 파일.
// 진단 흐름의 발표자료 생성기와 분리해 둔다 — 그쪽은 진단 전용 필드에 묶여 있어
// 플랜 데이터를 억지로 끼우면 양쪽 다 취약해진다.
//
// 디자인 원칙(스타트업 IR 문법):
// - 다크 커버/클로징 + 라이트 본문의 샌드위치 구조
// - 모티프는 원(반투명 원형 장식) 하나만 — 슬라이드마다 반복해 통일감
// - 같은 판형 반복 금지: points 슬라이드는 카드/리스트/스텝 세 판형을 돌아가며 쓴다
// - 밑줄·색 띠 같은 장식선은 쓰지 않는다(전형적 자동 생성 티)

import PptxGenJS from "pptxgenjs";
import type { DeckPlan, DeckSlide } from "./deck-plan";
import { DEFAULT_DECK_THEME, type DeckTheme } from "./deck-themes";

// 16:9 (13.33 x 7.5 인치)
const W = 13.33;
const H = 7.5;

// 중립 색 — 테마와 무관하게 고정
const INK = "191F28";
const INK_SOFT = "4E5968";
const MUTED = "8B95A1";
const LINE = "E5E8EB";
const WHITE = "FFFFFF";

// 렌더 한 번 동안 쓰는 테마 — renderDeckPptx가 시작할 때 세팅한다.
// (요청 단위로 인스턴스가 분리되는 환경이라 동시성 문제는 없다)
let T: DeckTheme = DEFAULT_DECK_THEME;
const BRAND = () => T.brand;
const BRAND_DEEP = () => T.brandDeep;
const DARK = () => T.dark;
const PANEL = () => T.panel;
const ICE = () => T.ice;

// 한글이 깨지지 않는 기본 글꼴
const FONT = "Malgun Gothic";

/** 카드에 얹는 부드러운 그림자 — pptxgenjs가 옵션 객체를 변형하므로 매번 새로 만든다 */
function softShadow(): PptxGenJS.ShadowProps {
  return { type: "outer", color: "1B2B44", opacity: 0.14, blur: 10, offset: 3, angle: 90 };
}

/** 다크 배경 위 반투명 장식 — 테마마다 실루엣이 다르다(원/사각/호) */
function darkOrnaments(pptx: PptxGenJS, slide: PptxGenJS.Slide) {
  // pie 같은 특수 도형은 뷰어에 따라 안 그려진다 — 원/라운드 사각만 쓰고,
  // arc 테마는 원을 화면 밖으로 크게 밀어 "잘린 호"처럼 보이게 한다.
  const shape = T.motif === "square" ? pptx.ShapeType.roundRect : pptx.ShapeType.ellipse;
  const opt = T.motif === "square" ? { rectRadius: 0.5 } : {};
  const spread = T.motif === "arc" ? 1.6 : 0; // 호 테마는 더 크게, 더 바깥으로
  slide.addShape(shape, {
    x: 9.1 + spread * 0.4, y: -2.3 - spread, w: 6.4 + spread, h: 6.4 + spread,
    fill: { color: BRAND(), transparency: 84 }, line: { type: "none" }, ...opt,
  });
  slide.addShape(shape, {
    x: 11.2 + spread * 0.3, y: 4.6 + spread * 0.4, w: 4.6 + spread, h: 4.6 + spread,
    fill: { color: BRAND(), transparency: 91 }, line: { type: "none" }, ...opt,
  });
  slide.addShape(shape, {
    x: 10.35 + spread * 0.5, y: 1.15, w: 2.5, h: 2.5,
    fill: { color: BRAND(), transparency: 72 }, line: { type: "none" }, ...opt,
  });
}

function footer(slide: PptxGenJS.Slide, brandName: string, page: number, total: number) {
  slide.addText(brandName, {
    x: 0.75, y: 7.02, w: 7, h: 0.24,
    fontFace: FONT, fontSize: 9, color: MUTED, margin: 0,
  });
  slide.addText(`${page} / ${total}`, {
    x: 11.6, y: 7.02, w: 0.98, h: 0.24,
    fontFace: FONT, fontSize: 9, bold: true, color: MUTED, align: "right", margin: 0,
  });
}

/** 본문 머리 — 파란 알약 라벨 + 큰 제목 (밑줄 없음) */
function heading(pptx: PptxGenJS, slide: PptxGenJS.Slide, item: DeckSlide) {
  const label = item.eyebrow.toUpperCase();
  const chipW = Math.max(1.0, 0.5 + label.length * 0.16);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.75, y: 0.58, w: chipW, h: 0.36,
    fill: { color: T.chipBg }, line: { type: "none" }, rectRadius: 0.18,
  });
  slide.addText(label, {
    x: 0.75, y: 0.58, w: chipW, h: 0.36,
    fontFace: FONT, fontSize: 11, bold: true, color: BRAND_DEEP(), align: "center", charSpacing: 1.1, margin: 0,
  });
  slide.addText(item.title, {
    x: 0.75, y: 1.08, w: 11.8, h: 0.86,
    fontFace: FONT, fontSize: 31, bold: true, color: INK, margin: 0, fit: "shrink",
  });
}

/** 표지 */
function coverSlide(pptx: PptxGenJS, plan: DeckPlan, item: DeckSlide) {
  const slide = pptx.addSlide();
  slide.background = { color: DARK() };
  darkOrnaments(pptx, slide);

  slide.addText((plan.slogan || item.eyebrow).toUpperCase(), {
    x: 0.95, y: 1.62, w: 9, h: 0.34,
    fontFace: FONT, fontSize: 13, bold: true, color: T.label, charSpacing: 1.6, margin: 0,
  });
  slide.addText(item.title || plan.brandName, {
    x: 0.92, y: 2.12, w: 10.2, h: 2.1,
    fontFace: FONT, fontSize: 47, bold: true, color: WHITE, margin: 0, fit: "shrink", lineSpacingMultiple: 1.06,
  });
  if (item.lead) {
    slide.addText(item.lead, {
      x: 0.95, y: 4.35, w: 8.9, h: 0.95,
      fontFace: FONT, fontSize: 17, color: ICE(), margin: 0, fit: "shrink", lineSpacingMultiple: 1.3,
    });
  }

  // 하단 발표자 블록 — 원형 이니셜 + 이름/날짜
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 0.95, y: 5.95, w: 0.62, h: 0.62,
    fill: { color: BRAND() }, line: { type: "none" },
  });
  slide.addText(plan.brandName.trim().charAt(0), {
    x: 0.95, y: 5.95, w: 0.62, h: 0.62,
    fontFace: FONT, fontSize: 18, bold: true, color: WHITE, align: "center", margin: 0,
  });
  slide.addText(plan.brandName, {
    x: 1.75, y: 5.98, w: 7, h: 0.32,
    fontFace: FONT, fontSize: 14, bold: true, color: WHITE, margin: 0,
  });
  slide.addText(`사업 제안서 · ${new Date().toLocaleDateString("ko-KR")}`, {
    x: 1.75, y: 6.3, w: 6, h: 0.26,
    fontFace: FONT, fontSize: 10.5, color: "8FA6BF", margin: 0,
  });
}

/** 판형 A — 흰 카드 열 (그림자 + 파란 번호 원) */
function pointsAsCards(pptx: PptxGenJS, slide: PptxGenJS.Slide, points: NonNullable<DeckSlide["points"]>, y: number) {
  const n = Math.min(points.length, 4);
  const gap = 0.34;
  const cardW = (11.83 - gap * (n - 1)) / n;
  const cardH = 3.35;
  points.slice(0, n).forEach((p, i) => {
    const x = 0.75 + i * (cardW + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: cardH,
      fill: { color: WHITE }, line: { color: LINE, width: 0.75 }, rectRadius: 0.14, shadow: softShadow(),
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.3, y: y + 0.32, w: 0.52, h: 0.52,
      fill: { color: T.chipBg }, line: { type: "none" },
    });
    slide.addText(String(i + 1), {
      x: x + 0.3, y: y + 0.32, w: 0.52, h: 0.52,
      fontFace: FONT, fontSize: 16, bold: true, color: BRAND_DEEP(), align: "center", margin: 0,
    });
    slide.addText(p.label, {
      x: x + 0.3, y: y + 1.06, w: cardW - 0.6, h: 0.62,
      fontFace: FONT, fontSize: 16.5, bold: true, color: INK, margin: 0, fit: "shrink",
    });
    slide.addText(p.detail, {
      x: x + 0.3, y: y + 1.74, w: cardW - 0.6, h: cardH - 1.98,
      fontFace: FONT, fontSize: 12, color: INK_SOFT, margin: 0, lineSpacingMultiple: 1.32, fit: "shrink",
    });
  });
}

/** 판형 B — 좌측 진한 리드 패널 + 우측 번호 리스트 (2단) */
function pointsAsSplit(pptx: PptxGenJS, slide: PptxGenJS.Slide, item: DeckSlide, y: number) {
  const points = (item.points ?? []).slice(0, 4);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.75, y, w: 4.55, h: 3.9,
    fill: { color: DARK() }, line: { type: "none" }, rectRadius: 0.14, shadow: softShadow(),
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 3.85, y: y + 2.6, w: 2.1, h: 2.1,
    fill: { color: BRAND(), transparency: 82 }, line: { type: "none" },
  });
  slide.addText(item.lead ?? item.title, {
    x: 1.12, y: y + 0.42, w: 3.85, h: 3.1,
    fontFace: FONT, fontSize: 18, bold: true, color: WHITE, margin: 0, lineSpacingMultiple: 1.34, fit: "shrink",
  });
  const rowH = 3.9 / Math.max(points.length, 1);
  points.forEach((p, i) => {
    const ry = y + i * rowH;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 5.75, y: ry + rowH / 2 - 0.24, w: 0.48, h: 0.48,
      fill: { color: T.chipBg }, line: { type: "none" },
    });
    slide.addText(String(i + 1), {
      x: 5.75, y: ry + rowH / 2 - 0.24, w: 0.48, h: 0.48,
      fontFace: FONT, fontSize: 14, bold: true, color: BRAND_DEEP(), align: "center", margin: 0,
    });
    slide.addText(p.label, {
      x: 6.45, y: ry + rowH / 2 - 0.46, w: 6.1, h: 0.4,
      fontFace: FONT, fontSize: 15.5, bold: true, color: INK, margin: 0, fit: "shrink",
    });
    slide.addText(p.detail, {
      x: 6.45, y: ry + rowH / 2 - 0.02, w: 6.1, h: rowH - 0.5,
      fontFace: FONT, fontSize: 12, color: INK_SOFT, margin: 0, lineSpacingMultiple: 1.28, fit: "shrink",
    });
    if (i < points.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: 6.45, y: ry + rowH, w: 6.1, h: 0,
        line: { color: LINE, width: 0.75 },
      });
    }
  });
}

/** 판형 C — 가로 스텝 플로우 (원 → 원 → 원) */
function pointsAsSteps(pptx: PptxGenJS, slide: PptxGenJS.Slide, points: NonNullable<DeckSlide["points"]>, y: number) {
  const n = Math.min(points.length, 4);
  const colW = 11.83 / n;
  const circleY = y + 0.15;
  slide.addShape(pptx.ShapeType.line, {
    x: 0.75 + colW / 2, y: circleY + 0.45, w: colW * (n - 1), h: 0,
    line: { color: T.chipBg, width: 1.5, dashType: "dash" },
  });
  points.slice(0, n).forEach((p, i) => {
    const cx = 0.75 + i * colW + colW / 2;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: cx - 0.45, y: circleY, w: 0.9, h: 0.9,
      fill: { color: i === 0 ? BRAND() : WHITE }, line: { color: BRAND(), width: 1.5 }, shadow: softShadow(),
    });
    slide.addText(String(i + 1), {
      x: cx - 0.45, y: circleY, w: 0.9, h: 0.9,
      fontFace: FONT, fontSize: 20, bold: true, color: i === 0 ? WHITE : BRAND_DEEP(), align: "center", margin: 0,
    });
    slide.addText(p.label, {
      x: 0.75 + i * colW + 0.12, y: circleY + 1.14, w: colW - 0.24, h: 0.56,
      fontFace: FONT, fontSize: 15.5, bold: true, color: INK, align: "center", margin: 0, fit: "shrink",
    });
    slide.addText(p.detail, {
      x: 0.75 + i * colW + 0.16, y: circleY + 1.74, w: colW - 0.32, h: 1.55,
      fontFace: FONT, fontSize: 11.5, color: INK_SOFT, align: "center", margin: 0, lineSpacingMultiple: 1.3, fit: "shrink",
    });
  });
}

/** 수치 카드 — 큰 숫자 중심, 첫 카드는 진한 배경으로 강조 */
function addMetrics(pptx: PptxGenJS, slide: PptxGenJS.Slide, metrics: NonNullable<DeckSlide["metrics"]>, y: number, big: boolean) {
  const n = Math.min(metrics.length, 4);
  const gap = 0.34;
  const cardW = (11.83 - gap * (n - 1)) / n;
  const cardH = big ? 2.9 : 2.05;
  metrics.slice(0, n).forEach((m, i) => {
    const x = 0.75 + i * (cardW + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: cardH,
      fill: { color: i === 0 ? DARK() : WHITE }, line: i === 0 ? { type: "none" } : { color: LINE, width: 0.75 },
      rectRadius: 0.14, shadow: softShadow(),
    });
    const on = i === 0;
    slide.addText(m.label, {
      x: x + 0.32, y: y + (big ? 0.4 : 0.28), w: cardW - 0.64, h: 0.32,
      fontFace: FONT, fontSize: 12, bold: true, color: on ? "8FB4EC" : MUTED, margin: 0,
    });
    slide.addText(m.value, {
      x: x + 0.32, y: y + (big ? 0.86 : 0.64), w: cardW - 0.64, h: big ? 1.1 : 0.76,
      fontFace: FONT, fontSize: big ? 40 : 27, bold: true, color: on ? WHITE : INK, margin: 0, fit: "shrink",
    });
    if (m.note) {
      slide.addText(m.note, {
        x: x + 0.32, y: y + (big ? 2.1 : 1.5), w: cardW - 0.64, h: 0.44,
        fontFace: FONT, fontSize: 11.5, color: on ? ICE() : INK_SOFT, margin: 0, fit: "shrink",
      });
    }
  });
  return cardH;
}

/**
 * 일반 슬라이드.
 * variant는 같은 판형이 연달아 나오지 않게 밖에서 순환시킨다.
 */
function bodySlide(pptx: PptxGenJS, item: DeckSlide, variant: number) {
  const slide = pptx.addSlide();
  slide.background = { color: PANEL() };
  // 본문 캔버스 — 옅은 바탕 위 흰 판 (여백이 프레임 역할)
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.38, y: 0.34, w: W - 0.76, h: H - 0.9,
    fill: { color: WHITE }, line: { type: "none" }, rectRadius: 0.16, shadow: softShadow(),
  });
  heading(pptx, slide, item);

  let y = 2.2;
  const hasMetrics = Boolean(item.metrics?.length);
  const hasPoints = Boolean(item.points?.length);
  const useSplit = !hasMetrics && hasPoints && variant % 3 === 1 && Boolean(item.lead);
  if (item.lead && !useSplit) {
    slide.addText(item.lead, {
      x: 0.75, y, w: 11.4, h: 0.56,
      fontFace: FONT, fontSize: 16, color: INK_SOFT, margin: 0, fit: "shrink",
    });
    y += 0.78;
  }

  if (hasMetrics) {
    const bigMetric = !hasPoints;
    const used = addMetrics(pptx, slide, item.metrics!, bigMetric ? y + 0.35 : y, bigMetric);
    y += used + (bigMetric ? 0.75 : 0.35);
  }

  if (hasPoints) {
    if (hasMetrics) {
      // 수치 아래에는 간결한 리스트만 들어갈 자리가 남는다
      item.points!.slice(0, 3).forEach((p, i) => {
        slide.addText([
          { text: `${p.label}  `, options: { bold: true, color: INK } },
          { text: p.detail, options: { color: INK_SOFT } },
        ], {
          x: 0.85, y: y + i * 0.46, w: 11.4, h: 0.42,
          fontFace: FONT, fontSize: 12.5, bullet: { code: "2022" }, margin: 0, fit: "shrink",
        });
      });
    } else if (useSplit) {
      pointsAsSplit(pptx, slide, item, 2.2);
    } else if (variant % 3 === 2) {
      pointsAsSteps(pptx, slide, item.points!, y + 0.15);
    } else {
      pointsAsCards(pptx, slide, item.points!, y + 0.1);
    }
  }

  if (item.note) {
    slide.addText(item.note, {
      x: 0.75, y: 6.32, w: 11.4, h: 0.42,
      fontFace: FONT, fontSize: 11, italic: true, color: MUTED, margin: 0, fit: "shrink",
    });
  }
  return slide;
}

/**
 * 사업 정의 슬라이드 — "무슨 사업인가"를 한 방에.
 * 브랜드 블루 풀배경 + 거대 문장, 아래에 무엇을/누구에게/어떻게 카드.
 */
function statementSlide(pptx: PptxGenJS, plan: DeckPlan, item: DeckSlide, page: number, total: number) {
  const slide = pptx.addSlide();
  slide.background = { color: T.statement };
  // 모티프 — 밝은 원
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 10.1, y: -2.6, w: 6.6, h: 6.6,
    fill: { color: WHITE, transparency: 90 }, line: { type: "none" },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: -1.7, y: 5.4, w: 4.4, h: 4.4,
    fill: { color: WHITE, transparency: 93 }, line: { type: "none" },
  });

  slide.addText(item.eyebrow.toUpperCase(), {
    x: 0.95, y: 0.85, w: 9, h: 0.32,
    fontFace: FONT, fontSize: 12, bold: true, color: T.ice, charSpacing: 1.6, margin: 0,
  });
  // 사업 정의 문장 — 이 덱에서 가장 큰 글자
  slide.addText(item.lead || item.title, {
    x: 0.92, y: 1.45, w: 11.5, h: 2.3,
    fontFace: FONT, fontSize: 34, bold: true, color: WHITE, margin: 0, fit: "shrink", lineSpacingMultiple: 1.22,
  });

  // 무엇을 / 누구에게 / 어떻게 — 반투명 흰 카드
  const points = (item.points ?? []).slice(0, 4);
  if (points.length) {
    const n = points.length;
    const gap = 0.34;
    const cardW = (11.83 - gap * (n - 1)) / n;
    points.forEach((p, i) => {
      const x = 0.75 + i * (cardW + gap);
      slide.addShape(pptx.ShapeType.roundRect, {
        x, y: 4.15, w: cardW, h: 2.15,
        fill: { color: WHITE, transparency: 8 }, line: { type: "none" }, rectRadius: 0.14, shadow: softShadow(),
      });
      slide.addText(p.label, {
        x: x + 0.28, y: 4.45, w: cardW - 0.56, h: 0.4,
        fontFace: FONT, fontSize: 12.5, bold: true, color: BRAND_DEEP(), margin: 0,
      });
      slide.addText(p.detail, {
        x: x + 0.28, y: 4.92, w: cardW - 0.56, h: 1.18,
        fontFace: FONT, fontSize: 14, bold: true, color: INK, margin: 0, lineSpacingMultiple: 1.28, fit: "shrink",
      });
    });
  }
  if (item.note) {
    slide.addText(item.note, {
      x: 0.95, y: 6.55, w: 11.4, h: 0.4,
      fontFace: FONT, fontSize: 11, italic: true, color: T.ice, margin: 0, fit: "shrink",
    });
  }
  slide.addText(`${page} / ${total}`, {
    x: 11.6, y: 7.02, w: 0.98, h: 0.24,
    fontFace: FONT, fontSize: 9, bold: true, color: T.label, align: "right", margin: 0,
  });
  return slide;
}

/**
 * 비전·목표 슬라이드 — 방향 한 문장 + 기한 있는 목표.
 * 다크 바탕에 크게, 목표는 흰 카드로 도드라지게.
 */
function visionSlide(pptx: PptxGenJS, plan: DeckPlan, item: DeckSlide, page: number, total: number) {
  const slide = pptx.addSlide();
  slide.background = { color: DARK() };
  darkOrnaments(pptx, slide);

  slide.addText(item.eyebrow.toUpperCase(), {
    x: 0.95, y: 0.85, w: 9, h: 0.32,
    fontFace: FONT, fontSize: 12, bold: true, color: T.label, charSpacing: 1.6, margin: 0,
  });
  slide.addText(item.title, {
    x: 0.92, y: 1.4, w: 11.4, h: 0.9,
    fontFace: FONT, fontSize: 30, bold: true, color: WHITE, margin: 0, fit: "shrink",
  });
  if (item.lead) {
    slide.addText(`“${item.lead}”`, {
      x: 0.95, y: 2.5, w: 10.6, h: 1.15,
      fontFace: FONT, fontSize: 21, bold: true, color: ICE(), margin: 0, fit: "shrink", lineSpacingMultiple: 1.3,
    });
  }

  // 목표 — metrics 우선, 없으면 points를 카드로
  const metrics = (item.metrics ?? []).slice(0, 4);
  const points = (item.points ?? []).slice(0, 4);
  const rows = metrics.length
    ? metrics.map((m) => ({ a: m.label, b: m.value, c: m.note }))
    : points.map((p) => ({ a: p.label, b: p.detail, c: undefined as string | undefined }));
  const n = Math.min(rows.length, 4);
  if (n) {
    const gap = 0.34;
    const cardW = (11.83 - gap * (n - 1)) / n;
    rows.slice(0, n).forEach((r, i) => {
      const x = 0.75 + i * (cardW + gap);
      slide.addShape(pptx.ShapeType.roundRect, {
        x, y: 4.05, w: cardW, h: 2.2,
        fill: { color: WHITE, transparency: 6 }, line: { type: "none" }, rectRadius: 0.14, shadow: softShadow(),
      });
      slide.addText(r.a, {
        x: x + 0.28, y: 4.35, w: cardW - 0.56, h: 0.36,
        fontFace: FONT, fontSize: 12, bold: true, color: BRAND_DEEP(), margin: 0,
      });
      slide.addText(r.b, {
        x: x + 0.28, y: 4.78, w: cardW - 0.56, h: metrics.length ? 0.78 : 1.2,
        fontFace: FONT, fontSize: metrics.length ? 23 : 13.5, bold: true, color: INK, margin: 0,
        lineSpacingMultiple: 1.26, fit: "shrink",
      });
      if (r.c) {
        slide.addText(r.c, {
          x: x + 0.28, y: 5.62, w: cardW - 0.56, h: 0.4,
          fontFace: FONT, fontSize: 11.5, color: INK_SOFT, margin: 0, fit: "shrink",
        });
      }
    });
  }
  slide.addText(`${page} / ${total}`, {
    x: 11.6, y: 7.02, w: 0.98, h: 0.24,
    fontFace: FONT, fontSize: 9, bold: true, color: "8FA6BF", align: "right", margin: 0,
  });
  return slide;
}

/** 마지막 슬라이드 — 요청·다음 단계 */
function closingSlide(pptx: PptxGenJS, plan: DeckPlan, item: DeckSlide) {
  const slide = pptx.addSlide();
  slide.background = { color: DARK() };
  darkOrnaments(pptx, slide);

  slide.addText(item.eyebrow.toUpperCase(), {
    x: 0.95, y: 1.35, w: 8, h: 0.32,
    fontFace: FONT, fontSize: 12, bold: true, color: T.label, charSpacing: 1.5, margin: 0,
  });
  slide.addText(item.title, {
    x: 0.92, y: 1.85, w: 10.4, h: 1.25,
    fontFace: FONT, fontSize: 38, bold: true, color: WHITE, margin: 0, fit: "shrink",
  });
  if (item.lead) {
    slide.addText(item.lead, {
      x: 0.95, y: 3.2, w: 9.4, h: 0.85,
      fontFace: FONT, fontSize: 16, color: ICE(), margin: 0, fit: "shrink", lineSpacingMultiple: 1.3,
    });
  }
  // 다음 단계 — 번호 원 + 텍스트 행
  (item.points ?? []).slice(0, 3).forEach((p, i) => {
    const ry = 4.35 + i * 0.72;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.95, y: ry, w: 0.46, h: 0.46,
      fill: { color: BRAND() }, line: { type: "none" },
    });
    slide.addText(String(i + 1), {
      x: 0.95, y: ry, w: 0.46, h: 0.46,
      fontFace: FONT, fontSize: 13, bold: true, color: WHITE, align: "center", margin: 0,
    });
    slide.addText([
      { text: `${p.label}  `, options: { bold: true, color: WHITE } },
      { text: p.detail, options: { color: ICE() } },
    ], {
      x: 1.62, y: ry + 0.015, w: 10.6, h: 0.44,
      fontFace: FONT, fontSize: 13.5, margin: 0, fit: "shrink",
    });
  });
  slide.addText(plan.brandName, {
    x: 0.95, y: 6.75, w: 7, h: 0.3,
    fontFace: FONT, fontSize: 12, bold: true, color: "8FA6BF", margin: 0,
  });
  return slide;
}

/** 슬라이드 구성을 PPTX 바이트로 */
export async function renderDeckPptx(plan: DeckPlan, theme: DeckTheme = DEFAULT_DECK_THEME): Promise<Buffer> {
  T = theme;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "PLAN16x9", width: W, height: H });
  pptx.layout = "PLAN16x9";
  pptx.author = plan.brandName;
  pptx.title = `${plan.brandName} 사업 제안서`;

  const total = plan.slides.length;
  let bodyIndex = 0; // 본문 판형 순환용 — 같은 레이아웃이 연달아 나오지 않게
  plan.slides.forEach((item, index) => {
    const isFirst = index === 0;
    const isLast = index === total - 1 && total > 1;
    if (isFirst) {
      coverSlide(pptx, plan, item);
      return; // 표지에는 쪽번호를 넣지 않는다
    }
    if (isLast) {
      closingSlide(pptx, plan, item);
      return; // 클로징은 자체 서명이 있다 — 푸터를 겹쳐 찍지 않는다
    }
    if (item.kind === "statement") {
      statementSlide(pptx, plan, item, index + 1, total);
      return;
    }
    if (item.kind === "vision") {
      visionSlide(pptx, plan, item, index + 1, total);
      return;
    }
    const slide = bodySlide(pptx, item, bodyIndex);
    bodyIndex += 1;
    footer(slide, plan.brandName, index + 1, total);
  });

  const data = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return data;
}
