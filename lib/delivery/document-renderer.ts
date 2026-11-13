import JSZip from "jszip";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun as DocxTextRun,
  WidthType,
  type IRunOptions,
  type ITableCellOptions,
} from "docx";
import type { Token, Tokens } from "marked";
import { lexPlanMarkdown, splitLeadLabel } from "../plan-builder/markdown";
import { CHART_FENCE_LANG, chartScale, parseChartSpec, shortWon, type ChartPoint } from "../plan-builder/chart";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderLightweightPdf, SELF_NUMBERED } from "./lightweight-pdf";
import { subsetTrueType, glyphIdsForText } from "./font-subset";
import { summaryBasisLabel, type ExecutiveSummary } from "../plan-builder/executive-summary";

export type BusinessDocument = {
  id: string;
  title: string;
  type: string;
  versionLabel: string;
  markdown: string;
  executiveSummary?: ExecutiveSummary;
};

export type DocumentProjectMeta = {
  title: string;
  sector: string;
  model: string;
  customer: string;
  generatedAt: string;
  sample: boolean;
  /**
   * 표지에 표시할 항목을 직접 지정한다(선택).
   * 지정하지 않으면 기존 기본 항목(프로젝트·목표 고객·수익 방식·문서 버전)을 사용한다.
   */
  coverFields?: Array<{ label: string; value: string }>;
  /** 첫 장 머리의 '일반 현황' 표 항목(선택) — 입력받은 값만 넣는다. 주면 첫 장을 새 쪽에서 시작한다. */
  overviewFields?: Array<{ label: string; value: string }>;
};

// 공문서 양식처럼 검정·회색만 쓴다(PDF 와 같은 값)
const colors = {
  ink: "111111",
  body: "222222",
  muted: "5F6368",
  line: "9AA0A6",
  pale: "F1F2F4",
};
const rule = (color: string, size: number, space = 0) => ({ style: BorderStyle.SINGLE, color, size, space });
/** 양식 표 테두리 — 위·아래는 검정, 안쪽은 회색 */
const formBorders = {
  top: rule(colors.ink, 10),
  bottom: rule(colors.ink, 6),
  left: rule(colors.line, 4),
  right: rule(colors.line, 4),
  insideHorizontal: rule(colors.line, 4),
  insideVertical: rule(colors.line, 4),
};

const docxFont = "NanumGothic";
const docxFontAttributes = {
  ascii: docxFont,
  cs: docxFont,
  eastAsia: docxFont,
  hAnsi: docxFont,
  hint: "eastAsia",
} as const;

class TextRun extends DocxTextRun {
  constructor(options: IRunOptions) {
    const font = options.font === undefined || options.font === docxFont ? docxFontAttributes : options.font;
    super({
      ...options,
      font,
      language: options.language ?? { value: "ko-KR", eastAsia: "ko-KR" },
    });
  }
}

function inlineText(tokens: Token[] | undefined, fallback = ""): string {
  if (!tokens?.length) return fallback.replace(/\s+/g, " ").trim();
  return tokens.map((token) => {
    if ("tokens" in token && Array.isArray(token.tokens)) return inlineText(token.tokens, "text" in token ? String(token.text) : "");
    if (token.type === "br") return "\n";
    if ("text" in token) return String(token.text);
    return "";
  }).join("").replace(/[ \t]+/g, " ").trim();
}

function docxRuns(tokens: Token[] | undefined, fallback = ""): TextRun[] {
  if (!tokens?.length) return [new TextRun({ text: fallback, font: docxFont })];
  return tokens.flatMap((token): TextRun[] => {
    if (token.type === "strong") {
      return [new TextRun({ text: inlineText(token.tokens, token.text), bold: true, font: docxFont })];
    }
    if (token.type === "em") {
      return [new TextRun({ text: inlineText(token.tokens, token.text), italics: true, font: docxFont })];
    }
    if (token.type === "codespan") {
      return [new TextRun({ text: token.text, font: "Consolas", shading: { type: ShadingType.CLEAR, fill: "EEF2F0" } })];
    }
    if (token.type === "link") {
      return [new TextRun({ text: `${inlineText(token.tokens, token.text)} (${token.href})`, color: colors.ink, underline: {} })];
    }
    if (token.type === "br") return [new TextRun({ break: 1 })];
    if ("tokens" in token && Array.isArray(token.tokens)) return docxRuns(token.tokens, "text" in token ? String(token.text) : "");
    return [new TextRun({ text: "text" in token ? String(token.text) : "", font: docxFont })];
  });
}

type CellAlign = "left" | "right" | "center";
const docxAlign = (align: CellAlign) => align === "right" ? AlignmentType.RIGHT : align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;

function docxTableCell(text: string, header: boolean, align: CellAlign = "left", extra: Partial<ITableCellOptions> = {}): TableCell {
  const options: ITableCellOptions = {
    ...extra,
    shading: header ? { type: ShadingType.CLEAR, fill: colors.pale } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [new Paragraph({
      // 머리칸은 양식처럼 가운데(숫자 열은 오른쪽 그대로)
      alignment: header && align === "left" ? AlignmentType.CENTER : docxAlign(align),
      children: [new TextRun({ text, bold: header, size: header ? 19 : 18, color: header ? colors.ink : colors.body, font: docxFont })],
      spacing: { after: 0 },
    })],
  };
  return new TableCell(options);
}

/** 표지·일반 현황의 '항목 | 값' 표 — pairs 가 2면 한 줄에 두 쌍을 놓는다 */
function fieldTable(fields: Array<{ label: string; value: string }>, pairs: 1 | 2, width = 100): Table {
  const labelWidth = pairs === 2 ? 16 : 28;
  const rows: TableRow[] = [];
  for (let index = 0; index < fields.length; index += pairs) {
    const row = fields.slice(index, index + pairs);
    rows.push(new TableRow({
      cantSplit: true,
      children: row.flatMap((field) => [
        docxTableCell(field.label, true, "center", { width: { size: labelWidth, type: WidthType.PERCENTAGE } }),
        // 짝이 안 맞는 마지막 칸은 남은 너비를 다 쓴다
        docxTableCell(field.value, false, "left", row.length < pairs ? { columnSpan: 3 } : { width: { size: 100 / pairs - labelWidth, type: WidthType.PERCENTAGE } }),
      ]),
    }));
  }
  return new Table({ width: { size: width, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, borders: formBorders, rows });
}

/** '□ 소제목' 줄 — 본문 안 작은 제목과 굵은 머리말 문단이 같이 쓴다 */
function boxHeading(runs: TextRun[]): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text: "□ ", font: docxFont }), ...runs],
    keepNext: true,
    keepLines: true,
    spacing: { before: 200, after: 100 },
  });
}

/** 목록 — 'ㅇ', 안쪽은 '-'. 목차 줄('1.1 …')은 표시 없이 둔다(PDF 와 같은 규칙) */
function listBlocks(list: Tokens.List, level = 0): Paragraph[] {
  return list.items.flatMap((item, index) => {
    const numbered = SELF_NUMBERED.test(item.text);
    const mark = numbered ? "" : list.ordered ? `${index + 1}. ` : level ? "- " : "ㅇ ";
    return [
      new Paragraph({
        children: [...(mark ? [new TextRun({ text: mark, font: docxFont })] : []), ...docxRuns(item.tokens.filter((child) => child.type !== "list"), item.text)],
        indent: { left: 300 + level * 280 + (mark ? 260 : 0), hanging: mark ? 260 : 0 },
        spacing: { after: numbered ? 20 : 80, line: numbered ? 280 : 310 },
      }),
      ...item.tokens.flatMap((child) => child.type === "list" ? listBlocks(child as Tokens.List, level + 1) : []),
    ];
  });
}

/** 막대 한 칸 — 공백에 음영을 넣어 길이로 크기를 표현한다(Word에 그림을 넣지 않고 그린다). */
function barCell(width: number, fill: string, align: (typeof AlignmentType)[keyof typeof AlignmentType]): TableCell {
  const blocks = "\u00a0".repeat(Math.max(0, Math.round(width)));
  return new TableCell({
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [new Paragraph({
      alignment: align,
      children: blocks ? [new TextRun({ text: blocks, size: 16, shading: { type: ShadingType.CLEAR, fill }, font: docxFont })] : [],
      spacing: { after: 0 },
    })],
  });
}

/**
 * 누적 손익 곡선을 Word에서 표현한다.
 * 이미지를 넣을 수 없으므로 0을 가운데 두고 좌(적자)·우(흑자)로 뻗는 막대표로 그린다.
 */
function chartTable(points: ChartPoint[], breakEvenMonth: number | null): Table {
  /*
   * 막대 길이 기준은 웹·PDF 와 같은 반올림 눈금을 쓴다. 예전에는 실제 최댓값을
   * 기준으로 삼아, 같은 플랜인데 PDF 와 Word 의 막대 비율이 서로 달랐다.
   */
  const scale = chartScale(points);
  const peak = Math.max(1, Math.abs(scale.min), Math.abs(scale.max));
  const MAX_BLOCKS = 26;
  const label = (p: ChartPoint, i: number) =>
    breakEvenMonth === i + 1 ? `${p.label} ◀ 월 흑자 전환` : p.label;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: points.map((p, i) => {
      const blocks = (Math.abs(p.value) / peak) * MAX_BLOCKS;
      const negative = p.value < 0;
      return new TableRow({
        children: [
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            margins: { top: 40, bottom: 40, left: 0, right: 80 },
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: label(p, i), size: 16, color: breakEvenMonth === i + 1 ? "0F9D66" : colors.muted, bold: breakEvenMonth === i + 1, font: docxFont })],
              spacing: { after: 0 },
            })],
          }),
          barCell(negative ? blocks : 0, "F2A6B2", AlignmentType.RIGHT),
          barCell(negative ? 0 : blocks, "9BD9BC", AlignmentType.LEFT),
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            margins: { top: 40, bottom: 40, left: 80, right: 0 },
            children: [new Paragraph({
              children: [new TextRun({ text: `${shortWon(p.value)}원`, size: 16, color: negative ? "B23A4E" : "0F7A52", font: docxFont })],
              spacing: { after: 0 },
            })],
          }),
        ],
      });
    }),
  });
}

function docxBlocks(document: BusinessDocument, overviewFields?: DocumentProjectMeta["overviewFields"]): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [];
  const tokens = lexPlanMarkdown(document.markdown);
  let skippedTitle = false;
  let overviewPending = !!overviewFields?.length;

  for (const token of tokens) {
    if (token.type === "heading") {
      if (!skippedTitle && token.depth === 1) {
        skippedTitle = true;
        continue;
      }
      if (token.depth >= 4) {
        blocks.push(boxHeading(docxRuns(token.tokens, token.text)));
        continue;
      }
      // 첫 장('1. …')은 새 쪽에서 시작하고 바로 아래에 일반 현황 표를 둔다
      const firstChapter = overviewPending && token.depth <= 2 && /^\d+\.\s/.test(token.text);
      blocks.push(new Paragraph({
        heading: token.depth <= 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        children: docxRuns(token.tokens, token.text),
        // 제목만 쪽 끝에 홀로 남지 않게 다음 문단과 붙여 둔다
        keepNext: true,
        keepLines: true,
        pageBreakBefore: firstChapter,
        // 장 제목 띠 — 위는 굵은 검정 줄, 아래는 가는 줄
        ...(token.depth <= 2 ? {
          shading: { type: ShadingType.CLEAR, fill: colors.pale },
          border: { top: rule(colors.ink, 14, 5), bottom: rule(colors.ink, 4, 5) },
        } : {}),
        spacing: { before: token.depth <= 2 ? 360 : 240, after: token.depth <= 2 ? 200 : 100 },
      }));
      if (firstChapter) {
        overviewPending = false;
        blocks.push(boxHeading([new TextRun({ text: "일반 현황", font: docxFont })]));
        blocks.push(fieldTable(overviewFields!, 2));
        blocks.push(new Paragraph({ text: "", spacing: { after: 140 } }));
      }
      continue;
    }
    if (token.type === "paragraph") {
      const lead = splitLeadLabel(token.tokens);
      if (lead) {
        blocks.push(boxHeading([new TextRun({ text: lead.label, font: docxFont })]));
        const [head, ...tail] = lead.rest;
        if (!lead.rest.some((rest) => rest.raw.trim())) continue;
        blocks.push(new Paragraph({
          children: docxRuns(head.type === "text" ? [{ ...head, text: head.text.trimStart() } as Token, ...tail] : lead.rest),
          spacing: { after: 150, line: 340 },
        }));
        continue;
      }
      blocks.push(new Paragraph({
        children: docxRuns(token.tokens, token.text),
        spacing: { after: 150, line: 340 },
      }));
      continue;
    }
    if (token.type === "blockquote") {
      blocks.push(new Paragraph({
        children: [new TextRun({ text: inlineText(token.tokens, token.text), color: colors.muted, font: docxFont })],
        shading: { type: ShadingType.CLEAR, fill: colors.pale },
        border: { left: rule(colors.ink, 18, 8) },
        indent: { left: 180 },
        spacing: { before: 80, after: 180, line: 320 },
      }));
      continue;
    }
    if (token.type === "list") {
      blocks.push(...listBlocks(token as Tokens.List));
      continue;
    }
    if (token.type === "table") {
      const table = token as Tokens.Table;
      const rows = [table.header, ...table.rows];
      // 숫자 열은 화면처럼 오른쪽에 맞춘다(머리줄 ---:, 없으면 금액 열 — lexPlanMarkdown 이 정해 둔다)
      const aligns = table.header.map((_, column): CellAlign => table.align[column] === "center" ? "center" : table.align[column] === "right" ? "right" : "left");
      blocks.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: formBorders,
        rows: rows.map((row, rowIndex) => new TableRow({
          tableHeader: rowIndex === 0,
          cantSplit: true,
          children: row.map((cell, column) => docxTableCell(inlineText(cell.tokens, cell.text), rowIndex === 0, aligns[column])),
        })),
      }));
      blocks.push(new Paragraph({ text: "", spacing: { after: 140 } }));
      continue;
    }
    if (token.type === "hr") {
      blocks.push(new Paragraph({ border: { bottom: { color: colors.line, size: 6, style: BorderStyle.SINGLE } }, spacing: { before: 120, after: 160 } }));
      continue;
    }
    if (token.type === "code") {
      if ((token as Tokens.Code).lang === CHART_FENCE_LANG) {
        const spec = parseChartSpec(token.text);
        // 형식이 어긋나면 원시 JSON을 문서에 흘리지 않는다
        if (spec) {
          // 화면 차트와 같은 제목 — 막대표만 있으면 무슨 값인지 알 수 없었다
          if (spec.title) blocks.push(new Paragraph({
            keepNext: true,
            children: [
              new TextRun({ text: spec.title, bold: true, size: 19, color: colors.ink, font: docxFont }),
              new TextRun({ text: "  (단위: 원)", size: 16, color: colors.muted, font: docxFont }),
            ],
            spacing: { before: 120, after: 80 },
          }));
          blocks.push(chartTable(spec.points, spec.breakEvenMonth));
          blocks.push(new Paragraph({ text: "", spacing: { after: 160 } }));
        }
        continue;
      }
      blocks.push(new Paragraph({
        children: [new TextRun({ text: token.text, font: "Consolas", size: 18 })],
        shading: { type: ShadingType.CLEAR, fill: "F3F5F4" },
        spacing: { after: 150 },
      }));
    }
  }
  return blocks;
}

function coverBlocks(document: BusinessDocument, project: DocumentProjectMeta, first: boolean): Array<Paragraph | Table> {
  const fields = project.coverFields?.length ? project.coverFields : [
    { label: "프로젝트", value: project.title },
    { label: "목표 고객", value: project.customer },
    { label: "수익 방식", value: project.model },
    { label: "문서 버전", value: document.versionLabel },
  ];
  return [
    ...(!first ? [new Paragraph({ children: [new PageBreak()] })] : []),
    // 제목을 굵은 검정 줄 두 개 사이에 가운데로 둔다
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: rule(colors.ink, 18, 24) },
      children: [new TextRun({ text: document.title, bold: true, color: colors.ink, size: 48, font: docxFont })],
      spacing: { before: first ? 2600 : 2000, after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: rule(colors.ink, 18, 24) },
      children: [new TextRun({ text: document.type, color: colors.muted, size: 23, font: docxFont })],
      spacing: { after: 2000 },
    }),
    fieldTable([...fields, { label: "작성일", value: new Date(project.generatedAt).toLocaleDateString("ko-KR") }], 1, 70),
    new Paragraph({
      children: [new TextRun({
        text: project.sample
          ? "이 문서는 화면 검증용 가상 사례입니다. 실제 사업 판단에는 사용할 수 없습니다."
          : "확정 표시가 없는 시장 수치와 가정은 인터뷰, 계약서, 견적서 또는 공식 자료로 다시 확인해야 합니다.",
        color: colors.muted,
        size: 18,
        font: docxFont,
      })],
      shading: { type: ShadingType.CLEAR, fill: colors.pale },
      border: { top: rule(colors.line, 4, 6), bottom: rule(colors.line, 4, 6), left: rule(colors.line, 4, 6), right: rule(colors.line, 4, 6) },
      indent: { left: 120, right: 120 },
      spacing: { before: 2000, after: 100 },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

type DeliveryFontData = Buffer | Uint8Array;

function deliveryFontData(fontData?: DeliveryFontData) {
  return fontData ? Buffer.from(fontData) : readFileSync(deliveryFontPath());
}

// NanumGothic으로 렌더되는 모든 텍스트를 모은다(서브셋 커버리지의 상한 집합).
// 본문은 마크다운에 있고, 나머지는 표지·바닥글 고정 라벨과 프로젝트/문서 필드다.
// 코드스팬은 Consolas로 렌더되므로 NanumGothic 커버리지 대상이 아니다.
function collectDeliveryText(documents: BusinessDocument[], project: DocumentProjectMeta): string {
  const parts: string[] = [
    // 표지·바닥글·메타에서 쓰는 고정 라벨(coverBlocks/footer/Document)
    "창업 실행 캔버스 프로젝트 목표 고객 수익 방식 문서 버전 작성일 일반 현황 □ ㅇ ※ - 전체 창업 실행 문서 한국 초보 창업자를 위한 실행 문서 년 월 일 (단위: 원) 개월차 월 흑자 전환",
    // 숫자·영문·문장부호 안전망
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,·|()[]{}<>-–—:;/%~!?\"'`@#&*+=₩$…“”‘’",
    project.title,
    project.customer,
    project.model,
    project.sector,
    new Date(project.generatedAt).toLocaleDateString("ko-KR"),
    // 커스텀 표지 항목(라벨·값)도 서브셋 대상에 포함
    ...([...(project.coverFields ?? []), ...(project.overviewFields ?? [])].flatMap((f) => [f.label, f.value])),
  ];
  for (const document of documents) {
    parts.push(document.title, document.type, document.versionLabel, document.markdown);
    if (document.executiveSummary) parts.push("한 장 사업 요약 입력 제안 계산 확인 필요", JSON.stringify(document.executiveSummary));
  }
  return parts.join("\n");
}

export async function renderDocx(
  documents: BusinessDocument[],
  project: DocumentProjectMeta,
  fontData?: DeliveryFontData,
): Promise<Buffer> {
  const onePage = documents.length === 1 && !!documents[0].executiveSummary;
  const children = documents.flatMap((document, index) => document.executiveSummary ? summaryDocxBlocks(document.executiveSummary) : [
    ...coverBlocks(document, project, index === 0),
    ...docxBlocks(document, project.overviewFields),
  ]);
  // 실제 쓰인 글리프만 담은 서브셋을 임베드한다(4MB → 수백KB). 실패 시 전체 폰트로 폴백.
  const fullFont = deliveryFontData(fontData);
  const embeddedFont = subsetTrueType(fullFont, glyphIdsForText(fullFont, collectDeliveryText(documents, project))) ?? fullFont;
  const doc = new Document({
    creator: "창업 실행 캔버스",
    title: documents.length === 1 ? documents[0].title : `${project.title} 전체 창업 실행 문서`,
    description: "한국 초보 창업자를 위한 실행 문서",
    fonts: [{ name: docxFont, data: embeddedFont }],
    styles: {
      default: {
        document: { run: { font: docxFontAttributes, language: { value: "ko-KR", eastAsia: "ko-KR" }, size: 20, color: colors.body }, paragraph: { spacing: { line: 320 } } },
        heading1: { run: { font: docxFontAttributes, language: { value: "ko-KR", eastAsia: "ko-KR" }, size: 30, bold: true, color: colors.ink } },
        heading2: { run: { font: docxFontAttributes, language: { value: "ko-KR", eastAsia: "ko-KR" }, size: 25, bold: true, color: colors.ink } },
        heading3: { run: { font: docxFontAttributes, language: { value: "ko-KR", eastAsia: "ko-KR" }, size: 21, bold: true, color: colors.ink } },
      },
    },
    sections: [{
      // 상세 문서는 표지에 머리말·쪽 번호를 찍지 않는다
      properties: { titlePage: !onePage, page: { ...(onePage ? { size: { width: 11906, height: 16838 } } : {}), margin: { top: onePage ? 760 : 900, right: 900, bottom: onePage ? 760 : 900, left: 900 } } },
      children,
      headers: onePage ? undefined : {
        default: new Header({ children: [new Paragraph({
          border: { bottom: rule(colors.line, 4, 4) },
          children: [new TextRun({ text: documents.length === 1 ? documents[0].title : project.title, color: colors.muted, size: 15, font: docxFont })],
        })] }),
        first: new Header({ children: [new Paragraph("")] }),
      },
      footers: onePage ? {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: `${project.title}  |  `, color: "65766F", size: 16, font: docxFont }),
            new TextRun({ children: [PageNumber.CURRENT], color: "65766F", size: 16 }),
          ],
        })] }),
      } : {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "- ", color: colors.muted, size: 16, font: docxFont }),
            new TextRun({ children: [PageNumber.CURRENT], color: colors.muted, size: 16 }),
            new TextRun({ text: " -", color: colors.muted, size: 16, font: docxFont }),
          ],
        })] }),
        first: new Footer({ children: [new Paragraph("")] }),
      },
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function summaryDocxBlocks(summary: ExecutiveSummary): Paragraph[] {
  const paragraphs = [
    new Paragraph({ style: "Title", children: [new TextRun({ text: summary.title, size: 32, bold: true, color: "171C24" })], spacing: { after: 80, line: 360 } }),
    new Paragraph({ children: [new TextRun({ text: `한 장 사업 요약 | ${summary.planType}`, size: 18, color: "596579" })], spacing: { after: 150, line: 240 } }),
  ];
  for (const block of summary.blocks) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: block.title, size: 21, bold: true, color: "171C24" })], keepNext: true, spacing: { before: 110, after: 45, line: 250 } }));
    for (const line of block.lines) paragraphs.push(new Paragraph({ children: [
      new TextRun({ text: `${line.label}  `, bold: true, size: 17, color: "394659" }),
      new TextRun({ text: line.value, size: 18, color: "26303E" }),
      new TextRun({ text: `  [${summaryBasisLabel(line.basis)}]`, size: 15, color: "657286" }),
    ], spacing: { after: 40, line: 245 } }));
  }
  paragraphs.push(new Paragraph({ children: [new TextRun({ text: summary.note, size: 15, color: "657286" })], spacing: { before: 150, after: 0, line: 220 } }));
  return paragraphs;
}

function deliveryFontPath() {
  return path.join(process.cwd(), "public", "fonts", "NanumGothic-Regular.ttf");
}
export async function renderPdf(
  documents: BusinessDocument[],
  project: DocumentProjectMeta,
  fontData?: DeliveryFontData,
): Promise<Buffer> {
  // 수학 빼기 기호(−, U+2212)는 나눔고딕에 글자가 없어 PDF에서 빈 네모로 찍힌다 — 붙임표로 바꿔 그린다
  // shortcut: 지금 본문에서 글꼴에 없는 글자는 이것 하나다(2026-11-13 실제 계획서 4건 대조), 다른 글자가 보이면 여기에 더한다
  return renderLightweightPdf(documents.map(document => ({ ...document, markdown: document.markdown.replace(/\u2212/g, "-") })), project, deliveryFontData(fontData));
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 80);
}

export async function renderDeliveryZip(
  documents: BusinessDocument[],
  project: DocumentProjectMeta,
  fontData?: DeliveryFontData,
): Promise<Buffer> {
  const [pdf, docx] = await Promise.all([
    renderPdf(documents, project, fontData),
    renderDocx(documents, project, fontData),
  ]);
  return packageDeliveryZip(pdf, docx, project);
}

export async function packageDeliveryZip(
  pdf: Buffer | Uint8Array,
  docx: Buffer | Uint8Array,
  project: DocumentProjectMeta,
): Promise<Buffer> {
  const archive = new JSZip();
  const combinedName = safeFileName(`${project.title}-전체-창업-실행-문서`);
  archive.file(`00_${combinedName}.pdf`, pdf);
  archive.file(`00_${combinedName}.docx`, docx);
  return await archive.generateAsync({ type: "nodebuffer", compression: "STORE" });
}
