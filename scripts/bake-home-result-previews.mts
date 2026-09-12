// Render the public downloads, not separate marketing mockups.
// Requires Poppler and LibreOffice on PATH. Run with: npx tsx scripts/bake-home-result-previews.mts
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "public/home-media/results");
const temp = mkdtempSync(join(tmpdir(), "oneul-result-previews-"));
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const sources = [
  { file: "sample_coffee.pdf", pages: [1, 3, 15], prefix: "report" },
  { file: "sample_coffee.pptx", pages: [1, 3, 8], prefix: "deck" },
];

try {
  mkdirSync(output, { recursive: true });
  const fonts = join(temp, "fonts.conf");
  writeFileSync(fonts, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${xml(join(root, "public/fonts"))}</dir>
  <cachedir>${xml(join(temp, "font-cache"))}</cachedir>
  <match target="pattern"><test name="family" compare="eq"><string>Malgun Gothic</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>NanumGothic</string></edit></match>
  <alias><family>sans-serif</family><prefer><family>NanumGothic</family></prefer></alias>
</fontconfig>`);

  const manifest = [];
  for (const source of sources) {
    const original = join(root, "public/samples", source.file);
    let pdf = original;
    if (source.file.endsWith(".pptx")) {
      execFileSync("soffice", ["--headless", `-env:UserInstallation=${pathToFileURL(join(temp, "lo-profile"))}`, "--convert-to", "pdf", "--outdir", temp, original], {
        env: { ...process.env, FONTCONFIG_FILE: fonts }, stdio: "pipe",
      });
      pdf = join(temp, "sample_coffee.pdf");
    }
    const previews = [];
    for (const page of source.pages) {
      const name = `${source.prefix}-${String(page).padStart(2, "0")}`;
      const raster = join(temp, name);
      execFileSync("pdftoppm", ["-f", String(page), "-l", String(page), "-scale-to", "1600", "-singlefile", "-png", pdf, raster]);
      const file = `${name}.webp`;
      const result = await sharp(`${raster}.png`).webp({ quality: 92, effort: 6 }).toFile(join(output, file));
      previews.push({ file, page, width: result.width, height: result.height });
      console.log(`${file}: ${result.width}x${result.height}, ${Math.round(result.size / 1024)} KB`);
    }
    manifest.push({ source: `/samples/${source.file}`, sha256: createHash("sha256").update(readFileSync(original)).digest("hex"), previews });
  }
  writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
