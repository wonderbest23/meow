/*
 * 이미 뽑은 계획서를 AI 채점만 다시 한다 — 채점기를 고친 뒤 같은 글에서 점수가 달라지는지, 같은 글을 두 번 채점해 같은 점수가 나오는지 본다.
 * 원문(Develop tests): AI 채점은 먼저 믿을 만한지 확인한 뒤 늘린다.
 *
 *   node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/plan-eval/regrade.mts --yes --key-from <.env 파일> \
 *     --dirs real-1-bakery,real-1-bakery-v2,real-1-bakery-v3 --repeat 2 --max-krw 1500
 * 운영 DB는 쓰지 않는다(Supabase 환경값 제거).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const option = (name: string) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : undefined; };
if (!argv.includes("--yes")) throw new Error("실제 AI 비용이 듭니다. --yes 를 함께 주세요.");
for (const key of Object.keys(process.env)) if (/^SUPABASE|DATABASE_URL/.test(key)) delete process.env[key];
process.env.PERSISTENCE_MODE = "demo-memory";
const keyFile = option("key-from");
if (!process.env.ANTHROPIC_API_KEY && keyFile) {
  const line = readFileSync(keyFile, "utf8").split("\n").find(item => item.startsWith("ANTHROPIC_API_KEY="));
  if (line) process.env.ANTHROPIC_API_KEY = line.slice("ANTHROPIC_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY 가 없습니다(--key-from 으로 .env 파일을 지정할 수 있어요).");

const { EVAL_CASES } = await import("./cases");
const { gradeByAi, AI_ITEMS, RUBRIC } = await import("./grade-ai");
const { setLlmUsageListener } = await import("../../lib/llm/usage");
const { rowCostUsd, krwPerUsd } = await import("../../lib/llm/cost");

const dirs = (option("dirs") ?? "").split(",").filter(Boolean);
const repeat = Number(option("repeat") ?? 2), maxKrw = Number(option("max-krw") ?? 1500), rate = krwPerUsd();
let spent = 0, lastOutputTokens = 0;
setLlmUsageListener(entry => {
  const usd = rowCostUsd({ kind: entry.kind, model: entry.model, ok: entry.ok, input_tokens: entry.inputTokens, output_tokens: entry.outputTokens, cache_read_tokens: entry.cacheReadTokens, cache_write_tokens: entry.cacheWriteTokens, created_at: "" });
  spent += (usd ?? 0) * rate;
  lastOutputTokens = entry.outputTokens;
});

type Saved = { id: string; label: string; sections: Record<string, string> };
const rows: Array<{ dir: string; id: string; run: number; scores: Record<number, number> | null; reasons: Record<number, string> | null; outputTokens: number }> = [];
for (const dir of dirs) {
  for (const saved of JSON.parse(readFileSync(join(".tmp-e2e", "plan-eval", dir, "results.json"), "utf8")) as Saved[]) {
    const c = EVAL_CASES.find(item => item.id === saved.id)!;
    const facts = Object.entries(c.answers).map(([key, value]) => `${key}: ${value}`).join("\n");
    for (let run = 1; run <= repeat; run++) {
      if (spent >= maxKrw) { console.log(`[regrade] 상한 ${maxKrw.toLocaleString()}원에 닿아 멈춤`); break; }
      const graded = await gradeByAi({ provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY!, model: "claude-sonnet-5-5" }, { caseLabel: c.label, facts, sections: saved.sections });
      rows.push({ dir, id: saved.id, run, scores: graded?.scores ?? null, reasons: graded?.reasons ?? null, outputTokens: lastOutputTokens });
      console.log(`[regrade] ${dir} ${saved.id} ${run}회 · ${graded ? AI_ITEMS.map(item => `${item}:${graded.scores[item]}`).join(" ") : "채점 실패"} · 출력 ${lastOutputTokens}토큰 · 누적 ${Math.round(spent).toLocaleString()}원`);
    }
  }
}

const outDir = join(".tmp-e2e", "plan-eval", `regrade-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "regrade.json"), JSON.stringify(rows, null, 1));
const lines = [
  "# AI 채점 다시 하기", "", `- 계획서: ${dirs.join(", ")} · 같은 글 ${repeat}번씩 · 비용 ${Math.round(spent).toLocaleString()}원`, "",
  `| 항목 | ${rows.map(row => `${row.dir.replace("real-1-", "")} ${row.run}회`).join(" | ")} |`, `| --- | ${rows.map(() => "---").join(" | ")} |`,
  ...AI_ITEMS.map(item => `| ${item}. ${RUBRIC[item].name} | ${rows.map(row => row.scores?.[item] ?? "–").join(" | ")} |`),
  "", "## 근거(각 계획서 1회차)", "",
  ...rows.filter(row => row.run === 1).flatMap(row => [`### ${row.dir}`, ...AI_ITEMS.map(item => `- ${item}. ${row.scores?.[item] ?? "–"}점 — ${row.reasons?.[item] ?? ""}`), ""]),
];
writeFileSync(join(outDir, "regrade.md"), lines.join("\n"));
console.log(`[regrade] 완료 → ${join(outDir, "regrade.md")}`);
