import { deflateSync } from "node:zlib";

/*
 * 사진이 없는 홈페이지의 카드 그림(1200×630 PNG)을 직접 그린다 — 가게 이름과 한 줄 소개.
 *
 * 왜 직접 그리나(2026-11-20): 그림 도구(next/og)를 넣으면 서버 묶음이 gzip 10,218KiB → 11,097KiB 로 늘어
 * Cloudflare 한도(10MB)를 넘겨 배포가 막힌다. 여기서는 계획서 PDF 와 같은 글꼴 파일(TrueType)의 글자 윤곽을 읽어
 * 칠하고 PNG 로 묶는다 — 묶음에 더해지는 것은 이 파일뿐이다.
 *
 * 글꼴에 없는 글자(이모지 등)는 건너뛴다. 굵은 글꼴 파일이 없어 이름은 살짝 겹쳐 그려 굵게 보이게 한다.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export type ShareCardInk = { name: string; tagline: string; ink: string; accent: string; paper: string };

type Point = { x: number; y: number; on: boolean };

class OutlineFont {
  private readonly view: DataView;
  private readonly tables = new Map<string, number>();
  readonly unitsPerEm: number;
  private readonly glyphCount: number;
  private readonly longLoca: boolean;
  private readonly longMetrics: number;
  private readonly cmap12: number | null = null;
  private readonly cmap4: number | null = null;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = this.view.getUint16(4);
    for (let index = 0; index < count; index += 1) {
      const record = 12 + index * 16;
      const tag = String.fromCharCode(...[0, 1, 2, 3].map(i => this.view.getUint8(record + i)));
      this.tables.set(tag, this.view.getUint32(record + 8));
    }
    const head = this.table("head");
    this.unitsPerEm = this.view.getUint16(head + 18);
    this.longLoca = this.view.getInt16(head + 50) === 1;
    this.glyphCount = this.view.getUint16(this.table("maxp") + 4);
    this.longMetrics = this.view.getUint16(this.table("hhea") + 34);
    const cmap = this.table("cmap");
    const subtables = this.view.getUint16(cmap + 2);
    for (let index = 0; index < subtables; index += 1) {
      const record = cmap + 4 + index * 8;
      const platform = this.view.getUint16(record);
      const encoding = this.view.getUint16(record + 2);
      const offset = cmap + this.view.getUint32(record + 4);
      const format = this.view.getUint16(offset);
      if (format === 12 && (platform === 0 || (platform === 3 && encoding === 10))) this.cmap12 = offset;
      if (format === 4 && (platform === 0 || platform === 3)) this.cmap4 = offset;
    }
  }

  private table(tag: string): number {
    const offset = this.tables.get(tag);
    if (offset === undefined) throw new Error(`SHARE_CARD_FONT_TABLE_MISSING:${tag}`);
    return offset;
  }

  glyph(codePoint: number): number {
    const v = this.view;
    if (this.cmap12 !== null) {
      let low = 0;
      let high = v.getUint32(this.cmap12 + 12) - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const group = this.cmap12 + 16 + middle * 12;
        if (codePoint < v.getUint32(group)) high = middle - 1;
        else if (codePoint > v.getUint32(group + 4)) low = middle + 1;
        else return v.getUint32(group + 8) + codePoint - v.getUint32(group);
      }
    }
    if (this.cmap4 === null || codePoint > 0xffff) return 0;
    const segments = v.getUint16(this.cmap4 + 6) / 2;
    const ends = this.cmap4 + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let index = 0; index < segments; index += 1) {
      if (codePoint > v.getUint16(ends + index * 2)) continue;
      const start = v.getUint16(starts + index * 2);
      if (codePoint < start) return 0;
      const delta = v.getInt16(deltas + index * 2);
      const range = v.getUint16(ranges + index * 2);
      if (range === 0) return (codePoint + delta) & 0xffff;
      const at = ranges + index * 2 + range + (codePoint - start) * 2;
      if (at + 2 > v.byteLength) return 0;
      const glyph = v.getUint16(at);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  }

  advance(glyph: number): number {
    return this.view.getUint16(this.table("hmtx") + Math.min(glyph, this.longMetrics - 1) * 4);
  }

  /** 글자 윤곽(글꼴 단위, y 는 위가 +). 합쳐 만든 글자(composite)는 조각을 옮겨 붙인다 */
  contours(glyph: number, depth = 0): Point[][] {
    if (glyph < 0 || glyph >= this.glyphCount || depth > 6) return [];
    const v = this.view;
    const loca = this.table("loca");
    const read = (index: number) => this.longLoca ? v.getUint32(loca + index * 4) : v.getUint16(loca + index * 2) * 2;
    const start = this.table("glyf") + read(glyph);
    const end = this.table("glyf") + read(glyph + 1);
    if (end <= start) return [];
    const contourCount = v.getInt16(start);
    if (contourCount < 0) {
      const out: Point[][] = [];
      let at = start + 10;
      for (;;) {
        const flags = v.getUint16(at);
        const component = v.getUint16(at + 2);
        at += 4;
        let dx = 0;
        let dy = 0;
        if (flags & 1) { if (flags & 2) { dx = v.getInt16(at); dy = v.getInt16(at + 2); } at += 4; }
        else { if (flags & 2) { dx = v.getInt8(at); dy = v.getInt8(at + 1); } at += 2; }
        let a = 1, b = 0, c = 0, d = 1;
        const fixed = (offset: number) => v.getInt16(offset) / 16384;
        if (flags & 8) { a = d = fixed(at); at += 2; }
        else if (flags & 0x40) { a = fixed(at); d = fixed(at + 2); at += 4; }
        else if (flags & 0x80) { a = fixed(at); b = fixed(at + 2); c = fixed(at + 4); d = fixed(at + 6); at += 8; }
        for (const contour of this.contours(component, depth + 1)) out.push(contour.map(p => ({ x: a * p.x + c * p.y + dx, y: b * p.x + d * p.y + dy, on: p.on })));
        if (!(flags & 0x20)) break;
      }
      return out;
    }
    const ends: number[] = [];
    for (let index = 0; index < contourCount; index += 1) ends.push(v.getUint16(start + 10 + index * 2));
    const pointCount = contourCount ? ends[contourCount - 1] + 1 : 0;
    let at = start + 10 + contourCount * 2;
    at += 2 + v.getUint16(at);
    const flags: number[] = [];
    while (flags.length < pointCount) {
      const flag = v.getUint8(at++);
      flags.push(flag);
      if (flag & 8) { let repeat = v.getUint8(at++); while (repeat-- > 0 && flags.length < pointCount) flags.push(flag); }
    }
    const coords = (short: number, same: number) => {
      const values: number[] = [];
      let value = 0;
      for (const flag of flags) {
        if (flag & short) { const delta = v.getUint8(at++); value += flag & same ? delta : -delta; }
        else if (!(flag & same)) { value += v.getInt16(at); at += 2; }
        values.push(value);
      }
      return values;
    };
    const xs = coords(2, 16);
    const ys = coords(4, 32);
    const out: Point[][] = [];
    let first = 0;
    for (const last of ends) {
      const contour: Point[] = [];
      for (let index = first; index <= last; index += 1) contour.push({ x: xs[index], y: ys[index], on: (flags[index] & 1) === 1 });
      out.push(contour);
      first = last + 1;
    }
    return out;
  }
}

/** 윤곽(곡선 포함)을 짧은 선분으로 — [x0, y0, x1, y1] */
function flatten(contour: Point[], toX: (x: number) => number, toY: (y: number) => number, edges: number[]) {
  if (contour.length < 2) return;
  const mid = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, on: true });
  const count = contour.length;
  let startIndex = contour.findIndex(p => p.on);
  let start: Point;
  if (startIndex < 0) { start = mid(contour[count - 1], contour[0]); startIndex = -1; } else start = contour[startIndex];
  let px = toX(start.x);
  let py = toY(start.y);
  const line = (x: number, y: number) => { if (y !== py) edges.push(px, py, x, y); px = x; py = y; };
  let control: Point | null = null;
  const curve = (ctrl: Point, to: Point) => {
    const x0 = px, y0 = py, cx = toX(ctrl.x), cy = toY(ctrl.y), x1 = toX(to.x), y1 = toY(to.y);
    for (let step = 1; step <= 8; step += 1) {
      const t = step / 8, u = 1 - t;
      line(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1);
    }
  };
  for (let offset = 1; offset <= count; offset += 1) {
    const point = offset === count && startIndex < 0 ? start : contour[(startIndex + offset + count) % count];
    if (point.on) {
      if (control) { curve(control, point); control = null; } else line(toX(point.x), toY(point.y));
    } else {
      if (control) curve(control, mid(control, point));
      control = point;
    }
  }
  if (control) curve(control, start);
}

const hex = (color: string): [number, number, number] => {
  const value = /^#[0-9a-fA-F]{6}$/.test(color) ? color.slice(1) : "1c1c1c";
  return [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16)) as [number, number, number];
};

class Canvas {
  readonly pixels = new Uint8Array(CARD_WIDTH * CARD_HEIGHT * 3);

  fill(x: number, y: number, width: number, height: number, color: [number, number, number]) {
    for (let row = Math.max(0, y); row < Math.min(CARD_HEIGHT, y + height); row += 1) {
      for (let column = Math.max(0, x); column < Math.min(CARD_WIDTH, x + width); column += 1) this.pixels.set(color, (row * CARD_WIDTH + column) * 3);
    }
  }

  /** 선분으로 둘러싼 모양을 칠한다(세로 4배 촘촘히, 가로는 걸친 만큼) */
  paint(edges: number[], color: [number, number, number], opacity: number) {
    if (!edges.length) return;
    let top = Infinity, bottom = -Infinity;
    for (let index = 0; index < edges.length; index += 4) { top = Math.min(top, edges[index + 1], edges[index + 3]); bottom = Math.max(bottom, edges[index + 1], edges[index + 3]); }
    const firstRow = Math.max(0, Math.floor(top));
    const lastRow = Math.min(CARD_HEIGHT - 1, Math.ceil(bottom));
    const SUB = 4;
    const coverage = new Float32Array(CARD_WIDTH);
    for (let row = firstRow; row <= lastRow; row += 1) {
      coverage.fill(0);
      let touched = false;
      for (let sub = 0; sub < SUB; sub += 1) {
        const y = row + (sub + 0.5) / SUB;
        const crossings: Array<[number, number]> = [];
        for (let index = 0; index < edges.length; index += 4) {
          const y0 = edges[index + 1], y1 = edges[index + 3];
          if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) crossings.push([edges[index] + (y - y0) / (y1 - y0) * (edges[index + 2] - edges[index]), y1 > y0 ? 1 : -1]);
        }
        if (crossings.length < 2) continue;
        crossings.sort((a, b) => a[0] - b[0]);
        let winding = 0;
        for (let index = 0; index < crossings.length - 1; index += 1) {
          winding += crossings[index][1];
          if (winding === 0) continue;
          const from = Math.max(0, crossings[index][0]);
          const to = Math.min(CARD_WIDTH, crossings[index + 1][0]);
          if (to <= from) continue;
          touched = true;
          for (let column = Math.floor(from); column < Math.ceil(to); column += 1) coverage[column] += (Math.min(to, column + 1) - Math.max(from, column)) / SUB;
        }
      }
      if (!touched) continue;
      for (let column = 0; column < CARD_WIDTH; column += 1) {
        const alpha = Math.min(1, coverage[column]) * opacity;
        if (alpha <= 0) continue;
        const at = (row * CARD_WIDTH + column) * 3;
        for (let channel = 0; channel < 3; channel += 1) this.pixels[at + channel] = Math.round(this.pixels[at + channel] * (1 - alpha) + color[channel] * alpha);
      }
    }
  }
}

function textWidth(font: OutlineFont, text: string, size: number): number {
  let width = 0;
  for (const ch of text) { const glyph = font.glyph(ch.codePointAt(0) ?? 32); if (glyph || ch === " ") width += font.advance(glyph || font.glyph(32)); }
  return width * size / font.unitsPerEm;
}

/** 낱말 단위로 줄을 나눈다(한 낱말이 줄보다 길면 글자 단위). 줄 수를 넘으면 마지막 줄 끝에 … */
export function wrapCardText(measure: (text: string) => number, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  const push = (piece: string) => {
    const joined = current ? `${current} ${piece}` : piece;
    if (measure(joined) <= maxWidth) { current = joined; return; }
    if (current) { lines.push(current); current = ""; }
    if (measure(piece) <= maxWidth) { current = piece; return; }
    for (const ch of piece) {
      if (measure(current + ch) > maxWidth && current) { lines.push(current); current = ""; }
      current += ch;
    }
  };
  for (const word of text.split(/\s+/).filter(Boolean)) push(word);
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(`${last}…`) > maxWidth) last = [...last].slice(0, -1).join("");
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

function drawLine(canvas: Canvas, font: OutlineFont, text: string, x: number, baseline: number, size: number, color: [number, number, number], opacity: number, bold: boolean) {
  const scale = size / font.unitsPerEm;
  let pen = x;
  for (const ch of text) {
    const glyph = font.glyph(ch.codePointAt(0) ?? 32);
    if (!glyph && ch !== " ") continue;
    const id = glyph || font.glyph(32);
    const edges: number[] = [];
    for (const contour of font.contours(id)) flatten(contour, fx => pen + fx * scale, fy => baseline - fy * scale, edges);
    if (bold) {
      // 굵은 글꼴 파일이 없다 — 같은 글자를 조금 옮겨 한 번에 칠해(겹친 곳이 두 번 칠해지지 않게) 굵게 보이게 한다
      const shift = size * 0.022;
      const extra = edges.slice();
      for (let index = 0; index < extra.length; index += 4) { extra[index] += shift; extra[index + 2] += shift; }
      canvas.paint(edges.concat(extra), color, opacity);
    } else canvas.paint(edges, color, opacity);
    pen += font.advance(id) * scale;
  }
}

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (let index = 4; index < 8 + data.length; index += 1) crc = CRC[(crc ^ out[index]) & 0xff] ^ (crc >>> 8);
  view.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
  return out;
}

function encodePng(pixels: Uint8Array): Uint8Array {
  const stride = CARD_WIDTH * 3;
  const raw = new Uint8Array((stride + 1) * CARD_HEIGHT);
  for (let row = 0; row < CARD_HEIGHT; row += 1) raw.set(pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, CARD_WIDTH);
  view.setUint32(4, CARD_HEIGHT);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

export function renderShareCardPng(card: ShareCardInk, fontBytes: Uint8Array): Uint8Array {
  const font = new OutlineFont(fontBytes);
  const canvas = new Canvas();
  const paper = hex(card.paper), accent = hex(card.accent), ink = hex(card.ink);
  canvas.fill(0, 0, CARD_WIDTH, CARD_HEIGHT, paper);
  canvas.fill(0, 0, 36, CARD_HEIGHT, accent);
  const left = 120;
  const maxWidth = CARD_WIDTH - left - 96;
  // 이름은 한 줄에 들어가는 가장 큰 크기로, 그래도 넘치면 가장 작은 크기로 두 줄
  const nameSize = [112, 96, 80].find(size => textWidth(font, card.name, size) <= maxWidth) ?? 80;
  const nameLines = wrapCardText(text => textWidth(font, text, nameSize), card.name, maxWidth, 2);
  const tagSize = 44;
  const tagLines = card.tagline ? wrapCardText(text => textWidth(font, text, tagSize), card.tagline, maxWidth, 2) : [];
  const nameLeading = nameSize * 1.22;
  const tagLeading = tagSize * 1.45;
  const height = 12 + 48 + nameLines.length * nameLeading + (tagLines.length ? 28 + tagLines.length * tagLeading : 0);
  let y = Math.round((CARD_HEIGHT - height) / 2);
  canvas.fill(left, y, 96, 12, accent);
  y += 12 + 48;
  for (const line of nameLines) { drawLine(canvas, font, line, left, y + nameSize * 0.86, nameSize, ink, 1, true); y += nameLeading; }
  if (tagLines.length) {
    y += 28;
    for (const line of tagLines) { drawLine(canvas, font, line, left, y + tagSize * 0.86, tagSize, ink, 0.7, false); y += tagLeading; }
  }
  return encodePng(canvas.pixels);
}
