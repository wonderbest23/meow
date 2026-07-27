import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { subsetTrueType, glyphIdsForText } from "../lib/delivery/font-subset";

function directory(buf: Buffer) {
  const numTables = buf.readUInt16BE(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    tables.set(buf.toString("ascii", record, record + 4), {
      offset: buf.readUInt32BE(record + 8),
      length: buf.readUInt32BE(record + 12),
    });
  }
  return tables;
}

function readLoca(buf: Buffer, tables: Map<string, { offset: number; length: number }>) {
  const head = tables.get("head")!;
  const maxp = tables.get("maxp")!;
  const loca = tables.get("loca")!;
  const numGlyphs = buf.readUInt16BE(maxp.offset + 4);
  const long = buf.readInt16BE(head.offset + 50) === 1;
  const offsets: number[] = [];
  for (let index = 0; index <= numGlyphs; index += 1) {
    offsets.push(long ? buf.readUInt32BE(loca.offset + index * 4) : buf.readUInt16BE(loca.offset + index * 2) * 2);
  }
  return { numGlyphs, offsets, glyfBase: tables.get("glyf")!.offset };
}

async function main() {
  const font = readFileSync(path.join(process.cwd(), "public", "fonts", "NanumGothic-Regular.ttf"));
  const text = "오늘창업 사업계획서 발표자료 12개월 손익계산서 · 반려동물 사진 달력 판매 ABCdef 2026년";

  const gids = glyphIdsForText(font, text);
  assert.ok(gids.length > 10, `텍스트에서 글리프를 찾아야 합니다 (found ${gids.length})`);

  const subset = subsetTrueType(font, gids);
  assert.ok(subset, "서브셋 생성이 성공해야 합니다");
  const sub = subset as Buffer;

  // 1) 크기: glyf 테이블이 대폭 줄어야 한다.
  const origDir = directory(font);
  const subDir = directory(sub);
  const origGlyf = origDir.get("glyf")!.length;
  const subGlyf = subDir.get("glyf")!.length;
  assert.ok(subGlyf < origGlyf * 0.1, `glyf가 원본의 10% 미만이어야 합니다 (${subGlyf}/${origGlyf})`);
  assert.ok(sub.length < font.length * 0.5, `전체 서브셋이 원본의 절반 미만이어야 합니다 (${sub.length}/${font.length})`);

  // 2) 구조: 필수 테이블 유지, 레이아웃/서명 테이블 제거, 글리프 수 동일.
  for (const tag of ["head", "maxp", "loca", "glyf", "cmap", "hmtx", "hhea"]) {
    assert.ok(subDir.has(tag), `${tag} 테이블은 유지돼야 합니다`);
  }
  for (const tag of ["DSIG", "GSUB", "GPOS"]) {
    if (origDir.has(tag)) assert.ok(!subDir.has(tag), `${tag}는 제거돼야 합니다`);
  }
  assert.equal(sub.readUInt16BE(subDir.get("maxp")!.offset + 4), font.readUInt16BE(origDir.get("maxp")!.offset + 4), "글리프 수(GID)는 유지돼야 합니다");
  assert.equal(sub.readInt16BE(subDir.get("head")!.offset + 50), 1, "loca는 long 포맷이어야 합니다");

  // 3) 커버리지 + 바이트 동일성: 요청 글리프의 외곽선이 원본과 100% 동일해야 한다.
  const orig = readLoca(font, origDir);
  const subl = readLoca(sub, subDir);
  let checked = 0;
  for (const gid of gids) {
    const origLen = orig.offsets[gid + 1] - orig.offsets[gid];
    if (origLen <= 0) continue; // 공백 등 외곽선 없는 글리프
    const subLen = subl.offsets[gid + 1] - subl.offsets[gid];
    assert.ok(subLen >= origLen, `GID ${gid} 외곽선이 서브셋에 있어야 합니다`);
    const a = font.subarray(orig.glyfBase + orig.offsets[gid], orig.glyfBase + orig.offsets[gid] + origLen);
    const b = sub.subarray(subl.glyfBase + subl.offsets[gid], subl.glyfBase + subl.offsets[gid] + origLen);
    assert.ok(a.equals(b), `GID ${gid} 외곽선 바이트가 원본과 동일해야 합니다(무손상)`);
    checked += 1;
  }
  assert.ok(checked > 5, "여러 글리프의 바이트 동일성을 확인해야 합니다");

  // 4) 잘못된 입력 → null(폴백).
  assert.equal(subsetTrueType(Buffer.from("not a font"), [1, 2, 3]), null, "비폰트 입력은 null이어야 합니다");

  console.log(`font-subset.test.ts passed · glyf ${(origGlyf / 1048576).toFixed(2)}MB → ${(subGlyf / 1024).toFixed(0)}KB · 전체 ${(font.length / 1048576).toFixed(2)}MB → ${(sub.length / 1024).toFixed(0)}KB · 글리프 ${checked}개 무손상 확인`);
}

void main();
