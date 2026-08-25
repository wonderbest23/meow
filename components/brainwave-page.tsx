"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Urbanist, Rubik } from "next/font/google";
import { layoutPage, childBox, type MobileLayout, type Box } from "../lib/landing/brainwave/mobile-layout";

/*
 * 킷 글꼴 Gilroy 는 유료라 못 싣는다. 폭·굵기가 가장 가까운 무료 글꼴 Urbanist 를
 * 영문에 쓴다 — Pretendard 로만 받치면 글이 킷보다 넓어져 줄이 하나 더 생기고,
 * 칸이 고정이라 아래 글과 겹쳤다(상담 페이지 "Get a free consultancy…").
 * 빌드 때 내려받아 같이 배포하므로 보는 쪽에서 외부 요청이 없다.
 */
const latin = Urbanist({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--bw-latin", display: "swap" });
const rubik = Rubik({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--bw-rubik", display: "swap" });

/*
 * Brainwave.io 킷 페이지를 노드 그대로 그린다.
 *
 * scripts/brainwave-convert.py 가 만든 트리(절대 좌표, 1600px 캔버스)를 한 칸도
 * 바꾸지 않고 그린 뒤, 보는 쪽 폭에 맞춰 통째로 줄인다(transform: scale).
 * 그래서 어느 폭에서도 킷과 같은 비율이다 — 글이 다시 흐르거나 칸이 옮겨 가지
 * 않는다. 폰에서는 작게 보이지만 '정확히 그 페이지'다.
 *
 * 글과 사진은 노드 id 로 바꿔 끼운다(overrides). 그 밖의 것은 건드릴 수 없다.
 */
export type BrainwaveNode = {
  tag: string;
  id?: string;
  name?: string;
  st?: Record<string, string>;
  src?: string;
  text?: string;
  ch?: BrainwaveNode[];
};

export type BrainwavePageData = {
  id: string;
  w: number;
  h: number;
  root: BrainwaveNode;
  slots: { text: Array<{ id: string; text: string }>; image: Array<{ id: string; src: string }> };
};

export type BrainwaveOverrides = { texts?: Record<string, string>; images?: Record<string, string> };

/* 킷 글꼴 Gilroy 는 한글이 없다 — Pretendard 로 받친다. 크기·자간·줄간은 킷 값 그대로. */
const FONT_FALLBACK: Record<string, string> = {
  Gilroy: 'var(--bw-latin), Pretendard, "Pretendard Variable", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  Rubik: 'var(--bw-rubik), Pretendard, "Pretendard Variable", "Apple SD Gothic Neo", sans-serif',
};

function nodeStyle(st: Record<string, string> | undefined): CSSProperties {
  if (!st) return {};
  const out: Record<string, string> = { ...st };
  if (out.fontFamily && FONT_FALLBACK[out.fontFamily]) out.fontFamily = FONT_FALLBACK[out.fontFamily];
  /*
   * 사이트 전역에 `body * { letter-spacing: 0 !important }` 가 있어 인라인 자간이
   * 죽는다 — 킷 제목은 -2px 자간이라 그게 빠지면 한 줄이 더 생겨 아래 글과
   * 겹쳤다. 변수로 넘기고 더 센 규칙(.bw-canvas [style*=--bw-ls])이 다시 건다.
   */
  if (out.letterSpacing) { out["--bw-ls"] = out.letterSpacing; delete out.letterSpacing; }
  return out as CSSProperties;
}

export function BrainwaveNodeView({
  node,
  overrides,
  parentId,
  onPick,
}: {
  node: BrainwaveNode;
  overrides?: BrainwaveOverrides;
  parentId?: string;
  /** 편집기에서 — 글/사진 자리를 누르면 알린다 */
  onPick?: (kind: "text" | "image", id: string, el: HTMLElement) => void;
}) {
  const id = node.id ?? parentId;
  if (node.tag === "#") return <>{node.text}</>;
  if (node.tag === "br") return <br />;
  if (node.tag === "img") {
    const isPhoto = node.src && !node.src.endsWith(".svg");
    const src = (isPhoto && id && overrides?.images?.[id]) || node.src || "";
    return (
      <img
        alt=""
        src={src}
        style={nodeStyle(node.st)}
        draggable={false}
        data-bw-image={isPhoto && id ? id : undefined}
        onClick={onPick && isPhoto && id ? (e) => { e.stopPropagation(); onPick("image", id, e.currentTarget); } : undefined}
      />
    );
  }
  const hasText = node.ch?.some((c) => c.tag === "#");
  const text = hasText && node.id && overrides?.texts?.[node.id];
  /*
   * 킷의 단추(이름에 Button 이 든 노드)는 그림일 뿐이다. 공개 화면에서는 누르면
   * 아래 문의 양식(#landing-contact)으로 내려가게 한다 — 편집 중에는 글 고치기가
   * 우선이라 걸지 않는다.
   */
  const isButton = !onPick && /button/i.test(node.name ?? "");
  const goContact = isButton
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        const target = document.getElementById("landing-contact");
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    : undefined;
  /* 태그는 div/p/span 뿐이다 — 타입은 div 로 둔다 */
  const Tag = (["div", "p", "span"].includes(node.tag) ? node.tag : "div") as "div";
  const children: ReactNode = text !== undefined && text !== false
    ? text
    : node.ch?.map((c, i) => <BrainwaveNodeView key={i} node={c} overrides={overrides} parentId={id} onPick={onPick} />);
  return (
    <Tag
      style={nodeStyle(node.st)}
      data-bw-text={hasText && node.id ? node.id : undefined}
      data-bw-btn={isButton ? "" : undefined}
      role={isButton ? "button" : undefined}
      tabIndex={isButton ? 0 : undefined}
      onClick={onPick && hasText && node.id ? (e: React.MouseEvent<HTMLDivElement>) => { e.stopPropagation(); onPick("text", node.id!, e.currentTarget); } : goContact}
      onKeyDown={isButton ? (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.key === "Enter" || e.key === " ") document.getElementById("landing-contact")?.scrollIntoView({ behavior: "smooth" }); } : undefined}
    >
      {children}
    </Tag>
  );
}

/*
 * 모바일 자동 재배치(lib/landing/brainwave/mobile-layout.ts) 그리기.
 * stack 은 세로로 쌓고(배경은 뒤에 깔고), leaf 는 원래 좌표 그대로 폭에 맞춰 줄인다.
 */
function MobileView({ layout, width, overrides, onPick, parentBox }: { layout: MobileLayout; width: number; overrides?: BrainwaveOverrides; onPick?: (kind: "text" | "image", id: string, el: HTMLElement) => void; parentBox?: { x: number; w: number } }) {
  if (layout.kind === "leaf") {
    /*
     * 머리카락 두께 잎은 그리지 않는다.
     *
     * 킷의 예약 바에는 칸 사이 1px 세로 구분선(imgLine*.svg)이 있다. 가로로 나란할
     * 때는 얇은 줄이지만, 폰에서 세로로 쌓으면 폭 1px·높이 94px 짜리 '보이지 않는
     * 구멍'이 되어 매장 고르기와 날짜 고르기 사이가 뻥 뚫려 보였다(실측).
     * 폭이 몇 px 뿐인 잎은 세로 쌓기에서 아무 정보도 주지 못한다 — 건너뛴다.
     * (가로로 긴 1px 가로줄은 구분선 역할을 하므로 그대로 둔다.)
     */
    if (layout.box.w <= 6) return null;
    /*
     * 글만 있는 잎은 줄이지 않고 다시 흐르게 한다 — 769px 짜리 가운데 제목을 그대로
     * 줄이면 16px 이 된다. 75% 까지만 줄이고 나머지는 줄바꿈으로 받는다(zoom 은
     * transform 과 달리 높이에 반영되므로 아래 내용이 밀린다).
     */
    const textish = (n: BrainwaveNode): boolean => n.tag === "p" || n.tag === "span" || n.tag === "br" || n.tag === "#" || (n.tag !== "img" && (n.ch ?? []).length > 0 && (n.ch ?? []).every(textish));
    const textOnly = layout.nodes.every(textish);

    /*
     * 글이 읽을 수 없게 작아지면 줄이지 말고 다시 흐르게 한다.
     *
     * 아이콘이 하나 섞였다는 이유로 '글만 있는 잎'에서 빠지면, 넓은 줄이 통째로
     * 줄어들며 16px 글자가 4.4px 이 됐다(실측). 아무리 킷 모양을 지켜도 못 읽으면
     * 소용이 없다.
     *
     * 판정은 배율이 아니라 '줄인 뒤 실제 글자 크기'로 한다. 처음에는 배율 0.55 로
     * 잡았는데, 배율 0.65 짜리가 10.5px, 0.59 가 8.9px 로 남았다 — 원래 글자가
     * 작으면 배율이 높아도 못 읽는다. 12px 을 밑돌면 흐름 배치로 넘긴다
     * (흐름 배치의 최소 배율 0.75 와도 맞는 기준이다: 16px × 0.75 = 12px).
     */
    const rawScale = Math.min(1, width / Math.max(1, layout.box.w));
    const hasText = (n: BrainwaveNode): boolean => (n.ch ?? []).some((c) => (c.tag === "#" && (c.text ?? "").trim().length > 1) || hasText(c));
    /*
     * 이 잎에서 '실제 글이 찍히는' 가장 작은 글자 크기 — 상속을 따라 계산한다.
     *
     * 처음에는 명시된 fontSize 만 모았는데, 제목만 20px 로 명시되고 본문 글이
     * 크기 지정 없이(=기본 16) 들어 있는 잎에서 기준이 20 이 되어 통과해 버렸다.
     * 그 본문이 0.65 배로 줄면 10.5px — 실측으로 남아 있던 작은 글자가 이것이다.
     * 글자 크기는 부모에서 상속되므로, 글 노드에 닿을 때까지 물려 내려간 값으로 잰다.
     */
    const minFont = (n: BrainwaveNode, inherited = 16): number => {
      const own = parseFloat((n.st ?? {}).fontSize ?? "");
      const eff = Number.isFinite(own) && own > 0 ? own : inherited;
      const hasDirectText = (n.ch ?? []).some((c) => c.tag === "#" && (c.text ?? "").trim().length > 1);
      const kids = (n.ch ?? []).filter((c) => c.tag !== "#" && c.tag !== "br").map((c) => minFont(c, eff));
      return Math.min(hasDirectText ? eff : Infinity, ...(kids.length ? kids : [Infinity]));
    };
    const smallest = Math.min(...layout.nodes.map((n) => minFont(n)));
    const basis = Number.isFinite(smallest) ? smallest : 16;
    const tooSmallToRead = basis * rawScale < 12 && layout.nodes.some(hasText);

    if (textOnly || tooSmallToRead) {
      const s = Math.max(0.75, Math.min(1, width / Math.max(1, layout.box.w)));
      /* 킷 DOM 은 z 순서라 설명이 제목보다 앞에 올 수 있다 — 세로 위치대로 다시 세운다 */
      const flow = (n: BrainwaveNode, box: Box): BrainwaveNode => {
        const kids = (n.ch ?? []).map((c, i) => ({ c, i, y: c.tag === "#" || c.tag === "br" ? null : (childBox(c, box)?.y ?? null) }));
        const ordered = kids.every((k) => k.y === null) ? kids : [...kids].sort((a, b) => (a.y ?? a.i) - (b.y ?? b.i));
        /*
         * 사진·아이콘은 폭을 100% 로 늘리지 않는다.
         *
         * 이 흐름 배치는 원래 '글만 있는 잎' 전용이었다. 이제 글이 너무 작아지는
         * 잎도 여기로 오는데, 그 안에는 아이콘이 섞여 있다. 전부 100% 로 늘리면
         * 20px 짜리 아이콘이 화면 폭만큼 커진다. 원래 크기를 지키되 화면은 넘지 않게 둔다.
         */
        const isImg = n.tag === "img" || n.tag === "svg";
        const sizing: Record<string, string> = isImg
          ? { width: (n.st ?? {}).width ?? "auto", maxWidth: "100%", height: "auto" }
          : { width: "100%", maxWidth: "100%", height: "auto" };
        return {
          ...n,
          st: { ...(n.st ?? {}), position: "relative", left: "auto", right: "auto", top: "auto", bottom: "auto", transform: "none", whiteSpace: "pre-wrap", overflow: "visible", ...sizing },
          ch: ordered.map(({ c }) => (c.tag === "#" || c.tag === "br" ? c : flow(c, childBox(c, box) ?? box))),
        };
      };
      return (
        <div className="bwm-leaf bwm-text" style={{ width, alignSelf: "center" }}>
          <div className="bwm-flow" style={{ zoom: s, width: width / s }}>
            {[...layout.nodes].sort((a, b) => (childBox(a, layout.frame)?.y ?? 0) - (childBox(b, layout.frame)?.y ?? 0)).map((n, i) => <BrainwaveNodeView key={n.id ?? i} node={flow(n, childBox(n, layout.frame) ?? layout.box)} overrides={overrides} onPick={onPick} />)}
          </div>
        </div>
      );
    }
    const s = Math.min(1, width / Math.max(1, layout.box.w));
    const w = layout.box.w * s, h = layout.box.h * s;
    const dx = layout.box.x - layout.frame.x, dy = layout.box.y - layout.frame.y;
    /* 원래 줄에서 왼쪽·가운데·오른쪽 어디에 있었는지 그대로 — 전부 가운데로 모으면 킷과 달라진다 */
    let align: "flex-start" | "center" | "flex-end" = "center";
    if (parentBox && parentBox.w > layout.box.w * 1.15) {
      const c = layout.box.x + layout.box.w / 2, pc = parentBox.x + parentBox.w / 2;
      if (Math.abs(c - pc) > parentBox.w * 0.08) align = c < pc ? "flex-start" : "flex-end";
    }
    return (
      <div className="bwm-leaf" style={{ width: w, height: h, alignSelf: align }}>
        <div className="bwm-frame" style={{ width: layout.frame.w, height: layout.frame.h, transform: `translate(${-dx * s}px, ${-dy * s}px) scale(${s})` }}>
          {layout.nodes.map((n, i) => <BrainwaveNodeView key={n.id ?? i} node={n} overrides={overrides} onPick={onPick} />)}
        </div>
      </div>
    );
  }
  return (
    <div className="bwm-stack">
      {layout.bg.length ? (
        <div className="bwm-bg" aria-hidden="true">
          {layout.bg.map((n, i) => (
            <BrainwaveNodeView key={n.id ?? i} node={{ ...n, st: { ...(n.st ?? {}), position: "absolute", left: "0", top: "0", right: "0", bottom: "0", width: "100%", height: "100%", transform: "none" } }} overrides={overrides} />
          ))}
        </div>
      ) : null}
      <div className="bwm-items">
        {layout.items.map((it, i) => <MobileView key={i} layout={it} width={width} overrides={overrides} onPick={onPick} parentBox={layout.box} />)}
      </div>
    </div>
  );
}

/**
 * 1600 캔버스를 담는 무대. 폭을 재서 비율만큼 줄이고, 높이도 그만큼만 차지한다.
 * 폭이 640 이하면(또는 mode="mobile") 자동 재배치로 그린다.
 */
export function BrainwaveStage({
  page,
  overrides,
  onPick,
  maxWidth,
  className,
  mode = "auto",
}: {
  page: BrainwavePageData;
  overrides?: BrainwaveOverrides;
  onPick?: (kind: "text" | "image", id: string, el: HTMLElement) => void;
  maxWidth?: number;
  className?: string;
  /** auto: 폭 640 이하면 모바일 재배치 / desktop: 항상 줄이기 / mobile: 항상 재배치 */
  mode?: "auto" | "desktop" | "mobile";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { setScale(Math.min(1, el.clientWidth / page.w)); setWidth(el.clientWidth); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page.w]);
  const mobile = mode === "mobile" || (mode === "auto" && width > 0 && width <= 640);
  const target = Math.max(200, width - 32);
  const layout = useMemo(() => (mobile ? layoutPage(page.root, page.w, page.h, target) : null), [mobile, page, target]);
  if (mobile && layout) {
    return (
      <div ref={ref} className={`bw-stage bw-mobile ${latin.variable} ${rubik.variable} ${className ?? ""}`} style={{ maxWidth }}>
        {/* 양옆 16px 여백 — 잎이 화면 끝에 붙으면 글이 가장자리에 닿는다 */}
        {width > 0 ? <MobileView layout={layout} width={target} overrides={overrides} onPick={onPick} /> : null}
      </div>
    );
  }
  /*
   * 비율은 CSS 가 먼저 계산한다(tan(atan2(100cqw, 1600px)) — 길이 나눗셈 대신).
   * 서버에서 그린 HTML 도 첫 화면부터 맞는 크기로 서고, 자바스크립트는 그 값을
   * 같은 숫자로 덮어쓸 뿐이다(옛 브라우저 대비).
   */
  return (
    <div ref={ref} className={`bw-stage ${latin.variable} ${rubik.variable} ${className ?? ""}`} style={{ "--bw-w": page.w, "--bw-h": page.h, "--bw-js-scale": scale, maxWidth } as CSSProperties}>
      <div className="bw-fit">
        <div className="bw-canvas" style={{ width: page.w, height: page.h }}>
          <BrainwaveNodeView node={page.root} overrides={overrides} onPick={onPick} />
        </div>
      </div>
    </div>
  );
}

/* 페이지 JSON 은 큰 편(60~120KB)이라 고른 것만 불러온다 */
const cache = new Map<string, Promise<BrainwavePageData>>();
export function loadBrainwavePage(id: string): Promise<BrainwavePageData> {
  if (!/^[0-9]+-[0-9]+$/.test(id)) return Promise.reject(new Error("bad page id"));
  let p = cache.get(id);
  if (!p) {
    p = import(`../lib/landing/brainwave/pages/${id}.json`).then((m) => (m.default ?? m) as BrainwavePageData);
    cache.set(id, p);
  }
  return p;
}

export function BrainwavePage({ pageId, overrides, onPick, className, preloaded, mode }: { pageId: string; overrides?: BrainwaveOverrides; onPick?: (kind: "text" | "image", id: string, el: HTMLElement) => void; className?: string; preloaded?: BrainwavePageData | null; mode?: "auto" | "desktop" | "mobile" }) {
  const [page, setPage] = useState<BrainwavePageData | null>(preloaded && preloaded.id === pageId ? preloaded : null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (preloaded && preloaded.id === pageId) { setPage(preloaded); return; }
    let live = true;
    setPage(null);
    loadBrainwavePage(pageId).then((p) => live && setPage(p)).catch((e) => live && setErr(String(e)));
    return () => { live = false; };
  }, [pageId, preloaded]);
  if (err) return <p className="bw-error">페이지를 불러오지 못했습니다: {err}</p>;
  if (!page) return <div className="bw-loading" aria-busy="true" />;
  return <BrainwaveStage page={page} overrides={overrides} onPick={onPick} className={className} mode={mode} />;
}
