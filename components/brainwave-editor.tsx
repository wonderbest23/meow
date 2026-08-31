"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, LayoutTemplate, LoaderCircle, Monitor, Pencil, Redo2, Save, Smartphone, Sparkles, Undo2, X } from "lucide-react";
import type { LandingPageData } from "../lib/landing/page-data";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";
import { BrainwaveTemplatePicker } from "./brainwave-template-picker";
import { BrainwavePage, loadBrainwavePage, type BrainwavePageData } from "./brainwave-page";
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
type Over = { texts: Record<string, string>; images: Record<string, string>; links: Record<string, string>; sizes: Record<string, number> };

/* 버튼 판에서 고르는 이동 — contact(기본)·none 은 그대로 저장, url 은 주소를 저장 */
type BtnPanel = { id: string; textId: string | null; label: string; mode: "contact" | "url" | "none"; url: string };

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
  const [over, setOver] = useState<Over>({ texts: { ...init.texts }, images: { ...init.images }, links: { ...(init.links ?? {}) }, sizes: { ...(init.sizes ?? {}) } });
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

  /* 글 자리 — 그 자리에서 고친다 */
  const pickText = (id: string, el: HTMLElement) => {
    if (editing?.el === el) return;
    finishText();
    el.contentEditable = "plaintext-only";
    el.focus();
    setEditing({ id, el });
    setSizeTarget(id);
  };
  /*
   * 글씨 크기 프리셋 — 마지막으로 고른 글 자리에 적용된다.
   * 자유 크기가 아니라 네 단이다: 킷 칸은 절대좌표라 크게 벗어나면 잘린다.
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
    const text = el.innerText;
    const original = meta?.slots.text.find((t) => t.id === id)?.text ?? "";
    const next = { ...over, texts: { ...over.texts } };
    if (text === original) delete next.texts[id]; else next.texts[id] = text;
    setEditing(null);
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
    const textSlot = meta?.slots.text.find((s) => s.id.startsWith(`I${id};`)) ?? null;
    const label = textSlot ? over.texts[textSlot.id] ?? textSlot.text : "";
    const saved = over.links[id] ?? "contact";
    const mode = saved === "contact" || saved === "none" ? saved : "url";
    setBtn({ id, textId: textSlot?.id ?? null, label, mode, url: mode === "url" ? saved : "" });
  };
  const applyBtn = () => {
    if (!btn) return;
    const texts = { ...over.texts };
    if (btn.textId) {
      const original = meta?.slots.text.find((s) => s.id === btn.textId)?.text ?? "";
      if (btn.label === original) delete texts[btn.textId]; else texts[btn.textId] = btn.label;
    }
    const links = { ...over.links };
    const url = btn.url.trim();
    /* 주소는 https/tel/mailto 만 — "www.…" 처럼 오면 https 를 붙여 준다 */
    const normalized = btn.mode !== "url" ? btn.mode : /^(https?:\/\/|tel:|mailto:)/i.test(url) ? url : url ? `https://${url}` : "";
    if (normalized === "contact" || normalized === "") delete links[btn.id]; else links[btn.id] = normalized;
    commit({ ...over, texts, links });
    setBtn(null);
  };

  /* 사진 자리 — 파일 고르기 */
  const pickImage = (id: string) => { finishText(); pendingImage.current = id; fileRef.current?.click(); };
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
    commit({ texts: {}, images: {}, links: {}, sizes: {} });
    setSizeTarget(null);
    setPage(next);
  };

  const save = () => {
    const final = finishText();
    onSave({ ...data, brainwave: { page, texts: final.texts, images: final.images, links: final.links, sizes: final.sizes }, content: [] });
  };

  const changed = Object.keys(over.texts).length + Object.keys(over.images).length + Object.keys(over.sizes).length;

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
          <button type="button" className={`bw-editor-preview ${previewMode ? "on" : ""}`} title={previewMode ? "편집으로" : "미리보기"} onClick={() => { finishText(); setPreviewMode((v) => !v); }}>
            {previewMode ? <><Pencil size={14} /><span className="bw-editor-pick-x"> 편집으로</span></> : <><Eye size={14} /><span className="bw-editor-pick-x"> 미리보기</span></>}
          </button>
        </div>
        <div className="bw-editor-right">
          <button type="button" onClick={undo} disabled={!history.length} title="되돌리기"><Undo2 /></button>
          <button type="button" onClick={redo} disabled={!future.length} title="다시"><Redo2 /></button>
          {projectId ? <button type="button" className={`bw-editor-ai ${ai.open ? "on" : ""}`} onClick={() => setAi((s) => ({ ...s, open: !s.open }))} title="AI 로 고치기"><Sparkles /> AI</button> : null}
          <button type="button" className="bw-editor-save" onClick={save}><Save /> 저장</button>
          <button type="button" onClick={() => { finishText(); onClose(); }} title="닫기"><X /></button>
        </div>
      </header>
      {error ? <p className="bw-editor-error">{error}</p> : null}
      {!previewMode && sizeTarget ? (
        <div className="bw-size-bar" role="group" aria-label="글씨 크기">
          <span>글씨 크기</span>
          {SIZE_STEPS.map(([scale, label]) => (
            <button
              key={scale}
              type="button"
              className={(over.sizes[sizeTarget] ?? 1) === scale ? "on" : ""}
              /* mousedown 에서 포커스를 뺏지 않아야 고치던 글이 닫히지 않는다 */
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySize(scale)}
            >{label}</button>
          ))}
        </div>
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
      <div className="bw-editor-stage" onClick={finishText}>
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
            <label><input type="radio" name="bw-btn-dest" checked={btn.mode === "url"} onChange={() => setBtn({ ...btn, mode: "url" })} /> 주소(URL) 열기 <small>스마트스토어·예약 페이지·전화 등</small></label>
            <label><input type="radio" name="bw-btn-dest" checked={btn.mode === "none"} onChange={() => setBtn({ ...btn, mode: "none" })} /> 아무 동작 없음</label>
          </div>
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
        {previewMode ? <><Eye /> 손님이 보는 그대로입니다.</> : <><Pencil /> 글·사진은 눌러서 고치고, 버튼은 눌러서 글자와 이동할 곳을 정합니다.</>}
        {changed ? <b> 고친 자리 {changed}개</b> : null}
      </p>
    </div>
  );
}
