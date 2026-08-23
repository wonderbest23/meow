/* BEFORE/AFTER 객관 지표 — 운영에서 받은 결과 JSON 을 읽어 수치로 비교한다 (테스트 전용) */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

interface Row { c: string; key: string; v: "before" | "after"; status: number; source: string; ms: number; md: string }
const rows: Row[] = JSON.parse(readFileSync(process.argv[2], "utf8"));

/** 어느 사업에나 붙는 상투어 */
const GENERIC = ["혁신적", "차별화된", "고객 만족", "극대화", "경쟁력을 확보", "경쟁력 확보", "적극적인 홍보", "적극적으로 홍보", "지속적인 성장", "지속 성장", "시너지", "최적의", "고품질", "원스톱", "고객 중심", "선도", "혁신"];
/** 미확정 표기 */
const HEDGE = ["추가 정의 필요", "검증 필요"];

function countAll(md: string, words: string[]) {
  const hits: Record<string, number> = {};
  let total = 0;
  for (const w of words) {
    const n = (md.match(new RegExp(w, "g")) ?? []).length;
    if (n) { hits[w] = n; total += n; }
  }
  return { total, hits };
}

/** 본문에 나오는 금액·퍼센트·개수 토큰 */
function numbers(md: string): string[] {
  return (md.match(/[\d][\d,.]*\s*(원|만원|억|%|명|건|회|개|일|시간|주|개월|년)/g) ?? []).map((s) => s.replace(/\s+/g, ""));
}

const byKey = new Map<string, { before?: Row; after?: Row }>();
for (const r of rows) {
  const k = `${r.c}|${r.key}`;
  const e = byKey.get(k) ?? {};
  e[r.v] = r;
  byKey.set(k, e);
}

const lines: string[] = ["| 사업 | 섹션 | 길이(B→A) | 상투어(B→A) | 숫자토큰(B→A) | '추가 정의 필요'(B→A) |", "|---|---|---|---|---|---|"];
const detail: string[] = [];
for (const [k, { before, after }] of byKey) {
  if (!before || !after) continue;
  const [c, ...rest] = k.split("|");
  const key = rest.join("|");
  const gb = countAll(before.md, GENERIC), ga = countAll(after.md, GENERIC);
  const hb = countAll(before.md, HEDGE), ha = countAll(after.md, HEDGE);
  const nb = numbers(before.md), na = numbers(after.md);
  lines.push(`| ${c} | ${key} | ${before.md.length} → ${after.md.length} | ${gb.total} → ${ga.total} | ${nb.length} → ${na.length} | ${hb.total} → ${ha.total} |`);
  detail.push(
    `### ${c} · ${key}`,
    ``,
    `- 상투어 BEFORE: ${JSON.stringify(gb.hits)} / AFTER: ${JSON.stringify(ga.hits)}`,
    `- 숫자 BEFORE: ${[...new Set(nb)].join(", ") || "(없음)"}`,
    `- 숫자 AFTER: ${[...new Set(na)].join(", ") || "(없음)"}`,
    ``,
    `#### BEFORE (맥락 없음, ${before.md.length}자 · ${Math.round(before.ms / 1000)}s)`,
    ``,
    before.md,
    ``,
    `#### AFTER (맥락 주입, ${after.md.length}자 · ${Math.round(after.ms / 1000)}s)`,
    ``,
    after.md,
    ``,
    `---`,
    ``,
  );
}
mkdirSync("docs/compare", { recursive: true });
writeFileSync("docs/compare/PROD-SUMMARY.md", ["# 운영 BEFORE/AFTER 객관 지표", "", ...lines, "", ...detail].join("\n"), "utf8");
console.log(lines.join("\n"));
