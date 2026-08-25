/*
 * 킷 페이지 모바일 자동 재배치.
 *
 * 킷은 1600px 데스크톱 좌표뿐이다. 폰에서 통째로 줄이면 글자가 4mm 가 된다.
 * 대신 좌표를 읽어 '가로로 나란한 것은 세로로 쌓는다' 는 규칙 하나로 다시
 * 배치한다(카드 3개 가로 → 세로 3개, 머리글의 로고|메뉴|단추 → 세 줄).
 *
 * 방법(길로틴 분할):
 *   한 노드의 자식들을 y 로 정렬해 서로 겹치지 않는 가로 띠로 나눈다 → 띠가
 *   둘 이상이면 위에서 아래로 쌓는다. 띠가 하나면 x 로 세로 칼럼을 나눈다 →
 *   칼럼이 둘 이상이면 왼쪽부터 차례로 쌓는다. 더 못 나누면 '잎' — 그 묶음을
 *   원래 좌표 그대로 폰 폭에 맞춰 줄여 그린다(최대 원본 크기까지).
 *   부모를 거의 다 덮는 자식(사진·색 바탕)은 배경으로 두고 나머지만 나눈다.
 *   카드처럼 바탕·테두리·그림자가 있는 노드는 더 쪼개지 않고 통째로 둔다.
 *
 * 글은 다시 흐르지 않는다 — 잎 안에서는 원본 그대로 줄어든다. 그래도 잎이
 * 폰 폭을 다 쓰므로 제목 60px → 40px 쯤, 읽힌다.
 */
import type { BrainwaveNode } from "../../../components/brainwave-page";

export type Box = { x: number; y: number; w: number; h: number };

export type Item = { node: BrainwaveNode; box: Box; frame: Box };
export type MobileLayout =
  | { kind: "stack"; box: Box; bg: BrainwaveNode[]; items: MobileLayout[]; node?: BrainwaveNode }
  /** frame: 이 노드들의 좌표 기준(부모 상자) — 그 크기의 틀 안에 원래 좌표로 그린다 */
  | { kind: "leaf"; box: Box; frame: Box; nodes: BrainwaveNode[] };

const num = (v: string | undefined, base: number): number | null => {
  if (v === undefined || v === "auto") return null;
  const s = v.trim();
  const calc = s.match(/^calc\((.+)\)$/);
  if (calc) {
    // "50% - 29px" / "50% + 69px" / "100% - 2px"
    const m = calc[1].match(/^(-?[\d.]+)%\s*([+-])\s*(-?[\d.]+)px$/);
    if (m) return (parseFloat(m[1]) / 100) * base + (m[2] === "-" ? -1 : 1) * parseFloat(m[3]);
    const p = calc[1].match(/^(-?[\d.]+)%$/); if (p) return (parseFloat(p[1]) / 100) * base;
    const px = calc[1].match(/^(-?[\d.]+)px$/); if (px) return parseFloat(px[1]);
    return null;
  }
  if (s.endsWith("%")) return (parseFloat(s) / 100) * base;
  if (s.endsWith("px")) return parseFloat(s);
  if (/^-?[\d.]+$/.test(s)) return parseFloat(s);
  return null;
};

const isTextish = (n: BrainwaveNode): boolean => n.tag === "p" || n.tag === "span" || (n.ch ?? []).some((c) => c.tag === "#") || ((n.ch ?? []).length > 0 && (n.ch ?? []).every((c) => c.tag === "#" || c.tag === "br" || isTextish(c)));
const textOf = (n: BrainwaveNode): string => (n.ch ?? []).map((c) => (c.tag === "#" ? c.text ?? "" : c.tag === "br" ? "\n" : textOf(c))).join("");

/** 자식의 상자를 부모 크기로 푼다. position:absolute 가 아니면(contents 등) null */
export function childBox(n: BrainwaveNode, parent: Box): Box | null {
  const st = n.st ?? {};
  if (st.display === "contents") return null;
  const l = num(st.left, parent.w), r = num(st.right, parent.w), t = num(st.top, parent.h), b = num(st.bottom, parent.h);
  let w = num(st.width, parent.w), h = num(st.height, parent.h);
  if (w === null && l !== null && r !== null) w = parent.w - l - r;
  if (h === null && t !== null && b !== null) h = parent.h - t - b;
  /*
   * 글 노드는 높이가 없다(글 양에 따라 늘어난다). 부모 높이로 치면 같은 줄의
   * 다른 글과 전부 겹쳐 띠를 못 나눈다 — 줄간 × 줄 수로 어림한다.
   */
  if (h === null && isTextish(n)) {
    const lh = num(st.lineHeight, 0) ?? (num(st.fontSize, 0) ?? 16) * 1.4;
    const text = textOf(n);
    const ww = w ?? parent.w;
    const fs = num(st.fontSize, 0) ?? 16;
    const perLine = Math.max(1, Math.floor(ww / (fs * 0.55)));
    const lines = text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)), 0);
    h = lh * lines;
  }
  let x = l ?? (r !== null && w !== null ? parent.w - r - w : 0);
  let y = t ?? (b !== null && h !== null ? parent.h - b - h : 0);
  if (w === null) w = parent.w - (l ?? 0) - (r ?? 0);
  if (h === null) h = parent.h - (t ?? 0) - (b ?? 0);
  /* translate(-50%) 류 — 가운데 맞춤 */
  const tf = st.transform ?? "";
  if (/translateX\(-50%\)/.test(tf)) x -= w / 2;
  if (/translateY\(-50%\)/.test(tf)) y -= h / 2;
  if (/translateY\(100%\)/.test(tf)) y += h;
  return { x: parent.x + x, y: parent.y + y, w: Math.max(0, w), h: Math.max(0, h) };
}

const isBoxy = (n: BrainwaveNode) => {
  const st = n.st ?? {};
  return Boolean(st.backgroundColor || st.backgroundImage || st.borderWidth || st.boxShadow || st.borderRadius || st.maskImage);
};
const hasImg = (n: BrainwaveNode): boolean => (n.ch ?? []).some((c) => c.tag === "img" || hasImg(c));
const isGradient = (n: BrainwaveNode) => /gradient/.test(n.st?.backgroundImage ?? "") || Boolean(n.st?.mixBlendMode);
/*
 * 글이 들어 있는 노드는 '배경'이 될 수 없다.
 *
 * 배경으로 빠진 노드는 원래 절대좌표 그대로 무대 전체에 깔린다. 사진·색 판이라면
 * 그게 맞지만, 푸터의 어두운 패널처럼 링크·저작권 글줄을 품은 노드가 배경으로
 * 빠지면 그 글이 재배치된 항목들 위에 겹쳐 찍힌다 — 폰 화면에서 "문의"가
 * 구독 안내문 위에 얹혀 보이던 것이 정확히 이것이었다(실측 7곳).
 */
const containsText = (n: BrainwaveNode): boolean =>
  (n.ch ?? []).some((c) => (c.tag === "#" && (c.text ?? "").trim().length > 1) || containsText(c));

const isLeafNode = (n: BrainwaveNode) => n.tag === "img" || n.tag === "p" || n.tag === "span" || n.tag === "br" || (n.ch ?? []).some((c) => c.tag === "#");

/** display:contents 래퍼를 풀어 실제 상자를 가진 자식 목록으로 */
function realChildren(n: BrainwaveNode, parent: Box): Item[] {
  const out: Item[] = [];
  for (const c of n.ch ?? []) {
    if (c.tag === "#") continue;
    if ((c.st ?? {}).display === "contents") { out.push(...realChildren(c, parent)); continue; }
    if (c.st?.display === "none") continue;
    const b = childBox(c, parent);
    if (!b || b.w <= 0 || b.h <= 0) continue;
    out.push({ node: c, box: b, frame: parent });
  }
  return out;
}

function bbox(items: Array<{ box: Box }>): Box {
  const x1 = Math.min(...items.map((i) => i.box.x)), y1 = Math.min(...items.map((i) => i.box.y));
  const x2 = Math.max(...items.map((i) => i.box.x + i.box.w)), y2 = Math.max(...items.map((i) => i.box.y + i.box.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** 겹치지 않는 구간으로 나눈다(axis: y 면 가로 띠, x 면 세로 칼럼) */
function split<T extends { box: Box }>(items: T[], axis: "x" | "y", gap = 2): T[][] {
  const s = (b: Box) => (axis === "y" ? b.y : b.x), e = (b: Box) => (axis === "y" ? b.y + b.h : b.x + b.w);
  const sorted = [...items].sort((a, b) => s(a.box) - s(b.box));
  const groups: T[][] = [];
  let cur: T[] = [], end = -Infinity;
  for (const it of sorted) {
    if (cur.length && s(it.box) >= end - gap) { groups.push(cur); cur = []; end = -Infinity; }
    cur.push(it); end = Math.max(end, e(it.box));
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * 묶음을 재배치 트리로. depth 로 무한 재귀를 막는다.
 * 잎으로 둘 조건: 노드가 하나인데 더 쪼갤 수 없거나(글·사진·카드), 자식이 없을 때.
 */
export function layoutItems(items: Item[], depth = 0, target = 390): MobileLayout {
  const box = bbox(items);
  if (items.length === 1) {
    const { node, box: nb, frame } = items[0];
    /*
     * 글만 담은 묶음(제목+설명)은 쪼개지 않는다 — 가운데 맞춤이 부모에 걸려 있다.
     *
     * 바탕·테두리가 있다고 무조건 통째로 두면 안 된다. 예전에는 isBoxy 이기만 하면
     * 잎으로 확정했는데, 그러면 배경색이 깔린 '섹션 전체'(폭 1,600)까지 카드로 보고
     * 한 덩어리로 만든다. 폰에서는 그게 27% 로 줄어 16px 글자가 4.4px 이 됐다 —
     * 읽을 수 없는 크기다(실측).
     *
     * 카드로 볼 만한 크기(폰 폭의 1.6배 이내)일 때만 통째로 둔다. 그보다 넓으면
     * 안을 더 쪼갠다 — 바탕은 아래에서 배경으로 따로 빠지므로 모양은 남는다.
     */
    const boxyCard = isBoxy(node) && nb.w <= target * 1.6;
    if (depth > 8 || isLeafNode(node) || boxyCard || isTextish(node)) return { kind: "leaf", box: nb, frame, nodes: [node] };
    const kids = realChildren(node, nb);
    if (kids.length < 2) return { kind: "leaf", box: nb, frame, nodes: [node] };
    /* 부모를 거의 다 덮는 자식은 배경 */
    const area = nb.w * nb.h;
    const bg = kids.filter((k) => k.box.w * k.box.h >= area * 0.82 && !containsText(k.node) && (k.node.tag === "img" || isBoxy(k.node) || (k.node.ch ?? []).some((c) => c.tag === "img")));
    const rest = kids.filter((k) => !bg.includes(k));
    if (!rest.length) return { kind: "leaf", box: nb, frame, nodes: [node] };
    const inner = layoutItems(rest, depth + 1, target);
    /* 자식이 더 안 나뉘면 이 노드를 통째로 잎으로 */
    if (inner.kind === "leaf" && bg.length === 0) return { kind: "leaf", box: nb, frame, nodes: [node] };
    return { kind: "stack", box: nb, bg: bg.map((b) => b.node), items: inner.kind === "stack" && inner.bg.length === 0 ? inner.items : [inner], node };
  }
  const bands = split(items, "y");
  if (bands.length > 1) return { kind: "stack", box, bg: [], items: bands.map((b) => layoutItems(b, depth + 1, target)) };
  /* 한 줄이 폰 폭의 1.6배 안이면(60% 이상 크기로 들어가면) 쪼개지 않는다 — 숫자+설명 같은 짝이 갈라진다 */
  if (box.w <= target * 1.6) return { kind: "leaf", box, frame: items[0].frame, nodes: items.map((i) => i.node) };
  const cols = split(items, "x");
  if (cols.length > 1) return { kind: "stack", box, bg: [], items: cols.map((c) => layoutItems(c, depth + 1, target)) };
  /*
   * 겹쳐 있어 못 나눈다. 흔한 경우가 '섹션 전체를 덮는 사진·색 바탕 + 그 위의 글'
   * (첫 화면). 묶음을 거의 다 덮는 것은 배경으로 빼고 나머지를 다시 나눈다 —
   * 안 그러면 배경 때문에 글까지 한 덩어리로 1/4 로 줄어든다.
   */
  const area = box.w * box.h;
  const isBgLike = (it: Item) => it.box.w * it.box.h >= area * 0.5 && !containsText(it.node) && (it.node.tag === "img" || isBoxy(it.node) || hasImg(it.node) || isGradient(it.node));
  const bg = items.filter(isBgLike);
  const rest = items.filter((i) => !bg.includes(i));
  if (bg.length && rest.length && depth < 10) {
    const inner = layoutItems(rest, depth + 1, target);
    return { kind: "stack", box, bg: bg.map((b) => b.node), items: inner.kind === "stack" && inner.bg.length === 0 ? inner.items : [inner] };
  }
  return { kind: "leaf", box, frame: items[0].frame, nodes: items.map((i) => i.node) };
}

export function layoutPage(root: BrainwaveNode, w: number, h: number, target = 390): MobileLayout {
  const pageBox = { x: 0, y: 0, w, h };
  const kids = realChildren(root, pageBox);
  const area = w * h;
  const bg = kids.filter((k) => k.box.w * k.box.h >= area * 0.95 && !containsText(k.node));
  const rest = kids.filter((k) => !bg.includes(k));
  const inner = layoutItems(rest, 0, target);
  return { kind: "stack", box: pageBox, bg: bg.map((b) => b.node), items: inner.kind === "stack" && inner.bg.length === 0 ? inner.items : [inner] };
}
