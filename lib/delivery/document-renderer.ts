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
import PDFDocument from "pdfkit";

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
  return fontData ? Buffer.from(fontData) : readFileSync(pdfFontPath());
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

type Pdf = InstanceType<typeof PDFDocument>;

function pdfFontPath() {
  return path.join(process.cwd(), "public", "fonts", "NanumGothic-Regular.ttf");
}

function pdfEnsureSpace(doc: Pdf, height: number) {
  if (doc.y + height > doc.page.height - 72) doc.addPage();
}

function pdfParagraph(doc: Pdf, text: string, options?: { size?: number; color?: string; indent?: number; gap?: number }) {
  const size = options?.size ?? 10;
  const indent = options?.indent ?? 0;
  pdfEnsureSpace(doc, size * 2.2);
  doc.font("Nanum").fontSize(size).fillColor(options?.color ?? "#263d34")
    .text(text, 54 + indent, doc.y, { width: doc.page.width - 108 - indent, lineGap: 4 });
  doc.moveDown(options?.gap ?? 0.65);
}

function pdfTable(doc: Pdf, token: Tokens.Table) {
  const rows = [token.header, ...token.rows];
  const x = 54;
  const width = doc.page.width - 108;
  const columnWidth = width / Math.max(1, token.header.length);
  rows.forEach((row, rowIndex) => {
    const values = row.map((cell) => inlineText(cell.tokens, cell.text));
    const heights = values.map((value) => doc.heightOfString(value, { width: columnWidth - 12, lineGap: 2 }));
    const rowHeight = Math.max(26, ...heights.map((height) => height + 12));
    pdfEnsureSpace(doc, rowHeight + 4);
    const y = doc.y;
    values.forEach((value, columnIndex) => {
      doc.save().rect(x + columnIndex * columnWidth, y, columnWidth, rowHeight)
        .fillAndStroke(rowIndex === 0 ? "#eff7f3" : "#ffffff", "#d9e4df").restore();
      doc.font("Nanum").fontSize(rowIndex === 0 ? 8.5 : 8).fillColor("#263d34")
        .text(value, x + columnIndex * columnWidth + 6, y + 6, { width: columnWidth - 12, lineGap: 2 });
    });
    doc.y = y + rowHeight;
  });
  doc.moveDown(0.8);
}

function pdfBlocks(doc: Pdf, document: BusinessDocument) {
  const tokens = marked.lexer(document.markdown, { gfm: true });
  let skippedTitle = false;
  for (const token of tokens) {
    if (token.type === "heading") {
      if (!skippedTitle && token.depth === 1) {
        skippedTitle = true;
        continue;
      }
      const size = token.depth <= 2 ? 17 : token.depth === 3 ? 13 : 11;
      pdfEnsureSpace(doc, size * 2.5);
      doc.moveDown(token.depth <= 2 ? 0.8 : 0.45);
      doc.font("Nanum").fontSize(size).fillColor(token.depth <= 2 ? "#18342a" : "#0b7254")
        .text(inlineText(token.tokens, token.text), 54, doc.y, { width: doc.page.width - 108, lineGap: 3 });
      doc.moveDown(0.45);
      continue;
    }
    if (token.type === "paragraph") {
      pdfParagraph(doc, inlineText(token.tokens, token.text));
      continue;
    }
    if (token.type === "blockquote") {
      const text = inlineText(token.tokens, token.text);
      const height = doc.heightOfString(text, { width: doc.page.width - 138, lineGap: 4 }) + 20;
      pdfEnsureSpace(doc, height);
      const y = doc.y;
      doc.save().rect(54, y, doc.page.width - 108, height).fill("#fff5d6").restore();
      doc.save().rect(54, y, 4, height).fill("#d9b949").restore();
      doc.font("Nanum").fontSize(9).fillColor("#6b5d2a").text(text, 70, y + 10, { width: doc.page.width - 140, lineGap: 4 });
      doc.y = y + height + 8;
      continue;
    }
    if (token.type === "list") {
      const list = token as Tokens.List;
      list.items.forEach((item, index) => {
        const marker = list.ordered ? `${index + 1}.` : "·";
        pdfParagraph(doc, `${marker} ${inlineText(item.tokens, item.text)}`, { indent: 12, gap: 0.35 });
      });
      doc.moveDown(0.2);
      continue;
    }
    if (token.type === "table") {
      pdfTable(doc, token as Tokens.Table);
      continue;
    }
    if (token.type === "hr") {
      pdfEnsureSpace(doc, 18);
      doc.moveDown(0.5).strokeColor("#d9e4df").moveTo(54, doc.y).lineTo(doc.page.width - 54, doc.y).stroke().moveDown(0.5);
      continue;
    }
    if (token.type === "code") pdfParagraph(doc, token.text, { size: 8, color: "#45544e", indent: 12 });
  }
}

function pdfCover(doc: Pdf, document: BusinessDocument, project: DocumentProjectMeta, first: boolean) {
  if (!first) doc.addPage();
  doc.font("Nanum").fillColor("#0b7254").fontSize(11).text("창업 실행 캔버스", 54, 72);
  doc.fillColor("#18342a").fontSize(28).text(document.title, 54, 150, { width: doc.page.width - 108, lineGap: 8 });
  doc.fillColor("#65766f").fontSize(12).text(document.type, 54, doc.y + 12, { width: doc.page.width - 108 });
  doc.moveTo(54, 265).lineTo(doc.page.width - 54, 265).strokeColor("#d9e4df").stroke();
  const details = [
    ["프로젝트", project.title],
    ["목표 고객", project.customer],
    ["수익 방식", project.model],
    ["문서 버전", document.versionLabel],
    ["생성일", new Date(project.generatedAt).toLocaleDateString("ko-KR")],
  ];
  let y = 300;
  details.forEach(([label, value]) => {
    doc.fillColor("#65766f").fontSize(8).text(label, 54, y, { width: 80 });
    doc.fillColor("#263d34").fontSize(10).text(value, 140, y - 1, { width: doc.page.width - 194 });
    y += 34;
  });
  const notice = project.sample
    ? "이 문서는 화면 검증용 가상 사례입니다. 실제 사업 판단에는 사용할 수 없습니다."
    : "확정 표시가 없는 시장 수치와 가정은 인터뷰, 계약서, 견적서 또는 공식 자료로 다시 확인해야 합니다.";
  doc.save().roundedRect(54, 500, doc.page.width - 108, 64, 4).fill("#fff5d6").restore();
  doc.fillColor("#6b5d2a").fontSize(9).text(notice, 70, 519, { width: doc.page.width - 140, lineGap: 4 });
  doc.addPage();
}

export async function renderPdf(
  documents: BusinessDocument[],
  project: DocumentProjectMeta,
  fontData?: DeliveryFontData,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const font = deliveryFontData(fontData);
    // PDFKit accepts font buffers here, although its public option type only declares paths.
    const doc = new PDFDocument({ size: "A4", font: font as unknown as string, margins: { top: 62, right: 54, bottom: 72, left: 54 }, bufferPages: true, info: { Title: documents.length === 1 ? documents[0].title : `${project.title} 전체 창업 실행 문서`, Author: "창업 실행 캔버스" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont("Nanum", font);

    documents.forEach((document, index) => {
      pdfCover(doc, document, project, index === 0);
      pdfBlocks(doc, document);
    });

    const range = doc.bufferedPageRange();
    for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      doc.page.margins.bottom = 18;
      doc.font("Nanum").fontSize(7.5).fillColor("#718078")
        .text(project.title, 54, 28, { width: doc.page.width - 108, align: "right", lineBreak: false })
        .text(`${pageIndex + 1} / ${range.count}`, 54, doc.page.height - 40, { width: doc.page.width - 108, align: "right", lineBreak: false });
    }
    doc.end();
  });
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 80);
}

export async function renderDeliveryZip(
  documents: BusinessDocument[],
  project: DocumentProjectMeta,
  fontData?: DeliveryFontData,
): Promise<Buffer> {
  const archive = new JSZip();
  const combinedName = safeFileName(`${project.title}-전체-창업-실행-문서`);
  archive.file(`00_${combinedName}.pdf`, await renderPdf(documents, project, fontData));
  archive.file(`00_${combinedName}.docx`, await renderDocx(documents, project, fontData));
  return await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 8 } });
}
