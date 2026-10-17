/* 맞대결 검토용 원자료 — 상담 답변만(계산 결과는 넣지 않는다: 두 판의 계산이 다를 수 있어 한쪽 숫자가 정답처럼 보이지 않게) */
import { writeFileSync } from "node:fs";
import { EVAL_CASES } from "./cases";
const [id, out] = process.argv.slice(2);
const c = EVAL_CASES.find(item => item.id === id);
if (!c) throw new Error(`case ${id} not found`);
// 운영 중 상담은 주당 시간·예산을 묻지 않는다 — 제품이 받지 않는 답을 원자료에 넣으면 '받은 답을 안 썼다'로 잘못 지적된다
const askedOnlyIfStartup = new Set(["hoursPerWeek", "budget"]);
const entries = Object.entries(c.answers).filter(([k]) => c.mode !== "operating" || !askedOnlyIfStartup.has(k));
writeFileSync(out, `# 창업자가 상담에서 답한 내용(원자료)\n\n- 사업: ${c.label}\n- 상태: ${c.mode === "operating" ? "운영 중" : "새로 시작"}\n${entries.map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n`);
