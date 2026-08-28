/*
 * 킷 페이지의 사진 크롭을 이중화한다.
 *
 * 변환기는 프레임보다 큰 사진을 'rect 하나짜리 SVG 마스크'로 잘라 왔다.
 * 마스크가 어떤 이유로든 적용되지 않는 환경에서는 사진이 원본 크기 그대로
 * 퍼져 제목·이웃 섹션을 덮는다(실제 보고: PC 샘플 홈페이지).
 *
 * 마스크 SVG 가 단순 둥근 사각형(rect w/h/rx)일 때, 같은 영역을
 * clip-path: xywh(...) 로도 명시한다 — 마스크가 살아 있으면 교집합이라
 * 픽셀이 같고, 마스크가 죽으면 clip 이 대신 자른다. 사각이 아닌 마스크는
 * 건드리지 않는다.
 *
 * 실행: node scripts/brainwave-clipfix.mjs   (pages/*.json 을 제자리 수정)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const PAGES = "lib/landing/brainwave/pages";
const PUBLIC = "public";

const px = (v) => {
  const n = parseFloat(String(v).replace("px", ""));
  return Number.isFinite(n) ? n : null;
};

/** 마스크 SVG 가 'rect 하나'면 { w, h, rx } 를 준다 */
function rectOfMask(url) {
  const m = /^url\("(\/brainwave\/[^"]+\.svg)"\)$/.exec(url ?? "");
  if (!m) return null;
  const file = path.join(PUBLIC, m[1]);
  if (!existsSync(file)) return null;
  const svg = readFileSync(file, "utf8");
  const rects = [...svg.matchAll(/<rect\b[^>]*>/g)];
  const others = /<(path|circle|ellipse|polygon|line|g|image|use)\b/.test(svg);
  if (rects.length !== 1 || others) return null;
  const rect = rects[0][0];
  const attr = (k) => {
    const a = new RegExp(`\\b${k}="([^"]+)"`).exec(rect);
    return a ? parseFloat(a[1]) : null;
  };
  const w = attr("width");
  const h = attr("height");
  if (!w || !h) return null;
  /* rect 가 0,0 이 아니면(x/y) 단순 크롭이 아니다 — 건너뛴다 */
  if ((attr("x") ?? 0) !== 0 || (attr("y") ?? 0) !== 0) return null;
  return { w, h, rx: attr("rx") ?? 0 };
}

let pages = 0;
let clipped = 0;
let skipped = 0;

for (const name of readdirSync(PAGES).filter((f) => f.endsWith(".json"))) {
  const file = path.join(PAGES, name);
  const data = JSON.parse(readFileSync(file, "utf8"));
  let changed = false;

  const walk = (node) => {
    const st = node.st;
    if (st?.maskImage && st.maskSize && st.maskPosition && st.width && st.height && !st.clipPath) {
      const rect = rectOfMask(st.maskImage);
      const pos = String(st.maskPosition).trim().split(/\s+/).map(px);
      const size = String(st.maskSize).trim().split(/\s+/).map(px);
      if (rect && pos.length === 2 && pos.every((v) => v !== null) && size.length === 2 && size.every((v) => v !== null)) {
        const [x, y] = pos;
        const [w, h] = size;
        st.clipPath = `xywh(${x}px ${y}px ${w}px ${h}px${rect.rx ? ` round ${rect.rx * (w / rect.w)}px` : ""})`;
        changed = true;
        clipped += 1;
      } else {
        skipped += 1;
      }
    }
    for (const c of node.ch ?? []) walk(c);
  };
  walk(data.root);

  if (changed) {
    writeFileSync(file, JSON.stringify(data));
    pages += 1;
  }
}

console.log(`clip 이중화: ${pages}개 페이지, ${clipped}개 노드 (사각 아님/해석 불가로 건너뜀 ${skipped})`);
