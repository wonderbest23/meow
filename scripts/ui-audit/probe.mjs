// 빠른 확인 도구 — probe: 가로 넘침·잘린 글·화면 밖 단추, overlaps: 서로 겹친 단추·링크. studio-tabs.mjs 가 쓴다.
export const probe = page => page.evaluate(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const clipped = [];
  for (const e of document.querySelectorAll("body *")) {
    if (!vis(e) || !e.innerText || e.children.length > 3) continue;
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && /hidden|clip/.test(cs.overflowX) && cs.textOverflow !== "ellipsis" && e.innerText.trim().length < 80) clipped.push(e.tagName + "." + (e.className + "").slice(0, 40) + ": " + e.innerText.replace(/\s+/g, " ").slice(0, 40) + ` (${e.scrollWidth}>${e.clientWidth})`);
    if (cs.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) clipped.push("ELLIPSIS " + e.tagName + ": " + e.innerText.replace(/\s+/g, " ").slice(0, 50));
  }
  // offscreen right (horizontal overflow beyond viewport)
  const offR = [...document.querySelectorAll("button, a, h1, h2, h3, p, span")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > innerWidth + 1 && getComputedStyle(e).visibility !== "hidden"; }).slice(0, 8).map(e => e.tagName + ": " + e.innerText.replace(/\s+/g, " ").slice(0, 30) + " r=" + Math.round(e.getBoundingClientRect().right));
  return { overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, clipped: clipped.slice(0, 15), offR };
});
// overlap of interactive elements (buttons/links) that intersect each other but are not nested
export const overlaps = (page, root = "body") => page.evaluate(root => {
  const els = [...document.querySelectorAll(root + " button, " + root + " a, " + root + " [role=tab]")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== "hidden" && r.top < innerHeight && r.bottom > 0; });
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a)) continue;
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const ix = Math.min(A.right, B.right) - Math.max(A.left, B.left), iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (ix > 4 && iy > 4) {
      // check if one is actually on top (covered)
      out.push(`${(a.innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").slice(0, 25)} X ${(b.innerText || b.getAttribute("aria-label") || "").replace(/\s+/g, " ").slice(0, 25)} (${Math.round(ix)}x${Math.round(iy)})`);
    }
  }
  return out.slice(0, 10);
}, root);
