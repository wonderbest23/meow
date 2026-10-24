// 재사용 모바일 UI 검사기 — sweep(page, {screen, width}) 가 화면을 위→아래로 훑으며 8가지 문제를 찾고,
// 문제마다 빨간 테두리·번호표를 그린 스크린샷을 <OUT>/flags/NN-<screen>-<width>-<type>.png 로, 기록을 <OUT>/issues.jsonl 에 남긴다.
// 그대로 실행하지 않고 d-*.mjs·page.mjs 가 불러 쓴다. (OUT·BASE_URL 은 lib.mjs)
import fs from "node:fs";
import { S, sleep } from "./lib.mjs";

export const TYPES = {
  1: "상태블록 세로중앙 아님",
  2: "제목·본문·단추 간격",
  3: "외톨이 줄바꿈",
  4: "이동 단추 화살표 없음",
  5: "터치 영역 44px 미만",
  6: "같은 문구 중복",
  7: "잘림·겹침·가로스크롤",
  8: "고정 요소가 내용 가림",
};
const SLUG = { 1: "center", 2: "gap", 3: "orphan", 4: "chevron", 5: "tap", 6: "dup", 7: "overflow", 8: "cover" };

function nextNN() {
  const lock = `${S}/.lock`;
  for (let i = 0; i < 200; i++) { try { fs.mkdirSync(lock); break; } catch { const t = Date.now(); while (Date.now() - t < 20); } }
  const f = `${S}/.counter`;
  const n = (fs.existsSync(f) ? +fs.readFileSync(f, "utf8") : 0) + 1;
  fs.writeFileSync(f, String(n));
  fs.rmdirSync(lock);
  return String(n).padStart(3, "0");
}

/* ---------- 페이지 안에서 도는 검사 ---------- */
function INPAGE() {
  if (window.__sw) return;
  let seq = 0;
  const id = e => e.dataset.sw || (e.dataset.sw = String(++seq));
  const CS = e => getComputedStyle(e);
  const R = e => e.getBoundingClientRect();
  const ov = e => !!e.closest("[data-sw-overlay]");
  const shown = e => {
    if (!e || ov(e)) return false;
    const r = R(e); if (r.width < 2 || r.height < 2) return false;
    for (let a = e; a && a !== document.body; a = a.parentElement) { const s = CS(a); if (s.visibility === "hidden" || s.opacity === "0" || s.display === "none") return false; }
    if (e.closest("[aria-hidden=true], [inert], [hidden]")) return false;
    const d = e.closest("details:not([open])"); if (d && !e.closest("summary")) return false;
    return true;
  };
  const inRoot = e => { const sel = window.__swRoot; if (!sel) return true; const r = document.querySelector(sel); return !r || r.contains(e); };
  const clipRect = e => {
    const r = R(e); let t = Math.max(r.top, 0), b = Math.min(r.bottom, innerHeight), l = Math.max(r.left, 0), rt = Math.min(r.right, innerWidth);
    for (let a = e.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const s = CS(a);
      if (/(hidden|clip|auto|scroll)/.test(s.overflowY + s.overflowX)) { const q = R(a); t = Math.max(t, q.top); b = Math.min(b, q.bottom); l = Math.max(l, q.left); rt = Math.min(rt, q.right); }
      if (s.position === "fixed") break;
    }
    return { top: t, bottom: b, left: l, right: rt, width: rt - l, height: b - t };
  };
  const inView = e => { const r = R(e), c = clipRect(e); return c.height > Math.min(6, r.height / 2) && c.width > 1 && inRoot(e); };
  const hit = e => { const r = R(e); const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 2); const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || t.contains(e)); };
  const txt = e => (e.innerText || "").replace(/\s+/g, " ").trim();
  const lbl = e => (txt(e) || e.getAttribute("aria-label") || e.getAttribute("title") || e.getAttribute("placeholder") || e.tagName).slice(0, 40);
  const cls = e => { const c = (typeof e.className === "string" ? e.className : e.getAttribute("class") || "").trim(); return c.split(/\s+/).slice(0, 3).join(" ").slice(0, 90); };
  const INLINE = new Set(["SPAN", "B", "STRONG", "EM", "I", "A", "BR", "SMALL", "MARK", "SUP", "SUB", "CODE", "SVG", "IMG", "S", "U", "ABBR", "TIME", "WBR"]);
  const isLeaf = e => [...e.children].every(c => INLINE.has(c.tagName.toUpperCase()) && !/^(block|flex|grid|list-item|table)/.test(CS(c).display));
  const chrome = e => !!e.closest("nav, [role=tablist], [role=navigation], header, footer, [role=menubar]");
  const fixedAnc = e => { for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const p = CS(a).position; if (p === "fixed" || p === "sticky") return a; } return null; };
  const interactiveSel = "a[href], button, [role=button], [role=tab], [role=link], [role=checkbox], [role=radio], [role=switch], [role=menuitem], summary, select, input:not([type=hidden]), textarea";
  const textLeaves = (scope = document.body) => [...scope.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,dt,dd,label,button,a,span,div,strong,small,figcaption,td,th,em,b")]
    .filter(e => isLeaf(e) && txt(e).length > 0 && shown(e));

  // 화면의 주 스크롤 영역
  function scroller() {
    let best = null, bestA = 0;
    for (const e of document.querySelectorAll("body *")) {
      if (ov(e) || !inRoot(e)) continue;
      const s = CS(e); if (!/(auto|scroll)/.test(s.overflowY)) continue;
      if (e.scrollHeight <= e.clientHeight + 20) continue;
      const r = R(e); if (r.width < innerWidth * 0.6 || r.height < innerHeight * 0.35 || !shown(e)) continue;
      const a = r.width * Math.min(r.height, innerHeight); if (a > bestA) { best = e; bestA = a; }
    }
    const docScroll = document.documentElement.scrollHeight > innerHeight + 20;
    if (best && (!docScroll || window.__swRoot || bestA > innerWidth * innerHeight * 0.45)) return best;
    return null;
  }
  function scrollInfo() {
    const s = scroller();
    if (s) { s.dataset.swScroller = "1"; return { inner: true, top: s.scrollTop, max: s.scrollHeight - s.clientHeight, h: s.clientHeight, cls: cls(s) }; }
    return { inner: false, top: scrollY, max: document.documentElement.scrollHeight - innerHeight, h: innerHeight };
  }
  function scrollToY(y) { const s = document.querySelector("[data-sw-scroller]"); if (s) s.scrollTop = y; else scrollTo(0, y); }

  // 스크롤 영역의 눈에 보이는 범위(위쪽 고정 머리줄·아래쪽 고정 막대 제외)
  function area(exclude) {
    const s = document.querySelector("[data-sw-scroller]");
    let top = 0, bottom = innerHeight;
    if (s) { const r = R(s); top = Math.max(0, r.top); bottom = Math.min(innerHeight, r.bottom); }
    for (const e of document.querySelectorAll("body *")) {
      if (ov(e) || (exclude && (exclude.contains(e) || e.contains(exclude)))) continue;
      const p = CS(e).position; if (p !== "fixed" && p !== "sticky") continue;
      if (!shown(e)) continue;
      const r = R(e); if (r.width < innerWidth * 0.5) continue;
      if (r.top <= top + 4 && r.bottom > top && r.height < innerHeight * 0.3) top = r.bottom;
      else if (r.bottom >= bottom - 4 && r.top < bottom && r.top > innerHeight * 0.5) bottom = r.top;
    }
    return { top, bottom, h: bottom - top };
  }

  function union(els) { let t = 1e9, b = -1e9, l = 1e9, r = -1e9; for (const e of els) { const x = R(e); t = Math.min(t, x.top); b = Math.max(b, x.bottom); l = Math.min(l, x.left); r = Math.max(r, x.right); } return { top: t, bottom: b, left: l, right: r }; }
  const buttonLike = e => {
    if (!e.matches("a[href], button, [role=button], [role=link]")) return false;
    const s = CS(e); const r = R(e);
    if (r.height < 30 || r.width < 56 || r.height > 80) return false;
    const bg = s.backgroundColor; const hasBg = bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg);
    const hasBorder = parseFloat(s.borderTopWidth) >= 1 && s.borderTopStyle !== "none" && parseFloat(s.borderRadius) >= 4;
    return hasBg || hasBorder;
  };

  // 1·2: 상태 블록
  function stateBlocks() {
    const out = [];
    const seen = new Set();
    for (const h of document.querySelectorAll("h1, h2, [role=heading]")) {
      if (!shown(h) || !inView(h) || chrome(h) || !hit(h)) continue;
      // 제목에서 위로 올라가며 단추를 품는 가장 작은 조상
      let E = null;
      for (let a = h.parentElement, d = 0; a && a !== document.body && d < 6; a = a.parentElement, d++) {
        const btn = [...a.querySelectorAll("a[href], button")].filter(b => shown(b) && !chrome(b) && !h.contains(b));
        if (btn.length) { E = a; break; }
      }
      if (!E || seen.has(E)) continue;
      { let bgimg = false; for (let a = E, d = 0; a && d < 4; a = a.parentElement, d++) if (CS(a).backgroundImage !== "none" && !/gradient/.test(CS(a).backgroundImage)) bgimg = true; if (bgimg || E.closest("[class*=preview], [class*=Preview], [class*=canvas], [class*=bw-]")) continue; }
      const t = txt(E); if (t.length > 260) continue;
      const leaves = textLeaves(E).filter(x => !x.matches("button, a") && !x.closest("button, a"));
      const btns = [...E.querySelectorAll("a[href], button")].filter(b => shown(b) && !chrome(b));
      if (btns.length > 3 || leaves.length > 5 || E.querySelectorAll("input, textarea, select, img, table, ul li:nth-child(4)").length) continue;
      seen.add(E);
      // 블록이 그 스크롤 영역에서 거의 혼자인가
      const otherEls = textLeaves().filter(x => inView(x) && !E.contains(x) && !x.contains(E) && !x.closest("nav, [role=tablist], header") && !fixedAnc(x) && hit(x));
      const others = otherEls.map(txt).join("").length;
      const vis = [...E.querySelectorAll("*")].filter(x => shown(x) && (x.children.length === 0 || isLeaf(x)) && !(fixedAnc(x) && !fixedAnc(E)));
      const u = union(vis.length ? vis : [E]);
      const A = area(E);
      for (const x of otherEls) { const q = R(x); if (q.top >= u.bottom - 2) A.bottom = Math.min(A.bottom, q.top); else if (q.bottom <= u.top + 2) A.top = Math.max(A.top, q.bottom); }
      A.h = A.bottom - A.top;
      const item = { E: id(E), h: id(h), alone: others < 40, others, label: txt(h).slice(0, 40), cls: cls(E) };
      if (item.alone && A.h > 200) {
        const off = (u.top + u.bottom) / 2 - (A.top + A.bottom) / 2;
        item.center = { off: Math.round(off), areaH: Math.round(A.h), pct: Math.round(Math.abs(off) / A.h * 100), areaTop: Math.round(A.top), areaBottom: Math.round(A.bottom), top: Math.round(u.top), bottom: Math.round(u.bottom) };
      }
      // 간격: 제목 → 다음 글, 마지막 글 → 첫 단추
      const order = [...E.querySelectorAll("*")].filter(x => shown(x));
      const hi = order.indexOf(h);
      const after = order.slice(hi + 1).filter(x => !h.contains(x));
      const firstBtn = after.find(x => x.matches("a[href], button") && !chrome(x));
      const textAfter = after.filter(x => isLeaf(x) && txt(x).length > 0 && !x.matches("a, button") && !x.closest("a, button") && (!firstBtn || (firstBtn.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING)));
      const firstText = textAfter[0];
      if (firstText) item.g1 = Math.round(R(firstText).top - R(h).bottom), item.t1 = id(firstText);
      if (firstBtn) {
        const prev = textAfter.length ? textAfter[textAfter.length - 1] : h;
        const g2 = Math.round(R(firstBtn).top - R(prev).bottom);
        if (g2 > -2) { item.g2 = g2; item.b = id(firstBtn); item.t2 = id(prev); }
      }
      item.compact = leaves.length <= 3 && btns.length <= 2;
      out.push(item);
    }
    return out;
  }

  // 3: 외톨이 줄
  function lines(e) {
    const L = [];
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    let n; const rg = document.createRange();
    while ((n = w.nextNode())) {
      const s = n.data;
      for (let i = 0; i < s.length; i++) {
        if (/\s/.test(s[i])) { if (L.length) L[L.length - 1].t += " "; continue; }
        rg.setStart(n, i); rg.setEnd(n, i + 1);
        const r = rg.getClientRects()[0]; if (!r || r.width === 0) continue;
        const mid = (r.top + r.bottom) / 2;
        const last = L[L.length - 1];
        if (last && Math.abs(last.mid - mid) < Math.max(4, r.height * 0.45)) last.t += s[i];
        else L.push({ mid, t: s[i], top: r.top, bottom: r.bottom });
      }
    }
    return L.map(l => ({ ...l, t: l.t.trim() }));
  }
  function orphans() {
    const out = [];
    const cand = [...document.querySelectorAll("h1,h2,h3,h4,h5,p,li,button,a,label,dd,dt,figcaption,strong,span,small,div")]
      .filter(e => isLeaf(e) && shown(e) && inView(e) && !e.closest("[contenteditable=true], textarea, pre, code"));
    for (const e of cand) {
      const t = txt(e); const strong = /^(H\d|BUTTON|A|LABEL|DT|FIGCAPTION|STRONG)$/.test(e.tagName); if (t.length < 6 || t.length > (strong ? 180 : 90)) continue;
      if (!hit(e) && !e.matches("h1,h2,h3,h4,h5")) continue;
      if (e.parentElement && isLeaf(e.parentElement) && txt(e.parentElement) === t && cand.includes(e.parentElement)) continue; // 같은 글을 둘러싼 부모로 중복 판정
      const s = CS(e); if (s.whiteSpace === "nowrap") continue;
      const L = lines(e); if (L.length < 2) continue;
      const last = L[L.length - 1].t; const core = last.replace(/[.,!?…·:;)"'”’」』\]\s]/g, "");
      const hangul = (core.match(/[가-힣]/g) || []).length;
      const tokens = last.split(/\s+/).filter(Boolean);
      const isShort = hangul > 0 && hangul <= 3 && core.length <= 4;
      const lone = tokens.length === 1 && core.length <= 8;
      if (isShort || lone) out.push({ id: id(e), label: t.slice(0, 50), last, n: L.length, tag: e.tagName.toLowerCase(), cls: cls(e), detail: `${L.length}줄, 마지막 줄 "${last}"` });
    }
    return out;
  }

  // 4: 화살표 없는 이동 단추
  function chevrons() {
    const out = [];
    for (const e of document.querySelectorAll("a[href], [role=link]")) {
      if (!shown(e) || !inView(e) || chrome(e) || !buttonLike(e) || !hit(e)) continue;
      const href = e.getAttribute("href") || "";
      if (/^(#|javascript:|mailto:|tel:)/.test(href)) continue;
      const t = txt(e); if (t.length < 2 || t.length > 28) continue;
      if (e.querySelector("img, picture, video")) continue;
      const hasIcon = !!e.querySelector("svg, [class*=chev], [class*=arrow], [class*=icon]") || /[→›>↗»⟩]/.test(t);
      const pse = ["::before", "::after"].some(p => { const c = getComputedStyle(e, p).content; return c && c !== "none" && c !== "normal" && c !== '""'; }) || CS(e).backgroundImage !== "none";
      if (!hasIcon && !pse) out.push({ id: id(e), label: t, href: href.slice(0, 80), cls: cls(e), detail: `→ ${href.slice(0, 60)}` });
    }
    return out;
  }

  // 5: 터치 영역
  function taps() {
    const out = [];
    for (let e of document.querySelectorAll(interactiveSel)) {
      if (e.matches("input[type=checkbox], input[type=radio]")) { const l = e.closest("label") || (e.id && document.querySelector(`label[for="${e.id}"]`)); if (l) e = l; }
      if (!shown(e) || !inView(e) || !hit(e)) continue;
      if (e.closest("[data-sw-overlay]")) continue;
      const r = R(e);
      if (r.width >= 44 && r.height >= 44) continue;
      if (e.tagName === "A" && e.closest("p, li, dd") && txt(e.closest("p, li, dd")).length > txt(e).length + 10) continue; // 문장 속 링크
      const pa = e.parentElement?.closest(interactiveSel); if (pa && R(pa).width >= 44 && R(pa).height >= 44) continue;
      const ext = ["::before", "::after"].some(p => { const s = getComputedStyle(e, p); return s.content !== "none" && s.position === "absolute" && (parseFloat(s.top) < 0 || parseFloat(s.left) < 0 || parseFloat(s.bottom) < 0); });
      if (ext) continue;
      out.push({ id: id(e), label: lbl(e), size: `${Math.round(r.width)}×${Math.round(r.height)}`, cls: cls(e), detail: `${Math.round(r.width)}×${Math.round(r.height)}` });
    }
    return out;
  }

  // 6: 중복 문구 (페이지 전체)
  function dups() {
    const map = new Map();
    for (const e of textLeaves()) {
      if (!inRoot(e)) continue;
      { const r0 = R(e); if (r0.bottom > 0 && r0.top < innerHeight && !hit(e)) continue; }
      if (chrome(e) || e.closest("[role=tabpanel][hidden], [role=dialog][aria-hidden=true]")) continue;
      const r = R(e); if (r.width < 3 || r.height < 3) continue;
      const t = txt(e).replace(/[.\s]+$/, ""); if (t.length < 8) continue;
      if (/^[\d,.\s원%:·\-~+]+$/.test(t)) continue;
      if (!map.has(t)) map.set(t, []);
      const arr = map.get(t);
      if (arr.some(x => x.contains(e) || e.contains(x))) continue;
      arr.push(e);
    }
    const out = [];
    for (const [t, arr] of map) if (arr.length >= 2) out.push({ ids: arr.map(id), label: t.slice(0, 60), n: arr.length, cls: cls(arr[0]), detail: `${arr.length}번` });
    return out;
  }

  // 7: 잘림·겹침·가로스크롤
  function overflow() {
    const out = [];
    const sw = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (sw > 1) {
      const off = [...document.querySelectorAll("body *")].filter(e => shown(e) && R(e).right > innerWidth + 1 && !e.closest("[data-sw-overlay]")).filter(e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll|hidden|clip)/.test(CS(a).overflowX)) return false; return true; });
      const top = off.filter(e => !off.some(o => o !== e && o.contains(e))).slice(0, 4);
      out.push({ ids: top.map(id), label: `가로 스크롤 ${sw}px`, kind: "hscroll", cls: top.map(cls).join(" | "), detail: top.map(e => lbl(e) + " R=" + Math.round(R(e).right)).join(", ") });
    }
    for (const e of document.querySelectorAll("body *")) {
      if (!shown(e) || !inView(e) || !isLeaf(e) || !txt(e) || !inRoot(e)) continue;
      const s = CS(e);
      if (/(auto|scroll)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflowY)) continue;
      if (e.matches("input, textarea, select")) continue;
      if (s.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) out.push({ ids: [id(e)], label: txt(e).slice(0, 40), kind: "ellipsis", cls: cls(e), detail: `말줄임 (${e.scrollWidth}>${e.clientWidth})` });
      else if (/hidden|clip/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 2) out.push({ ids: [id(e)], label: txt(e).slice(0, 40), kind: "clipX", cls: cls(e), detail: `가로 잘림 (${e.scrollWidth}>${e.clientWidth})` });
      else if (/hidden|clip/.test(s.overflowY) && s.webkitLineClamp === "none" && e.scrollHeight > e.clientHeight + 3 && e.clientHeight > 8) out.push({ ids: [id(e)], label: txt(e).slice(0, 40), kind: "clipY", cls: cls(e), detail: `세로 잘림 (${e.scrollHeight}>${e.clientHeight})` });
      else if (s.webkitLineClamp !== "none" && e.scrollHeight > e.clientHeight + 3) out.push({ ids: [id(e)], label: txt(e).slice(0, 40), kind: "clamp", cls: cls(e), detail: `줄수 제한으로 잘림` });
      else { const r = R(e); if (r.right > innerWidth + 1 || r.left < -1) out.push({ ids: [id(e)], label: txt(e).slice(0, 40), kind: "offscreen", cls: cls(e), detail: `화면 밖 L=${Math.round(r.left)} R=${Math.round(r.right)}` }); }
    }
    // 겹침: 글·단추끼리
    const els = [...document.querySelectorAll(interactiveSel + ", h1,h2,h3,h4,p,li,label,span,strong,small")]
      .filter(e => shown(e) && inView(e) && (isLeaf(e) || e.matches(interactiveSel)) && txt(e) && !fixedAnc(e) && hit(e));
    const seenPair = new Set();
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a)) continue;
      const A = clipRect(a), B = clipRect(b);
      const ix = Math.min(A.right, B.right) - Math.max(A.left, B.left), iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (ix > 4 && iy > 4) {
        // 글자 실제 상자로 다시 확인(줄 높이 여백 때문에 생기는 가짜 겹침 제외)
        const g = el => { if (el.matches(interactiveSel) && !/^inline$/.test(CS(el).display)) return [R(el)]; const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].filter(q => q.width > 0); };
        const ga = g(a), gb = g(b); let real = false;
        const cl = (q, C) => ({ left: Math.max(q.left, C.left), right: Math.min(q.right, C.right), top: Math.max(q.top, C.top), bottom: Math.min(q.bottom, C.bottom) });
        for (const p0 of ga) for (const q0 of gb) { const p = cl(p0, A), q = cl(q0, B); const x = Math.min(p.right, q.right) - Math.max(p.left, q.left), y = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top); if (x > 3 && y > 3) real = true; }
        if (!real) continue;
        const k = id(a) + "-" + id(b); if (seenPair.has(k)) continue; seenPair.add(k);
        out.push({ ids: [id(a), id(b)], label: `${lbl(a).slice(0, 18)} ✕ ${lbl(b).slice(0, 18)}`, kind: "overlap", cls: cls(a) + " | " + cls(b), detail: `겹침 ${Math.round(ix)}×${Math.round(iy)}` });
      }
    }
    return out.slice(0, 30);
  }

  // 8: 바닥까지 내렸을 때 고정 요소 아래에 깔린 내용
  function covers() {
    const out = [];
    const fixed = [...document.querySelectorAll("body *")].filter(e => { const p = CS(e).position; return (p === "fixed" || (p === "sticky" && R(e).bottom >= innerHeight - 4)) && shown(e) && !ov(e); })
      .filter(e => { const r = R(e); return r.top > innerHeight * 0.45 && r.top < innerHeight && r.height < innerHeight * 0.6; })
      .filter((e, _, a) => !a.some(o => o !== e && o.contains(e)));
    const content = [...document.querySelectorAll(interactiveSel + ", h1,h2,h3,h4,p,li,label,img")].filter(e => shown(e) && inView(e) && !fixedAnc(e) && (isLeaf(e) || e.matches(interactiveSel + ", img")) && (txt(e) || e.matches("img, input, textarea, select") || e.querySelector("svg, img")));
    for (const f of fixed) {
      const F = R(f);
      const under = content.filter(c => {
        if (f.contains(c) || c.contains(f)) return false;
        const C = R(c); const ix = Math.min(C.right, F.right) - Math.max(C.left, F.left), iy = Math.min(C.bottom, F.bottom) - Math.max(C.top, F.top);
        if (ix < 6 || iy < 6) return false;
        const x = (Math.max(C.left, F.left) + Math.min(C.right, F.right)) / 2, y = (Math.max(C.top, F.top) + Math.min(C.bottom, F.bottom)) / 2;
        const t = document.elementFromPoint(x, Math.min(y, innerHeight - 1)); return t && f.contains(t);
      });
      if (under.length) out.push({ ids: [id(f), ...under.slice(0, 4).map(id)], label: `${lbl(f).slice(0, 20)} 아래: ${under.slice(0, 2).map(lbl).join(", ").slice(0, 40)}`, cls: cls(f), detail: `${under.length}개 깔림 (바닥까지 내린 상태)` });
    }
    return out;
  }

  // 표시
  function draw(groups) {
    clear();
    const root = document.createElement("div"); root.dataset.swOverlay = "1";
    root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    let k = 0;
    for (const g of groups) {
      for (const sid of g.ids) {
        const e = document.querySelector(`[data-sw="${sid}"]`); if (!e) continue;
        const r = R(e); if (r.bottom < 0 || r.top > innerHeight) continue;
        const b = document.createElement("div");
        b.style.cssText = `position:fixed;left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;border:3px solid #ff1f1f;box-sizing:border-box;border-radius:4px;box-shadow:0 0 0 1px #fff;`;
        root.appendChild(b);
      }
      const first = g.ids.map(s => document.querySelector(`[data-sw="${s}"]`)).find(e => e && R(e).bottom > 0 && R(e).top < innerHeight);
      if (first) {
        const r = R(first);
        const t = document.createElement("div"); t.textContent = g.tag;
        const above = r.top > 22; const y = above ? r.top - 22 : Math.min(r.bottom + 4, innerHeight - 20);
        t.style.cssText = `position:fixed;left:${Math.max(2, Math.min(r.left - 3, innerWidth - 180))}px;top:${y + (k % 2) * 0}px;background:#ff1f1f;color:#fff;font:700 11px/16px -apple-system,sans-serif;padding:1px 5px;border-radius:3px;max-width:${innerWidth - 8}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
        root.appendChild(t);
      }
      k++;
    }
    document.body.appendChild(root);
  }
  function clear() { document.querySelectorAll("[data-sw-overlay]").forEach(e => e.remove()); }
  function reveal(sid) { const e = document.querySelector(`[data-sw="${sid}"]`); if (e) e.scrollIntoView({ block: "center", behavior: "instant" }); }
  function inViewIds(ids) { return ids.filter(s => { const e = document.querySelector(`[data-sw="${s}"]`); return e && inView(e); }); }
  window.__sw = { scrollInfo, scrollToY, stateBlocks, orphans, chevrons, taps, dups, overflow, covers, draw, clear, reveal, inViewIds };
}

const keyOf = (t, x) => t + ":" + (x.ids || [x.id]).join(",");

/**
 * sweep(page, { screen, width, maxSteps, note, url })
 * 화면을 위에서 아래로 훑는다. 찾은 문제를 flags/ 에 표시 스크린샷으로 남기고 issues.jsonl 에 적는다.
 */
export async function sweep(page, { screen, width, maxSteps = 8, note = "", skip = [], bottom = true, root = null } = {}) {
  width = width || page.viewport().width;
  await page.evaluate(INPAGE);
  await page.evaluate(r => { window.__swRoot = r; document.querySelectorAll("[data-sw-scroller]").forEach(e => delete e.dataset.swScroller); }, root);
  const info = await page.evaluate(() => window.__sw.scrollInfo());
  const seen = new Set();
  const records = [];
  const url = page.url().replace(/^https?:\/\/[^/]+/, "");
  const save = async (type, groups, stepTag) => {
    if (!groups.length || skip.includes(type)) return;
    const NN = nextNN();
    const file = `${S}/flags/${NN}-${screen}-${width}-${SLUG[type]}.png`;
    await page.evaluate(gs => window.__sw.draw(gs), groups.map((g, i) => ({ ids: g.ids || [g.id], tag: `#${type} ${TYPES[type]}${groups.length > 1 ? " " + (i + 1) : ""}${g.detail ? " · " + g.detail : ""}` })));
    await sleep(120);
    await page.screenshot({ path: file });
    await page.evaluate(() => window.__sw.clear());
    const rec = { NN, file, screen, width, type, typeName: TYPES[type], url, step: stepTag, note, items: groups.map(g => ({ label: g.label, detail: g.detail, cls: g.cls, href: g.href })) };
    records.push(rec);
    fs.appendFileSync(`${S}/issues.jsonl`, JSON.stringify(rec) + "\n");
  };
  const fresh = (t, arr) => arr.filter(x => { const k = keyOf(t, x); if (seen.has(k)) return false; seen.add(k); return true; });

  const steps = [];
  if (info.max <= 4) steps.push(0);
  else { for (let y = 0; y < info.max && steps.length < maxSteps - 1; y += Math.round(info.h * 0.8)) steps.push(y); steps.push(info.max); }
  let dupGroups = null;
  for (let si = 0; si < steps.length; si++) {
    if (steps.length > 1 || info.top !== steps[si]) { await page.evaluate(y => window.__sw.scrollToY(y), steps[si]); await sleep(450); }
    const tag = `s${si}`;
    const r = await page.evaluate(() => ({ sb: window.__sw.stateBlocks(), orph: window.__sw.orphans(), chev: window.__sw.chevrons(), tap: window.__sw.taps(), ovf: window.__sw.overflow() }));
    // 1 · 2
    const c1 = [], c2 = [];
    for (const b of r.sb) {
      if (b.center && b.center.pct > 15) c1.push({ ids: [b.E], label: b.label, cls: b.cls, detail: `중심 ${b.center.off > 0 ? "아래로" : "위로"} ${Math.abs(b.center.off)}px (영역 ${b.center.areaH}px의 ${b.center.pct}%)` });
      if (b.alone || b.compact) {
        const bad = [];
        if (b.g1 != null && Math.abs(b.g1 - 8) > 4) bad.push(`제목→글 ${b.g1}px`);
        if (b.g2 != null && Math.abs(b.g2 - 24) > 4) bad.push(`글→단추 ${b.g2}px`);
        if (bad.length) c2.push({ ids: [b.h, b.t1, b.b].filter(Boolean), label: b.label, cls: b.cls, detail: bad.join(", ") + " (기준 8·24)" });
      }
    }
    await save(1, fresh(1, c1), tag);
    await save(2, fresh(2, c2), tag);
    await save(3, fresh(3, r.orph), tag);
    await save(4, fresh(4, r.chev), tag);
    await save(5, fresh(5, r.tap), tag);
    const ovf = fresh(7, r.ovf);
    await save(7, ovf, tag);
    if (si === 0) dupGroups = await page.evaluate(() => window.__sw.dups());
  }
  // 6 중복: 첫 번째 것을 화면 가운데로
  for (const g of fresh(6, dupGroups || [])) {
    await page.evaluate(s => window.__sw.reveal(s), g.ids[0]); await sleep(300);
    const vis = await page.evaluate(ids => window.__sw.inViewIds(ids), g.ids);
    await save(6, [{ ...g, detail: `${g.n}번${vis.length < g.n ? ` (이 화면엔 ${vis.length}개)` : ""}` }], "dup");
  }
  // 8 바닥에서 가림
  if (bottom) {
    await page.evaluate(y => window.__sw.scrollToY(y), info.max + 2000); await sleep(500);
    const cv = await page.evaluate(() => window.__sw.covers());
    await save(8, fresh(8, cv), "bottom");
  }
  await page.evaluate(y => window.__sw.scrollToY(y), 0);
  const summary = records.map(r => `${r.NN} #${r.type} ${r.items.length}건 ${r.items.slice(0, 3).map(i => i.label + (i.detail ? `(${i.detail})` : "")).join(" / ").slice(0, 160)}`);
  console.log(`[${screen} ${width}] steps=${steps.length} inner=${info.inner} issues=${records.length}`); summary.forEach(s => console.log("   ", s));
  return records;
}

// 키보드가 올라온 상태(뷰포트 높이 520) 재현
export async function withKeyboard(page, selector, fn) {
  const vp = page.viewport();
  const el = await page.$(selector);
  if (!el) return null;
  try { await el.tap(); } catch { await page.evaluate(s => document.querySelector(s)?.focus(), selector); }
  await page.setViewport({ ...vp, height: 520 }); await sleep(800);
  const r = await fn();
  await page.setViewport(vp); await sleep(400);
  return r;
}
