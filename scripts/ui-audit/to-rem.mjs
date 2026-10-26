// CSS 의 px 글자 크기·줄 높이 → rem(px/16, 기본 16px 에서 값이 똑같다). 서식·주석은 그대로 두고 그 선언만 바꾼다.
//   node scripts/ui-audit/to-rem.mjs <file.css> [--only 선택자목록.json]   (--only: 그 선택자가 들어 있는 규칙만 — d-fontscale.mjs collect 결과)
// 미디어 조건(@media … px)과 @keyframes 는 건드리지 않는다. 사용자 정의 속성(--x: 14px)은 손으로 바꾼다.
import fs from "node:fs";
import postcss from "postcss";
const [file, flag, listFile] = process.argv.slice(2);
const norm = s => s.replace(/::?/g, ":").replace(/["']/g, "").replace(/\s+/g, "").toLowerCase();
const only = flag === "--only" ? new Set(JSON.parse(fs.readFileSync(listFile, "utf8")).map(norm)) : null;
const rem = px => { const v = +px / 16; return (v === 0 ? "0" : String(+v.toFixed(6)).replace(/^0\./, ".")) + "rem"; };
const conv = v => v.replace(/(^|[\s(,/])(\d*\.?\d+)px\b/g, (m, pre, n) => pre + rem(n));
const src = fs.readFileSync(file, "utf8");
const root = postcss.parse(src);
let n = 0, rules = 0;
const edits = [];
root.walkRules(rule => {
  if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
  if (only) { const parts = rule.selectors.map(norm); if (!parts.some(p => only.has(p))) return; }
  let touched = false;
  rule.each(d => {
    if (d.type !== "decl") return;
    let nv = null;
    if (d.prop === "font-size" || d.prop === "line-height") nv = conv(d.value);
    else if (d.prop === "font" && /\dpx/.test(d.value)) nv = conv(d.value);
    if (nv != null && nv !== d.value) { edits.push([d.source.start.offset, d.source.end.offset, d.toString().replace(d.value, nv)]); n++; touched = true; }
  });
  if (touched) rules++;
});
// 원문 서식을 지키려고 선언 자리만 바꾼다(뒤에서부터)
let out = src;
for (const [s, e, txt] of edits.sort((a, b) => b[0] - a[0])) {
  const orig = out.slice(s, e + 1);
  const fixed = orig.replace(/^([\s\S]*?:\s*)([\s\S]*?)(\s*(!important)?\s*;?)$/, (m, a, v, t) => a + conv(v) + t);
  out = out.slice(0, s) + fixed + out.slice(e + 1);
}
fs.writeFileSync(file, out);
console.log(file, "decls", n, "rules", rules);
