/**
 * data/ksic 원본 CSV(CP949) → 앱이 읽는 UTF-8 JSON 색인.
 * 원본은 바꾸지 않는다. 실행: node --import tsx scripts/build-ksic.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "data", "ksic");
const decode = (file: string) => new TextDecoder("euc-kr").decode(readFileSync(join(dir, file)));

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; continue; }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim().length));
}

/** "제 조 업(10~34)" → "제조업" 처럼 표시용 이름을 정리한다. 원본 이름은 그대로 보존한다. */
export function cleanName(raw: string): string {
  return raw.replace(/\(\d{2}(?:~\d{2})?\)?\s*$/g, "").replace(/\s+/g, " ").replace(/^(광|제|건) (업|조 업|설 업)$/, m => m.replace(/\s/g, "")).trim();
}

const codes = parseCsv(decode("통계청_산업직업분류_2025년.csv"));
const header = codes[0];
if (header.join(",") !== "분류,코드값,상세설명") throw new Error(`unexpected header: ${header.join(",")}`);
const industry = codes.slice(1).filter(r => r[0] === "산업").map(r => ({ code: r[1].trim(), name: cleanName(r[2]), raw: r[2].trim() }));
const level = (code: string) => code.length as 1 | 2 | 3 | 4 | 5;
const bySection: Record<string, string> = {};
for (const e of industry) if (e.code.length === 1) { const m = e.raw.match(/\((\d{2})(?:~(\d{2}))?\)/); if (m) { const from = Number(m[1]), to = Number(m[2] ?? m[1]); for (let d = from; d <= to; d++) bySection[String(d).padStart(2, "0")] = e.code; } }
// 대분류 괄호 범위가 없는 항목(D, E, L, P 등)은 중분류 코드가 하나뿐이라 이름에서 못 읽는다 → 아래에서 남은 중분류를 알려진 표로 채운다.
const KNOWN: Record<string, string> = { "35": "D", "36": "E", "37": "E", "38": "E", "39": "E", "68": "L", "85": "P", "84": "O", "97": "T", "98": "T", "99": "U" };
Object.assign(bySection, KNOWN);
const parentOf = (code: string): string | null => code.length === 1 ? null : code.length === 2 ? bySection[code] ?? null : code.slice(0, -1);
const entries = industry.map(e => ({ code: e.code, name: e.name, level: level(e.code), parent: parentOf(e.code) }));
const missingParents = entries.filter(e => e.level > 1 && !e.parent);
if (missingParents.length) throw new Error(`parent unresolved: ${missingParents.map(e => e.code).join(",")}`);
const counts = [1, 2, 3, 4, 5].map(l => entries.filter(e => e.level === l).length);
writeFileSync(join(dir, "ksic-2025.json"), JSON.stringify({ source: "data/ksic/통계청_산업직업분류_2025년.csv (공공데이터포털 15159306)", revision: "KSIC 11차", builtFrom: "2026-04-30", counts, entries }), "utf8");

const link = parseCsv(decode("산업직업분류 연계표_2025년 2분기.csv"));
if (link[0].join(",") !== "분류종류,분류차순정보,분류범위,신분류코드,신분류항목명,구분류코드,구분류항목명") throw new Error("unexpected linkage header");
const ksic = link.slice(1).filter(r => r[0] === "KSIC").map(r => ({ level: Number(r[2]), newCode: r[3].trim(), newName: cleanName(r[4]), oldCode: r[5].trim(), oldName: cleanName(r[6]) }));
writeFileSync(join(dir, "ksic-linkage-2025.json"), JSON.stringify({ source: "data/ksic/산업직업분류 연계표_2025년 2분기.csv (공공데이터포털 15159305)", from: "KSIC 10차", to: "KSIC 11차", rows: ksic }), "utf8");
console.log(`ksic-2025.json: ${entries.length} entries (levels ${counts.join("/")}); ksic-linkage-2025.json: ${ksic.length} rows`);
