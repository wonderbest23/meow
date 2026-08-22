"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Urbanist, Rubik } from "next/font/google";

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

/**
 * 1600 캔버스를 담는 무대. 폭을 재서 비율만큼 줄이고, 높이도 그만큼만 차지한다.
 */
export function BrainwaveStage({
  page,
  overrides,
  onPick,
  maxWidth,
  className,
}: {
  page: BrainwavePageData;
  overrides?: BrainwaveOverrides;
  onPick?: (kind: "text" | "image", id: string, el: HTMLElement) => void;
  maxWidth?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / page.w));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page.w]);
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

export function BrainwavePage({ pageId, overrides, onPick, className, preloaded }: { pageId: string; overrides?: BrainwaveOverrides; onPick?: (kind: "text" | "image", id: string, el: HTMLElement) => void; className?: string; preloaded?: BrainwavePageData | null }) {
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
  return <BrainwaveStage page={page} overrides={overrides} onPick={onPick} className={className} />;
}
