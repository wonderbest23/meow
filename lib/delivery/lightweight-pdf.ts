import { marked, type Token, type Tokens } from "marked";

type PdfDocumentInput = {
  title: string;
  type: string;
  versionLabel: string;
  markdown: string;
};

type PdfProjectInput = {
  title: string;
  model: string;
  customer: string;
  generatedAt: string;
  sample: boolean;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 54;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT * 2;
const BOTTOM = 72;

function inlineText(tokens: Token[] | undefined, fallback = ""): string {
  if (!tokens?.length) return fallback.replace(/\s+/g, " ").trim();
  return tokens.map((token) => {
    if ("tokens" in token && Array.isArray(token.tokens)) return inlineText(token.tokens, "text" in token ? String(token.text) : "");
    if (token.type === "br") return "\n";
    return "text" in token ? String(token.text) : "";
  }).join("").replace(/[ \t]+/g, " ").trim();
}

function tableRecord(font: Buffer, tag: string) {
  const count = font.readUInt16BE(4);
  for (let index = 0; index < count; index += 1) {
    const offset = 12 + index * 16;
    if (font.toString("ascii", offset, offset + 4) === tag) {
      return { offset: font.readUInt32BE(offset + 8), length: font.readUInt32BE(offset + 12) };
    }
  }
  throw new Error(`PDF_FONT_TABLE_MISSING:${tag}`);
}

type Cmap12Group = { start: number; end: number; glyph: number };

class TrueTypeFont {
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly bbox: [number, number, number, number];
  private readonly advances: number[];
  private readonly cmap12: Cmap12Group[];
  private readonly cmap4Offset: number | null;

  constructor(readonly data: Buffer) {
    const head = tableRecord(data, "head").offset;
    const hhea = tableRecord(data, "hhea").offset;
    const maxp = tableRecord(data, "maxp").offset;
    const hmtx = tableRecord(data, "hmtx").offset;
    this.unitsPerEm = data.readUInt16BE(head + 18);
    this.ascent = data.readInt16BE(hhea + 4);
    this.descent = data.readInt16BE(hhea + 6);
    this.bbox = [data.readInt16BE(head + 36), data.readInt16BE(head + 38), data.readInt16BE(head + 40), data.readInt16BE(head + 42)];
    const glyphCount = data.readUInt16BE(maxp + 4);
    const longMetrics = data.readUInt16BE(hhea + 34);
    this.advances = Array.from({ length: glyphCount }, (_, glyph) => {
      const metric = Math.min(glyph, longMetrics - 1);
      return data.readUInt16BE(hmtx + metric * 4);
    });

    const cmap = tableRecord(data, "cmap").offset;
    const cmapCount = data.readUInt16BE(cmap + 2);
    let format12Offset: number | null = null;
    let format4Offset: number | null = null;
    for (let index = 0; index < cmapCount; index += 1) {
      const record = cmap + 4 + index * 8;
      const platform = data.readUInt16BE(record);
      const encoding = data.readUInt16BE(record + 2);
      const subtable = cmap + data.readUInt32BE(record + 4);
      const format = data.readUInt16BE(subtable);
      if (format === 12 && (platform === 0 || (platform === 3 && encoding === 10))) format12Offset = subtable;
      if (format === 4 && (platform === 0 || platform === 3)) format4Offset = subtable;
    }
    this.cmap12 = [];
    if (format12Offset !== null) {
      const groups = data.readUInt32BE(format12Offset + 12);
      for (let index = 0; index < groups; index += 1) {
        const offset = format12Offset + 16 + index * 12;
        this.cmap12.push({ start: data.readUInt32BE(offset), end: data.readUInt32BE(offset + 4), glyph: data.readUInt32BE(offset + 8) });
      }
    }
    this.cmap4Offset = format4Offset;
  }

  glyph(codePoint: number) {
    let low = 0;
    let high = this.cmap12.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const group = this.cmap12[middle];
      if (codePoint < group.start) high = middle - 1;
      else if (codePoint > group.end) low = middle + 1;
      else return group.glyph + codePoint - group.start;
    }
    if (this.cmap4Offset === null || codePoint > 0xffff) return 0;
    const offset = this.cmap4Offset;
    const segmentCount = this.data.readUInt16BE(offset + 6) / 2;
    const endCodes = offset + 14;
    const startCodes = endCodes + segmentCount * 2 + 2;
    const deltas = startCodes + segmentCount * 2;
    const ranges = deltas + segmentCount * 2;
    for (let index = 0; index < segmentCount; index += 1) {
      const end = this.data.readUInt16BE(endCodes + index * 2);
      if (codePoint > end) continue;
      const start = this.data.readUInt16BE(startCodes + index * 2);
      if (codePoint < start) return 0;
      const delta = this.data.readInt16BE(deltas + index * 2);
      const range = this.data.readUInt16BE(ranges + index * 2);
      if (range === 0) return (codePoint + delta) & 0xffff;
      const glyphOffset = ranges + index * 2 + range + (codePoint - start) * 2;
      if (glyphOffset + 2 > this.data.length) return 0;
      const glyph = this.data.readUInt16BE(glyphOffset);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  }

  width(glyph: number) {
    return this.advances[glyph] ?? this.advances[0] ?? this.unitsPerEm;
  }

  pdfMetric(value: number) {
    return Math.round(value * 1000 / this.unitsPerEm);
  }
}

function rgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => (Number.parseInt(value.slice(index, index + 2), 16) / 255).toFixed(3)).join(" ");
}

function utf16Hex(codePoint: number) {
  if (codePoint <= 0xffff) return codePoint.toString(16).padStart(4, "0").toUpperCase();
  const adjusted = codePoint - 0x10000;
  const high = 0xd800 + (adjusted >> 10);
  const low = 0xdc00 + (adjusted & 0x3ff);
  return `${high.toString(16).padStart(4, "0")}${low.toString(16).padStart(4, "0")}`.toUpperCase();
}

type PdfPage = { commands: string[]; cursor: number };

class PdfLayout {
  readonly pages: PdfPage[] = [];
  readonly unicodeByGlyph = new Map<number, number>();
  private page: PdfPage;

  constructor(private readonly font: TrueTypeFont) {
    this.page = this.newPage();
  }

  private newPage() {
    const page = { commands: [], cursor: 62 };
    this.pages.push(page);
    this.page = page;
    return page;
  }

  addPage() {
    this.newPage();
  }

  ensure(height: number) {
    if (this.page.cursor + height > PAGE_HEIGHT - BOTTOM) this.newPage();
  }

  private encoded(text: string) {
    let output = "";
    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? 32;
      const glyph = this.font.glyph(codePoint);
      if (glyph !== 0 && !this.unicodeByGlyph.has(glyph)) this.unicodeByGlyph.set(glyph, codePoint);
      output += glyph.toString(16).padStart(4, "0");
    }
    return output.toUpperCase();
  }

  private textWidth(text: string, size: number) {
    let width = 0;
    for (const character of text) width += this.font.width(this.font.glyph(character.codePointAt(0) ?? 32));
    return width * size / this.font.unitsPerEm;
  }

  wrap(text: string, width: number, size: number) {
    const lines: string[] = [];
    for (const explicitLine of text.replace(/\r/g, "").split("\n")) {
      if (!explicitLine) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const character of explicitLine) {
        const candidate = line + character;
        if (line && this.textWidth(candidate, size) > width) {
          lines.push(line.trimEnd());
          line = character.trimStart();
        } else line = candidate;
      }
      if (line || lines.length === 0) lines.push(line.trimEnd());
    }
    return lines;
  }

  drawText(text: string, x: number, top: number, options: { size: number; color?: string; width?: number; lineHeight?: number; bold?: boolean }) {
    const size = options.size;
    const lineHeight = options.lineHeight ?? size * 1.55;
    const lines = this.wrap(text, options.width ?? CONTENT_WIDTH, size);
    lines.forEach((line, index) => {
      if (!line) return;
      const baseline = PAGE_HEIGHT - top - index * lineHeight - size;
      const command = `BT /F1 ${size.toFixed(2)} Tf ${rgb(options.color ?? "263D34")} rg 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm <${this.encoded(line)}> Tj ET`;
      this.page.commands.push(command);
      if (options.bold) this.page.commands.push(command.replace(`${x.toFixed(2)} ${baseline.toFixed(2)} Tm`, `${(x + 0.22).toFixed(2)} ${baseline.toFixed(2)} Tm`));
    });
    return lines.length * lineHeight;
  }

  text(text: string, options?: { size?: number; color?: string; indent?: number; gap?: number; bold?: boolean; width?: number }) {
    const size = options?.size ?? 10;
    const indent = options?.indent ?? 0;
    const width = options?.width ?? CONTENT_WIDTH - indent;
    const lines = this.wrap(text, width, size);
    const height = Math.max(1, lines.length) * size * 1.55;
    this.ensure(height + (options?.gap ?? 8));
    this.drawText(text, LEFT + indent, this.page.cursor, { size, color: options?.color, width, bold: options?.bold });
    this.page.cursor += height + (options?.gap ?? 8);
  }

  rect(x: number, top: number, width: number, height: number, fill: string, stroke?: string) {
    const y = PAGE_HEIGHT - top - height;
    const operation = stroke ? "B" : "f";
    const strokeColor = stroke ? `${rgb(stroke)} RG ` : "";
    this.page.commands.push(`q ${rgb(fill)} rg ${strokeColor}${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${operation} Q`);
  }

  rule(top: number, color = "D9E4DF") {
    const y = PAGE_HEIGHT - top;
    this.page.commands.push(`q ${rgb(color)} RG 0.8 w ${LEFT} ${y.toFixed(2)} m ${(PAGE_WIDTH - LEFT).toFixed(2)} ${y.toFixed(2)} l S Q`);
  }

  cover(document: PdfDocumentInput, project: PdfProjectInput, first: boolean) {
    if (!first) this.addPage();
    this.drawText("창업 실행 캔버스", LEFT, 70, { size: 11, color: "0B7254", bold: true });
    this.drawText(document.title, LEFT, 145, { size: 28, color: "18342A", width: CONTENT_WIDTH, bold: true, lineHeight: 38 });
    this.drawText(document.type, LEFT, 225, { size: 12, color: "65766F", width: CONTENT_WIDTH });
    this.rule(265);
    const details = [
      ["프로젝트", project.title], ["목표 고객", project.customer], ["수익 방식", project.model],
      ["문서 버전", document.versionLabel], ["생성일", new Date(project.generatedAt).toLocaleDateString("ko-KR")],
    ];
    details.forEach(([label, value], index) => {
      const top = 300 + index * 35;
      this.drawText(label, LEFT, top, { size: 8, color: "65766F", width: 76 });
      this.drawText(value, 140, top - 1, { size: 10, color: "263D34", width: PAGE_WIDTH - 194, bold: index === 0 });
    });
    this.rect(LEFT, 500, CONTENT_WIDTH, 66, "FFF5D6");
    this.drawText(project.sample ? "이 문서는 화면 검증용 가상 사례입니다. 실제 사업 판단에는 사용할 수 없습니다." : "확정 표시가 없는 시장 수치와 가정은 인터뷰, 계약서, 견적서 또는 공식 자료로 다시 확인해야 합니다.", 70, 516, { size: 9, color: "6B5D2A", width: CONTENT_WIDTH - 32, lineHeight: 14 });
    this.addPage();
  }

  blocks(document: PdfDocumentInput) {
    const tokens = marked.lexer(document.markdown, { gfm: true });
    let skippedTitle = false;
    for (const token of tokens) {
      if (token.type === "heading") {
        if (!skippedTitle && token.depth === 1) { skippedTitle = true; continue; }
        const size = token.depth <= 2 ? 17 : token.depth === 3 ? 13 : 11;
        this.ensure(size * 3);
        this.page.cursor += token.depth <= 2 ? 12 : 7;
        this.text(inlineText(token.tokens, token.text), { size, color: token.depth <= 2 ? "18342A" : "0B7254", bold: true, gap: 8 });
        continue;
      }
      if (token.type === "paragraph") {
        this.text(inlineText(token.tokens, token.text));
        continue;
      }
      if (token.type === "blockquote") {
        const text = inlineText(token.tokens, token.text);
        const lines = this.wrap(text, CONTENT_WIDTH - 32, 9);
        const height = Math.max(38, lines.length * 14 + 20);
        this.ensure(height + 10);
        const top = this.page.cursor;
        this.rect(LEFT, top, CONTENT_WIDTH, height, "FFF5D6");
        this.rect(LEFT, top, 4, height, "D9B949");
        this.drawText(text, 70, top + 9, { size: 9, color: "6B5D2A", width: CONTENT_WIDTH - 32, lineHeight: 14 });
        this.page.cursor += height + 10;
        continue;
      }
      if (token.type === "list") {
        const list = token as Tokens.List;
        list.items.forEach((item, index) => this.text(`${list.ordered ? `${index + 1}.` : "·"} ${inlineText(item.tokens, item.text)}`, { indent: 12, gap: 5 }));
        this.page.cursor += 3;
        continue;
      }
      if (token.type === "table") {
        this.table(token as Tokens.Table);
        continue;
      }
      if (token.type === "hr") {
        this.ensure(24);
        this.page.cursor += 8;
        this.rule(this.page.cursor);
        this.page.cursor += 14;
        continue;
      }
      if (token.type === "code") this.text(token.text, { size: 8, color: "45544E", indent: 12 });
    }
  }

  private table(token: Tokens.Table) {
    const rows = [token.header, ...token.rows];
    const columnWidth = CONTENT_WIDTH / Math.max(1, token.header.length);
    rows.forEach((row, rowIndex) => {
      const values = row.map((cell) => inlineText(cell.tokens, cell.text));
      const lineCounts = values.map((value) => this.wrap(value, columnWidth - 12, rowIndex === 0 ? 8.2 : 7.7).length);
      const height = Math.max(28, Math.max(...lineCounts) * 12 + 12);
      this.ensure(height + 3);
      const top = this.page.cursor;
      values.forEach((value, columnIndex) => {
        const x = LEFT + columnIndex * columnWidth;
        this.rect(x, top, columnWidth, height, rowIndex === 0 ? "EFF7F3" : "FFFFFF", "D9E4DF");
        this.drawText(value, x + 6, top + 5, { size: rowIndex === 0 ? 8.2 : 7.7, color: "263D34", width: columnWidth - 12, lineHeight: 12, bold: rowIndex === 0 });
      });
      this.page.cursor += height;
    });
    this.page.cursor += 12;
  }

  addFooters(projectTitle: string) {
    this.pages.forEach((page, index) => {
      const previous = this.page;
      this.page = page;
      const pageText = `${index + 1} / ${this.pages.length}`;
      this.drawText(projectTitle, LEFT, 28, { size: 7.5, color: "718078", width: CONTENT_WIDTH });
      const pageWidth = this.textWidth(pageText, 7.5);
      this.drawText(pageText, PAGE_WIDTH - LEFT - pageWidth, PAGE_HEIGHT - 39, { size: 7.5, color: "718078", width: pageWidth + 2 });
      this.page = previous;
    });
  }
}

function stream(dictionary: string, data: Buffer) {
  return Buffer.concat([Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`, "ascii"), data, Buffer.from("\nendstream", "ascii")]);
}

function toUnicodeCmap(unicodeByGlyph: Map<number, number>) {
  const entries = [...unicodeByGlyph.entries()].sort((left, right) => left[0] - right[0]);
  const chunks: string[] = [];
  for (let index = 0; index < entries.length; index += 100) {
    const group = entries.slice(index, index + 100);
    chunks.push(`${group.length} beginbfchar\n${group.map(([glyph, codePoint]) => `<${glyph.toString(16).padStart(4, "0").toUpperCase()}> <${utf16Hex(codePoint)}>`).join("\n")}\nendbfchar`);
  }
  return Buffer.from(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /TodayStartupUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`, "ascii");
}

class PdfObjects {
  private readonly values: Buffer[] = [];

  reserve() {
    this.values.push(Buffer.alloc(0));
    return this.values.length;
  }

  add(value: string | Buffer) {
    const id = this.reserve();
    this.set(id, value);
    return id;
  }

  set(id: number, value: string | Buffer) {
    this.values[id - 1] = typeof value === "string" ? Buffer.from(value, "ascii") : value;
  }

  build(rootId: number) {
    const parts = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary")];
    const offsets = [0];
    let length = parts[0].length;
    this.values.forEach((value, index) => {
      offsets.push(length);
      const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, "ascii"), value, Buffer.from("\nendobj\n", "ascii")]);
      parts.push(object);
      length += object.length;
    });
    const xref = length;
    const lines = [`xref`, `0 ${this.values.length + 1}`, "0000000000 65535 f "];
    offsets.slice(1).forEach((offset) => lines.push(`${offset.toString().padStart(10, "0")} 00000 n `));
    lines.push(`trailer`, `<< /Size ${this.values.length + 1} /Root ${rootId} 0 R >>`, `startxref`, String(xref), `%%EOF`);
    parts.push(Buffer.from(`${lines.join("\n")}\n`, "ascii"));
    return Buffer.concat(parts);
  }
}

export function renderLightweightPdf(documents: PdfDocumentInput[], project: PdfProjectInput, fontBytes: Buffer | Uint8Array) {
  const font = new TrueTypeFont(Buffer.from(fontBytes));
  const layout = new PdfLayout(font);
  documents.forEach((document, index) => {
    layout.cover(document, project, index === 0);
    layout.blocks(document);
  });
  layout.addFooters(project.title);

  const objects = new PdfObjects();
  const catalogId = objects.reserve();
  const pagesId = objects.reserve();
  const fontFileId = objects.add(stream(`/Length1 ${font.data.length}`, font.data));
  const descriptorId = objects.add(`<< /Type /FontDescriptor /FontName /NanumGothic /Flags 32 /FontBBox [${font.bbox.map((value) => font.pdfMetric(value)).join(" ")}] /ItalicAngle 0 /Ascent ${font.pdfMetric(font.ascent)} /Descent ${font.pdfMetric(font.descent)} /CapHeight ${font.pdfMetric(font.ascent)} /StemV 80 /FontFile2 ${fontFileId} 0 R >>`);
  const usedGlyphs = [...layout.unicodeByGlyph.keys()].sort((left, right) => left - right);
  const widths = usedGlyphs.map((glyph) => `${glyph} [${font.pdfMetric(font.width(glyph))}]`).join(" ");
  const cidFontId = objects.add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NanumGothic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`);
  const unicodeId = objects.add(stream("", toUnicodeCmap(layout.unicodeByGlyph)));
  const fontId = objects.add(`<< /Type /Font /Subtype /Type0 /BaseFont /NanumGothic /Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] /ToUnicode ${unicodeId} 0 R >>`);
  const pageIds: number[] = [];
  layout.pages.forEach((page) => {
    const content = Buffer.from(page.commands.join("\n"), "ascii");
    const contentId = objects.add(stream("", content));
    pageIds.push(objects.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });
  objects.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  objects.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  return objects.build(catalogId);
}
