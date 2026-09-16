import assert from "node:assert/strict";
import { IMAGE_CROP_ASPECTS, IMAGE_CROP_MAX_BYTES, cropImageFile, drawImageCrop, imageCropOutputSize, imageCropRect, validateCropFile } from "../lib/landing/image-crop";

async function main() {
  const source = { width: 400, height: 200 }, center = { x: .5, y: .5, zoom: 1 };
  assert.deepEqual(imageCropRect(source, null, center), { x: 0, y: 0, width: 400, height: 200 });
  assert.deepEqual(imageCropRect(source, 1, center), { x: 100, y: 0, width: 200, height: 200 });
  assert.deepEqual(imageCropRect(source, 1, { x: 1, y: 0, zoom: 2 }), { x: 300, y: 0, width: 100, height: 100 });
  assert.deepEqual(imageCropRect(source, 1, { x: -10, y: 10, zoom: 100 }), { x: 0, y: 150, width: 50, height: 50 });
  assert.deepEqual(imageCropRect({ width: 200, height: 400 }, 1, center), { x: 0, y: 100, width: 200, height: 200 });
  assert.deepEqual(imageCropOutputSize({ width: 4000, height: 2000 }, 1600), { width: 1600, height: 800 });
  assert.deepEqual(imageCropOutputSize(source), source, "small originals are not enlarged");
  assert.deepEqual(imageCropOutputSize({ width: .25, height: .25 }), { width: 1, height: 1 });
  for (const value of [NaN, Infinity, -1, 0]) {
    assert.throws(() => imageCropRect({ width: value, height: 100 }, null, center));
    assert.throws(() => imageCropRect(source, value, center));
    assert.throws(() => imageCropOutputSize(source, value));
  }
  assert.throws(() => imageCropRect(source, 1, { ...center, x: NaN }));
  assert.throws(() => imageCropRect(source, 1, { ...center, zoom: Infinity }));
  assert.throws(() => imageCropOutputSize(source, 4097));
  for (const type of ["image/svg+xml", "image/gif", "text/plain", ""]) assert.throws(() => validateCropFile({ type, size: 10 }));
  assert.throws(() => validateCropFile({ type: "image/png", size: IMAGE_CROP_MAX_BYTES + 1 }));
  assert.throws(() => validateCropFile({ type: "image/png", size: 0 }));
  for (const type of ["image/jpeg", "image/png", "image/webp"]) assert.doesNotThrow(() => validateCropFile({ type, size: 10 }));

  let seed = 42, checks = 0;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 2000; i++) for (const aspect of IMAGE_CROP_ASPECTS) {
    const size = { width: 1 + Math.floor(random() * 10000), height: 1 + Math.floor(random() * 10000) };
    const rect = imageCropRect(size, aspect.ratio, { x: random() * 3 - 1, y: random() * 3 - 1, zoom: random() * 8 - 2 });
    assert(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0);
    assert(rect.x + rect.width <= size.width + 1e-8 && rect.y + rect.height <= size.height + 1e-8);
    const ratio = aspect.ratio ?? size.width / size.height;
    assert(Math.abs(rect.width / rect.height - ratio) < 1e-8 * Math.max(1, ratio));
    const output = imageCropOutputSize(rect);
    assert(output.width >= 1 && output.height >= 1 && Math.max(output.width, output.height) <= 1600);
    assert(Math.abs(output.width - output.height * ratio) <= .5 + .5 * ratio + Math.max(1, ratio), "only pixel rounding may change aspect");
    checks++;
  }

  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let callback: BlobCallback | undefined, encodedType: string | undefined;
  const draws: unknown[][] = [];
  const context = { clearRect() {}, drawImage(...args: unknown[]) { draws.push(args); }, imageSmoothingEnabled: false, imageSmoothingQuality: "low" };
  const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (done: BlobCallback, type: string) => { callback = done; encodedType = type; } };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
  const image = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
  const input = new File(["unchanged-source"], "product.png", { type: "image/png" });
  const rect = imageCropRect(source, 1, { x: 1, y: 0, zoom: 2 });
  try {
    const applying = cropImageFile(input, image, rect);
    assert.equal(encodedType, "image/png");
    assert.deepEqual(draws.at(-1)?.slice(1), [300, 0, 100, 100, 0, 0, 100, 100]);
    callback!(new Blob(["cropped-result"], { type: "image/png" }));
    const result = await applying;
    assert.equal(result.name, "product-cropped.png"); assert.equal(await result.text(), "cropped-result");
    assert.equal(await input.text(), "unchanged-source"); assert.notEqual(result, input);
    const abort = new AbortController();
    const cancelled = cropImageFile(input, image, rect, { signal: abort.signal });
    const rejected = assert.rejects(cancelled, { name: "AbortError" });
    abort.abort(); callback!(new Blob(["late-image"])); await rejected;
    await assert.rejects(cropImageFile(input, image, rect, { signal: abort.signal }), { name: "AbortError" });
    const failed = cropImageFile(input, image, rect); callback!(null); await assert.rejects(failed, /처리하지 못/);
    const jpeg = cropImageFile(new File(["jpeg-source"], "photo.jpeg", { type: "image/jpeg" }), image, rect);
    assert.equal(encodedType, "image/jpeg"); callback!(new Blob(["jpeg-result"], { type: "image/jpeg" })); assert.equal((await jpeg).name, "photo-cropped.jpg");
    assert.throws(() => drawImageCrop(canvas as unknown as HTMLCanvasElement, image, { ...rect, x: 400 }));
    assert.throws(() => drawImageCrop({ getContext: () => null } as unknown as HTMLCanvasElement, image, rect));
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
  }
  console.log(`image crop: ${checks} geometry invariants, boundary/aspect/zoom/output/file validation, exact draw coordinates, original preservation, encode failure and cancellation passed`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
