import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { renderPdf, renderDocx, type BusinessDocument, type DocumentProjectMeta } from "../lib/delivery/document-renderer";

/*
 * 공식 출처 URL 이 내보내기에서 살아남는지.
 *
 * 시장 근거를 붙여도 PDF·Word 에서 원문 주소가 사라지면 아무 의미가 없다.
 * Writer 는 섹션 끝 '참고 근거'를 [원문](URL) 형태로 쓰도록 지시받는데
 * (section-generator.ts formatEvidence), 이 마크다운 링크는 라벨과 주소가
 * 따로 있어서 렌더러가 라벨만 그리면 주소가 조용히 사라진다.
 */

const URL_ = "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B040A3";

const docs: BusinessDocument[] = [{
  id: "d1", title: "시장 근거", type: "사업계획서", versionLabel: "v1",
  markdown: [
    "## 시장 근거",
    "",
    "행정안전부 주민등록 인구현황(2026-07-31 기준) 총인구는 51,217,221명이다.",
    "",
    "### 참고 근거",
    "",
    `- 행정안전부 주민등록 인구현황 (2026-07-31) — [원문](${URL_})`,
  ].join("\n"),
}];

const meta: DocumentProjectMeta = {
  title: "테스트 사업", sector: "소매", model: "단품 판매",
  customer: "지역 주민", generatedAt: "2026-08-23T00:00:00.000Z", sample: false,
};

/** PDF 는 서브셋 폰트라 원문이 그대로 안 보인다 — ToUnicode 로 되돌려 읽는다 */
function pdfText(pdf: Buffer): string {
  const streams: Buffer[] = [];
  for (const m of pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const raw = Buffer.from(m[1], "latin1");
    try { streams.push(inflateSync(raw)); } catch { streams.push(raw); }
  }
  const blob = Buffer.concat(streams).toString("latin1");
  const cmap = new Map<number, string>();
  for (const m of blob.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4,})>/g)) {
    const dst = m[2];
    let s = "";
    for (let i = 0; i < dst.length; i += 4) s += String.fromCharCode(parseInt(dst.slice(i, i + 4), 16));
    cmap.set(parseInt(m[1], 16), s);
  }
  /*
   * 줄바꿈을 넣지 않고 이어 붙인다. 긴 주소는 페이지 폭에서 두 줄로 쪼개져
   * 그려지는데(정상 동작), 줄 단위로 끊어 읽으면 멀쩡한 URL 을 못 찾는다.
   */
  let out = "";
  for (const m of blob.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    const h = m[1];
    for (let i = 0; i < h.length; i += 4) out += cmap.get(parseInt(h.slice(i, i + 4), 16)) ?? "";
  }
  return out;
}

async function main() {
  const pdf = pdfText(await renderPdf(docs, meta));
  assert.ok(pdf.includes(URL_), "PDF 에 공식 원문 주소가 그대로 남아야 한다");
  assert.ok(pdf.includes("51,217,221"), "PDF 에 근거 수치가 남아야 한다");

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await renderDocx(docs, meta));
  const docxText = ((await zip.file("word/document.xml")?.async("string")) ?? "").replace(/&amp;/g, "&");
  assert.ok(docxText.includes("kosis.kr/statHtml/statHtml.do"), "DOCX 에 공식 원문 주소가 남아야 한다");
  assert.ok(docxText.includes("DT_1B040A3"), "DOCX 에 표를 구분하는 질의가 남아야 한다");

  console.log("document-source-url: PDF·DOCX 모두 [원문](URL) 링크의 주소를 보존");
}

main().catch((e) => { console.error(e); process.exit(1); });
