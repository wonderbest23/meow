export type ImageDimensions = { width: number; height: number };
export type ImageCropPosition = { x: number; y: number; zoom: number };
export type ImageCropRect = ImageDimensions & { x: number; y: number };
export const IMAGE_CROP_MAX_ZOOM = 4;
export const IMAGE_CROP_MAX_BYTES = 12 * 1024 * 1024;
export const IMAGE_CROP_MAX_PIXELS = 40_000_000;

export const IMAGE_CROP_ASPECTS = [
  { id: "original", label: "원본", ratio: null },
  { id: "square", label: "1:1", ratio: 1 },
  { id: "landscape", label: "4:3", ratio: 4 / 3 },
  { id: "photo", label: "3:2", ratio: 3 / 2 },
  { id: "wide", label: "16:9", ratio: 16 / 9 },
  { id: "portrait", label: "3:4", ratio: 3 / 4 },
  { id: "story", label: "9:16", ratio: 9 / 16 },
] as const;
export type ImageCropAspect = typeof IMAGE_CROP_ASPECTS[number]["id"];

export function clampCropValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) throw new Error("자르기 값이 올바르지 않습니다.");
  return Math.min(max, Math.max(min, value));
}

function validDimensions(size: ImageDimensions) {
  if (![size.width, size.height].every(value => Number.isFinite(value) && value > 0)) throw new Error("이미지 크기가 올바르지 않습니다.");
}

/** Position is normalized over the available travel, not over the whole source. */
export function imageCropRect(size: ImageDimensions, ratio: number | null, position: ImageCropPosition): ImageCropRect {
  validDimensions(size);
  const aspect = ratio ?? size.width / size.height;
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error("자르기 비율이 올바르지 않습니다.");
  const zoom = clampCropValue(position.zoom, 1, IMAGE_CROP_MAX_ZOOM);
  const width = Math.min(size.width, size.height * aspect) / zoom;
  const height = Math.min(size.height, size.width / aspect) / zoom;
  return { width, height, x: (size.width - width) * clampCropValue(position.x, 0, 1), y: (size.height - height) * clampCropValue(position.y, 0, 1) };
}

export function imageCropOutputSize(rect: ImageDimensions, maxEdge = 1600): ImageDimensions {
  validDimensions(rect);
  if (!Number.isFinite(maxEdge) || maxEdge < 1 || maxEdge > 4096) throw new Error("출력 크기는 1~4096px이어야 합니다.");
  const scale = Math.min(1, Math.floor(maxEdge) / Math.max(rect.width, rect.height));
  return { width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)) };
}

export function validateCropFile(file: Pick<File, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("JPG, PNG, WebP 이미지를 선택해 주세요.");
  if (file.size <= 0 || file.size > IMAGE_CROP_MAX_BYTES) throw new Error("12MB 이하 이미지를 선택해 주세요.");
}

const aborted = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException("Image crop cancelled", "AbortError"); };

/** A local object URL is always released by dispose, cancellation or decode failure. */
export function loadCropImage(file: File, signal?: AbortSignal): Promise<{ image: HTMLImageElement; dispose: () => void }> {
  validateCropFile(file);
  aborted(signal);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image();
    let settled = false, released = false;
    const dispose = () => { if (!released) { released = true; URL.revokeObjectURL(url); } };
    const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener("abort", cancel); };
    const fail = (error: Error) => { if (settled) return; settled = true; cleanup(); dispose(); reject(error); };
    const cancel = () => fail(new DOMException("Image crop cancelled", "AbortError"));
    image.onload = () => {
      if (settled) return;
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > IMAGE_CROP_MAX_PIXELS) return fail(new Error("4천만 화소 이하 이미지를 선택해 주세요."));
      settled = true; cleanup(); resolve({ image, dispose });
    };
    image.onerror = () => fail(new Error("이미지를 열지 못했습니다. 다른 파일을 선택해 주세요."));
    signal?.addEventListener("abort", cancel, { once: true });
    image.src = url;
  });
}

export function drawImageCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, rect: ImageCropRect, maxEdge = 1600) {
  const dimensions = imageCropOutputSize(rect, maxEdge);
  const epsilon = 0.00001;
  if (![rect.x, rect.y].every(value => Number.isFinite(value) && value >= 0) || rect.x + rect.width > image.naturalWidth + epsilon || rect.y + rect.height > image.naturalHeight + epsilon) throw new Error("자르기 영역이 원본 이미지 밖에 있습니다.");
  canvas.width = dimensions.width; canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이 브라우저에서 이미지를 처리하지 못했습니다.");
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return dimensions;
}

/** Local-only encoding. Does not mutate the original, persist, or upload anything. */
export async function cropImageFile(file: File, image: HTMLImageElement, rect: ImageCropRect, options: { maxEdge?: number; signal?: AbortSignal } = {}): Promise<File> {
  validateCropFile(file);
  aborted(options.signal);
  const canvas = document.createElement("canvas");
  drawImageCrop(canvas, image, rect, options.maxEdge);
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    let finished = false;
    const cancel = () => { if (!finished) { finished = true; reject(new DOMException("Image crop cancelled", "AbortError")); } };
    options.signal?.addEventListener("abort", cancel, { once: true });
    try {
      canvas.toBlob(value => {
        options.signal?.removeEventListener("abort", cancel);
        if (finished) return;
        finished = true;
        if (options.signal?.aborted) reject(new DOMException("Image crop cancelled", "AbortError"));
        else if (value) resolve(value);
        else reject(new Error("이미지를 처리하지 못했습니다. 다시 적용해 주세요."));
      }, type, 0.9);
    } catch (error) { options.signal?.removeEventListener("abort", cancel); reject(error); }
  });
  aborted(options.signal);
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}-cropped.${type === "image/jpeg" ? "jpg" : "png"}`, { type });
}
