/*
 * 세션 안에서 쓴 장을 운영처럼 묶어 채점한다 — 재무 장에 계산 표를 붙이고(section-generator.ts appendFinancials와 같은 자리),
 * 코드 채점(grade-code.ts)과 근거 없는 숫자 검사(document-quality.ts)를 돌린 뒤, 블라인드 검토용 plan.md 를 만든다.
 *
 *   npx tsx scripts/plan-eval/grade-files.mts <capture.json> <outputs 폴더> <결과 폴더>
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gradeByCode, MUST_PASS } from "./grade-code";
import { checkDocumentQuality } from "../../lib/plan-builder/document-quality";

const [capturePath, outputsDir, resultDir] = process.argv.slice(2);
const capture = JSON.parse(readFileSync(capturePath, "utf8")) as { caseId: string; label: string; waves: string[][]; prompts: Record<string, { system: string; user: string }>; financials: { key: string; markdown: string } | null; facts: Record<string, number | undefined>; source: string };
const order = capture.waves.flat();
const sections: Record<string, string> = {};
for (const key of order) {
  const file = join(outputsDir, `${key.replace("/", "__")}.md`);
  const body = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
  sections[key] = capture.financials?.key === key && capture.financials.markdown ? `${body}\n\n${capture.financials.markdown}` : body;
}
const code = gradeByCode({ caseId: capture.caseId, sections, source: capture.source, facts: capture.facts });
// 근거 없는 숫자: 장마다 그 장에 보낸 자료(사용자 쪽 지시문) + 계산 표를 근거로
const quality = order.map(key => {
  const source = [capture.prompts[key]?.user ?? "", capture.financials?.markdown ?? ""].join("\n");
  const result = checkDocumentQuality(sections[key].replace(capture.financials?.key === key ? capture.financials.markdown : "\u0000", ""), source);
  return { key, chars: sections[key].length, issues: result.issues.filter(issue => issue.severity === "error").map(issue => `${issue.code}: ${issue.detail}`) };
});
mkdirSync(resultDir, { recursive: true });
writeFileSync(join(resultDir, "grade.json"), JSON.stringify({ code, quality }, null, 1));
const titleOf = (key: string) => capture.prompts[key]?.user.match(/작성할 장: ([^\n(]+)/)?.[1]?.trim() ?? key;
const chart = (md: string) => md.replace(/```plan-chart\n([\s\S]*?)\n```/g, (_, json: string) => { try { return `[그래프: ${JSON.parse(json).title}]`; } catch { return "[그래프]"; } });
writeFileSync(join(resultDir, "plan.md"), `# ${capture.label} — 사업계획서 전체(${order.length}장)\n\n${order.map(key => `# ${titleOf(key)} (${key})\n\n${chart(sections[key])}`).join("\n\n---\n\n")}\n`);
const mark = (pass: boolean | null) => (pass === null ? "–" : pass ? "○" : "×");
console.log(code.map(item => `${item.item}${MUST_PASS.includes(item.item) ? "*" : ""} ${mark(item.pass)} ${item.detail}`).join("\n"));
console.log(quality.filter(item => item.issues.length).map(item => `[숫자 검사] ${item.key}: ${item.issues.join(" / ")}`).join("\n") || "[숫자 검사] 근거 없는 숫자 없음");
