"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LayoutTemplate, List, LoaderCircle, Monitor, Pencil, Plus, Redo2, RotateCcw, Save, Smartphone, Sparkles, Trash2, Type, Undo2, X } from "lucide-react";
import type { LandingPageData } from "../lib/landing/page-data";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";
import { BrainwaveTemplatePicker } from "./brainwave-template-picker";
import { BrainwavePage, loadBrainwavePage, menuItemsOf, type BrainwavePageData } from "./brainwave-page";
import { brainwaveSections } from "../lib/landing/brainwave/button-action";
import { resizeImage, uploadImage } from "./landing-media-field";

/*
 * Brainwave.io 킷 페이지 자리 편집기.
 *
 * 페이지는 킷 그대로이고, 손대는 것은 둘뿐이다 — 글 자리와 사진 자리.
 *   · 글을 누르면 그 자리에서 고친다(contentEditable). 줄바꿈은 Enter.
 *   · 사진을 누르면 파일을 골라 바꾼다(스토리지에 올리고 주소만 저장).
 *   · 위쪽에서 26장 중 다른 페이지로 바꿀 수 있다 — 바꾸면 고친 글은 그 페이지
 *     노드 id 와 맞지 않으므로 버린다(물어본 뒤).
 * 칸을 옮기거나 색을 바꾸는 기능은 없다 — 킷 구조를 그대로 지키기 위해서다.
 */
type Over = { texts: Record<string, string>; images: Record<string, string>; links: Record<string, string>; sizes: Record<string, number>; hidden: string[] };

/* 버튼 판에서 고르는 이동 — contact(기본)·none 은 그대로, url 은 주소, sec 는 "sec:N"(섹션 스크롤) */
type LinkMode = "contact" | "url" | "none" | "sec";
type BtnPanel = { id: string; textId: string | null; label: string; mode: LinkMode; url: string; sec: number };

/* 저장된 링크 값("contact"·"none"·"sec:N"·주소) → 판에서 고르는 모드·값 */
function parseLink(saved: string): { mode: LinkMode; url: string; sec: number } {
  if (saved === "none" || saved === "contact") return { mode: saved, url: "", sec: 0 };
  const m = saved.match(/^sec:(\d+)$/);
  if (m) return { mode: "sec", url: "", sec: Number(m[1]) };
  return { mode: "url", url: saved, sec: 0 };
}

/* 판에서 고른 것 → 저장할 링크 값("" 은 기본 그대로 = 항목 삭제) */
function serializeLink(mode: LinkMode, url: string, sec: number): string {
  if (mode === "sec") return `sec:${sec}`;
  if (mode !== "url") return mode;
  const u = url.trim();
  return /^(https?:\/\/|tel:|mailto:)/i.test(u) ? u : u ? `https://${u}` : "";
}

type TokenBalance = { purchased: number; used: number; remaining: number; packSize: number };

export function BrainwaveEditor({
  data,
  onClose,
  onSave,
  projectId = null,
  business = { name: "", summary: "" },
}: {
  data: LandingPageData;
  onClose: () => void;
  onSave: (data: LandingPageData) => void;
  /** AI 수정(토큰 차감)에 필요 — 없으면 AI 칸이 숨는다 */
  projectId?: string | null;
  business?: { name: string; summary: string };
}) {
  const init = data.brainwave!;
  const [page, setPage] = useState(init.page);
  const [over, setOver] = useState<Over>({ texts: { ...init.texts }, images: { ...init.images }, links: { ...(init.links ?? {}) }, sizes: { ...(init.sizes ?? {}) }, hidden: [...(init.hidden ?? [])] });
  const [history, setHistory] = useState<Over[]>([]);
  const [future, setFuture] = useState<Over[]>([]);
  const [meta, setMeta] = useState<BrainwavePageData | null>(null);
  const [editing, setEditing] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  /*
   * 보는 폭 — 제품 정책과 같게 둘뿐이다: PC / 모바일 (태블릿 모드 없음, ≤640 은 모바일).
   * 폰에서 열면 모바일 모드로 시작한다 — 지금 기기에서 보이는 그대로를 고치게.
   */
  const [view, setView] = useState<"pc" | "mobile">(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? "mobile" : "pc",
  );
  const VIEW_W = { pc: 1600, mobile: 390 } as const;
  /* 미리보기 — 손님이 보는 그대로(테두리·클릭 없음) */
  const [previewMode, setPreviewMode] = useState(false);

  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingImage = useRef<string | null>(null);

  useEffect(() => { loadBrainwavePage(page).then(setMeta).catch(() => setMeta(null)); }, [page]);

  /*
   * AI 로 고치기 — "전부 우리 가게 말투로", "가격은 25,000원" 같은 지시 한 줄.
   * 서버가 글 자리 목록을 보고 바꿀 자리만 돌려준다. 토큰은 쓴 만큼 차감되고,
   * 잔액이 모자라면 충전 결제로 보낸다. 결과는 되돌리기 한 번으로 전부 취소된다.
   */
  const [ai, setAi] = useState<{ open: boolean; instruction: string; busy: boolean; note: string; balance: TokenBalance | null; planId: string; packAmount: number }>({
    open: false, instruction: "", busy: false, note: "", balance: null, planId: "", packAmount: 9900,
  });
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/landing/ai-tokens`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { planId?: string; balance?: TokenBalance; pack?: { amount: number } }) => setAi((s) => ({ ...s, balance: j.balance ?? null, planId: j.planId ?? "", packAmount: j.pack?.amount ?? 9900 })))
      .catch(() => {});
  }, [projectId]);
  const runAi = async () => {
    if (!projectId || ai.busy || ai.instruction.trim().length < 2) return;
    const snapshot = finishText();
    setAi((s) => ({ ...s, busy: true, note: "" }));
    try {
      const res = await fetch(`/api/projects/${projectId}/landing/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: ai.instruction, page, texts: snapshot.texts, business }),
      });
      const j = (await res.json().catch(() => ({}))) as { texts?: Record<string, string>; changed?: number; balance?: TokenBalance; error?: { code?: string; message?: string } };
      if (!res.ok) {
        setAi((s) => ({ ...s, busy: false, note: j.error?.message ?? "AI 수정에 실패했습니다.", balance: j.balance ?? s.balance }));
        return;
      }
      if (j.texts && Object.keys(j.texts).length) commit({ ...snapshot, texts: { ...snapshot.texts, ...j.texts } });
      setAi((s) => ({ ...s, busy: false, instruction: "", note: `${j.changed ?? 0}개 자리를 고쳤습니다. 마음에 안 들면 되돌리기(↶)를 누르세요.`, balance: j.balance ?? s.balance }));
    } catch {
      setAi((s) => ({ ...s, busy: false, note: "연결이 끊겼습니다. 다시 시도해 주세요." }));
    }
  };
  const tokenPayHref = ai.planId ? `/plan/pay?planId=${encodeURIComponent(ai.planId)}&product=tokens` : "";

  const commit = (next: Over) => {
    setHistory((h) => [...h.slice(-40), over]);
    setFuture([]);
    setOver(next);
  };
  const undo = () => { const prev = history.at(-1); if (!prev) return; setHistory((h) => h.slice(0, -1)); setFuture((f) => [over, ...f]); setOver(prev); };
  const redo = () => { const nxt = future[0]; if (!nxt) return; setFuture((f) => f.slice(1)); setHistory((h) => [...h, over]); setOver(nxt); };

  /*
   * 글 자리 — 그 자리에서 고친다. 고르는 순간 오른쪽에 텍스트 판이 떠서
   * 내용·크기를 세세하게 만질 수 있다(화면의 글자와 양방향으로 같이 움직인다).
   */
  const pickText = (id: string, el: HTMLElement) => {
    if (editing?.el === el) return;
    finishText();
    /*
     * 머리글의 가로 메뉴 줄이면 그 자리 편집 대신 메뉴 판을 연다 —
     * 항목 이름과 '누르면 어디로'를 항목별로 정한다(Wix 메뉴 관리 식).
     */
    const current = over.texts[id] ?? meta?.slots.text.find((t) => t.id === id)?.text ?? el.innerText;
    const items = menuItemsOf(current);
    if (items) {
      setSecCount(brainwaveSections(document.querySelector(".bw-editor-canvas") ?? document).length);
      setMenu({
        id,
        items: items.map((name, i) => ({ name, ...parseLink(over.links[`${id}@${i}`] ?? "none") })),
      });
      return;
    }
    setMenu(null);
    el.contentEditable = "plaintext-only";
    el.focus();
    setEditing({ id, el });
    setSizeTarget(id);
    setDraftText(el.innerText);
    histPushed.current = false;
    el.oninput = () => setDraftText(el.innerText);
  };
  /* 텍스트 판의 내용 칸 — 화면의 글자와 같은 값을 비춘다 */
  const [draftText, setDraftText] = useState("");
  /* 판에서 한 글자라도 고치면 그 편집 전 상태를 한 번만 히스토리에 넣는다(타자마다 쌓지 않게) */
  const histPushed = useRef(false);
  /*
   * 판의 내용 칸으로 고칠 때는 DOM 을 직접 만지지 않는다 — innerText 대입은
   * React 가 아는 텍스트 노드를 갈아치워 다음 렌더에서 removeChild 오류가 난다.
   * 오버라이드 상태로 흘려 React 가 그리게 한다(같은 요소라 editing.el 은 유지).
   */
  const typeInPanel = (value: string) => {
    if (!editing) return;
    setDraftText(value);
    if (!histPushed.current) { histPushed.current = true; setHistory((h) => [...h.slice(-40), over]); setFuture([]); }
    const original = meta?.slots.text.find((t) => t.id === editing.id)?.text ?? "";
    setOver((o) => {
      const texts = { ...o.texts };
      if (value === original) delete texts[editing.id]; else texts[editing.id] = value;
      return { ...o, texts };
    });
  };
  /*
   * 글씨 크기 — 마지막으로 고른 글 자리에 적용된다.
   * 프리셋 네 단 + 미세 슬라이더(70~150%). 킷 칸은 절대좌표라 그 밖은 잘린다.
   */
  const [sizeTarget, setSizeTarget] = useState<string | null>(null);
  const SIZE_STEPS: Array<[number, string]> = [[0.85, "작게"], [1, "보통"], [1.15, "크게"], [1.3, "더 크게"]];
  const applySize = (scale: number) => {
    if (!sizeTarget) return;
    const sizes = { ...over.sizes };
    if (scale === 1) delete sizes[sizeTarget]; else sizes[sizeTarget] = scale;
    commit({ ...over, sizes });
  };
  /* 고치던 글을 마무리하고, 반영된 값을 돌려준다 — 저장 때 setState 가 늦어
     옛 값을 저장하는 일이 있었다 */
  const finishText = (): Over => {
    if (!editing) return over;
    const { id, el } = editing;
    el.contentEditable = "false";
    el.oninput = null;
    const text = el.innerText;
    const original = meta?.slots.text.find((t) => t.id === id)?.text ?? "";
    const next = { ...over, texts: { ...over.texts } };
    if (text === original) delete next.texts[id]; else next.texts[id] = text;
    setEditing(null);
    setSizeTarget(null);
    histPushed.current = false;
    if (JSON.stringify(next.texts) !== JSON.stringify(over.texts)) { commit(next); return next; }
    return over;
  };

  /*
   * 버튼 자리 — 판을 열어 글자와 '누르면 어디로'를 한 번에 고친다.
   * 버튼 글은 그 자리 편집 대신 여기서 고친다(버튼을 누르는 순간 이동이 먼저냐
   * 글이 먼저냐가 모호해서 — 판 하나로 합쳤다).
   */
  const [btn, setBtn] = useState<BtnPanel | null>(null);
  const pickButton = (id: string) => {
    finishText();
    setMenu(null);
    const textSlot = meta?.slots.text.find((s) => s.id.startsWith(`I${id};`)) ?? null;
    const label = textSlot ? over.texts[textSlot.id] ?? textSlot.text : "";
    setSecCount(brainwaveSections(document.querySelector(".bw-editor-canvas") ?? document).length);
    setBtn({ id, textId: textSlot?.id ?? null, label, ...parseLink(over.links[id] ?? "contact") });
  };
  const applyBtn = () => {
    if (!btn) return;
    const texts = { ...over.texts };
    if (btn.textId) {
      const original = meta?.slots.text.find((s) => s.id === btn.textId)?.text ?? "";
      if (btn.label === original) delete texts[btn.textId]; else texts[btn.textId] = btn.label;
    }
    const links = { ...over.links };
    /* 주소는 https/tel/mailto 만 — "www.…" 처럼 오면 https 를 붙여 준다 */
    const normalized = serializeLink(btn.mode, btn.url, btn.sec);
    if (normalized === "contact" || normalized === "") delete links[btn.id]; else links[btn.id] = normalized;
    commit({ ...over, texts, links });
    setBtn(null);
  };

  /*
   * 메뉴 판 — 머리글의 가로 메뉴 줄을 눌렀을 때. 항목별 이름·링크를 정한다.
   * 항목은 3~6개(3개 밑으로 줄면 메뉴 줄로 인식되지 않아 링크가 죽는다),
   * 이름은 8자까지(같은 이유 — 모바일 숨김 판정과 기준을 공유한다).
   */
  const [menu, setMenu] = useState<{ id: string; items: Array<{ name: string; mode: LinkMode; url: string; sec: number }> } | null>(null);
  /* 섹션 개수·미리 내려가 보기 — '섹션으로 이동'을 고를 때 어느 칸인지 눈으로 확인시킨다 */
  const [secCount, setSecCount] = useState(0);
  const jumpToSection = (n: number) => {
    const els = brainwaveSections(document.querySelector(".bw-editor-canvas") ?? document);
    els[Math.min(n, Math.max(0, els.length - 1))]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const applyMenu = () => {
    if (!menu) return;
    const kept = menu.items.filter((m) => m.name.trim());
    if (kept.length < 3) return;
    /* 간격은 지금 글의 공백을 그대로 살리고, 모자라면 4칸으로 잇는다 */
    const current = over.texts[menu.id] ?? meta?.slots.text.find((t) => t.id === menu.id)?.text ?? "";
    const seps = current.match(/\s{4,}/g) ?? [];
    const joined = kept.map((m, i) => (i ? (seps[i - 1] ?? "    ") + m.name.trim() : m.name.trim())).join("");
    const original = meta?.slots.text.find((t) => t.id === menu.id)?.text ?? "";
    const texts = { ...over.texts };
    if (joined === original) delete texts[menu.id]; else texts[menu.id] = joined;
    const links = { ...over.links };
    for (const k of Object.keys(links)) if (k.startsWith(`${menu.id}@`)) delete links[k];
    kept.forEach((m, i) => {
      const v = serializeLink(m.mode, m.url, m.sec);
      if (v && v !== "none") links[`${menu.id}@${i}`] = v;
    });
    commit({ ...over, texts, links });
    setMenu(null);
  };

  /*
   * 숨기기('삭제') — 킷 트리는 그대로 두고 그 자리만 안 그린다.
   * 섹션을 숨기면 데스크톱은 아래가 그만큼 올라오고, 복원은 숨김 목록에서 한다.
   */
  const hide = (id: string) => {
    finishText();
    setMenu(null);
    setBtn(null);
    setCtx(null);
    if (over.hidden.includes(id)) return;
    commit({ ...over, hidden: [...over.hidden, id] });
  };
  const restore = (id: string) => commit({ ...over, hidden: over.hidden.filter((h) => h !== id) });
  const [hiddenOpen, setHiddenOpen] = useState(false);
  /* 숨긴 id 가 뭐였는지 사람이 읽게 — 글 미리보기·사진·섹션 이름 */
  const hiddenLabel = (id: string): string => {
    const slot = meta?.slots.text.find((s) => s.id === id);
    if (slot) return `글 — ${(over.texts[id] ?? slot.text).slice(0, 24)}`;
    if (meta?.slots.image.some((s) => s.id === id)) return "사진";
    const sec = meta?.root.ch?.find((n) => n.id === id);
    if (sec) return `섹션 — ${sec.name || id}`;
    return `자리 ${id}`;
  };

  /* 우클릭 메뉴(Wix 식) — 글/사진/버튼/섹션에서 숨기기·편집을 바로 연다 */
  const [ctx, setCtx] = useState<{ x: number; y: number; entries: Array<{ label: string; danger?: boolean; act: () => void }> } | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("scroll", close, { capture: true }); };
  }, [ctx]);
  const onStageContext = (e: React.MouseEvent) => {
    if (previewMode) return;
    const target = e.target as HTMLElement;
    const textEl = target.closest<HTMLElement>("[data-bw-text]");
    const imgEl = target.closest<HTMLElement>("[data-bw-image]");
    const btnEl = target.closest<HTMLElement>("[data-bw-btn]");
    /* 섹션 = 킷 트리 최상위 그룹 — 조상의 data-bw-node(편집기에서만 붙는다)로 찾는다 */
    const sectionIds = new Set((meta?.root.ch ?? []).map((n) => n.id).filter(Boolean) as string[]);
    let secId: string | null = null;
    for (let el: HTMLElement | null = target; el; el = el.parentElement) {
      const nid = el.dataset?.bwNode;
      if (nid && sectionIds.has(nid)) { secId = nid; break; }
    }
    const entries: Array<{ label: string; danger?: boolean; act: () => void }> = [];
    if (textEl) {
      const id = textEl.dataset.bwText!;
      entries.push({ label: "글 고치기", act: () => pickText(id, textEl) });
      entries.push({ label: "이 글 숨기기", danger: true, act: () => hide(id) });
    }
    if (imgEl) {
      const id = imgEl.dataset.bwImage!;
      entries.push({ label: "사진 바꾸기", act: () => pickImage(id) });
      entries.push({ label: "이 사진 숨기기", danger: true, act: () => hide(id) });
    }
    if (btnEl && !textEl) {
      const id = btnEl.dataset.bwBtn!;
      entries.push({ label: "버튼 설정", act: () => pickButton(id) });
      entries.push({ label: "이 버튼 숨기기", danger: true, act: () => hide(id) });
    }
    if (secId) entries.push({ label: "섹션 통째로 숨기기", danger: true, act: () => hide(secId!) });
    if (!entries.length) return;
    e.preventDefault();
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 190), y: Math.min(e.clientY, window.innerHeight - entries.length * 40 - 16), entries });
  };

  /* 사진 자리 — 파일 고르기 */
  const pickImage = (id: string) => { finishText(); setMenu(null); pendingImage.current = id; fileRef.current?.click(); };
  const onFile = async (file?: File) => {
    const id = pendingImage.current;
    if (!file || !id) return;
    setUploading(id); setError("");
    try {
      const url = await uploadImage(await resizeImage(file, "hero"), "hero");
      commit({ ...over, images: { ...over.images, [id]: url } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 올리지 못했습니다.");
    } finally {
      setUploading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const changePage = (next: string) => {
    if (next === page) return;
    const dirty = Object.keys(over.texts).length + Object.keys(over.images).length > 0;
    if (dirty && !window.confirm("페이지를 바꾸면 이 페이지에서 고친 글·사진은 사라집니다. 바꿀까요?")) return;
    finishText();
    setMenu(null);
    commit({ texts: {}, images: {}, links: {}, sizes: {}, hidden: [] });
    setSizeTarget(null);
    setPage(next);
  };

  const save = () => {
    const final = finishText();
    onSave({ ...data, brainwave: { page, texts: final.texts, images: final.images, links: final.links, sizes: final.sizes, hidden: final.hidden }, content: [] });
  };

  const changed = Object.keys(over.texts).length + Object.keys(over.images).length + Object.keys(over.sizes).length + over.hidden.length;

  return (
    <div className={`landing-visual-builder bw-editor ${projectId && ai.open ? "with-ai" : ""}`} role="dialog" aria-modal="true" aria-label="홈페이지 에디터">
      <header className="bw-editor-bar">
        <div className="bw-editor-left">
          <strong>에디터</strong>
          <button type="button" className="bw-editor-pick" onClick={() => setPicking(true)}>
            <LayoutTemplate size={15} /> {BRAINWAVE_PAGES.find((p) => p.id === page)?.ko ?? "템플릿"}<span className="bw-editor-pick-x"> · 바꾸기</span>
          </button>
          <div className="bw-editor-views" role="group" aria-label="보는 폭">
            <button type="button" className={view === "pc" ? "on" : ""} onClick={() => setView("pc")} title="PC 화면"><Monitor size={15} /> PC</button>
            <button type="button" className={view === "mobile" ? "on" : ""} onClick={() => setView("mobile")} title="모바일 화면"><Smartphone size={15} /> 모바일</button>
          </div>
          <button type="button" className={`bw-editor-preview ${previewMode ? "on" : ""}`} title={previewMode ? "편집으로" : "미리보기"} onClick={() => { finishText(); setMenu(null); setPreviewMode((v) => !v); }}>
            {previewMode ? <><Pencil size={14} /><span className="bw-editor-pick-x"> 편집으로</span></> : <><Eye size={14} /><span className="bw-editor-pick-x"> 미리보기</span></>}
          </button>
        </div>
        <div className="bw-editor-right">
          {over.hidden.length ? (
            <button type="button" className={`bw-editor-hiddenbtn ${hiddenOpen ? "on" : ""}`} onClick={() => { finishText(); setMenu(null); setBtn(null); setHiddenOpen((v) => !v); }} title="숨긴 자리 보기">
              <EyeOff /> {over.hidden.length}
            </button>
          ) : null}
          <button type="button" onClick={undo} disabled={!history.length} title="되돌리기"><Undo2 /></button>
          <button type="button" onClick={redo} disabled={!future.length} title="다시"><Redo2 /></button>
          {projectId ? <button type="button" className={`bw-editor-ai ${ai.open ? "on" : ""}`} onClick={() => setAi((s) => ({ ...s, open: !s.open }))} title="AI 로 고치기"><Sparkles /> AI</button> : null}
          <button type="button" className="bw-editor-save" onClick={save}><Save /> 저장</button>
          <button type="button" onClick={() => { finishText(); onClose(); }} title="닫기"><X /></button>
        </div>
      </header>
      {error ? <p className="bw-editor-error">{error}</p> : null}
      {/* 텍스트 판 — 글자를 고르면 오른쪽에 떠서 내용·크기를 세세하게 고친다(Wix 식 도킹 패널) */}
      {!previewMode && editing && sizeTarget ? (
        <aside className="bw-inspector" role="dialog" aria-label="텍스트 편집">
          <header>
            <strong><Type size={15} /> 텍스트</strong>
            <button type="button" onClick={finishText} title="닫기"><X size={16} /></button>
          </header>
          <label className="bw-ins-field">
            <span>내용</span>
            <textarea
              value={draftText}
              rows={Math.min(6, Math.max(2, draftText.split("\n").length + 1))}
              maxLength={2000}
              onChange={(e) => typeInPanel(e.target.value)}
            />
            <small>화면의 글자를 직접 눌러 고쳐도 됩니다.</small>
          </label>
          <div className="bw-ins-field">
            <span>글씨 크기 <b>{Math.round((over.sizes[sizeTarget] ?? 1) * 100)}%</b></span>
            <input
              type="range"
              min={70}
              max={150}
              step={5}
              value={Math.round((over.sizes[sizeTarget] ?? 1) * 100)}
              onChange={(e) => applySize(Number(e.target.value) / 100)}
              aria-label="글씨 크기(%)"
            />
            <div className="bw-ins-steps" role="group" aria-label="크기 프리셋">
              {SIZE_STEPS.map(([scale, label]) => (
                <button
                  key={scale}
                  type="button"
                  className={(over.sizes[sizeTarget] ?? 1) === scale ? "on" : ""}
                  onClick={() => applySize(scale)}
                >{label}</button>
              ))}
            </div>
          </div>
          <button type="button" className="bw-ins-done" onClick={finishText}>완료</button>
        </aside>
      ) : null}
      {/* 메뉴 판 — 머리글 가로 메뉴를 누르면 항목별 이름·링크를 정한다(Wix 메뉴 관리 식) */}
      {!previewMode && menu ? (
        <aside className="bw-inspector bw-menu-panel" role="dialog" aria-label="메뉴 관리">
          <header>
            <strong><List size={15} /> 메뉴 관리</strong>
            <button type="button" onClick={() => setMenu(null)} title="닫기"><X size={16} /></button>
          </header>
          <p className="bw-menu-hint">항목 이름(8자까지)과 누르면 갈 곳을 정합니다. 모바일 화면에는 가로 메뉴가 표시되지 않습니다.</p>
          {menu.items.map((m, i) => (
            <div className="bw-menu-item" key={i}>
              <div className="bw-menu-row">
                <input
                  value={m.name}
                  maxLength={8}
                  aria-label={`메뉴 ${i + 1} 이름`}
                  onChange={(e) => { const items = [...menu.items]; items[i] = { ...m, name: e.target.value.replace(/\s+/g, " ") }; setMenu({ ...menu, items }); }}
                />
                <select
                  value={m.mode}
                  aria-label={`메뉴 ${i + 1} 이동`}
                  onChange={(e) => { const mode = e.target.value as LinkMode; const items = [...menu.items]; items[i] = { ...m, mode }; setMenu({ ...menu, items }); if (mode === "sec") jumpToSection(m.sec); }}
                >
                  <option value="none">이동 없음</option>
                  <option value="contact">문의 양식</option>
                  {secCount > 1 ? <option value="sec">섹션으로 이동</option> : null}
                  <option value="url">주소(URL)</option>
                </select>
                <button
                  type="button"
                  title={menu.items.length <= 3 ? "메뉴는 3개까지 줄일 수 있습니다" : "삭제"}
                  disabled={menu.items.length <= 3}
                  onClick={() => setMenu({ ...menu, items: menu.items.filter((_, j) => j !== i) })}
                ><Trash2 size={14} /></button>
              </div>
              {m.mode === "url" ? (
                <input
                  className="bw-menu-url"
                  placeholder="예: https://smartstore.naver.com/…"
                  maxLength={600}
                  value={m.url}
                  onChange={(e) => { const items = [...menu.items]; items[i] = { ...m, url: e.target.value }; setMenu({ ...menu, items }); }}
                />
              ) : null}
              {m.mode === "sec" ? (
                <select
                  className="bw-menu-url"
                  value={m.sec}
                  aria-label={`메뉴 ${i + 1} 이동할 섹션`}
                  onChange={(e) => { const sec = Number(e.target.value); const items = [...menu.items]; items[i] = { ...m, sec }; setMenu({ ...menu, items }); jumpToSection(sec); }}
                >
                  {Array.from({ length: secCount }, (_, s) => (
                    <option key={s} value={s}>{s === 0 ? "맨 위(1번 섹션)" : `${s + 1}번 섹션`}</option>
                  ))}
                </select>
              ) : null}
            </div>
          ))}
          {menu.items.length < 6 ? (
            <button type="button" className="bw-menu-add" onClick={() => setMenu({ ...menu, items: [...menu.items, { name: "메뉴", mode: "none", url: "", sec: 0 }] })}>
              <Plus size={14} /> 항목 추가
            </button>
          ) : null}
          <div className="bw-btn-actions">
            <button type="button" onClick={() => setMenu(null)}>취소</button>
            <button type="button" className="bw-btn-apply" onClick={applyMenu} disabled={menu.items.filter((m) => m.name.trim()).length < 3}>적용</button>
          </div>
        </aside>
      ) : null}
      {/* 우클릭 메뉴 — Wix 식 컨텍스트 메뉴(숨기기·바로 편집) */}
      {ctx ? (
        <div className="bw-ctx" role="menu" style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()}>
          {ctx.entries.map((en, i) => (
            <button key={i} type="button" role="menuitem" className={en.danger ? "danger" : ""} onClick={() => { setCtx(null); en.act(); }}>{en.label}</button>
          ))}
        </div>
      ) : null}
      {/* 숨긴 자리 목록 — 복원은 여기서 */}
      {hiddenOpen && over.hidden.length ? (
        <aside className="bw-inspector bw-hidden-panel" role="dialog" aria-label="숨긴 자리">
          <header>
            <strong><EyeOff size={15} /> 숨긴 자리 {over.hidden.length}개</strong>
            <button type="button" onClick={() => setHiddenOpen(false)} title="닫기"><X size={16} /></button>
          </header>
          <p className="bw-menu-hint">숨긴 자리는 지워진 게 아니라 안 보일 뿐입니다 — 언제든 복원할 수 있습니다.</p>
          <ul className="bw-hidden-list">
            {over.hidden.map((id) => (
              <li key={id}>
                <span>{hiddenLabel(id)}</span>
                <button type="button" onClick={() => restore(id)}><RotateCcw size={13} /> 복원</button>
              </li>
            ))}
          </ul>
          <button type="button" className="bw-ins-done" onClick={() => { commit({ ...over, hidden: [] }); setHiddenOpen(false); }}>모두 복원</button>
        </aside>
      ) : null}
      {projectId && ai.open ? (
        <div className="bw-ai">
          <div className="bw-ai-row">
            <input
              value={ai.instruction}
              onChange={(e) => setAi((s) => ({ ...s, instruction: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") void runAi(); }}
              placeholder='예: "전부 우리 가게 말투로 바꿔줘. 가격은 25,000원, 성수동 카페야"'
              maxLength={1000}
              disabled={ai.busy}
            />
            <button type="button" onClick={() => void runAi()} disabled={ai.busy || ai.instruction.trim().length < 2 || (ai.balance ? ai.balance.remaining < 2000 : false)}>
              {ai.busy ? <><LoaderCircle className="spin" /> 고치는 중</> : "AI 로 고치기"}
            </button>
          </div>
          <div className="bw-ai-meta">
            {ai.balance ? (
              <span>
                남은 토큰 <b>{ai.balance.remaining.toLocaleString("ko-KR")}</b>
                {ai.balance.remaining < 2000 ? " — 충전이 필요합니다" : ` (페이지 전체 고치기 약 ${Math.max(0, Math.floor(ai.balance.remaining / 8000))}회)`}
              </span>
            ) : <span>토큰 잔액 확인 중…</span>}
            {tokenPayHref ? <a href={tokenPayHref}>토큰 20만 충전 · {ai.packAmount.toLocaleString("ko-KR")}원</a> : null}
            {ai.note ? <em>{ai.note}</em> : null}
          </div>
        </div>
      ) : null}
      {picking ? <BrainwaveTemplatePicker current={page} onPick={(id) => { setPicking(false); changePage(id); }} onClose={() => setPicking(false)} /> : null}
      <div className="bw-editor-stage" onClick={finishText} onContextMenu={onStageContext}>
        <div className={`bw-editor-canvas view-${view} ${previewMode ? "previewing" : ""}`} style={{ maxWidth: VIEW_W[view] }}>
          <BrainwavePage
            pageId={page}
            overrides={over}
            mode={view === "mobile" ? "mobile" : "desktop"}
            onPick={previewMode ? undefined : (kind, id, el) => (kind === "text" ? pickText(id, el) : kind === "image" ? pickImage(id) : pickButton(id))}
          />
          {uploading ? <div className="bw-editor-uploading"><LoaderCircle className="spin" /> 사진 올리는 중</div> : null}
        </div>
      </div>
      {btn ? (
        <div className="bw-btn-panel" role="dialog" aria-label="버튼 설정">
          <strong>이 버튼을 누르면</strong>
          <div className="bw-btn-opts" role="radiogroup">
            <label><input type="radio" name="bw-btn-dest" checked={btn.mode === "contact"} onChange={() => setBtn({ ...btn, mode: "contact" })} /> 문의·신청 양식으로 <small>페이지 아래 양식으로 내려갑니다</small></label>
            {secCount > 1 ? (
              <label><input type="radio" name="bw-btn-dest" checked={btn.mode === "sec"} onChange={() => { setBtn({ ...btn, mode: "sec" }); jumpToSection(btn.sec); }} /> 페이지 섹션으로 <small>이 페이지 안의 칸으로 내려갑니다</small></label>
            ) : null}
            <label><input type="radio" name="bw-btn-dest" checked={btn.mode === "url"} onChange={() => setBtn({ ...btn, mode: "url" })} /> 주소(URL) 열기 <small>스마트스토어·예약 페이지·전화 등</small></label>
            <label><input type="radio" name="bw-btn-dest" checked={btn.mode === "none"} onChange={() => setBtn({ ...btn, mode: "none" })} /> 아무 동작 없음</label>
          </div>
          {btn.mode === "sec" ? (
            <select
              className="bw-btn-url"
              value={btn.sec}
              aria-label="이동할 섹션"
              onChange={(e) => { const sec = Number(e.target.value); setBtn({ ...btn, sec }); jumpToSection(sec); }}
            >
              {Array.from({ length: secCount }, (_, s) => (
                <option key={s} value={s}>{s === 0 ? "맨 위(1번 섹션)" : `${s + 1}번 섹션`}</option>
              ))}
            </select>
          ) : null}
          {btn.mode === "url" ? (
            <input
              className="bw-btn-url"
              value={btn.url}
              placeholder="예: https://smartstore.naver.com/…  또는  tel:010-0000-0000"
              maxLength={600}
              autoFocus
              onChange={(e) => setBtn({ ...btn, url: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") applyBtn(); }}
            />
          ) : null}
          {btn.textId ? (
            <label className="bw-btn-label"><span>버튼 글자</span>
              <input value={btn.label} maxLength={80} onChange={(e) => setBtn({ ...btn, label: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") applyBtn(); }} />
            </label>
          ) : null}
          <div className="bw-btn-actions">
            <button type="button" onClick={() => setBtn(null)}>취소</button>
            <button type="button" className="bw-btn-apply" onClick={applyBtn}>적용</button>
          </div>
        </div>
      ) : null}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <p className="bw-editor-hint">
        {previewMode ? <><Eye /> 손님이 보는 그대로입니다.</> : <><Pencil /> 글·사진은 눌러서 고치고, 마우스 오른쪽 버튼으로 숨기기(삭제)·섹션 지우기를 할 수 있습니다.</>}
        {changed ? <b> 고친 자리 {changed}개</b> : null}
      </p>
    </div>
  );
}
