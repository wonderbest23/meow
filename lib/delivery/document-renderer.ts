import JSZip from "jszip";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
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
import { marked, type Token, type Tokens } from "marked";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderLightweightPdf } from "./lightweight-pdf";

export type BusinessDocument = {
  id: string;
  title: string;
  type: string;
  versionLabel: string;
  markdown: string;
};

export type DocumentProjectMeta = {
  title: string;
  sector: string;
  model: string;
  customer: string;
  generatedAt: string;
  sample: boolean;
};

const colors = {
  ink: "18342A",
  muted: "65766F",
  line: "D9E4DF",
  pale: "EFF7F3",
  accent: "0B7254",
  warning: "FFF5D6",
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
      return [new TextRun({ text: `${inlineText(token.tokens, token.text)} (${token.href})`, color: colors.accent, underline: {} })];
    }
    if (token.type === "br") return [new TextRun({ break: 1 })];
    if ("tokens" in token && Array.isArray(token.tokens)) return docxRuns(token.tokens, "text" in token ? String(token.text) : "");
    return [new TextRun({ text: "text" in token ? String(token.text) : "", font: docxFont })];
  });
}

function docxTableCell(text: string, header: boolean): TableCell {
  const options: ITableCellOptions = {
    shading: header ? { type: ShadingType.CLEAR, fill: colors.pale } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: header, size: header ? 19 : 18, color: header ? colors.ink : "263D34", font: docxFont })],
      spacing: { after: 0 },
    })],
  };
  return new TableCell(options);
}

function docxBlocks(document: BusinessDocument): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [];
  const tokens = marked.lexer(document.markdown, { gfm: true });
  let skippedTitle = false;

  for (const token of tokens) {
    if (token.type === "heading") {
      if (!skippedTitle && token.depth === 1) {
        skippedTitle = true;
        continue;
      }
      const level = token.depth <= 2 ? HeadingLevel.HEADING_1 : token.depth === 3 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      blocks.push(new Paragraph({
        heading: level,
        children: docxRuns(token.tokens, token.text),
        spacing: { before: token.depth <= 2 ? 300 : 200, after: 100 },
      }));
      continue;
    }
    if (token.type === "paragraph") {
      blocks.push(new Paragraph({
        children: docxRuns(token.tokens, token.text),
        spacing: { after: 150, line: 340 },
      }));
      continue;
    }
    if (token.type === "blockquote") {
      blocks.push(new Paragraph({
        children: [new TextRun({ text: inlineText(token.tokens, token.text), color: "6B5D2A", font: docxFont })],
        shading: { type: ShadingType.CLEAR, fill: colors.warning },
        border: { left: { color: "D9B949", size: 18, style: BorderStyle.SINGLE, space: 8 } },
        indent: { left: 180 },
        spacing: { before: 80, after: 180, line: 320 },
      }));
      continue;
    }
    if (token.type === "list") {
      const list = token as Tokens.List;
      list.items.forEach((item, index) => {
        blocks.push(new Paragraph({
          children: docxRuns(item.tokens, item.text),
          bullet: list.ordered ? undefined : { level: 0 },
          numbering: list.ordered ? { reference: "delivery-numbering", level: 0, instance: index } : undefined,
          indent: { left: 300, hanging: 160 },
          spacing: { after: 80, line: 310 },
        }));
      });
      continue;
    }
    if (token.type === "table") {
      const table = token as Tokens.Table;
      const rows = [table.header, ...table.rows];
      blocks.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map((row, rowIndex) => new TableRow({
          tableHeader: rowIndex === 0,
          children: row.map((cell) => docxTableCell(inlineText(cell.tokens, cell.text), rowIndex === 0)),
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
      blocks.push(new Paragraph({
        children: [new TextRun({ text: token.text, font: "Consolas", size: 18 })],
        shading: { type: ShadingType.CLEAR, fill: "F3F5F4" },
        spacing: { after: 150 },
      }));
    }
  }
  return blocks;
}

function coverBlocks(document: BusinessDocument, project: DocumentProjectMeta, first: boolean): Paragraph[] {
  return [
    ...(!first ? [new Paragraph({ children: [new PageBreak()] })] : []),
    new Paragraph({
      children: [new TextRun({ text: "창업 실행 캔버스", bold: true, color: colors.accent, size: 22, font: docxFont })],
      spacing: { before: first ? 900 : 200, after: 900 },
    }),
    new Paragraph({
      children: [new TextRun({ text: document.title, bold: true, color: colors.ink, size: 42, font: docxFont })],
      spacing: { after: 180 },
    }),
    new Paragraph({
      children: [new TextRun({ text: document.type, color: colors.muted, size: 23, font: docxFont })],
      spacing: { after: 700 },
    }),
    new Paragraph({ children: [new TextRun({ text: `프로젝트  ${project.title}`, bold: true, size: 20, font: docxFont })], spacing: { after: 100 } }),
    new Paragraph({ children: [new TextRun({ text: `목표 고객  ${project.customer}`, size: 19, font: docxFont })], spacing: { after: 80 } }),
    new Paragraph({ children: [new TextRun({ text: `수익 방식  ${project.model}`, size: 19, font: docxFont })], spacing: { after: 80 } }),
    new Paragraph({ children: [new TextRun({ text: `문서 버전  ${document.versionLabel}`, size: 19, font: docxFont })], spacing: { after: 80 } }),
    new Paragraph({ children: [new TextRun({ text: `생성일  ${new Date(project.generatedAt).toLocaleDateString("ko-KR")}`, size: 19, font: docxFont })], spacing: { after: 500 } }),
    new Paragraph({
      children: [new TextRun({
        text: project.sample
          ? "이 문서는 화면 검증용 가상 사례입니다. 실제 사업 판단에는 사용할 수 없습니다."
          : "확정 표시가 없는 시장 수치와 가정은 인터뷰, 계약서, 견적서 또는 공식 자료로 다시 확인해야 합니다.",
        color: "6B5D2A",
        size: 18,
        font: docxFont,
      })],
      shading: { type: ShadingType.CLEAR, fill: colors.warning },
      spacing: { after: 100 },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

type DeliveryFontData = Buffer | Uint8Array;

function deliveryFontData(fontData?: DeliveryFontData) {
  return fontData ? Buffer.from(fontData) : readFileSync(deliveryFontPath());
}

export async function renderDocx(
  documents: BusinessDocument[],
  project: DocumentProjectMeta,
  fontData?: DeliveryFontData,
): Promise<Buffer> {
  const children = documents.flatMap((document, index) => [
    ...coverBlocks(document, project, index === 0),
    ...docxBlocks(document),
  ]);
  const doc = new Document({
    creator: "창업 실행 캔버스",
    title: documents.length === 1 ? documents[0].title : `${project.title} 전체 창업 실행 문서`,
    description: "한국 초보 창업자를 위한 실행 문서",
    fonts: [{ name: docxFont, data: deliveryFontData(fontData) }],
    numbering: {
      config: [{
        reference: "delivery-numbering",
        levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 180 } } } }],
      }],
    },
    styles: {
      default: {
        document: { run: { font: docxFontAttributes, language: { value: "ko-KR", eastAsia: "ko-KR" }, size: 20, color: "263D34" }, paragraph: { spacing: { line: 320 } } },
        heading1: { run: { font: docxFontAttributes, language: { value: "ko-KR", eastAsia: "ko-KR" }, size: 30, bold: true, color: colors.ink } },
        heading2: { run: { font: docxFontAttributes, language: { value: "ko-KR", eastAsia: "ko-KR" }, size: 25, bold: true, color: colors.ink } },
        heading3: { run: { font: docxFontAttributes, language: { value: "ko-KR", eastAsia: "ko-KR" }, size: 22, bold: true, color: colors.accent } },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      children,
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: `${project.title}  |  `, color: colors.muted, size: 16, font: docxFont }),
            new TextRun({ children: [PageNumber.CURRENT], color: colors.muted, size: 16 }),
          ],
        })] }),
      },
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function deliveryFontPath() {
  return path.join(process.cwd(), "public", "fonts", "NanumGothic-Regular.ttf");
}
export async function renderPdf(
  documents: BusinessDocument[],
  project: DocumentProjectMeta,
  fontData?: DeliveryFontData,
): Promise<Buffer> {
  return renderLightweightPdf(documents, project, deliveryFontData(fontData));
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
