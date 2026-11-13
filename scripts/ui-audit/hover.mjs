// 마우스를 올렸을 때 · 눌렀을 때 글씨가 안 보이는 단추 찾기(2026-11-13 '계획서 보기' 글씨가 사라진 일로 만듦).
//   BASE_URL=http://localhost:8098 node scripts/ui-audit/hover.mjs <uid> <planId>
// 화면마다 보이는 단추·링크에 실제로 마우스를 올리고(누르고), 글자색과 그 뒤 바탕색의 대비가 2.5 아래면 적는다.
// 누른 뒤에는 단추 밖에서 떼므로 눌린 것으로 처리되지 않는다. 결과는 <OUT>/hover.jsonl 과 표준 출력.
import fs from "node:fs";
import { S, args, browser, open, sleep } from "./lib.mjs";

const [uid, planId, askingId] = args; // askingId: 질문 단계에 멈춘 사업(seed.mjs partial:N) — 있으면 질문 화면도 본다
if (!uid || !planId) { console.error("사용법: node scripts/ui-audit/hover.mjs <uid> <planId>"); process.exit(2); }
const q = `planId=${planId}`;
const PAGES = [
  ["chat", `/plan/studio?${q}`], ["plan", `/plan/studio?${q}&tab=plan`], ["plan-expert", `/plan/studio?${q}&tab=plan`, "^전문가 모드$"], ["plan-menu", `/plan/studio?${q}&tab=plan`, "페이지 바꾸기|더 보기"], ["homepage", `/plan/studio?${q}&tab=homepage`], ["operations", `/plan/studio?${q}&tab=operations`],
  // 창 · 편집 화면 — 앞에서부터 차례로 누른 뒤 본다(이름이나 aria-label, 없는 단계는 건너뛴다)
  ["plan-download", `/plan/studio?${q}&tab=plan`, ["페이지 바꾸기", "^내려받기$|사업계획서 내려받기"]],
  ["plan-toc", `/plan/studio?${q}&tab=plan`, ["페이지 바꾸기", "^목차$|^일반 보기"]],
  ["plan-edit", `/plan/studio?${q}&tab=plan`, ["페이지 바꾸기|더 보기", "^직접 고치기$"]],
  ["plan-continuous", `/plan/studio?${q}&tab=plan`, ["^전문가 모드$", "페이지 바꾸기", "^목차$|장 고르기|^1장", "전체 이어 읽기"]],
  ["homepage-made", `/plan/studio?${q}&tab=homepage`, ["^홈페이지 만들기|초안 만들기|^만들기"]],
  ["chat-tools", `/plan/studio?${q}`, ["^\\+$|더하기|지금까지 답|첨부"]],
  ...(askingId ? [["asking", `/plan/studio?planId=${askingId}`], ["asking-summary", `/plan/studio?planId=${askingId}`, ["지금까지 답|답 보기"]]] : []),
  ["list", "/plan"], ["settings", "/plan/settings"], ["me", "/plan/me"], ["home", "/"],
];

/* 페이지 안: 지금 상태(올림·누름)에서 요소 안 글자·아이콘과 뒤 바탕의 가장 낮은 대비 */
const MEASURE = `(el => {
  const parse = c => { const m = c.match(/[\\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; if (c.startsWith("oklab") || c.startsWith("oklch") || c.startsWith("color(")) { const d = document.createElement("canvas").getContext("2d"); d.fillStyle = c; d.fillRect(0, 0, 1, 1); const p = d.getImageData(0, 0, 1, 1).data; return [p[0], p[1], p[2], p[3] / 255]; } return [m[0], m[1], m[2], m[3] ?? 1]; };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat(1); };
  const backdrop = node => { const layers = []; for (let n = node; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.backgroundImage !== "none") return null; const c = parse(s.backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } } let out = [255, 255, 255, 1]; for (const layer of layers.reverse()) out = over(layer, out); return out; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  let worst = null;
  const marks = [el, ...el.querySelectorAll("*")].filter(n => n.tagName.toLowerCase() === "svg" || [...n.childNodes].some(t => t.nodeType === 3 && t.textContent.trim()));
  for (const mark of marks) {
    const style = getComputedStyle(mark); if (style.visibility === "hidden" || style.display === "none") continue;
    const bg = backdrop(mark); if (!bg) continue;
    const ink = over((c => [c[0], c[1], c[2], c[3] * Number(style.opacity)])(parse(style.color)), bg);
    const a = lum(ink), b = lum(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    if (!worst || ratio < worst.ratio) worst = { ratio: Math.round(ratio * 100) / 100, color: style.color, bg: "rgb(" + bg.slice(0, 3).map(Math.round).join(",") + ")" };
  }
  return worst;
})`;

const b = await browser();
const found = [];
for (const width of [1440, 390]) for (const [name, pathname, press] of PAGES) {
  const page = await open(b, uid, pathname, { width, height: 2400, mobile: false });
  await sleep(6000);
  // 먼저 눌러 둘 것(보기 전환 · 메뉴 열기) — 이름이나 aria-label 로 찾는다
  for (const step of [press ?? []].flat()) { await page.evaluate(`(() => { const re = new RegExp(${JSON.stringify(step)}); [...document.querySelectorAll("button, a")].filter(el => el.getBoundingClientRect().width > 0).find(el => re.test((el.innerText || "").trim()) || re.test(el.getAttribute("aria-label") || ""))?.click(); })()`); await sleep(name === "homepage-made" ? 12000 : 1200); }
  const targets = await page.evaluate(`[...document.querySelectorAll("button, a, [role=button], [role=tab], [role=menuitem], summary")].map((el, i) => { el.dataset.hv = i; const r = el.getBoundingClientRect(); return { i, x: r.x + r.width / 2, y: r.y + r.height / 2, ok: r.width > 4 && r.height > 4 && r.y >= 0 && r.bottom <= innerHeight && r.x >= 0 && r.right <= innerWidth && !el.disabled && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("[data-hv]") === el, label: (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ").slice(0, 30) }; }).filter(t => t.ok)`);
  let checked = 0;
  for (const t of targets.slice(0, 120)) {
    const measure = () => page.evaluate(`${MEASURE}(document.querySelector('[data-hv="${t.i}"]'))`).catch(() => null);
    await page.mouse.move(2, 2); const rest = await measure();
    await page.mouse.move(t.x, t.y); await sleep(260); const hover = await measure();
    await page.mouse.down(); await sleep(120); const press = await measure();
    await page.mouse.move(2, 2); await page.mouse.up();
    checked++;
    for (const [state, m] of [["올림", hover], ["누름", press]]) if (m && m.ratio < 2.5 && (!rest || rest.ratio >= 2.5 || m.ratio < rest.ratio - .3)) found.push({ width, page: name, label: t.label, state, ...m, rest: rest?.ratio });
  }
  const opened = await page.evaluate(`[document.querySelector("dialog[open] h2")?.innerText, document.querySelector("[role=menu]") && "메뉴", document.querySelector("[data-fact-mode]") && "직접 고치기"].filter(Boolean).join(" · ")`).catch(() => "");
  console.log(`${width} ${name}: 단추 ${checked}개${opened ? ` (열림: ${opened})` : ""}`);
  await page.close();
}
await b.close();
fs.writeFileSync(`${S}/hover.jsonl`, found.map(item => JSON.stringify(item)).join("\n"));
console.log(found.length ? found.map(item => JSON.stringify(item)).join("\n") : "글씨가 안 보이는 단추 없음");
