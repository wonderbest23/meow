/*
 * 세부 업종 규칙(data/ksic/kinds/NN.tsv)을 쓸 대상 목록을 만든다 — 소규모로 시작할 수 있는 세세분류만, 12묶음으로.
 * 실행: npx tsx scripts/kind-rules-todo.mts  (분류 구조 기본값을 바꿨으면 다시 실행)
 */
import { writeFileSync } from "node:fs";
import { ksicEntries, ksicPath, ksicStructure } from "../lib/plan-builder/ksic";

const BATCHES = 12;
const rows = ksicEntries(5).flatMap(entry => {
  const structure = ksicStructure(entry.code);
  return structure?.smallBusiness ? [[entry.code, entry.name, ksicPath(entry.code).split(" › ").slice(1, -1).join(" > "), structure.sector, structure.revenue].join("\t")] : [];
});
const size = Math.ceil(rows.length / BATCHES);
for (let i = 0; i < BATCHES; i++) writeFileSync(`data/ksic/kinds/todo/${String(i + 1).padStart(2, "0")}.tsv`, ["code\tname\tpath\tsector\trevenue", ...rows.slice(i * size, (i + 1) * size)].join("\n") + "\n");
console.log(rows.length, "codes →", BATCHES, "batches of", size);
