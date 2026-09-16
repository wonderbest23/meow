import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { XMLParser } from "fast-xml-parser";

const directory = resolve(process.argv[2] ?? "");
assert(process.argv.length === 3 && process.env.SOFFICE_BIN && process.env.FONTCONFIG_FILE, "Provide a completed industry output directory, SOFFICE_BIN and FONTCONFIG_FILE");
const result = JSON.parse(await readFile(join(directory, "result.json"), "utf8"));
assert.equal(result.status, "actual-ai-chain-complete-not-release-approved");
assert.equal(result.initialDeckGeneratedByAI, true);
for (const name of ["updated.pptx", "document.pdf", "document.docx"]) {
  const hash = createHash("sha256").update(await readFile(join(directory, name))).digest("hex");
  assert.equal(hash, result.outputs[name], `Original artifact hash: ${name}`);
}
const output = join(directory, "rendered"), converted = join(output, "office");
await mkdir(converted, { recursive: true });
execFileSync(process.env.SOFFICE_BIN, ["--headless", "--convert-to", "pdf", "--outdir", converted, join(directory, "updated.pptx"), join(directory, "document.docx")], { timeout: 180000, stdio: "pipe" });
const pdfs = [join(converted, "updated.pdf"), join(converted, "document.pdf"), join(directory, "document.pdf")];
const labels = ["pptx", "word", "pdf"];
const checks = [];
for (const [index, pdf] of pdfs.entries()) {
  const raster = join(output, labels[index]); await mkdir(raster, { recursive: true });
  const pages = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8", maxBuffer: 8_000_000 }).split("\f");
  if (!pages.at(-1)?.trim()) pages.pop();
  assert(pages.length && pages.every(page => /[가-힣]/.test(page)), "Every page must contain extractable Korean text");
  execFileSync("pdftoppm", ["-png", "-scale-to", "1200", pdf, join(raster, "page")], { timeout: 60000, stdio: "pipe" });
  const images = (await readdir(raster)).filter(name => name.endsWith(".png")).sort();
  assert.equal(images.length, pages.length);
  for (const name of images) {
    const stats = await sharp(join(raster, name)).stats();
    assert(stats.channels.slice(0, 3).some(channel => channel.stdev > 5), `Blank page: ${name}`);
  }
  if (!index) {
    const zip = await JSZip.loadAsync(await readFile(join(directory, "updated.pptx")), { checkCRC32: true });
    const slides = zip.file(/^ppt\/slides\/slide\d+\.xml$/).sort((a, b) => Number(a.name.match(/slide(\d+)/)![1]) - Number(b.name.match(/slide(\d+)/)![1]));
    assert.equal(slides.length, pages.length); assert.equal(slides.length, result.slides);
    const parser = new XMLParser({ ignoreAttributes: false });
    const text = (value: unknown): string[] => value && typeof value === "object" ? Object.entries(value).flatMap(([key, child]) => key === "a:t" ? [String(child)] : text(child)) : [];
    const normalize = (value: string) => value.normalize("NFKC").replace(/\s/g, "");
    for (const [page, slide] of slides.entries()) {
      const nodes = parser.parse(await slide.async("string"))["p:sld"]["p:cSld"]["p:spTree"]["p:sp"];
      const title = (Array.isArray(nodes) ? nodes : [nodes]).find(node => node?.["p:nvSpPr"]?.["p:cNvPr"]?.["@_name"]?.endsWith(":title"));
      assert(title && normalize(pages[page]).includes(normalize(text(title["p:txBody"]).join(""))), `Native title rendered: ${page + 1}`);
    }
  }
  const tileWidth = 400, tileHeight = index ? 550 : 225, columns = index ? 2 : 3;
  const tiles = [];
  for (const [tile, name] of images.entries()) tiles.push({ input: await sharp(join(raster, name)).resize(tileWidth, tileHeight, { fit: "contain", background: "#ffffff" }).png().toBuffer(), left: tile % columns * tileWidth, top: Math.floor(tile / columns) * tileHeight });
  await sharp({ create: { width: columns * tileWidth, height: Math.ceil(images.length / columns) * tileHeight, channels: 3, background: "#e5e7eb" } }).composite(tiles).png().toFile(join(output, `${labels[index]}-contact.png`));
  checks.push({ artifact: labels[index], pages: pages.length, koreanText: true, nonblank: true });
}
const report = { automatedChecksPassed: true, source: "actual generated files verified against lifecycle hashes", renderer: "LibreOffice + Poppler", checks, visualInspection: "pending separate review", powerPointOrGoogleSlidesVerified: false };
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, sector: basename(directory), output }, null, 2));
