import assert from "node:assert/strict";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { proposalFixture } from "./proposal-fixtures";
import { PROPOSAL_LAYOUTS, PROPOSAL_PURPOSES, PROPOSAL_SECTORS } from "../lib/plan-builder/proposal-blueprint";
import { proposalPages, upgradeProposalV3, validateProposalPages, renderableProposal, splitProposalPage, type ProposalDocument, type ProposalChart } from "../lib/plan-builder/proposal-revision";
import { proposalCommandSchema, proposalChartSchema, proposalImageSchema } from "../lib/plan-builder/proposal-editor";
import { proposalScenes, proposalLayoutIssues, proposalImageViewport, proposalChartScale } from "../lib/plan-builder/proposal-scene";
import { renderDeckPptx } from "../lib/plan-builder/deck-render";

async function main() {
  const output = process.env.PROPOSAL_V3_OUTPUT_DIR;
  if (output) await mkdir(output, { recursive: true });
  const legacy: ProposalDocument = { revision: 7, ...proposalFixture(), edits: { "proposal-cover": { text: { title: "보존할 수동 제목" } } } };
  const before = structuredClone(legacy), document = upgradeProposalV3(legacy);
  assert.deepEqual(legacy, before);
  assert.equal(document.schemaVersion, 3); assert.equal(document.deck.blueprint!.version, 2);
  assert.deepEqual(upgradeProposalV3(document), document, "Migration is idempotent");
  const split = splitProposalPage(document, "proposal-offering", "split-offering");
  const splitSlides = renderableProposal(split).slides.filter(slide => ["proposal-offering", "split-offering"].includes(slide.id!));
  assert.deepEqual(splitSlides.flatMap(slide => slide.table!.rows), document.deck.slides.find(slide => slide.id === "proposal-offering")!.table!.rows, "Splitting preserves every row and its order");
  const pages = proposalPages(document);
  document.pages = [...pages.slice(0, 2), { ...pages[1], id: "user-copy" }, ...pages.slice(3), { id: "user-chart", layout: "chart" }];
  document.edits["user-copy"] = { text: { title: "복제된 요약" }, layout: { "point:p1:detail": { x: 8.5, y: 2.84, w: 4.11, h: .52 } }, alignment: { title: "center" } };
  const chart: ProposalChart = { type: "bar", categories: ["1분기", "2분기", "3분기"], series: [{ id: "sales", name: "매출", values: [10, 0, -5] }, { id: "cost", name: "비용", values: [7, 8, 4] }], unit: "만원", basis: "estimate", source: "가상 사업 시나리오 2026년" };
  document.edits["user-chart"] = { text: { title: "분기별 예상 매출과 비용" }, content: { chart } };
  let deck = renderableProposal(document);
  assert.equal(deck.slides[2].title, "복제된 요약"); assert.equal(deck.blueprint!.slots[2].id, "user-copy");
  assert(!deck.slides.some(slide => slide.id === pages[2].id));
  assert.equal(deck.slides[2].alignment?.title, "center");
  assert.deepEqual(proposalLayoutIssues(deck), []);
  const scene = proposalScenes(deck)[2];
  assert(scene.nodes.some(node => node.id === "user-copy:point:p1:detail"));
  assert(scene.nodes.some(node => node.id === "user-copy:title"));
  assert.equal(new Set(scene.nodes.map(node => node.id)).size, scene.nodes.length);
  assert.throws(() => validateProposalPages(document, [{ id: "forged", sourceId: "other-account-slide", layout: "table" }]));
  assert.throws(() => validateProposalPages(document, []));
  assert.throws(() => validateProposalPages(document, [pages[0], pages[0]]));
  assert(proposalCommandSchema.safeParse({ type: "save", requestId: randomUUID(), expectedRevision: 7, edits: document.edits, pages: document.pages }).success);
  assert(!proposalChartSchema.safeParse({ ...chart, source: "" }).success);
  assert(!proposalChartSchema.safeParse({ ...chart, series: [{ ...chart.series[0], values: [1] }] }).success);
  assert(!proposalChartSchema.safeParse({ ...chart, series: [{ ...chart.series[0], values: [NaN, 1, 2] }] }).success);
  for (const values of [[0, 0], [-9, -3], [1e-8, 2e-8]]) { const scale = proposalChartScale({ ...chart, series: [{ ...chart.series[0], values }] }); assert(scale.max > scale.min && scale.step > 0); }

  const parser = new XMLParser({ ignoreAttributes: false });
  for (const type of ["bar", "line"] as const) {
    document.edits["user-chart"].content!.chart = { ...chart, type };
    const bytes = await renderDeckPptx(renderableProposal(document)), zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    if (output) await writeFile(join(output, `native-${type}.pptx`), bytes);
    const files = zip.file(/^ppt\/charts\/chart\d+\.xml$/); assert.equal(files.length, 1);
    const xml = await files[0].async("string");
    assert.equal(XMLValidator.validate(xml), true);
    assert(xml.includes(type === "bar" ? "<c:barChart>" : "<c:lineChart>"));
    assert(xml.includes("<c:v>-5</c:v>") && xml.includes("<c:v>0</c:v>") && xml.includes("1분기"));
    assert.equal(zip.file(/^ppt\/embeddings\/.*\.xlsx$/).length, 1, "Chart data remains an editable Excel workbook");
    const workbook = await JSZip.loadAsync(await zip.file(/^ppt\/embeddings\/.*\.xlsx$/)[0].async("nodebuffer"));
    const worksheet = await workbook.file("xl/worksheets/sheet1.xml")!.async("string");
    assert.equal(XMLValidator.validate(worksheet), true);
    const rows = parser.parse(worksheet).worksheet.sheetData.row;
    assert.deepEqual(rows.slice(1).map((row: { c: Array<{ v: unknown }> }) => row.c.slice(1).map(cell => Number(cell.v))), [[10, 7], [0, 8], [-5, 4]], "Native workbook data matches chart caches, including zero and negative values");
    assert(!rows.slice(1).some((row: { c: Array<{ v: unknown }> }) => row.c.slice(1).some(cell => cell.v === "")), "Numeric zero must not become a blank Excel cell");
    parser.parse(xml);
    const slide = await zip.file(`ppt/slides/slide${deck.slides.length}.xml`)!.async("string");
    assert(slide.includes("<c:chart") && slide.includes("user-chart:chart"));
  }

  for (const [width, height, crop] of [[1600, 900, { x: .1, y: .2, w: .6, h: .5 }], [600, 1200, { x: .3, y: .1, w: .5, h: .8 }]] as const) {
    const bitmap = await sharp({ create: { width, height, channels: 3, background: "#236fbb" } }).composite([{ input: await sharp({ create: { width: Math.floor(width / 2), height, channels: 3, background: "#ce4d67" } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
    const png = `data:image/png;base64,${bitmap.toString("base64")}`;
    const image = { id: "asset", data: png, alt: "테스트 이미지", width, height, crop };
    assert(proposalImageSchema.safeParse(image).success);
    const photo = upgradeProposalV3({ revision: 1, ...proposalFixture(), edits: {} });
    photo.pages = [{ id: "user-photo", layout: "evidence" }];
    photo.edits["user-photo"] = { text: { title: "실제 사진" }, content: { image } };
    const imageDeck = renderableProposal(photo), node = proposalScenes(imageDeck)[0].nodes.find(node => node.type === "image")!;
    assert.equal(node.type, "image"); if (node.type !== "image") throw new Error("image missing");
    const viewport = proposalImageViewport(node.options);
    assert(Math.abs(viewport.w / viewport.h - width * crop.w / (height * crop.h)) < 1e-9);
    const bytes = await renderDeckPptx(imageDeck), zip = await JSZip.loadAsync(bytes);
    if (output) await writeFile(join(output, `crop-${width}-${height}.pptx`), bytes);
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    for (const [key, value] of Object.entries({ l: crop.x, t: crop.y, r: 1 - crop.x - crop.w, b: 1 - crop.y - crop.h })) assert(xml.includes(`${key}="${Math.round(value * 100000)}"`), `Native crop ${key} must match preview`);
  }
  assert(!proposalImageSchema.safeParse({ id: "bad", data: "https://example.com/image.png", alt: "external" }).success);

  for (const layout of PROPOSAL_LAYOUTS) {
    const empty = upgradeProposalV3({ revision: 1, ...proposalFixture(), edits: {} }); empty.pages = [{ id: "empty", layout }];
    const emptyDeck = renderableProposal(empty); const nodes = proposalScenes(emptyDeck)[0].nodes;
    assert(nodes.every(node => Object.values(node.options).filter(value => typeof value === "number").every(Number.isFinite)), layout);
    if (layout === "chart") { assert(proposalLayoutIssues(emptyDeck).some(issue => issue.code === "missing_data")); await assert.rejects(() => renderDeckPptx(emptyDeck), /layout_review_required/); }
    else { const bytes = await renderDeckPptx(emptyDeck); if (output) await writeFile(join(output, `empty-${layout}.pptx`), bytes); }
  }
  const overflow = structuredClone(document);
  overflow.edits[pages[0].id] = { text: { title: "긴문장".repeat(15) }, layout: { title: { x: 1, y: 1, w: .5, h: .3 } } };
  assert(proposalLayoutIssues(renderableProposal(overflow)).some(issue => issue.code === "overflow"));
  await assert.rejects(() => renderDeckPptx(renderableProposal(overflow)), /layout_review_required/);
  const overlap = structuredClone(document); overlap.edits[pages[0].id] = { layout: { title: { x: 1, y: 2, w: 10, h: 1.6 }, lead: { x: 1, y: 2.5, w: 10, h: 1 } } };
  assert(proposalLayoutIssues(renderableProposal(overlap)).some(issue => issue.code === "overlap"));
  let combinations = 0;
  for (const sector of PROPOSAL_SECTORS) for (const purpose of PROPOSAL_PURPOSES) {
    const fixture = upgradeProposalV3({ revision: 1, ...proposalFixture(sector, purpose), edits: {} });
    assert.deepEqual(proposalLayoutIssues(renderableProposal(fixture)), [], `${sector}/${purpose}`);
    const bytes = await renderDeckPptx(renderableProposal(fixture));
    if (output) await writeFile(join(output, `${sector}-${purpose}.pptx`), bytes);
    combinations++;
  }
  console.log(`PPT v3: copy-on-write migration, structural pages, stable IDs, native bar/line/workbook, two crop aspects, empty layouts, overflow/overlap guards, ${combinations} sector-purpose exports passed; no AI calls`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
