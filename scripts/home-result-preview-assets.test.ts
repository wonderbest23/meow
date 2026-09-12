import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

async function main() {
  const root = resolve(import.meta.dirname, "..");
  const directory = join(root, "public/home-media/results");
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as Array<{
    source: string;
    sha256: string;
    previews: Array<{ file: string; page: number; width: number; height: number }>;
  }>;
  assert.deepEqual(manifest.map(item => item.source), ["/samples/sample_coffee.pdf", "/samples/sample_coffee.pptx"]);
  let totalBytes = 0;
  for (const item of manifest) {
    const original = readFileSync(join(root, "public", item.source));
    assert.equal(createHash("sha256").update(original).digest("hex"), item.sha256,
      `${item.source} changed: regenerate the homepage previews`);
    assert.equal(item.previews.length, 3);
    for (const preview of item.previews) {
      const path = join(directory, preview.file);
      const metadata = await sharp(path).metadata();
      assert.equal(metadata.width, preview.width);
      assert.equal(metadata.height, preview.height);
      assert.equal(metadata.format, "webp");
      assert.ok(preview.page > 0);
      const ratio = preview.width / preview.height;
      assert.ok(Math.abs(ratio - (item.source.endsWith(".pdf") ? 595.28 / 841.89 : 16 / 9)) < .003,
        "Keep the original page aspect ratio");
      const stats = await sharp(path).stats();
      assert.ok(stats.channels.some(channel => channel.stdev > 15), "A preview must not be blank");
      totalBytes += statSync(path).size;
    }
  }
  assert.ok(totalBytes < 600_000, "Lazy-loaded preview assets stay below 600 KB combined");
  console.log(`Actual PDF/PPT preview assets passed: 6 pages, ${Math.round(totalBytes / 1024)} KB`);
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
