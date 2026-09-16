# Standalone homepage image crop

## Integration contract

Default export: `components/landing-image-crop.tsx`, `LandingImageCrop`.

```tsx
<LandingImageCrop
  file={pendingFile}
  maxOutputEdge={kind === "logo" ? 600 : 1600}
  onApply={file => { setPendingFile(null); void resizeThenUpload(file); }}
  onCancel={() => setPendingFile(null)}
/>
```

- Props remain `file: File | null`, `onApply: (file: File) => void`, `onCancel: () => void`, optional `initialAspect` and `maxOutputEdge`.
- `null` closes the dialog. A changed File identity creates a new editing session. The default aspect is the complete original image.
- Dialog accessible name: `사진 자르기`. Buttons: `적용`, `원본 사용`, `취소`; close icon: `자르기 취소`; reset icon: `원본으로 재설정`.
- `적용` returns a new cropped File only after successful local Canvas encoding. `원본 사용` returns the identical input File, without encoding, resizing or metadata changes. Both are explicit approvals and share `onApply`.
- `maxOutputEdge` limits cropped output only; default 1600, accepted 1..4096. No upscaling, except the one-pixel minimum for subpixel crops. Parent resizing remains applicable to the original-file branch.
- Aspect IDs: `original`, `square`, `landscape`, `photo`, `wide`, `portrait`, `story` (original, 1:1, 4:3, 3:2, 16:9, 3:4, 9:16). Position sliders and pointer dragging operate on the same source crop rectangle; zoom is 100..400%.
- JPG, PNG and WebP files up to 12MB and 40 megapixels. Cropped JPEG stays JPEG; PNG/WebP crops become PNG to retain transparency. Unsupported or undecodable input shows an error without invoking `onApply`.
- There is no network request, upload, persistent write, or mutation of the input File. Parent must invoke upload only in `onApply`. Once transferred, upload cancellation and editor target/session protection remain the parent's responsibility.
- Cancel/Escape, File replacement, configuration reset, and unmount invalidate pending results. Duplicate Apply is guarded synchronously. Object URLs are released after apply/cancel, replacement, unmount and decode failure.

## Verification

- `node --import tsx scripts/landing-image-crop.test.ts`: passed, 14,000 deterministic geometry invariants plus exact edge/aspect/zoom/draw coordinates, output limits, unsupported files, unchanged source, failed encoding and abort checks.
- `scripts/landing-image-crop-browser.mts`: passed in isolated Chromium/Next at 320, 390, 768 and 1440px, each at 692px height. The test uses synthetic colored pixels, not a network image or paid tool.
- Browser checks include native dialog labels, keyboard ranges and focus containment, pointer drag, stable preview frame during zoom, actual encoded pixel/dimension equality, preview transparency, original-byte equality, reset, duplicate Apply, cancel/replace/unmount during delayed encoding, invalid input, reduced motion, zero uploads and zero leaked object URLs.
- Screenshots were visually inspected at all four widths: no clipping or overlapping controls. Reports and pixel outputs: `artifacts/landing-image-crop/`.
- Tests use a fixture-only layout and page in a temporary copy; no production preview route was added. The temporary server is stopped after the run.
- Parent-owned `BrainwaveEditor` and `landing-media-field` were not edited here. Integration and their existing upload/session guard tests belong to the parent.

## Remaining platform checks

Physical iOS/Safari, EXIF-rotated camera files, color-profile fidelity and screen-reader speech have not been separately verified. Browser decoding/orientation and Canvas encoding are used, with no custom image parser or new dependency. This is a standalone component verification, not proof of integrated remote upload/publish behavior.
