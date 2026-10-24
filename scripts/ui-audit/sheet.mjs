// 고른 스크린샷을 한눈에 보는 시트로 — <OUT>/picks.json([{ file, screen, width, problem }]) → <OUT>/sheet-01.png … (6장씩, 3×2)
//   node scripts/ui-audit/sheet.mjs [제목] [--out 폴더]
// picks.json 은 issues.jsonl 에서 사람이 고른 것(file 은 flags/ 안의 그림 경로)
import fs from "node:fs";
import path from "node:path";
import { args, browser, S } from "./lib.mjs";
const title = args[0] || "오늘창업 UI 점검";
const picks = JSON.parse(fs.readFileSync(path.join(S, "picks.json"), "utf8"));
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const b = await browser();
const page = await b.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
for (const f of fs.readdirSync(S).filter(f => /^sheet-\d+\.png$/.test(f))) fs.unlinkSync(path.join(S, f));
let n = 0;
for (let i = 0; i < picks.length; i += 6) {
  n++;
  const cells = picks.slice(i, i + 6).map((p, k) => {
    const img = fs.readFileSync(path.isAbsolute(p.file) ? p.file : path.join(S, p.file)).toString("base64");
    return `<figure><div class="cap"><b>${i + k + 1}</b> ${esc(p.screen)} · ${p.width}px · <span>${esc(p.problem)}</span></div><img src="data:image/png;base64,${img}"></figure>`;
  }).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#e9ecf1;font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif}
    h1{font-size:18px;margin:0;padding:12px 16px;background:#111;color:#fff}
    .g{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:14px}
    figure{margin:0;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.2)}
    .cap{background:#b00000;color:#fff;font-size:13px;line-height:18px;padding:7px 9px;min-height:36px}
    .cap b{display:inline-block;background:#fff;color:#b00000;border-radius:3px;padding:0 5px;margin-right:4px}
    .cap span{font-weight:600}
    img{display:block;width:100%;height:auto}
  </style><h1>${esc(title)} · 시트 ${String(n).padStart(2, "0")} (${i + 1}–${Math.min(i + 6, picks.length)} / ${picks.length})</h1><div class="g">${cells}</div>`;
  await page.setContent(html, { waitUntil: "load" });
  const out = path.join(S, `sheet-${String(n).padStart(2, "0")}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(out);
}
await b.close();
