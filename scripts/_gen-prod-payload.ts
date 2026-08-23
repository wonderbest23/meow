/*
 * 운영 BEFORE/AFTER 비교용 payload 생성기 (테스트 전용).
 *
 * scripts/plan-context-compare.ts 의 CASES 를 브라우저에 붙여넣을 JS 로 바꾼다.
 * 운영에 로그인한 브라우저 콘솔에서 window.__CASES 를 채운 뒤
 * /api/plan/generate 를 BEFORE(분석 없음)/AFTER(__analysis 포함)로 두 번 호출해 비교한다.
 *   npx tsx scripts/_gen-prod-payload.ts <출력경로>
 */
import { writeFileSync } from "node:fs";
import { CASES } from "./plan-context-compare";
import { ANALYSIS_KEY, normalizeAnalysis } from "../lib/plan-builder/analyzer/domain";

const out = CASES.map((c) => {
  const analysis = normalizeAnalysis(c.analysis)!;
  const record = { analysis, slots: c.slots, rounds: 2, finished: true, analyzedAt: "2026-08-22T00:00:00Z" };
  return {
    id: c.id,
    business: c.business,
    planType: "창업 초기 · 사업계획서",
    planTitle: c.business.name,
    sections: c.sections,
    answers: c.answers,
    rec: record,
  };
});
writeFileSync(process.argv[2], `window.__CASES=${JSON.stringify(out)};"cases:"+window.__CASES.length`, "utf8");
console.log("cases:", out.length, "bytes:", JSON.stringify(out).length);
