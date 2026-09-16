import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { XMLParser } from "fast-xml-parser";

const root = resolve(process.argv[2] ?? "");
assert(process.argv[2] && process.env.SOFFICE_BIN && process.env.FONTCONFIG_FILE, "Usage: SOFFICE_BIN=... FONTCONFIG_FILE=... node --import tsx scripts/proposal-v3-render.mts <PPTX output directory>");
const files = (await readdir(root)).filter(file => file.endsWith(".pptx")).sort();
assert(files.length >= 55, "Generate the sector-purpose matrix with PROPOSAL_V3_OUTPUT_DIR first");
const pdfRoot = join(root, "pdf"), rasterRoot = join(root, "raster");
await mkdir(pdfRoot, { recursive: true }); await mkdir(rasterRoot, { recursive: true });
execFileSync(process.env.SOFFICE_BIN, ["--headless", "--convert-to", "pdf", "--outdir", pdfRoot, ...files.map(file => join(root, file))], { timeout: 180000, stdio: "pipe" });
const parser = new XMLParser({ ignoreAttributes: false });
const clean = (text: string) => text.normalize("NFKC").replace(/\s/g, "");
function textNodes(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => key === "a:t" ? [String(child)] : textNodes(child));
}
const checks: Array<{ file: string; pages: number; titleChecks: number; rasterPages: number }> = [];
const montage: string[] = [];
for (const file of files) {
  const name = basename(file, ".pptx"), pdf = join(pdfRoot, `${name}.pdf`);
  const zip = await JSZip.loadAsync(await readFile(join(root, file)), { checkCRC32: true });
  const slides = zip.file(/^ppt\/slides\/slide\d+\.xml$/).sort((a, b) => Number(a.name.match(/slide(\d+)/)![1]) - Number(b.name.match(/slide(\d+)/)![1]));
  const pages = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8", maxBuffer: 8_000_000 }).split("\f");
  if (!pages.at(-1)?.trim()) pages.pop();
  assert.equal(pages.length, slides.length, `${file}: actual PDF page count`);
  let titleChecks = 0;
  for (const [index, slide] of slides.entries()) {
    const xml = parser.parse(await slide.async("string"));
    const shapes = xml["p:sld"]["p:cSld"]["p:spTree"]["p:sp"] ?? [];
    const title = (Array.isArray(shapes) ? shapes : [shapes]).find(shape => shape["p:nvSpPr"]?.["p:cNvPr"]?.["@_name"]?.endsWith(":title"));
    assert(title, `${file}/${index + 1}: native editable title`);
    assert(clean(pages[index]).includes(clean(textNodes(title["p:txBody"]).join(""))), `${file}/${index + 1}: full rendered title`);
    titleChecks++;
  }
  const raster = join(rasterRoot, name); await mkdir(raster, { recursive: true });
  execFileSync("pdftoppm", ["-png", "-scale-to", "1000", pdf, join(raster, "slide")], { timeout: 30000, stdio: "pipe" });
  const images = (await readdir(raster)).filter(image => image.endsWith(".png")).sort();
  assert.equal(images.length, slides.length, `${file}: raster page count`);
  for (const image of images) {
    const stats = await sharp(join(raster, image)).stats();
    assert(stats.channels.slice(0, 3).some(channel => channel.stdev > 5), `${file}/${image}: nonblank page`);
  }
  const selected = name.startsWith("native-") ? images.at(-1)! : images[0];
  montage.push(join(raster, selected));
  checks.push({ file, pages: pages.length, titleChecks, rasterPages: images.length });
}
const tileW = 320, tileH = 180, columns = 4;
const tiles = [];
for (const [index, path] of montage.entries()) tiles.push({ input: await sharp(path).resize(tileW, tileH, { fit: "contain", background: "#ffffff" }).png().toBuffer(), left: index % columns * tileW, top: Math.floor(index / columns) * tileH });
await sharp({ create: { width: columns * tileW, height: Math.ceil(tiles.length / columns) * tileH, channels: 3, background: "#e5e7eb" } }).composite(tiles).png().toFile(join(root, "render-montage.png"));
const report = { passed: true, renderer: "LibreOffice + Poppler", files: checks.length, pages: checks.reduce((sum, check) => sum + check.pages, 0), checks, mockedAI: true, paidCalls: 0, powerPointOrGoogleSlidesVerified: false };
await writeFile(join(root, "render-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, checks: undefined, output: root }, null, 2));
