// Retain-GID sparse-glyf TrueType subsetter.
//
// Glyph outlines are copied byte-for-byte from the original font; only the glyf
// and loca tables are rebuilt (keeping the original glyph count and glyph IDs)
// so that unused glyphs become empty. Because glyph IDs are unchanged, a PDF
// using Identity-H + /CIDToGIDMap /Identity and content streams that reference
// original GIDs stays valid without any remapping, and Word can still map
// characters through the (unchanged) cmap.
//
// The subsetter returns null on anything unexpected so callers fall back to the
// full font — it never emits a subset that silently drops a needed glyph.

const DROP_TABLES = new Set(["DSIG", "GSUB", "GPOS", "GDEF", "BASE", "JSTF"]);

type Cmap12Group = { start: number; end: number; glyph: number };

/** Maps each unique code point in `text` to its glyph ID via the font's cmap. */
export function glyphIdsForText(fontBytes: Buffer | Uint8Array, text: string): number[] {
  try {
    const buf = Buffer.isBuffer(fontBytes) ? fontBytes : Buffer.from(fontBytes);
    const dir = readDirectory(buf);
    const cmapRec = dir.get("cmap");
    if (!cmapRec) return [];
    const cmap = cmapRec.offset;
    const count = buf.readUInt16BE(cmap + 2);
    let format12: number | null = null;
    let format4: number | null = null;
    for (let index = 0; index < count; index += 1) {
      const record = cmap + 4 + index * 8;
      const platform = buf.readUInt16BE(record);
      const encoding = buf.readUInt16BE(record + 2);
      const subtable = cmap + buf.readUInt32BE(record + 4);
      const format = buf.readUInt16BE(subtable);
      if (format === 12 && (platform === 0 || (platform === 3 && encoding === 10))) format12 = subtable;
      if (format === 4 && (platform === 0 || platform === 3)) format4 = subtable;
    }
    const groups: Cmap12Group[] = [];
    if (format12 !== null) {
      const groupCount = buf.readUInt32BE(format12 + 12);
      for (let index = 0; index < groupCount; index += 1) {
        const offset = format12 + 16 + index * 12;
        groups.push({ start: buf.readUInt32BE(offset), end: buf.readUInt32BE(offset + 4), glyph: buf.readUInt32BE(offset + 8) });
      }
    }
    const lookup = (codePoint: number): number => {
      let low = 0;
      let high = groups.length - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const group = groups[middle];
        if (codePoint < group.start) high = middle - 1;
        else if (codePoint > group.end) low = middle + 1;
        else return group.glyph + codePoint - group.start;
      }
      if (format4 === null || codePoint > 0xffff) return 0;
      const segments = buf.readUInt16BE(format4 + 6) / 2;
      const endCodes = format4 + 14;
      const startCodes = endCodes + segments * 2 + 2;
      const deltas = startCodes + segments * 2;
      const ranges = deltas + segments * 2;
      for (let index = 0; index < segments; index += 1) {
        if (codePoint > buf.readUInt16BE(endCodes + index * 2)) continue;
        const start = buf.readUInt16BE(startCodes + index * 2);
        if (codePoint < start) return 0;
        const delta = buf.readInt16BE(deltas + index * 2);
        const range = buf.readUInt16BE(ranges + index * 2);
        if (range === 0) return (codePoint + delta) & 0xffff;
        const glyphOffset = ranges + index * 2 + range + (codePoint - start) * 2;
        const glyph = buf.readUInt16BE(glyphOffset);
        return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
      }
      return 0;
    };
    const ids = new Set<number>();
    for (const char of text) {
      const codePoint = char.codePointAt(0);
      if (codePoint === undefined) continue;
      const glyph = lookup(codePoint);
      if (glyph > 0) ids.add(glyph);
    }
    return [...ids];
  } catch {
    return [];
  }
}

function readDirectory(buf: Buffer) {
  const numTables = buf.readUInt16BE(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    const tag = buf.toString("ascii", record, record + 4);
    tables.set(tag, { offset: buf.readUInt32BE(record + 8), length: buf.readUInt32BE(record + 12) });
  }
  return tables;
}

function readLoca(buf: Buffer, offset: number, numGlyphs: number, longFormat: boolean): number[] {
  const loca: number[] = new Array(numGlyphs + 1);
  for (let index = 0; index <= numGlyphs; index += 1) {
    loca[index] = longFormat ? buf.readUInt32BE(offset + index * 4) : buf.readUInt16BE(offset + index * 2) * 2;
  }
  return loca;
}

// Glyph IDs referenced by a composite glyph (so components are never dropped).
function compositeComponents(buf: Buffer, glyphStart: number): number[] {
  const numberOfContours = buf.readInt16BE(glyphStart);
  if (numberOfContours >= 0) return [];
  const components: number[] = [];
  let pointer = glyphStart + 10; // numberOfContours(2) + bbox(8)
  const ARG_1_AND_2_ARE_WORDS = 0x0001;
  const WE_HAVE_A_SCALE = 0x0008;
  const MORE_COMPONENTS = 0x0020;
  const WE_HAVE_AN_XY_SCALE = 0x0040;
  const WE_HAVE_A_TWO_BY_TWO = 0x0080;
  for (let guard = 0; guard < 4096; guard += 1) {
    const flags = buf.readUInt16BE(pointer);
    components.push(buf.readUInt16BE(pointer + 2));
    pointer += 4;
    pointer += flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2;
    if (flags & WE_HAVE_A_TWO_BY_TWO) pointer += 8;
    else if (flags & WE_HAVE_AN_XY_SCALE) pointer += 4;
    else if (flags & WE_HAVE_A_SCALE) pointer += 2;
    if (!(flags & MORE_COMPONENTS)) break;
  }
  return components;
}

function tableChecksum(table: Buffer): number {
  let sum = 0;
  for (let index = 0; index < table.length; index += 4) {
    sum = (sum + table.readUInt32BE(index)) >>> 0;
  }
  return sum >>> 0;
}

function pad4(buf: Buffer): Buffer {
  const remainder = buf.length % 4;
  return remainder === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - remainder)]);
}

/**
 * Returns a subset TrueType font keeping only `usedGlyphIds` (plus .notdef and
 * transitive composite components), or null if subsetting isn't safely possible
 * (non-glyf/CFF font, malformed tables, or any error).
 */
export function subsetTrueType(fontBytes: Buffer | Uint8Array, usedGlyphIds: Iterable<number>): Buffer | null {
  try {
    const buf = Buffer.isBuffer(fontBytes) ? fontBytes : Buffer.from(fontBytes);
    const dir = readDirectory(buf);
    const head = dir.get("head");
    const maxp = dir.get("maxp");
    const locaRec = dir.get("loca");
    const glyfRec = dir.get("glyf");
    if (!head || !maxp || !locaRec || !glyfRec) return null; // e.g. CFF/OTF — cannot subset here

    const numGlyphs = buf.readUInt16BE(maxp.offset + 4);
    const longLoca = buf.readInt16BE(head.offset + 50) === 1;
    const loca = readLoca(buf, locaRec.offset, numGlyphs, longLoca);

    // Include .notdef + requested glyphs + transitive composite components.
    const include = new Set<number>([0]);
    const stack: number[] = [];
    const request = (glyph: number) => {
      if (glyph >= 0 && glyph < numGlyphs && !include.has(glyph)) {
        include.add(glyph);
        stack.push(glyph);
      }
    };
    for (const glyph of usedGlyphIds) request(glyph);
    while (stack.length) {
      const glyph = stack.pop() as number;
      const start = glyfRec.offset + loca[glyph];
      const end = glyfRec.offset + loca[glyph + 1];
      if (end > start) {
        for (const component of compositeComponents(buf, start)) request(component);
      }
    }

    // Rebuild glyf (only included glyphs, in GID order) + long-format loca.
    const glyfParts: Buffer[] = [];
    const newLoca = new Array<number>(numGlyphs + 1);
    let cursor = 0;
    for (let glyph = 0; glyph < numGlyphs; glyph += 1) {
      newLoca[glyph] = cursor;
      if (include.has(glyph)) {
        const start = glyfRec.offset + loca[glyph];
        const end = glyfRec.offset + loca[glyph + 1];
        if (end > start) {
          const padded = pad4(buf.subarray(start, end));
          glyfParts.push(padded);
          cursor += padded.length;
        }
      }
    }
    newLoca[numGlyphs] = cursor;
    const newGlyf = Buffer.concat(glyfParts);
    const newLocaBuf = Buffer.alloc((numGlyphs + 1) * 4);
    for (let index = 0; index <= numGlyphs; index += 1) newLocaBuf.writeUInt32BE(newLoca[index] >>> 0, index * 4);

    // Assemble the output tables: copy everything except rebuilt/dropped tables.
    const output = new Map<string, Buffer>();
    for (const [tag, record] of dir) {
      if (DROP_TABLES.has(tag) || tag === "glyf" || tag === "loca") continue;
      output.set(tag, Buffer.from(buf.subarray(record.offset, record.offset + record.length)));
    }
    // head: force long loca format and clear checkSumAdjustment before recompute.
    const headBuf = Buffer.from(output.get("head") as Buffer);
    headBuf.writeUInt32BE(0, 8); // checkSumAdjustment = 0
    headBuf.writeInt16BE(1, 50); // indexToLocFormat = long
    output.set("head", headBuf);
    output.set("glyf", newGlyf);
    output.set("loca", newLocaBuf);

    // Build sfnt: sorted tag order, 4-byte aligned tables, correct offsets/checksums.
    const tags = [...output.keys()].sort();
    const numTables = tags.length;
    const headerSize = 12 + numTables * 16;
    let offset = headerSize;
    const layout = tags.map((tag) => {
      const raw = output.get(tag) as Buffer;
      const entry = { tag, raw, length: raw.length, offset, checksum: tableChecksum(pad4(raw)) };
      offset += pad4(raw).length;
      return entry;
    });

    const header = Buffer.alloc(headerSize);
    header.writeUInt32BE(buf.readUInt32BE(0), 0); // sfntVersion (0x00010000)
    header.writeUInt16BE(numTables, 4);
    const maxPow = Math.floor(Math.log2(numTables));
    const searchRange = 16 * 2 ** maxPow;
    header.writeUInt16BE(searchRange, 6);
    header.writeUInt16BE(maxPow, 8);
    header.writeUInt16BE(numTables * 16 - searchRange, 10);
    layout.forEach((entry, index) => {
      const record = 12 + index * 16;
      header.write(entry.tag, record, 4, "ascii");
      header.writeUInt32BE(entry.checksum >>> 0, record + 4);
      header.writeUInt32BE(entry.offset, record + 8);
      header.writeUInt32BE(entry.length, record + 12);
    });

    const parts: Buffer[] = [header];
    for (const entry of layout) parts.push(pad4(entry.raw));
    const file = Buffer.concat(parts);

    // checkSumAdjustment = 0xB1B0AFBA - checksum(whole file); written into head.
    const headEntry = layout.find((entry) => entry.tag === "head");
    if (headEntry) {
      const adjustment = (0xb1b0afba - tableChecksum(file)) >>> 0;
      file.writeUInt32BE(adjustment, headEntry.offset + 8);
    }

    // Coverage guarantee: every requested glyph must have a non-empty outline,
    // unless it was empty in the original too (e.g. space). Otherwise bail out.
    for (const glyph of include) {
      const hadOutline = loca[glyph + 1] > loca[glyph];
      const keptOutline = newLoca[glyph + 1] > newLoca[glyph];
      if (hadOutline && !keptOutline) return null;
    }
    return file;
  } catch {
    return null;
  }
}
